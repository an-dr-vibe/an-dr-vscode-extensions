import * as fs from "node:fs";
import * as path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { type InProgressAction, runInProgressOperation } from "@/backend/actions/inProgress";
import type { RepoInProgressType } from "@/backend/queries/repoInProgress";

import { git, makeRepo } from "@tests/backend/helpers";

const cleanup: string[] = [];

function makeConflictedMerge(): string {
  const repo = makeRepo();
  cleanup.push(repo);
  git(["checkout", "-b", "feature"], repo);
  fs.writeFileSync(path.join(repo, "f"), "feature");
  git(["add", "f"], repo);
  git(["commit", "-m", "feature"], repo);
  git(["checkout", "main"], repo);
  fs.writeFileSync(path.join(repo, "f"), "main");
  git(["add", "f"], repo);
  git(["commit", "-m", "main"], repo);
  expect(() => git(["merge", "feature"], repo)).toThrow();
  return repo;
}

afterEach(() => {
  for (const repo of cleanup.splice(0)) {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

describe("runInProgressOperation", () => {
  it.each([
    ["rebase", "continue"],
    ["rebase", "abort"],
    ["merge", "continue"],
    ["merge", "abort"],
    ["cherry-pick", "continue"],
    ["cherry-pick", "abort"],
    ["revert", "continue"],
    ["revert", "abort"]
  ] as Array<[RepoInProgressType, InProgressAction]>)("runs git %s --%s", async (type, action) => {
    const run = vi.fn(async () => {});
    await runInProgressOperation("git-custom", "C:/repo", type, action, run);
    expect(run).toHaveBeenCalledWith(
      "git-custom",
      [type, `--${action}`],
      expect.objectContaining({
        cwd: "C:/repo",
        env: expect.objectContaining({ GIT_EDITOR: "true", GIT_SEQUENCE_EDITOR: "true" })
      })
    );
  });

  it("surfaces Git failures", async () => {
    const failure = new Error("resolve conflicts first");
    const run = vi.fn(async () => {
      throw failure;
    });
    await expect(runInProgressOperation("git", "C:/repo", "merge", "continue", run)).rejects.toBe(
      failure
    );
  });

  it("aborts a conflicted merge in a disposable repository", async () => {
    const repo = makeConflictedMerge();
    await runInProgressOperation("git", repo, "merge", "abort");

    expect(fs.readFileSync(path.join(repo, "f"), "utf8")).toBe("main");
    expect(() => git(["rev-parse", "--verify", "MERGE_HEAD"], repo)).toThrow();
  });

  it("continues a merge after its conflict is resolved", async () => {
    const repo = makeConflictedMerge();
    fs.writeFileSync(path.join(repo, "f"), "resolved");
    git(["add", "f"], repo);

    await runInProgressOperation("git", repo, "merge", "continue");

    expect(fs.readFileSync(path.join(repo, "f"), "utf8")).toBe("resolved");
    expect(() => git(["rev-parse", "--verify", "MERGE_HEAD"], repo)).toThrow();
  });
});
