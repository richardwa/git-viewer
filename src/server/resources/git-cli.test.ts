// Unit tests for the git CLI wrapper (git-cli.ts). Each test runs against
// real fixture repositories built with the git CLI in a temp directory.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  aheadBehind,
  branchRefs,
  fetchAll,
  log,
  pullFF,
  push,
  readmeFor,
  refExists,
  remoteBranchRefs,
  remotes,
  resolveRef,
  runGit,
  tryGit,
} from "./git-cli";

const execFileAsync = promisify(execFile);
const git = (dir: string, ...args: string[]) =>
  execFileAsync("git", args, { cwd: dir });

let base: string;
let upstream: string; // bare remote shared by the clones
let work: string; // non-bare repo with remote origin, ahead/behind by 1
let work2: string; // second clone, used to push commits upstream
let bare: string; // bare repo with a pushed branch and a description

const REDME_TEXT = "# Work\n\nHello world readme.";

beforeAll(async () => {
  base = await fs.mkdtemp(path.join(os.tmpdir(), "git-cli-test-"));
  upstream = path.join(base, "upstream.git");
  await git(base, "init", "--bare", "-q", "-b", "main", upstream);

  // working repo: 2 commits, pushed; feature branch; nested + root readmes
  work = path.join(base, "work");
  await git(base, "clone", "-q", upstream, work);
  await git(work, "config", "user.email", "alice@example.com");
  await git(work, "config", "user.name", "Alice");
  await fs.writeFile(path.join(work, "README.md"), REDME_TEXT);
  await fs.mkdir(path.join(work, "docs"));
  await fs.writeFile(path.join(work, "docs", "README.md"), "nested, ignored");
  await fs.writeFile(path.join(work, "src.txt"), "code");
  await git(work, "add", "-A");
  await git(work, "commit", "-qm", "initial commit");
  await git(
    work,
    "commit",
    "--allow-empty",
    "-qm",
    "fix: a | b | pipes in subject",
  );
  await git(work, "push", "-qu", "origin", "main");
  await git(work, "branch", "feature/x");

  // second clone pushes one more commit upstream (work will be behind 1)
  work2 = path.join(base, "work2");
  await git(base, "clone", "-q", upstream, work2);
  await git(work2, "config", "user.email", "bob@example.com");
  await git(work2, "config", "user.name", "Bob");
  await fs.writeFile(path.join(work2, "other.txt"), "other");
  await git(work2, "add", "-A");
  await git(work2, "commit", "-qm", "remote change");
  await git(work2, "push", "-q", "origin", "main");

  // a local-only commit makes work ahead 1 as well
  await git(work, "commit", "--allow-empty", "-qm", "local only");
  await git(work, "fetch", "-q", "origin");

  // extra remote on work for push/remotes coverage (push is a no-op there)
  bare = path.join(base, "bare.git");
  await git(base, "init", "--bare", "-q", "-b", "main", bare);
  await fs.writeFile(path.join(bare, "description"), "A bare test repo\n");
  await git(work, "push", "-q", bare, "main");
  await git(work, "remote", "add", "pushtarget", bare);
  await git(work, "fetch", "-q", "pushtarget");
});

afterAll(async () => {
  await fs.rm(base, { recursive: true, force: true });
});

describe("runGit", () => {
  it("resolves with stdout on success", async () => {
    const stdout = await runGit(work, ["rev-parse", "--abbrev-ref", "HEAD"]);
    expect(stdout.trim()).toBe("main");
  });

  it("rejects on a non-zero exit", async () => {
    expect(
      runGit(work, ["rev-parse", "--verify", "-q", "nope"]),
    ).rejects.toThrow();
  });
});

