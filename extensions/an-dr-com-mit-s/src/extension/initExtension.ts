import * as path from "path";

import { GitClient, gitClientFactory } from "@an-dr/commits-core/backend/gitClient";
import { findGitRepos } from "@an-dr/commits-core/backend/queries/repoSearch";
import * as vscode from "vscode";

import { createAskpass } from "@/askpass/askpass";
import { promptForCredential } from "@/askpass/credentialPrompt";
import { AvatarManager } from "@/avatarManager";
import { DataSource } from "@/dataSource";
import { DiffDocProvider } from "@/diffDocProvider";
import { EXTENSION_ID, EXTENSION_NAME, getCommandId } from "@/extension/constant/const";
import { createMaxDepthTracker } from "@/extension/maxDepthTracker";
import { registerMessageHandlers } from "@/extension/messageHandler";
import { registerPublicCommands } from "@/extension/publicCommands";
import { createRemoteCommands, runRemoteOperationWithGit } from "@/extension/remoteOperations";
import { createRepoManager, RepoManager } from "@/extension/repoManager";
import { createRepositoryCommands } from "@/extension/repositoryCommands";
import { buildExtensionUri } from "@/extension/utils/hostPaths";
import { logger } from "@/extension/utils/logger";
import { config, vscodeConfigPort } from "@/extension/utils/vscodeConfigPort";
import { vscodeWatcherPort, vscodeWorkspacePort } from "@/extension/utils/vscodeHostPorts";
import { createVscodeStoragePort } from "@/extension/utils/vscodeStoragePort";
import { WebviewBridge, webviewBridgeFactory } from "@/extension/webviewBridge";
import { createWebviewPanel, WebviewPanel } from "@/extension/webviewPanel";
import { ExtensionState } from "@/extensionState";
import { GitStatusMonitor } from "@/gitStatusMonitor";
import { InlineBlameController } from "@/inlineBlame";
import { RepoFileWatcher } from "@/repoFileWatcher";
import { StatusBarItem } from "@/statusBarItem";
import { showErrorMessage } from "@/utils";

export type InitExtension = typeof initExtension;

function registerViewCommand(
  ctx: vscode.ExtensionContext,
  repoManager: RepoManager,
  extensionState: ExtensionState,
  avatarManager: AvatarManager,
  gitClient: GitClient,
  dataSource: DataSource,
  gitStatusMonitor: GitStatusMonitor,
  remoteCommands: ReturnType<typeof createRemoteCommands>
) {
  let currentPanel: WebviewPanel | undefined;
  ctx.subscriptions.push(
    vscode.commands.registerCommand(getCommandId("view"), () => {
      if (currentPanel) {
        currentPanel.reveal(vscode.window.activeTextEditor?.viewColumn);
        return;
      }

      const vsPanel = vscode.window.createWebviewPanel(
        EXTENSION_ID,
        EXTENSION_NAME,
        vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [
            buildExtensionUri(ctx.extensionPath, "media"),
            buildExtensionUri(ctx.extensionPath, "out")
          ]
        }
      );

      let bridge!: WebviewBridge;
      const repoFileWatcher = new RepoFileWatcher(vscodeWatcherPort, () => {
        if (vsPanel.visible) {
          bridge.post({ command: "refresh" });
        }
      });
      bridge = webviewBridgeFactory(vsPanel.webview, repoFileWatcher);
      avatarManager.registerBridge(bridge.post.bind(bridge));

      const { onPanelShown } = registerMessageHandlers(bridge, {
        config,
        gitClient,
        dataSource,
        gitStatusMonitor,
        repoManager,
        extensionState,
        avatarManager,
        repoFileWatcher,
        runRemoteOperation: (operation) => remoteCommands[operation]()
      });

      currentPanel = createWebviewPanel({
        panel: vsPanel,
        bridge,
        config,
        repoFileWatcher,
        extensionPath: ctx.extensionPath,
        extensionState,
        avatarManager,
        repoManager,
        onDispose: () => {
          currentPanel = undefined;
        },
        onPanelShown
      });
    })
  );
}

