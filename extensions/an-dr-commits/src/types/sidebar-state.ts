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
 * The mini graph's own load state, kept separate from the rest of the sidebar's data so the
 * graph's always-present container (#activityGraph) can show a spinner/error/empty message
 * independently of whether the repo selector or changes tree are ready - see the "graph state"
 * ADR. `data: null` under `ready` covers the valid-but-nothing-to-draw case (no branch checked
 * out yet, or a repo with zero commits), distinct from `error` (the fetch itself failed).
 */
export type SidebarGraphState =
	| { readonly status: 'loading' }
	| { readonly status: 'error'; readonly message: string }
	| { readonly status: 'ready'; readonly data: SidebarMiniGraphInitialState | null };

/**
 * Initial data injected into the sidebar webview on first render - the sidebar's counterpart
 * to CommitsViewInitialState (view-state.ts), scoped to what the sidebar actually needs.
 * Extended incrementally as the sidebar's client-side rendering is built out (see ADR-003).
 */
export interface SidebarInitialState {
	readonly repo: string | null;
	readonly compactUi: boolean;
	readonly repoPaths: ReadonlyArray<string>;
	readonly starredRepos: ReadonlyArray<string>;
	readonly changes: ReadonlyArray<GitWorkingTreeChangeMsg>;
	readonly error: ErrorInfo;
	readonly graphHeight: number;
	readonly enhancedAccessibility: boolean;
	readonly graph: SidebarGraphState;
	readonly graphConfig: SidebarGraphConfig;
}
