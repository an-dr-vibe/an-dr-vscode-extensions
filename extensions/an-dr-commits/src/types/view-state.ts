import { CommitsBranchPanelState, GitRepoSet, IssueLinkingConfig } from './repo-state';
import {
	AuthorAvatarMode,
	AuthorAvatarShape,
	AuthorAvatarSize,
	CommitDetailsViewLocation,
	CommitOrdering,
	CommitsColumnVisibility,
	ContextMenuActionsVisibility,
	CustomBranchGlobPattern,
	CustomEmojiShortcodeMapping,
	CustomPullRequestProvider,
	DateFormat,
	DialogDefaults,
	FileViewType,
	GraphStyle,
	GraphUncommittedChangesStyle,
	RepoDropdownOrder
} from './settings';

export interface CommitsViewInitialState {
	readonly config: CommitsViewConfig;
	readonly lastActiveRepo: string | null;
	readonly loadViewTo: LoadCommitsViewTo;
	readonly repos: GitRepoSet;
	readonly loadRepoInfoRefreshId: number;
	readonly loadCommitsRefreshId: number;
}

export const enum GitRepoInProgressStateType {
	Rebase = 'rebase',
	Merge = 'merge',
	CherryPick = 'cherry-pick',
	Revert = 'revert'
}

export interface GitRepoInProgressState {
	readonly type: GitRepoInProgressStateType;
	readonly rebaseProgress: {
		readonly current: number;
		readonly total: number;
	} | null;
	readonly rebaseContext: {
		readonly branch: string | null;
		readonly onto: string | null;
	} | null;
	readonly rebaseCommitStates: ReadonlyArray<{
		readonly hash: string;
		readonly kind: 'todo' | 'done' | 'in-progress';
		readonly offset: number;
	}> | null;
	readonly workingTreeStatus: {
		readonly changed: number;
		readonly staged: number;
		readonly conflicts: number;
		readonly untracked: number;
	} | null;
	readonly subject: string | null;
}

export interface CommitsViewConfig {
	readonly avatarMode: AuthorAvatarMode;
	readonly avatarSize: AuthorAvatarSize;
	readonly avatarShape: AuthorAvatarShape;
	readonly committedVisual: CommittedVisualMode;
	readonly branchPanel: BranchPanelConfig;
	readonly commitDetailsView: CommitDetailsViewConfig;
	readonly commitOrdering: CommitOrdering;
	readonly commitsColumnVisibility: CommitsColumnVisibility;
	readonly contextMenuActionsVisibility: ContextMenuActionsVisibility;
	readonly customBranchGlobPatterns: ReadonlyArray<CustomBranchGlobPattern>;
	readonly customEmojiShortcodeMappings: ReadonlyArray<CustomEmojiShortcodeMapping>;
	readonly customPullRequestProviders: ReadonlyArray<CustomPullRequestProvider>;
	readonly dateFormat: DateFormat;
	readonly dialogDefaults: DialogDefaults;
	readonly enhancedAccessibility: boolean;
	readonly fetchAndPrune: boolean;
	readonly fetchAndPruneTags: boolean;
	readonly fetchAvatars: boolean;
	readonly graph: GraphConfig;
	readonly includeCommitsMentionedByReflogs: boolean;
	readonly initialLoadCommits: number;
	readonly keybindings: KeybindingConfig;
	readonly loadMoreCommits: number;
	readonly loadMoreCommitsAutomatically: boolean;
	readonly markdown: boolean;
	readonly mute: MuteCommitsConfig;
	readonly onlyFollowFirstParent: boolean;
	readonly onRepoLoad: OnRepoLoadConfig;
	readonly referenceLabels: ReferenceLabelsConfig;
	readonly repoDropdownOrder: RepoDropdownOrder;
	readonly showRemoteBranches: boolean;
	readonly showStashes: boolean;
	readonly showTags: boolean;
}

export interface CommitsViewGlobalState {
	alwaysAcceptCheckoutCommit: boolean;
	fullDiffViewMode: 'unified' | 'sideBySide';
	issueLinkingConfig: IssueLinkingConfig | null;
	pushTagSkipRemoteCheck: boolean;
}

export interface CommitsViewWorkspaceState {
	findIsCaseSensitive: boolean;
	findIsRegex: boolean;
	findOpenCommitDetailsView: boolean;
}

export interface CommitDetailsViewConfig {
	readonly autoCenter: boolean;
	readonly fileTreeCompactFolders: boolean;
	readonly fileViewType: FileViewType;
	readonly location: CommitDetailsViewLocation;
	readonly defaultDiffMode: 'quick' | 'full';
}

export interface BranchPanelConfig {
	readonly flattenSingleChildGroups: boolean;
	readonly groupsFirst: boolean;
	readonly showLocalBranchUpstream: boolean;
}

export interface GraphConfig {
	readonly colours: ReadonlyArray<string>;
	readonly style: GraphStyle;
	readonly grid: { x: number, y: number, offsetX: number, offsetY: number, expandY: number };
	readonly uncommittedChanges: GraphUncommittedChangesStyle;
}

export interface KeybindingConfig {
	readonly find: string | null;
	readonly refresh: string | null;
	readonly scrollToHead: string | null;
	readonly scrollToStash: string | null;
}

export type LoadCommitsViewTo = {
	readonly repo: string,
	readonly selectedBranches?: string[] | null,
	readonly selectedTags?: string[],
	readonly scrollTop?: number,
	readonly branchPanelState?: CommitsBranchPanelState,
	readonly commitDetails?: {
		readonly commitHash: string,
		readonly compareWithHash: string | null
	},
	readonly runCommandOnLoad?: 'fetch'
} | null;

export interface MuteCommitsConfig {
	readonly commitsNotAncestorsOfHead: boolean;
	readonly mergeCommits: boolean;
}

export interface OnRepoLoadConfig {
	readonly scrollToHead: boolean;
	readonly showCheckedOutBranch: boolean;
	readonly showSpecificBranches: ReadonlyArray<string>;
}

export interface ReferenceLabelsConfig {
	readonly branchLabelsAlignedToGraph: boolean;
	readonly combineLocalAndRemoteBranchLabels: boolean;
	readonly tagLabelsOnRight: boolean;
}

export const enum CommittedVisualMode {
	Avatar = 'avatar',
	Initials = 'initials'
}
