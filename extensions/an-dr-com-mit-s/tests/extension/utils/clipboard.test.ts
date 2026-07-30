import { describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

import { copyToClipboard } from "@/extension/utils/clipboard";

describe("copyToClipboard", () => {
  it("writes text and reports success", async () => {
    const writeText = vi.spyOn(vscode.env.clipboard, "writeText").mockResolvedValue();

    await expect(copyToClipboard("copied text")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("copied text");
  });

  it("reports failure when the clipboard rejects the write", async () => {
    vi.spyOn(vscode.env.clipboard, "writeText").mockRejectedValue(new Error("denied"));

    await expect(copyToClipboard("copied text")).resolves.toBe(false);
  });
});
