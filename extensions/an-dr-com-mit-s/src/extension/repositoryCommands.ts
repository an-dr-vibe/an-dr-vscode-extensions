import { isGitRepository } from "@an-dr/commits-core/backend/utils/git";
import { getPathFromStr } from "@an-dr/commits-core/backend/utils/path";
import * as vscode from "vscode";

import { Config } from "@/config";
import { RepoManager } from "@/extension/repoManager";
import { GitStatusMonitor } from "@/gitStatusMonitor";
import { getSortedRepositoryPaths, showErrorMessage } from "@/utils";

/** Creates repository lifecycle handlers backed by the replacement's own state. */
export function createRepositoryCommands(
  repoManager: RepoManager,
  statusMonitor: GitStatusMonitor,
  config: Config
) {
  return {
    addGitRepository: async () => {
      const repo = await selectGitRepository(config);
      if (repo === null) {
        return;
      }
      repoManager.addRepo(repo, true);
      repoManager.sendRepos();
      statusMonitor.selectRepo(repo);
    },
    removeGitRepository: async () => {
      const paths = getSortedRepositoryPaths(repoManager.getRepos());
      const selected = await vscode.window.showQuickPick(
        paths.map((repo) => ({ label: repo, repo })),
        { placeHolder: vscode.l10n.t("Select a Git repository to remove") }
      );
      if (selected === undefined) {
        return;
      }
      repoManager.removeRepo(selected.repo);
      repoManager.sendRepos();
    }
  };
}

/** Prompts for and validates one Git repository folder. */
export async function selectGitRepository(config: Config) {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: vscode.l10n.t("Add Git Repository")
  });
  const repo = selected?.[0] ? getPathFromStr(selected[0].fsPath) : null;
  if (repo !== null && !(await isGitRepository(repo, config.gitPath()))) {
    await showErrorMessage(vscode.l10n.t("{0} is not a Git repository.", repo));
    return null;
  }
  return repo;
}
