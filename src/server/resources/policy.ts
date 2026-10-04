// In-memory push policy for HTTP git access. Deliberately volatile: the
// defaults apply again on every server restart, so a temporarily opened
// break-glass permission always closes itself.
//
// The flag is injected per-request into `git http-backend` as GIT_CONFIG_*
// env vars (receive.denyNonFastForwards), which outranks repo config: while
// the toggle is off, force pushes are denied even in repos that enable them.

let forcePush = false;

export const forcePushEnabled = (): boolean => forcePush;

export const setForcePushEnabled = (value: boolean): boolean => {
  forcePush = !!value;
  console.log(`[policy] force push ${forcePush ? "ALLOWED" : "denied"}`);
  return forcePush;
};
