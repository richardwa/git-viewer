// ACL for git smart-HTTP access, loaded from a YAML file (acl.yaml, or the
// path in $ACL_FILE). The file is re-read whenever its mtime changes, so
// edits apply immediately without a server restart.
//
// Access model (public by default):
//   owner: me                   # has rw on ALL repos, incl. private ones
//   private:                    # exact repo names only the owner can access
//     - secret-one
//     - secret-two
//   users:                      # any logged-in user: rw on public repos
//     <name>:
//       password: "secret"      # plain text, or "sha256:<hex digest>"
//       repos:                  # OPTIONAL extra grants (e.g. private repos)
//         - "internal-*:ro"
//   anonymous:                  # optional extra grants for unauthenticated
//     repos:                    # requests (e.g. rw on a public repo)
//       - "deploy-*:rw"
//
// Public repos (not in the `private` list): anonymous read-only, any logged-in
// user read+write. Private repos: owner only, plus explicit per-user grants.
// Grant patterns are globs: '*' matches any run of characters.
// Read (fetch/clone) needs "ro" or "rw"; push needs "rw".
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { reposDir, repoName, isValidRepoName } from "./git";

export type Perm = "ro" | "rw";

type UserConfig = { password?: string; repos?: string[] };
type AclConfig = {
  owner?: string;
  private?: string[];
  users?: Record<string, UserConfig>;
  anonymous?: { repos?: string[] };
};

export const aclFile = (): string =>
  process.env.ACL_FILE
    ? path.resolve(process.env.ACL_FILE)
    : path.join(process.cwd(), "acl.yaml");

let cache: { mtimeMs: number; config: AclConfig } | null = null;

const loadAcl = async (): Promise<AclConfig> => {
  try {
    const stat = await fs.stat(aclFile());
    if (cache?.mtimeMs === stat.mtimeMs) return cache.config;
    const text = await fs.readFile(aclFile(), "utf8");
    const config = (parse(text) ?? {}) as AclConfig;
    cache = { mtimeMs: stat.mtimeMs, config };
    return config;
  } catch (error) {
    console.error(`[acl] cannot read ${aclFile()}: ${error}`);
    return {};
  }
};

/** Split a grant entry "<name-or-glob>[:ro|:rw]"; no suffix means rw. */
const splitGrant = (entry: string): { pattern: string; perm: Perm } => {
  const lower = entry.toLowerCase();
  if (lower.endsWith(":ro")) return { pattern: entry.slice(0, -3), perm: "ro" };
  if (lower.endsWith(":rw")) return { pattern: entry.slice(0, -3), perm: "rw" };
  return { pattern: entry, perm: "rw" };
};

const globRegExp = (pattern: string): RegExp =>
  new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
  );

/** Best permission granted to a repo by a grant list (rw wins over ro); null when none. */
const grantsMatch = (grants: string[], repo: string): Perm | null => {
  let perm: Perm | null = null;
  for (const entry of grants) {
    const { pattern, perm: granted } = splitGrant(entry.trim());
    if (granted === "rw" || perm === null) {
      if (globRegExp(pattern).test(repo)) perm = granted;
    }
  }
  return perm;
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

/** Validate a Basic auth header; returns the user name, or null when the
 * header is absent or the credentials are wrong (callers must treat a present
 * header with null result as invalid credentials, not as anonymous). */
export const authenticate = async (
  authHeader: string | undefined,
): Promise<string | null> => {
  if (!authHeader?.startsWith("Basic ")) return null;
  const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
  const sep = decoded.indexOf(":");
  if (sep === -1) return null;
  const [name, password] = [decoded.slice(0, sep), decoded.slice(sep + 1)];
  const { users } = await loadAcl();
  const cfg = users?.[name];
  return cfg && passwordMatches(cfg.password, password) ? name : null;
};

/** True when the repo is in the `private` list (exact names, public by default). */
const isPrivateRepo = async (repo: string): Promise<boolean> => {
  const { private: privateList } = await loadAcl();
  return (privateList ?? []).some((entry) => entry.trim() === repo);
};

/** Explicit extra grants declared for a user (optional). */
const userGrants = async (user: string): Promise<string[]> => {
  const { users } = await loadAcl();
  return users?.[user]?.repos ?? [];
};

/** Permission for a repo (user may be null = anonymous); null when denied.
 * Public repos: anonymous read-only, any logged-in user read+write.
 * Private repos: owner (always rw) plus explicit grants only. */
export const permissionFor = async (
  user: string | null,
  repo: string,
): Promise<Perm | null> => {
  const acl = await loadAcl();
  if (user) {
    if (user === acl.owner) return "rw";
    if (!(await isPrivateRepo(repo))) return "rw"; // public: any user can push
    const grants = [
      ...(await userGrants(user)),
      ...(acl.anonymous?.repos ?? []),
    ];
    return grants.length ? grantsMatch(grants, repo) : null;
  }
  if (!(await isPrivateRepo(repo))) return "ro"; // public by default
  return acl.anonymous?.repos ? grantsMatch(acl.anonymous.repos, repo) : null;
};

/** Repos reachable over HTTP by at least one principal (for UI hints): all
 * public repos plus any repo covered by the owner, a user or anonymous
 * grant. */
export const httpRepos = async (): Promise<string[]> => {
  const acl = await loadAcl();
  let entries: string[] = [];
  try {
    entries = await fs.readdir(reposDir);
  } catch {
    return [];
  }
  const repos = entries
    .filter((name) => !name.startsWith(".") && isValidRepoName(name))
    .map(repoName);
  const grants = [
    ...(acl.anonymous?.repos ?? []),
    ...Object.values(acl.users ?? {}).flatMap((user) => user.repos ?? []),
  ];
  const flags = await Promise.all(
    repos.map(
      async (repo) =>
        !(await isPrivateRepo(repo)) ||
        acl.owner != null ||
        grantsMatch(grants, repo) !== null,
    ),
  );
  return repos.filter((_, i) => flags[i]);
};
