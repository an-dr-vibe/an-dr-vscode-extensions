import * as fs from "node:fs";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import * as vscode from "vscode";

import { gitClientFactory } from "@/backend/gitClient";
import { DataSource } from "@/dataSource";

import { git, makeRepo } from "@tests/backend/helpers";

const cleanup: string[] = [];
const DEFAULT_OPTIONS = { ignoreWhitespace: false, detectMoveOrCopyFromOtherFiles: 0 };

afterEach(() => {
  while (cleanup.length > 0) {
    const dir = cleanup.pop();
    if (dir === undefined) {
      continue;
    }
    for (let attempt = 0; fs.existsSync(dir) && attempt < 5; attempt++) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* Windows may still hold a handle from a just-exited git process. */
      }
    }
  }
});

function makeDataSource(repo: string) {
  return new DataSource(gitClientFactory(repo, "git"), () => "git");
}

/** A cancellation token that is already, or can later be, cancelled. */
function makeToken() {
  const listeners: Array<() => void> = [];
  let cancelled = false;
  const token = {
    get isCancellationRequested() {
      return cancelled;
    },
    onCancellationRequested: (listener: () => void) => {
      listeners.push(listener);
      return { dispose: () => {} };
    }
  } as unknown as vscode.CancellationToken;
  return {
    token,
    cancel: () => {
      cancelled = true;
      for (const listener of listeners) {
        listener();
      }
    }
  };
}

describe("DataSource.getBlameFile", () => {
  it("reports the author of every line of a committed file", async () => {
    const repo = makeRepo();
    cleanup.push(repo);
    fs.writeFileSync(path.join(repo, "blamed.txt"), "one\ntwo\nthree\n");
    git(["add", "."], repo);
    git(["commit", "-m", "add blamed"], repo);

    const blame = await makeDataSource(repo).getBlameFile(
      repo,
      path.join(repo, "blamed.txt"),
      DEFAULT_OPTIONS
    );

    expect(blame.size).toBe(3);
    expect(blame.get(0)?.author).toBe("T");
    expect(blame.get(0)?.committed).toBe(true);
    expect(blame.get(2)?.summary).toBe("add blamed");
  });

  it("accepts a repo-relative path as well as an absolute one", async () => {
    const repo = makeRepo();
    cleanup.push(repo);
    fs.writeFileSync(path.join(repo, "blamed.txt"), "one\n");
    git(["add", "."], repo);
    git(["commit", "-m", "add blamed"], repo);

    const blame = await makeDataSource(repo).getBlameFile(repo, "blamed.txt", DEFAULT_OPTIONS);

    expect(blame.size).toBe(1);
  });

  it("marks uncommitted lines as not committed", async () => {
    const repo = makeRepo();
    cleanup.push(repo);
    fs.writeFileSync(path.join(repo, "blamed.txt"), "committed\n");
    git(["add", "."], repo);
    git(["commit", "-m", "add blamed"], repo);
    fs.appendFileSync(path.join(repo, "blamed.txt"), "working tree only\n");

    const blame = await makeDataSource(repo).getBlameFile(
      repo,
      path.join(repo, "blamed.txt"),
      DEFAULT_OPTIONS
    );

    expect(blame.get(0)?.committed).toBe(true);
    expect(blame.get(1)?.committed).toBe(false);
  });

  it("resolves empty for a path Git cannot blame", async () => {
    const repo = makeRepo();
    cleanup.push(repo);

    const blame = await makeDataSource(repo).getBlameFile(
      repo,
      path.join(repo, "missing.txt"),
      DEFAULT_OPTIONS
    );

    expect(blame.size).toBe(0);
  });

  it("resolves empty when cancelled rather than rejecting", async () => {
    const repo = makeRepo();
    cleanup.push(repo);
    fs.writeFileSync(path.join(repo, "blamed.txt"), "one\n");
    git(["add", "."], repo);
    git(["commit", "-m", "add blamed"], repo);

    const { token, cancel } = makeToken();
    const pending = makeDataSource(repo).getBlameFile(
      repo,
      path.join(repo, "blamed.txt"),
      DEFAULT_OPTIONS,
      token
    );
    cancel();

    await expect(pending).resolves.toEqual(new Map());
  });

  it("passes the ignore-whitespace and move-detection options without failing", async () => {
    const repo = makeRepo();
    cleanup.push(repo);
    fs.writeFileSync(path.join(repo, "blamed.txt"), "  spaced\n");
    git(["add", "."], repo);
    git(["commit", "-m", "add blamed"], repo);

    const blame = await makeDataSource(repo).getBlameFile(repo, path.join(repo, "blamed.txt"), {
      ignoreWhitespace: true,
      detectMoveOrCopyFromOtherFiles: 2
    });

    expect(blame.size).toBe(1);
  });
});
