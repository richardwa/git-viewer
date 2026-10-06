import {
  LoginPanel,
  Page,
  PageHeader,
  UserBox,
  clearCredentials,
  isGuest,
  userName,
  ClickLink,
} from "solid-vanilla-ui";
import { router } from "./routes";
import { Logo } from "./logo";
import { NewRepoForm } from "./repolist";

// Guest header action: sign in link (clears the guest session and reloads
// into the login panel).
const SignIn = () =>
  ClickLink()
    .on("click", () => {
      clearCredentials();
      location.reload();
    })
    .inner("sign in");

// Logged in: full app. Guest (anon login): read-only — no new-repo button.
// Logged out: the login panel (repo names stay browsable via RepoView's
// login gate).
export const App = () =>
  userName.get()
    ? Page().inner(
        PageHeader(
          Logo(),
          ...(isGuest() ? [SignIn()] : [NewRepoForm(), UserBox()]),
        ),
        router.getRoot(),
      )
    : LoginPanel(true);
