import { DataSource } from '../../dataSource';
import { CommitOrdering, GitCommit } from '../../types';
import { GitCommitData } from '../../data-source/models';
import { SidebarGraphState } from '../../types/sidebar-state';
import { getHeadInfo } from './gitUtils';

export const MINI_GRAPH_LIMIT = 10;

/**
 * Fetches the mini graph's commits and resolves it into the sidebar's wire-safe load state -
 * always resolves, never rejects, so callers can await it directly. The reachability sets an
 * earlier version of this function computed (localSet/remoteSet, via a parent-chain BFS from each
 * head hash) aren't needed server-side at all now that the client computes them itself from the
 * raw commits + head hashes (web/sidebar/miniGraph.ts's sidebarBuildReachableSet, see ADR-003) -
 * so there's nothing left to convert, and no separate Node-side MiniGraphData type needed either.
 *
 * `api` being null (the native vscode.git extension hasn't finished activating yet) is reported
 * as 'loading', not an error - the next refresh triggered once it attaches (SidebarView's
 * _subscribeToGitApi) will resolve it for real, same as getHeadInfo returning null because the
 * lookup it does internally hasn't got anything to match yet.
 */
export async function fetchMiniGraph(api: any, dataSource: DataSource, repoPath: string, limit: number): Promise<SidebarGraphState> {
	if (!api) return { status: 'loading' };

	const head = getHeadInfo(api, repoPath);
	if (!head) return { status: 'ready', data: null };

	const localBranch = head.branchName;
	const upstreamRef = head.upstreamRef;
	const remote = head.upstreamRemote ?? 'origin';

	const branches = upstreamRef ? [localBranch, upstreamRef] : [localBranch];
	const data: GitCommitData | null = await dataSource.getCommits(
		repoPath, branches, limit,
		false, !!upstreamRef, false, true,
		CommitOrdering.Date, [remote], [], []
	).catch((): null => null);
	if (data === null) return { status: 'error', message: 'Unable to load the commit graph.' };
	if (data.error !== null) return { status: 'error', message: data.error };
	if (data.commits.length === 0) return { status: 'ready', data: null };

	const commits = data.commits;
	const localHeadHash = commits.find((c: GitCommit) => c.heads.includes(localBranch))?.hash ?? null;
	const remoteHeadHash = upstreamRef
		? commits.find((c: GitCommit) => c.remotes.some((r) => r.name === upstreamRef))?.hash ?? null
		: null;

	return {
		status: 'ready',
		data: { commits, localBranch, upstreamRef, localHeadHash, remoteHeadHash, moreAvailable: data.moreCommitsAvailable }
	};
}
