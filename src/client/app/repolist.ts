import { BaseNode, hbox, vbox, div, fragment, h, signal } from "solid-vanilla";
import { Button, HashLink } from "./components";
import { RepoInfo, fetchJson } from "../../common/interface";

const td = () =>
  h("td")
    .css("padding", "0.4rem 0.75rem")
    .css("border-bottom", "1px solid #555")
    .css("vertical-align", "top")
    .css("max-width", "16rem");

const cell = (...children: (BaseNode | string)[]) => td().inner(...children);

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

const repoCell = (repo: RepoInfo) =>
  cell(
    vbox()
      .css("gap", "0.15rem")
      .inner(
        HashLink(`#/repo/${repo.name}`)
          .css("font-weight", "bold")
          .inner(repo.name),
        repo.description
          ? div()
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
  cell(
    (repo.notes ? div() : div().css("color", "#999"))
      .css("white-space", "nowrap")
      .css("overflow", "hidden")
      .css("text-overflow", "ellipsis")
      .inner(repo.notes ?? "—"),
  );

const pushCell = (repo: RepoInfo) =>
  centerCell(
    "5rem",
    repo.ahead
      ? Button()
          .on("click", async () => {
            status.set(`${repo.name}: pushing…`);
            status.set(
              `${repo.name} push → ${await fetchJson("gitPush", repo.name)}`,
            );
          })
          .inner("push")
      : repo.ahead === null
        ? div().css("color", "#999").inner("—")
        : fragment(),
  );

const pullCell = (repo: RepoInfo) =>
  centerCell(
    "5rem",
    repo.behind
      ? Button()
          .on("click", async () => {
            status.set(`${repo.name}: pulling…`);
            status.set(
              `${repo.name} pull → ${await fetchJson("gitPull", repo.name)}`,
            );
          })
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

const headerRow = h("tr").inner(
  ...(
    [
      ["Repositories", undefined],
      ["Push", "5rem"],
      ["Commits", "7rem"],
      ["Pull", "5rem"],
      ["Notes", undefined],
    ] as [string, string | undefined][]
  ).map(([title, width]) => headCell(title, { width, center: !!width })),
);

export const RepoList = () =>
  vbox()
    .css("gap", "1rem")
    .inner(
      fragment().do(async (node) => {
        const repos = await fetchJson("repos");
        if (!repos.length) {
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
            .inner(
              headerRow,
              ...repos.map((repo) =>
                h("tr").inner(
                  repoCell(repo),
                  pushCell(repo),
                  commitsCell(repo),
                  pullCell(repo),
                  notesCell(repo),
                ),
              ),
            ),
          StatusLine(),
        );
      }),
    );
