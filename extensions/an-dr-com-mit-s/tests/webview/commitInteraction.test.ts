import type { GitCommitNode } from "@an-dr/commits-core/backend/types";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FIXTURE_REPO, viewStateFixture } from "./fixtures";
import { createVscodeMock, receive, setupHtml } from "./setup";

let vscodeMock: ReturnType<typeof createVscodeMock>;

const commits: GitCommitNode[] = [
  {
    hash: "aaa1110000000000000000000000000000000000",
    parentHashes: ["bbb2220000000000000000000000000000000000"],
    author: "Alice",
    email: "alice@example.com",
    date: 1700000000,
    message: "Newer",
    refs: []
  },
  {
    hash: "bbb2220000000000000000000000000000000000",
    parentHashes: [],
    author: "Bob",
    email: "bob@example.com",
    date: 1699000000,
    message: "Older",
    refs: []
  }
];

function row(hash: string): HTMLElement {
  return document.querySelector<HTMLElement>(`tr.commit[data-hash="${hash}"]`)!;
}

function click(hash: string, init: MouseEventInit = {}) {
  row(hash).dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
}

function escape() {
  document.dispatchEvent(new KeyboardEvent("keyup", { key: "Escape", bubbles: true }));
}

function sentCommands(): string[] {
  return vscodeMock.sentMessages.map((message) => message.command);
}

describe("commit row interaction", () => {
  beforeAll(async () => {
    vi.resetModules();
    vscodeMock = createVscodeMock();
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

  beforeEach(() => {
    escape();
    escape();
    receive({
      command: "loadCommits",
      commits,
      head: commits[0].hash,
      moreCommitsAvailable: false,
      hard: true
    });
    vscodeMock.clearMessages();
  });

  it("selects and previews on a single click, without opening the commit", () => {
    click(commits[0].hash);

    expect(row(commits[0].hash).classList.contains("selected")).toBe(true);
    expect(document.getElementById("commitDetails")).toBeNull();
    expect(sentCommands()).toContain("commitDetails");
  });

  it("opens the commit on a double click and closes it on a second", () => {
    row(commits[0].hash).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    receive({
      command: "commitDetails",
      commitDetails: {
        hash: commits[0].hash,
        parents: [],
        author: "Alice",
        email: "alice@example.com",
        date: 1700000000,
        committer: "Alice",
        body: "Newer",
        fileChanges: []
      }
    });
    expect(document.getElementById("commitDetails")).not.toBeNull();

    row(commits[0].hash).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(document.getElementById("commitDetails")).toBeNull();
  });

  it("asks for the comparison once a second commit is picked with Ctrl", () => {
    click(commits[0].hash);
    vscodeMock.clearMessages();

    click(commits[1].hash, { ctrlKey: true });

    expect(vscodeMock.sentMessages).toContainEqual({
      command: "commitComparison",
      repo: FIXTURE_REPO,
      // Table order is newest-first, so the second row is the older side.
      fromHash: commits[1].hash,
      toHash: commits[0].hash
    });
    expect(row(commits[0].hash).classList.contains("selected")).toBe(true);
    expect(row(commits[1].hash).classList.contains("selected")).toBe(true);
  });

  it("folds an open commit before it gives up the selection", () => {
    click(commits[0].hash);
    row(commits[0].hash).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    receive({
      command: "commitDetails",
      commitDetails: {
        hash: commits[0].hash,
        parents: [],
        author: "Alice",
        email: "alice@example.com",
        date: 1700000000,
        committer: "Alice",
        body: "Newer",
        fileChanges: []
      }
    });

    escape();
    // First Escape folds the row; the commit stays selected.
    expect(document.getElementById("commitDetails")).toBeNull();
    expect(row(commits[0].hash).classList.contains("selected")).toBe(true);

    escape();
    expect(row(commits[0].hash).classList.contains("selected")).toBe(false);
  });
});
