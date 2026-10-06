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

export type BuildStatus = "queued" | "running" | "done" | "failed";

export type BuildRun = {
  branch: string;
  /** <time>-<hash6> dir name (or bare hash6 for queued/running jobs) */
  run: string;
  status: BuildStatus;
};

export type ServerApi = {
  repos: () => Promise<RepoInfo[]>;
  /** fresh info for one repo (null when unknown) */
  repoInfo: (repo: string) => Promise<RepoInfo | null>;
  readme: (repo: string, branch?: string) => Promise<string>;
  gitBranches: (repo: string) => Promise<string[]>;
  /** upstream (origin) remote url, "" when the repo has no remote */
  gitRemoteUrl: (repo: string) => Promise<string>;
  gitLogs: (repo: string, branch: string, lines?: number) => Promise<GitLog[]>;
  /** create a new bare repo in the repos dir; error message on failure */
  createRepo: (name: string, description?: string) => Promise<string>;
  gitPull: (repo: string) => Promise<string>;
  gitPush: (repo: string) => Promise<string>;
  /** break-glass per-repo: are force pushes currently allowed (in-memory, resets on restart) */
  forcePushEnabled: (repo: string) => Promise<boolean>;
  /** admin-only: toggle force pushes for a repo over http */
  setForcePushEnabled: (repo: string, value: boolean) => Promise<boolean>;
  /** build runs for a repo/branch (spooled jobs + completed artifact dirs) */
  buildRuns: (repo: string, branch: string) => Promise<BuildRun[]>;
  /** contents of a run's build.log ("" when missing) */
  buildLog: (repo: string, branch: string, run: string) => Promise<string>;
};
