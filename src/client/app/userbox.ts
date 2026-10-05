import { div, fragment, hbox } from "solid-vanilla";
import { apiPath, fetchJson } from "../../common/interface";
import { ClickLink } from "./components";

// Basic auth has no real logout; this makes the browser overwrite its cached
// credentials with a deliberately bogus pair, so the next request is 401'd and
// the browser shows its native login dialog again (sign-in / user switch).
const reauth = async () => {
  await fetch(`${apiPath}/repos`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa("change-user:change-user")}` },
  }).catch(() => {});
  location.reload();
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
