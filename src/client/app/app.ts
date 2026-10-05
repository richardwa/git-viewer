import { div, hbox } from "solid-vanilla";
import { router } from "./routes";
import { Logo } from "./logo";
import { UserBox } from "./userbox";
import { NewRepoForm } from "./repolist";

export const App = () =>
  div()
    .css("width", "100%")
    .css("max-width", "100rem")
    .css("margin", "0 auto")
    .css("padding", "0.5rem")
    .inner(
      hbox()
        .css("align-items", "flex-start")
        // match the table cells' 1rem Pico padding so the logo text lines up
        .css("padding-left", "1rem")
        .css("padding-right", "1rem")
        .css("padding-top", "0.25rem")
        .css("padding-bottom", "0.75rem")
        .inner(
          Logo(),
          // new-repo button + username/change-user grouped, on the right
          hbox()
            .css("align-items", "center")
            .css("gap", "0.75rem")
            .css("margin-left", "auto")
            .inner(NewRepoForm(), UserBox()),
        ),
      router.getRoot(),
    );
