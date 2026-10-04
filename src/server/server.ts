import express, { Request, Response } from "express";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { configureRoutes } from "./routes";
import { createHttpRouter } from "./resources/git-http";

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

// TLS_CERT + TLS_KEY (PEM files) => HTTPS; otherwise plain HTTP.
const tlsCert = process.env.TLS_CERT;
const tlsKey = process.env.TLS_KEY;

if (tlsCert && tlsKey) {
  https
    .createServer(
      { cert: fs.readFileSync(tlsCert), key: fs.readFileSync(tlsKey) },
      app,
    )
    .listen(port, () => {
      console.log(`Server running at https://localhost:${port}`);
    });
} else {
  if (tlsCert || tlsKey) {
    console.warn(
      "[tls] TLS_CERT and TLS_KEY must both be set for HTTPS — serving plain HTTP",
    );
  }
  app.listen(port, () => {
    console.log(
      `Server running at http://localhost:${port} (no TLS_CERT/TLS_KEY)`,
    );
  });
}
