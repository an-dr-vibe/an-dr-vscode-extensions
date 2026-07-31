import type { SavePrompt, UiPort } from "@an-dr/commits-core/host/port";
import * as vscode from "vscode";

/** Presents VS Code's notifications, clipboard and dialogs as the core's UI port. */
export const vscodeUiPort: UiPort = {
  showError(message: string): Promise<void> {
    // Swallows the rejection VS Code produces when a notification is dismissed.
    return Promise.resolve(vscode.window.showErrorMessage(message)).then(
      () => undefined,
      () => undefined
    );
  },

  copyToClipboard(text: string): Promise<boolean> {
    return Promise.resolve(vscode.env.clipboard.writeText(text)).then(
      () => true,
      () => false
    );
  },

  openExternal(url: string): Promise<boolean> {
    return Promise.resolve(vscode.env.openExternal(vscode.Uri.parse(url))).then(
      (opened) => opened,
      () => false
    );
  },

  async promptForSavePath(prompt: SavePrompt): Promise<string | null> {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(prompt.defaultPath),
      saveLabel: prompt.saveLabel,
      filters: prompt.filters
    });
    return uri?.fsPath ?? null;
  }
};
