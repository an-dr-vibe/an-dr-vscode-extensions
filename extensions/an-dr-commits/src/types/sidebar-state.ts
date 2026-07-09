import { ErrorInfo } from './base';
import { GitCommit } from './git-domain';
import { GitWorkingTreeChangeMsg } from './message-protocol';
import { GraphUncommittedChangesStyle } from './settings';

/**
 * Raw ingredients for the sidebar's mini graph - deliberately not the reachability sets
 * (Set<string> isn't JSON-serializable, and computing them is cheap pure data work, so it
 * happens client-side; see web/sidebar/miniGraph.ts's sidebarBuildReachableSet).
 */
export interface SidebarMiniGraphInitialState {
	readonly commits: ReadonlyArray<GitCommit>;
	readonly localBranch: string;
	readonly upstreamRef: string | null;
	readonly localHeadHash: string | null;
	readonly remoteHeadHash: string | null;
	readonly moreAvailable: boolean;
}

/** The subset of graph config the mini graph's rendering needs. */
export interface SidebarGraphConfig {
	readonly showTags: boolean;
	readonly colours: ReadonlyArray<string>;
	readonly grid: { readonly x: number; readonly y: number; readonly offsetX: number; readonly offsetY: number };
	readonly uncommittedChangesStyle: GraphUncommittedChangesStyle;
}

/**
 * Initial data injected into the sidebar webview on first render - the sidebar's counterpart
 * to CommitsViewInitialState (view-state.ts), scoped to what the sidebar actually needs.
 * Extended incrementally as the sidebar's client-side rendering is built out (see ADR-003).
 */
export interface SidebarInitialState {
	readonly repo: string | null;
	readonly repoPaths: ReadonlyArray<string>;
	readonly changes: ReadonlyArray<GitWorkingTreeChangeMsg>;
	readonly error: ErrorInfo;
	readonly graphHeight: number;
	readonly enhancedAccessibility: boolean;
	readonly miniGraph: SidebarMiniGraphInitialState | null;
	readonly graphConfig: SidebarGraphConfig;
}
