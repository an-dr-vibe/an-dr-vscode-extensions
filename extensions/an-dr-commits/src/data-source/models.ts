import { CommitOrdering, DeepWriteable, ErrorInfo, GitCommit, GitCommitDetails, GitFileChange, GitRepoConfig, GitRepoInProgressState, GitSignatureStatus, GitStash, GitTagDetails } from '../types';

export interface GitBranchData {
	branches: string[];
	branchUpstreams: { [branchName: string]: string };
	goneUpstreamBranches: string[];
	remoteHeadTargets: { [remoteName: string]: string };
	head: string | null;
	repoInProgressState: GitRepoInProgressState | null;
	error: ErrorInfo;
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

export interface GitRepoInfo extends GitBranchData {
	remotes: string[];
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

export interface BranchUpstreamData {
	branchUpstreams: { [branchName: string]: string };
	goneUpstreamBranches: string[];
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
