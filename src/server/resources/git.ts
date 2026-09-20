import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { GitLog, RepoInfo } from "../../common/interface";
import * as gitcli from "./git-cli";

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

const isBare = async (dir: string) =>
  (await dirExists(path.join(dir, "HEAD"))) &&
  !(await dirExists(path.join(dir, ".git")));

const isGitDir = async (dir: string) =>
  (await isBare(dir)) || (await dirExists(path.join(dir, ".git")));

export const getReadme = async (
  repo: string,
  branch?: string,
): Promise<string> => {
  const dir = await resolveRepo(repo);
  try {
    const ref = branch || (await gitcli.resolveRef(dir));
    return await gitcli.readmeFor(dir, ref);
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

// Collect display info (description, ahead/behind, notes) for one repo.
// Returns null when the directory is missing or is not a git repo.
export const getRepoInfo = async (name: string): Promise<RepoInfo | null> => {
  if (!isValidRepoName(name)) return null;
  const dir = path.join(reposDir, name);
  if (!(await dirExists(dir)) || !(await isGitDir(dir))) return null;
  let description = "";
  if (await isBare(dir)) {
    description = (
      await fs.readFile(path.join(dir, "description"), "utf8").catch(() => "")
    ).trim();
    if (description.startsWith("Unnamed repository")) description = "";
  }
  const branches = await gitcli.branchRefs(dir);
  const ref = await gitcli.resolveRef(dir).catch(() => "");
  const { ahead, behind } = branches.includes(ref)
    ? await gitcli.aheadBehind(dir, ref)
    : { ahead: null, behind: null };
  const notes = excerpt(await gitcli.readmeFor(dir, ref).catch(() => ""));
  return { name, description, ahead, behind, notes };
};

export const listRepos = async (): Promise<RepoInfo[]> => {
  const entries = await fs
    .readdir(reposDir, { withFileTypes: true })
    .catch(() => []);
  const infos = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => getRepoInfo(entry.name)),
  );
  return infos
    .filter((info): info is RepoInfo => info !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const gitPull = async (repo: string): Promise<string> => {
  const dir = await resolveRepo(repo);
  // bare repos have no worktree to merge into, so fetch instead
  return (await isBare(dir)) ? gitcli.fetchAll(dir) : gitcli.pullFF(dir);
};

export const gitPush = async (repo: string): Promise<string> =>
  gitcli.push(await resolveRepo(repo));

export const getBranches = async (repo: string): Promise<string[]> => {
  const dir = await resolveRepo(repo);
  const heads = await gitcli.branchRefs(dir);
  if (heads.length) return heads;
  return gitcli.remoteBranchRefs(dir);
};

export const getGitLog = async (
  repo: string,
  branch: string,
  lines?: number,
): Promise<GitLog[]> => gitcli.log(await resolveRepo(repo), branch, lines);
