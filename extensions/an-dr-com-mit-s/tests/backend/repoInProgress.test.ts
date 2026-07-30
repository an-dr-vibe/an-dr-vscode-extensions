import { describe, expect, it, vi } from "vitest";

import {
  getRepoInProgressState,
  parseWorkingTreeStatus,
  pickSubjectLine,
  RepoInProgressIo
} from "@/backend/queries/repoInProgress";

const GIT_PATHS = [
  "/repo/.git/rebase-merge",
  "/repo/.git/rebase-apply",
  "/repo/.git/MERGE_HEAD",
  "/repo/.git/CHERRY_PICK_HEAD",
  "/repo/.git/REVERT_HEAD"
];

/** An IO where only the named paths exist and only the named files have text. */
function createIo(opts: {
  present?: string[];
  files?: Record<string, string>;
  status?: string | null;
  named?: string | null;
}): RepoInProgressIo {
  const present = new Set(opts.present ?? []);
  const files = opts.files ?? {};
  return {
    resolveGitPaths: vi.fn(async () => GIT_PATHS),
    pathExists: vi.fn(async (target: string) => present.has(target)),
    readTextFile: vi.fn(async (target: string) => files[target] ?? null),
    readStatusPorcelain: vi.fn(async () => opts.status ?? null),
    nameCommit: vi.fn(async () => opts.named ?? null)
  };
}

describe("parseWorkingTreeStatus", () => {
  it("counts nothing for a clean tree", () => {
    expect(parseWorkingTreeStatus("")).toEqual({
      changed: 0,
      staged: 0,
      conflicts: 0,
      untracked: 0
    });
  });

  it("tells an unmerged path apart from an untracked one", () => {
    // Only an unmerged path makes the operation conflicted; counting an
    // untracked file as a conflict would show the banner as blocked.
    const status = parseWorkingTreeStatus(["UU src/a.ts", "?? src/b.ts"].join("\n"));

    expect(status.conflicts).toBe(1);
    expect(status.untracked).toBe(1);
    expect(status.changed).toBe(0);
    expect(status.staged).toBe(0);
  });

  it("counts every unmerged combination as a conflict", () => {
    const lines = ["DD a", "AU b", "UD c", "UA d", "DU e", "AA f", "UU g"];

    expect(parseWorkingTreeStatus(lines.join("\n")).conflicts).toBe(7);
  });

  it("counts a staged and unstaged change on one file once each", () => {
    const status = parseWorkingTreeStatus("MM src/a.ts");

    expect(status.staged).toBe(1);
    expect(status.changed).toBe(1);
  });

  it("separates staged from unstaged entries", () => {
    const status = parseWorkingTreeStatus(["M  staged.ts", " M unstaged.ts"].join("\n"));

    expect(status.staged).toBe(1);
    expect(status.changed).toBe(1);
  });

  it("ignores blank and truncated lines", () => {
    expect(parseWorkingTreeStatus("\n\nM\n").staged).toBe(0);
  });

  it("reads output with carriage returns", () => {
    expect(parseWorkingTreeStatus("?? a.ts\r\n?? b.ts\r\n").untracked).toBe(2);
  });
});

describe("pickSubjectLine", () => {
  it("returns null when there is no content", () => {
    expect(pickSubjectLine(null)).toBeNull();
    expect(pickSubjectLine("")).toBeNull();
  });

  it("skips comment lines a rebase message file starts with", () => {
    expect(pickSubjectLine("# This is a comment\n\nReal subject\n")).toBe("Real subject");
  });

  it("elides a very long subject", () => {
    const subject = pickSubjectLine("x".repeat(200))!;

    expect(subject).toHaveLength(123);
    expect(subject.endsWith("...")).toBe(true);
  });
});

