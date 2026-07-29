import * as vscode from "vscode";

import { findGitRepos } from "@/backend/queries/repoSearch";
import { getGitVersion } from "@/backend/utils/git";
import { config } from "@/config";
import { initExtension } from "@/extension/initExtension";
import { logger } from "@/extension/utils/logger";
import { watchForRepos } from "@/extension/watchForRepos";
import { StatusBarItem } from "@/statusBarItem";

/** Start Git-backed services once VS Code activates the extension. */
export async function createCore(context: vscode.ExtensionContext) {
  logger.init(context);
  logger.log("Starting an-dr: Commits (MIT) ...");

  const gitPath = config.gitPath();
  const gitVersion = await getGitVersion(gitPath);
  logger.log(gitVersion ? `Using git (version: ${gitVersion})` : "Failed to detect git version");

  const statusBarItem = new StatusBarItem(context, config);
  statusBarItem.refresh();
  const paths = (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
  const repoDirs = await findGitRepos(paths, gitPath, config.maxDepthOfRepoSearch());
  if (repoDirs.length > 0) {
    initExtension(context, repoDirs, statusBarItem);
    logger.log("Started an-dr: Commits (MIT) - Ready to use!");
    return;
  }

  logger.log("No repos found; watching for new repos ...");
  context.subscriptions.push(watchForRepos(context, initExtension, statusBarItem));
}
