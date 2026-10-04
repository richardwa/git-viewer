// TLS material for both servers (production express and the vite dev server).
// Cert/key via TLS_CERT/TLS_KEY (PEM file paths); otherwise a self-signed pair
// is generated once via openssl and cached in the system temp dir.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

/** Ensure cert/key files exist; returns their paths. */
export const ensureTlsFiles = (): { cert: string; key: string } => {
  const cert = process.env.TLS_CERT;
  const key = process.env.TLS_KEY;
  if (cert && key) return { cert, key };
  const dir = path.join(os.tmpdir(), "git-viewer-tls");
  fs.mkdirSync(dir, { recursive: true });
  const certPath = path.join(dir, "cert.pem");
  const keyPath = path.join(dir, "key.pem");
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    const res = spawnSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-days",
        "3650",
        "-subj",
        "/CN=localhost",
        "-keyout",
        keyPath,
        "-out",
        certPath,
      ],
      { stdio: "inherit" },
    );
    if (res.error || res.status !== 0) {
      throw new Error(
        "cannot generate self-signed TLS cert (openssl failed); set TLS_CERT/TLS_KEY",
      );
    }
    console.log(
      `[tls] generated self-signed cert in ${dir} (not for production)`,
    );
  }
  return { cert: certPath, key: keyPath };
};
