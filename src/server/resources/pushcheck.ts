// Force-push policy enforcement via a pre-receive hook.
//
// Why a hook: the ref-update commands at the front of a receive-pack request
// name the *new* commit, but its objects arrive inside the packfile in the
// same request — so ancestry cannot be checked before receive-pack runs. The
// pre-receive hook runs after the pack is indexed (quarantined objects are
// visible through GIT_OBJECT_DIRECTORY/alternates), which is exactly the
// right checkpoint.
//
// The in-memory break-glass toggle is passed per-push through the CGI
// environment as GIT_VIEWER_ALLOW_FORCE (see git-http.ts / policy.ts).
import fs from "node:fs/promises";
import path from "node:path";

const MARKER = "# git-viewer-managed-hook";

const hookScript = () => `#!/bin/sh
${MARKER}
# Installed by git-viewer. Rejects force pushes (non-fast-forward ref
# updates) unless the break-glass toggle is on, which arrives per-push as
# GIT_VIEWER_ALLOW_FORCE=true in this hook's environment.
iszero() { case "$1" in ''|*[!0]*) return 1 ;; *) return 0 ;; esac; }
while read old new ref; do
  if iszero "$old" || iszero "$new"; then continue; fi
  if [ "$GIT_VIEWER_ALLOW_FORCE" = "true" ]; then continue; fi
  if ! git merge-base --is-ancestor "$old" "$new" 2>/dev/null; then
    echo "git-viewer: non-fast-forward update of '$ref' rejected (force push is currently disabled)" >&2
    exit 1
  fi
done
exit 0
`;

/**
 * Make sure the repo's pre-receive hook enforces the force-push policy.
 * Installs the hook when missing; refreshes it when it carries our marker.
 * A pre-existing hook without the marker is left untouched (the toggle then
 * does not apply to that repo).
 */
export const ensurePushHook = async (gitDir: string): Promise<void> => {
  const hookPath = path.join(gitDir, "hooks", "pre-receive");
  try {
    const existing = await fs.readFile(hookPath, "utf8");
    if (!existing.includes(MARKER)) return; // user-managed hook
  } catch {
    // hook missing: install below
  }
  await fs.mkdir(path.join(gitDir, "hooks"), { recursive: true });
  await fs.writeFile(hookPath, hookScript(), { mode: 0o755 });
};
