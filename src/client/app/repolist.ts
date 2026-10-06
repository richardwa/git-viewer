import {
  BaseNode,
  hbox,
  vbox,
  div,
  fragment,
  h,
  signal,
  Signal,
} from "solid-vanilla";
import { Button, HashLink, TextInput, Panel } from "solid-vanilla-ui";
import { RepoInfo } from "../../common/interface";
import { fetchJson } from "../api";
import { PanelBox } from "./modal";

const muted = () => "var(--pico-muted-color)";

const td = (width?: string) => {
  const cell = h("td").css("vertical-align", "middle");
  return width ? cell.css("width", width).css("max-width", width) : cell;
};

const centerCell = (width: string, ...children: (BaseNode | string)[]) =>
  td(width)
    .css("text-align", "center")
    .inner(...children);

const truncate = () =>
  div()
    .css("white-space", "nowrap")
    .css("overflow", "hidden")
    .css("text-overflow", "ellipsis");

const repoCell = (repo: RepoInfo) =>
  td().inner(
    vbox()
      .css("gap", "0.15rem")
      .inner(
        truncate().inner(
          HashLink(`#/repo/${repo.name}`).inner(repo.name),
          repo.description
            ? h("span").css("color", muted()).inner(` — ${repo.description}`)
            : "",
        ),
        repo.notes
          ? truncate().css("color", muted()).inner(repo.notes)
          : fragment(),
      ),
  );

// Push/pull buttons carry the arrow + count (Pico's semantic ins/del
// colors); disabled when there is nothing to send/receive (0 changes), and a
// disabled "—" placeholder button when there is no upstream (keeps row
// heights uniform).
const pushCell = (repo: RepoInfo, run: (repo: string) => Promise<void>) =>
  centerCell(
    "10.5rem",
    repo.ahead === null
      ? Button()
          .attr("disabled", () => "disabled")
          .css("margin", "0")
          .css("width", "100%")
          .inner("—")
      : Button()
          .attr("disabled", () => (repo.ahead === 0 ? "disabled" : null))
          .css("margin", "0")
          .css("width", "100%")
          .on("click", () => run(repo.name))
          .inner(
            h("span")
              .css("color", "var(--pico-ins-color)")
              .inner(`↑${repo.ahead}`),
            " push",
          ),
  );

const pullCell = (repo: RepoInfo, run: (repo: string) => Promise<void>) =>
  centerCell(
    "10.5rem",
    repo.behind === null
      ? Button()
          .attr("disabled", () => "disabled")
          .css("margin", "0")
          .css("width", "100%")
          .inner("—")
      : Button()
          .attr("disabled", () => (repo.behind === 0 ? "disabled" : null))
          .css("margin", "0")
          .css("width", "100%")
          .on("click", () => run(repo.name))
          .inner(
            h("span")
              .css("color", "var(--pico-del-color)")
              .inner(`↓${repo.behind}`),
            " pull",
          ),
  );

const status = signal<string>("");

const StatusLine = () =>
  div().watch(status, (node) =>
    node.inner(
      status.get()
        ? div().css("color", muted()).inner(status.get())
        : fragment(),
    ),
  );

// Run push/pull on a repo, then refresh that row's state. On success the
// fresh ahead/behind counts (and notes) re-render via the row's signal.
const runGit = async (info: Signal<RepoInfo>, action: "push" | "pull") => {
  const repo = info.get();
  status.set(`${repo.name}: ${action}ing…`);
  try {
    const out = await fetchJson(
      action === "push" ? "gitPush" : "gitPull",
      repo.name,
    );
    status.set(`${repo.name} ${action} → ${out}`);
    const fresh = await fetchJson("repoInfo", repo.name);
    if (fresh) info.set(fresh, true);
  } catch (err) {
    status.set(`${repo.name} ${action} failed → ${err}`);
  }
};

// Guest rows get ahead/behind = null from the server, so push/pull render
// as disabled "—" placeholders — no extra branching needed.
const row = (info: Signal<RepoInfo>) =>
  h("tr").watch(info, (node) => {
    const repo = info.get();
    node.inner(
      repoCell(repo),
      pushCell(repo, () => runGit(info, "push")),
      pullCell(repo, () => runGit(info, "pull")),
    );
  });

// column titles; the push/pull columns are self-explanatory, no title
const headerRow = h("tr").inner(
  h("th").css("text-align", "left").css("width", "auto").inner("Repositories"),
  h("th").css("width", "10.5rem"),
  h("th").css("width", "10.5rem"),
);

const repos = signal<RepoInfo[]>([]);

const RepoTable = () =>
  fragment().watch(repos, (node) => {
    const list = repos.get();
    if (!list.length) {
      node.inner(
        div()
          .css("color", muted())
          .inner("no git repos found (set REPOS_DIR or create ~/repos)"),
      );
      return;
    }
    // Pico styles the table (borders, spacing); only layout here
    node.inner(
      h("table")
        .css("table-layout", "fixed")
        .css("width", "100%")
        .css("min-width", "48rem")
        .inner(headerRow, ...list.map((repo) => row(signal(repo)))),
    );
  });

// Reload the repo list from the server.
const refresh = async () => repos.set(await fetchJson("repos"), true);

// New-repo dialog: a modal <dialog> opened from the "new repo" button.
// Name only — description comes from the README once the repo has content.
export const NewRepoForm = () => {
  const name = signal<string>("");
  const dlg = h("dialog");
  const close = () => {
    (dlg.el as HTMLDialogElement).close();
    name.set("");
  };
  const create = async () => {
    if (!name.get().trim()) return;
    try {
      status.set(await fetchJson("createRepo", name.get()));
      close();
      await refresh();
    } catch (err) {
      status.set(`create failed → ${err}`);
    }
  };
  // Pico styles <dialog> and <article>; panel card with a ✕ close icon at
  // its top-right corner
  const body = PanelBox(
    close,
    Panel(),
    vbox()
      .css("gap", "0.75rem")
      .css("min-width", "20rem")
      .inner(
        h("strong").inner("new repo"),
        TextInput(name)
          .attr("placeholder", "repo name")
          .attr("autofocus", "")
          .on("keydown", (event) => {
            if (event.key === "Enter") create();
          }),
        hbox()
          .css("gap", "0.5rem")
          .css("justify-content", "flex-end")
          .inner(
            Button().attr("type", "submit").on("click", create).inner("create"),
          ),
      ),
  );
  dlg.inner(body);
  return fragment().inner(
    dlg,
    Button()
      .on("click", () => (dlg.el as HTMLDialogElement).showModal())
      .css("padding", "0.25rem 0.75rem")
      .css("font-size", "0.85rem")
      .css("margin", "0")
      .inner("new repo"),
  );
};

export const RepoList = () =>
  vbox()
    .css("gap", "1rem")
    .do(async (node) => {
      node.inner(RepoTable(), StatusLine());
      await refresh();
    });