describe("tryGit", () => {
  it("resolves with combined output on success", async () => {
    const out = await tryGit(work, ["status"]);
    expect(out).toContain("On branch");
  });

  it("resolves with the error text instead of rejecting", async () => {
    const out = await tryGit(work, ["rev-parse", "--verify", "-q", "nope"]);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("branchRefs", () => {
  it("lists local branches", async () => {
    expect(await branchRefs(work)).toEqual(["feature/x", "main"]);
  });

  it("is empty for a repo with no branches", async () => {
    const empty = path.join(base, "empty.git");
    await git(base, "init", "--bare", "-q", empty);
    expect(await branchRefs(empty)).toEqual([]);
  });
});

describe("remoteBranchRefs", () => {
  it("lists remote branches without the symbolic HEAD", async () => {
    const refs = await remoteBranchRefs(work);
    expect(refs).toContain("origin/main");
    expect(refs).toContain("pushtarget/main");
    expect(refs.some((ref) => ref.endsWith("/HEAD"))).toBe(false);
  });
});

describe("remotes", () => {
  it("lists configured remotes", async () => {
    expect(await remotes(work)).toEqual(["origin", "pushtarget"]);
  });

  it("is empty when there are no remotes", async () => {
    const solo = path.join(base, "solo");
    await git(base, "init", "-q", solo);
    expect(await remotes(solo)).toEqual([]);
  });
});

describe("refExists", () => {
  it("is true for a resolvable ref and false otherwise", async () => {
    expect(await refExists(work, "refs/heads/main")).toBe(true);
    expect(await refExists(work, "refs/heads/nope")).toBe(false);
  });
});

describe("resolveRef", () => {
  it("returns HEAD's branch when it exists", async () => {
    expect(await resolveRef(work)).toBe("main");
  });

  it("falls back to the first branch when HEAD is dangling", async () => {
    // bare repo whose default branch (trunk) was never pushed
    const dangling = path.join(base, "dangling.git");
    await git(base, "init", "--bare", "-q", "-b", "trunk", dangling);
    await git(work, "push", "-q", dangling, "main");
    expect(await resolveRef(dangling)).toBe("main");
  });
});

describe("aheadBehind", () => {
  it("counts commits vs the upstream (origin first)", async () => {
    expect(await aheadBehind(work, "main")).toEqual({ ahead: 1, behind: 1 });
  });

  it("returns nulls when there is no upstream", async () => {
    const solo = path.join(base, "solo2");
    await git(base, "init", "-q", solo);
    expect(await aheadBehind(solo, "main")).toEqual({
      ahead: null,
      behind: null,
    });
  });
});

describe("log", () => {
  it("parses hash, date, author and subject", async () => {
    const entries = await log(work, "main");
    expect(entries.length).toBe(3);
    expect(entries[0].commitHash).toMatch(/^[0-9a-f]{40}$/);
    expect(entries[0].commitDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entries[0].commitAuthor).toBe("alice");
    expect(entries[0].commitMessage).toBe("local only");
  });

  it("preserves pipe characters in subjects", async () => {
    const entries = await log(work, "main");
    expect(entries[1].commitMessage).toBe("fix: a | b | pipes in subject");
  });

  it("honours the line limit and returns newest first", async () => {
    const entries = await log(work, "main", 2);
    expect(entries.length).toBe(2);
    expect(entries[0].commitMessage).toBe("local only");
  });

  it("is empty for a bogus branch or empty repo", async () => {
    expect(await log(work, "nope")).toEqual([]);
    const empty = path.join(base, "empty2.git");
    await git(base, "init", "--bare", "-q", empty);
    expect(await log(empty, "main")).toEqual([]);
    expect(await log(work, "")).toEqual([]);
  });
});

describe("readmeFor", () => {
  it("returns the root README, ignoring nested ones", async () => {
    expect(await readmeFor(work, "main")).toBe(REDME_TEXT);
  });

  it("is empty without a readme or an empty ref", async () => {
    const noreadme = path.join(base, "noreadme");
    await git(base, "init", "-q", "-b", "main", noreadme);
    await fs.writeFile(path.join(noreadme, "code.txt"), "x");
    await git(noreadme, "add", "-A");
    await git(
      noreadme,
      "-c",
      "user.email=a@b.c",
      "-c",
      "user.name=A",
      "commit",
      "-qm",
      "code only",
    );
    expect(await readmeFor(noreadme, "main")).toBe("");
    expect(await readmeFor(noreadme, "")).toBe("");
  });
});

describe("network commands", () => {
  it("fetchAll succeeds against the upstream", async () => {
    expect(await fetchAll(work)).not.toThrow;
    expect((await fetchAll(work)).length).toBeGreaterThanOrEqual(0);
  });

  it("pullFF fast-forwards without throwing", async () => {
    // a fresh clone that is purely behind (work itself has diverged, so an
    // ff-only pull would be rejected there)
    const behind = path.join(base, "behind");
    await git(base, "clone", "-q", upstream, behind);
    await git(work2, "commit", "--allow-empty", "-qm", "more remote");
    await git(work2, "push", "-q", "origin", "main");
    await git(behind, "fetch", "-q", "origin");
    expect(await aheadBehind(behind, "main")).toEqual({
      ahead: 0,
      behind: 1,
    });
    const out = await pullFF(behind);
    expect(out.length).toBeGreaterThan(0);
    expect(await aheadBehind(behind, "main")).toEqual({
      ahead: 0,
      behind: 0,
    });
  });

  it("push resolves with output even when rejected", async () => {
    // local main has diverged from origin/main: push is rejected, but the
    // wrapper must resolve with git's message instead of throwing
    const out = await push(work);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });
});
