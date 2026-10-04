import fs from "fs";
import path from "path";
import { defineConfig, ViteDevServer } from "vite";
import express from "express";
import { configureRoutes } from "./src/server/routes";
import { ensureTlsFiles } from "./src/server/resources/tls";

const expressPlugin = () => ({
  name: "vite-plugin-express",
  configureServer(server: ViteDevServer) {
    const app = express();
    configureRoutes(app);
    server.middlewares.use(app);
  },
});

// HTTPS everywhere: the dev server uses the same TLS material as production
// (TLS_CERT/TLS_KEY, or a generated self-signed pair).
const tls = ensureTlsFiles();

export default defineConfig({
  root: "src/client",
  server: {
    port: 5177,
    host: true,
    allowedHosts: true,
    strictPort: true,
    https: { key: fs.readFileSync(tls.key), cert: fs.readFileSync(tls.cert) },
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  plugins: [expressPlugin()],
});