describe("getRepoInProgressState", () => {
  it("reports nothing for a repository in a normal state", async () => {
    expect(await getRepoInProgressState(createIo({}))).toBeNull();
  });

  it("reports nothing when the paths cannot be resolved", async () => {
    const io = { ...createIo({}), resolveGitPaths: vi.fn(async () => null) };

    expect(await getRepoInProgressState(io)).toBeNull();
  });

  it.each([
    ["/repo/.git/MERGE_HEAD", "merge"],
    ["/repo/.git/CHERRY_PICK_HEAD", "cherry-pick"],
    ["/repo/.git/REVERT_HEAD", "revert"]
  ])("reports %s as %s", async (present, type) => {
    const state = await getRepoInProgressState(createIo({ present: [present] }));

    expect(state?.type).toBe(type);
    expect(state?.rebaseProgress).toBeNull();
  });

  it("prefers rebase over the MERGE_HEAD a stopped rebase leaves behind", async () => {
    // A rebase stopped on a conflict also writes MERGE_HEAD; calling that a
    // merge would offer the user the wrong continue and abort actions.
    const state = await getRepoInProgressState(
      createIo({ present: ["/repo/.git/rebase-merge", "/repo/.git/MERGE_HEAD"] })
    );

    expect(state?.type).toBe("rebase");
  });

  it("falls back to a patch-based rebase directory", async () => {
    const state = await getRepoInProgressState(
      createIo({
        present: ["/repo/.git/rebase-apply"],
        files: { "/repo/.git/rebase-apply/next": "2", "/repo/.git/rebase-apply/last": "5" }
      })
    );

    expect(state?.type).toBe("rebase");
    expect(state?.rebaseProgress).toEqual({ current: 2, total: 5 });
  });

  it("reads interactive rebase progress", async () => {
    const state = await getRepoInProgressState(
      createIo({
        present: ["/repo/.git/rebase-merge"],
        files: { "/repo/.git/rebase-merge/msgnum": "3", "/repo/.git/rebase-merge/end": "7" }
      })
    );

    expect(state?.rebaseProgress).toEqual({ current: 3, total: 7 });
  });

  it("omits progress when only one side of the count is known", async () => {
    const state = await getRepoInProgressState(
      createIo({
        present: ["/repo/.git/rebase-merge"],
        files: { "/repo/.git/rebase-merge/msgnum": "3" }
      })
    );

    expect(state?.rebaseProgress).toBeNull();
  });

  describe("rebase context", () => {
    it("shortens the branch ref and prefers the recorded onto name", async () => {
      const state = await getRepoInProgressState(
        createIo({
          present: ["/repo/.git/rebase-merge"],
          files: {
            "/repo/.git/rebase-merge/head-name": "refs/heads/feature",
            "/repo/.git/rebase-merge/onto_name": "refs/heads/main",
            "/repo/.git/rebase-merge/onto": "abc1234567890"
          }
        })
      );

      expect(state?.rebaseContext).toEqual({ branch: "feature", onto: "main" });
    });

    it("names the onto commit from a ref when no name was recorded", async () => {
      const state = await getRepoInProgressState(
        createIo({
          present: ["/repo/.git/rebase-merge"],
          files: {
            "/repo/.git/rebase-merge/head-name": "refs/heads/feature",
            "/repo/.git/rebase-merge/onto": "abc1234567890"
          },
          named: "origin/main"
        })
      );

      expect(state?.rebaseContext?.onto).toBe("origin/main");
    });

    it("falls back to an abbreviated hash when nothing points at it", async () => {
      const state = await getRepoInProgressState(
        createIo({
          present: ["/repo/.git/rebase-merge"],
          files: { "/repo/.git/rebase-merge/onto": "abc1234567890abcdef" }
        })
      );

      expect(state?.rebaseContext?.onto).toBe("abc12345");
    });
  });

  it("takes the subject from the first message file that has one", async () => {
    const state = await getRepoInProgressState(
      createIo({
        present: ["/repo/.git/rebase-merge"],
        files: { "/repo/.git/rebase-merge/final-commit": "# comment\nAdd the banner" }
      })
    );

    expect(state?.subject).toBe("Add the banner");
  });

  it("carries the working-tree counts", async () => {
    const state = await getRepoInProgressState(
      createIo({ present: ["/repo/.git/MERGE_HEAD"], status: "UU a.ts\n?? b.ts" })
    );

    expect(state?.workingTreeStatus).toEqual({
      changed: 0,
      staged: 0,
      conflicts: 1,
      untracked: 1
    });
  });

  it("still reports the state when the status cannot be read", async () => {
    const state = await getRepoInProgressState(
      createIo({ present: ["/repo/.git/MERGE_HEAD"], status: null })
    );

    expect(state?.type).toBe("merge");
    expect(state?.workingTreeStatus).toBeNull();
  });
});
