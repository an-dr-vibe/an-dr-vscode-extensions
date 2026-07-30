import * as vscode from "vscode";

import { AvatarManager } from "@/avatarManager";
import { checkoutBranch, createBranch, deleteBranch, renameBranch } from "@/backend/actions/branch";
import {
  checkoutCommit,
  cherrypickCommit,
  resetToCommit,
  revertCommit
} from "@/backend/actions/commit";
import { mergeBranch, mergeCommit } from "@/backend/actions/merge";
import { addTag, deleteTag, pushTag } from "@/backend/actions/tag";
import { GitClient } from "@/backend/gitClient";
import { commitDetails } from "@/backend/queries/commitDetails";
import { GitFileChangeType } from "@/backend/types";
import { abbrevCommit } from "@/backend/utils/string";
import { Config } from "@/config";
import { DataSource } from "@/dataSource";
import { encodeDiffDocUri } from "@/diffDocProvider";
import { copyToClipboard } from "@/extension/utils/clipboard";
import { logger } from "@/extension/utils/logger";
import { ExtensionState } from "@/extensionState";
import { GitStatusMonitor } from "@/gitStatusMonitor";
import { RepoFileWatcher } from "@/repoFileWatcher";
import { RequestMessage, ResponseMessage } from "@/types";
import {
  archive,
  getRelativeTimeDiff,
  openExtensionSettings,
  openExternalUrl,
  openFile,
  viewFileAtRevision,
  viewScm,
  viewSubmoduleDiff
} from "@/utils";

import { RepoManager } from "./repoManager";
import { WebviewBridge } from "./webviewBridge";

function viewDiff(
  repo: string,
  commitHash: string,
  oldFilePath: string,
  newFilePath: string,
  type: GitFileChangeType
): Promise<boolean> {
  const abbrevHash = abbrevCommit(commitHash);
  const pathComponents = newFilePath.split("/");
  const title =
    pathComponents[pathComponents.length - 1] +
    " (" +
    (type === "A"
      ? vscode.l10n.t("Added in {0}", abbrevHash)
      : type === "D"
        ? vscode.l10n.t("Deleted in {0}", abbrevHash)
        : abbrevCommit(commitHash) + "^ ↔ " + abbrevCommit(commitHash)) +
    ")";
  return new Promise<boolean>((resolve) => {
    vscode.commands
      .executeCommand(
        "vscode.diff",
        encodeDiffDocUri(repo, oldFilePath, commitHash + "^"),
        encodeDiffDocUri(repo, newFilePath, commitHash),
        title,
        { preview: true }
      )
      .then(() => resolve(true))
      .then(() => resolve(false));
  });
}

