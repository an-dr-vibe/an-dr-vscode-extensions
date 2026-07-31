import type { ConfigChangeEvent, ConfigPort, Disposable } from "@an-dr/commits-core/host/port";
import * as vscode from "vscode";

import { createConfig } from "@/config";

/** Resolves the core's settings against VS Code's configuration. */
export const vscodeConfigPort: ConfigPort = {
  get<T>(namespace: string, key: string, fallback: T): T {
    return vscode.workspace.getConfiguration(namespace).get<T>(key, fallback);
  },

  /**
   * Only a value the user set: VS Code reports the manifest default alongside
   * the explicit ones, and the compatibility reader has to tell them apart.
   */
  getExplicit<T>(namespace: string, key: string): T | undefined {
    const inspected = vscode.workspace.getConfiguration(namespace).inspect?.<T>(key);
    if (inspected === undefined) {
      return undefined;
    }
    return [inspected.workspaceFolderValue, inspected.workspaceValue, inspected.globalValue].find(
      (value) => value !== undefined
    );
  },

  onDidChange(listener: (event: ConfigChangeEvent) => void): Disposable {
    return vscode.workspace.onDidChangeConfiguration((event) =>
      listener({
        affects: (namespace, key) =>
          event.affectsConfiguration(key === undefined ? namespace : `${namespace}.${key}`)
      })
    );
  }
};

/** The extension's own configuration, resolved through VS Code. */
export const config = createConfig(vscodeConfigPort);
