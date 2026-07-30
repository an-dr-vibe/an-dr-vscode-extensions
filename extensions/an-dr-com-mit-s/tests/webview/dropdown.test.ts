import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as GG from "@/types";
import { Dropdown } from "@/webview/dropdown";

import { setupHtml } from "./setup";

const viewState: GG.GitGraphViewState = {
  autoCenterCommitDetailsView: true,
  committedVisual: "Avatar",
  avatarMode: "Auto (Fetched then Pattern)",
  avatarSize: "Normal",
  avatarShape: "Circle",
  dateFormat: "Date & Time",
  fetchAvatars: false,
  fileIcons: {},
  uiDensity: "Big",
  refreshShortcutKey: "r",
  columnVisibility: { Committed: true, ID: true },
  graphColours: ["#0085d9"],
  graphStyle: "rounded",
  initialLoadCommits: 300,
  lastActiveRepo: null,
  loadMoreCommits: 75,
  locale: "en",
  // The builder only emits the panel controls when a repo exists.
  repos: { "/workspace/repo": { columnWidths: null } },
  showCurrentBranchByDefault: false
};

function createDropdown(showInfo = false) {
  const onChange = vi.fn();
  const dropdown = new Dropdown("repoSelect", showInfo, "repository", onChange);
  const root = document.getElementById("repoSelect")!;
  return { dropdown, onChange, root };
}

beforeEach(() => setupHtml(viewState));

describe("Dropdown", () => {
  it("renders the supplied options and marks the selected value", () => {
    const { dropdown, root } = createDropdown();

    dropdown.setOptions(
      [
        { name: "First", value: "first" },
        { name: "Second", value: "second" }
      ],
      "second"
    );

    expect(root.querySelector(".dropdownCurrentValue")?.textContent).toBe("Second");
    expect(root.querySelectorAll(".dropdownOption")).toHaveLength(2);
    expect(root.querySelector(".dropdownOption.selected")?.textContent).toBe("Second");
  });

  it("opens on its current value and closes on an outside click", () => {
    const { dropdown, root } = createDropdown();
    dropdown.setOptions(
      [
        { name: "First", value: "first" },
        { name: "Second", value: "second" }
      ],
      "first"
    );

    (root.querySelector(".dropdownCurrentValue") as HTMLElement).click();
    expect(root.classList.contains("dropdownOpen")).toBe(true);
    document.body.click();
    expect(root.classList.contains("dropdownOpen")).toBe(false);
  });

  it("selects a new option, closes, and calls the change callback", () => {
    const { dropdown, onChange, root } = createDropdown();
    dropdown.setOptions(
      [
        { name: "First", value: "first" },
        { name: "Second", value: "second" }
      ],
      "first"
    );

    (root.querySelector(".dropdownCurrentValue") as HTMLElement).click();
    (root.querySelectorAll(".dropdownOption")[1] as HTMLElement).click();

    expect(onChange).toHaveBeenCalledWith("second");
    expect(root.classList.contains("dropdownOpen")).toBe(false);
    expect(root.querySelector(".dropdownCurrentValue")?.textContent).toBe("Second");
  });

  it("closes without reporting a change when the selected option is clicked", () => {
    const { dropdown, onChange, root } = createDropdown();
    dropdown.setOptions(
      [
        { name: "First", value: "first" },
        { name: "Second", value: "second" }
      ],
      "first"
    );

    (root.querySelector(".dropdownCurrentValue") as HTMLElement).click();
    (root.querySelector(".dropdownOption.selected") as HTMLElement).click();

    expect(onChange).not.toHaveBeenCalled();
    expect(root.classList.contains("dropdownOpen")).toBe(false);
  });

  it("renders an empty option list without throwing", () => {
    const { dropdown } = createDropdown();
    expect(() => dropdown.setOptions([], "")).not.toThrow();
  });

  it("refreshes the rendered current value after replacing options", () => {
    const { dropdown, root } = createDropdown();
    dropdown.setOptions([{ name: "First", value: "first" }], "first");
    dropdown.setOptions([{ name: "Replacement", value: "replacement" }], "replacement");
    dropdown.refresh();

    expect(root.querySelector(".dropdownCurrentValue")?.textContent).toBe("Replacement");
    expect(root.querySelectorAll(".dropdownOption")).toHaveLength(1);
  });

  it("escapes option names rather than injecting HTML", () => {
    const { dropdown, root } = createDropdown(true);
    dropdown.setOptions([{ name: '<img src=x onerror="alert(1)">', value: "unsafe" }], "unsafe");

    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector(".dropdownCurrentValue")?.textContent).toBe(
      '<img src=x onerror="alert(1)">'
    );
    expect(root.querySelector(".dropdownOption")?.innerHTML).toContain("&lt;img");
  });
});
