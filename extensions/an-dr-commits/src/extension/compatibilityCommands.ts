import * as vscode from "vscode";

import { GitClient } from "@/backend/gitClient";
import { isGitRepository } from "@/backend/utils/git";
import { Config } from "@/config";
import { EXTENSION_ID, EXTENSION_NAME } from "@/extension/constant/const";

import { RepoManager } from "./repoManager";

/** Registers independently authored implementations of the public command families. */
export function registerCompatibilityCommands(
  context: vscode.ExtensionContext,
  repoManager: RepoManager,
  gitClient: GitClient,
  config: Config,
  version: string
) {
  async function getSelectedRepository(): Promise<string | null> {
    const repository = repoManager.repositoryStatus.get().repository;
    if (repository !== null) {
      return repository;
    }
    const repositories = Object.keys(repoManager.getRepos());
    if (repositories.length === 1) {
      return repositories[0];
    }
    await vscode.window.showErrorMessage(vscode.l10n.t("Select a Git repository first."));
    return null;
  }

  async function runRemoteAction(action: "fetch" | "pull" | "push") {
    const repository = await getSelectedRepository();
    if (repository === null) {
      return;
    }
    try {
      gitClient.setRepo(repository);
      await gitClient.getInstance().raw([action]);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await vscode.window.showErrorMessage(vscode.l10n.t("Git {0} failed: {1}", action, detail));
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(`${EXTENSION_ID}.addGitRepository`, async () => {
      const selected = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: vscode.l10n.t("Add Git Repository")
      });
      const directory = selected?.[0]?.fsPath;
      if (!directory) {
        return;
      }
      if (!(await isGitRepository(directory, config.gitPath()))) {
        await vscode.window.showErrorMessage(
          vscode.l10n.t("The selected folder is not a Git repository.")
        );
        return;
      }
      if (repoManager.addRepo(directory)) {
        repoManager.sendRepos();
      }
    }),
    vscode.commands.registerCommand(`${EXTENSION_ID}.removeGitRepository`, async () => {
      const repository = await getSelectedRepository();
      if (repository === null) {
        return;
      }
      repoManager.removeRepo(repository);
      repoManager.selectRepo(null);
      repoManager.sendRepos();
    }),
    vscode.commands.registerCommand(`${EXTENSION_ID}.fetch`, () => runRemoteAction("fetch")),
    vscode.commands.registerCommand(`${EXTENSION_ID}.pull`, () => runRemoteAction("pull")),
    vscode.commands.registerCommand(`${EXTENSION_ID}.push`, () => runRemoteAction("push")),
    vscode.commands.registerCommand(`${EXTENSION_ID}.version`, () =>
      vscode.window.showInformationMessage(`${EXTENSION_NAME} ${version}`)
    ),
    vscode.commands.registerCommand(`${EXTENSION_ID}.openFile`, (uri: vscode.Uri) => {
      if (uri instanceof vscode.Uri) {
        return vscode.window.showTextDocument(uri);
      }
      return vscode.commands.executeCommand("workbench.action.files.openFile");
    })
  );
}
