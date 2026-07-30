import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GitCommitNode } from "@/backend/types";
import type * as GG from "@/types";

import { createVscodeMock, receive, setupHtml } from "./setup";

const REPO = "/workspace/my-repo";

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
  vi.resetModules();
  createVscodeMock();
  setupHtml(viewState);
  await import("@/webview/main");
  receive({ command: "loadBranches", branches: ["main"], head: "main", hard: true, isRepo: true });
  receive({
    command: "loadCommits",
    commits,
    head: "abc123def456",
    moreCommitsAvailable: false,
    hard: true
  });
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

      const headers = [...document.querySelectorAll("#tableColHeaders th")];
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
