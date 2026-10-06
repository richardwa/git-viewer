import {
  hbox,
  vbox,
  div,
  span,
  grid,
  fragment,
  h,
  signal,
  Signal,
} from "solid-vanilla";
import { Panel, Button } from "solid-vanilla-ui";
import { GitLog, fetchJson } from "../../common/interface";
import { formatDate } from "../../common/util";
import { Markdown } from "./markdown";

const preferredBranches = ["main", "master", "develop", "trunk"];

const sortBranches = (branches: string[]) => {
  const rank = (branch: string) => {
    const i = preferredBranches.indexOf(branch);
    return i === -1 ? preferredBranches.length : i;
  };
  return [...branches].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
};

const logRow = (log: GitLog) =>
  fragment().inner(
    div().inner(log.commitHash.slice(0, 10)),
    div().inner(formatDate(log.commitDate)),
    div().inner(log.commitAuthor),
    div().inner(log.commitMessage),
  );

// Pico styles <select> and <option> natively
const branchSelect = (
  repo: string,
  selectedBranch: Signal<string | undefined>,
) =>
  h("select")
    .css("max-width", "10rem")
    .on("change", (event) => selectedBranch.set(event.target.value))
    .do(async (node) => {
      const sorted = sortBranches(await fetchJson("gitBranches", repo));
      if (sorted.length && !selectedBranch.get()) {
        selectedBranch.set(sorted[0]);
      }
      node.inner(
        ...sorted.map((branch) =>
          h("option").attr("value", branch).inner(branch),
        ),
      );
      (node.el as HTMLSelectElement).value = selectedBranch.get() ?? "";
    });

const upstreamUrl = (repo: string) =>
  hbox()
    .css("gap", "0.35rem")
    .css("align-items", "center")
    .do(async (node) => {
      const url = await fetchJson("gitRemoteUrl", repo);
      if (url) node.inner(`upstream: ${url}`);
      else node.el.style.display = "none";
    });

const commitLog = (repo: string, selectedBranch: Signal<string | undefined>) =>
  vbox().inner(
    grid("repeat(4,max-content)")
      .css("column-gap", "1rem")
      .watch(selectedBranch, async (node) => {
        const branch = selectedBranch.get();
        if (branch) {
          const logs = await fetchJson("gitLogs", repo, branch, 20);
          node.inner(
            ...logs.map((log) =>
              node.memo(`${branch} ${log.commitHash}`, () => logRow(log)),
            ),
          );
        }
      }),
  );

const readmeSection = (
  repo: string,
  selectedBranch: Signal<string | undefined>,
) =>
  Panel().watch(selectedBranch, async (node) => {
    const branch = selectedBranch.get();
    const markdown = branch ? await fetchJson("readme", repo, branch) : "";
    node.inner(
      markdown
        ? Markdown(markdown)
        : div()
            .css("color", "var(--pico-muted-color)")
            .inner("no README found"),
    );
  });

const cloneSection = (repo: string) =>
  hbox()
    .css("gap", "0.35rem")
    .css("align-items", "center")
    .do(async (node) => {
      const repos = await fetchJson("publicRepos");
      if (!repos.includes(repo)) return;
      const url = `${window.location.protocol}//${window.location.host}/${repo}.git`;
      node.inner(`git clone ${url}`);
      node.el.style.display = "flex";
    });

/** Break-glass checkbox: force pushes to this repo over http (in-memory, resets on restart). */
const forcePushToggle = (repo: string) => {
  const on = signal(false);
  const set = async (value: boolean) =>
    on.set(await fetchJson("setForcePushEnabled", repo, value));
  return hbox()
    .css("gap", "0.35rem")
    .css("align-items", "center")
    .do(async (node) => on.set(await fetchJson("forcePushEnabled", repo)))
    .watch(on, (node) =>
      node.inner(
        // whole button is clickable; the checkbox mirrors the state.
        // Created inside the watch so each render gets a fresh checkbox —
        // a node shared across renders is unmounted with the replaced button.
        Button()
          .cn("outline")
          .attr("title", "allow force pushes over http (resets on restart)")
          .on("click", async () => set(!on.get()))
          .inner(
            h("input")
              .attr("type", "checkbox")
              .attr("checked", on.get() ? "" : null),
            span().inner("allow force push"),
          ),
      ),
    );
};

export const RepoView = (name: string, initialBranch?: string) => {
  const selectedBranch = signal<string | undefined>(initialBranch);

  return vbox()
    .css("gap", "1rem")
    .inner(
      hbox()
        .css("justify-content", "flex-start")
        .css("align-items", "center")
        .css("gap", "0.35rem")
        .inner(
          branchSelect(name, selectedBranch),
          forcePushToggle(name),
          // Pico headings give the title size without custom font-size rules
          h("h3").css("margin", "0").css("white-space", "nowrap").inner(name),
        ),
      upstreamUrl(name),
      cloneSection(name),
      commitLog(name, selectedBranch),
      readmeSection(name, selectedBranch),
    );
};
