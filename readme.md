# Starter template

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

## Read-only git HTTP access

All repos in `REPOS_DIR` can be cloned/fetched over HTTP while pushing stays
disabled — except those listed in `PRIVATE_REPOS`:

```bash
PRIVATE_REPOS=secret-repo bun run start
git clone http://localhost:5177/git/repo1.git   # read-only
```

Requests are proxied to `git http-backend`; any receive-pack (push) request
gets a 403. Repos named in `PRIVATE_REPOS` are not served at all.
