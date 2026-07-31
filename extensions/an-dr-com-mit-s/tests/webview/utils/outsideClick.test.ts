import { addOutsideClickListener } from "@an-dr/commits-core/webview/utils/outsideClick";
import { describe, expect, it, vi } from "vitest";

describe("addOutsideClickListener", () => {
  it("reports inside and outside clicks, then removes its listener", () => {
    const root = document.createElement("div");
    const inside = document.createElement("button");
    const outside = document.createElement("button");
    root.append(inside);
    document.body.append(root, outside);
    const onClick = vi.fn();
    const removeListener = addOutsideClickListener(
      (target) => target.closest(".widget") === root,
      onClick
    );
    root.className = "widget";

    inside.click();
    outside.click();

    expect(onClick).toHaveBeenCalledTimes(2);
    expect(onClick.mock.calls.map(([, wasInside]) => wasInside)).toEqual([true, false]);

    removeListener();
    outside.click();
    expect(onClick).toHaveBeenCalledTimes(2);
  });
});
