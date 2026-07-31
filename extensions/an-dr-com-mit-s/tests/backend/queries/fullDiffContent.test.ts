import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { simpleGit } from "simple-git";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fullDiffContent, UNCOMMITTED } from "@/backend/queries/fullDiffContent";

import { git, makeRepo } from "@tests/backend/helpers";

let repo: string;
let modifyHash: string;
let addHash: string;

beforeAll(() => {
  repo = makeRepo();
  fs.writeFileSync(path.join(repo, "f"), "one\ntwo\n");
  git(["commit", "-am", "base"], repo);

  fs.writeFileSync(path.join(repo, "f"), "one\nTWO\n");
  git(["commit", "-am", "modify"], repo);
  modifyHash = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();

  fs.writeFileSync(path.join(repo, "added"), "new file\n");
  git(["add", "."], repo);
  git(["commit", "-m", "add"], repo);
  addHash = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
});

afterAll(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe("fullDiffContent", () => {
  it("returns both endpoints and the diff for a modified file", async () => {
    const result = await fullDiffContent(simpleGit(repo), {
      repo,
      fromHash: modifyHash,
      toHash: modifyHash,
      oldFilePath: "f",
      newFilePath: "f",
      type: "M"
    });

    expect(result.oldExists).toBe(true);
    expect(result.newExists).toBe(true);
    expect(result.oldContent).toBe("one\ntwo\n");
    expect(result.newContent).toBe("one\nTWO\n");
    expect(result.diff).toContain("+TWO");
  });

  it("reports the old side as absent for an added file", async () => {
    const result = await fullDiffContent(simpleGit(repo), {
      repo,
      fromHash: addHash,
      toHash: addHash,
      oldFilePath: "added",
      newFilePath: "added",
      type: "A"
    });

    expect(result.oldExists).toBe(false);
    expect(result.oldContent).toBeNull();
    expect(result.newContent).toBe("new file\n");
  });

  it("reads the working tree as the new side for uncommitted changes", async () => {
    fs.writeFileSync(path.join(repo, "f"), "one\nTHREE\n");
    try {
      const result = await fullDiffContent(simpleGit(repo), {
        repo,
        fromHash: UNCOMMITTED,
        toHash: UNCOMMITTED,
        oldFilePath: "f",
        newFilePath: "f",
        type: "M"
      });

      expect(result.oldContent).toBe("one\nTWO\n");
      expect(result.newContent).toBe("one\nTHREE\n");
      expect(result.diff).toContain("+THREE");
    } finally {
      git(["checkout", "--", "f"], repo);
    }
  });

  it("returns a null diff rather than throwing when the path is unknown", async () => {
    const result = await fullDiffContent(simpleGit(repo), {
      repo,
      fromHash: modifyHash,
      toHash: modifyHash,
      oldFilePath: "missing",
      newFilePath: "missing",
      type: "M"
    });

    expect(result.oldExists).toBe(false);
    expect(result.newExists).toBe(false);
    expect(result.diff).toBe("");
  });
});
