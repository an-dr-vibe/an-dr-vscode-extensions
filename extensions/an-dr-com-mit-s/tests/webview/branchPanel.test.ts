import { beforeEach, describe, expect, it, vi } from "vitest";

import { BranchPanel, DEFAULT_BRANCH_PANEL_WIDTH } from "@/webview/branchPanel";
import { renderBranchPanel } from "@/webview/branchPanelRender";

import { viewStateFixture } from "./fixtures";
import { setupHtml } from "./setup";

describe("renderBranchPanel", () => {
  it("groups local and remote branches into folder trees", () => {
    const html = renderBranchPanel({
      options: [
        { name: "Show All", value: "", selected: true, current: false },
        { name: "feature/one", value: "feature/one", selected: false, current: false },
        {
          name: "origin/main",
          value: "remotes/origin/main",
          selected: false,
          current: true
        }
      ]
    });

    expect(html).toContain("Local (1)");
    expect(html).toContain("Remote (1)");
    expect(html).toContain("feature/");
    expect(html).toContain("origin/");
    expect(html).toContain("HEAD");
  });

  it("escapes branch names and values", () => {
    const html = renderBranchPanel({
      options: [
        {
          name: "<img src=x>",
          value: '" onclick="bad',
          selected: false,
          current: false
        }
      ]
    });

    expect(html).not.toContain("<img");
    expect(html).not.toContain('data-value="" onclick');
  });
});

describe("BranchPanel", () => {
  beforeEach(() => {
    setupHtml(viewStateFixture());
  });

  it("restores layout state and reports toggle changes", () => {
    const changed = vi.fn();
    const panel = new BranchPanel({ hidden: true, width: 321 }, changed);

    expect(panel.getState()).toEqual({ hidden: true, width: 321 });
    expect(document.body.classList.contains("branchPanelHidden")).toBe(true);
    expect(document.body.style.getPropertyValue("--branch-panel-width")).toBe("0px");

    document.getElementById("branchPanelToggle")!.click();
    expect(changed).toHaveBeenCalledWith({ hidden: false, width: 321 });
  });

  it("uses stable defaults for state saved before the panel existed", () => {
    const panel = new BranchPanel(undefined, vi.fn());
    expect(panel.getState()).toEqual({ hidden: false, width: DEFAULT_BRANCH_PANEL_WIDTH });
  });
});
