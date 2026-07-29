import type { FileStatusResult, SimpleGit } from "simple-git";
import { simpleGit } from "simple-git";

import type { GitClient } from "@/backend/gitClient";
import { loadBranches } from "@/backend/queries/loadBranches";
import { loadCommits } from "@/backend/queries/loadCommits";
import { GitChangeCounts, GitWorkingTreeChange, HeadInfo } from "@/data-source/models";

type GitFactory = (repo: string, gitPath: string) => SimpleGit;

function createGit(repo: string, gitPath: string) {
  return simpleGit({ baseDir: repo, binary: gitPath, maxConcurrentProcesses: 6, trimmed: false });
}

function mapStatus(code: string): GitWorkingTreeChange["status"] {
  if (code === "A" || code === "D" || code === "R") {
    return code;
  }
  if (code === "?" || code === "U") {
    return "U";
  }
  return "M";
}

function createChange(file: FileStatusResult, code: string, staged: boolean): GitWorkingTreeChange {
  return {
    path: file.path,
    oldPath: file.from,
    status: mapStatus(code),
    staged,
    additions: null,
    deletions: null,
    submodule: null
  };
}

/** Typed Git façade shared by extension views and status services. */
export class DataSource {
  constructor(
    private readonly gitClient: GitClient,
    private readonly getGitPath: () => string,
    private readonly gitFactory: GitFactory = createGit
  ) {}

  /** Loads branches for the repository currently selected by the Git client. */
  public loadBranches(input: Parameters<typeof loadBranches>[1]) {
    return loadBranches(this.gitClient.getInstance(), input);
  }

  /** Loads commits for the repository currently selected by the Git client. */
  public loadCommits(input: Parameters<typeof loadCommits>[1]) {
    return loadCommits(this.gitClient.getInstance(), input);
  }

  /** Reads checked-out revision, upstream, and remote information. */
  public async getHeadInfo(repo: string): Promise<HeadInfo | null> {
    const git = this.gitFactory(repo, this.getGitPath());
    try {
      const [branchName, headHash, remotes] = await Promise.all([
        git.raw(["branch", "--show-current"]).then((value) => value.trim()),
        git
          .revparse(["HEAD"])
          .then((value) => value.trim())
          .catch(() => null),
        git.getRemotes()
      ]);
      const remoteNames = remotes.map((remote) => remote.name);
      const upstreamRef =
        branchName === ""
          ? null
          : await git
              .revparse(["--abbrev-ref", "--symbolic-full-name", "@{upstream}"])
              .then((value) => value.trim())
              .catch(() => null);
      const upstreamRemote =
        upstreamRef === null
          ? null
          : (remoteNames
              .filter((remote) => upstreamRef.startsWith(remote + "/"))
              .toSorted((a, b) => b.length - a.length)[0] ?? null);
      return { branchName, headHash, upstreamRemote, upstreamRef, remoteNames };
    } catch {
      return null;
    }
  }

  /** Reads staged and unstaged working-tree entries. */
  public async getWorkingTreeChanges(repo: string): Promise<GitWorkingTreeChange[] | null> {
    try {
      const status = await this.gitFactory(repo, this.getGitPath()).status();
      const changes: GitWorkingTreeChange[] = [];
      for (const file of status.files) {
        if (file.index === "?" && file.working_dir === "?") {
          changes.push(createChange(file, "?", false));
          continue;
        }
        if (file.index !== " " && file.index !== ".") {
          changes.push(createChange(file, file.index, true));
        }
        if (file.working_dir !== " " && file.working_dir !== ".") {
          changes.push(createChange(file, file.working_dir, false));
        }
      }
      return changes;
    } catch {
      return null;
    }
  }

  /** Counts modified and deleted staged/unstaged entries. */
  public async getStatusCounts(repo: string): Promise<GitChangeCounts | null> {
    const changes = await this.getWorkingTreeChanges(repo);
    if (changes === null) {
      return null;
    }
    return changes.reduce(
      (counts, change) => {
        if (change.status === "D") {
          counts.deleted++;
        } else {
          counts.modified++;
        }
        return counts;
      },
      { modified: 0, deleted: 0 }
    );
  }

  /** Writes a Git archive without invoking a shell. */
  public async archive(repo: string, ref: string, outputPath: string, type: "tar" | "zip") {
    await this.gitFactory(repo, this.getGitPath()).raw([
      "archive",
      `--format=${type}`,
      `--output=${outputPath}`,
      ref
    ]);
  }

  /** Reads Git's textual submodule summary for a revision range. */
  public async getSubmoduleDiff(
    repo: string,
    fromHash: string,
    toHash: string,
    filePath: string
  ): Promise<string | null> {
    const revisions =
      fromHash === "*" || toHash === "*"
        ? ["HEAD"]
        : fromHash === toHash
          ? [fromHash + "^", fromHash]
          : [fromHash, toHash];
    try {
      return await this.gitFactory(repo, this.getGitPath()).raw([
        "diff",
        "--submodule=log",
        ...revisions,
        "--",
        filePath
      ]);
    } catch {
      return null;
    }
  }

  /** Finds the current path of a file renamed since a revision. */
  public async findRenamedPath(repo: string, hash: string, filePath: string) {
    try {
      const output = await this.gitFactory(repo, this.getGitPath()).raw([
        "diff",
        "--name-status",
        "--find-renames",
        hash,
        "HEAD",
        "--",
        filePath
      ]);
      const match = output.match(/^R\d*\t[^\t]+\t(.+)$/m);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }
}
