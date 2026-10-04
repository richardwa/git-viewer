import express, { Request, Response } from "express";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { configureRoutes } from "./routes";
import { createHttpRouter } from "./resources/git-http";
import { ensureTlsFiles } from "./resources/tls";

const app = express();
const port = process.env.PORT || 5177;

configureRoutes(app);

// Serve frontend from built Vite dist
const distPath = path.resolve(__dirname, "../../dist");
app.use(express.static(distPath));

// git smart HTTP for ACL-granted repos, at /<repo>.git (no prefix)
app.use(createHttpRouter());

// default to index.html for Router
app.use((req: Request, res: Response) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// HTTPS only, using TLS_CERT/TLS_KEY (or a generated self-signed pair).
const { cert, key } = ensureTlsFiles();
https
  .createServer({ cert: fs.readFileSync(cert), key: fs.readFileSync(key) }, app)
  .listen(port, () => {
    console.log(`Server running at https://localhost:${port} (HTTPS only)`);
  });
