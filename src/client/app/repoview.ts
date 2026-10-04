import {
  h,
  hbox,
  vbox,
  div,
  span,
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

const branchSelect = (
  repo: string,
  selectedBranch: Signal<string | undefined>,
) =>
  h("select")
    .css("padding", "0.25rem")
    .css("max-width", "10rem")
    .css("font-size", "1rem")
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
  h("code")
    .css("color", "#9cf")
    .css("font-family", "monospace")
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
        : div().css("color", "#999").inner("no README found"),
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
      const copyBtn = h("button")
        .attr("title", "copy clone URL")
        .css("cursor", "pointer")
        .css("background", "none")
        .css("border", "none")
        .css("color", "#9cf")
        .css("padding", "0")
        .on("click", async () => {
          await navigator.clipboard.writeText(url);
          copyBtn.inner("✓");
          setTimeout(() => copyBtn.inner("⧉"), 1200);
        });
      copyBtn.inner("⧉");
      node.inner(h("code").inner(`git clone ${url}`), copyBtn);
      node.el.style.display = "flex";
    })
    .css("color", "#9cf")
    .css("font-family", "monospace");

/** Break-glass checkbox: force pushes to this repo over http (in-memory, resets on restart). */
const forcePushToggle = (repo: string) => {
  const on = signal(false);
  const checkbox = h("input").attr("type", "checkbox");
  return hbox()
    .css("gap", "0.35rem")
    .css("align-items", "center")
    .do(async (node) => on.set(await fetchJson("forcePushEnabled", repo)))
    .watch(on, (node) =>
      node.inner(
        checkbox
          .attr("title", "allow force pushes over http (resets on restart)")
          .css("cursor", "pointer")
          .css("margin", "0")
          .on("change", async () =>
            on.set(
              await fetchJson(
                "setForcePushEnabled",
                repo,
                (checkbox.el as HTMLInputElement).checked,
              ),
            ),
          ),
        span().css("color", "#999").inner("allow force push"),
      ),
    );
};

export const RepoView = (name: string, initialBranch?: string) => {
  const selectedBranch = signal<string | undefined>(initialBranch);

  return vbox()
    .css("gap", "1rem")
    .inner(
      hbox()
        .css("gap", "1rem")
        .css("align-items", "center")
        .inner(HashLink("#").inner("← back")),
      hbox()
        .css("gap", "0.35rem")
        .css("align-items", "baseline")
        .inner(
          Title()
            .css("font-size", "1.4rem")
            .css("white-space", "nowrap")
            .inner(name),
          Title().css("font-size", "1.4rem").inner("@"),
          branchSelect(name, selectedBranch),
          forcePushToggle(name),
        ),
      upstreamUrl(name),
      cloneSection(name),
      commitLog(name, selectedBranch),
      readmeSection(name, selectedBranch),
    );
};
