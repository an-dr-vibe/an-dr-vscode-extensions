import { BaseMessage, ErrorInfo } from './base';
import { GitWorkingTreeChangeMsg } from './message-protocol';
import { SidebarMiniGraphInitialState } from './sidebar-state';

/**
 * The sidebar's webview <-> backend message protocol - one discriminated-union type per
 * command, matching the tab's own convention (message-protocol.ts) instead of the flat,
 * mostly-optional ActivityBarMessage this replaces (see ADR-004). Split into Request (webview
 * -> backend) and Response (backend -> webview) the same way the tab's protocol is, even though
 * neither direction changes any wire-level command string from what ActivityBarMessage /
 * views/sidebar/sidebarView.ts's postMessage calls already sent.
 */

/* Requests (webview -> backend) */

export interface SidebarRequestOpenCommits extends BaseMessage {
	readonly command: 'openCommits';
}

export interface SidebarRequestLoadMoreGraph extends BaseMessage {
	readonly command: 'loadMoreGraph';
}

export interface SidebarRequestSelectRepo extends BaseMessage {
	readonly command: 'selectRepo';
	readonly filePath: string;
}

export interface SidebarRequestSetRepoStarred extends BaseMessage {
	readonly command: 'setRepoStarred';
	readonly filePath: string;
	readonly starred: boolean;
}

export interface SidebarRequestRefresh extends BaseMessage {
	readonly command: 'refresh';
}

export interface SidebarRequestSetGraphHeight extends BaseMessage {
	readonly command: 'setGraphHeight';
	readonly height: number;
}

export interface SidebarRequestStage extends BaseMessage {
	readonly command: 'stage';
	readonly filePath: string;
}

export interface SidebarRequestUnstage extends BaseMessage {
	readonly command: 'unstage';
	readonly filePath: string;
}

export interface SidebarRequestStageAll extends BaseMessage {
	readonly command: 'stageAll';
}

export interface SidebarRequestUnstageAll extends BaseMessage {
	readonly command: 'unstageAll';
}

export interface SidebarRequestDiscard extends BaseMessage {
	readonly command: 'discard';
	readonly filePath: string;
	readonly isUntracked: boolean;
	/** Never actually sent by the current client (kept optional, not tightened, to avoid forcing an unrelated client change in a protocol-shape increment). */
	readonly restoreToIndex?: boolean;
}

export interface SidebarRequestCommit extends BaseMessage {
	readonly command: 'commit';
	readonly message: string;
	readonly amend: boolean;
}

export interface SidebarRequestOpenChanges extends BaseMessage {
	readonly command: 'openChanges';
	readonly filePath: string;
}

export interface SidebarRequestGitFetch extends BaseMessage {
	readonly command: 'gitFetch';
}

export interface SidebarRequestGitPull extends BaseMessage {
	readonly command: 'gitPull';
}

export interface SidebarRequestGitPush extends BaseMessage {
	readonly command: 'gitPush';
}

export interface SidebarRequestGitForcePush extends BaseMessage {
	readonly command: 'gitForcePush';
}

export interface SidebarRequestGitReset extends BaseMessage {
	readonly command: 'gitReset';
}

export type SidebarRequestMessage =
	| SidebarRequestOpenCommits
	| SidebarRequestLoadMoreGraph
	| SidebarRequestSelectRepo
	| SidebarRequestSetRepoStarred
	| SidebarRequestRefresh
	| SidebarRequestSetGraphHeight
	| SidebarRequestStage
	| SidebarRequestUnstage
	| SidebarRequestStageAll
	| SidebarRequestUnstageAll
	| SidebarRequestDiscard
	| SidebarRequestCommit
	| SidebarRequestOpenChanges
	| SidebarRequestGitFetch
	| SidebarRequestGitPull
	| SidebarRequestGitPush
	| SidebarRequestGitForcePush
	| SidebarRequestGitReset;

/* Responses (backend -> webview) */

export interface SidebarResponseUpdateContent extends BaseMessage {
	readonly command: 'updateContent';
	readonly repo: string | null;
	readonly repoPaths: ReadonlyArray<string>;
	readonly starredRepos: ReadonlyArray<string>;
	readonly changes: ReadonlyArray<GitWorkingTreeChangeMsg>;
	readonly error: ErrorInfo;
	readonly miniGraph: SidebarMiniGraphInitialState | null;
}

export interface SidebarResponseUpdateGraph extends BaseMessage {
	readonly command: 'updateGraph';
	readonly miniGraph: SidebarMiniGraphInitialState | null;
}

export type SidebarResponseMessage = SidebarResponseUpdateContent | SidebarResponseUpdateGraph;
