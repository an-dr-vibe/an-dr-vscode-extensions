import { BooleanOverride, FileViewType, RepoCommitOrdering } from './settings';

export interface CodeReview {
	id: string;
	lastActive: number;
	lastViewedFile: string | null;
	remainingFiles: string[];
}

export type ColumnWidth = number;

export type GitRepoSet = { [repo: string]: GitRepoState };

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
	cdvDivider: number;
	cdvHeight: number;
	cdvTopRowRatio: number;
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
}
