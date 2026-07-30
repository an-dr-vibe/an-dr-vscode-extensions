import { describe, expect, it } from "vitest";

import { createMaxDepthTracker } from "@/extension/maxDepthTracker";

describe("createMaxDepthTracker", () => {
  it("reports an increase", () => {
    expect(createMaxDepthTracker(2).increased(3)).toBe(true);
  });

  it("does not report a decrease", () => {
    expect(createMaxDepthTracker(3).increased(2)).toBe(false);
  });

  it("does not report an unchanged depth", () => {
    expect(createMaxDepthTracker(2).increased(2)).toBe(false);
  });
});
