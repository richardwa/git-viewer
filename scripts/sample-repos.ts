// Generates sample git repos for development, all under the project's
// gitignored REPOS_DIR (./repos): bare "upstream" repos in repos/origins/ and
// bare serving repos in repos/ with origin remotes, README files,
// descriptions, feature branches, and ahead/behind divergence.
//
//   bun run samples          # (re)create all sample repos
//
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dir, "..");
const reposDir = process.env.REPOS_DIR
  ? path.resolve(projectRoot, process.env.REPOS_DIR)
  : path.join(projectRoot, "repos");
const originsDir = path.join(reposDir, "origins");

const git = (dir: string, args: string[]) =>
  execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Dev Sample",
      GIT_AUTHOR_EMAIL: "dev@example.com",
      GIT_COMMITTER_NAME: "Dev Sample",
      GIT_COMMITTER_EMAIL: "dev@example.com",
    },
  });

let tmpCounter = 0;
const tmpClone = (from: string) => {
  const dir = path.join(projectRoot, ".tmp-sample", `clone${tmpCounter++}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(path.dirname(dir), { recursive: true });
  git(projectRoot, ["clone", "--quiet", from, dir]);
  return dir;
};

/** Commit all files in a work clone and push to the given remote. */
const commitAndPush = (
  dir: string,
  branch: string,
  files: Record<string, string>,
  message: string,
  pushTo: string,
) => {
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "--allow-empty", "-m", message]);
  git(dir, ["push", "-q", pushTo, `HEAD:refs/heads/${branch}`]);
};

type Sample = {
  name: string;
  description?: string;
  /** branch -> file sets, committed in order (first is the default branch) */
  branches: Record<string, Record<string, string>[]>;
  /** local-only commits on top of the last pushed state (shows as ahead) */
  localCommits?: string[];
};

const samples: Sample[] = [
  {
    name: "calculator",
    description: "A tiny expression calculator library",
    branches: {
      main: [
        {
          "README.md":
            "# calculator\n\nTiny recursive-descent expression calculator.\n\n## Features\n\n- `+ - * /` and unary minus\n- tokenizer + grammar docs in `docs/`\n",
          "src/calc.ts": "export const evaluate = (expr: string) => 42;\n",
          "docs/grammar.md": "# Grammar\n\nexpr := term (('+'|'-') term)*\n",
        },
        {
          "src/calc.ts": "export const evaluate = (expr: string) => 0;\n",
        },
      ],
    },
    localCommits: ["fix operator precedence for unary minus"],
  },
  {
    name: "task-runner",
    description: "DAG-based task runner with retries",
    branches: {
      main: [
        {
          "README.md":
            "# task-runner\n\nDAG-based task runner with retries and per-task timeouts.\n",
          "src/runner.ts": "export const run = async () => {};\n",
        },
        { "src/runner.ts": "export const run = async () => ({ ok: true });\n" },
      ],
      "feature/json-output": [
        {
          "README.md":
            "# task-runner\n\nDAG-based task runner with retries and per-task timeouts.\n",
          "src/json.ts": "export const render = () => \"{}\";\n",
        },
      ],
    },
    localCommits: ["add per-task timeout support"],
  },
  {
    // deliberately minimal: no origin, no description -> exercises the
    // "n/a" ahead/behind cell and the unnamed-description cleanup
    name: "web-scraper",
    branches: {
      main: [
        {
          "README.md": "# web-scraper\n\nInitial scraper skeleton.\n",
          "src/scrape.ts": "export const scrape = async () => [];\n",
        },
      ],
    },
  },
];

// Wipe and recreate the sample sets
rmSync(originsDir, { recursive: true, force: true });
rmSync(path.join(projectRoot, ".tmp-sample"), { recursive: true, force: true });
mkdirSync(originsDir, { recursive: true });
mkdirSync(reposDir, { recursive: true });

// Dev default: also serve this project's own repo as a bare clone, so
// `bun run dev` shows the git-viewer source itself out of the box.
{
  const repo = path.join(reposDir, "git-viewer.git");
  rmSync(repo, { recursive: true, force: true });
  git(projectRoot, ["clone", "--bare", "--quiet", projectRoot, repo]);
  git(repo, [
    "fetch",
    "--quiet",
    "origin",
    "+refs/heads/*:refs/remotes/origin/*",
  ]);
  console.log("created git-viewer (this repo)");
}

for (const sample of samples) {
  // remove any previous copy of this sample (leave other repos alone)
  rmSync(path.join(originsDir, `${sample.name}.git`), {
    recursive: true,
    force: true,
  });
  rmSync(path.join(reposDir, `${sample.name}.git`), {
    recursive: true,
    force: true,
  });
  const branchNames = Object.keys(sample.branches);
  const main = branchNames[0];

  // 1. upstream bare repo, seeded from a work clone
  const origin = path.join(originsDir, `${sample.name}.git`);
  git(projectRoot, [
    "init",
    "--bare",
    "--quiet",
    "--initial-branch",
    main,
    origin,
  ]);
  const work = tmpClone(origin);
  for (const branch of branchNames) {
    for (const files of sample.branches[branch]) {
      if (branch !== main) git(work, ["checkout", "-q", "-b", branch]);
      commitAndPush(work, branch, files, `seed ${branch}`, "origin");
    }
  }

  // 2. serving repo: bare clone wired to the upstream (origin remote set up
  // automatically), then push local-only commits straight into it (ahead)
  const repo = path.join(reposDir, `${sample.name}.git`);
  git(projectRoot, ["clone", "--bare", "--quiet", origin, repo]);
  // bare clones don't create remote-tracking refs; fetch them so the UI can
  // compute ahead/behind against origin/<branch>
  git(repo, [
    "fetch",
    "--quiet",
    "origin",
    "+refs/heads/*:refs/remotes/origin/*",
  ]);
  for (const message of sample.localCommits ?? []) {
    commitAndPush(work, main, {}, message, repo);
  }

  // 3. a remote-only commit from a second clone (behind, unfetched)
  if (sample.name !== "web-scraper") {
    const other = tmpClone(origin);
    if (branchNames.length > 1) {
      git(other, ["checkout", "-q", branchNames[1]]);
      commitAndPush(
        other,
        branchNames[1],
        {},
        "upstream tweak on feature branch",
        "origin",
      );
      git(other, ["checkout", "-q", main]);
    }
    commitAndPush(other, main, {}, "upstream: update CI config", "origin");
  }
  // pick up the upstream commits into remote-tracking refs so main shows as
  // diverged (behind) without being merged — like an unfetched-pull state
  if (sample.name !== "web-scraper") {
    git(repo, ["fetch", "--quiet", "origin", "+refs/heads/*:refs/remotes/origin/*"]);
  }

  if (sample.description) {
    writeFileSync(path.join(repo, "description"), `${sample.description}\n`);
  }
  console.log(`created ${sample.name} (${branchNames.join(", ")})`);
}

rmSync(path.join(projectRoot, ".tmp-sample"), { recursive: true, force: true });