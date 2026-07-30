import { describe, expect, it } from "vitest";

import { getWebviewLocalizedStrings } from "@/extension/l10n/webviewL10n";

describe("getWebviewLocalizedStrings", () => {
  it("returns the complete non-empty webview string map", () => {
    const strings = getWebviewLocalizedStrings();
    const values = Object.values(strings);

    expect(Object.keys(strings)).toHaveLength(95);
    expect(strings).toMatchObject({
      repo: "Repo",
      unableToLoadCommitDetails: "Unable to load commit details",
      dialogCancel: "Cancel",
      tooltipDeletions: "{0} deletions"
    });
    expect(values.every((value) => typeof value === "string" && value.length > 0)).toBe(true);
  });
});
