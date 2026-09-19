import { HashRouter, div } from "solid-vanilla";
import { RepoList } from "./repolist";
import { RepoView } from "./repoview";

const root = div()
  .css("height", "100%")
  .css("width", "100%")
  .attr("id", "router");

const router = new HashRouter(root);

router.addRoute("/", () => RepoList());
router.addRoute("/repo/:name", (params) => RepoView(params.name));

export { router };
