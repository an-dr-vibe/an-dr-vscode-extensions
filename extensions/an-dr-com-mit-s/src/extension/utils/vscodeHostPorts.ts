import type {
  Disposable,
  RootPathsChange,
  WatcherPort,
  WorkspacePort
} from "@an-dr/commits-core/host/port";
import * as vscode from "vscode";

import { getPathFromUri } from "@/extension/utils/hostPaths";

/** Watches a repository through VS Code's workspace file watcher. */
export const vscodeWatcherPort: WatcherPort = {
  watch(repoPath: string, onChange: (changedPath: string) => void): Disposable {
    const watcher = vscode.workspace.createFileSystemWatcher(repoPath + "/**");
    const report = (uri: vscode.Uri) => onChange(getPathFromUri(uri));
    watcher.onDidCreate(report);
    watcher.onDidChange(report);
    watcher.onDidDelete(report);
    return watcher;
  }
};

/**
 * Answers "where is the user working" from the editor, which is the closest
 * VS Code equivalent of a standalone client's repository selector.
 */
export const vscodeWorkspacePort: WorkspacePort = {
  getRootPaths(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
  },

  onDidChangeRootPaths(listener: (change: RootPathsChange) => void): Disposable {
    return vscode.workspace.onDidChangeWorkspaceFolders((event) =>
      listener({
        added: event.added.map((folder) => folder.uri.fsPath),
        removed: event.removed.map((folder) => folder.uri.fsPath)
      })
    );
  },

  getActiveRepoHint(): string | null {
    return vscode.window.activeTextEditor?.document.uri.fsPath ?? null;
  },

  onDidChangeActiveRepoHint(listener: () => void): Disposable {
    return vscode.window.onDidChangeActiveTextEditor?.(listener) ?? { dispose: () => {} };
  }
};
