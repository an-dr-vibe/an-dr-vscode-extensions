/**
 * Identifies which Commits surface initiated a repository selection change.
 */
export type RepoSelectionSource = 'activity' | 'commits';

/**
 * Repository selection event shared by the Commits tab and Activity Bar view.
 */
export interface RepoSelectionEvent {
	readonly repo: string;
	readonly source: RepoSelectionSource;
}

