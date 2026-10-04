// Git smart-HTTP access gated by the ACL in acl.yaml.
//
// Mount this router at the server root (no prefix); each request is checked
// against the ACL (Basic auth; anonymous when no credentials), then proxied
// to `git http-backend` running as a CGI subprocess (GIT_PROJECT_ROOT =
// reposDir). Read access needs an "ro" or "rw" grant, push needs "rw";
// push policy on top (force-push break-glass) lives in pushcheck/policy.
import { spawn } from "child_process";
import path from "node:path";
import express, { Request, Response, Router } from "express";
import { reposDir, isValidRepoName, isBare, repoDir } from "./git";
import { forcePushEnabled } from "./policy";
import { ensurePushHook } from "./pushcheck";
import { authenticate, permissionFor } from "./acl";

interface CgiResult {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

/** Collect the raw request body (express 5 types here lack `body`/`raw`). */
const readBody = (req: Request): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
    // GET (info/refs) has no body; a missing 'end' event must not hang us
    setTimeout(() => resolve(Buffer.concat(chunks)), 5000);
  });

/** Run `git http-backend` as a CGI child and collect its response. */
const runCgi = async (
  req: Request,
  body: Buffer,
  projectRoot: string,
  pathInfo: string,
  remoteUser: string | null,
): Promise<CgiResult | null> => {
  const env: Record<string, string> = {
    GIT_PROJECT_ROOT: projectRoot,
    GIT_HTTP_EXPORT_ALL: "1",
    // restrict advertised services to read-only, defense in depth
    GIT_PROTOCOL: (req.headers["git-protocol"] as string) ?? "",
    PATH_INFO: pathInfo,
    REQUEST_METHOD: req.method,
    QUERY_STRING: new URL(req.url, "http://x").search.replace(/^\?/, ""),
    CONTENT_TYPE: (req.headers["content-type"] as string) ?? "",
    CONTENT_LENGTH: String(body.length),
    REMOTE_ADDR: req.ip ?? "",
    REMOTE_USER: remoteUser ?? "",
    // per-push policy input for the pre-receive hook (see pushcheck.ts)
    GIT_VIEWER_ALLOW_FORCE: forcePushEnabled() ? "true" : "false",
    GATEWAY_INTERFACE: "CGI/1.1",
    SERVER_PROTOCOL: `HTTP/${req.httpVersion}`,
    SERVER_SOFTWARE: "git-viewer",
  };

  return new Promise((resolve) => {
    const child = spawn("git", ["http-backend"], { env });
    const chunks: Buffer[] = [];
    let done = false;
    const finish = (result: CgiResult | null) => {
      if (!done) {
        done = true;
        resolve(result);
      }
    };
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) =>
      console.error(`[git-http] ${chunk.toString().trim()}`),
    );
    child.on("error", (error) => {
      console.error("[git-http] failed to spawn git http-backend:", error);
      finish(null);
    });
    child.on("close", (code) => {
      const raw = Buffer.concat(chunks);
      const sep = raw.indexOf("\r\n\r\n");
      if (code !== 0 || sep === -1) {
        console.error(`[git-http] http-backend exited with ${code}`);
        finish(null);
        return;
      }
      const headerText = raw.subarray(0, sep).toString();
      const headers: Record<string, string> = {};
      let status = 200;
      for (const line of headerText.split("\r\n")) {
        const idx = line.indexOf(":");
        if (idx === -1) continue;
        const key = line.slice(0, idx).trim().toLowerCase();
        const value = line.slice(idx + 1).trim();
        if (key === "status") {
          status = parseInt(value.split(" ")[0], 10) || 200;
        } else {
          headers[key] = value;
        }
      }
      finish({ status, headers, body: raw.subarray(sep + 4) });
    });
    if (body.length) child.stdin.write(body);
    child.stdin.end();
    // never leave a hung upload-pack blocking the event loop forever
    child.stdin.on("error", () => finish(null));
  });
};

/** Express router serving smart HTTP for repos granted by the ACL. */

export const createHttpRouter = (): Router => {
  const router = express.Router();

  router.use(async (req: Request, res: Response, next: () => void) => {
    // parse /:repo/<path>; strip an optional .git suffix on the repo name
    const url = new URL(req.url, "http://x");
    const match = /^\/([^/]+?)(?:\.git)?(\/.*)$/.exec(url.pathname);
    if (!match) {
      return next();
    }
    const [repo, rest] = [match[1], match[2]];

    if (!isValidRepoName(repo)) {
      return next();
    }

    // ACL: authenticate (Basic), then check the grant for this repo.
    // Supplied-but-invalid credentials never fall back to anonymous. Git
    // clients handle 401 + WWW-Authenticate by retrying with credentials, so
    // unauthenticated denials always challenge instead of a bare 403.
    const authHeader = req.headers.authorization as string | undefined;
    const user = await authenticate(authHeader);
    if (authHeader && !user) {
      res.setHeader("WWW-Authenticate", 'Basic realm="git-viewer"');
      return res.status(401).json({ error: "invalid credentials" });
    }
    const perm = await permissionFor(user, repo);
    if (!perm) {
      if (!user) {
        res.setHeader("WWW-Authenticate", 'Basic realm="git-viewer"');
        return res.status(401).json({ error: "authentication required" });
      }
      return res.status(403).json({ error: "access denied" });
    }

    const service =
      url.searchParams.get("service") ??
      (req.headers["content-type"] as string | undefined)?.replace(
        "application/x-",
        "",
      );
    const pathInfo = `/${repo}.git${rest}`;
    const isPush =
      service?.includes("git-receive-pack") ||
      pathInfo.includes("git-receive-pack");
    if (isPush && perm !== "rw") {
      if (!user) {
        // challenge so git clients retry with credentials (a rw user may push)
        res.setHeader("WWW-Authenticate", 'Basic realm="git-viewer"');
        return res
          .status(401)
          .json({ error: "authentication required for pushing" });
      }
      return res
        .status(403)
        .json({ error: "this repo is read-only for your account" });
    }

    // http-backend needs PATH_INFO to land on the actual git dir: bare repos
    // stored as <name>.git are their own git dir (PATH_INFO keeps the .git
    // suffix), non-bare repos keep it under <repo>/.git
    const dir = await repoDir(repo);
    if (!dir) {
      return res.status(404).json({ error: `unknown repo: ${repo}` });
    }
    const bare = await isBare(dir);
    const projectRoot = bare ? reposDir : dir;
    const gitPath = bare ? `/${path.basename(dir)}${rest}` : `/.git${rest}`;

    readBody(req)
      .then(async (body) => {
        // receive-pack: install/refresh the policy hook before receive-pack runs
        if (isPush) {
          const gitDir = bare ? dir : path.join(dir, ".git");
          await ensurePushHook(gitDir);
        }
        const cgi = await runCgi(req, body, projectRoot, gitPath, user);
        return (
          cgi ?? {
            status: 500,
            headers: {},
            body: Buffer.from(
              JSON.stringify({ error: "git http-backend failed" }),
            ),
          }
        );
      })
      .then((cgi) => {
        res.status(cgi.status);
        for (const [key, value] of Object.entries(cgi.headers)) {
          res.setHeader(key, value);
        }
        res.send(cgi.body);
      });
  });

  return router;
};