export function registerMessageHandlers(
  bridge: WebviewBridge,
  deps: {
    config: Config;
    gitClient: GitClient;
    dataSource: DataSource;
    gitStatusMonitor: GitStatusMonitor;
    repoManager: RepoManager;
    extensionState: ExtensionState;
    avatarManager: AvatarManager;
    repoFileWatcher: RepoFileWatcher;
    /** Runs a remote operation, supplied by the caller that owns askpass. */
    runRemoteOperation: (operation: "fetch" | "pull" | "push") => Promise<void>;
  }
) {
  const {
    config,
    gitClient,
    dataSource,
    gitStatusMonitor,
    repoManager,
    extensionState,
    avatarManager,
    repoFileWatcher
  } = deps;

  let currentRepo: string | null = null;

  function registerAction<T extends RequestMessage["command"]>(
    command: T,
    handler: (msg: Extract<RequestMessage, { command: T }>) => Promise<void>
  ) {
    bridge.onMessage(command, async (msg) => {
      let status: string | null = null;
      try {
        await handler(msg);
      } catch (e: unknown) {
        status = e instanceof Error ? e.message : String(e);
      }
      bridge.post({ command, status } as ResponseMessage);
    });
  }

  // --- Action handlers ---

  registerAction("addTag", (msg) => addTag(gitClient.getInstance(), msg));
  registerAction("deleteTag", (msg) => deleteTag(gitClient.getInstance(), msg));
  registerAction("pushTag", (msg) => pushTag(gitClient.getInstance(), msg));
  registerAction("createBranch", (msg) => createBranch(gitClient.getInstance(), msg));
  registerAction("deleteBranch", (msg) => deleteBranch(gitClient.getInstance(), msg));
  registerAction("renameBranch", (msg) => renameBranch(gitClient.getInstance(), msg));
  registerAction("checkoutBranch", (msg) => checkoutBranch(gitClient.getInstance(), msg));
  registerAction("checkoutCommit", (msg) => checkoutCommit(gitClient.getInstance(), msg));
  registerAction("cherrypickCommit", (msg) => cherrypickCommit(gitClient.getInstance(), msg));
  registerAction("revertCommit", (msg) => revertCommit(gitClient.getInstance(), msg));
  registerAction("resetToCommit", (msg) => resetToCommit(gitClient.getInstance(), msg));
  registerAction("mergeBranch", (msg) => mergeBranch(gitClient.getInstance(), msg));
  registerAction("mergeCommit", (msg) => mergeCommit(gitClient.getInstance(), msg));

  // --- Query handlers ---

  bridge.onMessage("loadCommits", async (msg) => {
    bridge.post({
      command: "loadCommits",
      ...(await dataSource.loadCommits({
        branchName: msg.branchName,
        maxCommits: msg.maxCommits,
        showRemoteBranches: msg.showRemoteBranches,
        hard: msg.hard,
        dateType: config.dateType(),
        showUncommittedChanges: config.showUncommittedChanges()
      }))
    });
  });

  bridge.onMessage("loadBranches", async (msg) => {
    bridge.post({
      command: "loadBranches",
      ...(await dataSource.loadBranches({
        showRemoteBranches: msg.showRemoteBranches,
        hard: msg.hard,
        currentRepo: currentRepo!,
        gitPath: config.gitPath()
      }))
    });
  });

  bridge.onMessage("repoInProgress", async () => {
    bridge.post({
      command: "repoInProgress",
      state: currentRepo === null ? null : await dataSource.getRepoInProgress(currentRepo)
    });
  });

  bridge.onMessage("commitDetails", async (msg) => {
    bridge.post({
      command: "commitDetails",
      ...(await commitDetails(gitClient.getInstance(), {
        commitHash: msg.commitHash,
        dateType: config.dateType()
      }))
    });
  });

  // --- Infrastructure handlers ---

  bridge.onMessage("selectRepo", (msg) => {
    if (msg.repo === currentRepo) {
      return;
    }
    currentRepo = msg.repo;
    gitClient.setRepo(msg.repo);
    gitStatusMonitor.selectRepo(msg.repo);
    repoFileWatcher.start(msg.repo);
  });

  // The toolbar buttons reuse the same handlers as the palette commands, so
  // credentials, error reporting, and status refresh behave identically.
  bridge.onMessage("remoteOperation", async (msg) => {
    // The operation names a handler to invoke, so it is checked against the
    // known set rather than trusted; the type is erased over the message port.
    if (msg.operation !== "fetch" && msg.operation !== "pull" && msg.operation !== "push") {
      logger.log(`Ignoring unknown remote operation: ${String(msg.operation)}`);
      return;
    }
    await deps.runRemoteOperation(msg.operation);
  });

  bridge.onMessage("loadRepos", async (msg) => {
    if (!msg.check || !(await repoManager.checkReposExist())) {
      bridge.post({
        command: "loadRepos",
        repos: repoManager.getRepos(),
        lastActiveRepo: extensionState.getLastActiveRepo()
      });
    }
  });

  bridge.onMessage("fetchAvatar", (msg) => {
    avatarManager.fetchAvatarImage(msg.email, msg.repo, msg.commits);
  });

  bridge.onMessage("saveRepoState", (msg) => {
    repoManager.setRepoState(msg.repo, msg.state);
  });

  bridge.onMessage("copyToClipboard", async (msg) => {
    bridge.post({
      command: "copyToClipboard",
      type: msg.type,
      success: await copyToClipboard(msg.data)
    });
  });

  bridge.onMessage("viewDiff", async (msg) => {
    bridge.post({
      command: "viewDiff",
      success: await viewDiff(msg.repo, msg.commitHash, msg.oldFilePath, msg.newFilePath, msg.type)
    });
  });

  function registerUtilityAction<
    T extends Exclude<RequestMessage["command"], "getRelativeTimeDiff">
  >(command: T, handler: (msg: Extract<RequestMessage, { command: T }>) => Promise<string | null>) {
    bridge.onMessage(command, async (msg) => {
      bridge.post({ command, error: await handler(msg) } as ResponseMessage);
    });
  }

  registerUtilityAction("archive", (msg) => archive(msg.repo, msg.ref, dataSource));
  registerUtilityAction("viewSubmoduleDiff", (msg) =>
    viewSubmoduleDiff(msg.repo, msg.fromHash, msg.toHash, msg.filePath, dataSource)
  );
  registerUtilityAction("viewScm", () => viewScm());
  registerUtilityAction("viewFileAtRevision", (msg) =>
    viewFileAtRevision(msg.repo, msg.hash, msg.filePath)
  );
  registerUtilityAction("openFile", (msg) =>
    openFile(msg.repo, msg.filePath, msg.hash, dataSource)
  );
  registerUtilityAction("openExternalUrl", (msg) => openExternalUrl(msg.url, msg.type));
  registerUtilityAction("openExtensionSettings", () => openExtensionSettings());
  bridge.onMessage("getRelativeTimeDiff", (msg) => {
    bridge.post({
      command: "getRelativeTimeDiff",
      value: getRelativeTimeDiff(msg.unixTimestamp)
    });
  });

  return {
    onPanelShown: () => {
      currentRepo = null;
    }
  };
}
