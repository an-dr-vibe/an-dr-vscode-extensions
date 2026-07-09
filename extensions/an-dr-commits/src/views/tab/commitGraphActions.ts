import { AvatarManager } from '../../avatarManager';
import { DataSource, GitCommitDetailsData } from '../../dataSource';
import { Logger } from '../../logger';
import { ErrorInfo, RequestCheckoutCommit, RequestCherrypickCommit, RequestCommitDetails, RequestCompareCommits, RequestDropCommit, RequestEditCommitAuthor, RequestResetToCommit, RequestResetToHead, RequestRevertCommit, RequestRewordCommit, RequestSidebarBatchRefAction, RequestSquashCommits, ResponseMessage, SidebarBatchRefActionTarget, SidebarBatchRefActionType, SidebarBatchRefType } from '../../types';
import { UNCOMMITTED, archive, viewScm } from '../../utils';

/**
 * The subset of TabView's dependencies needed to handle commit-graph
 * messages (commit details/comparison, and actions performed on a specific
 * commit or a batch of sidebar-selected refs).
 */
export interface CommitGraphActionContext {
	readonly dataSource: DataSource;
	readonly avatarManager: AvatarManager;
	readonly logger: Logger;
	sendMessage(msg: ResponseMessage): void;
}

export async function handleCommitDetails(ctx: CommitGraphActionContext, msg: RequestCommitDetails): Promise<void> {
	const data = await Promise.all<GitCommitDetailsData, string | null>([
		msg.commitHash === UNCOMMITTED
			? ctx.dataSource.getUncommittedDetails(msg.repo)
			: msg.stash === null
				? ctx.dataSource.getCommitDetails(msg.repo, msg.commitHash, msg.hasParents)
				: ctx.dataSource.getStashDetails(msg.repo, msg.commitHash, msg.stash),
		msg.avatarEmail !== null ? ctx.avatarManager.getAvatarImage(msg.avatarEmail) : Promise.resolve(null)
	]);
	ctx.sendMessage({
		command: 'commitDetails',
		...data[0],
		avatar: data[1],
		refresh: msg.refresh
	});
}

export async function handleCompareCommits(ctx: CommitGraphActionContext, msg: RequestCompareCommits): Promise<void> {
	ctx.sendMessage({
		command: 'compareCommits',
		commitHash: msg.commitHash,
		compareWithHash: msg.compareWithHash,
		...await ctx.dataSource.getCommitComparison(msg.repo, msg.fromHash, msg.toHash),
		refresh: msg.refresh
	});
}

export async function handleCheckoutCommit(ctx: CommitGraphActionContext, msg: RequestCheckoutCommit): Promise<void> {
	ctx.logger.log('Processing checkoutCommit command for repo: ' + msg.repo + ', commit: ' + msg.commitHash);
	const checkoutCommitError = await ctx.dataSource.checkoutCommit(msg.repo, msg.commitHash);
	ctx.sendMessage({
		command: 'checkoutCommit',
		error: checkoutCommitError
	});
	ctx.logger.log('Finished checkoutCommit command.');
}

export async function handleCherrypickCommit(ctx: CommitGraphActionContext, msg: RequestCherrypickCommit): Promise<void> {
	const errorInfos: ErrorInfo[] = [await ctx.dataSource.cherrypickCommit(msg.repo, msg.commitHash, msg.parentIndex, msg.recordOrigin, msg.noCommit)];
	if (errorInfos[0] === null && msg.noCommit) {
		errorInfos.push(await viewScm());
	}
	ctx.sendMessage({ command: 'cherrypickCommit', errors: errorInfos });
}

export async function handleDropCommit(ctx: CommitGraphActionContext, msg: RequestDropCommit): Promise<void> {
	ctx.sendMessage({
		command: 'dropCommit',
		error: await ctx.dataSource.dropCommit(msg.repo, msg.commitHash)
	});
}

export async function handleRewordCommit(ctx: CommitGraphActionContext, msg: RequestRewordCommit): Promise<void> {
	const rewordCommitMessage = await ctx.dataSource.promptForRewordCommitMessage(msg.repo, msg.commitHash);
	if (rewordCommitMessage.error !== null || rewordCommitMessage.message === null) {
		ctx.sendMessage({
			command: 'rewordCommit',
			error: rewordCommitMessage.error
		});
		return;
	}
	ctx.sendMessage({
		command: 'rewordCommit',
		error: await ctx.dataSource.rewordCommit(msg.repo, msg.commitHash, rewordCommitMessage.message)
	});
}

export async function handleEditCommitAuthor(ctx: CommitGraphActionContext, msg: RequestEditCommitAuthor): Promise<void> {
	ctx.sendMessage({
		command: 'editCommitAuthor',
		error: await ctx.dataSource.editCommitAuthor(msg.repo, msg.commitHash, msg.name, msg.email)
	});
}

