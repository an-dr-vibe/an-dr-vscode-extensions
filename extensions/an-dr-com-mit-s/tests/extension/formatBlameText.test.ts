/* eslint-disable no-template-curly-in-string -- blame templates use literal ${...} placeholders. */
import { BlameLineInfo } from "@an-dr/commits-core/data-source/models";
import { describe, expect, it } from "vitest";

import { formatBlameText, shouldShowInlineHover } from "@/inlineBlame";

const blame: BlameLineInfo = {
  author: "Alice",
  authorEmail: "alice@example.com",
  authorTime: Math.floor(Date.now() / 1000) - 60,
  committed: true,
  hash: "0123456789abcdef0123456789abcdef01234567",
  summary: "Add the feature everyone wanted"
};

describe("formatBlameText", () => {
  it("substitutes the author and email tokens", () => {
    expect(formatBlameText("${author.name} <${author.mail}>", blame, "Alice")).toBe(
      "Alice <alice@example.com>"
    );
  });

  it("uses the display author, not the raw one, so the alias wins", () => {
    expect(formatBlameText("${author.name}", blame, "You")).toBe("You");
  });

  it("substitutes full and abbreviated hashes", () => {
    expect(formatBlameText("${commit.hash}", blame, "Alice")).toBe(blame.hash);
    expect(formatBlameText("${commit.hash_short}", blame, "Alice")).toBe(
      blame.hash.substring(0, 8)
    );
  });

  it("truncates the hash and summary to a requested length", () => {
    expect(formatBlameText("${commit.hash_short,4}", blame, "Alice")).toBe("0123");
    expect(formatBlameText("${commit.summary,3}", blame, "Alice")).toBe("Add");
  });

  it("renders a relative time for time.ago", () => {
    expect(formatBlameText("${time.ago}", blame, "Alice")).toMatch(/ago|now|second|minute/i);
  });

  it("renders an unknown token as empty rather than leaving the placeholder", () => {
    expect(formatBlameText("[${nope}]", blame, "Alice")).toBe("[]");
  });

  it("tolerates whitespace inside the placeholder", () => {
    expect(formatBlameText("${ author.name }", blame, "Alice")).toBe("Alice");
  });

  it("leaves text without placeholders untouched", () => {
    expect(formatBlameText("no tokens here", blame, "Alice")).toBe("no tokens here");
  });

  it("substitutes every occurrence of a repeated token", () => {
    expect(formatBlameText("${author.name}/${author.name}", blame, "Alice")).toBe("Alice/Alice");
  });
});

describe("shouldShowInlineHover", () => {
  it("shows the hover only for the inline modes", () => {
    expect(shouldShowInlineHover("inline")).toBe(true);
    expect(shouldShowInlineHover("inline-status")).toBe(true);
  });

  it("hides it for off and status-only", () => {
    expect(shouldShowInlineHover("off")).toBe(false);
    expect(shouldShowInlineHover("status")).toBe(false);
  });
});
