import * as assert from "node:assert";
import * as fs from "node:fs";

import { Config } from "@/config";
import { createRepoManager } from "@/extension/repoManager";
import { ExtensionState } from "@/extensionState";
import { StatusBarItem } from "@/statusBarItem";
import { GitRepoSet } from "@/types";

import { makeRepo } from "@tests/backend/helpers";

/**
 * Removes a freshly created Git repo directory, retrying on Windows EPERM.
 * A just-spawned `git` subprocess or antivirus real-time scan can hold a
 * file handle on a `.git` directory for a short time after the operation
 * that used it has resolved; an immediate rmSync can race with that.
 */
async function removeRepoDirectory(repo: string) {
  for (let attempt = 0; fs.existsSync(repo) && attempt < 5; attempt++) {
    try {
      fs.rmSync(repo, { recursive: true, force: true });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100)); // eslint-disable-line no-await-in-loop
    }
  }
}

/**
 * The members of the real collaborators that createRepoManager actually uses.
 * Declared as Pick<> rather than cast through `unknown`, so adding a
 * dependency to createRepoManager fails this file at compile time instead of
 * at runtime — the external-repo API was added without updating this stub and
 * broke every test in the suite before that was caught.
 */
type RepoManagerState = Pick<
  ExtensionState,
  "getRepos" | "saveRepos" | "getExternalRepos" | "saveExternalRepos"
>;
type RepoManagerStatusBar = Pick<StatusBarItem, "setNumRepos">;
type RepoManagerConfig = Pick<Config, "gitPath">;

function makeManager(initialRepos: GitRepoSet = {}, initialExternalRepos: string[] = []) {
  const store = { repos: { ...initialRepos }, externalRepos: [...initialExternalRepos] };
  let saveCount = 0;
  const extensionState: RepoManagerState = {
    getRepos: () => store.repos,
    saveRepos: (r: GitRepoSet) => {
      store.repos = r;
      saveCount++;
    },
    getExternalRepos: () => store.externalRepos,
    saveExternalRepos: (repos: string[]) => {
      store.externalRepos = repos;
    }
  };
  // StatusBarItem is a class with private fields, so a structural Pick cannot
  // be asserted to it directly; this one still needs the wider cast.
  const statusBar: RepoManagerStatusBar & { lastCount: number } = {
    lastCount: -1,
    setNumRepos(n: number) {
      this.lastCount = n;
    }
  };
  const config: RepoManagerConfig = { gitPath: () => "git" };
  const manager = createRepoManager(
    extensionState as ExtensionState,
    statusBar as unknown as StatusBarItem,
    config as Config
  );
  return { manager, store, statusBar, getSaveCount: () => saveCount };
}

