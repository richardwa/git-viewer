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
import { Button, HashLink, TextInput } from "./components";
import { RepoInfo, fetchJson } from "../../common/interface";

const td = () =>
  h("td")
    .css("padding", "0.4rem 0.75rem")
    .css("border-bottom", "1px solid #555")
    .css("vertical-align", "top")
    .css("max-width", "16rem");

const centerCell = (width: string, ...children: (BaseNode | string)[]) =>
  td()
    .css("text-align", "center")
    .css("width", width)
    .css("max-width", width)
    .inner(...children);

const headCell = (text: string, opts?: { width?: string; center?: boolean }) =>
  h("th")
    .css("text-align", opts?.center ? "center" : "left")
    .css("padding", "0.4rem 0.75rem")
    .css("border-bottom", "1px solid #888")
    .css("width", opts?.width ?? "auto")
    .inner(text);

const truncate = () =>
  div()
    .css("white-space", "nowrap")
    .css("overflow", "hidden")
    .css("text-overflow", "ellipsis");

const repoCell = (repo: RepoInfo) =>
  td()
    .css("width", "16rem")
    .css("overflow", "hidden")
    .inner(
      vbox()
        .css("gap", "0.15rem")
        .inner(
          truncate().inner(
            HashLink(`#/repo/${repo.name}`)
              .css("font-weight", "bold")
              .inner(repo.name),
          ),
          repo.description
            ? truncate()
                .css("color", "#999")
                .css("font-size", "0.85rem")
                .inner(repo.description)
            : fragment(),
        ),
    );

const commitsCell = (repo: RepoInfo) => {
  if (repo.ahead === null || repo.behind === null) {
    return centerCell("7rem", div().css("color", "#999").inner("n/a"));
  }
  return centerCell(
    "7rem",
    hbox()
      .css("gap", "0.5rem")
      .css("justify-content", "center")
      .inner(
        h("span").css("color", "#7bc47f").inner(`↑${repo.ahead}`),
        h("span").css("color", "#e57373").inner(`↓${repo.behind}`),
      ),
  );
};

const notesCell = (repo: RepoInfo) =>
  td()
    .css("min-width", "12rem")
    .css("max-width", "none")
    .inner(
      (repo.notes ? div() : div().css("color", "#999"))
        .css("white-space", "nowrap")
        .css("overflow", "hidden")
        .css("text-overflow", "ellipsis")
        .inner(repo.notes ?? "—"),
    );

const pushCell = (repo: RepoInfo, run: (repo: string) => Promise<void>) =>
  centerCell(
    "5rem",
    repo.ahead
      ? Button()
          .on("click", () => run(repo.name))
          .inner("push")
      : repo.ahead === null
        ? div().css("color", "#999").inner("—")
        : fragment(),
  );

const pullCell = (repo: RepoInfo, run: (repo: string) => Promise<void>) =>
  centerCell(
    "5rem",
    repo.behind
      ? Button()
          .on("click", () => run(repo.name))
          .inner("pull")
      : repo.behind === null
        ? div().css("color", "#999").inner("—")
        : fragment(),
  );

const status = signal<string>("");

const StatusLine = () =>
  div().watch(status, (node) =>
    node.inner(
      status.get()
        ? div().css("color", "#bbb").inner(status.get())
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

const row = (info: Signal<RepoInfo>) =>
  h("tr").watch(info, (node) => {
    const repo = info.get();
    node.inner(
      repoCell(repo),
      pushCell(repo, () => runGit(info, "push")),
      commitsCell(repo),
      pullCell(repo, () => runGit(info, "pull")),
      notesCell(repo),
    );
  });

const headerRow = h("tr").inner(
  ...(
    [
      ["Repositories", "16rem"],
      ["Push", "5rem"],
      ["Commits", "7rem"],
      ["Pull", "5rem"],
      ["Notes", undefined],
    ] as [string, string | undefined][]
  )
    .map(
      ([title, width]) =>
        [title, width, title !== "Repositories" && !!width] as [
          string,
          string | undefined,
          boolean,
        ],
    )
    .map(([title, width, center]) => headCell(title, { width, center })),
);

const repos = signal<RepoInfo[]>([]);

const RepoTable = () =>
  fragment().watch(repos, (node) => {
    const list = repos.get();
    if (!list.length) {
      node.inner(
        div()
          .css("color", "#999")
          .inner("no git repos found (set REPOS_DIR or create ~/repos)"),
      );
      return;
    }
    node.inner(
      h("table")
        .css("border-collapse", "collapse")
        .css("table-layout", "fixed")
        .css("width", "100%")
        .css("min-width", "45rem")
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
  const body = vbox()
    .css("gap", "0.75rem")
    .css("min-width", "20rem")
    .inner(
      div().css("font-weight", "bold").inner("new repo"),
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
          Button().on("click", close).inner("cancel"),
          Button().on("click", create).inner("create"),
        ),
    );
  dlg
    .css("border", "1px solid #666")
    .css("border-radius", "0.35rem")
    .css("padding", "1rem")
    .css("background-color", "#2a2a2a")
    .css("color", "inherit")
    .inner(body);
  return fragment().inner(
    dlg,
    Button()
      .on("click", () => (dlg.el as HTMLDialogElement).showModal())
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
