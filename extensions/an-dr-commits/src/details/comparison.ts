/** A comparison is always scoped to one repository and two revisions. */
export interface RevisionComparison {
  readonly repository: string;
  readonly base: string;
  readonly target: string;
}

/** Create a stable comparison payload for details and virtual-document views. */
export function createRevisionComparison(
  repository: string,
  base: string,
  target: string
): RevisionComparison {
  return { repository, base, target };
}
