import * as fs from 'fs';
import * as vscode from 'vscode';
import { getPathFromUri, pathWithTrailingSlash } from '../utils';

export interface WorkspaceFolderInfoForRepoInclusionMapping {
	readonly workspaceFolders: readonly vscode.WorkspaceFolder[];
	readonly rootsExact: readonly string[];
	readonly rootsFolder: readonly string[];
}

/**
 * Gets the current workspace folders, and generates information required to identify whether a repository is within any of the workspace folders.
 */
export function getWorkspaceFolderInfoForRepoInclusionMapping(): WorkspaceFolderInfoForRepoInclusionMapping {
	let rootsExact: string[] = [], rootsFolder: string[] = [], workspaceFolders = vscode.workspace.workspaceFolders || [], path;
	for (let i = 0; i < workspaceFolders.length; i++) {
		path = getPathFromUri(workspaceFolders[i].uri);
		rootsExact.push(path);
		rootsFolder.push(pathWithTrailingSlash(path));
	}
	return {
		workspaceFolders: workspaceFolders,
		rootsExact: rootsExact,
		rootsFolder: rootsFolder
	};
}

/**
 * Check if the specified path is a directory.
 */
export function isDirectory(path: string): Promise<boolean> {
	return new Promise<boolean>(resolve => {
		fs.stat(path, (err, stats) => {
			resolve(err ? false : stats.isDirectory());
		});
	});
}

/**
 * Check if the specified path exists.
 */
export function doesPathExist(path: string): Promise<boolean> {
	return new Promise<boolean>(resolve => {
		fs.stat(path, err => resolve(!err));
	});
}
