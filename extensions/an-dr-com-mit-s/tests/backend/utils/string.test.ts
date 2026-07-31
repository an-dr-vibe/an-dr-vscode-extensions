import { abbrevCommit } from "@an-dr/commits-core/backend/utils/string";
import { describe, expect, it } from "vitest";

describe("abbrevCommit", () => {
  it("shortens a full commit hash to eight characters", () => {
    expect(abbrevCommit("0123456789abcdef0123456789abcdef01234567")).toBe("01234567");
  });

  it("leaves an already-short hash unchanged", () => {
    expect(abbrevCommit("abc123")).toBe("abc123");
  });
});

// escapeRefName was removed rather than fixed. It was `str.replace(/'/g, "'")`
// — an apostrophe replaced by an apostrophe, so it escaped nothing — and it
// had no caller anywhere in the extension. It came from the imported baseline.
// A broken helper nothing calls is worth deleting, not repairing.
