import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { GitClient } from "@an-dr/commits-core/backend/gitClient";
import { loadBranches } from "@an-dr/commits-core/backend/queries/loadBranches";
import { loadCommits } from "@an-dr/commits-core/backend/queries/loadCommits";
import {
  getRepoInProgressState,
  RepoInProgressState
} from "@an-dr/commits-core/backend/queries/repoInProgress";
import { getPathFromStr } from "@an-dr/commits-core/backend/utils/path";
import {
  BlameLineInfo,
  GitChangeCounts,
  GitWorkingTreeChange,
  HeadInfo
} from "@an-dr/commits-core/data-source/models";
import { parseBlameIncrementalOutput } from "@an-dr/commits-core/data-source/parsers";
import { simpleGit } from "simple-git";
import type { FileStatusResult, SimpleGit } from "simple-git";
import * as vscode from "vscode";

type GitFactory = (repo: string, gitPath: string) => SimpleGit;

/** Blame flags that change Git's output, drawn from the blame settings. */
export type BlameOptions = {
  readonly ignoreWhitespace: boolean;
  /** How many `-C` flags to pass; each widens move/copy detection. */
  readonly detectMoveOrCopyFromOtherFiles: number;
};

/** The names and emails Git would attribute a commit to in one repository. */
export type CurrentUserIdentity = {
  readonly emails: ReadonlySet<string>;
  readonly names: ReadonlySet<string>;
};

/** Git blames paths relative to the repository root. */
function toRepoRelativePath(repo: string, filePath: string) {
  const normalized = getPathFromStr(filePath);
  const root = getPathFromStr(repo);
  return normalized.startsWith(root + "/") ? normalized.substring(root.length + 1) : normalized;
}

/** Splits command output into trimmed, non-empty lines. */
function toLines(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

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

  /**
   * Reports the operation the repository is part-way through.
   *
   * Each state file is resolved with `rev-parse --git-path` rather than
   * assumed to sit under `<repo>/.git`, because in a linked worktree or a
   * submodule it lives elsewhere and would otherwise never be found.
   */
  public async getRepoInProgress(repo: string): Promise<RepoInProgressState | null> {
    const git = this.gitFactory(repo, this.getGitPath());
    const run = async (args: string[]): Promise<string | null> => {
      try {
        return await git.raw(args);
      } catch {
        return null;
      }
    };
    return getRepoInProgressState({
      resolveGitPaths: async (names) => {
        const stdout = await run(["rev-parse", ...names.flatMap((name) => ["--git-path", name])]);
        return stdout === null
          ? null
          : toLines(stdout).map((line) =>
              path.isAbsolute(line) ? line : path.resolve(repo, line)
            );
      },
      pathExists: async (target) => {
        try {
          await fs.stat(target);
          return true;
        } catch {
          return false;
        }
      },
      readTextFile: async (target) => {
        try {
          return await fs.readFile(target, "utf8");
        } catch {
          // Absent is the normal case: it means the state does not apply.
          return null;
        }
      },
      readStatusPorcelain: () => run(["status", "--porcelain", "--untracked-files=all"]),
      nameCommit: async (hash) => {
        const stdout = await run([
          "for-each-ref",
          "--format=%(refname:short)",
          "--points-at",
          hash,
          "refs/heads",
          "refs/remotes"
        ]);
        if (stdout === null) {
          return null;
        }
        const names = toLines(stdout);
        return names.length > 0 ? names[0] : null;
      }
    });
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

  /**
   * Reads the identities Git would attribute a commit to in this repository.
   *
   * Both local and global values are collected because either can match a
   * blamed author. Emails are lower-cased for comparison; names are not, since
   * Git treats them as free text.
   */
  public async getCurrentUserIdentity(repo: string): Promise<CurrentUserIdentity | null> {
    const git = this.gitFactory(repo, this.getGitPath());
    const read = async (scope: "--local" | "--global", key: string) => {
      try {
        return (await git.raw(["config", scope, "--get", key])).trim() || null;
      } catch {
        // Git exits non-zero when a key is simply unset.
        return null;
      }
    };
    try {
      const [localEmail, globalEmail, localName, globalName] = await Promise.all([
        read("--local", "user.email"),
        read("--global", "user.email"),
        read("--local", "user.name"),
        read("--global", "user.name")
      ]);
      const emails = new Set<string>();
      const names = new Set<string>();
      for (const email of [localEmail, globalEmail]) {
        if (email !== null) {
          emails.add(email.toLowerCase());
        }
      }
      for (const name of [localName, globalName]) {
        if (name !== null) {
          names.add(name);
        }
      }
      return { emails, names };
    } catch {
      return null;
    }
  }

  /**
   * Reads per-line authorship for a file.
   *
   * Spawned directly rather than through simple-git because blame on a large
   * file must be abandonable: the caller re-blames on every document change,
   * so a superseded run has to be killed rather than left to finish. Resolves
   * to an empty map when cancelled or when Git fails, so callers render
   * nothing instead of stale authorship.
   */
  public getBlameFile(
    repo: string,
    filePath: string,
    options: BlameOptions,
    token?: vscode.CancellationToken
  ): Promise<ReadonlyMap<number, BlameLineInfo>> {
    const relativeFilePath = toRepoRelativePath(repo, filePath);
    const args = ["blame", "--incremental"];
    if (options.ignoreWhitespace) {
      args.push("-w");
    }
    for (let i = 0; i < options.detectMoveOrCopyFromOtherFiles; i++) {
      args.push("-C");
    }
    args.push("--", relativeFilePath);

    return new Promise((resolve) => {
      const child = spawn(this.getGitPath(), args, { cwd: repo });
      let stdout = "";
      let settled = false;

      const finish = (value: ReadonlyMap<number, BlameLineInfo>) => {
        if (settled) {
          return;
        }
        settled = true;
        subscription?.dispose();
        resolve(value);
      };

      const subscription = token?.onCancellationRequested(() => {
        child.kill();
        finish(new Map());
      });

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.on("error", () => finish(new Map()));
      child.on("close", (code) => {
        finish(code === 0 ? parseBlameIncrementalOutput(stdout) : new Map());
      });
    });
  }
}
