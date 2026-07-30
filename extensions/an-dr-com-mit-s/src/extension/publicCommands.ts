import * as vscode from "vscode";

import { DataSource } from "@/dataSource";
import { decodeDiffDocUri, DiffDocProvider } from "@/diffDocProvider";
import { getCommandId } from "@/extension/constant/const";
import { openFile, showErrorMessage } from "@/utils";

export const PUBLIC_COMMAND_NAMES = [
  "view",
  "addGitRepository",
  "clearAvatarCache",
  "fetch",
  "pull",
  "push",
  "removeGitRepository",
  "version",
  "openFile"
] as const;

export type PublicCommandName = (typeof PUBLIC_COMMAND_NAMES)[number];
export type PublicCommandHandler = (...args: unknown[]) => unknown;

/** Registers the complete public command surface for the active extension identity. */
export function registerPublicCommands(
  context: vscode.ExtensionContext,
  handlers: Partial<Record<PublicCommandName, PublicCommandHandler>>,
  dataSource: DataSource | null = null,
  skipped: ReadonlySet<PublicCommandName> = new Set()
) {
  const builtInHandlers: Partial<Record<PublicCommandName, PublicCommandHandler>> = {
    version: () => showVersion(context),
    openFile: (uri) => openDiffFile(uri, dataSource)
  };
  return PUBLIC_COMMAND_NAMES.filter((name) => !skipped.has(name)).map((name) =>
    vscode.commands.registerCommand(
      getCommandId(name),
      handlers[name] ?? builtInHandlers[name] ?? (() => showUnavailableCommand(name))
    )
  );
}

async function showVersion(context: vscode.ExtensionContext) {
  const version = String(context.extension.packageJSON.version);
  await vscode.window.showInformationMessage(
    vscode.l10n.t("an-dr: Commits (MIT) version {0}", version),
    { modal: true }
  );
}

async function openDiffFile(uri: unknown, dataSource: DataSource | null) {
  const target =
    typeof uri === "object" && uri !== null
      ? (uri as vscode.Uri)
      : vscode.window.activeTextEditor?.document.uri;
  if (target?.scheme !== DiffDocProvider.scheme || dataSource === null) {
    await showErrorMessage(
      vscode.l10n.t("Unable to open file: the command requires an an-dr: Commits diff editor.")
    );
    return;
  }
  const request = decodeDiffDocUri(target);
  const error = await openFile(request.repo, request.filePath, request.commit, dataSource);
  if (error !== null) {
    await showErrorMessage(vscode.l10n.t("Unable to open file: {0}", error));
  }
}

function showUnavailableCommand(name: PublicCommandName) {
  return showErrorMessage(
    vscode.l10n.t("The {0} command is not available yet in the MIT replacement.", name)
  );
}
