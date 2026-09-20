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

const isBare = async (dir: string) =>
  (await dirExists(path.join(dir, "HEAD"))) &&
  !(await dirExists(path.join(dir, ".git")));

const isGitDir = async (dir: string) =>
  (await isBare(dir)) || (await dirExists(path.join(dir, ".git")));

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

const branchRefs = async (dir: string): Promise<string[]> =>
  gitIn(dir, 'git for-each-ref --format="%(refname:short)" refs/heads/')
    .then((stdout) => stdout.split("\n").filter((line) => line))
    .catch(() => []);

const readmeFor = async (dir: string, ref: string): Promise<string> => {
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
};

export const getReadme = async (
  repo: string,
  branch?: string,
): Promise<string> => {
  const dir = await resolveRepo(repo);
  try {
    const ref = branch || (await resolveRef(dir));
    return await readmeFor(dir, ref);
  } catch {
    return "";
  }
};

// First few words of the README, with markdown syntax stripped out.
const excerpt = (markdown: string, maxWords = 10): string => {
  let inFence = false;
  return markdown
    .split("\n")
    .filter((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return false;
      }
      return !inFence && !/^\s*(#|>|\||[-*]\s|\d+\.\s)/.test(line);
    })
    .join(" ")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*`_\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, maxWords)
    .join(" ");
};

// GitHub-style ahead/behind of the default branch vs its upstream.
const aheadBehind = async (
  dir: string,
  branch: string,
): Promise<{ ahead: number | null; behind: number | null }> => {
  try {
    await gitIn(dir, `git rev-parse --verify -q "origin/${branch}"`);
    const stdout = await gitIn(
      dir,
      `git rev-list --left-right --count "refs/remotes/origin/${branch}"..."refs/heads/${branch}"`,
    );
    const [behind, ahead] = stdout.trim().split(/\s+/).map(Number);
    return { ahead, behind };
  } catch {
    return { ahead: null, behind: null };
  }
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
        let description = "";
        if (await isBare(dir)) {
          description = (
            await fs
              .readFile(path.join(dir, "description"), "utf8")
              .catch(() => "")
          ).trim();
          if (description.startsWith("Unnamed repository")) description = "";
        }
        const branches = await branchRefs(dir);
        const ref = await resolveRef(dir).catch(() => "");
        const { ahead, behind } = branches.includes(ref)
          ? await aheadBehind(dir, ref)
          : { ahead: null, behind: null };
        const notes = excerpt(await readmeFor(dir, ref).catch(() => ""));
        return {
          name: entry.name,
          description,
          branches,
          ahead,
          behind,
          notes,
        };
      }),
  );
  return infos
    .filter((info): info is RepoInfo => info !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
};

// Run a network command (fetch/pull/push) and return its output, keeping the
// viewer usable even when the command fails.
const gitNetwork = async (repo: string, command: string): Promise<string> => {
  const dir = await resolveRepo(repo);
  try {
    const { stdout, stderr } = await execAsync(command, { cwd: dir });
    return (stdout + stderr).trim() || "ok (no output)";
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    return (err.stderr || err.message || "failed").trim();
  }
};

export const gitPull = async (repo: string): Promise<string> => {
  const dir = await resolveRepo(repo);
  // bare repos have no worktree to merge into, so fetch instead
  const command = (await isBare(dir))
    ? "git fetch --all --prune"
    : "git pull --ff-only";
  return gitNetwork(repo, command);
};

export const gitPush = async (repo: string): Promise<string> =>
  gitNetwork(repo, "git push");

export const getBranches = async (repo: string): Promise<string[]> => {
  const dir = await resolveRepo(repo);
  const heads = await branchRefs(dir);
  if (heads.length) return heads;
  return (
    await gitIn(
      dir,
      'git for-each-ref --format="%(refname:short)" refs/remotes/',
    )
  )
    .split("\n")
    .filter((line) => line && !line.endsWith("/HEAD"));
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
