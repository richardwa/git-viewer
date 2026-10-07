// Build daemon — RUNS ON THE HOST, not inside the viewer container.
//
// Watches <REPOS_DIR>/.build-queue for job files spooled by the viewer's
// post-receive hook (see src/server/resources/build.ts) and runs each build
// inside a podman container:
//
//   podman build -f Containerfile.build -t gitviewer/<repo>:<branch>-<hash6> .
//   podman run --rm -e OUTPUT=/output -v <art>:/output gitviewer/<repo>:...
//   (run in the checked-out worktree; the container writes its artifacts to
//   $OUTPUT, which the daemon bind-mounts to the run dir; log captured there)
//
// Job file: <time>-<repo>-<branch>-<hash6>.txt, content is the state word
// ("queued" | "running" | "done" | "failed"). The queue is the transport
// across the container/host boundary; all metadata is re-derived here via
// git, so the file body stays a plain state word.
//
// A commit is built only if it has a Containerfile.build at its root.
//
// Single-threaded by design: jobs are processed strictly one at a time,
// oldest (filename = timestamp prefix) first. Run ONE daemon instance.
//
// Usage (on the host):
//   REPOS_DIR=/path/to/repos bun scripts/build-daemon.ts
import { spawn, execFile } from "child_process";
import { mkdtemp, readFile, readdir, rm, writeFile, rename, mkdir, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const reposDir = process.env.REPOS_DIR
  ? path.resolve(process.env.REPOS_DIR)
  : path.join(os.homedir(), "repos");
const artifactsDir = process.env.ARTIFACTS_DIR
  ? path.resolve(process.env.ARTIFACTS_DIR)
  : path.join(os.homedir(), "artifacts");
if (artifactsDir === reposDir) {
  console.error(
    `[build-daemon] REPOS_DIR and ARTIFACTS_DIR must differ (both are ${reposDir})`,
  );
  process.exit(1);
}
const pollMs = Number(process.env.POLL_MS || 3000);

const queueDir = path.join(reposDir, ".build-queue");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const log = (msg: string) =>
  console.log(`[build-daemon] ${new Date().toISOString()} ${msg}`);

const readState = async (file: string): Promise<string> =>
  (await readFile(file, "utf8").catch(() => "")).trim();

/** Atomically rewrite a job file's state (tmp + rename). */
const setState = async (file: string, state: string) => {
  await writeFile(`${file}.tmp`, `${state}\n`);
  await rename(`${file}.tmp`, file);
};

const run = (dir: string, cmd: string, args: string[]) =>
  execFileAsync(cmd, args, { cwd: dir, maxBuffer: 16 * 1024 * 1024 });

/** Extract a commit's tree into a temp dir. */
const checkout = (repoDir: string, commit: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), "gitviewer-build-");
    mkdtemp(tmp).then((worktree) => {
      const archive = spawn("git", ["archive", "--format=tar", commit], {
        cwd: repoDir,
      });
      const untar = spawn("tar", ["-x", "-C", worktree]);
      archive.stdout.pipe(untar.stdin);
      archive.on("error", reject);
      untar.on("error", reject);
      untar.on("close", (code) =>
        code === 0 ? resolve(worktree) : reject(new Error(`tar exited ${code}`)),
      );
      archive.on("close", (code) => {
        if (code !== 0) untar.kill();
      });
    }, reject);
  });

/** True when the commit has a Containerfile.build at its root. */
const hasContainerfile = async (
  repoDir: string,
  commit: string,
): Promise<boolean> => {
  try {
    await run(repoDir, "git", [
      "cat-file",
      "-e",
      `${commit}:Containerfile.build`,
    ]);
    return true;
  } catch {
    return false; // not present at this commit
  }
};

