// In-memory push policy for HTTP git access. Deliberately volatile: the
// defaults apply again on every server restart, so a temporarily opened
// break-glass permission always closes itself.
//
// Force pushes are governed per repo: a repo only accepts non-fast-forward
// updates while it is in the allow set (surfaced as a checkbox in the UI).
// The flag is passed per-push to the pre-receive hook as GIT_VIEWER_ALLOW_FORCE
// (see pushcheck.ts / git-http.ts). Regular push (rw) access is NOT governed
// here — that is purely the ACL (acl.yaml).

const forcePushAllowed = new Set<string>();

export const forcePushEnabled = (repo: string): boolean =>
  forcePushAllowed.has(repo);

export const setForcePushEnabled = (repo: string, value: boolean): boolean => {
  if (value) forcePushAllowed.add(repo);
  else forcePushAllowed.delete(repo);
  console.log(
    `[policy] force push to '${repo}' ${value ? "ALLOWED" : "denied"}`,
  );
  return forcePushAllowed.has(repo);
};
