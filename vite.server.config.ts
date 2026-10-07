import path from "path";
import { defineConfig } from "vite";

// Server bundle config: bundles src/server/server.ts — dependencies included —
// into a single minified ESM file, server-bundle.min.js, runnable with bun/node.
// (node: builtins stay external automatically; no node_modules is shipped.)
// Build: bun run build:server
export default defineConfig({
  ssr: { noExternal: true },
  build: {
    ssr: "src/server/server.ts",
    outDir: path.resolve(__dirname, "build/server"),
    emptyOutDir: true,
    minify: true,
    target: "node20",
    rollupOptions: {
      output: {
        format: "esm",
        entryFileNames: "server-bundle.min.js",
        // ESM has no __dirname; shim it so server.ts's `__dirname/../../dist`
        // resolves to <bundleDir>/dist (bundle at <out>/server-bundle.min.js,
        // same relative shape as src/server/server.ts in dev).
        banner: [
          'import { fileURLToPath as __fileURLToPath } from "node:url";',
          'import * as __path from "node:path";',
          "const __filename = __fileURLToPath(import.meta.url);",
          'const __dirname = __path.join(__path.dirname(__filename), "src/server");',
        ].join("\n"),
      },
    },
  },
});
