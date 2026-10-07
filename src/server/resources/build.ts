// Build-on-commit: repos carrying a build.yaml/.build.yaml manifest at a
// pushed commit get a build job spooled into <reposDir>/.build-queue. The actual build
// runs OUTSIDE this container: a host-side daemon (scripts/build-daemon.ts)
// picks up the job file and runs the script inside a podman container.
//
// Job file protocol (single file, state as content):
//   name:   <time>-<repo>-<branch-sanitized>-<hash6>.txt
//   body:   one word — "queued" | "running" | "done" | "failed"
//   sidecar metadata is embedded in the filename; the daemon re-derives the
//   full commit from the repo (see scripts/build-daemon.ts).
//
// The viewer container never runs podman — it only writes job files and
// reads back artifacts from <reposDir>/<repo>.art/<branch>/<time>-<hash6>/.
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "child_process";
import { promisify } from "util";
import { BuildRun, BuildStatus } from "../../common/interface";
import { reposDir, repoDir, isValidRepoName } from "./git";

const execFileAsync = promisify(execFile);

export const queueDir = path.join(reposDir, ".build-queue");

const dirExists = async (dir: string) =>
  fs
    .stat(dir)
    .then(() => true)
    .catch(() => false);

/** Name of the art root for a repo: <repo>.art sits beside the repo in the
 *  repos dir — naming convention only, so artifacts stay together. */
export const artDir = (repo: string) => path.join(reposDir, `${repo}.art`);

const sanitize = (s: string) => s.replace(/[/\\]/g, "-");

/** Shell-safe double-quoted string for embedding in the hook script. */
const shq = (s: string) => `"${s.replace(/[\\"]/g, "\\$&")}"`;

/** Source of the managed post-receive hook. Installed per-repo by
 *  ensureBuildHook; fires a build job when a pushed commit carries a
 *  Containerfile.build. Pure shell + git — the hook runs inside the viewer
 *  container and must never touch podman. */
const hookScript = (repo: string) => `#!/bin/sh
# git-viewer-managed-build-hook
# Managed by git-viewer: spools a build job for pushes whose tip commit
# contains a Containerfile.build at its root. State machine lives in the
# daemon; the build itself is a podman build of that Containerfile.
QUEUE=${shq(queueDir)}
ART=${shq(reposDir)}
REPO=${shq(repo)}
iszero() { case "$1" in ''|*[!0]*) return 1 ;; *) return 0 ;; esac; }
while read old new ref; do
  case "$ref" in refs/heads/*) ;; *) continue ;; esac
  iszero "$new" && continue
  git cat-file -e "$new:Containerfile.build" 2>/dev/null || continue
  branch=\${ref#refs/heads/}
  ts=$(date +%Y%m%d-%H%M%S)
  hash6=$(git rev-parse --short=6 "$new")
  safbranch=$(printf '%s' "$branch" | tr '/' '-')
  file="$QUEUE/\${ts}-\${REPO}-\${safbranch}-\${hash6}.txt"
  # one job per commit: either still queued/running, or already built and
  # its job file deleted — the artifact run dir is the durable record
  if ls "$QUEUE"/*-\${REPO}-\${safbranch}-\${hash6}.txt >/dev/null 2>&1 ||
     ls "$ART/\${REPO}.art/\${safbranch}"/*-\${hash6} >/dev/null 2>&1; then
    continue
  fi
  mkdir -p "$QUEUE"
  printf '%s\\n' "queued" > "$file.tmp"
  mv "$file.tmp" "$file"
done
exit 0
`;

/** Install/refresh the repo's post-receive build hook (same marker policy as
 *  the pre-receive hook: a pre-existing hook without our marker is left
 *  untouched). */