suite("repoManager", () => {
  suite("addRepo", () => {
    test("adds a repo with null columnWidths", () => {
      const { manager, store } = makeManager();
      manager.addRepo("/ws/a");
      assert.deepStrictEqual(store.repos["/ws/a"], { columnWidths: null });
    });

    test("persists after adding", () => {
      const { manager, getSaveCount } = makeManager();
      manager.addRepo("/ws/a");
      assert.strictEqual(getSaveCount(), 1);
    });
  });

  suite("removeRepo", () => {
    test("removes an existing repo", () => {
      const { manager, store } = makeManager({ "/ws/a": { columnWidths: null } });
      manager.removeRepo("/ws/a");
      assert.strictEqual(store.repos["/ws/a"], undefined);
    });

    test("persists after removing", () => {
      const { manager, getSaveCount } = makeManager({ "/ws/a": { columnWidths: null } });
      manager.removeRepo("/ws/a");
      assert.strictEqual(getSaveCount(), 1);
    });
  });

  suite("setRepoState", () => {
    test("updates the state of an existing repo", () => {
      const { manager, store } = makeManager({ "/ws/a": { columnWidths: null } });
      manager.setRepoState("/ws/a", { columnWidths: [100, 200] });
      assert.deepStrictEqual(store.repos["/ws/a"], { columnWidths: [100, 200] });
    });

    test("persists after updating state", () => {
      const { manager, getSaveCount } = makeManager({ "/ws/a": { columnWidths: null } });
      manager.setRepoState("/ws/a", { columnWidths: [1] });
      assert.strictEqual(getSaveCount(), 1);
    });
  });

  suite("setRepos", () => {
    test("adds new repos with null columnWidths", () => {
      const { manager, store } = makeManager();
      manager.setRepos(["/ws/a", "/ws/b"]);
      assert.deepStrictEqual(store.repos, {
        "/ws/a": { columnWidths: null },
        "/ws/b": { columnWidths: null }
      });
    });

    test("preserves columnWidths of repos that are still present", () => {
      const { manager, store } = makeManager({ "/ws/a": { columnWidths: [100, 200] } });
      manager.setRepos(["/ws/a", "/ws/b"]);
      assert.deepStrictEqual(store.repos["/ws/a"], { columnWidths: [100, 200] });
    });

    test("removes repos that are not in the new list", () => {
      const { manager, store } = makeManager({
        "/ws/a": { columnWidths: [100] },
        "/ws/b": { columnWidths: null }
      });
      manager.setRepos(["/ws/a"]);
      assert.strictEqual(store.repos["/ws/b"], undefined);
    });

    test("persists once after setting", () => {
      const { manager, getSaveCount } = makeManager({ "/ws/a": { columnWidths: null } });
      manager.setRepos(["/ws/a", "/ws/b"]);
      assert.strictEqual(getSaveCount(), 1);
    });
  });

  suite("getRepos", () => {
    test("returns repos sorted by path", () => {
      const { manager } = makeManager({
        "/z": { columnWidths: null },
        "/a": { columnWidths: null },
        "/m": { columnWidths: null }
      });
      assert.deepStrictEqual(Object.keys(manager.getRepos()), ["/a", "/m", "/z"]);
    });
  });

  suite("isDirectoryWithinRepos", () => {
    const initial = {
      "/ws/project": { columnWidths: null },
      "/ws/other": { columnWidths: null }
    };

    test("returns true for an exact repo path", () => {
      const { manager } = makeManager(initial);
      assert.strictEqual(manager.isDirectoryWithinRepos("/ws/project"), true);
    });

    test("returns true for a subdirectory of a repo", () => {
      const { manager } = makeManager(initial);
      assert.strictEqual(manager.isDirectoryWithinRepos("/ws/project/src"), true);
    });

    test("returns false for an unrelated path", () => {
      const { manager } = makeManager(initial);
      assert.strictEqual(manager.isDirectoryWithinRepos("/ws/unrelated"), false);
    });

    test("returns false for a sibling with a shared prefix", () => {
      const { manager } = makeManager(initial);
      assert.strictEqual(manager.isDirectoryWithinRepos("/ws/projectother"), false);
    });
  });

  suite("removeReposWithinFolder", () => {
    test("removes repos at the exact folder path and returns true", () => {
      const { manager, store } = makeManager({
        "/ws/proj": { columnWidths: null },
        "/ws/other": { columnWidths: null }
      });
      const changed = manager.removeReposWithinFolder("/ws/proj");
      assert.strictEqual(changed, true);
      assert.deepStrictEqual(Object.keys(store.repos), ["/ws/other"]);
    });

    test("removes repos nested within the folder", () => {
      const { manager, store } = makeManager({
        "/ws/proj/sub": { columnWidths: null },
        "/ws/other": { columnWidths: null }
      });
      manager.removeReposWithinFolder("/ws/proj");
      assert.deepStrictEqual(Object.keys(store.repos), ["/ws/other"]);
    });

    test("returns false when no repos are removed", () => {
      const { manager } = makeManager({ "/ws/other": { columnWidths: null } });
      assert.strictEqual(manager.removeReposWithinFolder("/ws/proj"), false);
    });

    test("does not remove repos with a shared path prefix", () => {
      const { manager, store } = makeManager({
        "/ws/proj": { columnWidths: null },
        "/ws/projectx": { columnWidths: null }
      });
      manager.removeReposWithinFolder("/ws/proj");
      assert.deepStrictEqual(Object.keys(store.repos), ["/ws/projectx"]);
    });
  });

  suite("sendRepos / registerViewCallback", () => {
    test("calls the view callback with sorted repos and count", () => {
      const { manager } = makeManager({
        "/z": { columnWidths: null },
        "/a": { columnWidths: null }
      });
      let cbRepos: GitRepoSet | null = null;
      let cbCount = -1;
      manager.registerViewCallback((r, n) => {
        cbRepos = r;
        cbCount = n;
      });
      manager.sendRepos();
      assert.deepStrictEqual(Object.keys(cbRepos!), ["/a", "/z"]);
      assert.strictEqual(cbCount, 2);
    });

    test("does not call the callback after deregistering", () => {
      const { manager } = makeManager({ "/a": { columnWidths: null } });
      let called = false;
      manager.registerViewCallback(() => {
        called = true;
      });
      manager.deregisterViewCallback();
      manager.sendRepos();
      assert.strictEqual(called, false);
    });

    test("updates statusBar with repo count", () => {
      const { manager, statusBar } = makeManager({
        "/a": { columnWidths: null },
        "/b": { columnWidths: null }
      });
      manager.sendRepos();
      assert.strictEqual(statusBar.lastCount, 2);
    });
  });

  suite("checkReposExist", () => {
    let repo: string;

    setup(() => {
      repo = makeRepo();
    });

    teardown(() => removeRepoDirectory(repo));

    test("returns false and keeps repos when all repos still exist", async () => {
      const { manager, store } = makeManager({ [repo]: { columnWidths: null } });
      const changed = await manager.checkReposExist();
      assert.strictEqual(changed, false);
      assert.ok(Object.keys(store.repos).includes(repo));
    });

    test("returns true and removes repos that no longer exist", async () => {
      await removeRepoDirectory(repo);
      const { manager, store } = makeManager({ [repo]: { columnWidths: null } });
      const changed = await manager.checkReposExist();
      assert.strictEqual(changed, true);
      assert.ok(!Object.keys(store.repos).includes(repo));
    });

    test("calls sendRepos when repos are removed", async () => {
      await removeRepoDirectory(repo);
      const { manager, statusBar } = makeManager({ [repo]: { columnWidths: null } });
      await manager.checkReposExist();
      assert.ok(statusBar.lastCount >= 0);
    });
  });

  suite("getRepoContainingFile", () => {
    test("finds the repo a file belongs to", () => {
      const { manager } = makeManager({ "/ws/a": { columnWidths: null } });
      assert.strictEqual(manager.getRepoContainingFile("/ws/a/src/index.ts"), "/ws/a");
    });

    test("returns the repo itself for its own root", () => {
      const { manager } = makeManager({ "/ws/a": { columnWidths: null } });
      assert.strictEqual(manager.getRepoContainingFile("/ws/a"), "/ws/a");
    });

    test("prefers the deepest repo for a nested checkout", () => {
      const { manager } = makeManager({
        "/ws/a": { columnWidths: null },
        "/ws/a/nested": { columnWidths: null }
      });
      assert.strictEqual(manager.getRepoContainingFile("/ws/a/nested/f.ts"), "/ws/a/nested");
    });

    test("does not match a sibling sharing a path prefix", () => {
      const { manager } = makeManager({ "/ws/a": { columnWidths: null } });
      assert.strictEqual(manager.getRepoContainingFile("/ws/ab/f.ts"), null);
    });

    test("returns null when no repo contains the file", () => {
      const { manager } = makeManager({ "/ws/a": { columnWidths: null } });
      assert.strictEqual(manager.getRepoContainingFile("/elsewhere/f.ts"), null);
    });
  });
});
