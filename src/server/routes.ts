import express, { Request, Response, Server, NextFunction } from "express";
import { apiPath, type ServerApi } from "../common/interface";
import {
  getGitLog,
  getBranches,
  getRemoteUrl,
  getReadme,
  listRepos,
  getRepoInfo,
  gitPull,
  gitPush,
  createRepo,
} from "./resources/git";
import { httpRepos, authenticate } from "./resources/acl";
import { forcePushEnabled, setForcePushEnabled } from "./resources/policy";

export const configureRoutes = (app: Server) => {
  // @ts-ignore
  app.use(express.json());
  const logger = (req: Request, res: Response, next: NextFunction) => {
    console.log(`[${req.method}] ${req.url}`);
    next();
  };
  app.use(logger);

  // Admin UI/API: any ACL user may sign in (the `admin` entry names the
  // account with full git access). Fail-closed when no ACL is loaded; browsers
  // answer the 401 challenge with a native login dialog and then attach the
  // credentials to every same-origin request automatically.
  const authOk = async (header: string | undefined): Promise<boolean> =>
    (await authenticate(header)) !== null;

  // Anonymous-allowed endpoints, mounted before the auth middleware.
  // /repos: names only for anonymous visitors (full details when authed);
  // /createRepo: name-only create for anonymous visitors (the returned
  // message doubles as the error when the name is already taken).
  const anonRoutes = express.Router();
  anonRoutes.post(
    "/repos",
    async (req: Request, res: Response, next: NextFunction) => {
      if (await authOk(req.headers.authorization as string | undefined))
        return next();
      const infos = await listRepos();
      res.json(
        infos.map((info) => ({
          name: info.name,
          description: "",
          ahead: null,
          behind: null,
          notes: "",
        })),
      );
    },
  );
  anonRoutes.post("/currentUser", async (req: Request, res: Response) => {
    const user = await authenticate(
      req.headers.authorization as string | undefined,
    );
    res.json(user ?? "");
  });
  // "change user" / sign-in: always challenge with the login realm. The client
  // sends deliberately bogus Basic credentials; when the browser sees this 401
  // for the same realm it replaces its cached credentials with the bogus pair,
  // invalidating the previous login (Basic auth has no real logout).
  anonRoutes.post("/switchUser", async (_req: Request, res: Response) => {
    res.setHeader("WWW-Authenticate", 'Basic realm="git-viewer admin"');
    res.status(401).json({ error: "credentials reset" });
  });
  // Top-level login navigation: XHR 401s never pop the native dialog (Chrome
  // swallows them), but a document navigation does. The client hits this after
  // invalidating cached credentials, so the dialog appears; success → home.
  app.get("/login", async (req: Request, res: Response) => {
    if (await authOk(req.headers.authorization as string | undefined))
      return res.redirect("/");
    res.setHeader("WWW-Authenticate", 'Basic realm="git-viewer admin"');
    res.status(401).send("authentication required");
  });
  anonRoutes.post(
    "/createRepo",
    async (req: Request, res: Response, next: NextFunction) => {
      if (await authOk(req.headers.authorization as string | undefined))
        return next();
      const [name] = (req as any).body ?? [];
      try {
        res.json(await createRepo(name));
      } catch (error) {
        res.json((error as Error).message);
      }
    },
  );
  app.use(apiPath, anonRoutes);

  app.use(apiPath, async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization as string | undefined;
    if (!(await authOk(header))) {
      res.setHeader("WWW-Authenticate", 'Basic realm="git-viewer admin"');
      return res.status(401).json({ error: "authentication required" });
    }
    next();
  });

  const serverImpl: ServerApi = {
    repos: listRepos,
    repoInfo: getRepoInfo,
    readme: getReadme,
    gitBranches: getBranches,
    gitRemoteUrl: getRemoteUrl,
    gitLogs: getGitLog,
    createRepo: createRepo,
    gitPull: gitPull,
    gitPush: gitPush,
    publicRepos: () => httpRepos(),
    currentUser: () => Promise.resolve(""), // served anonymously above
    forcePushEnabled: (repo: string) => Promise.resolve(forcePushEnabled(repo)),
    setForcePushEnabled: (repo: string, value: boolean) =>
      Promise.resolve(setForcePushEnabled(repo, value)),
  };
  const routes = express.Router();
  Object.entries(serverImpl).forEach(([key, fn]) => {
    routes.post(`/${key}`, async (req: Request, res: Response) => {
      // @ts-ignore
      const reqParams = req.body ?? [];
      // @ts-ignore
      const result = await fn(...reqParams);
      res.json(result);
    });
  });
  // Serve API
  app.use(apiPath, routes);
};
