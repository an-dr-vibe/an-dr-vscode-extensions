import { describe, expect, it } from "vitest";

import { UNCOMMITTED } from "@/webview/utils/graphConstants";

describe("UNCOMMITTED", () => {
  it("identifies the synthetic working-tree changes row", () => {
    expect(UNCOMMITTED).toBe("*");
  });
});
