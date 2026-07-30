import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { GitCommitNode } from "@/backend/types";
import { UNCOMMITTED } from "@/webview/utils/graphConstants";

import { viewStateFixture } from "./fixtures";
import { createVscodeMock, receive, setupHtml } from "./setup";

let vscodeMock: ReturnType<typeof createVscodeMock>;

const viewState = viewStateFixture();

const commits: GitCommitNode[] = [
  {
    hash: "aaa1110000000000000000000000000000000000",
    parentHashes: ["bbb222"],
    author: "Alice Smith",
    email: "alice@example.com",
    date: 1700000000,
    message: "Add the toolbar",
    refs: []
  },
  {
    hash: "bbb2220000000000000000000000000000000000",
    parentHashes: [],
    author: "Bob Jones",
    email: "bob@corp.test",
    date: 1699000000,
    message: "Initial commit",
    refs: []
  }
];

/** Hash of every commit row currently visible to the user. */
function visibleHashes(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>("tr.commit"))
    .filter((row) => !row.classList.contains("filterHidden"))
    .map((row) => row.dataset.hash ?? "");
}

function filterInput(): HTMLInputElement {
  return document.getElementById("commitFilter") as HTMLInputElement;
}

function typeFilter(text: string) {
  const elem = filterInput();
  elem.value = text;
  elem.dispatchEvent(new Event("input"));
}

describe("tab toolbar", () => {
  // The view registers window listeners that outlive a module reset, so it is
  // constructed once and each test resets its state through the real messages.
  beforeAll(async () => {
    vi.resetModules();
    vscodeMock = createVscodeMock();
    setupHtml(viewState);
    await import("@/webview/main");
    receive({
      command: "loadBranches",
      branches: ["main"],
      head: "main",
      hard: true,
      isRepo: true
    });
  });

  beforeEach(() => {
    typeFilter("");
    receive({
      command: "loadCommits",
      commits,
      head: commits[0].hash,
      moreCommitsAvailable: false,
      hard: true
    });
    vscodeMock.clearMessages();
  });

  describe("remote operation buttons", () => {
    // The toolbar and the command palette run the same handlers in the
    // extension, so a button only has to name the operation correctly.
    it.each([
      ["fetchBtn", "fetch"],
      ["pullBtn", "pull"],
      ["pushBtn", "push"]
    ])("%s requests the %s operation", (id, operation) => {
      document.getElementById(id)!.dispatchEvent(new MouseEvent("click"));
      expect(vscodeMock.sentMessages).toContainEqual({
        command: "remoteOperation",
        operation
      });
    });

    it("renders the buttons through the real panel HTML", () => {
      const btns = document.getElementById("controlsBtns");
      expect(btns).not.toBeNull();
      expect(btns!.querySelectorAll(".roundedBtn")).toHaveLength(4);
    });
  });

  describe("commit filter", () => {
    it("shows every commit before anything is typed", () => {
      expect(visibleHashes()).toHaveLength(2);
      expect(document.body.classList.contains("commitFilterActive")).toBe(false);
    });

    it("matches on the commit message", () => {
      typeFilter("toolbar");
      expect(visibleHashes()).toEqual([commits[0].hash]);
    });

    it("matches case-insensitively", () => {
      typeFilter("INITIAL");
      expect(visibleHashes()).toEqual([commits[1].hash]);
    });

    it("matches on the author name", () => {
      typeFilter("Bob");
      expect(visibleHashes()).toEqual([commits[1].hash]);
    });

    it("matches on the author email", () => {
      typeFilter("corp.test");
      expect(visibleHashes()).toEqual([commits[1].hash]);
    });

    it("matches a hash prefix but not a hash fragment", () => {
      typeFilter("aaa111");
      expect(visibleHashes()).toEqual([commits[0].hash]);
      // A mid-hash substring is not something a user can meaningfully search
      // for, and matching it would make short queries hit unrelated commits.
      typeFilter("1110000");
      expect(visibleHashes()).toEqual([]);
    });

    it("hides everything when nothing matches", () => {
      typeFilter("no-such-commit");
      expect(visibleHashes()).toEqual([]);
    });

    it("restores every commit when the filter is cleared", () => {
      typeFilter("toolbar");
      typeFilter("");
      expect(visibleHashes()).toHaveLength(2);
      expect(document.body.classList.contains("commitFilterActive")).toBe(false);
    });

    it("clears the filter on Escape", () => {
      typeFilter("toolbar");
      filterInput().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(filterInput().value).toBe("");
      expect(visibleHashes()).toHaveLength(2);
    });

    it("marks the body so the graph can be hidden while filtering", () => {
      // The graph is positioned against row offsets, so it cannot stay visible
      // once rows are hidden; the class is what the stylesheet keys off.
      typeFilter("toolbar");
      expect(document.body.classList.contains("commitFilterActive")).toBe(true);
    });

    it("hides the uncommitted row, which can never match", () => {
      receive({
        command: "loadCommits",
        commits: [
          { ...commits[0], hash: UNCOMMITTED, message: "Uncommitted Changes (1)", refs: [] },
          ...commits
        ],
        head: commits[0].hash,
        moreCommitsAvailable: false,
        hard: true
      });
      expect(document.querySelector(".unsavedChanges")).not.toBeNull();
      typeFilter("toolbar");
      expect(document.querySelector(".unsavedChanges")!.classList.contains("filterHidden")).toBe(
        true
      );
    });

    it("keeps filtering after the table re-renders", () => {
      // Rendering replaces every row, so a refresh or "load more" would
      // otherwise reveal commits the user has filtered out.
      typeFilter("toolbar");
      receive({
        command: "loadCommits",
        commits,
        head: commits[0].hash,
        moreCommitsAvailable: false,
        hard: true
      });
      expect(visibleHashes()).toEqual([commits[0].hash]);
    });
  });
});
