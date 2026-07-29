import { describe, expect, it, vi } from "vitest";

import type { GitClient } from "@/backend/gitClient";
import { DataSource } from "@/dataSource";

function createSubject(git: Record<string, unknown>) {
  const gitClient = { getInstance: () => ({}) } as unknown as GitClient;
  return new DataSource(
    gitClient,
    () => "git-custom",
    () => git as never
  );
}

describe("DataSource", () => {
  it("derives head and longest matching upstream remote from one repository", async () => {
    const git = {
      raw: vi.fn().mockResolvedValue("feature\n"),
      revparse: vi.fn((args: string[]) =>
        Promise.resolve(args[0] === "HEAD" ? "abc123\n" : "team/origin/main\n")
      ),
      getRemotes: vi.fn().mockResolvedValue([{ name: "origin" }, { name: "team/origin" }])
    };

    await expect(createSubject(git).getHeadInfo("C:/repo")).resolves.toEqual({
      branchName: "feature",
      headHash: "abc123",
      upstreamRemote: "team/origin",
      upstreamRef: "team/origin/main",
      remoteNames: ["origin", "team/origin"]
    });
  });

  it("preserves detached HEAD information without probing for an upstream", async () => {
    const git = {
      raw: vi.fn().mockResolvedValue(""),
      revparse: vi.fn().mockResolvedValue("abc123\n"),
      getRemotes: vi.fn().mockResolvedValue([{ name: "origin" }])
    };

    await expect(createSubject(git).getHeadInfo("C:/repo")).resolves.toEqual({
      branchName: "",
      headHash: "abc123",
      upstreamRemote: null,
      upstreamRef: null,
      remoteNames: ["origin"]
    });
    expect(git.revparse).toHaveBeenCalledOnce();
  });

  it("splits staged and working-tree states and counts deletions separately", async () => {
    const git = {
      status: vi.fn().mockResolvedValue({
        files: [
          { path: "new.txt", index: "?", working_dir: "?" },
          { path: "staged.txt", index: "A", working_dir: " " },
          { path: "both.txt", index: "M", working_dir: "D" }
        ]
      })
    };
    const subject = createSubject(git);

    await expect(subject.getWorkingTreeChanges("C:/repo")).resolves.toMatchObject([
      { path: "new.txt", status: "U", staged: false },
      { path: "staged.txt", status: "A", staged: true },
      { path: "both.txt", status: "M", staged: true },
      { path: "both.txt", status: "D", staged: false }
    ]);
    await expect(subject.getStatusCounts("C:/repo")).resolves.toEqual({
      modified: 3,
      deleted: 1
    });
  });

  it("returns null when repository status cannot be read", async () => {
    const subject = createSubject({ status: vi.fn().mockRejectedValue(new Error("failed")) });

    await expect(subject.getWorkingTreeChanges("C:/repo")).resolves.toBeNull();
    await expect(subject.getStatusCounts("C:/repo")).resolves.toBeNull();
  });

  it("uses explicit archive arguments without invoking a shell", async () => {
    const raw = vi.fn().mockResolvedValue("");
    const subject = createSubject({ raw });

    await subject.archive("C:/repo", "main", "C:/out/repo.zip", "zip");

    expect(raw).toHaveBeenCalledWith([
      "archive",
      "--format=zip",
      "--output=C:/out/repo.zip",
      "main"
    ]);
  });
});
