import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  openResult: undefined as Array<{ fsPath: string }> | undefined,
  quickPickResult: undefined as { label: string; repo: string } | undefined,
  showErrorMessage: vi.fn(() => Promise.resolve(undefined))
}));

vi.mock("vscode", () => ({
  l10n: {
    t: (message: string, ...args: unknown[]) =>
      args.reduce(
        (result: string, value, index) => result.replace(`{${index}}`, String(value)),
        message
      )
  },
  window: {
    showOpenDialog: () => Promise.resolve(mock.openResult),
    showQuickPick: () => Promise.resolve(mock.quickPickResult),
    showErrorMessage: (...args: unknown[]) => mock.showErrorMessage(...(args as []))
  }
}));

import { createRepositoryCommands } from "@/extension/repositoryCommands";

import { makeRepo } from "@tests/backend/helpers";

const cleanup: string[] = [];

afterEach(() => {
  for (const dir of cleanup.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  mock.openResult = undefined;
  mock.quickPickResult = undefined;
  mock.showErrorMessage.mockClear();
});

describe("repository lifecycle commands", () => {
  it("adds and selects a disposable Git repository as external", async () => {
    const repo = makeRepo();
    cleanup.push(repo);
    mock.openResult = [{ fsPath: repo }];
    const manager = createManager([]);
    const selectRepo = vi.fn();
    const commands = createRepositoryCommands(
      manager.value as never,
      { selectRepo } as never,
      { gitPath: () => "git" } as never
    );

    await commands.addGitRepository();

    expect(manager.addRepo).toHaveBeenCalledWith(repo.replaceAll("\\", "/"), true);
    expect(manager.sendRepos).toHaveBeenCalled();
    expect(selectRepo).toHaveBeenCalledWith(repo.replaceAll("\\", "/"));
  });

  it("rejects a selected folder that is not a Git repository", async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "an-dr-not-repo-"));
    cleanup.push(folder);
    mock.openResult = [{ fsPath: folder }];
    const manager = createManager([]);
    const commands = createRepositoryCommands(
      manager.value as never,
      { selectRepo: vi.fn() } as never,
      { gitPath: () => "git" } as never
    );

    await commands.addGitRepository();

    expect(manager.addRepo).not.toHaveBeenCalled();
    expect(mock.showErrorMessage).toHaveBeenCalled();
  });

  it("removes the selected repository without touching its files", async () => {
    const repo = makeRepo();
    cleanup.push(repo);
    mock.quickPickResult = { label: repo, repo };
    const manager = createManager([repo]);
    const commands = createRepositoryCommands(
      manager.value as never,
      { selectRepo: vi.fn() } as never,
      { gitPath: () => "git" } as never
    );

    await commands.removeGitRepository();

    expect(manager.removeRepo).toHaveBeenCalledWith(repo);
    expect(fs.existsSync(path.join(repo, "f"))).toBe(true);
  });
});

function createManager(repos: string[]) {
  const addRepo = vi.fn();
  const removeRepo = vi.fn();
  const sendRepos = vi.fn();
  return {
    addRepo,
    removeRepo,
    sendRepos,
    value: {
      addRepo,
      removeRepo,
      sendRepos,
      getRepos: () => Object.fromEntries(repos.map((repo) => [repo, { columnWidths: null }]))
    }
  };
}
