import * as vscode from 'vscode';
import { DataSource } from '../../dataSource';
import { ExtensionState } from '../../extensionState';
import { Logger } from '../../logger';
import { RepoFileWatcher } from '../../repoFileWatcher';
import { RepoManager } from '../../repoManager';
import { ErrorInfo, GitRepoSet, LoadCommitsViewTo, RequestExportRepoConfig, RequestLoadCommits, RequestLoadConfig, RequestLoadRepoInfo, RequestLoadRepos, RequestRepoInProgressAction, RequestRescanForRepos, RequestSetColumnVisibility, RequestSetGlobalViewState, RequestSetRepoState, RequestSetWorkspaceViewState, ResponseMessage } from '../../types';
import { showErrorMessage } from '../../utils';

/**
 * The subset of TabView's dependencies and mutable state needed to handle
 * repo-lifecycle messages (loading/rescanning repos, and their view-state).
 */
export interface RepoLifecycleActionContext {
	readonly dataSource: DataSource;
	readonly repoManager: RepoManager;
	readonly extensionState: ExtensionState;
	readonly logger: Logger;
	readonly repoFileWatcher: RepoFileWatcher;
	sendMessage(msg: ResponseMessage): void;
	respondLoadRepos(repos: GitRepoSet, loadViewTo: LoadCommitsViewTo): void;
	getCurrentRepo(): string | null;
	setCurrentRepo(repo: string): void;
	setLoadRepoInfoRefreshId(id: number): void;
	setLoadCommitsRefreshId(id: number): void;
	emitRepoSelection(repo: string): void;
}

export async function handleLoadRepos(ctx: RepoLifecycleActionContext, msg: RequestLoadRepos): Promise<void> {
	if (!msg.check || !await ctx.repoManager.checkReposExist()) {
		// If not required to check repos, or no changes were found when checking, respond with repos
		ctx.respondLoadRepos(ctx.repoManager.getRepos(), null);
	} else {
		ctx.logger.logDebug('RepoManager.checkReposExist() returned true during loadRepos command.');
	}
}

export async function handleLoadRepoInfo(ctx: RepoLifecycleActionContext, msg: RequestLoadRepoInfo): Promise<void> {
	ctx.setLoadRepoInfoRefreshId(msg.refreshId);
	const repoInfo = await ctx.dataSource.getRepoInfo(msg.repo, msg.showRemoteBranches, msg.showStashes, msg.hideRemotes);
	let isRepo = true;
	if (repoInfo.error) {
		// If an error occurred, check to make sure the repo still exists
		let root = await ctx.dataSource.repoRoot(msg.repo);
		if (root === null) {
			// Retry if repoRoot returns null (could be transient during checkout)
			for (let i = 0; i < 2; i++) {
				await new Promise(resolve => setTimeout(resolve, 200));
				root = await ctx.dataSource.repoRoot(msg.repo);
				if (root !== null) break;
			}
		}
		isRepo = root !== null;
		if (!isRepo) repoInfo.error = null; // If the error is caused by the repo no longer existing, clear the error message
	}
	ctx.sendMessage({
		command: 'loadRepoInfo',
		refreshId: msg.refreshId,
		...repoInfo,
		isRepo: isRepo
	});
	if (msg.repo !== ctx.getCurrentRepo()) {
		ctx.setCurrentRepo(msg.repo);
		ctx.extensionState.setLastActiveRepo(msg.repo);
		ctx.repoFileWatcher.start(msg.repo);
		ctx.emitRepoSelection(msg.repo);
	}
}

export async function handleLoadCommits(ctx: RepoLifecycleActionContext, msg: RequestLoadCommits): Promise<void> {
	ctx.setLoadCommitsRefreshId(msg.refreshId);
	ctx.sendMessage({
		command: 'loadCommits',
		refreshId: msg.refreshId,
		onlyFollowFirstParent: msg.onlyFollowFirstParent,
		...await ctx.dataSource.getCommits(msg.repo, msg.branches, msg.maxCommits, msg.showTags, msg.showRemoteBranches, msg.includeCommitsMentionedByReflogs, msg.onlyFollowFirstParent, msg.commitOrdering, msg.remotes, msg.hideRemotes, msg.stashes)
	});
}

export async function handleLoadConfig(ctx: RepoLifecycleActionContext, msg: RequestLoadConfig): Promise<void> {
	ctx.sendMessage({
		command: 'loadConfig',
		repo: msg.repo,
		...await ctx.dataSource.getConfig(msg.repo, msg.remotes)
	});
}

export async function handleRescanForRepos(ctx: RepoLifecycleActionContext, _msg: RequestRescanForRepos): Promise<void> {
	if (!(await ctx.repoManager.searchWorkspaceForRepos())) {
		showErrorMessage('No Git repositories were found in the current workspace.');
	}
}

export function handleSetRepoState(ctx: RepoLifecycleActionContext, msg: RequestSetRepoState): void {
	ctx.repoManager.setRepoState(msg.repo, msg.state);
}

export async function handleExportRepoConfig(ctx: RepoLifecycleActionContext, msg: RequestExportRepoConfig): Promise<void> {
	ctx.sendMessage({
		command: 'exportRepoConfig',
		error: await ctx.repoManager.exportRepoConfig(msg.repo)
	});
}

export async function handleSetGlobalViewState(ctx: RepoLifecycleActionContext, msg: RequestSetGlobalViewState): Promise<void> {
	ctx.sendMessage({
		command: 'setGlobalViewState',
		error: await ctx.extensionState.setGlobalViewState(msg.state)
	});
}

export async function handleSetWorkspaceViewState(ctx: RepoLifecycleActionContext, msg: RequestSetWorkspaceViewState): Promise<void> {
	ctx.sendMessage({
		command: 'setWorkspaceViewState',
		error: await ctx.extensionState.setWorkspaceViewState(msg.state)
	});
}

export async function handleSetColumnVisibility(ctx: RepoLifecycleActionContext, msg: RequestSetColumnVisibility): Promise<void> {
	let error: ErrorInfo = null;
	try {
		await vscode.workspace.getConfiguration('an-dr-commits').update('repository.commits.columnVisibility', {
			Committed: msg.visibility.committed,
			ID: msg.visibility.id
		}, vscode.ConfigurationTarget.Global);
	} catch (e) {
		error = e instanceof Error ? e.message : 'Unable to update setting "an-dr-commits.repository.commits.columnVisibility".';
	}
	ctx.sendMessage({
		command: 'setColumnVisibility',
		error: error
	});
}

export async function handleRepoInProgressAction(ctx: RepoLifecycleActionContext, msg: RequestRepoInProgressAction): Promise<void> {
	ctx.sendMessage({
		command: 'repoInProgressAction',
		action: msg.action,
		error: await ctx.dataSource.repoInProgressAction(msg.repo, msg.state, msg.action)
	});
}
