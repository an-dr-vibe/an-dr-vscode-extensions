import type { StoragePort } from "@an-dr/commits-core/host/port";
import type { ExtensionContext } from "vscode";

/** Presents VS Code's mementos and storage path as the core's storage port. */
export function createVscodeStoragePort(context: ExtensionContext): StoragePort {
  return {
    global: context.globalState,
    workspace: context.workspaceState,
    globalStoragePath: context.globalStoragePath
  };
}
