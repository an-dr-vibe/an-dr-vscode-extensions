import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { SimpleGit } from "simple-git";

import type { GitFileChangeType, QueryResult } from "@/backend/types";

/** Hash the webview uses for the synthetic uncommitted-changes row. */
export const UNCOMMITTED = "*";

type FullDiffContentInput = {
  repo: string;
  fromHash: string;
  toHash: string;
  oldFilePath: string;
  newFilePath: string;
  type: GitFileChangeType;
};

type FileRead = { exists: boolean; content: string | null };

const MISSING: FileRead = { exists: false, content: null };

/**
 * Reads a blob at a revision. A missing path is a normal outcome — the file may
 * not exist on one side of the change — so a Git failure becomes "not present"
 * rather than an error.
 */
async function readCommitFile(git: SimpleGit, revision: string, filePath: string) {
  try {
    return { exists: true, content: await git.show([`${revision}:${filePath}`]) };
  } catch {
    return MISSING;
  }
}

/** Reads the on-disk file, used when the new side is the working tree. */
async function readWorkingTreeFile(repo: string, filePath: string): Promise<FileRead> {
  try {
    return { exists: true, content: await fs.readFile(path.join(repo, filePath), "utf8") };
  } catch {
    return MISSING;
  }
}

/** Both endpoints of the change, chosen by which revisions the request names. */
async function readEndpoints(
  git: SimpleGit,
  input: FullDiffContentInput
): Promise<{ oldFile: FileRead; newFile: FileRead }> {
  const againstWorkingTree = input.toHash === UNCOMMITTED;
  const oldRevision =
    input.fromHash === input.toHash
      ? againstWorkingTree
        ? "HEAD"
        : `${input.fromHash}^`
      : input.fromHash;

  const [oldFile, newFile] = await Promise.all([
    input.type === "A" ? MISSING : readCommitFile(git, oldRevision, input.oldFilePath),
    input.type === "D"
      ? MISSING
      : againstWorkingTree
        ? readWorkingTreeFile(input.repo, input.newFilePath)
        : readCommitFile(git, input.toHash, input.newFilePath)
  ]);
  return { oldFile, newFile };
}

/** Unified diff for the single file, as Git prints it. */
async function readFileDiff(git: SimpleGit, input: FullDiffContentInput): Promise<string | null> {
  const range =
    input.fromHash === input.toHash
      ? input.toHash === UNCOMMITTED
        ? ["HEAD"]
        : [`${input.fromHash}^`, input.toHash]
      : [input.fromHash, input.toHash === UNCOMMITTED ? "" : input.toHash].filter(
          (revision) => revision !== ""
        );
  try {
    return await git.raw([
      "diff",
      ...range,
      "--",
      ...(input.oldFilePath === input.newFilePath
        ? [input.newFilePath]
        : [input.oldFilePath, input.newFilePath])
    ]);
  } catch {
    return null;
  }
}

/**
 * Collects everything the in-webview diff panel needs for one file: the unified
 * diff plus the full text of both endpoints, so the panel can show unchanged
 * context the diff itself omits.
 */
export async function fullDiffContent(
  git: SimpleGit,
  input: FullDiffContentInput
): Promise<QueryResult<"fullDiffContent">> {
  const [diff, endpoints] = await Promise.all([
    readFileDiff(git, input),
    readEndpoints(git, input)
  ]);
  return {
    diff,
    oldContent: endpoints.oldFile.content,
    newContent: endpoints.newFile.content,
    oldExists: endpoints.oldFile.exists,
    newExists: endpoints.newFile.exists
  };
}
