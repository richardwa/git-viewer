import { div } from "solid-vanilla";
import { Title } from "./components";
import { router } from "./routes";

export const App = () =>
  div()
    .css("padding", "0.5rem")
    .inner(
      Title()
        .css("font-weight", "bold")
        .css("margin-bottom", "1rem")
        .inner("Git Repos"),
      router.getRoot(),
    );
