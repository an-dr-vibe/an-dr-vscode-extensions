import * as vscode from "vscode";

const setCommitRangeCommand = "an-dr-code-review.setCommitRange";

/**
 * Sends a commit range to an installed Code Review extension.
 *
 * The integration is deliberately one-way and optional: no state is read
 * back, and a missing or failing receiver leaves the graph usable.
 */
export async function sendCommitRangeToCodeReview(
  from: string,
  to: string,
  repository: string
): Promise<boolean> {
  try {
    if (!(await vscode.commands.getCommands(true)).includes(setCommitRangeCommand)) {
      return false;
    }
    await vscode.commands.executeCommand(setCommitRangeCommand, from, to, repository);
    return true;
  } catch {
    return false;
  }
}
