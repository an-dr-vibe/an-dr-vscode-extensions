import { describe, expect, it } from "vitest";

import { shouldApplyGraphRefresh } from "@/webview/graphRefresh";

describe("graph refresh generation", () => {
  it("accepts the first and newer responses", () => {
    expect(shouldApplyGraphRefresh(0, 0)).toBe(true);
    expect(shouldApplyGraphRefresh(4, 5)).toBe(true);
  });

  it("rejects a response that predates rendered graph data", () => {
    expect(shouldApplyGraphRefresh(5, 4)).toBe(false);
  });
});
