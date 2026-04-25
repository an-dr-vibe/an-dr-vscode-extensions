import { GitResetMode } from './git-domain';

export const enum BooleanOverride {
	Default,
	Enabled,
	Disabled
}

export const enum CommitDetailsViewLocation {
	Inline,
	DockedToBottom
}

export const enum CommitOrdering {
	Date = 'date',
	AuthorDate = 'author-date',
	Topological = 'topo'
}

export const enum AuthorAvatarMode {
	Auto = 'auto',
	FetchedOnly = 'fetched-only',
	ProceduralPattern = 'procedural-pattern',
	Disabled = 'disabled'
}

export const enum AuthorAvatarShape {
	Circle = 'circle',
	Square = 'square'
}

export const enum AuthorAvatarSize {
	Normal = 'normal',
	Small = 'small'
}

export interface ContextMenuActionsVisibility {
	readonly branch: {
		readonly checkout: boolean;
		readonly rename: boolean;
		readonly delete: boolean;
		readonly merge: boolean;
		readonly rebase: boolean;
		readonly push: boolean;
		readonly viewIssue: boolean;
		readonly createPullRequest: boolean;
		readonly createArchive: boolean;
		readonly selectInBranchesDropdown: boolean;
		readonly unselectInBranchesDropdown: boolean;
		readonly setUpstream: boolean;
		readonly unsetUpstream: boolean;
		readonly copyName: boolean;
	};
	readonly commit: {
		readonly addTag: boolean;
		readonly createBranch: boolean;
		readonly checkout: boolean;
		readonly cherrypick: boolean;
		readonly revert: boolean;
		readonly drop: boolean;
		readonly merge: boolean;
		readonly rebase: boolean;
		readonly reset: boolean;
		readonly copyHash: boolean;
		readonly copySubject: boolean;
	};
	readonly commitDetailsViewFile: {
		readonly viewDiff: boolean;
		readonly viewFileAtThisRevision: boolean;
		readonly viewDiffWithWorkingFile: boolean;
		readonly openFile: boolean;
		readonly markAsReviewed: boolean;
		readonly markAsNotReviewed: boolean;
		readonly resetFileToThisRevision: boolean;
		readonly copyAbsoluteFilePath: boolean;
		readonly copyRelativeFilePath: boolean;
	};
	readonly remoteBranch: {
		readonly checkout: boolean;
		readonly delete: boolean;
		readonly fetch: boolean;
		readonly merge: boolean;
		readonly pull: boolean;
		readonly viewIssue: boolean;
		readonly createPullRequest: boolean;
		readonly createArchive: boolean;
		readonly selectInBranchesDropdown: boolean;
		readonly unselectInBranchesDropdown: boolean;
		readonly copyName: boolean;
	};
	readonly stash: {
		readonly apply: boolean;
		readonly createBranch: boolean;
		readonly pop: boolean;
		readonly drop: boolean;
		readonly copyName: boolean;
		readonly copyHash: boolean;
	};
	readonly tag: {
		readonly viewDetails: boolean;
		readonly delete: boolean;
		readonly push: boolean;
		readonly createArchive: boolean;
		readonly copyName: boolean;
	};
	readonly uncommittedChanges: {
		readonly stash: boolean;
		readonly reset: boolean;
		readonly clean: boolean;
		readonly openSourceControlView: boolean;
	};
}

export interface CustomBranchGlobPattern {
	readonly name: string;
	readonly glob: string;
}

export interface CustomEmojiShortcodeMapping {
	readonly shortcode: string;
	readonly emoji: string;
}

export interface CustomPullRequestProvider {
	readonly name: string;
	readonly templateUrl: string;
}

export interface DateFormat {
	readonly type: DateFormatType;
	readonly iso: boolean;
}

export interface CommitsColumnVisibility {
	readonly committed: boolean;
	readonly id: boolean;
}

export const enum DateFormatType {
	DateAndTime,
	DateOnly,
	Relative
}

export interface DialogDefaults {
	readonly addTag: {
		readonly pushToRemote: boolean,
		readonly type: TagType
	};
	readonly applyStash: {
		readonly reinstateIndex: boolean
	};
	readonly cherryPick: {
		readonly noCommit: boolean,
		readonly recordOrigin: boolean
	};
	readonly createBranch: {
		readonly checkout: boolean
	};
	readonly deleteBranch: {
		readonly forceDelete: boolean
	};
	readonly fetchIntoLocalBranch: {
		readonly forceFetch: boolean
	};
	readonly fetchRemote: {
		readonly prune: boolean,
		readonly pruneTags: boolean
	};
	readonly general: {
		readonly referenceInputSpaceSubstitution: string | null
	};
	readonly merge: {
		readonly noCommit: boolean,
		readonly noFastForward: boolean,
		readonly squash: boolean
	};
	readonly popStash: {
		readonly reinstateIndex: boolean
	};
	readonly pullBranch: {
		readonly noFastForward: boolean,
		readonly squash: boolean
	};
	readonly rebase: {
		readonly ignoreDate: boolean,
		readonly interactive: boolean
	};
	readonly repoInProgress: {
		readonly confirmAbort: boolean
	};
	readonly resetCommit: {
		readonly mode: GitResetMode
	};
	readonly resetUncommitted: {
		readonly mode: Exclude<GitResetMode, GitResetMode.Soft>
	};
	readonly stashUncommittedChanges: {
		readonly includeUntracked: boolean
	};
}

export const enum FileViewType {
	Default,
	Tree,
	List
}

export const enum GraphStyle {
	Rounded,
	Angular
}

export const enum GraphUncommittedChangesStyle {
	OpenCircleAtTheUncommittedChanges,
	OpenCircleAtTheCheckedOutCommit
}

export const enum RefLabelAlignment {
	Normal,
	BranchesOnLeftAndTagsOnRight,
	BranchesAlignedToGraphAndTagsOnRight
}

export const enum RepoCommitOrdering {
	Default = 'default',
	Date = 'date',
	AuthorDate = 'author-date',
	Topological = 'topo'
}

export const enum RepoDropdownOrder {
	FullPath,
	Name,
	WorkspaceFullPath
}

export const enum LogLevel {
	Debug,
	Info,
	Warning,
	Error
}

export const enum SquashMessageFormat {
	Default,
	GitSquashMsg
}

export const enum TabIconColourTheme {
	Colour,
	Grey
}

export const enum TagType {
	Annotated,
	Lightweight
}
