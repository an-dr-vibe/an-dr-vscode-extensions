import * as vscode from "vscode";

import { findGitRepos } from "@/backend/queries/repoSearch";
import { getGitVersion } from "@/backend/utils/git";
import { config } from "@/config";
import { getVersionedStateKey } from "@/extension/constant/const";
import { initExtension } from "@/extension/initExtension";
import { logger } from "@/extension/utils/logger";
import { watchForRepos } from "@/extension/watchForRepos";
import { StatusBarItem } from "@/statusBarItem";

export async function activate(ctx: vscode.ExtensionContext) {
  logger.init(ctx);
  logger.log("Starting an-dr: Commits (MIT) ...");

  const gitPath = config.gitPath();
  const gitVersion = await getGitVersion(gitPath);
  if (gitVersion) {
    logger.log(`Using git (version: ${gitVersion})`);
  } else {
    logger.log("Failed to detect git version");
  }

  const statusBarItem = new StatusBarItem(ctx, config);
  statusBarItem.refresh();

  const paths = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  logger.log(`Searching workspace for new repos (${paths.length} folder(s)) ...`);
  const discovered = await findGitRepos(paths, gitPath, config.maxDepthOfRepoSearch());
  const savedExternal = ctx.workspaceState.get<string[]>(getVersionedStateKey("externalRepos"), []);
  const repoDirs = mergeStartupRepos(discovered, savedExternal);

  if (repoDirs.length > 0) {
    logger.log(`Found ${repoDirs.length} repo(s)`);
    initExtension(ctx, repoDirs, statusBarItem);
    logger.log("Started an-dr: Commits (MIT) - Ready to use!");
    return;
  }

  logger.log("No repos found");
  logger.log("Watching for new repos ...");
  ctx.subscriptions.push(watchForRepos(ctx, initExtension, statusBarItem));
}

export function deactivate() {}

/** Merges workspace discoveries with repositories persisted outside the workspace. */
export function mergeStartupRepos(discovered: string[], savedExternal: string[]) {
  return [...new Set([...discovered, ...savedExternal])];
}
