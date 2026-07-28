import { BooleanOverride, CommitOrdering, FileViewType, RepoCommitOrdering } from './settings';

export type ColumnWidth = number;

export type GitRepoSet = { [repo: string]: GitRepoState };

/**
 * The parameters of the commits load a repository was last viewed with, recorded so the cache can
 * be warmed with the request the tab is about to make (see ADR-026).
 *
 * Deliberately excludes `remotes` and `stashes`: both are volatile, and both are recombined at
 * warm time from the repository info the same generation already holds - persisting them would
 * make a recorded request go stale the moment a stash is created.
 */
export interface LastCommitsRequest {
	readonly branches: ReadonlyArray<string> | null;
	readonly maxCommits: number;
	readonly showTags: boolean;
	readonly showRemoteBranches: boolean;
	readonly includeCommitsMentionedByReflogs: boolean;
	readonly onlyFollowFirstParent: boolean;
	readonly commitOrdering: CommitOrdering;
	readonly hideRemotes: ReadonlyArray<string>;
}

export type LastCommitsRequestSet = { [repo: string]: LastCommitsRequest };

export interface IssueLinkingConfig {
	readonly issue: string;
	readonly url: string;
}

export interface PullRequestConfigBase {
	readonly hostRootUrl: string;
	readonly sourceRemote: string;
	readonly sourceOwner: string;
	readonly sourceRepo: string;
	readonly destRemote: string | null;
	readonly destOwner: string;
	readonly destRepo: string;
	readonly destProjectId: string;
	readonly destBranch: string;
}

export const enum PullRequestProvider {
	Bitbucket,
	Custom,
	GitHub,
	GitLab
}

interface PullRequestConfigBuiltIn extends PullRequestConfigBase {
	readonly provider: Exclude<PullRequestProvider, PullRequestProvider.Custom>;
	readonly custom: null;
}

interface PullRequestConfigCustom extends PullRequestConfigBase {
	readonly provider: PullRequestProvider.Custom;
	readonly custom: {
		readonly name: string,
		readonly templateUrl: string
	};
}

export type PullRequestConfig = PullRequestConfigBuiltIn | PullRequestConfigCustom;

export interface GitRepoState {
	commitDetailsViewDivider: number;
	commitDetailsViewHeight: number;
	commitDetailsViewTopRowRatio: number;
	fullDiffCompact: boolean;
	fullDiffPanelHeight: number;
	columnWidths: ColumnWidth[] | null;
	commitOrdering: RepoCommitOrdering;
	fileViewType: FileViewType;
	hideRemotes: string[];
	includeCommitsMentionedByReflogs: BooleanOverride;
	issueLinkingConfig: IssueLinkingConfig | null;
	lastImportAt: number;
	name: string | null;
	onlyFollowFirstParent: BooleanOverride;
	onRepoLoadShowCheckedOutBranch: BooleanOverride;
	onRepoLoadShowSpecificBranches: string[] | null;
	pullRequestConfig: PullRequestConfig | null;
	showRemoteBranches: boolean;
	showRemoteBranchesV2: BooleanOverride;
	showStashes: BooleanOverride;
	showTags: BooleanOverride;
	starred: boolean;
	workspaceFolderIndex: number | null;
}

export interface CommitsBranchPanelState {
	readonly filterValue: string;
	readonly localCollapsed: boolean;
	readonly remoteCollapsed: boolean;
	readonly tagsCollapsed: boolean;
	readonly folderCollapsed: { readonly [path: string]: boolean };
	readonly sidebarWidth: number;
	readonly sidebarHidden: boolean;
	readonly scrollTop: number;
	readonly inProgressFilterActive?: boolean;
}
