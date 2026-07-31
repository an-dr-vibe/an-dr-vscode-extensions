import { beforeEach, describe, expect, it, vi } from "vitest";

import { BranchPanel, DEFAULT_BRANCH_PANEL_WIDTH } from "@/webview/branchPanel";
import { renderBranchPanel } from "@/webview/branchPanelRender";

import { viewStateFixture } from "./fixtures";
import { setupHtml, setupL10n } from "./setup";

describe("renderBranchPanel", () => {
  beforeEach(() => {
    setupL10n();
  });

  it("groups local and remote branches into folder trees", () => {
    const html = renderBranchPanel({
      filter: "",
      collapsedFolders: new Set(),
      groupsFirst: true,
      flattenSingleChildGroups: true,
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

    expect(html).toContain(`${l10n.branchPanelLocal} (1)`);
    expect(html).toContain(`${l10n.branchPanelRemote} (1)`);
    expect(html).toContain("feature/");
    expect(html).toContain("origin/");
    expect(html).toContain("HEAD");
  });

  it("escapes branch names and values", () => {
    const html = renderBranchPanel({
      filter: "",
      collapsedFolders: new Set(),
      groupsFirst: true,
      flattenSingleChildGroups: true,
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

  it("takes every user-visible string from the injected l10n object", () => {
    expect(
      renderBranchPanel({
        filter: "",
        collapsedFolders: new Set(),
        groupsFirst: true,
        flattenSingleChildGroups: true,
        options: []
      })
    ).toContain(l10n.branchPanelNoBranches);
    expect(
      renderBranchPanel({
        filter: "zzz",
        collapsedFolders: new Set(),
        groupsFirst: true,
        flattenSingleChildGroups: true,
        options: [{ name: "main", value: "main", selected: false, current: false }]
      })
    ).toContain(l10n.branchPanelNoMatchingBranches);
  });

  it("puts folders above plain refs only when groupsFirst is on", () => {
    const options = [
      { name: "zzz", value: "zzz", selected: false, current: false },
      { name: "aaa/one", value: "aaa/one", selected: false, current: false }
    ];
    const grouped = renderBranchPanel({
      filter: "",
      collapsedFolders: new Set(),
      groupsFirst: true,
      flattenSingleChildGroups: false,
      options
    });
    expect(grouped.indexOf('data-folder="local&#x2F;aaa"')).toBeLessThan(
      grouped.indexOf('data-value="zzz"')
    );

    // With the setting off, plain alphabetical order puts "aaa" first anyway,
    // so the comparison uses a folder that sorts after the ref.
    const html = renderBranchPanel({
      filter: "",
      collapsedFolders: new Set(),
      groupsFirst: false,
      flattenSingleChildGroups: false,
      options: [
        { name: "aaa", value: "aaa", selected: false, current: false },
        { name: "zzz/one", value: "zzz/one", selected: false, current: false }
      ]
    });
    expect(html.indexOf('data-value="aaa"')).toBeLessThan(
      html.indexOf('data-folder="local&#x2F;zzz"')
    );
  });

  it("folds a chain of single-child folders into one row", () => {
    const options = [
      { name: "release/7.0/hotfix", value: "release/7.0/hotfix", selected: false, current: false }
    ];

    const flattened = renderBranchPanel({
      filter: "",
      collapsedFolders: new Set(),
      groupsFirst: true,
      flattenSingleChildGroups: true,
      options
    });
    expect(flattened).toContain('data-folder="local&#x2F;release&#x2F;7.0"');
    expect(flattened.match(/branchPanelFolder"/g)).toHaveLength(1);

    const nested = renderBranchPanel({
      filter: "",
      collapsedFolders: new Set(),
      groupsFirst: true,
      flattenSingleChildGroups: false,
      options
    });
    expect(nested.match(/branchPanelFolder"/g)).toHaveLength(2);
  });

  it("keeps the Show All row matchable through the localized label", () => {
    const html = renderBranchPanel({
      filter: l10n.showAll.slice(0, 3),
      collapsedFolders: new Set(),
      groupsFirst: true,
      flattenSingleChildGroups: true,
      options: [
        { name: l10n.showAll, value: "", selected: true, current: false },
        { name: "main", value: "main", selected: false, current: false }
      ]
    });

    expect(html).toContain('data-value=""');
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

    document.querySelector<HTMLElement>('[data-folder="local/feature"]')!.click();
    expect(document.querySelector('[data-value="feature/one"]')).toBeNull();

    document.querySelector<HTMLElement>('[data-folder="local/feature"]')!.click();
    expect(document.querySelector('[data-value="feature/one"]')).not.toBeNull();
  });

  it("collapses a local folder without collapsing the remote folder of the same name", () => {
    const panel = new BranchPanel(undefined, vi.fn(), vi.fn(), vi.fn());
    panel.setOptions(
      [
        { name: "feature/one", value: "feature/one" },
        { name: "origin/feature/one", value: "remotes/origin/feature/one" }
      ],
      ""
    );

    document.querySelector<HTMLElement>('[data-folder="local/feature"]')!.click();

    expect(document.querySelector('[data-value="feature/one"]')).toBeNull();
    expect(document.querySelector('[data-value="remotes/origin/feature/one"]')).not.toBeNull();
  });
});