export const ensureBuildHook = async (
  gitDir: string,
  repo: string,
): Promise<void> => {
  const MARKER = "git-viewer-managed-build-hook";
  const hookPath = path.join(gitDir, "hooks", "post-receive");
  try {
    const existing = await fs.readFile(hookPath, "utf8");
    if (existing.includes(MARKER)) {
      await fs.writeFile(hookPath, hookScript(repo), { mode: 0o755 });
      return;
    }
    if (existing.trim()) return; // user-managed hook
  } catch {
    // hook missing: install below
  }
  await fs.mkdir(path.join(gitDir, "hooks"), { recursive: true });
  await fs.writeFile(hookPath, hookScript(repo), { mode: 0o755 });
};

const readState = async (file: string): Promise<BuildStatus | null> => {
  const text = (await fs.readFile(file, "utf8").catch(() => "")).trim();
  return text === "queued" ||
    text === "running" ||
    text === "done" ||
    text === "failed"
    ? text
    : null;
};

const statusFile = async (dir: string): Promise<BuildStatus> => {
  const text = (
    await fs.readFile(path.join(dir, "status"), "utf8").catch(() => "")
  ).trim();
  return text === "running" || text === "failed" || text === "done"
    ? text
    : "done"; // artifact present without a status file: build completed
};

/** List build runs for one repo/branch. Merges queued/running jobs from the
 *  spool (no artifact dir yet) with completed runs from the art dir. */
export const buildRuns = async (
  repo: string,
  branch: string,
): Promise<BuildRun[]> => {
  if (!isValidRepoName(repo) || branch.includes("..")) return [];
  const runs = new Map<string, BuildRun>();

  // queued/running jobs (artifact dir not created until the daemon starts)
  // filename: <time:15>-<repo>-<branch>-<hash6:6>.txt — parse positionally
  // since repo/branch/timestamp may themselves contain "-"
  const entries = await fs.readdir(queueDir).catch(() => []);
  for (const file of entries.filter((f) => f.endsWith(".txt"))) {
    const base = file.slice(0, -4);
    const hash6 = base.slice(-6);
    const parts = base.slice(16, -7).split("-");
    const jobBranch = parts.slice(1).join("-");
    if (parts[0] !== repo || jobBranch !== sanitize(branch)) continue;
    const state = await readState(path.join(queueDir, file));
    if (state === "queued" || state === "running") {
      runs.set(`${state}-${hash6}`, { branch, run: hash6, status: state });
    }
  }

  // completed (or in-flight) artifact runs: <time>-<hash6> dirs
  // (branch sanitized the same way the hook/daemon sanitize it)
  const art = path.join(artDir(repo), sanitize(branch));
  const dirs = await fs.readdir(art).catch(() => []);
  for (const dir of dirs) {
    if (dir.includes("-")) continue; // only <time>-<hash6> dirs
    const status = await statusFile(path.join(art, dir));
    runs.set(dir, { branch, run: dir, status });
  }

  return [...runs.values()].sort((a, b) => a.run.localeCompare(b.run));
};

/** Contents of a run's build.log ("" when missing). */
export const buildLog = async (
  repo: string,
  branch: string,
  run: string,
): Promise<string> => {
  if (!isValidRepoName(repo) || branch.includes("..") || run.includes("..")) {
    return "";
  }
  return fs
    .readFile(
      path.join(artDir(repo), sanitize(branch), run, "build.log"),
      "utf8",
    )
    .catch(() => "");
};

/** Convenience for the daemon-facing docs/tests: resolve a repo's directory. */
export const resolveRepoDir = (repo: string) => repoDir(repo);

/** Enqueue a build job directly (used by tests and manual triggering). */
export const enqueueJob = async (
  repo: string,
  branch: string,
  commit: string,
): Promise<string> => {
  const hash6 = (
    await execFileAsync("git", ["rev-parse", "--short=6", commit])
  ).stdout.trim();
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 15);
  const file = path.join(
    queueDir,
    `${ts}-${repo}-${sanitize(branch)}-${hash6}.txt`,
  );
  await fs.mkdir(queueDir, { recursive: true });
  await fs.writeFile(`${file}.tmp`, "queued\n");
  await fs.rename(`${file}.tmp`, file);
  return file;
};

export const queueExists = () => dirExists(queueDir);
