import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { GitCommitNode } from "@/backend/types";
import { UNCOMMITTED } from "@/webview/utils/graphConstants";

import { FIXTURE_REPO, viewStateFixture } from "./fixtures";
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
    document.getElementById("findCloseBtn")?.click();
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

  describe("branch panel actions", () => {
    it("offers the complete local branch action set", () => {
      receive({
        command: "loadBranches",
        branches: ["main", "feature"],
        head: "main",
        hard: true,
        isRepo: true
      });
      document
        .querySelector<HTMLElement>('[data-value="feature"]')!
        .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));

      expect(document.querySelectorAll("#contextMenu .contextMenuItem")).toHaveLength(5);
      expect(document.getElementById("contextMenu")!.textContent).toContain(l10n.renameBranch);
      expect(document.getElementById("contextMenu")!.textContent).toContain(l10n.deleteBranch);
      expect(document.getElementById("contextMenu")!.textContent).toContain(l10n.merge);
    });

    it("checks out a local branch on double-click", () => {
      receive({
        command: "loadBranches",
        branches: ["main", "feature"],
        head: "main",
        hard: true,
        isRepo: true
      });
      document
        .querySelector<HTMLElement>('[data-value="feature"]')!
        .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));

      expect(vscodeMock.sentMessages).toContainEqual({
        command: "checkoutBranch",
        repo: FIXTURE_REPO,
        branchName: "feature",
        remoteBranch: null
      });
    });

    it("does not offer destructive actions for the current branch", () => {
      receive({
        command: "loadBranches",
        branches: ["main", "feature"],
        head: "main",
        hard: true,
        isRepo: true
      });
      document
        .querySelector<HTMLElement>('[data-value="main"]')!
        .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));

      const menu = document.getElementById("contextMenu")!.textContent!;
      expect(menu).toContain(l10n.renameBranch);
      expect(menu).not.toContain(l10n.deleteBranch);
      expect(menu).not.toContain(l10n.merge);
      expect(menu).not.toContain(l10n.checkoutBranch);
    });
  });

  describe("in-progress operation actions", () => {
    beforeEach(() => {
      receive({
        command: "repoInProgress",
        state: {
          type: "rebase",
          subject: null,
          rebaseProgress: null,
          rebaseContext: null,
          workingTreeStatus: null
        }
      });
    });

    it("continues immediately", () => {
      document.querySelector<HTMLElement>('[data-action="continue"]')!.click();
      expect(vscodeMock.sentMessages).toContainEqual({
        command: "inProgressAction",
        operationType: "rebase",
        action: "continue"
      });
    });

    it("confirms before aborting", () => {
      document.querySelector<HTMLElement>('[data-action="abort"]')!.click();
      expect(vscodeMock.sentMessages).not.toContainEqual(
        expect.objectContaining({ command: "inProgressAction", action: "abort" })
      );

      document.getElementById("dialogAction")!.click();
      expect(vscodeMock.sentMessages).toContainEqual({
        command: "inProgressAction",
        operationType: "rebase",
        action: "abort"
      });
    });

    it("aborts without a dialog when the confirmation setting is off", () => {
      // Read at click time from the injected view state, so the setting can be
      // flipped on the live view rather than rebuilding it.
      globalThis.viewState.confirmAbortRepoInProgress = false;
      try {
        document.querySelector<HTMLElement>('[data-action="abort"]')!.click();

        expect(document.getElementById("dialog")!.classList.contains("active")).toBe(false);
        expect(vscodeMock.sentMessages).toContainEqual({
          command: "inProgressAction",
          operationType: "rebase",
          action: "abort"
        });
      } finally {
        globalThis.viewState.confirmAbortRepoInProgress = true;
      }
    });

    it("refreshes after success and shows Git failures", () => {
      receive({ command: "inProgressAction", status: null });
      expect(vscodeMock.sentMessages).toContainEqual(
        expect.objectContaining({ command: "loadBranches" })
      );

      receive({ command: "inProgressAction", status: "resolve conflicts first" });
      expect(document.getElementById("dialog")!.textContent).toContain("resolve conflicts first");
    });
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
      expect(btns!.querySelectorAll(".roundedBtn")).toHaveLength(5);
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

  describe("find widget wiring", () => {
    it("finds metadata that is attached to the rendered commit row", () => {
      document.getElementById("findBtn")!.click();
      const findInput = document.getElementById("findInput") as HTMLInputElement;
      findInput.value = "alice@example.com";
      findInput.dispatchEvent(new Event("input"));

      expect(document.querySelectorAll("tr.findMatch")).toHaveLength(1);
      expect(document.querySelector("tr.findCurrentMatch")?.getAttribute("data-hash")).toBe(
        commits[0].hash
      );
    });

    it("searches only rows left visible by the commit filter", () => {
      document.getElementById("findBtn")!.click();
      const findInput = document.getElementById("findInput") as HTMLInputElement;
      findInput.value = "toolbar";
      findInput.dispatchEvent(new Event("input"));
      expect(document.querySelectorAll("tr.findMatch")).toHaveLength(1);

      typeFilter("initial");
      expect(document.querySelectorAll("tr.findMatch")).toHaveLength(0);
      expect(document.getElementById("findMatchCount")!.textContent).toBe(l10n.findNoMatches);
    });
  });
});
