import { afterEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

import { promptForCredential } from "@/askpass/credentialPrompt";

afterEach(() => vi.restoreAllMocks());

describe("promptForCredential", () => {
  it("masks a password prompt and returns the entered value", async () => {
    const showInputBox = vi.spyOn(vscode.window, "showInputBox").mockResolvedValue("secret");

    await expect(promptForCredential("Password for https://example.com:")).resolves.toBe("secret");
    expect(showInputBox).toHaveBeenCalledWith(
      expect.objectContaining({ password: true, ignoreFocusOut: true })
    );
  });

  it("does not mask a username prompt", async () => {
    const showInputBox = vi.spyOn(vscode.window, "showInputBox").mockResolvedValue("alice");

    await expect(promptForCredential("Username for https://example.com:")).resolves.toBe("alice");
    expect(showInputBox).toHaveBeenCalledWith(expect.objectContaining({ password: false }));
  });

  it("returns null when the input box is dismissed", async () => {
    vi.spyOn(vscode.window, "showInputBox").mockResolvedValue(undefined);

    await expect(promptForCredential("Passphrase:")).resolves.toBeNull();
  });
});
