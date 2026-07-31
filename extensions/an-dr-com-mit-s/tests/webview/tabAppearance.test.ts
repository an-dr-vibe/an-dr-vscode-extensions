import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GitCommitNode } from "@/backend/types";
import type * as GG from "@/types";

import { createVscodeMock, receive, setupHtml } from "./setup";

const REPO = "/workspace/my-repo";
let vscodeMock: ReturnType<typeof createVscodeMock>;
let messageListener: EventListenerOrEventListenerObject | null = null;

function makeViewState(overrides: Partial<GG.GitGraphViewState> = {}): GG.GitGraphViewState {
  return {
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
    branchPanelGroupsFirst: true,
    branchPanelFlattenSingleChildGroups: true,
    confirmAbortRepoInProgress: true,
    columnVisibility: { Committed: true, ID: true },
    graphColours: ["#0085d9"],
    graphStyle: "rounded",
    initialLoadCommits: 300,
    lastActiveRepo: null,
    loadMoreCommits: 75,
    locale: "en",
    repos: { [REPO]: { columnWidths: null } },
    showCurrentBranchByDefault: false,
    ...overrides
  };
}

const commits: GitCommitNode[] = [
  {
    hash: "abc123def456",
    parentHashes: [],
    author: "Alice",
    email: "alice@example.com",
    date: 1700000000,
    message: "Add feature",
    refs: []
  }
];

/** Boots the real webview against a view state and renders one commit. */
async function render(viewState: GG.GitGraphViewState) {
  if (messageListener !== null) {
    window.removeEventListener("message", messageListener);
  }
  vi.resetModules();
  vscodeMock = createVscodeMock();
  setupHtml(viewState);
  const addEventListener = vi.spyOn(window, "addEventListener");
  await import("@/webview/main");
  messageListener = addEventListener.mock.calls.find(([type]) => type === "message")?.[1] ?? null;
  addEventListener.mockRestore();
  receive({ command: "loadBranches", branches: ["main"], head: "main", hard: true, isRepo: true });
  receive({
    command: "loadCommits",
    commits,
    head: "abc123def456",
    moreCommitsAvailable: false,
    hard: true
  });
}

/** Dispatches a keydown as the given element, or the document body. */
function press(key: string, options: KeyboardEventInit = {}, target?: Element) {
  (target ?? document.body).dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })
  );
}

describe("tab appearance", () => {
  beforeEach(() => {
    document.body.className = "";
  });

  describe("uiDensity", () => {
    it("adds no density class at Big", async () => {
      await render(makeViewState({ uiDensity: "Big" }));
      expect(document.body.classList.contains("compactUi")).toBe(false);
      expect(document.body.classList.contains("extraCompactUi")).toBe(false);
    });

    it("adds only compactUi at Normal", async () => {
      await render(makeViewState({ uiDensity: "Normal" }));
      expect(document.body.classList.contains("compactUi")).toBe(true);
      expect(document.body.classList.contains("extraCompactUi")).toBe(false);
    });

    it("adds both classes at Compact, since the extra rules build on the compact ones", async () => {
      await render(makeViewState({ uiDensity: "Compact" }));
      expect(document.body.classList.contains("compactUi")).toBe(true);
      expect(document.body.classList.contains("extraCompactUi")).toBe(true);
    });
  });

  describe("columnVisibility", () => {
    it("renders all five columns by default", async () => {
      await render(makeViewState());
      expect(document.querySelectorAll("#tableColHeaders th")).toHaveLength(5);
    });

    it("drops the Committed column and its cells together", async () => {
      await render(makeViewState({ columnVisibility: { Committed: false, ID: true } }));

      const headers = Array.from(document.querySelectorAll("#tableColHeaders th"));
      expect(headers).toHaveLength(4);
      // Every row must lose the same cell, or the table misaligns.
      const row = document.querySelector("tr.commit");
      expect(row?.querySelectorAll("td")).toHaveLength(4);
    });

    it("drops the ID column and its cells together", async () => {
      await render(makeViewState({ columnVisibility: { Committed: true, ID: false } }));

      expect(document.querySelectorAll("#tableColHeaders th")).toHaveLength(4);
      expect(document.querySelector("tr.commit")?.querySelectorAll("td")).toHaveLength(4);
      // The abbreviated hash lived in the dropped column.
      expect(document.querySelector("tr.commit")?.textContent).not.toContain("abc123de");
    });

    it("drops both optional columns at once", async () => {
      await render(makeViewState({ columnVisibility: { Committed: false, ID: false } }));

      expect(document.querySelectorAll("#tableColHeaders th")).toHaveLength(3);
      expect(document.querySelector("tr.commit")?.querySelectorAll("td")).toHaveLength(3);
    });
  });
});

describe("refresh shortcut", () => {
  it("refreshes on the configured chord", async () => {
    await render(makeViewState({ refreshShortcutKey: "r" }));
    const before = vscodeMock.sentMessages.length;

    press("r", { ctrlKey: true });

    expect(vscodeMock.sentMessages.length).toBeGreaterThan(before);
  });

  it("accepts the Cmd modifier as well as Ctrl", async () => {
    await render(makeViewState({ refreshShortcutKey: "r" }));
    const before = vscodeMock.sentMessages.length;

    press("r", { metaKey: true });

    expect(vscodeMock.sentMessages.length).toBeGreaterThan(before);
  });

  it("ignores the key without a modifier", async () => {
    await render(makeViewState({ refreshShortcutKey: "r" }));
    const before = vscodeMock.sentMessages.length;

    press("r");

    expect(vscodeMock.sentMessages.length).toBe(before);
  });

  it("ignores a different letter", async () => {
    await render(makeViewState({ refreshShortcutKey: "r" }));
    const before = vscodeMock.sentMessages.length;

    press("q", { ctrlKey: true });

    expect(vscodeMock.sentMessages.length).toBe(before);
  });

  it("registers nothing when the shortcut is unassigned", async () => {
    await render(makeViewState({ refreshShortcutKey: null }));
    const before = vscodeMock.sentMessages.length;

    press("r", { ctrlKey: true });

    expect(vscodeMock.sentMessages.length).toBe(before);
  });

  it("does not steal the chord while typing in a text field", async () => {
    await render(makeViewState({ refreshShortcutKey: "r" }));
    const input = document.createElement("input");
    document.body.append(input);
    const before = vscodeMock.sentMessages.length;

    press("r", { ctrlKey: true }, input);

    expect(vscodeMock.sentMessages.length).toBe(before);
  });
});
