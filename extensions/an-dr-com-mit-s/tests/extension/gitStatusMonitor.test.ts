import type { WorkspacePort } from "@an-dr/commits-core/host/port";
import type { GitRepoSet } from "@an-dr/commits-core/types";
import { describe, expect, it, vi } from "vitest";

import type { DataSource } from "@/dataSource";
import type { RepoManager } from "@/extension/repoManager";
import type { ExtensionState } from "@/extensionState";
import { GitStatusMonitor } from "@/gitStatusMonitor";
import type { StatusBarItem } from "@/statusBarItem";

function createRepoManager(initial: GitRepoSet) {
  let repos = initial;
  let listener: (() => void) | null = null;
  return {
    manager: {
      getRepos: () => repos,
      onDidChangeRepos: (next: () => void) => {
        listener = next;
        return { dispose: () => (listener = null) };
      }
    } as unknown as RepoManager,
    publish(next: GitRepoSet) {
      repos = next;
      listener?.();
    }
  };
}

function createWatcher() {
  return { start: vi.fn(), stop: vi.fn() };
}

/** A workspace host that reports no active path and no roots. */
function idleWorkspace(): WorkspacePort {
  return {
    getRootPaths: () => [],
    onDidChangeRootPaths: () => ({ dispose: vi.fn() }),
    getActiveRepoHint: () => null,
    onDidChangeActiveRepoHint: () => ({ dispose: vi.fn() })
  };
}

describe("GitStatusMonitor", () => {
  it("follows persisted and explicit repository selection", async () => {
    const repos = createRepoManager({
      "C:/alpha": { columnWidths: null },
      "C:/zeta": { columnWidths: null }
    });
    const dataSource = {
      getHeadInfo: vi.fn((repo: string) =>
        Promise.resolve({
          branchName: repo.endsWith("alpha") ? "main" : "feature",
          headHash: "abc",
          upstreamRemote: null,
          upstreamRef: null,
          remoteNames: []
        })
      ),
      getStatusCounts: vi.fn((repo: string) =>
        Promise.resolve(
          repo.endsWith("alpha") ? { modified: 1, deleted: 0 } : { modified: 0, deleted: 2 }
        )
      )
    };
    const extensionState = {
      getLastActiveRepo: vi.fn(() => "C:/alpha"),
      setLastActiveRepo: vi.fn()
    };
    const statusBar = { setRepoStatus: vi.fn() };
    const watcher = createWatcher();
    const monitor = new GitStatusMonitor(
      dataSource as unknown as DataSource,
      extensionState as unknown as ExtensionState,
      repos.manager,
      statusBar as unknown as StatusBarItem,
      idleWorkspace(),
      () => watcher
    );

    await vi.waitFor(() =>
      expect(monitor.getStatus()).toEqual({
        repo: "C:/alpha",
        branchName: "main",
        counts: { modified: 1, deleted: 0 }
      })
    );
    monitor.selectRepo("C:/zeta");
    await vi.waitFor(() =>
      expect(monitor.getStatus()).toEqual({
        repo: "C:/zeta",
        branchName: "feature",
        counts: { modified: 0, deleted: 2 }
      })
    );

    expect(extensionState.setLastActiveRepo).toHaveBeenCalledWith("C:/zeta");
    expect(watcher.start).toHaveBeenNthCalledWith(1, "C:/alpha");
    expect(watcher.start).toHaveBeenNthCalledWith(2, "C:/zeta");

    repos.publish({});
    expect(monitor.getStatus()).toEqual({
      repo: null,
      branchName: null,
      counts: { modified: 0, deleted: 0 }
    });
    expect(watcher.stop).toHaveBeenCalled();

    repos.publish({
      "C:/alpha": { columnWidths: null },
      "C:/zeta": { columnWidths: null }
    });
    await vi.waitFor(() => expect(monitor.getStatus().repo).toBe("C:/alpha"));
    monitor.dispose();
  });

  it("ignores a stale refresh after the active repository changes", async () => {
    let resolveHead!: (value: never) => void;
    let resolveCounts!: (value: never) => void;
    const oldHead = new Promise((resolve) => (resolveHead = resolve));
    const oldCounts = new Promise((resolve) => (resolveCounts = resolve));
    const repos = createRepoManager({ "C:/old": { columnWidths: null } });
    const dataSource = {
      getHeadInfo: vi.fn((repo: string) =>
        repo === "C:/old"
          ? oldHead
          : Promise.resolve({
              branchName: "new",
              headHash: "def",
              upstreamRemote: null,
              upstreamRef: null,
              remoteNames: []
            })
      ),
      getStatusCounts: vi.fn((repo: string) =>
        repo === "C:/old" ? oldCounts : Promise.resolve({ modified: 3, deleted: 0 })
      )
    };
    const statusBar = { setRepoStatus: vi.fn() };
    const monitor = new GitStatusMonitor(
      dataSource as unknown as DataSource,
      {
        getLastActiveRepo: () => null,
        setLastActiveRepo: vi.fn()
      } as unknown as ExtensionState,
      repos.manager,
      statusBar as unknown as StatusBarItem,
      idleWorkspace(),
      () => createWatcher()
    );

    repos.publish({ "C:/new": { columnWidths: null } });
    await vi.waitFor(() => expect(monitor.getStatus().branchName).toBe("new"));
    resolveHead({
      branchName: "old",
      headHash: "abc",
      upstreamRemote: null,
      upstreamRef: null,
      remoteNames: []
    } as never);
    resolveCounts({ modified: 0, deleted: 9 } as never);
    await Promise.all([oldHead, oldCounts]);

    expect(monitor.getStatus()).toEqual({
      repo: "C:/new",
      branchName: "new",
      counts: { modified: 3, deleted: 0 }
    });
    monitor.dispose();
  });

  it("falls back to the repository containing the active editor", async () => {
    const repos = createRepoManager({
      "C:/alpha": { columnWidths: null },
      "C:/zeta": { columnWidths: null }
    });
    let activeFile = "C:/zeta/src/file.ts";
    // Held in an object so TypeScript does not narrow it to null: the
    // assignment below happens inside a callback it cannot prove runs.
    const captured: { editorListener: (() => void) | null } = { editorListener: null };
    const monitor = new GitStatusMonitor(
      {
        getHeadInfo: vi.fn(() => Promise.resolve(null)),
        getStatusCounts: vi.fn(() => Promise.resolve({ modified: 0, deleted: 0 }))
      } as unknown as DataSource,
      {
        getLastActiveRepo: () => null,
        setLastActiveRepo: vi.fn()
      } as unknown as ExtensionState,
      repos.manager,
      { setRepoStatus: vi.fn() } as unknown as StatusBarItem,
      {
        getRootPaths: () => [],
        onDidChangeRootPaths: () => ({ dispose: vi.fn() }),
        getActiveRepoHint: () => activeFile,
        onDidChangeActiveRepoHint: (listener: () => void) => {
          captured.editorListener = listener;
          return { dispose: vi.fn() };
        }
      },
      () => createWatcher()
    );

    await vi.waitFor(() => expect(monitor.getStatus().repo).toBe("C:/zeta"));
    activeFile = "C:/alpha/README.md";
    captured.editorListener?.();
    await vi.waitFor(() => expect(monitor.getStatus().repo).toBe("C:/alpha"));
    monitor.dispose();
  });
});
