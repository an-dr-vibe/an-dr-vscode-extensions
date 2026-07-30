import * as vscode from "vscode";

import { isSecretPrompt } from "./askpassProtocol";

/**
 * Asks the user a credential question Git raised, masking the input when Git
 * asked for a password or passphrase. Returns null when dismissed, which the
 * helper turns into a non-zero exit so Git aborts instead of retrying.
 */
export async function promptForCredential(prompt: string): Promise<string | null> {
  const value = await vscode.window.showInputBox({
    prompt,
    password: isSecretPrompt(prompt),
    ignoreFocusOut: true,
    placeHolder: vscode.l10n.t("Git is requesting credentials")
  });
  return value ?? null;
}
