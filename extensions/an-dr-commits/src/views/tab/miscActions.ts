import * as vscode from 'vscode';
import { AvatarManager } from '../../avatarManager';
import { DataSource, GitConfigKey } from '../../dataSource';
import { ErrorInfo, GitConfigLocation, RequestDeleteUserDetails, RequestEditUserDetails, RequestFetchAvatar, RequestOpenExtensionSettings, RequestOpenExternalUrl, RequestSendToCodeReview, RequestShowErrorDialog, RequestViewScm, ResponseMessage } from '../../types';
import { openExtensionSettings, openExternalUrl, showErrorMessage, viewScm } from '../../utils';

/**
 * The subset of TabView's dependencies needed to handle the remaining
 * miscellaneous messages that don't belong to any other action group.
 */
export interface MiscActionContext {
	readonly dataSource: DataSource;
	readonly avatarManager: AvatarManager;
	sendMessage(msg: ResponseMessage): void;
}

export async function handleDeleteUserDetails(ctx: MiscActionContext, msg: RequestDeleteUserDetails): Promise<void> {
	const errorInfos: ErrorInfo[] = [];
	if (msg.name) {
		errorInfos.push(await ctx.dataSource.unsetConfigValue(msg.repo, GitConfigKey.UserName, msg.location));
	}
	if (msg.email) {
		errorInfos.push(await ctx.dataSource.unsetConfigValue(msg.repo, GitConfigKey.UserEmail, msg.location));
	}
	ctx.sendMessage({
		command: 'deleteUserDetails',
		errors: errorInfos
	});
}

export async function handleEditUserDetails(ctx: MiscActionContext, msg: RequestEditUserDetails): Promise<void> {
	const errorInfos: ErrorInfo[] = [
		await ctx.dataSource.setConfigValue(msg.repo, GitConfigKey.UserName, msg.name, msg.location),
		await ctx.dataSource.setConfigValue(msg.repo, GitConfigKey.UserEmail, msg.email, msg.location)
	];
	if (errorInfos[0] === null && errorInfos[1] === null) {
		if (msg.deleteLocalName) {
			errorInfos.push(await ctx.dataSource.unsetConfigValue(msg.repo, GitConfigKey.UserName, GitConfigLocation.Local));
		}
		if (msg.deleteLocalEmail) {
			errorInfos.push(await ctx.dataSource.unsetConfigValue(msg.repo, GitConfigKey.UserEmail, GitConfigLocation.Local));
		}
	}
	ctx.sendMessage({
		command: 'editUserDetails',
		errors: errorInfos
	});
}

export async function handleOpenExtensionSettings(ctx: MiscActionContext, _msg: RequestOpenExtensionSettings): Promise<void> {
	ctx.sendMessage({
		command: 'openExtensionSettings',
		error: await openExtensionSettings()
	});
}

export async function handleOpenExternalUrl(ctx: MiscActionContext, msg: RequestOpenExternalUrl): Promise<void> {
	ctx.sendMessage({
		command: 'openExternalUrl',
		error: await openExternalUrl(msg.url)
	});
}

export function handleShowErrorMessage(_ctx: MiscActionContext, msg: RequestShowErrorDialog): void {
	showErrorMessage(msg.message);
}

export async function handleViewScm(ctx: MiscActionContext, _msg: RequestViewScm): Promise<void> {
	ctx.sendMessage({
		command: 'viewScm',
		error: await viewScm()
	});
}

export function handleFetchAvatar(ctx: MiscActionContext, msg: RequestFetchAvatar): void {
	ctx.avatarManager.fetchAvatarImage(msg.email, msg.repo, msg.remote, msg.commits);
}

export function handleSendToCodeReview(_ctx: MiscActionContext, msg: RequestSendToCodeReview): void {
	void vscode.commands.executeCommand('an-dr-code-review.setCommitRange', msg.from, msg.to, msg.repo);
}