export function initExtension(
  ctx: vscode.ExtensionContext,
  repos: string[],
  statusBarItem: StatusBarItem
) {
  try {
    logger.log(`Initializing extension with ${repos.length} repo(s)`);

    const extensionState = new ExtensionState(createVscodeStoragePort(ctx));
    const avatarManager = new AvatarManager(config.gitPath, extensionState);

    ctx.subscriptions.push(
      vscode.commands.registerCommand(getCommandId("clearAvatarCache"), () => {
        avatarManager.clearCache();
      })
    );

    const gitClient = gitClientFactory(extensionState.getLastActiveRepo() ?? "", config.gitPath());
    const dataSource = new DataSource(gitClient, config.gitPath);
    ctx.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(
        DiffDocProvider.scheme,
        new DiffDocProvider(gitClient.getInstance)
      )
    );

    const maxDepth = createMaxDepthTracker(config.maxDepthOfRepoSearch());
    const repoManager = createRepoManager(extensionState, statusBarItem, config);
    repoManager.setRepos(repos);
    repoManager.sendRepos();
    void repoManager.checkReposExist();
    const gitStatusMonitor = new GitStatusMonitor(
      dataSource,
      extensionState,
      repoManager,
      statusBarItem,
      vscodeWorkspacePort
    );
    ctx.subscriptions.push(gitStatusMonitor);
    ctx.subscriptions.push(new InlineBlameController(dataSource, repoManager, config));
    // Git prompts for credentials through this endpoint; without it an
    // authenticated fetch, pull, or push would block on a terminal the
    // extension host does not have.
    let askpassEnv: Readonly<Record<string, string>> = {};
    void createAskpass(ctx.extensionPath, promptForCredential).then(
      (askpass) => {
        askpassEnv = askpass.env;
        ctx.subscriptions.push(askpass);
      },
      (error: unknown) => {
        logger.log(`Askpass unavailable: ${error instanceof Error ? error.message : error}`);
      }
    );

    // The toolbar and the palette share one set of handlers, so both paths
    // prompt for credentials and report failures identically.
    const remoteCommands = createRemoteCommands(
      gitStatusMonitor,
      () => askpassEnv,
      runRemoteOperationWithGit(config.gitPath)
    );
    registerViewCommand(
      ctx,
      repoManager,
      extensionState,
      avatarManager,
      gitClient,
      dataSource,
      gitStatusMonitor,
      remoteCommands
    );
    ctx.subscriptions.push(
      ...registerPublicCommands(
        ctx,
        {
          ...createRepositoryCommands(repoManager, gitStatusMonitor, config),
          ...remoteCommands
        },
        dataSource,
        new Set(["view", "clearAvatarCache"])
      )
    );

    const gitWatcher = vscode.workspace.createFileSystemWatcher("**/.git");
    ctx.subscriptions.push(
      gitWatcher,
      gitWatcher.onDidCreate((uri) => {
        const repoPath = path.dirname(uri.fsPath);
        if (repoManager.addRepo(repoPath)) {
          repoManager.sendRepos();
        }
      }),
      gitWatcher.onDidDelete((uri) => {
        const repoPath = path.dirname(uri.fsPath);
        if (repoManager.removeReposWithinFolder(repoPath)) {
          repoManager.sendRepos();
        }
      }),
      vscodeWorkspacePort.onDidChangeRootPaths(async (change) => {
        if (change.added.length > 0) {
          const repoDirs = await findGitRepos(
            [...change.added],
            config.gitPath(),
            config.maxDepthOfRepoSearch()
          );
          for (const repo of repoDirs) {
            repoManager.addRepo(repo);
          }
          if (repoDirs.length > 0) {
            repoManager.sendRepos();
          }
        }
        if (change.removed.length > 0) {
          let changes = false;
          for (const folder of change.removed) {
            if (repoManager.removeReposWithinFolder(folder)) {
              changes = true;
            }
          }
          if (changes) {
            repoManager.sendRepos();
          }
        }
      }),
      vscodeConfigPort.onDidChange((e) => {
        if (
          e.affects(EXTENSION_ID, "showStatusBarItem") ||
          e.affects(EXTENSION_ID, "statusBarItem.dirtyIndicator") ||
          config.affectsStatusBarIconOnly(e)
        ) {
          statusBarItem.refresh();
        } else if (e.affects("git", "path")) {
          gitClient.setGitPath(config.gitPath());
        } else if (e.affects(EXTENSION_ID, "maxDepthOfRepoSearch")) {
          if (maxDepth.increased(config.maxDepthOfRepoSearch())) {
            const paths = vscodeWorkspacePort.getRootPaths();
            void findGitRepos(paths, config.gitPath(), config.maxDepthOfRepoSearch()).then(
              (repoDirs) => {
                if (repoDirs.length > 0) {
                  repoManager.setRepos(repoDirs);
                  repoManager.sendRepos();
                }
              }
            );
          }
        }
      })
    );
  } catch (err) {
    logger.log(`Error during initialization: ${err instanceof Error ? err.message : String(err)}`);
    void showErrorMessage(vscode.l10n.t("Commits could not finish loading. Please retry."));
    throw err;
  }
}
