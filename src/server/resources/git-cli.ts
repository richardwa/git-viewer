// Thin wrapper around the git CLI: every method here executes `git` as a
// subprocess (argv array, no shell interpolation) and returns plain strings.
// The API layer (git.ts) resolves repo directories and shapes responses on
// top of these primitives.
import { execFile } from "child_process";
import { promisify } from "util";
import type { GitLog } from "../../common/interface";

const execFileAsync = promisify(execFile);

const MIB = 1024 * 1024;

const splitLines = (stdout: string): string[] =>
  stdout.split("\n").filter((line) => line);

/** Run git in a directory; resolves with stdout, rejects on non-zero exit. */
export const runGit = (dir: string, args: string[], maxBuffer = 1 * MIB) =>
  execFileAsync("git", args, { cwd: dir, maxBuffer }).then((r) => r.stdout);

/** Run git, resolving with combined stdout+stderr; on failure resolve with
 * the error's stderr/message instead of rejecting (network commands keep the
 * viewer usable even when they fail). */
export const tryGit = async (
  dir: string,
  args: string[],
  maxBuffer = 1 * MIB,
): Promise<string> => {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd: dir,
      maxBuffer,
    });
    return (stdout + stderr).trim() || "ok (no output)";
  } catch (error) {
    const err = error as {
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return (err.stderr || err.stdout || err.message || "failed").trim();
  }
};

/** Local branches (refs/heads), empty when git fails. */
export const branchRefs = (dir: string): Promise<string[]> =>
  runGit(dir, ["for-each-ref", "--format=%(refname:short)", "refs/heads/"])
    .then(splitLines)
    .catch(() => []);

/** Remote-tracking branches (refs/remotes), excluding the symbolic HEAD. */
export const remoteBranchRefs = (dir: string): Promise<string[]> =>
  runGit(dir, ["for-each-ref", "--format=%(refname:short)", "refs/remotes/"])
    .then(splitLines)
    .then((refs) => refs.filter((ref) => !ref.endsWith("/HEAD")))
    .catch(() => []);

/** Configured remotes, empty when git fails. */
export const remotes = (dir: string): Promise<string[]> =>
  runGit(dir, ["remote"])
    .then(splitLines)
    .catch(() => []);

/** URL of the origin remote (or the first configured remote); "" when none. */
export const remoteUrl = async (dir: string): Promise<string> => {
  const list = await remotes(dir);
  const name = list.find((r) => r === "origin") ?? list[0];
  return name
    ? runGit(dir, ["config", "--get", `remote.${name}.url`]).catch(() => "")
    : "";
};

/** True when the (fully-qualified) ref resolves to a commit. */
export const refExists = (dir: string, ref: string): Promise<boolean> =>
  runGit(dir, ["rev-parse", "--verify", "-q", ref])
    .then(() => true)
    .catch(() => false);

/** Resolve the ref for HEAD-derived queries; falls back to the first branch
 * when HEAD is dangling (e.g. a bare repo initialized with a default branch
 * name that was never pushed). */
export const resolveRef = async (dir: string): Promise<string> => {
  try {
    const head = (await runGit(dir, ["rev-parse", "--abbrev-ref", "HEAD"]))
      .trim()
      .split("\n")[0];
    if (head && head !== "HEAD" && (await refExists(dir, head))) {
      return head;
    }
  } catch {
    // dangling or unborn HEAD: fall through to the branch list
  }
  return (
    await runGit(dir, [
      "for-each-ref",
      "--count=1",
      "--format=%(refname:short)",
      "refs/heads/",
    ])
  ).trim();
};

/** GitHub-style ahead/behind of a branch vs its upstream. Checks every
 * configured remote for a matching branch ref (origin first); nulls when no
 * upstream exists. */
export const aheadBehind = async (
  dir: string,
  branch: string,
): Promise<{ ahead: number | null; behind: number | null }> => {
  for (const remote of await remotes(dir)) {
    const upstream = `refs/remotes/${remote}/${branch}`;
    if (await refExists(dir, upstream)) {
      const counts = await runGit(dir, [
        "rev-list",
        "--left-right",
        "--count",
        `${upstream}...refs/heads/${branch}`,
      ]);
      const [behind, ahead] = counts.trim().split(/\s+/).map(Number);
      return { ahead, behind };
    }
  }
  return { ahead: null, behind: null };
};

/** Commit log parsed into GitLog rows (subject may contain the delimiter). */
export const log = async (
  dir: string,
  branch: string,
  lines?: number,
): Promise<GitLog[]> => {
  if (!branch) return [];
  const delim = "|";
  const args = [
    "log",
    branch,
    `--pretty=format:%H${delim}%aI${delim}%al${delim}%s`,
  ];
  if (lines) args.splice(1, 0, `-${lines}`);
  try {
    return (await runGit(dir, args))
      .split("\n")
      .filter((entry) => entry)
      .map((entry) => {
        const [commitHash, commitDate, commitAuthor, ...commitMessage] =
          entry.split(delim);
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

/** Contents of the root-level README (any case) at a ref; nested readmes are
 * ignored; empty string when the ref has none. */
export const readmeFor = async (dir: string, ref: string): Promise<string> => {
  if (!ref) return "";
  const tree = await runGit(dir, ["ls-tree", "-r", "--name-only", ref]);
  const readme = tree
    .split("\n")
    .filter((file) => file && !file.includes("/"))
    .find((file) => /^readme/i.test(file));
  if (!readme) return "";
  return runGit(dir, ["cat-file", "-p", `${ref}:${readme}`], 16 * MIB);
};

export const fetchAll = (dir: string): Promise<string> =>
  tryGit(dir, ["fetch", "--all", "--prune"]);

export const pullFF = (dir: string): Promise<string> =>
  tryGit(dir, ["pull", "--ff-only"]);

export const push = async (dir: string): Promise<string> => {
  const output = await tryGit(dir, ["push"]);
  if (!/no upstream branch/i.test(output)) return output;
  // Current branch has no upstream yet: push it and set one up, using the
  // first configured remote (origin first when present).
  const branch = await resolveRef(dir);
  const remoteList = await remotes(dir);
  const remote = remoteList.find((r) => r === "origin") ?? remoteList[0];
  if (!branch || !remote) return output;
  return tryGit(dir, ["push", "--set-upstream", remote, branch]);
};
