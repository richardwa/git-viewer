import { Page, PageHeader } from "solid-vanilla-ui";
import { router } from "./routes";
import { Logo } from "./logo";
import { UserBox } from "./userbox";
import { NewRepoForm } from "./repolist";

export const App = () =>
  Page().inner(
    // logo on the left; new-repo button + user/change-user grouped right
    PageHeader(Logo(), NewRepoForm(), UserBox()),
    router.getRoot(),
  );
