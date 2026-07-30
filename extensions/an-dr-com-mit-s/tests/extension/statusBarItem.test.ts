import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  const item = {
    command: "",
    name: "",
    text: "",
    tooltip: "",
    hide: vi.fn(),
    show: vi.fn()
  };
  return { createStatusBarItem: vi.fn(() => item), item };
});

vi.mock("vscode", () => ({
  StatusBarAlignment: { Left: 1 },
  l10n: { t: (message: string) => message },
  window: { createStatusBarItem: mock.createStatusBarItem }
}));

import { StatusBarItem } from "@/statusBarItem";

/** Builds an item whose only varying input is the indicator style. */
function makeItem(dirtyIndicator: string) {
  const config = {
    showStatusBarItem: () => true,
    statusBarIconOnly: () => false,
    statusBarDirtyIndicator: () => dirtyIndicator
  };
  return new StatusBarItem({ subscriptions: [] } as never, config as never);
}

describe("StatusBarItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.item.text = "";
    mock.item.tooltip = "";
  });

  it("shows the active branch and split dirty counts", () => {
    const context = { subscriptions: [] };
    const config = {
      showStatusBarItem: () => true,
      statusBarIconOnly: () => false,
      statusBarDirtyIndicator: () => "+N -M"
    };
    const item = new StatusBarItem(context as never, config as never);

    item.setNumRepos(1);
    item.setRepoStatus("feature/status", { modified: 2, deleted: 1 });

    expect(mock.item.text).toBe("$(git-branch) feature/status +2 -1");
    expect(mock.item.tooltip).toBe("View Git Graph: feature/status");
    expect(mock.item.show).toHaveBeenCalled();
  });

  it("keeps dirty counts but hides the branch in icon-only mode", () => {
    const context = { subscriptions: [] };
    const config = {
      showStatusBarItem: () => true,
      statusBarIconOnly: () => true,
      statusBarDirtyIndicator: () => "+N -M"
    };
    const item = new StatusBarItem(context as never, config as never);

    item.setNumRepos(1);
    item.setRepoStatus("feature/status", { modified: 2, deleted: 1 });

    expect(mock.item.text).toBe("$(git-branch) +2 -1");
    expect(mock.item.text).not.toContain("feature/status");
  });

  it("collapses the counts to one asterisk in * mode", () => {
    const item = makeItem("*");
    item.setNumRepos(1);
    item.setRepoStatus("main", { modified: 2, deleted: 1 });

    expect(mock.item.text).toBe("$(git-branch) main *");
  });

  it("shows nothing in * mode when the working tree is clean", () => {
    const item = makeItem("*");
    item.setNumRepos(1);
    item.setRepoStatus("main", { modified: 0, deleted: 0 });

    expect(mock.item.text).toBe("$(git-branch) main");
  });

  it("omits the indicator entirely in none mode, even when dirty", () => {
    const item = makeItem("none");
    item.setNumRepos(1);
    item.setRepoStatus("main", { modified: 5, deleted: 3 });

    expect(mock.item.text).toBe("$(git-branch) main");
  });

  it("omits a zero count rather than printing +0", () => {
    const item = makeItem("+N -M");
    item.setNumRepos(1);
    item.setRepoStatus("main", { modified: 0, deleted: 2 });

    expect(mock.item.text).toBe("$(git-branch) main -2");
  });
});
