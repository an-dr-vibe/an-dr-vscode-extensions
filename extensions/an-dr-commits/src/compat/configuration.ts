import * as vscode from "vscode";

const legacyNamespace = "an-dr-commits";

/**
 * Reads a staging value first, then a selected final-identity setting.
 *
 * The mapping contains public settings facts only. It deliberately does not
 * deserialize legacy storage or reproduce the previous implementation.
 */
export function readCompatibleConfiguration<T>(
  stagingNamespace: string,
  stagingKey: string,
  legacyKey: string,
  defaultValue: T
): T {
  const staging = vscode.workspace.getConfiguration(stagingNamespace);
  // Lightweight test doubles and older API shims may not implement inspect.
  if (typeof staging.inspect !== "function") {
    return staging.get<T>(stagingKey, defaultValue);
  }
  const details = staging.inspect<T>(stagingKey);
  if (
    details?.globalValue !== undefined ||
    details?.workspaceValue !== undefined ||
    details?.workspaceFolderValue !== undefined
  ) {
    return staging.get<T>(stagingKey, defaultValue);
  }
  return vscode.workspace.getConfiguration(legacyNamespace).get<T>(legacyKey, defaultValue);
}
