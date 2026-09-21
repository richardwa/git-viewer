import { div } from "solid-vanilla";
import { router } from "./routes";

export const App = () =>
  div()
    .css("width", "100%")
    .css("max-width", "100rem")
    .css("margin", "0 auto")
    .css("padding", "0.5rem")
    .inner(router.getRoot());
