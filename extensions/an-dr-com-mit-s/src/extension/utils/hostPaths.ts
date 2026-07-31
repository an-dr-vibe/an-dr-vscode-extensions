import * as path from "node:path";

import * as vscode from "vscode";

const FS_REGEX = /\\/g;

/**
 * Path helpers that speak VS Code's Uri type.
 *
 * They live in the host layer rather than the core: the core deals in plain
 * path strings so it can run without VS Code present.
 */
export function getPathFromUri(uri: vscode.Uri) {
  return uri.fsPath.replace(FS_REGEX, "/");
}

export function buildExtensionUri(extensionPath: string, ...pathComps: string[]) {
  return vscode.Uri.file(path.join(extensionPath, ...pathComps));
}
