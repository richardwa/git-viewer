import { h } from "solid-vanilla";
import {
  Page,
  PageHeader,
  UserBox,
  clearCredentials,
  userName,
  LoginPanel,
  ClickLink,
  Panel,
} from "solid-vanilla-ui";
import { router } from "./routes";
import { Logo } from "./logo";
import { NewRepoForm } from "./repolist";
import { asDialog, PanelBox } from "./modal";

// Everything is public — no login needed to browse or push. The header
// shows an admin sign-in link (opening the login overlay) for users who
// want to control the force-push toggle; once signed in, the UserBox with
// logout takes its place.

// Modal login overlay: the LoginPanel with a ✕ close icon at its top-right
// corner, opened from the header's "admin sign in" link. LoginPanel reloads
// the page on success.
const LoginDialog = () => {
  const dlg = h("dialog");
  const close = () => asDialog(dlg).close();
  // LoginPanel's return type is BaseNode (inner's return); restore the
  // fluent Panel type so we can restyle it for the dialog
  const panel = LoginPanel() as unknown as ReturnType<typeof Panel>;
  dlg.inner(
    PanelBox(close, panel.css("margin", "0").css("min-width", "18rem")),
  );
  return dlg;
};

export const App = () => {
  const dlg = LoginDialog();
  return Page().inner(
    PageHeader(
      Logo(),
      NewRepoForm(),
      userName.get()
        ? UserBox()
        : ClickLink()
            .on("click", () => asDialog(dlg).showModal())
            .inner("admin sign in"),
    ),
    dlg,
    router.getRoot(),
  );
};
