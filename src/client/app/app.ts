import { div } from "solid-vanilla";
import { router } from "./routes";

export const App = () => div().css("padding", "0.5rem").inner(router.getRoot());
