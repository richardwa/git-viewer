// User accounts, loaded from users.yaml (or the path in $USERS_FILE).
// The file is re-read whenever its mtime changes, so edits apply immediately
// without a server restart.
//
// Only users in the "admin" group may log in: the login gates the per-repo
// force-push toggle (API and UI). Everything else — UI browsing, git
// fetch/clone/push, repo creation — needs no credentials at all.
//
// Groups are a list; today only "admin" is checked (and there is a single
// admin user) — the format is ready for more groups later.
//
//   users:
//     alice:
//       password: "secret"     # plain text, or "sha256:<hex>"
//       groups: [admin]
//
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

type UserConfig = { password?: string; groups?: string[] };
type UsersConfig = { users?: Record<string, UserConfig> };

export const usersFile = (): string =>
  process.env.USERS_FILE
    ? path.resolve(process.env.USERS_FILE)
    : path.join(process.cwd(), "users.yaml");

let cache: { mtimeMs: number; config: UsersConfig } | null = null;

const loadUsers = async (): Promise<UsersConfig> => {
  try {
    const stat = await fs.stat(usersFile());
    if (cache?.mtimeMs === stat.mtimeMs) return cache.config;
    const text = await fs.readFile(usersFile(), "utf8");
    const config = (parse(text) ?? {}) as UsersConfig;
    cache = { mtimeMs: stat.mtimeMs, config };
    return config;
  } catch (error) {
    console.error(`[users] cannot read ${usersFile()}: ${error}`);
    return {};
  }
};

const digest = (value: string): Buffer =>
  crypto.createHash("sha256").update(value).digest();

const passwordMatches = (
  stored: string | undefined,
  given: string,
): boolean => {
  if (!stored) return false;
  const expected = stored.startsWith("sha256:")
    ? Buffer.from(stored.slice(7), "hex")
    : digest(stored);
  if (expected.length !== 32) return false;
  return crypto.timingSafeEqual(expected, digest(given));
};

/** True when the login is an admin-group user with the right password.
 *  Only the "admin" group is checked today; more groups may follow. */
export const verifyAdmin = async (
  login: string,
  password: string,
): Promise<boolean> => {
  const cfg = (await loadUsers()).users?.[login];
  return (
    !!cfg &&
    passwordMatches(cfg.password, password) &&
    (cfg.groups ?? []).includes("admin")
  );
};
