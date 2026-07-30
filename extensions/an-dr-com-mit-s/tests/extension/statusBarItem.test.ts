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
      statusBarIconOnly: () => false
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
      statusBarIconOnly: () => true
    };
    const item = new StatusBarItem(context as never, config as never);

    item.setNumRepos(1);
    item.setRepoStatus("feature/status", { modified: 2, deleted: 1 });

    expect(mock.item.text).toBe("$(git-branch) +2 -1");
    expect(mock.item.text).not.toContain("feature/status");
  });
});
