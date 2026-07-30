import { beforeAll, describe, expect, it, vi } from "vitest";

import type { GitCommitNode } from "@/backend/types";
import type * as GG from "@/types";

import { createVscodeMock, receive, setupHtml } from "./setup";

const REPO = "/workspace/my-repo";
let vscodeMock: ReturnType<typeof createVscodeMock>;

const defaultViewState: GG.GitGraphViewState = {
  autoCenterCommitDetailsView: true,
  dateFormat: "Date & Time",
  fetchAvatars: false,
  fileIcons: {},
  graphColours: ["#0085d9"],
  graphStyle: "rounded",
  initialLoadCommits: 300,
  lastActiveRepo: null,
  loadMoreCommits: 75,
  locale: "en",
  repos: { [REPO]: { columnWidths: null } },
  showCurrentBranchByDefault: false
};

const twoCommits: GitCommitNode[] = [
  {
    hash: "abc123",
    parentHashes: ["def456"],
    author: "Alice",
    email: "alice@example.com",
    date: 1700000000,
    message: "Add feature",
    refs: [
      { hash: "abc123", name: "main", type: "head" },
      { hash: "abc123", name: "v1.0.0", type: "tag" }
    ]
  },
  {
    hash: "def456",
    parentHashes: [],
    author: "Bob",
    email: "bob@example.com",
    date: 1699000000,
    message: "Initial commit",
    refs: []
  }
];

describe("webview rendering", () => {
  beforeAll(async () => {
    vi.resetModules();
    vscodeMock = createVscodeMock();
    setupHtml(defaultViewState);
    await import("@/webview/main");
    receive({
      command: "loadBranches",
      branches: ["main"],
      head: "main",
      hard: true,
      isRepo: true
    });
    receive({
      command: "loadCommits",
      commits: twoCommits,
      head: "abc123",
      moreCommitsAvailable: true,
      hard: true
    });
  });

  it("shows Load More Commits button when more commits are available", () => {
    expect(document.getElementById("loadMoreCommitsBtn")).not.toBeNull();
  });

  it("renders a tag ref through the shared tag pill", () => {
    // Drives renderTagPill through the real commit-table render path rather
    // than calling it directly, so a conversion that compiles but is never
    // reached would still fail here.
    const tag = document.querySelector('.gitRef.tag[data-name="v1.0.0"]');
    expect(tag).not.toBeNull();
    expect(tag?.getAttribute("data-drag-ref-type")).toBe("tag");
    expect(tag?.querySelector('.gitRefName[data-fullref="v1.0.0"]')).not.toBeNull();
  });

  it("still renders non-tag refs with the branch markup", () => {
    const head = document.querySelector('.gitRef.head[data-name="main"]');
    expect(head).not.toBeNull();
  });

  it("routes rendered external links through the extension host", () => {
    vscodeMock.clearMessages();
    const link = document.createElement("a");
    link.href = "mailto:alice@example.com";
    link.textContent = "Alice";
    document.body.append(link);

    link.click();

    expect(vscodeMock.sentMessages).toEqual([
      { command: "openExternalUrl", url: "mailto:alice@example.com" }
    ]);
  });
});
