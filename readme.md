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