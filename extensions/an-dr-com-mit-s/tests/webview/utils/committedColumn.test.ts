import { describe, expect, it } from "vitest";

import {
  getCommittedAuthorInitials,
  getCommittedInitialsBackgroundColor
} from "@/webview/utils/committedColumn";

describe("getCommittedAuthorInitials", () => {
  it("uses the first letters of a first and last name", () => {
    expect(getCommittedAuthorInitials("Ada Lovelace", "ada@example.com")).toBe("AL");
  });

  it("repeats the initial for a single-character name", () => {
    expect(getCommittedAuthorInitials("Q", "q@example.com")).toBe("QQ");
  });

  it("falls back to the email when the author is blank", () => {
    expect(getCommittedAuthorInitials("", "ada@example.com")).toBe("AE");
  });

  it("uses question marks when neither author nor email is available", () => {
    expect(getCommittedAuthorInitials(" ", " ")).toBe("??");
  });
});

describe("getCommittedInitialsBackgroundColor", () => {
  it("returns the same colour for the same seed", () => {
    expect(getCommittedInitialsBackgroundColor("email:ada@example.com")).toBe(
      getCommittedInitialsBackgroundColor("email:ada@example.com")
    );
  });
});
