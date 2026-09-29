// Read-only git smart-HTTP access for a selected set of repos.
//
// Mount this router at `/git`; each request is proxied to `git http-backend`
// running as a CGI subprocess (GIT_PROJECT_ROOT = reposDir). Fetching and
// cloning work with any stock git client:
//
//   git clone http://localhost:5177/git/myrepo.git
//
// Repos are opt-in via the PUBLIC_REPOS env var (comma-separated names that
// must live inside reposDir). Pushing is refused: any receive-pack request
// is rejected before git-http-backend ever runs.
import { spawn } from "child_process";
import path from "node:path";
import express, { Request, Response, Router } from "express";
import { reposDir, isValidRepoName, isBare } from "./git";

/** Repo names with read-only HTTP access; empty list means none. */
export const httpRepos = (): string[] =>
  (process.env.PUBLIC_REPOS ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name && isValidRepoName(name));

export const isHttpRepo = (repo: string): boolean => httpRepos().includes(repo);

// Only ever serve the read-only upload-pack service.
const isReadOnly = (service: string | undefined, pathInfo: string): boolean =>
  !service?.includes("git-receive-pack") &&
  !pathInfo.includes("git-receive-pack");

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

/** Express router serving read-only smart HTTP for PUBLIC_REPOS repos. */

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
    if (!isHttpRepo(repo)) {
      return res
        .status(404)
        .json({ error: `repo '${repo}' is not served over http` });
    }

    const service =
      url.searchParams.get("service") ??
      (req.headers["content-type"] as string | undefined)?.replace(
        "application/x-",
        "",
      );
    const pathInfo = `/${repo}.git${rest}`;
    if (!isReadOnly(service, pathInfo)) {
      return res
        .status(403)
        .json({ error: "this server is read-only: pushing is not allowed" });
    }

    // http-backend needs PATH_INFO to land on the actual git dir: bare repos
    // are their own git dir, non-bare repos keep it under <repo>/.git
    const bare = await isBare(path.join(reposDir, repo));
    const projectRoot = bare ? reposDir : path.join(reposDir, repo);
    const gitPath = bare ? `/${repo}.git${rest}` : `/.git${rest}`;

    console.log();
    readBody(req)
      .then((body) => runCgi(req, body, projectRoot, gitPath))
      .then((cgi) => {
        if (!cgi) {
          return res.status(500).json({ error: "git http-backend failed" });
        }
        res.status(cgi.status);
        for (const [key, value] of Object.entries(cgi.headers)) {
          res.setHeader(key, value);
        }
        res.send(cgi.body);
      });
  });

  return router;
};
