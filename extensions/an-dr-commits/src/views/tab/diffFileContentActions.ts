import * as vscode from 'vscode';
import { DataSource } from '../../dataSource';
import { RequestAddToGitignore, RequestCopyFilePath, RequestCopyToClipboard, RequestCreateArchive, RequestGetFileDiff, RequestGetFullDiffContent, RequestOpenExternalDirDiff, RequestOpenFile, RequestResetFileToRevision, RequestViewDiff, RequestViewDiffWithWorkingFile, RequestViewFileAtRevision, ResponseMessage } from '../../types';
import { UNCOMMITTED, archive, copyFilePathToClipboard, copyToClipboard, openFile, viewDiff, viewDiffWithWorkingFile, viewFileAtRevision } from '../../utils';

/**
 * The subset of TabView's dependencies needed to handle diff viewing and
 * file-content / file-management messages.
 */
export interface DiffFileContentActionContext {
	readonly dataSource: DataSource;
	sendMessage(msg: ResponseMessage): void;
}

export async function handleCopyFilePath(ctx: DiffFileContentActionContext, msg: RequestCopyFilePath): Promise<void> {
	ctx.sendMessage({
		command: 'copyFilePath',
		error: await copyFilePathToClipboard(msg.repo, msg.filePath, msg.absolute)
	});
}

export async function handleCopyToClipboard(ctx: DiffFileContentActionContext, msg: RequestCopyToClipboard): Promise<void> {
	ctx.sendMessage({
		command: 'copyToClipboard',
		type: msg.type,
		error: await copyToClipboard(msg.data)
	});
}

export async function handleCreateArchive(ctx: DiffFileContentActionContext, msg: RequestCreateArchive): Promise<void> {
	ctx.sendMessage({
		command: 'createArchive',
		error: await archive(msg.repo, msg.ref, ctx.dataSource)
	});
}

export async function handleOpenExternalDirDiff(ctx: DiffFileContentActionContext, msg: RequestOpenExternalDirDiff): Promise<void> {
	ctx.sendMessage({
		command: 'openExternalDirDiff',
		error: await ctx.dataSource.openExternalDirDiff(msg.repo, msg.fromHash, msg.toHash, msg.isGui)
	});
}

export async function handleOpenFile(ctx: DiffFileContentActionContext, msg: RequestOpenFile): Promise<void> {
	ctx.sendMessage({
		command: 'openFile',
		error: await openFile(msg.repo, msg.filePath, msg.hash, ctx.dataSource)
	});
}

export async function handleViewDiff(ctx: DiffFileContentActionContext, msg: RequestViewDiff): Promise<void> {
	ctx.sendMessage({
		command: 'viewDiff',
		error: await viewDiff(msg.repo, msg.fromHash, msg.toHash, msg.oldFilePath, msg.newFilePath, msg.type,
			msg.viewColumn !== undefined ? msg.viewColumn as vscode.ViewColumn : undefined)
	});
}

export async function handleGetFileDiff(ctx: DiffFileContentActionContext, msg: RequestGetFileDiff): Promise<void> {
	ctx.sendMessage({
		command: 'getFileDiff',
		diff: await ctx.dataSource.getFileDiff(msg.repo, msg.fromHash, msg.toHash, msg.oldFilePath, msg.newFilePath),
		error: null
	});
}

export async function handleGetFullDiffContent(ctx: DiffFileContentActionContext, msg: RequestGetFullDiffContent): Promise<void> {
	const readCommitFile = async (commitHash: string, filePath: string) => {
		try {
			return { exists: true, content: await ctx.dataSource.getCommitFile(msg.repo, commitHash, filePath) };
		} catch {
			return { exists: false, content: null };
		}
	};
	const readWorkingTreeFile = async (filePath: string) => {
		try {
			return { exists: true, content: await ctx.dataSource.getWorkingTreeFile(msg.repo, filePath) };
		} catch {
			return { exists: false, content: null };
		}
	};

	let oldFile: { exists: boolean; content: string | null };
	let newFile: { exists: boolean; content: string | null };
	if (msg.fromHash === msg.toHash) {
		if (msg.toHash === UNCOMMITTED) {
			oldFile = msg.type === 'A' || msg.type === 'U'
				? { exists: false, content: null }
				: await readCommitFile('HEAD', msg.oldFilePath);
			newFile = msg.type === 'D'
				? { exists: false, content: null }
				: await readWorkingTreeFile(msg.newFilePath);
		} else {
			oldFile = msg.type === 'A'
				? { exists: false, content: null }
				: await readCommitFile(msg.fromHash + '^', msg.oldFilePath);
			newFile = msg.type === 'D'
				? { exists: false, content: null }
				: await readCommitFile(msg.toHash, msg.newFilePath);
		}
	} else if (msg.toHash === UNCOMMITTED) {
		oldFile = msg.type === 'A' || msg.type === 'U'
			? { exists: false, content: null }
			: await readCommitFile(msg.fromHash, msg.oldFilePath);
		newFile = msg.type === 'D'
			? { exists: false, content: null }
			: await readWorkingTreeFile(msg.newFilePath);
	} else {
		oldFile = msg.type === 'A' || msg.type === 'U'
			? { exists: false, content: null }
			: await readCommitFile(msg.fromHash, msg.oldFilePath);
		newFile = msg.type === 'D'
			? { exists: false, content: null }
			: await readCommitFile(msg.toHash, msg.newFilePath);
	}

	ctx.sendMessage({
		command: 'getFullDiffContent',
		diff: await ctx.dataSource.getFileDiff(msg.repo, msg.fromHash, msg.toHash, msg.oldFilePath, msg.newFilePath),
		oldContent: oldFile.content,
		newContent: newFile.content,
		oldExists: oldFile.exists,
		newExists: newFile.exists,
		error: null
	});
}

export async function handleViewDiffWithWorkingFile(ctx: DiffFileContentActionContext, msg: RequestViewDiffWithWorkingFile): Promise<void> {
	ctx.sendMessage({
		command: 'viewDiffWithWorkingFile',
		error: await viewDiffWithWorkingFile(msg.repo, msg.hash, msg.filePath, ctx.dataSource)
	});
}

export async function handleViewFileAtRevision(ctx: DiffFileContentActionContext, msg: RequestViewFileAtRevision): Promise<void> {
	ctx.sendMessage({
		command: 'viewFileAtRevision',
		error: await viewFileAtRevision(msg.repo, msg.hash, msg.filePath)
	});
}

export async function handleResetFileToRevision(ctx: DiffFileContentActionContext, msg: RequestResetFileToRevision): Promise<void> {
	ctx.sendMessage({
		command: 'resetFileToRevision',
		error: await ctx.dataSource.resetFileToRevision(msg.repo, msg.commitHash, msg.filePath)
	});
}

export async function handleAddToGitignore(ctx: DiffFileContentActionContext, msg: RequestAddToGitignore): Promise<void> {
	const ignoreError = await ctx.dataSource.addToGitignore(msg.repo, msg.filePath, msg.type);
	ctx.sendMessage({ command: 'addToGitignore', error: ignoreError });
}
