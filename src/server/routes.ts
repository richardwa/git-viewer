import express, { Server } from "express";
import { configureApi } from "solid-vanilla-server";
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
import { verifyAdmin } from "./resources/users";
import { forcePushEnabled, setForcePushEnabled } from "./resources/policy";
import { buildRuns, buildLog } from "./resources/build";

// Access model: everything is public and anonymous. The only protected key
// is setForcePushEnabled — it sits behind Basic auth against the single
// admin account (users.yaml), both here and in the UI.
//
// Note: configureApi injects the authenticated login name ("") as the FIRST
// argument of every anonymous handler — hence the leading `_user` parameter.
export const configureRoutes = (app: Server) => {
  const serverImpl = {
    repos: () => listRepos(),
    repoInfo: (_user: string, repo: string) => getRepoInfo(repo),
    readme: (_user: string, repo: string, branch?: string) =>
      getReadme(repo, branch),
    gitBranches: (_user: string, repo: string) => getBranches(repo),
    gitRemoteUrl: (_user: string, repo: string) => getRemoteUrl(repo),
    gitLogs: (_user: string, repo: string, branch: string, lines?: number) =>
      getGitLog(repo, branch, lines),
    createRepo: (_user: string, name: string, description?: string) =>
      createRepo(name, description),
    gitPull: (_user: string, repo: string) => gitPull(repo),
    gitPush: (_user: string, repo: string) => gitPush(repo),
    forcePushEnabled: (_user: string, repo: string) =>
      Promise.resolve(forcePushEnabled(repo)),
    // admin-only: mounted as a protected route (Basic auth required, no
    // injected user argument)
    setForcePushEnabled: async (repo: string, value: boolean) =>
      setForcePushEnabled(repo, value),
    buildRuns: (_user: string, repo: string, branch: string) =>
      buildRuns(repo, branch),
    buildLog: (_user: string, repo: string, branch: string, run: string) =>
      buildLog(repo, branch, run),
  };

  configureApi(app, {
    serverImpl,
    checkCredentials: verifyAdmin,
    // every key except setForcePushEnabled is served without authentication
    anonymous: Object.keys(serverImpl).filter(
      (key) => key !== "setForcePushEnabled",
    ),
  });
};
