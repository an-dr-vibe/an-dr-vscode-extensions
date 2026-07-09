import { DataSource } from '../../dataSource';
import { ErrorInfo, RequestAddTag, RequestApplyStash, RequestBranchFromStash, RequestDeleteTag, RequestDropStash, RequestPopStash, RequestPushStash, RequestPushTag, RequestResolveSidebarTagContext, RequestTagDetails, ResponseMessage } from '../../types';

/**
 * The subset of TabView's dependencies needed to handle tag and stash
 * management messages.
 */
export interface TagStashActionContext {
	readonly dataSource: DataSource;
	sendMessage(msg: ResponseMessage): void;
}

export async function handleAddTag(ctx: TagStashActionContext, msg: RequestAddTag): Promise<void> {
	const errorInfos: ErrorInfo[] = [await ctx.dataSource.addTag(msg.repo, msg.tagName, msg.commitHash, msg.type, msg.message, msg.force)];
	if (errorInfos[0] === null && msg.pushToRemote !== null) {
		errorInfos.push(...await ctx.dataSource.pushTag(msg.repo, msg.tagName, [msg.pushToRemote], msg.commitHash, msg.pushSkipRemoteCheck));
	}
	ctx.sendMessage({
		command: 'addTag',
		repo: msg.repo,
		tagName: msg.tagName,
		pushToRemote: msg.pushToRemote,
		commitHash: msg.commitHash,
		errors: errorInfos
	});
}

export async function handleDeleteTag(ctx: TagStashActionContext, msg: RequestDeleteTag): Promise<void> {
	ctx.sendMessage({
		command: 'deleteTag',
		error: await ctx.dataSource.deleteTag(msg.repo, msg.tagName, msg.deleteOnRemote)
	});
}

export async function handlePushTag(ctx: TagStashActionContext, msg: RequestPushTag): Promise<void> {
	ctx.sendMessage({
		command: 'pushTag',
		repo: msg.repo,
		tagName: msg.tagName,
		remotes: msg.remotes,
		commitHash: msg.commitHash,
		errors: await ctx.dataSource.pushTag(msg.repo, msg.tagName, msg.remotes, msg.commitHash, msg.skipRemoteCheck)
	});
}

export async function handleTagDetails(ctx: TagStashActionContext, msg: RequestTagDetails): Promise<void> {
	ctx.sendMessage({
		command: 'tagDetails',
		tagName: msg.tagName,
		commitHash: msg.commitHash,
		...await ctx.dataSource.getTagDetails(msg.repo, msg.tagName)
	});
}

export async function handleResolveSidebarTagContext(ctx: TagStashActionContext, msg: RequestResolveSidebarTagContext): Promise<void> {
	ctx.sendMessage({
		command: 'resolveSidebarTagContext',
		requestId: msg.requestId,
		tagName: msg.tagName,
		...await ctx.dataSource.getTagContext(msg.repo, msg.tagName)
	});
}

export async function handleApplyStash(ctx: TagStashActionContext, msg: RequestApplyStash): Promise<void> {
	ctx.sendMessage({
		command: 'applyStash',
		error: await ctx.dataSource.applyStash(msg.repo, msg.selector, msg.reinstateIndex)
	});
}

export async function handleBranchFromStash(ctx: TagStashActionContext, msg: RequestBranchFromStash): Promise<void> {
	ctx.sendMessage({
		command: 'branchFromStash',
		error: await ctx.dataSource.branchFromStash(msg.repo, msg.selector, msg.branchName)
	});
}

export async function handleDropStash(ctx: TagStashActionContext, msg: RequestDropStash): Promise<void> {
	ctx.sendMessage({
		command: 'dropStash',
		error: await ctx.dataSource.dropStash(msg.repo, msg.selector)
	});
}

export async function handlePopStash(ctx: TagStashActionContext, msg: RequestPopStash): Promise<void> {
	ctx.sendMessage({
		command: 'popStash',
		error: await ctx.dataSource.popStash(msg.repo, msg.selector, msg.reinstateIndex)
	});
}

export async function handlePushStash(ctx: TagStashActionContext, msg: RequestPushStash): Promise<void> {
	ctx.sendMessage({
		command: 'pushStash',
		error: await ctx.dataSource.pushStash(msg.repo, msg.message, msg.includeUntracked)
	});
}
