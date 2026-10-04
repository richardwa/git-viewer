import fs from "fs";
import path from "path";
import { defineConfig, ViteDevServer } from "vite";
import express from "express";
import { configureRoutes } from "./src/server/routes";

const expressPlugin = () => ({
  name: "vite-plugin-express",
  configureServer(server: ViteDevServer) {
    const app = express();
    configureRoutes(app);
    server.middlewares.use(app);
  },
});

// TLS_CERT + TLS_KEY (PEM files) => HTTPS dev server; otherwise plain HTTP.
// Build never requires TLS material.
const httpsOptions =
  process.env.TLS_CERT && process.env.TLS_KEY
    ? {
        key: fs.readFileSync(process.env.TLS_KEY),
        cert: fs.readFileSync(process.env.TLS_CERT),
      }
    : undefined;

export default defineConfig({
  root: "src/client",
  server: {
    port: 5177,
    host: true,
    allowedHosts: true,
    strictPort: true,
    https: httpsOptions,
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  plugins: [expressPlugin()],
});
