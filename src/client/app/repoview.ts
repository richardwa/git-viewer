import { hbox, vbox, div, grid, fragment, signal, Signal } from "solid-vanilla";
import { HashLink, Panel, Title } from "./components";
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
) => {
  const branches = fragment().do(async (node) => {
    const list = await fetchJson("gitBranches", repo);
    const sorted = sortBranches(list);
    if (sorted.length && !selectedBranch.get()) {
      selectedBranch.set(sorted[0]);
    }
    node.inner(
      ...sorted.map((branch) =>
        HashLink("#")
          .css("font-weight", () =>
            selectedBranch.get() === branch ? "bold" : "normal",
          )
          .on("click", (event) => {
            event.preventDefault();
            selectedBranch.set(branch);
          })
          .inner(branch),
      ),
    );
  });
  return hbox().css("gap", "1rem").inner(Title().inner("Branches"), branches);
};

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

export const RepoView = (name: string, initialBranch?: string) => {
  const selectedBranch = signal<string | undefined>(initialBranch);

  return vbox()
    .css("gap", "1rem")
    .inner(
      HashLink("#/").inner("← all repos"),
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
