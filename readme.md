# Starter template

## Features
- solid vanilla framework
- client server bindings via typescript
- vite-express-plugin for seamless dev environment

### Client-Server bindings
just add to interface, and implement server side.  client shares types using fetchJson
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
