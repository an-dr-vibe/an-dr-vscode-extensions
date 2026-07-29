import * as vscode from "vscode";

import { createCore } from "@/core";

/** Activate the lightweight extension shell. */
export function activate(context: vscode.ExtensionContext) {
  return createCore(context);
}

export function deactivate() {}
