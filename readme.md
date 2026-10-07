# git-viewer

## Features

- solid vanilla framework
- client server bindings via typescript
- vite-express-plugin for seamless dev environment

### Client-Server bindings

just add to interface, and implement server side. client shares types using fetchJson

```ts
// interface
export type ServerApi = {
  gitBranches: () => Promise<string[]>;
  gitLogs: (branch: string, lines?: number) => Promise<GitLog[]>;
};

// server
const serverImpl: ServerApi = {
    gitBranches: () => ...,
    gitLogs: () => ...,
};

// client
import { fetchJson } from "../common/interface";
const logs = await fetchJson("gitLogs", branch, maxLines.get()); // input and return value are typed!

```

## Git HTTP access

All repos in `REPOS_DIR` are public — anonymous fetch/clone AND push over
smart HTTP, no credentials:

```bash
git clone http://localhost:5177/repo1.git
git push
```

Requests are proxied to `git http-backend`. The only restriction is the
force-push policy below.

## Force-push policy

Non-fast-forward updates are rejected by a per-repo `pre-receive` hook
(installed automatically). The single admin account (in `users.yaml`) can
flip a per-repo, in-memory "allow force push" toggle — via the checkbox in
the repo view, or `setForcePushEnabled` over the API. The toggle resets on
server restart.

## Admin login

`users.yaml` defines the one login in the system (used for the force-push
toggle only; everything else is anonymous) — only `admin`-group users can
sign in:

```yaml
users:
  alice:
    password: "secret"   # plain text, or "sha256:<hex>"
    groups: [admin]
```

Override the path with `USERS_FILE`.
## Build on commit

A repo whose pushed commit carries a `build.sh` (or `.build.sh`) at its root
is built automatically on push:

- The viewer's managed `post-receive` hook spools a job file into
  `<reposDir>/.build-queue/<time>-<repo>-<branch>-<hash6>.txt`. The file body
  is the state word: `queued` → `running` → `done` / `failed`. `done` job
  files are deleted once the build completes — the artifact run dir is the
  durable record (and the hook's dedupe checks it too, so re-pushing a
  built commit never re-triggers). `failed` job files are kept for
  inspection; delete one to retry the commit.
- Builds run **on the host**, not in the viewer container. Either run the
  daemon by hand:

  ```bash
  REPOS_DIR=/path/to/repos bun scripts/build-daemon.ts
  ```

  or install it as systemd user units (fswatcher + fallback timer) by copying
  the unit files (they already contain the full paths, `%h` = home):

  ```bash
  cp .deploy/gitviewer-build.{service,path,timer} \
    ~/.config/systemd/user/
  systemctl --user daemon-reload
  systemctl --user enable --now gitviewer-build.path gitviewer-build.timer
  ```

  The `.path` unit watches the queue and fires a oneshot service that drains
  it (`RUN_ONCE=1`); a 2-minute `.timer` is the safety net for missed
  inotify events. Journal: `journalctl --user -u gitviewer-build.service -f`.

  It claims one job at a time (single-threaded, oldest first), checks the
  commit's tree out to a temp worktree, and runs inside a podman container:

  ```bash
  podman run --rm -v <worktree>:/src -v <artdir>:/output <image> \
    sh -c 'cd /src && sh <script> > /output/build.log 2>&1'
  ```

- Artifacts land in `<reposDir>/<repo>.art/<branch>/<time>-<hash6>/` — a
  naming convention only; the dir is invisible to the repo list. Each run
  dir holds `build.log` and a `status` file.
- The repo view lists runs for the selected branch; click one to read its
  `build.log`.


