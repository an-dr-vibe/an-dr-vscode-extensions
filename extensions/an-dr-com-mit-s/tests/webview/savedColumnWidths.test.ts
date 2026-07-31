import { beforeAll, describe, expect, it, vi } from "vitest";

import type { GitCommitNode } from "@/backend/types";

import { FIXTURE_REPO, viewStateFixture } from "./fixtures";
import { createVscodeMock, receive, setupHtml } from "./setup";

const commits: GitCommitNode[] = [
  {
    hash: "aaa1110000000000000000000000000000000000",
    parentHashes: [],
    author: "Alice",
    email: "alice@example.com",
    date: 1700000000,
    message: "Only commit",
    refs: []
  }
];

/**
 * Re-renders the table with the given saved column widths.
 *
 * The widths are read from repository state on every table render, so they can
 * be swapped through a repository message rather than by rebuilding the view —
 * which also keeps this file to a single import of the webview module.
 */
function renderWithSavedWidths(columnWidths: number[] | null) {
  receive({
    command: "loadRepos",
    repos: { [FIXTURE_REPO]: { columnWidths } },
    lastActiveRepo: FIXTURE_REPO
  });
  receive({
    command: "loadCommits",
    commits,
    head: commits[0].hash,
    moreCommitsAvailable: false,
    hard: true
  });
}

/**
 * A repository whose widths were saved by the previous five-column layout.
 * Applying them positionally indexed past the end of the new header row, which
 * threw part-way through rendering — losing both the click listeners and the
 * graph.
 */
const STALE_FIVE_COLUMN_WIDTHS = [200, 120, 130, 80];

describe("saved column widths", () => {
  beforeAll(async () => {
    vi.resetModules();
    createVscodeMock();
    setupHtml(viewStateFixture());
    await import("@/webview/main");
    receive({
      command: "loadBranches",
      branches: ["main"],
      head: "main",
      hard: true,
      isRepo: true
    });
  });

  it("still renders and wires the table when widths predate the layout", () => {
    renderWithSavedWidths(STALE_FIVE_COLUMN_WIDTHS);

    const row = document.querySelector<HTMLElement>("tr.commit")!;
    expect(row).not.toBeNull();
    // The listeners are attached at the end of the table render, so their
    // effect is what proves the render ran to completion.
    row.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(row.classList.contains("selected")).toBe(true);
  });

  it("discards the stale widths rather than applying them to other columns", () => {
    renderWithSavedWidths(STALE_FIVE_COLUMN_WIDTHS);

    expect(document.getElementById("commitTable")!.className).toBe("autoLayout");
  });

  it("applies widths that do match the current columns", () => {
    renderWithSavedWidths([200, 130, 80]);

    expect(document.getElementById("commitTable")!.className).toBe("fixedLayout");
  });
});
