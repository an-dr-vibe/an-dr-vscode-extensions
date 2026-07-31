import { Toolbar } from "@an-dr/commits-core/webview/toolbar";
import { toolbarIcons } from "@an-dr/commits-core/webview/utils/icons";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { viewStateFixture } from "./fixtures";
import { setupHtml } from "./setup";

const IDS = ["refreshBtn", "resetBtn", "pullBtn", "pushBtn"];

function makeButtons(overrides: Record<string, boolean> = {}) {
  return IDS.map((id) => ({
    id,
    icon: toolbarIcons.refresh,
    title: id,
    visible: overrides[id] !== false,
    onClick: vi.fn()
  }));
}

/**
 * jsdom reports every element as zero-sized, so the widths the overflow logic
 * measures are stubbed: the left group's right edge and the button group's left
 * edge decide whether the row still fits.
 */
function setWidths(options: { controls: number; leftRight: number; groupLeft: number }) {
  const controls = document.getElementById("controls")!;
  Object.defineProperty(controls, "clientWidth", { value: options.controls, configurable: true });
  Object.defineProperty(controls, "scrollWidth", { value: options.controls, configurable: true });
  document.getElementById("controlsLeft")!.getBoundingClientRect = () =>
    ({ right: options.leftRight }) as DOMRect;
  document.getElementById("controlsBtns")!.getBoundingClientRect = () =>
    ({ left: options.groupLeft }) as DOMRect;
}

function visibleIds(): string[] {
  return IDS.filter(
    (id) => document.getElementById(id)!.classList.contains("overflowHidden") === false
  );
}

function moreIsShown(): boolean {
  return !document.getElementById("moreBtn")!.classList.contains("overflowHidden");
}

describe("Toolbar overflow", () => {
  beforeEach(() => {
    setupHtml(viewStateFixture());
  });

  it("keeps every button and hides the more menu when the row fits", () => {
    setWidths({ controls: 900, leftRight: 100, groupLeft: 700 });
    new Toolbar().setButtons(makeButtons());

    expect(visibleIds()).toEqual(IDS);
    expect(moreIsShown()).toBe(false);
  });

  it("folds buttons away in the 2.0 collapse order as room runs out", () => {
    setWidths({ controls: 200, leftRight: 300, groupLeft: 100 });
    new Toolbar().setButtons(makeButtons());

    // refresh, push, pull, then reset — reset survives longest.
    expect(visibleIds()).toEqual([]);
    expect(moreIsShown()).toBe(true);
  });

  it("restores folded buttons when the toolbar widens again", () => {
    setWidths({ controls: 200, leftRight: 300, groupLeft: 100 });
    const toolbar = new Toolbar();
    toolbar.setButtons(makeButtons());
    expect(moreIsShown()).toBe(true);

    setWidths({ controls: 900, leftRight: 100, groupLeft: 700 });
    toolbar.refresh();

    expect(visibleIds()).toEqual(IDS);
    expect(moreIsShown()).toBe(false);
  });

  it("never shows a button its own state marks unavailable", () => {
    setWidths({ controls: 900, leftRight: 100, groupLeft: 700 });
    new Toolbar().setButtons(makeButtons({ pullBtn: false, pushBtn: false }));

    expect(visibleIds()).toEqual(["refreshBtn", "resetBtn"]);
    // Hidden by state, not by width, so the more menu stays closed.
    expect(moreIsShown()).toBe(false);
  });

  it("runs a button's action through the delegated listener", () => {
    setWidths({ controls: 900, leftRight: 100, groupLeft: 700 });
    const buttons = makeButtons();
    new Toolbar().setButtons(buttons);

    document.getElementById("resetBtn")!.click();

    expect(buttons.find((button) => button.id === "resetBtn")!.onClick).toHaveBeenCalledOnce();
  });

  it("waits out the double-click window before running a dual-action button", () => {
    vi.useFakeTimers();
    try {
      setWidths({ controls: 900, leftRight: 100, groupLeft: 700 });
      const single = vi.fn();
      const double = vi.fn();
      new Toolbar().setButtons([
        {
          id: "pullBtn",
          icon: toolbarIcons.arrowDown,
          title: "fetch/pull",
          visible: true,
          onClick: single,
          onDoubleClick: double
        }
      ]);

      document.getElementById("pullBtn")!.click();
      // Still pending: a second click within the window means the other action.
      expect(single).not.toHaveBeenCalled();

      vi.advanceTimersByTime(300);
      expect(single).toHaveBeenCalledOnce();
      expect(double).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs the double-click action and cancels the single one", () => {
    vi.useFakeTimers();
    try {
      setWidths({ controls: 900, leftRight: 100, groupLeft: 700 });
      const single = vi.fn();
      const double = vi.fn();
      new Toolbar().setButtons([
        {
          id: "pullBtn",
          icon: toolbarIcons.arrowDown,
          title: "fetch/pull",
          visible: true,
          onClick: single,
          onDoubleClick: double
        }
      ]);

      const button = document.getElementById("pullBtn")!;
      button.click();
      button.click();
      vi.advanceTimersByTime(300);

      expect(double).toHaveBeenCalledOnce();
      expect(single).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a click on a button its state marks unavailable", () => {
    setWidths({ controls: 900, leftRight: 100, groupLeft: 700 });
    const buttons = makeButtons({ pushBtn: false });
    new Toolbar().setButtons(buttons);

    document.getElementById("pushBtn")!.click();

    expect(buttons.find((button) => button.id === "pushBtn")!.onClick).not.toHaveBeenCalled();
  });
});
