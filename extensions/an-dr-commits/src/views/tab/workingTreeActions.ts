import { DataSource } from '../../dataSource';
import { RepoManager } from '../../repoManager';
import { GitRepoSet, LoadCommitsViewTo, RequestCleanUntrackedFiles, RequestCommitChanges, RequestDiscardFileChanges, RequestDiscardSubmoduleChanges, RequestLoadPreviousCommitMessage, RequestLoadWorkingTreeChanges, RequestStageFiles, RequestUnstageFiles, ResponseMessage } from '../../types';

/**
 * The subset of TabView's dependencies needed to handle working-tree
 * messages (loading changes, staging/unstaging, committing, discarding).
 */
export interface WorkingTreeActionContext {
	readonly dataSource: DataSource;
	readonly repoManager: RepoManager;
	sendMessage(msg: ResponseMessage): void;
	respondLoadRepos(repos: GitRepoSet, loadViewTo: LoadCommitsViewTo): void;
}

export async function handleCleanUntrackedFiles(ctx: WorkingTreeActionContext, msg: RequestCleanUntrackedFiles): Promise<void> {
	ctx.sendMessage({
		command: 'cleanUntrackedFiles',
		error: await ctx.dataSource.cleanUntrackedFiles(msg.repo, msg.directories)
	});
}

export async function handleLoadWorkingTreeChanges(ctx: WorkingTreeActionContext, msg: RequestLoadWorkingTreeChanges): Promise<void> {
	const wtData = await ctx.dataSource.getWorkingTreeChanges(msg.repo);
	ctx.sendMessage({
		command: 'loadWorkingTreeChanges',
		changes: wtData.changes,
		error: wtData.error
	});
}

export async function handleLoadPreviousCommitMessage(ctx: WorkingTreeActionContext, msg: RequestLoadPreviousCommitMessage): Promise<void> {
	const previousCommitMessage = await ctx.dataSource.getPreviousCommitMessage(msg.repo);
	ctx.sendMessage({
		command: 'loadPreviousCommitMessage',
		repo: msg.repo,
		requestId: msg.requestId,
		message: previousCommitMessage.message,
		error: previousCommitMessage.error
	});
}

export async function handleStageFiles(ctx: WorkingTreeActionContext, msg: RequestStageFiles): Promise<void> {
	const stageError = await ctx.dataSource.stageFiles(msg.repo, msg.files);
	ctx.sendMessage({ command: 'stageFiles', error: stageError });
}

export async function handleUnstageFiles(ctx: WorkingTreeActionContext, msg: RequestUnstageFiles): Promise<void> {
	const unstageError = await ctx.dataSource.unstageFiles(msg.repo, msg.files);
	ctx.sendMessage({ command: 'unstageFiles', error: unstageError });
}

export async function handleCommitChanges(ctx: WorkingTreeActionContext, msg: RequestCommitChanges): Promise<void> {
	const commitError = await ctx.dataSource.commitChanges(msg.repo, msg.message, msg.amend);
	ctx.sendMessage({ command: 'commitChanges', error: commitError });
	if (commitError === null) {
		// Refresh commits after a successful commit
		ctx.respondLoadRepos(ctx.repoManager.getRepos(), null);
		ctx.sendMessage({ command: 'refresh' });
	}
}

export async function handleDiscardFileChanges(ctx: WorkingTreeActionContext, msg: RequestDiscardFileChanges): Promise<void> {
	const discardError = await ctx.dataSource.discardFileChanges(msg.repo, msg.files, msg.isUntracked, msg.restoreToIndex ?? false);
	ctx.sendMessage({ command: 'discardFileChanges', error: discardError });
}

export async function handleDiscardSubmoduleChanges(ctx: WorkingTreeActionContext, msg: RequestDiscardSubmoduleChanges): Promise<void> {
	ctx.sendMessage({
		command: 'discardSubmoduleChanges',
		error: await ctx.dataSource.discardSubmoduleChanges(msg.repo, msg.filePath, msg.cleanUntracked)
	});
}
