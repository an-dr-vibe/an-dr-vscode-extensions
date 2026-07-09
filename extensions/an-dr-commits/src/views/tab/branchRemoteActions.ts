import { DataSource } from '../../dataSource';
import { Logger } from '../../logger';
import { ErrorInfo, GitPushBranchMode, RequestAddRemote, RequestCheckoutBranch, RequestCleanupLocalBranches, RequestCreateBranch, RequestCreatePullRequest, RequestDeleteBranch, RequestDeleteRemote, RequestDeleteRemoteBranch, RequestEditRemote, RequestFetch, RequestFetchIntoLocalBranch, RequestMerge, RequestPruneRemote, RequestPullBranch, RequestPullBranchWithStash, RequestPushBranch, RequestRebase, RequestRenameBranch, RequestSetBranchUpstream, RequestSetRemoteDefaultBranch, RequestUnsetBranchUpstream, ResponseMessage } from '../../types';
import { createPullRequest } from '../../utils';

/**
 * The subset of TabView's dependencies needed to handle branch and remote
 * management messages.
 */
export interface BranchRemoteActionContext {
	readonly dataSource: DataSource;
	readonly logger: Logger;
	sendMessage(msg: ResponseMessage): void;
}

export async function handleAddRemote(ctx: BranchRemoteActionContext, msg: RequestAddRemote): Promise<void> {
	ctx.sendMessage({
		command: 'addRemote',
		error: await ctx.dataSource.addRemote(msg.repo, msg.name, msg.url, msg.pushUrl, msg.fetch)
	});
}

export async function handleCheckoutBranch(ctx: BranchRemoteActionContext, msg: RequestCheckoutBranch): Promise<void> {
	ctx.logger.log('Processing checkoutBranch command for repo: ' + msg.repo + ', branch: ' + msg.branchName);
	const errorInfos: ErrorInfo[] = [await ctx.dataSource.checkoutBranch(msg.repo, msg.branchName, msg.remoteBranch)];
	if (errorInfos[0] === null && msg.pullAfterwards !== null) {
		errorInfos.push(await ctx.dataSource.pullBranch(msg.repo, msg.pullAfterwards.branchName, msg.pullAfterwards.remote, msg.pullAfterwards.createNewCommit, msg.pullAfterwards.squash));
	}
	ctx.sendMessage({
		command: 'checkoutBranch',
		pullAfterwards: msg.pullAfterwards,
		errors: errorInfos
	});
	ctx.logger.log('Finished checkoutBranch command.');
}

export async function handleCleanupLocalBranches(ctx: BranchRemoteActionContext, msg: RequestCleanupLocalBranches): Promise<void> {
	ctx.sendMessage({
		command: 'cleanupLocalBranches',
		branchNames: msg.branchNames,
		errors: await ctx.dataSource.cleanupLocalBranches(msg.repo, msg.branchNames, msg.forceDelete)
	});
}

export async function handleCreateBranch(ctx: BranchRemoteActionContext, msg: RequestCreateBranch): Promise<void> {
	ctx.sendMessage({
		command: 'createBranch',
		errors: await ctx.dataSource.createBranch(msg.repo, msg.branchName, msg.commitHash, msg.checkout, msg.force)
	});
}

export async function handleCreatePullRequest(ctx: BranchRemoteActionContext, msg: RequestCreatePullRequest): Promise<void> {
	const errorInfos: ErrorInfo[] = [msg.push ? await ctx.dataSource.pushBranch(msg.repo, msg.sourceBranch, msg.sourceRemote, true, GitPushBranchMode.Normal) : null];
	if (errorInfos[0] === null) {
		errorInfos.push(await createPullRequest(msg.config, msg.sourceOwner, msg.sourceRepo, msg.sourceBranch));
	}
	ctx.sendMessage({
		command: 'createPullRequest',
		push: msg.push,
		errors: errorInfos
	});
}

export async function handleDeleteBranch(ctx: BranchRemoteActionContext, msg: RequestDeleteBranch): Promise<void> {
	const errorInfos: ErrorInfo[] = [await ctx.dataSource.deleteBranch(msg.repo, msg.branchName, msg.forceDelete)];
	if (errorInfos[0] === null) {
		for (let i = 0; i < msg.deleteOnRemotes.length; i++) {
			errorInfos.push(await ctx.dataSource.deleteRemoteBranch(msg.repo, msg.branchName, msg.deleteOnRemotes[i]));
		}
	}
	ctx.sendMessage({
		command: 'deleteBranch',
		repo: msg.repo,
		branchName: msg.branchName,
		deleteOnRemotes: msg.deleteOnRemotes,
		errors: errorInfos
	});
}

export async function handleDeleteRemote(ctx: BranchRemoteActionContext, msg: RequestDeleteRemote): Promise<void> {
	ctx.sendMessage({
		command: 'deleteRemote',
		error: await ctx.dataSource.deleteRemote(msg.repo, msg.name)
	});
}

export async function handleDeleteRemoteBranch(ctx: BranchRemoteActionContext, msg: RequestDeleteRemoteBranch): Promise<void> {
	ctx.sendMessage({
		command: 'deleteRemoteBranch',
		error: await ctx.dataSource.deleteRemoteBranch(msg.repo, msg.branchName, msg.remote)
	});
}

