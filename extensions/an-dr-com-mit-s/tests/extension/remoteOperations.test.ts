import * as fs from "node:fs";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

import {
  createRemoteCommands,
  type RemoteOperation,
  runRemoteOperationWithGit
} from "@/extension/remoteOperations";
import { GitStatusMonitor } from "@/gitStatusMonitor";

import { git, makeRepo } from "@tests/backend/helpers";

const cleanup: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
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

/** A clone with `origin` pointing at a real local repository. */
function makeCloneWithRemote() {
  const origin = makeRepo();
  const clone = makeRepo();
  cleanup.push(origin, clone);
  git(["remote", "add", "origin", origin], clone);
  return { origin, clone };
}

/** A status monitor stub exposing only what createRemoteCommands uses. */
function makeMonitor(repo: string | null) {
  let refreshed = 0;
  const monitor = {
    getStatus: () => ({ repo, branchName: null, counts: { modified: 0, deleted: 0 } }),
    refreshStatus: () => {
      refreshed++;
    }
  };
  return { monitor: monitor as unknown as GitStatusMonitor, getRefreshed: () => refreshed };
}

describe("runRemoteOperationWithGit", () => {
  it("fetches from a real remote and reports no error", async () => {
    const { clone } = makeCloneWithRemote();
    const run = runRemoteOperationWithGit(() => "git");

    await expect(run("fetch", clone, {})).resolves.toBeNull();
  });

  it("returns the Git error message when the remote is unreachable", async () => {
    const repo = makeRepo();
    cleanup.push(repo);
    // A repo with no remote at all makes `git fetch` a silent no-op, so point
    // origin at a path that cannot be a repository.
    git(["remote", "add", "origin", path.join(repo, "does-not-exist")], repo);
    const run = runRemoteOperationWithGit(() => "git");

    const error = await run("fetch", repo, {});
    expect(error).not.toBeNull();
    expect(String(error)).toMatch(/repository|not found|does-not-exist/i);
  });

  it("pushes a new commit to the remote", async () => {
    const { origin, clone } = makeCloneWithRemote();
    git(["fetch", "origin"], clone);
    fs.writeFileSync(path.join(clone, "new.txt"), "content");
    git(["add", "."], clone);
    git(["commit", "-m", "add"], clone);
    git(["branch", "--set-upstream-to=origin/main", "main"], clone);
    // Pushing to a checked-out branch is refused by default; make it a bare target.
    git(["config", "receive.denyCurrentBranch", "ignore"], origin);

    const run = runRemoteOperationWithGit(() => "git");
    await expect(run("push", clone, {})).resolves.toBeNull();
  });

  it("applies the askpass environment to the Git process", async () => {
    const { clone } = makeCloneWithRemote();
    const run = runRemoteOperationWithGit(() => "git");

    // A bogus GIT_ASKPASS is harmless here because the local remote needs no
    // credentials; this asserts the env is accepted, not that it is invoked.
    await expect(run("fetch", clone, { GIT_ASKPASS: "/nonexistent" })).resolves.toBeNull();
  });
});

describe("createRemoteCommands", () => {
  it("refuses to run without a selected repository, and says so", async () => {
    const shown = vi.spyOn(vscode.window, "showErrorMessage");
    const { monitor } = makeMonitor(null);
    const run = vi.fn();
    const commands = createRemoteCommands(monitor, () => ({}), run);

    await commands.fetch();

    expect(run).not.toHaveBeenCalled();
    expect(shown).toHaveBeenCalled();
  });

  it("passes the askpass environment to the operation", async () => {
    const { monitor } = makeMonitor("/repo");
    const calls: Array<[RemoteOperation, string, Record<string, string>]> = [];
    const commands = createRemoteCommands(
      monitor,
      () => ({ GIT_ASKPASS: "/ask" }),
      async (operation, repo, env) => {
        calls.push([operation, repo, env as Record<string, string>]);
        return null;
      }
    );

    await commands.pull();

    expect(calls).toEqual([["pull", "/repo", { GIT_ASKPASS: "/ask" }]]);
  });

  it("surfaces a Git failure instead of failing silently", async () => {
    const shown = vi.spyOn(vscode.window, "showErrorMessage");
    const { monitor } = makeMonitor("/repo");
    const commands = createRemoteCommands(
      monitor,
      () => ({}),
      async () => "authentication failed"
    );

    await commands.push();

    expect(shown).toHaveBeenCalled();
    expect(String(shown.mock.calls[0]?.[0])).toContain("authentication failed");
  });

  it("refreshes repository status after both success and failure", async () => {
    const ok = makeMonitor("/repo");
    await createRemoteCommands(
      ok.monitor,
      () => ({}),
      async () => null
    ).fetch();
    expect(ok.getRefreshed()).toBe(1);

    const failed = makeMonitor("/repo");
    await createRemoteCommands(
      failed.monitor,
      () => ({}),
      async () => "boom"
    ).fetch();
    expect(failed.getRefreshed()).toBe(1);
  });

  it("exposes all three remote operations", async () => {
    const { monitor } = makeMonitor("/repo");
    const seen: RemoteOperation[] = [];
    const commands = createRemoteCommands(
      monitor,
      () => ({}),
      async (operation) => {
        seen.push(operation);
        return null;
      }
    );

    await commands.fetch();
    await commands.pull();
    await commands.push();

    expect(seen).toEqual(["fetch", "pull", "push"]);
  });
});
