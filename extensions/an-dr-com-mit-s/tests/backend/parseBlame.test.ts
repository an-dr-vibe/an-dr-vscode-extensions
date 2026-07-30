import { describe, expect, it } from "vitest";

import { parseBlameIncrementalOutput } from "@/data-source/parsers";

const HASH = "a".repeat(40);
const OTHER = "b".repeat(40);
const UNCOMMITTED = "0".repeat(40);

/** One `--incremental` group: header, metadata, then the filename terminator. */
function group(hash: string, finalLine: number, lineCount: number, meta: string[] = []) {
  return [`${hash} 1 ${finalLine} ${lineCount}`, ...meta, "filename f.txt"].join("\n");
}

describe("parseBlameIncrementalOutput", () => {
  it("returns nothing for empty output", () => {
    expect(parseBlameIncrementalOutput("").size).toBe(0);
  });

  it("maps a commit's metadata onto its lines, zero-based", () => {
    const out = group(HASH, 1, 2, [
      "author Alice",
      "author-mail <alice@example.com>",
      "author-time 1700000000",
      "summary Add feature"
    ]);

    const result = parseBlameIncrementalOutput(out);

    // Git reports line 1; editors index from 0.
    expect(result.get(0)).toEqual({
      author: "Alice",
      authorEmail: "alice@example.com",
      authorTime: 1700000000,
      committed: true,
      hash: HASH,
      summary: "Add feature"
    });
    expect(result.get(1)?.hash).toBe(HASH);
    expect(result.has(2)).toBe(false);
  });

  it("strips the angle brackets Git wraps around the email", () => {
    const result = parseBlameIncrementalOutput(
      group(HASH, 1, 1, ["author-mail <alice@example.com>"])
    );
    expect(result.get(0)?.authorEmail).toBe("alice@example.com");
  });

  it("reuses metadata when a later group repeats a known hash", () => {
    // The incremental format sends each commit's details only once.
    const out = [
      group(HASH, 1, 1, ["author Alice", "author-time 100", "summary First"]),
      group(HASH, 5, 1)
    ].join("\n");

    const result = parseBlameIncrementalOutput(out);

    expect(result.get(4)?.author).toBe("Alice");
    expect(result.get(4)?.summary).toBe("First");
  });

  it("keeps commits distinct", () => {
    const out = [group(HASH, 1, 1, ["author Alice"]), group(OTHER, 2, 1, ["author Bob"])].join(
      "\n"
    );

    const result = parseBlameIncrementalOutput(out);

    expect(result.get(0)?.author).toBe("Alice");
    expect(result.get(1)?.author).toBe("Bob");
  });

  it("marks the all-zero hash as not committed", () => {
    const result = parseBlameIncrementalOutput(group(UNCOMMITTED, 1, 1, ["author Not Committed"]));
    expect(result.get(0)?.committed).toBe(false);
  });

  it("defaults a missing or unparsable author-time to zero", () => {
    expect(parseBlameIncrementalOutput(group(HASH, 1, 1)).get(0)?.authorTime).toBe(0);
    expect(
      parseBlameIncrementalOutput(group(HASH, 1, 1, ["author-time nonsense"])).get(0)?.authorTime
    ).toBe(0);
  });

  it("ignores lines that are not a group header", () => {
    expect(parseBlameIncrementalOutput("boundary\nnot a header\n").size).toBe(0);
  });

  it("handles CRLF output", () => {
    const out = group(HASH, 1, 1, ["author Alice"]).replace(/\n/g, "\r\n");
    expect(parseBlameIncrementalOutput(out).get(0)?.author).toBe("Alice");
  });
});
