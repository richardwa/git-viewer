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
import { verify, httpRepos } from "./resources/acl";
import { forcePushEnabled, setForcePushEnabled } from "./resources/policy";

// All API keys are served via configureApi's `anonymous` list: every handler
// receives the authenticated login name ("" when unauthenticated, "anon"
// when signed in as the read-only guest) and enforces its own access rules.
// This keeps the API browsable for logged-out visitors and read-only for the
// guest, while writes stay behind real credentials.
const guestOnlyMessage = "read-only access — sign in to make changes";
const requireUser = (user: string) => {
  if (!user) throw new Error("authentication required");
  if (user === "anon") throw new Error(guestOnlyMessage);
};

export const configureRoutes = (app: Server) => {
  const serverImpl = {
    // public: full details for real users, names-only for guests/anonymous
    repos: async (user: string) => {
      const infos = await listRepos();
      if (user && user !== "anon") return infos;
      return infos.map((info) => ({
        name: info.name,
        description: "",
        ahead: null,
        behind: null,
        notes: "",
      }));
    },
    // public reads (public repos only; private repos are git-http-level ACL'd)
    repoInfo: (user: string, repo: string) => getRepoInfo(repo),
    readme: (user: string, repo: string, branch?: string) =>
      getReadme(repo, branch),
    gitBranches: (user: string, repo: string) => getBranches(repo),
    gitRemoteUrl: (user: string, repo: string) => getRemoteUrl(repo),
    gitLogs: (user: string, repo: string, branch: string, lines?: number) =>
      getGitLog(repo, branch, lines),
    publicRepos: (user: string) => httpRepos(),
    forcePushEnabled: (user: string, repo: string) =>
      Promise.resolve(forcePushEnabled(repo)),
    // writes require a real (non-guest) login
    createRepo: async (user: string, name: string, description?: string) => {
      requireUser(user);
      return createRepo(name, description);
    },
    gitPull: async (user: string, repo: string) => {
      requireUser(user);
      return gitPull(repo);
    },
    gitPush: async (user: string, repo: string) => {
      requireUser(user);
      return gitPush(repo);
    },
    setForcePushEnabled: async (user: string, repo: string, value: boolean) => {
      requireUser(user);
      return setForcePushEnabled(repo, value);
    },
  };

  configureApi(app, {
    serverImpl,
    checkCredentials: async (login, password) =>
      (await verify(login, password)) !== null,
    anonymous: Object.keys(serverImpl),
  });
};
