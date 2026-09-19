# AGENTS.md — solid-vanilla-starter

Guidance for coding agents working in this repository.

## What this is

A starter template for **solid-vanilla**, a tiny (~200 lines) SolidJS-like reactive UI framework that manipulates the DOM directly (no virtual DOM, no JSX, no build-time compiler). The starter pairs it with:

- **Vite** for the client dev server/build (`src/client`)
- **Express** for the API server (`src/server`)
- **TypeScript** end-to-end, with typed client↔server bindings (`src/common`)
- **Bun** as package manager / runtime for scripts

## General code rules

- **Keep files under 300 lines.** When a file approaches the limit, break it up logically:
  - Split UI pages/features into their own module under `src/client/app/` (one component/feature per file, like `gitdemo.ts`).
  - Extract shared pieces into `components.ts` (or a new shared module) rather than duplicating.
  - Split server logic into `src/server/resources/<topic>.ts` files by domain.
  - Shared types/utilities go in `src/common/`.
  - Split by responsibility first (render vs. data vs. helpers), not arbitrarily by line count.

## Commands

```bash
bun install        # install dependencies
bun run dev        # vite dev server on http://localhost:5177 (express API mounted via plugin)
bun run build      # prettier format + tsc typecheck + vite build → ./dist
bun run start      # build, then serve dist + API from src/server/server.ts (port 5177)
bun run format     # prettier over *.json, *.ts, ./src
```

There are no tests in the starter. `tsc` (run via `bun run build`) is the type gate — keep it passing.

## Project layout

```
src/
  client/
    index.html / index.ts / index.css   # entry: render(App()) into #app
    app/
      app.ts          # root component
      routes.ts       # HashRouter route table
      components.ts   # shared UI components
      gitdemo.ts      # example page (git log viewer)
  server/
    server.ts          # express app: static dist + API, SPA fallback
    routes.ts          # auto-generates POST /api/<fn> routes from ServerApi impl
    resources/git.ts   # server-side data functions
  common/
    interface.ts       # ServerApi type + fetchJson client helper (shared by both sides)
    util.ts            # shared utilities
vite.config.ts         # root=src/client, express middleware plugin, port 5177
```

## How solid-vanilla works

Everything is a fluent chainable `RNode` wrapping a real DOM element (`node.el`). Key API (all from `"solid-vanilla"`):

- **Creation**: `h(tag)` for any tag; helpers `div()`, `span()`, `button()`, `grid(cols)`, `hbox()`, `vbox()`, `fragment()` (display:contents).
- **Children**: `node.inner(...children)` — accepts `RNode`, strings, signals, or arrays; replaces children and re-runs on subsequent calls.
- **Attributes/props**: `.attr(key, value)`; classes via `.cn(name)`; inline styles via `.css(name, value)`.
- **Events**: `.on(event, handler)`.
- **Side effects / async**: `.do(fn)` runs immediately with the node; inside `do(async (node) => ...)` you can await and then call `node.inner(...)` to fill content.
- **Reactivity**: `signal(initial)` returns a `Signal` with `.get()` / `.set(v)`. `node.watch(signalOrSignals, (node) => ...)` re-runs `fn` whenever the signal(s) change (auto-cleanup on unmount). Attribute/css values can also be a function or a signal for live updates.
- **Memoization**: inside a `watch`, `node.memo(key, () => RNode)` reuses the child keyed by `key` instead of recreating it — use for list rows (key by stable id).
- **Routing**: `new HashRouter(rootNode)`, `router.addRoute(path, componentFn)`, mount with `router.getRoot()`, navigate via `router.navigate(path)`.
- **Lifecycle**: `.onUnmount(fn)`; `node.unmount()` removes element and disposes watchers/intervals (`node.setInterval` is auto-cleaned).
- **Entry**: `render(element, ...nodes)` mounts nodes into a DOM element.

Example component:

```ts
const counter = () => {
  const count = signal(0);
  return button()
    .on("click", () => count.set(count.get() + 1))
    .watch(count, (node) => node.inner(`count: ${count.get()}`));
};
```

## Client–server bindings (the core pattern)

1. Add a method to `ServerApi` in `src/common/interface.ts` (typed params + return).
2. Implement it in `src/server` (e.g. in `resources/`) and add it to `serverImpl` in `src/server/routes.ts`. A `POST /api/<name>` route is generated automatically.
3. Call it from the client with `fetchJson("name", ...args)` — arguments and return type are fully typed. `fetchJson` passes the args array as the JSON body; the route spreads them into the function.

Never hand-write fetch calls or route paths; always go through `ServerApi`/`fetchJson` so types stay shared.

## Conventions & gotchas

- No JSX — build UI with function calls only. Prefer the helper components (`vbox`, `hbox`, `grid`, `fragment`) over raw `h()` where they fit.
- Styling is inline via `.css(...)`; shared constants (like `gap`) live in solid-vanilla's base components. Keep global styles minimal in `index.css`.
- The dev server port is fixed at 5177 (`strictPort: true`) in both `vite.config.ts` and `src/server/server.ts` — keep them in sync.
- `fragment()` renders a real `<div style="display:contents">`, so it's safe for list children.
- Signals: `.set()` skips triggering when the value is identical (use `set(v, true)` to force). `signal()` without a type arg infers; optional values use `signal<string>()`.
- Async data fetching belongs in `.do(async (node) => ...)` or `.watch([...], async (node) => ...)`, writing results with `node.inner(...)`.
- Prettier runs before every build (`prebuild`); match its output (no semicolons style per config — check `.prettierrc` defaults used by the repo).
- The client uses hash-based routing; `src/server/server.ts` has an index.html fallback for any path, so deep links work.

## Agent workflow

- Read existing components (`src/client/app/*.ts`) before writing new ones to match the established fluent style.
- After changes, run `bun run build` to verify types and formatting.
- Keep `src/common/interface.ts` as the single source of truth for the API surface.
