import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExtensionState } from "@/extensionState";

function createMemento(initial: Record<string, unknown>) {
  const values = new Map(Object.entries(initial));
  return {
    get: <T>(key: string, defaultValue?: T) =>
      (values.has(key) ? values.get(key) : defaultValue) as T,
    update: vi.fn((key: string, value: unknown) => {
      values.set(key, value);
      return Promise.resolve();
    })
  };
}

describe("ExtensionState compatibility", () => {
  let storagePath: string;

  beforeEach(() => {
    storagePath = fs.mkdtempSync(path.join(os.tmpdir(), "an-dr-state-"));
    fs.mkdirSync(path.join(storagePath, "avatars"));
  });

  afterEach(() => {
    fs.rmSync(storagePath, { recursive: true, force: true });
  });

  it("reads legacy staging state but writes only versioned keys", () => {
    const workspaceState = createMemento({
      repoStates: { "C:/legacy": { columnWidths: null } },
      lastActiveRepo: "C:/legacy"
    });
    const state = new ExtensionState({
      globalState: createMemento({}),
      workspaceState,
      globalStoragePath: storagePath
    } as never);

    expect(state.getRepos()).toEqual({ "C:/legacy": { columnWidths: null } });
    expect(state.getLastActiveRepo()).toBe("C:/legacy");
    state.saveRepos({ "C:/new": { columnWidths: null } });
    state.setLastActiveRepo("C:/new");

    expect(workspaceState.update).toHaveBeenCalledWith("v2.repoStates", {
      "C:/new": { columnWidths: null }
    });
    expect(workspaceState.update).toHaveBeenCalledWith("v2.lastActiveRepo", "C:/new");
  });

  it("prefers versioned state when both shapes exist", () => {
    const state = new ExtensionState({
      globalState: createMemento({}),
      workspaceState: createMemento({
        repoStates: { "C:/legacy": { columnWidths: null } },
        "v2.repoStates": { "C:/versioned": { columnWidths: null } },
        lastActiveRepo: "C:/legacy",
        "v2.lastActiveRepo": "C:/versioned"
      }),
      globalStoragePath: storagePath
    } as never);

    expect(state.getRepos()).toEqual({ "C:/versioned": { columnWidths: null } });
    expect(state.getLastActiveRepo()).toBe("C:/versioned");
  });
});
