import express, { Request, Response, Server, NextFunction } from "express";
import { apiPath, type ServerApi } from "../common/interface";
import {
  getGitLog,
  getBranches,
  getReadme,
  listRepos,
  getRepoInfo,
  gitPull,
  gitPush,
} from "./resources/git";
import { httpRepos } from "./resources/git-http";

export const configureRoutes = (app: Server) => {
  // @ts-ignore
  app.use(express.json());
  const logger = (req: Request, res: Response, next: NextFunction) => {
    console.log(`[${req.method}] ${req.url}`);
    next();
  };
  app.use(logger);

  const serverImpl: ServerApi = {
    repos: listRepos,
    repoInfo: getRepoInfo,
    readme: getReadme,
    gitBranches: getBranches,
    gitLogs: getGitLog,
    gitPull: gitPull,
    gitPush: gitPush,
    publicRepos: () => httpRepos(),
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
