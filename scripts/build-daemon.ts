// Build daemon — RUNS ON THE HOST, not inside the viewer container.
//
// Watches <REPOS_DIR>/.build-queue for job files spooled by the viewer's
// post-receive hook (see src/server/resources/build.ts) and runs each build
// inside a podman container:
//
//   podman run --rm \
//     -v <worktree>:/src \
//     -v <reposDir>/<repo>.art/<branch>/<time>-<hash6>:/output \
//     <image> sh -c 'cd /src && sh build.sh > /output/build.log 2>&1'
//
// Job file: <time>-<repo>-<branch>-<hash6>.txt, content is the state word
// ("queued" | "running" | "done" | "failed"). The queue is the transport
// across the container/host boundary; all metadata is re-derived here via
// git, so the file body stays a plain state word.
//
// The build manifest (build.yaml or .build.yaml at the commit's root) names
// the container and script:
//
//   container: BunContainer   # key into the container registry below
//   script: build.sh          # default: build.sh
//
// The registry maps names to image refs; CONTAINERS_FILE (a YAML file with
// the same shape) adds/overrides entries.
//
// Single-threaded by design: jobs are processed strictly one at a time,
// oldest (filename = timestamp prefix) first. Run ONE daemon instance.
//
// Usage (on the host):
//   REPOS_DIR=/path/to/repos BUILD_IMAGE=debian:trixie bun scripts/build-daemon.ts
import { spawn, execFile } from "child_process";
import { mkdtemp, readFile, readdir, rm, writeFile, rename, mkdir } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const reposDir = process.env.REPOS_DIR
  ? path.resolve(process.env.REPOS_DIR)
  : path.join(os.homedir(), "repos");
const image = process.env.BUILD_IMAGE || "debian:trixie";
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

/** Container registry: named container definitions available to build
 *  manifests. CONTAINERS_FILE (same shape) merges on top. */
const builtinContainers: Record<string, string> = {
  BunContainer: "docker.io/oven/bun:1",
};

const containerRegistry = async (): Promise<Record<string, string>> => {
  const file = process.env.CONTAINERS_FILE;
  const extra = file
    ? (await readFile(file, "utf8").then(
        (t) => parseYaml(t) as Record<string, string>,
        () => ({}),
      ))
    : {};
  return { ...builtinContainers, ...extra };
};

/** Read + validate the build manifest at a commit. Null when absent/invalid. */
const readManifest = async (
  repoDir: string,
  commit: string,
): Promise<{ container: string; script: string } | null> => {
  for (const name of ["build.yaml", ".build.yaml"]) {
    let text: string;
    try {
      text = (
        await run(repoDir, "git", ["cat-file", "-p", `${commit}:${name}`])
      ).stdout;
    } catch {
      continue; // not present at this commit
    }
    const m = (parseYaml(text) ?? {}) as {
      container?: unknown;
      script?: unknown;
    };
    const container = typeof m.container === "string" ? m.container : "";
    const script = typeof m.script === "string" ? m.script : "build.sh";
    // script must be a plain filename: no path parts, no shell metacharacters
    // — it is interpolated into the container's `sh -c` command string
    if (
      !container ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(script) ||
      script.includes("..")
    ) {
      log(`invalid manifest ${name} at ${commit}: container=${container} script=${script}`);
      return null;
    }
    return { container, script };
  }
  return null;
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
  const manifest = await readManifest(repoGitDir(repo), full);
  if (!manifest) {
    await setState(file, "failed");
    log(`${repo}/${branch}: no valid build.yaml at ${full}`);
    return;
  }
  const registry = await containerRegistry();
  const image = registry[manifest.container];
  if (!image) {
    await setState(file, "failed");
    log(`${repo}/${branch}: unknown container '${manifest.container}' in registry`);
    return;
  }

  const outDir = path.join(reposDir, `${repo}.art`, branch, `${ts}-${hash6}`);
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "status"), "running\n");

  const worktree = await checkout(repoGitDir(repo), full);
  try {
    await run(reposDir, "podman", [
      "run", "--rm",
      "-v", `${worktree}:/src`,
      "-v", `${outDir}:/output`,
      image,
      "/bin/sh", "-c", `cd /src && sh ${manifest.script} > /output/build.log 2>&1`,
    ]);
    await setState(file, "done");
    await writeFile(path.join(outDir, "status"), "done\n");
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

log(`watching ${queueDir} (image: ${image}, poll: ${pollMs}ms)`);
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