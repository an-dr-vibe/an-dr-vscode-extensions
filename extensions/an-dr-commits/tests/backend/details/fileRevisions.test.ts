import { describe, expect, it } from "vitest";

import { createFileRevisionComparison } from "@/details/fileRevisions";

describe("file revision comparisons", () => {
  it.each(["A", "M", "D", "R"] as const)(
    "uses parent and target revisions for %s files",
    (type) => {
      expect(
        createFileRevisionComparison("abc123", "before/name.txt", "after/name.txt", type)
      ).toEqual({
        base: { commit: "abc123^", path: "before/name.txt" },
        target: { commit: "abc123", path: "after/name.txt" }
      });
    }
  );
});
