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
import { httpRepos } from "./resources/acl";
import crypto from "node:crypto";
import { forcePushEnabled, setForcePushEnabled } from "./resources/policy";

export const configureRoutes = (app: Server) => {
  // @ts-ignore
  app.use(express.json());
  const logger = (req: Request, res: Response, next: NextFunction) => {
    console.log(`[${req.method}] ${req.url}`);
    next();
  };
  app.use(logger);

  // Admin UI/API: one account from ADMIN_USER/ADMIN_PASSWORD env vars
  // (independent of the git ACL). Fail-closed when unset; browsers answer the
  // 401 challenge with a native login dialog and then attach the credentials
  // to every same-origin request automatically.
  const authOk = (header: string | undefined): boolean => {
    const adminUser = process.env.ADMIN_USER;
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!(adminUser && adminPassword && header?.startsWith("Basic "))) {
      return false;
    }
    const decoded = Buffer.from(header.slice(6), "base64").toString();
    const sep = decoded.indexOf(":");
    if (sep === -1) return false;
    const sha = (v: string) => crypto.createHash("sha256").update(v).digest();
    const [name, password] = [decoded.slice(0, sep), decoded.slice(sep + 1)];
    return (
      crypto.timingSafeEqual(sha(adminUser), sha(name)) &&
      crypto.timingSafeEqual(sha(adminPassword), sha(password))
    );
  };

  // Anonymous-allowed endpoints, mounted before the auth middleware.
  // /repos: names only for anonymous visitors (full details when authed);
  // /createRepo: name-only create for anonymous visitors (the returned
  // message doubles as the error when the name is already taken).
  const anonRoutes = express.Router();
  anonRoutes.post(
    "/repos",
    async (req: Request, res: Response, next: NextFunction) => {
      if (authOk(req.headers.authorization as string | undefined))
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
  anonRoutes.post(
    "/createRepo",
    async (req: Request, res: Response, next: NextFunction) => {
      if (authOk(req.headers.authorization as string | undefined))
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
    if (!authOk(header)) {
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
