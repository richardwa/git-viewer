import { BaseNode, hbox, vbox, div, fragment, h, signal } from "solid-vanilla";
import { Button, HashLink, Title } from "./components";
import { RepoInfo, fetchJson } from "../../common/interface";

const cell = (...children: (BaseNode | string)[]) =>
  h("td")
    .css("padding", "0.4rem 0.75rem")
    .css("border-bottom", "1px solid #555")
    .css("vertical-align", "top")
    .css("max-width", "16rem")
    .inner(...children);

const headCell = (text: string) =>
  h("th")
    .css("text-align", "left")
    .css("padding", "0.4rem 0.75rem")
    .css("border-bottom", "1px solid #888")
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
    return cell(div().css("color", "#999").inner("no upstream"));
  }
  return cell(
    hbox()
      .css("gap", "0.5rem")
      .inner(
        h("span").css("color", "#7bc47f").inner(`↑${repo.ahead}`),
        h("span").css("color", "#e57373").inner(`↓${repo.behind}`),
      ),
  );
};

const notesCell = (repo: RepoInfo) =>
  cell(
    repo.notes
      ? div().inner(repo.notes)
      : div().css("color", "#999").inner("—"),
  );

const actionCell = (repo: RepoInfo) =>
  cell(
    hbox().inner(
      Button()
        .on("click", async () => {
          status.set(`${repo.name}: pulling…`);
          status.set(
            `${repo.name} pull → ${await fetchJson("gitPull", repo.name)}`,
          );
        })
        .inner("pull"),
      Button()
        .on("click", async () => {
          status.set(`${repo.name}: pushing…`);
          status.set(
            `${repo.name} push → ${await fetchJson("gitPush", repo.name)}`,
          );
        })
        .inner("push"),
    ),
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
  ...["Repo", "Commits", "Notes", "Action"].map((title) => headCell(title)),
);

export const RepoList = () =>
  vbox()
    .css("gap", "1rem")
    .inner(
      Title().inner("Repositories"),
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
                  commitsCell(repo),
                  notesCell(repo),
                  actionCell(repo),
                ),
              ),
            ),
          StatusLine(),
        );
      }),
    );