export async function handleEditRemote(ctx: BranchRemoteActionContext, msg: RequestEditRemote): Promise<void> {
	ctx.sendMessage({
		command: 'editRemote',
		error: await ctx.dataSource.editRemote(msg.repo, msg.nameOld, msg.nameNew, msg.urlOld, msg.urlNew, msg.pushUrlOld, msg.pushUrlNew)
	});
}

export async function handleFetch(ctx: BranchRemoteActionContext, msg: RequestFetch): Promise<void> {
	ctx.sendMessage({
		command: 'fetch',
		error: await ctx.dataSource.fetch(msg.repo, msg.name, msg.prune, msg.pruneTags)
	});
}

export async function handleFetchIntoLocalBranch(ctx: BranchRemoteActionContext, msg: RequestFetchIntoLocalBranch): Promise<void> {
	ctx.sendMessage({
		command: 'fetchIntoLocalBranch',
		error: await ctx.dataSource.fetchIntoLocalBranch(msg.repo, msg.remote, msg.remoteBranch, msg.localBranch, msg.force)
	});
}

export async function handleMerge(ctx: BranchRemoteActionContext, msg: RequestMerge): Promise<void> {
	ctx.sendMessage({
		command: 'merge',
		actionOn: msg.actionOn,
		error: await ctx.dataSource.merge(msg.repo, msg.obj, msg.actionOn, msg.createNewCommit, msg.squash, msg.noCommit)
	});
}

export async function handlePruneRemote(ctx: BranchRemoteActionContext, msg: RequestPruneRemote): Promise<void> {
	ctx.sendMessage({
		command: 'pruneRemote',
		error: await ctx.dataSource.pruneRemote(msg.repo, msg.name)
	});
}

export async function handleSetRemoteDefaultBranch(ctx: BranchRemoteActionContext, msg: RequestSetRemoteDefaultBranch): Promise<void> {
	ctx.sendMessage({
		command: 'setRemoteDefaultBranch',
		error: await ctx.dataSource.setRemoteDefaultBranch(msg.repo, msg.remote, msg.branch)
	});
}

export async function handlePullBranch(ctx: BranchRemoteActionContext, msg: RequestPullBranch): Promise<void> {
	const pullError = await ctx.dataSource.pullBranch(msg.repo, msg.branchName, msg.remote, msg.createNewCommit, msg.squash);
	if (pullError !== null && (pullError.includes('cannot pull with rebase') || pullError.includes('You have unstaged changes'))) {
		const files = await ctx.dataSource.getUnstagedFiles(msg.repo);
		ctx.sendMessage({
			command: 'pullBranchUnstagedChanges',
			repo: msg.repo,
			branchName: msg.branchName,
			remote: msg.remote,
			createNewCommit: msg.createNewCommit,
			squash: msg.squash,
			files: files
		});
	} else {
		ctx.sendMessage({ command: 'pullBranch', error: pullError });
	}
}

export async function handlePullBranchWithStash(ctx: BranchRemoteActionContext, msg: RequestPullBranchWithStash): Promise<void> {
	ctx.sendMessage({
		command: 'pullBranch',
		error: await ctx.dataSource.pullBranchWithStash(msg.repo, msg.branchName, msg.remote, msg.createNewCommit, msg.squash, msg.reapply)
	});
}

export async function handlePushBranch(ctx: BranchRemoteActionContext, msg: RequestPushBranch): Promise<void> {
	ctx.sendMessage({
		command: 'pushBranch',
		repo: msg.repo,
		branchName: msg.branchName,
		remotes: msg.remotes,
		setUpstream: msg.setUpstream,
		willUpdateBranchConfig: msg.willUpdateBranchConfig,
		errors: await ctx.dataSource.pushBranchToMultipleRemotes(msg.repo, msg.branchName, msg.remotes, msg.setUpstream, msg.mode)
	});
}

export async function handleRebase(ctx: BranchRemoteActionContext, msg: RequestRebase): Promise<void> {
	ctx.sendMessage({
		command: 'rebase',
		actionOn: msg.actionOn,
		interactive: msg.interactive,
		error: await ctx.dataSource.rebase(msg.repo, msg.obj, msg.actionOn, msg.ignoreDate, msg.interactive)
	});
}

export async function handleRenameBranch(ctx: BranchRemoteActionContext, msg: RequestRenameBranch): Promise<void> {
	ctx.sendMessage({
		command: 'renameBranch',
		error: await ctx.dataSource.renameBranch(msg.repo, msg.oldName, msg.newName)
	});
}

export async function handleSetBranchUpstream(ctx: BranchRemoteActionContext, msg: RequestSetBranchUpstream): Promise<void> {
	ctx.sendMessage({
		command: 'setBranchUpstream',
		error: await ctx.dataSource.setBranchUpstream(msg.repo, msg.branchName, msg.upstream)
	});
}

export async function handleUnsetBranchUpstream(ctx: BranchRemoteActionContext, msg: RequestUnsetBranchUpstream): Promise<void> {
	ctx.sendMessage({
		command: 'unsetBranchUpstream',
		error: await ctx.dataSource.unsetBranchUpstream(msg.repo, msg.branchName)
	});
}
