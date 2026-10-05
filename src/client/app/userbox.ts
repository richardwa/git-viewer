import { div, fragment, hbox } from "solid-vanilla";
import { apiPath, fetchJson } from "../../common/interface";
import { ClickLink } from "./components";

// Basic auth has no real logout; the server's /api/switchUser always answers
// 401 with the login realm. XHR with credentials passed via open() (a fetch
// Authorization header bypasses the browser's auth cache and is ignored) makes
// the browser overwrite its cached credentials with the bogus pair, so the
// reload is 401'd and the browser shows its native login dialog again.
const reauth = () => {
  const xhr = new XMLHttpRequest();
  xhr.open("POST", `${apiPath}/switchUser`, true, "signout", "signout");
  // XHR 401s don't trigger the native dialog; a top-level navigation to /login
  // (always a 401 challenge while unauthenticated) does.
  xhr.onloadend = () => (location.href = "/login");
  xhr.send();
};

// Top-right corner: the logged-in user name (empty/sign-in link when anonymous).
export const UserBox = () =>
  div()
    .css("display", "flex")
    .css("align-items", "center")
    .css("gap", "0.75rem")
    .css("font-size", "0.8rem")
    .css("color", "#666")
    .do(async (node) => {
      const user = await fetchJson("currentUser");
      node.inner(
        hbox()
          .css("gap", "0.75rem")
          .css("align-items", "baseline")
          .inner(
            user ? div().inner(user) : fragment(),
            ClickLink()
              .on("click", reauth)
              .inner(user ? "change user" : "sign in"),
          ),
      );
    });
