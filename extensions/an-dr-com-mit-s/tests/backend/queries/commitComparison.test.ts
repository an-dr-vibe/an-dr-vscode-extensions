import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { simpleGit } from "simple-git";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { commitComparison } from "@/backend/queries/commitComparison";

import { git, makeRepo } from "@tests/backend/helpers";

let repo: string;
let base: string;
let tip: string;

beforeAll(() => {
  repo = makeRepo();
  fs.writeFileSync(path.join(repo, "kept"), "one\n");
  fs.writeFileSync(path.join(repo, "removed"), "gone\n");
  git(["add", "."], repo);
  git(["commit", "-m", "base"], repo);
  base = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();

  fs.writeFileSync(path.join(repo, "kept"), "one\ntwo\n");
  fs.rmSync(path.join(repo, "removed"));
  fs.writeFileSync(path.join(repo, "added"), "new\n");
  git(["add", "-A"], repo);
  git(["commit", "-m", "tip"], repo);
  tip = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
});

afterAll(() => {
  // Best effort: on Windows a Git process this suite spawned can still hold the
  // directory open, and a temp directory that outlives the run is not a reason
  // to fail tests that passed.
  try {
    fs.rmSync(repo, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    /* the OS reclaims the temp directory */
  }
});

describe("commitComparison", () => {
  it("lists every change between two commits with its line counts", async () => {
    const result = await commitComparison(simpleGit(repo), { fromHash: base, toHash: tip });

    expect(result.error).toBeNull();
    const byPath = Object.fromEntries(
      result.fileChanges.map((change) => [change.newFilePath, change])
    );
    expect(Object.keys(byPath).toSorted()).toEqual(["added", "kept", "removed"]);
    expect(byPath.added.type).toBe("A");
    expect(byPath.removed.type).toBe("D");
    expect(byPath.kept).toMatchObject({ type: "M", additions: 1, deletions: 0 });
  });

  it("returns nothing for a commit compared with itself", async () => {
    const result = await commitComparison(simpleGit(repo), { fromHash: tip, toHash: tip });

    expect(result.error).toBeNull();
    expect(result.fileChanges).toEqual([]);
  });

  it("reports the failure rather than throwing on an unknown revision", async () => {
    const result = await commitComparison(simpleGit(repo), {
      fromHash: "does-not-exist",
      toHash: tip
    });

    expect(result.error).not.toBeNull();
    expect(result.fileChanges).toEqual([]);
  });
});
