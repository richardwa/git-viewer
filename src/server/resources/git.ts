import { exec } from "child_process";
import { promisify } from "util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { GitLog, RepoInfo } from "../../common/interface";

const execAsync = promisify(exec);

// Repo storage directory: override with the REPOS_DIR env var (absolute, or
// relative to the project root); defaults to ~/repos.
export const reposDir = process.env.REPOS_DIR
  ? path.resolve(process.env.REPOS_DIR)
  : path.join(os.homedir(), "repos");

const dirExists = async (dir: string) =>
  fs
    .stat(dir)
    .then(() => true)
    .catch(() => false);

const isValidRepoName = (repo: string) =>
  Boolean(repo) &&
  !repo.startsWith(".") &&
  !repo.includes("/") &&
  !repo.includes("\\");

const resolveRepo = async (repo: string) => {
  if (!isValidRepoName(repo)) {
    throw new Error(`unknown repo: ${repo}`);
  }
  const dir = path.join(reposDir, repo);
  if (!(await dirExists(dir))) {
    throw new Error(`unknown repo: ${repo}`);
  }
  return dir;
};

const gitIn = async (dir: string, command: string, maxBuffer?: number) => {
  const { stdout } = await execAsync(command, { cwd: dir, maxBuffer });
  return stdout;
};

// Resolve a commit-ish ref for HEAD-derived queries; falls back to the first
// branch when HEAD is dangling (e.g. a bare repo initialized with a different
// default branch name than the one that was pushed).
const resolveRef = async (dir: string): Promise<string> => {
  try {
    const head = (await gitIn(dir, "git rev-parse --abbrev-ref HEAD")).trim();
    if (head && head !== "HEAD") {
      await gitIn(dir, `git rev-parse --verify -q "${head}"`);
      return head;
    }
  } catch {
    // dangling or unborn HEAD: fall through to the branch list
  }
  return (
    await gitIn(
      dir,
      'git for-each-ref --count=1 --format="%(refname:short)" refs/heads/',
    )
  ).trim();
};

const isGitDir = async (dir: string) => {
  const isBare = await dirExists(path.join(dir, "HEAD"));
  return isBare || (await dirExists(path.join(dir, ".git")));
};

export const listRepos = async (): Promise<RepoInfo[]> => {
  const entries = await fs
    .readdir(reposDir, { withFileTypes: true })
    .catch(() => []);
  const infos = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<RepoInfo | null> => {
        const dir = path.join(reposDir, entry.name);
        if (!(await isGitDir(dir))) return null;
        const isBare = await dirExists(path.join(dir, "HEAD"));
        let description = "";
        if (isBare) {
          description = (
            await fs
              .readFile(path.join(dir, "description"), "utf8")
              .catch(() => "")
          ).trim();
          if (description.startsWith("Unnamed repository")) description = "";
        }
        let lastCommitDate = "";
        try {
          lastCommitDate = (
            await gitIn(dir, "git log -1 --branches --format=%aI")
          ).trim();
        } catch {
          // empty or unborn HEAD
        }
        return { name: entry.name, description, lastCommitDate };
      }),
  );
  return infos
    .filter((info): info is RepoInfo => info !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const getReadme = async (repo: string): Promise<string> => {
  const dir = await resolveRepo(repo);
  try {
    const ref = await resolveRef(dir);
    if (!ref) return "";
    const tree = await gitIn(dir, `git ls-tree -r --name-only "${ref}"`);
    const readme = tree
      .split("\n")
      .filter((file) => file && !file.includes("/"))
      .find((file) => /^readme/i.test(file));
    if (!readme) return "";
    return await gitIn(
      dir,
      `git cat-file -p "${ref}:${readme}"`,
      16 * 1024 * 1024,
    );
  } catch {
    return "";
  }
};

export const getBranches = async (repo: string): Promise<string[]> => {
  const dir = await resolveRepo(repo);
  const refs = async (spec: string) =>
    (await gitIn(dir, `git for-each-ref --format="%(refname:short)" ${spec}`))
      .split("\n")
      .filter((line) => line);
  const heads = await refs("refs/heads/");
  if (heads.length) return heads;
  return (await refs("refs/remotes/")).filter((b) => !b.endsWith("/HEAD"));
};

export const getGitLog = async (
  repo: string,
  branch: string,
  lines?: number,
): Promise<GitLog[]> => {
  if (!branch) return [];
  const dir = await resolveRepo(repo);
  try {
    const delim = "|";
    const linesArg = lines ? ` -${lines}` : "";
    const stdout = await gitIn(
      dir,
      `git log${linesArg} ${branch} --pretty=format:"%H${delim}%aI${delim}%al${delim}%s"`,
    );
    return stdout
      .split("\n")
      .filter((log) => log)
      .map((log) => {
        const [commitHash, commitDate, commitAuthor, ...commitMessage] =
          log.split(delim);
        return {
          commitHash,
          commitDate,
          commitAuthor,
          commitMessage: commitMessage.join(delim),
        } satisfies GitLog;
      });
  } catch {
    return [];
  }
};