const buildOne = async (file: string) => {
  // claim atomically so a restart mid-build can't double-run it
  if ((await readState(file)) !== "queued") return;
  await setState(file, "running");

  // <time>-<repo>-<branch>-<hash6>.txt — repo/branch may contain "-", so
  // recover them by matching the repo prefix against existing repo dirs
  const base = path.basename(file, ".txt");
  const ts = base.slice(0, 15);
  const hash6 = base.slice(-6);
  const { repo, branch } = parseJobName(base.slice(16, -7));
  if (!repo || !branch) {
    await setState(file, "failed");
    log(`cannot parse job name: ${base}`);
    return;
  }
  const full = (await run(reposDir, "git", ["-C", repoGitDir(repo), "rev-parse", hash6])).stdout.trim();
  if (!(await hasContainerfile(repoGitDir(repo), full))) {
    await setState(file, "failed");
    log(`${repo}/${branch}: no Containerfile.build at ${full}`);
    return;
  }

  const outDir = path.join(artifactsDir, `${repo}.art`, branch, `${ts}-${hash6}`);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "status"), "running\n");
  // build.properties: identifies the exact build; the container copies it
  // into dist so the running server exposes it statically
  await writeFile(
    path.join(outDir, "build.properties"),
    [
      `build.path=${outDir}`,
      `build.name=${ts}-${hash6}`,
      `build.repo=${repo}`,
      `build.branch=${branch}`,
      `build.commit=${full}`,
      `build.time=${ts}`,
    ].join("\n") + "\n",
  );

  const worktree = await checkout(repoGitDir(repo), full);
  const tag = `gitviewer/${repo}:${branch}-${hash6}`;
  const logTo = (r: { stdout: string; stderr: string }) =>
    `${r.stdout}${r.stderr}`;
  try {
    const buildOut = logTo(
      await run(worktree, "podman", [
        "build",
        "-f", "Containerfile.build",
        "-t", tag,
        ".",
      ]),
    );
    // the built image emits artifacts to $OUTPUT; the run dir is mounted there
    const runOut = logTo(
      await run(worktree, "podman", [
        "run", "--rm",
        "-e", "OUTPUT=/output",
        "-v", `${outDir}:/output`,
        tag,
      ]),
    );
    await writeFile(path.join(outDir, "build.log"), `${buildOut}${runOut}`);
    await setState(file, "done");
    await writeFile(path.join(outDir, "status"), "done\n");
    // keep <repo>.art/<branch>/latest pointing at the newest successful run
    // (tmp symlink + rename so readers never see a missing/broken link)
    const branchDir = path.join(artifactsDir, `${repo}.art`, branch);
    const linkTmp = path.join(branchDir, `.latest.${ts}-${hash6}.tmp`);
    await symlink(`${ts}-${hash6}`, linkTmp);
    await rename(linkTmp, path.join(branchDir, "latest"));
    // done is recorded durably in the art dir (status file + run dir name);
    // drop the job file so the queue only ever holds active/failed work
    await rm(file);
    log(`${repo}/${branch}: ${ts}-${hash6} done`);
  } catch (error) {
    const err = error as { stderr?: string; message?: string };
    // podman itself failed (no build.log from the container): leave a trace
    if (!existsSync(path.join(outDir, "build.log"))) {
      await writeFile(
        path.join(outDir, "build.log"),
        `build failed to start: ${err.stderr || err.message}\n`,
      );
    }
    await setState(file, "failed");
    await writeFile(path.join(outDir, "status"), "failed\n");
    log(`${repo}/${branch}: ${ts}-${hash6} FAILED — ${err.stderr || err.message}`);
  } finally {
    await rm(worktree, { recursive: true, force: true });
  }
};

const repoGitDir = (repo: string) => {
  const bare = path.join(reposDir, `${repo}.git`);
  return existsSync(bare) ? bare : path.join(reposDir, repo);
};

/** Split "<repo>-<branch>" at the boundary where the repo dir exists. */
const parseJobName = (middle: string): { repo: string; branch: string } => {
  const parts = middle.split("-");
  for (let i = 1; i < parts.length; i++) {
    const repo = parts.slice(0, i).join("-");
    if (existsSync(repoGitDir(repo))) {
      return { repo, branch: parts.slice(i).join("-") };
    }
  }
  return { repo: "", branch: "" };
};

const tick = async () => {
  const files = (await readdir(queueDir).catch(() => []))
    .filter((f) => f.endsWith(".txt"))
    .sort(); // timestamp prefix => oldest first
  for (const file of files) {
    if ((await readState(path.join(queueDir, file))) !== "queued") continue;
    try {
      await buildOne(path.join(queueDir, file)); // strictly one at a time
    } catch (error) {
      // never let one bad job (bad hash, missing repo, ...) kill the daemon
      const err = error as { message?: string };
      await setState(path.join(queueDir, file), "failed").catch(() => {});
      log(`job ${file} FAILED — ${err.message || error}`);
    }
  }
};

log(`watching ${queueDir} → ${artifactsDir} (poll: ${pollMs}ms)`);
// RUN_ONCE=1: drain the queue, then exit — for systemd oneshot units
// (a .path unit fires on queue writes, a .timer polls as a safety net).
if (process.env.RUN_ONCE === "1") {
  for (;;) {
    await tick();
    const files = (await readdir(queueDir).catch(() => [])).filter((f) =>
      f.endsWith(".txt"),
    );
    const pending = (
      await Promise.all(files.map((f) => readState(path.join(queueDir, f))))
    ).filter((s) => s === "queued");
    if (!pending.length) break;
  }
  process.exit(0);
}
for (;;) {
  await tick();
  await sleep(pollMs);
}