import {
  h,
  hbox,
  vbox,
  div,
  grid,
  fragment,
  signal,
  Signal,
} from "solid-vanilla";
import { HashLink, Panel, Title, Button } from "./components";
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

const branchesBar = (
  repo: string,
  selectedBranch: Signal<string | undefined>,
) =>
  hbox()
    .css("gap", "0.5rem")
    .css("align-items", "center")
    .inner(
      Title().inner("Branches"),
      h("select")
        .css("padding", "0.25rem")
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
        }),
    );

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
        : div().css("color", "#999").inner("no README found"),
    );
  });

const cloneSection = (repo: string) =>
  div()
    .do(async (node) => {
      const repos = await fetchJson("publicRepos");
      if (!repos.includes(repo)) return;
      const url = `${window.location.protocol}//${window.location.host}/${repo}.git`;
      node.inner(h("code").inner(`git clone ${url}`));
      node.el.style.display = "block";
    })
    .css("color", "#9cf")
    .css("font-family", "monospace");

/** Break-glass checkbox: force pushes to this repo over http (in-memory, resets on restart). */
const forcePushToggle = (repo: string) => {
  const on = signal(false);
  return hbox()
    .css("gap", "0.5rem")
    .css("align-items", "center")
    .do(async (node) => on.set(await fetchJson("forcePushEnabled", repo)))
    .watch(on, (node) =>
      node.inner(
        Button()
          .css("cursor", "pointer")
          .css("background-color", on.get() ? "#a33" : "#424242")
          .css("border", `1px solid ${on.get() ? "#c55" : "#666"}`)
          .on("click", async () =>
            on.set(await fetchJson("setForcePushEnabled", repo, !on.get())),
          )
          .inner(on.get() ? "force push: allowed" : "force push: denied"),
      ),
    );
};

export const RepoView = (name: string, initialBranch?: string) => {
  const selectedBranch = signal<string | undefined>(initialBranch);

  return vbox()
    .css("gap", "1rem")
    .inner(
      HashLink("#/").inner("← all repos"),
      hbox()
        .css("gap", "1rem")
        .css("align-items", "center")
        .inner(cloneSection(name), forcePushToggle(name)),
      Title()
        .css("font-size", "1.4rem")
        .watch(selectedBranch, (node) =>
          node.inner(
            selectedBranch.get() ? `${name} @ ${selectedBranch.get()}` : name,
          ),
        ),
      branchesBar(name, selectedBranch),
      commitLog(name, selectedBranch),
      readmeSection(name, selectedBranch),
    );
};
