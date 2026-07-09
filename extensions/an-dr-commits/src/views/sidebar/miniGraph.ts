import { DataSource } from '../../dataSource';
import { CommitOrdering, GitCommit } from '../../types';
import { GitCommitData } from '../../data-source/models';
import { SidebarMiniGraphInitialState } from '../../types/sidebar-state';
import { getHeadInfo } from './gitUtils';

export const MINI_GRAPH_LIMIT = 10;

/**
 * Fetches the mini graph's commits and resolves it directly into the sidebar's wire-safe shape.
 * The reachability sets an earlier version of this function computed (localSet/remoteSet, via a
 * parent-chain BFS from each head hash) aren't needed server-side at all now that the client
 * computes them itself from the raw commits + head hashes (web/sidebar/miniGraph.ts's
 * sidebarBuildReachableSet, see ADR-003) - so there's nothing left to convert, and no separate
 * Node-side MiniGraphData type needed either.
 */
export async function fetchMiniGraph(api: any, dataSource: DataSource, repoPath: string, limit: number): Promise<SidebarMiniGraphInitialState | null> {
	const head = getHeadInfo(api, repoPath);
	if (!head) return null;

	const localBranch = head.branchName;
	const upstreamRef = head.upstreamRef;
	const remote = head.upstreamRemote ?? 'origin';

	const branches = upstreamRef ? [localBranch, upstreamRef] : [localBranch];
	const data: GitCommitData | null = await dataSource.getCommits(
		repoPath, branches, limit,
		false, !!upstreamRef, false, true,
		CommitOrdering.Date, [remote], [], []
	).catch((): null => null);
	if (data === null || data.error !== null || data.commits.length === 0) return null;

	const commits = data.commits;
	const localHeadHash = commits.find((c: GitCommit) => c.heads.includes(localBranch))?.hash ?? null;
	const remoteHeadHash = upstreamRef
		? commits.find((c: GitCommit) => c.remotes.some((r) => r.name === upstreamRef))?.hash ?? null
		: null;

	return { commits, localBranch, upstreamRef, localHeadHash, remoteHeadHash, moreAvailable: data.moreCommitsAvailable };
}
