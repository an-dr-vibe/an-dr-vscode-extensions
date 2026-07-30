import { beforeEach, describe, expect, it, vi } from "vitest";

import { BranchPanel, DEFAULT_BRANCH_PANEL_WIDTH } from "@/webview/branchPanel";
import { renderBranchPanel } from "@/webview/branchPanelRender";

import { viewStateFixture } from "./fixtures";
import { setupHtml } from "./setup";

describe("renderBranchPanel", () => {
  it("groups local and remote branches into folder trees", () => {
    const html = renderBranchPanel({
      filter: "",
      collapsedFolders: new Set(),
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
      filter: "",
      collapsedFolders: new Set(),
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
    const panel = new BranchPanel({ hidden: true, width: 321 }, changed, vi.fn(), vi.fn());

    expect(panel.getState()).toEqual({ hidden: true, width: 321 });
    expect(document.body.classList.contains("branchPanelHidden")).toBe(true);
    expect(document.body.style.getPropertyValue("--branch-panel-width")).toBe("0px");

    document.getElementById("branchPanelToggle")!.click();
    expect(changed).toHaveBeenCalledWith({ hidden: false, width: 321 });
  });

  it("uses stable defaults for state saved before the panel existed", () => {
    const panel = new BranchPanel(undefined, vi.fn(), vi.fn(), vi.fn());
    expect(panel.getState()).toEqual({ hidden: false, width: DEFAULT_BRANCH_PANEL_WIDTH });
  });

  it("filters and selects branches through delegated events", () => {
    const selected = vi.fn();
    const panel = new BranchPanel(undefined, vi.fn(), selected, vi.fn());
    panel.setOptions(
      [
        { name: "Show All", value: "" },
        { name: "feature/one", value: "feature/one" },
        { name: "main", value: "main" }
      ],
      ""
    );

    const filter = document.querySelector<HTMLInputElement>(".branchPanelFilterInput")!;
    expect(filter.placeholder).toBe(l10n.filterPlaceholder.replace("{0}", l10n.branch));
    filter.value = "feature";
    filter.dispatchEvent(new Event("input"));
    expect(document.querySelector('[data-value="main"]')).toBeNull();

    document.querySelector<HTMLElement>('[data-value="feature/one"]')!.click();
    expect(selected).toHaveBeenCalledWith("feature/one");
  });

  it("dispatches double-click and context-menu actions", () => {
    const action = vi.fn();
    const panel = new BranchPanel(undefined, vi.fn(), vi.fn(), action);
    panel.setOptions([{ name: "main", value: "main" }], "main");
    const item = document.querySelector<HTMLElement>('[data-value="main"]')!;

    item.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    item.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));

    expect(action.mock.calls.map((call) => call[1])).toEqual(["doubleClick", "contextMenu"]);
  });

  it("collapses and expands branch folders", () => {
    const panel = new BranchPanel(undefined, vi.fn(), vi.fn(), vi.fn());
    panel.setOptions([{ name: "feature/one", value: "feature/one" }], "");

    document.querySelector<HTMLElement>('[data-folder="feature"]')!.click();
    expect(document.querySelector('[data-value="feature/one"]')).toBeNull();

    document.querySelector<HTMLElement>('[data-folder="feature"]')!.click();
    expect(document.querySelector('[data-value="feature/one"]')).not.toBeNull();
  });
});
