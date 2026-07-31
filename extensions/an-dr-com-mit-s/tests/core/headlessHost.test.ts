import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { commitComparison } from "@an-dr/commits-core/backend/queries/commitComparison";
import { fullDiffContent } from "@an-dr/commits-core/backend/queries/fullDiffContent";
import { loadCommits } from "@an-dr/commits-core/backend/queries/loadCommits";
import { createMemoryHost } from "@an-dr/commits-core/host/memoryHost";
import { simpleGit } from "simple-git";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { git, makeRepo } from "@tests/backend/helpers";

let repo: string;
let head: string;

beforeAll(() => {
  repo = makeRepo();
  fs.writeFileSync(path.join(repo, "f"), "one\ntwo\n");
  git(["commit", "-am", "second"], repo);
  head = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
});

afterAll(() => {
  try {
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    /* the OS reclaims the temp directory */
  }
});

/**
 * These tests are the point of the host port: they exercise the core with no
 * VS Code anywhere, which is what a standalone Git client will do. A leak the
 * lint rule cannot see — code that only works because VS Code happened to be
 * loaded — fails here.
 */
describe("the core under a non-VS Code host", () => {
  it("cannot load the vscode module at all", async () => {
    // Nothing under test may depend on this resolving.
    await expect(import("vscode")).rejects.toThrow();
  });

  it("reads Git history with only simple-git and the host port", async () => {
    createMemoryHost({ rootPaths: [repo] });

    const result = await loadCommits(simpleGit(repo), {
      branchName: "",
      maxCommits: 10,
      showRemoteBranches: true,
      hard: true,
      dateType: "Author Date",
      showUncommittedChanges: false
    });

    expect(result.commits.length).toBeGreaterThan(0);
    expect(result.head).toBe(head);
  });

  it("answers a file diff and a commit comparison", async () => {
    const diff = await fullDiffContent(simpleGit(repo), {
      repo,
      fromHash: head,
      toHash: head,
      oldFilePath: "f",
      newFilePath: "f",
      type: "M"
    });
    expect(diff.newContent).toBe("one\ntwo\n");

    const comparison = await commitComparison(simpleGit(repo), { fromHash: head, toHash: head });
    expect(comparison.error).toBeNull();
  });

  it("serves settings, storage and the active repository through the port", () => {
    const host = createMemoryHost({
      settings: { "an-dr-com-mit-s.initialLoadCommits": 42 },
      activeRepoHint: repo
    });

    expect(host.port.config.get("an-dr-com-mit-s", "initialLoadCommits", 300)).toBe(42);
    expect(host.port.config.get("an-dr-com-mit-s", "missing", "fallback")).toBe("fallback");
    expect(host.port.workspace.getActiveRepoHint()).toBe(repo);

    void host.port.storage.workspace.update("k", { a: 1 });
    expect(host.port.storage.workspace.get("k", null)).toEqual({ a: 1 });
  });

  it("reports configuration changes to whoever is listening", () => {
    const host = createMemoryHost();
    const seen: boolean[] = [];
    host.port.config.onDidChange((event) =>
      seen.push(event.affects("an-dr-com-mit-s", "uiDensity"))
    );

    host.setSetting("an-dr-com-mit-s.uiDensity", "Compact");
    host.setSetting("an-dr-com-mit-s.graphStyle", "angular");

    expect(seen).toEqual([true, false]);
  });

  it("drives the file watcher without a file system watcher", () => {
    const host = createMemoryHost();
    const changes: string[] = [];
    const subscription = host.port.watcher.watch(repo, (changed) => changes.push(changed));

    host.emitFileChange(repo, `${repo}/f`);
    expect(changes).toEqual([`${repo}/f`]);

    subscription.dispose();
    expect(host.watchedRepos()).toEqual([]);
  });

  it("collects what the core asked the user interface to do", async () => {
    const host = createMemoryHost();

    await host.port.ui.showError("boom");
    await host.port.ui.copyToClipboard("abc123");
    await host.port.ui.openExternal("https://example.test");

    expect(host.errors).toEqual(["boom"]);
    expect(host.clipboard).toEqual(["abc123"]);
    expect(host.opened).toEqual(["https://example.test"]);
  });
});