export async function handleSquashCommits(ctx: CommitGraphActionContext, msg: RequestSquashCommits): Promise<void> {
	const squashCommitMessage = await ctx.dataSource.promptForSquashCommitMessage(msg.repo, msg.commitHashes);
	if (squashCommitMessage.error !== null || squashCommitMessage.message === null) {
		ctx.sendMessage({
			command: 'squashCommits',
			error: squashCommitMessage.error
		});
		return;
	}
	ctx.sendMessage({
		command: 'squashCommits',
		error: await ctx.dataSource.squashCommits(msg.repo, msg.commitHashes, squashCommitMessage.message)
	});
}

export async function handleResetToCommit(ctx: CommitGraphActionContext, msg: RequestResetToCommit): Promise<void> {
	ctx.sendMessage({
		command: 'resetToCommit',
		error: await ctx.dataSource.resetToCommit(msg.repo, msg.commit, msg.resetMode)
	});
}

export async function handleResetToHead(ctx: CommitGraphActionContext, msg: RequestResetToHead): Promise<void> {
	ctx.sendMessage({
		command: 'resetToHead',
		error: await ctx.dataSource.resetToHead(msg.repo, msg.resetTracked, msg.cleanUntracked, msg.cleanIgnored, msg.resetSubmodules, msg.cleanSubmodules, msg.updateSubmodules)
	});
}

export async function handleRevertCommit(ctx: CommitGraphActionContext, msg: RequestRevertCommit): Promise<void> {
	ctx.sendMessage({
		command: 'revertCommit',
		error: await ctx.dataSource.revertCommit(msg.repo, msg.commitHash, msg.parentIndex)
	});
}

export async function handleSidebarBatchRefAction(ctx: CommitGraphActionContext, msg: RequestSidebarBatchRefAction): Promise<void> {
	ctx.sendMessage({
		command: 'sidebarBatchRefAction',
		action: msg.action,
		results: await executeSidebarBatchRefAction(ctx.dataSource, msg)
	});
}

async function executeSidebarBatchRefAction(dataSource: DataSource, msg: RequestSidebarBatchRefAction): Promise<ReadonlyArray<{ type: SidebarBatchRefType, name: string, error: ErrorInfo }>> {
	const results: { type: SidebarBatchRefType, name: string, error: ErrorInfo }[] = [];
	for (let i = 0; i < msg.refs.length; i++) {
		const ref = msg.refs[i];
		results.push({
			type: ref.type,
			name: getSidebarBatchRefDisplayName(ref),
			error: await executeSidebarBatchRefActionForRef(dataSource, msg, ref)
		});
	}
	return results;
}

async function executeSidebarBatchRefActionForRef(dataSource: DataSource, msg: RequestSidebarBatchRefAction, ref: SidebarBatchRefActionTarget): Promise<ErrorInfo> {
	switch (msg.action) {
		case SidebarBatchRefActionType.Delete:
			if (ref.type === SidebarBatchRefType.LocalBranch) {
				return dataSource.deleteBranch(msg.repo, ref.name, false);
			}
			if (ref.type === SidebarBatchRefType.RemoteBranch) {
				if (ref.remote === null) return 'Unable to delete remote branch: Missing remote name.';
				return dataSource.deleteRemoteBranch(msg.repo, ref.name, ref.remote);
			}
			if (ref.type === SidebarBatchRefType.Tag) {
				return dataSource.deleteTag(msg.repo, ref.name, null);
			}
			break;

		case SidebarBatchRefActionType.Push:
			if (ref.type === SidebarBatchRefType.LocalBranch) {
				const errors = await dataSource.pushBranchToMultipleRemotes(msg.repo, ref.name, <string[]>msg.remotes, msg.setUpstream, msg.pushMode);
				return reduceSequentialCommandErrors(errors);
			}
			if (ref.type === SidebarBatchRefType.Tag) {
				if (ref.hash === null) return 'Unable to push tag "' + ref.name + '": Missing resolved tag hash.';
				const errors = await dataSource.pushTag(msg.repo, ref.name, <string[]>msg.remotes, ref.hash, msg.skipRemoteCheck);
				return reduceSequentialCommandErrors(errors);
			}
			return 'Push is not supported for the selected remote-tracking branch "' + getSidebarBatchRefDisplayName(ref) + '".';

		case SidebarBatchRefActionType.Archive:
			if (ref.type === SidebarBatchRefType.RemoteBranch) {
				if (ref.remote === null) return 'Unable to create archive: Missing remote name.';
				return archive(msg.repo, ref.remote + '/' + ref.name, dataSource);
			}
			return archive(msg.repo, ref.name, dataSource);
	}

	return 'Unsupported sidebar batch action.';
}

function getSidebarBatchRefDisplayName(ref: SidebarBatchRefActionTarget) {
	return ref.type === SidebarBatchRefType.RemoteBranch && ref.remote !== null ? ref.remote + '/' + ref.name : ref.name;
}

function reduceSequentialCommandErrors(errors: ErrorInfo[]): ErrorInfo {
	for (let i = 0; i < errors.length; i++) {
		if (errors[i] !== null) return errors[i];
	}
	return null;
}
