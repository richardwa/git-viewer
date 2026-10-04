import { div, hbox } from "solid-vanilla";
import { router } from "./routes";
import { Logo } from "./logo";
import { NewRepoForm } from "./repolist";

export const App = () =>
  div()
    .css("width", "100%")
    .css("max-width", "100rem")
    .css("margin", "0 auto")
    .css("padding", "0.5rem")
    .inner(
      hbox()
        .css("align-items", "center")
        .css("justify-content", "space-between")
        .css("padding", "0.25rem 0 0.75rem")
        .inner(Logo(), NewRepoForm()),
      router.getRoot(),
    );
