import { describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

import { sendCommitRangeToCodeReview } from "@/codeReviewIntegration";

describe("Code Review integration", () => {
  it("sends a range when the receiving extension exposes its command", async () => {
    vi.spyOn(vscode.commands, "getCommands").mockResolvedValue([
      "an-dr-code-review.setCommitRange"
    ]);
    const executeCommand = vi.spyOn(vscode.commands, "executeCommand").mockResolvedValue(undefined);

    await expect(sendCommitRangeToCodeReview("base", "head", "/repo")).resolves.toBe(true);
    expect(executeCommand).toHaveBeenCalledWith(
      "an-dr-code-review.setCommitRange",
      "base",
      "head",
      "/repo"
    );
  });

  it("does nothing when Code Review is unavailable", async () => {
    vi.spyOn(vscode.commands, "getCommands").mockResolvedValue([]);

    await expect(sendCommitRangeToCodeReview("base", "head", "/repo")).resolves.toBe(false);
  });
});
