import type { GitFileChangeType } from "@/backend/types";

/** A file at a particular commit, suitable for a virtual-document URI. */
export interface FileRevision {
  readonly commit: string;
  readonly path: string;
}

/** The two sides of a file diff belonging to one commit. */
export interface FileRevisionComparison {
  readonly base: FileRevision;
  readonly target: FileRevision;
}

/**
 * Creates revision endpoints for added, deleted, modified, and renamed files.
 *
 * Git resolves a commit's first parent with the <commit>^ revision. Missing
 * files deliberately remain virtual-document requests so VS Code renders an
 * empty side of added and deleted-file diffs.
 */
export function createFileRevisionComparison(
  commit: string,
  oldFilePath: string,
  newFilePath: string,
  _type: GitFileChangeType
): FileRevisionComparison {
  return {
    base: { commit: `${commit}^`, path: oldFilePath },
    target: { commit, path: newFilePath }
  };
}
