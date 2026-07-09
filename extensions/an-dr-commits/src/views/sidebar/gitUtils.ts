import * as path from 'path';
import * as vscode from 'vscode';

export const STATUS_INDEX_DELETED = 2;
export const STATUS_DELETED = 6;
export const STATUS_IGNORED = 8;

export interface GitChangeCounts { modified: number; deleted: number; }

export interface GitActivityChange {
	readonly uri: vscode.Uri;
	readonly status: number;
	readonly repoRoot: string;
	readonly relativePath: string;
	readonly deleted: boolean;
}

export function normalizePath(filePath: string) {
	return filePath.replace(/\\/g, '/');
}

export function getRelativePath(repoRoot: string, filePath: string) {
	if (repoRoot === '') return normalizePath(filePath);
	const relative = path.relative(repoRoot, filePath);
	return normalizePath(relative === '' ? filePath : relative);
}

export function getRepoRoot(repo: any) {
	return (repo.rootUri?.fsPath as string | undefined) ?? '';
}

export interface HeadInfo {
	readonly branchName: string;
	readonly headHash: string | null;
	readonly upstreamRemote: string | null;
	readonly upstreamRef: string | null;
	readonly remoteNames: string[];
}

/**
 * Resolves the current branch, its HEAD commit, and its upstream (if any) from the
 * vscode.git extension API. Shared by the mini graph (local/remote lane split) and the
 * sidebar's Pull/Push/Reset actions (branch/remote/commit target resolution).
 */
export function getHeadInfo(api: any, repoPath: string): HeadInfo | null {
	const repo = (api.repositories as any[]).find((r) => r.rootUri?.fsPath === repoPath);
	if (!repo) return null;
	const head = repo.state.HEAD as { name?: string; commit?: string; upstream?: { name: string; remote: string } } | undefined;
	if (!head?.name) return null;
	const remotes = (repo.state.remotes as any[] | undefined) ?? [];
	return {
		branchName: head.name,
		headHash: head.commit ?? null,
		upstreamRemote: head.upstream?.remote ?? null,
		upstreamRef: head.upstream ? `${head.upstream.remote}/${head.upstream.name}` : null,
		remoteNames: remotes.map((r) => r.name as string).filter((name) => typeof name === 'string')
	};
}

export function getWorkingTreeChanges(repo: any): GitActivityChange[] {
	const all: any[] = [
		...(repo.state.workingTreeChanges ?? []),
		...(repo.state.indexChanges ?? []),
		...(repo.state.mergeChanges ?? []),
	];
	const seen = new Set<string>();
	const repoRoot = getRepoRoot(repo);
	const changes: GitActivityChange[] = [];
	for (const c of all) {
		const uri = c.uri as vscode.Uri | undefined;
		if (!uri || c.status === STATUS_IGNORED) continue;
		const key = uri.fsPath;
		if (key && seen.has(key)) { continue; }
		if (key) { seen.add(key); }
		changes.push({
			uri,
			status: c.status,
			repoRoot,
			relativePath: getRelativePath(repoRoot, uri.fsPath),
			deleted: c.status === STATUS_INDEX_DELETED || c.status === STATUS_DELETED
		});
	}
	return changes.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function countChanges(repo: any): GitChangeCounts {
	return countWorkingTreeChanges(getWorkingTreeChanges(repo));
}

export function countWorkingTreeChanges(changes: ReadonlyArray<GitActivityChange>): GitChangeCounts {
	let modified = 0, deleted = 0;
	for (const change of changes) {
		if (change.deleted) { deleted++; }
		else { modified++; }
	}
	return { modified, deleted };
}
