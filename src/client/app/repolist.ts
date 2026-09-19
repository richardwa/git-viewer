import { hbox, vbox, div, fragment } from "solid-vanilla";
import { HashLink, Title } from "./components";
import { RepoInfo, fetchJson } from "../../common/interface";
import { formatDate } from "../../common/util";

const repoRow = (repo: RepoInfo) =>
  vbox()
    .css("gap", "0.25rem")
    .inner(
      HashLink(`#/repo/${repo.name}`)
        .css("font-size", "1.1rem")
        .css("font-weight", "bold")
        .inner(repo.name),
      repo.description ? div().inner(repo.description) : fragment(),
      repo.lastCommitDate
        ? div()
            .css("color", "#999")
            .inner(`last commit: ${formatDate(repo.lastCommitDate)}`)
        : fragment(),
    );

export const RepoList = () =>
  vbox()
    .css("gap", "1rem")
    .inner(
      Title().inner("Repositories"),
      fragment().do(async (node) => {
        const repos = await fetchJson("repos");
        node.inner(
          ...repos.map((repo) =>
            hbox().css("gap", "1rem").inner(repoRow(repo)),
          ),
        );
        if (!repos.length) {
          node.inner(
            div()
              .css("color", "#999")
              .inner(`no git repos found (set REPOS_DIR or create ~/repos)`),
          );
        }
      }),
    );
