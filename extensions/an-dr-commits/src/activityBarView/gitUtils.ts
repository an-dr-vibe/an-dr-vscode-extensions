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

export interface ActivityBarMessage {
	readonly command: string;
	readonly filePath?: string;
	readonly message?: string;
	readonly amend?: boolean;
	readonly isUntracked?: boolean;
	readonly restoreToIndex?: boolean;
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
