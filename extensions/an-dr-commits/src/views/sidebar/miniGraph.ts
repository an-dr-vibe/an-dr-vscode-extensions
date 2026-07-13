import { DataSource } from '../../dataSource';
import { CommitOrdering, GitCommit } from '../../types';
import { GitCommitData } from '../../data-source/models';
import { SidebarGraphState } from '../../types/sidebar-state';

export const MINI_GRAPH_LIMIT = 10;

/**
 * Fetches the mini graph's commits and resolves it into the sidebar's wire-safe load state -
 * always resolves, never rejects, so callers can await it directly. The reachability sets an
 * earlier version of this function computed (localSet/remoteSet, via a parent-chain BFS from each
 * head hash) aren't needed server-side at all now that the client computes them itself from the
 * raw commits + head hashes (web/sidebar/miniGraph.ts's sidebarBuildReachableSet, see ADR-003) -
 * so there's nothing left to convert, and no separate Node-side MiniGraphData type needed either.
 *
 * HEAD/upstream info comes from DataSource.getHeadInfo, which spawns git directly rather than
 * going through the vscode.git extension - so this no longer waits on that extension's async
 * activation. A NULL result now only means detached HEAD, not "not ready yet".
 */
export async function fetchMiniGraph(dataSource: DataSource, repoPath: string, limit: number): Promise<SidebarGraphState> {
	const head = await dataSource.getHeadInfo(repoPath);
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
