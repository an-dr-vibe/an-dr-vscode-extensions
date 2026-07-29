import { CommitOrdering, DeepWriteable, ErrorInfo, GitCommit, GitCommitDetails, GitFileChange, GitRepoConfig, GitRepoInProgressState, GitSignatureStatus, GitStash, GitSubmoduleChange, GitTagDetails } from '../types';

export interface BlameLineInfo {
	readonly author: string;
	readonly authorEmail: string;
	readonly authorTime: number;
	readonly committed: boolean;
	readonly hash: string;
	readonly summary: string;
}

export interface GitBranchData {
	branches: string[];
	branchUpstreams: { [branchName: string]: string };
	goneUpstreamBranches: string[];
	remoteHeadTargets: { [remoteName: string]: string };
	head: string | null;
	repoInProgressState: GitRepoInProgressState | null;
	error: ErrorInfo;
}

export interface HeadInfo {
	readonly branchName: string;
	readonly headHash: string | null;
	readonly upstreamRemote: string | null;
	readonly upstreamRef: string | null;
	readonly remoteNames: string[];
}

export interface GitCommitRecord {
	hash: string;
	parents: string[];
	author: string;
	email: string;
	date: number;
	message: string;
}

export interface GitCommitData {
	commits: GitCommit[];
	head: string | null;
	tags: string[];
	moreCommitsAvailable: boolean;
	error: ErrorInfo;
}

export interface GitCommitDetailsData {
	commitDetails: GitCommitDetails | null;
	error: ErrorInfo;
}

export interface GitCommitComparisonData {
	fileChanges: GitFileChange[];
	error: ErrorInfo;
}

export interface GitWorkingTreeChange {
	path: string;
	oldPath?: string;
	status: 'A' | 'M' | 'D' | 'R' | 'U';
	staged: boolean;
	additions: number | null;
	deletions: number | null;
	submodule: GitSubmoduleChange | null;
}

export interface GitWorkingTreeChangesData {
	changes: GitWorkingTreeChange[];
	error: ErrorInfo;
}

/** Working-tree change counts, split the way the sidebar badge displays them. */
export interface GitChangeCounts {
	readonly modified: number;
	readonly deleted: number;
}

export interface GitRef {
	hash: string;
	name: string;
}

export interface GitRefTag extends GitRef {
	annotated: boolean;
}

export interface GitRefData {
	head: string | null;
	heads: GitRef[];
	tags: GitRefTag[];
	remotes: GitRef[];
}

/** Branch and commit-reference data parsed from the same Git ref snapshot. */
export interface GitRefSnapshot {
	readonly branches: GitBranchData;
	readonly refs: GitRefData;
}

export interface GitRepoInfo extends GitBranchData {
	remotes: string[];
	remoteUrls: { [remoteName: string]: string | null };
	stashes: GitStash[];
}

export interface GitRepoConfigData {
	config: GitRepoConfig | null;
	error: ErrorInfo;
}

export interface GitTagDetailsData {
	details: GitTagDetails | null;
	error: ErrorInfo;
}

export interface GitTagContextData {
	context: {
		hash: string;
		annotated: boolean;
	} | null;
	error: ErrorInfo;
}

export interface GpgStatusCodeParsingDetails {
	readonly status: GitSignatureStatus;
	readonly uid: boolean;
}

export interface DiffRequest {
	repo: string;
	fromHash: string;
	toHash: string;
}

export type GitLogRequest = {
	repo: string;
	branches: ReadonlyArray<string> | null;
	num: number;
	includeTags: boolean;
	includeRemotes: boolean;
	includeCommitsMentionedByReflogs: boolean;
	onlyFollowFirstParent: boolean;
	order: CommitOrdering;
	remotes: ReadonlyArray<string>;
	hideRemotes: ReadonlyArray<string>;
	stashes: ReadonlyArray<GitStash>;
};

export type ParsedCommitDetails = DeepWriteable<GitCommitDetails>;
