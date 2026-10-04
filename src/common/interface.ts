export const apiPath = "/api";

export type GitLog = {
  commitHash: string;
  commitDate: string;
  commitAuthor: string;
  commitMessage: string;
};

export type RepoInfo = {
  name: string;
  description: string;
  /** commits only on the local default branch (null when no upstream) */
  ahead: number | null;
  /** commits only on the upstream of the default branch (null when none) */
  behind: number | null;
  /** opening words of the default branch's README */
  notes: string;
};

export type ServerApi = {
  repos: () => Promise<RepoInfo[]>;
  /** fresh info for one repo (null when unknown) */
  repoInfo: (repo: string) => Promise<RepoInfo | null>;
  readme: (repo: string, branch?: string) => Promise<string>;
  gitBranches: (repo: string) => Promise<string[]>;
  gitLogs: (repo: string, branch: string, lines?: number) => Promise<GitLog[]>;
  gitPull: (repo: string) => Promise<string>;
  gitPush: (repo: string) => Promise<string>;
  /** repo names reachable over http (/<name>.git) by at least one ACL principal */
  publicRepos: () => Promise<string[]>;
  /** break-glass per-repo: are force pushes currently allowed (in-memory, resets on restart) */
  forcePushEnabled: (repo: string) => Promise<boolean>;
  setForcePushEnabled: (repo: string, value: boolean) => Promise<boolean>;
};

export const fetchJson = <T extends keyof ServerApi>(
  key: T,
  ...params: Parameters<ServerApi[T]>
) =>
  fetch(`${apiPath}/${key}`, {
    method: "post",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).then((res) => res.json()) as ReturnType<ServerApi[T]>;
