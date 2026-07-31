import { UNCOMMITTED } from "@an-dr/commits-core/webview/utils/graphConstants";
import { describe, expect, it } from "vitest";

describe("UNCOMMITTED", () => {
  it("identifies the synthetic working-tree changes row", () => {
    expect(UNCOMMITTED).toBe("*");
  });
});
