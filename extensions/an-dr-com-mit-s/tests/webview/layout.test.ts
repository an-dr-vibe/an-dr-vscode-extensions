import { beforeEach, describe, expect, it } from "vitest";

import { viewStateFixture } from "./fixtures";
import { setupHtml } from "./setup";

/**
 * The tab scrolls inside #view rather than scrolling the page, which is what
 * keeps the top bar pinned. These assertions guard that structure: the CSS that
 * implements it only works if the elements stay in these relationships.
 */
describe("tab layout", () => {
  beforeEach(() => {
    setupHtml(viewStateFixture());
  });

  it("puts the scrolling region around the top bar, sidebar and content", () => {
    const view = document.getElementById("view")!;

    expect(view).not.toBeNull();
    for (const id of ["topBar", "branchPanelSidebar", "content", "footer"]) {
      expect(view.contains(document.getElementById(id))).toBe(true);
    }
  });

  it("keeps the docked panels outside the scrolling region", () => {
    const view = document.getElementById("view")!;

    // #view is inset by these panels, so they cannot scroll with it.
    for (const id of ["filesPanel", "fullDiffPanel"]) {
      const panel = document.getElementById(id)!;
      expect(panel).not.toBeNull();
      expect(view.contains(panel)).toBe(false);
    }
  });

  it("makes the top bar a direct child of the scroller so it can stick", () => {
    // position:sticky resolves against the nearest scrolling ancestor, so the
    // top bar has to be a child of #view and not nested inside content.
    expect(document.getElementById("topBar")!.parentElement!.id).toBe("view");
  });

  it("aligns the top bar's sidebar column with the sidebar below it", () => {
    const sidebarTop = document.getElementById("sidebarTop")!;

    expect(document.getElementById("topBar")!.contains(sidebarTop)).toBe(true);
    expect(sidebarTop.contains(document.getElementById("repoSelect"))).toBe(true);
  });
});
