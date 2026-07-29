import * as path from "node:path";

import * as vscode from "vscode";

import { DataSource } from "@/dataSource";
import { encodeDiffDocUri } from "@/diffDocProvider";
import { EXTENSION_ID } from "@/extension/constant/const";
import { GitRepoSet } from "@/types";

export type ErrorInfo = string | null;

function commandError(action: string) {
  return vscode.l10n.t("Visual Studio Code was unable to {0}.", action);
}

/** Prompts for and writes a tar or zip archive. */
export async function archive(
  repo: string,
  ref: string,
  dataSource: DataSource
): Promise<ErrorInfo> {
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(repo),
    saveLabel: vscode.l10n.t("Create Archive"),
    filters: {
      [vscode.l10n.t("TAR Archive")]: ["tar"],
      [vscode.l10n.t("ZIP Archive")]: ["zip"]
    }
  });
  if (!uri) {
    return null;
  }
  const type = path.extname(uri.fsPath).slice(1).toLowerCase();
  if (type !== "tar" && type !== "zip") {
    return vscode.l10n.t("The archive file must use a .tar or .zip extension.");
  }
  try {
    await dataSource.archive(repo, ref, uri.fsPath, type);
    return null;
  } catch {
    return vscode.l10n.t("Unable to create the archive.");
  }
}

/** Opens Git's textual summary for a submodule change. */
export async function viewSubmoduleDiff(
  repo: string,
  fromHash: string,
  toHash: string,
  filePath: string,
  dataSource: DataSource,
  viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active
): Promise<ErrorInfo> {
  const content = await dataSource.getSubmoduleDiff(repo, fromHash, toHash, filePath);
  if (content === null) {
    return vscode.l10n.t("Unable to retrieve the submodule diff for {0}.", filePath);
  }
  try {
    const document = await vscode.workspace.openTextDocument({ content, language: "diff" });
    await vscode.window.showTextDocument(document, { preview: true, viewColumn });
    return null;
  } catch {
    return commandError(vscode.l10n.t("open the submodule diff for {0}", filePath));
  }
}

/** Opens VS Code's Source Control view. */
export async function viewScm(): Promise<ErrorInfo> {
  try {
    await vscode.commands.executeCommand("workbench.view.scm");
    return null;
  } catch {
    return commandError(vscode.l10n.t("open the Source Control view"));
  }
}

/** Opens a repository file at a specific revision. */
export async function viewFileAtRevision(
  repo: string,
  hash: string,
  filePath: string,
  viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active
): Promise<ErrorInfo> {
  try {
    await vscode.commands.executeCommand("vscode.open", encodeDiffDocUri(repo, filePath, hash), {
      preview: true,
      viewColumn
    });
    return null;
  } catch {
    return commandError(vscode.l10n.t("open {0} at revision {1}", filePath, hash.slice(0, 8)));
  }
}

/** Opens a current repository file, following a known rename when needed. */
export async function openFile(
  repo: string,
  filePath: string,
  hash: string | null = null,
  dataSource: DataSource | null = null,
  viewColumn: vscode.ViewColumn = vscode.ViewColumn.Active
): Promise<ErrorInfo> {
  let resolvedPath = filePath;
  let uri = vscode.Uri.file(path.join(repo, resolvedPath));
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    const renamed =
      hash === null || dataSource === null
        ? null
        : await dataSource.findRenamedPath(repo, hash, filePath);
    if (renamed === null) {
      return vscode.l10n.t("The file {0} does not currently exist.", filePath);
    }
    resolvedPath = renamed;
    uri = vscode.Uri.file(path.join(repo, resolvedPath));
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      return vscode.l10n.t("The file {0} does not currently exist.", resolvedPath);
    }
  }
  try {
    await vscode.commands.executeCommand("vscode.open", uri, { preview: true, viewColumn });
    return null;
  } catch {
    return commandError(vscode.l10n.t("open {0}", resolvedPath));
  }
}

/** Opens an external URL with the operating system's registered application. */
export async function openExternalUrl(
  url: string,
  type = vscode.l10n.t("external URL")
): Promise<ErrorInfo> {
  try {
    const success = await vscode.env.openExternal(vscode.Uri.parse(url));
    return success ? null : commandError(vscode.l10n.t("open the {0}", type));
  } catch {
    return commandError(vscode.l10n.t("open the {0}", type));
  }
}

/** Opens this extension's Settings editor. */
export async function openExtensionSettings(): Promise<ErrorInfo> {
  try {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      `@ext:an-dr.${EXTENSION_ID}`
    );
    return null;
  } catch {
    return commandError(vscode.l10n.t("open the extension settings"));
  }
}

/** Shows an error without leaking VS Code notification rejections. */
export function showErrorMessage(message: string) {
  return vscode.window.showErrorMessage(message).then(
    () => undefined,
    () => undefined
  );
}

/** Returns repository paths in stable path order. */
export function getSortedRepositoryPaths(repos: GitRepoSet): ReadonlyArray<string> {
  return Object.keys(repos).toSorted((a, b) => a.localeCompare(b));
}

/** Formats a timestamp as a localized relative time. */
export function getRelativeTimeDiff(
  unixTimestamp: number,
  now = Math.round(Date.now() / 1000),
  locale = vscode.env.language
) {
  const seconds = Math.max(0, now - unixTimestamp);
  const units: [number, Intl.RelativeTimeFormatUnit, number][] = [
    [60, "second", 1],
    [3600, "minute", 60],
    [86400, "hour", 3600],
    [604800, "day", 86400],
    [2629800, "week", 604800],
    [31557600, "month", 2629800],
    [Infinity, "year", 31557600]
  ];
  const [, unit, divisor] = units.find(([threshold]) => seconds < threshold)!;
  return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(
    -Math.round(seconds / divisor),
    unit
  );
}
