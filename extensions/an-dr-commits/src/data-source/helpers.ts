import { GitFileChange, GitFileStatus, Writeable } from '../types';
import { getPathFromStr } from '../utils';

const EOL_REGEX = /\r\n|\r|\n/g;

export interface DiffNameStatusRecord {
	type: GitFileStatus;
	oldFilePath: string;
	newFilePath: string;
	/** Git modes and object IDs are populated by raw diff output. */
	oldMode: string | null;
	newMode: string | null;
	oldSha: string | null;
	newSha: string | null;
}

export interface DiffNumStatRecord {
	filePath: string;
	additions: number;
	deletions: number;
}

export interface GitStatusFiles {
	deleted: string[];
	untracked: string[];
}

export type GitConfigSet = { [key: string]: string };

/**
 * Generates the file changes from the diff output and status information.
 */
export function generateFileChanges(nameStatusRecords: DiffNameStatusRecord[], numStatRecords: DiffNumStatRecord[], status: GitStatusFiles | null): Writeable<GitFileChange>[] {
	let fileChanges: Writeable<GitFileChange>[] = [], fileLookup: { [file: string]: number } = {}, i = 0;

	for (i = 0; i < nameStatusRecords.length; i++) {
		const record = nameStatusRecords[i];
		const isSubmodule = record.oldMode === '160000' || record.newMode === '160000';
		fileLookup[nameStatusRecords[i].newFilePath] = fileChanges.length;
		fileChanges.push({
			oldFilePath: record.oldFilePath,
			newFilePath: record.newFilePath,
			type: record.type,
			additions: null,
			deletions: null,
			submodule: isSubmodule ? {
				oldSha: record.oldMode === '160000' ? record.oldSha : null,
				newSha: record.newMode === '160000' ? record.newSha : null,
				trackedChanges: false,
				untrackedChanges: false
			} : null
		});
	}

	if (status !== null) {
		let filePath;
		for (i = 0; i < status.deleted.length; i++) {
			filePath = getPathFromStr(status.deleted[i]);
			if (typeof fileLookup[filePath] === 'number') {
				fileChanges[fileLookup[filePath]].type = GitFileStatus.Deleted;
			} else {
				fileChanges.push({ oldFilePath: filePath, newFilePath: filePath, type: GitFileStatus.Deleted, additions: null, deletions: null, submodule: null });
			}
		}
		for (i = 0; i < status.untracked.length; i++) {
			filePath = getPathFromStr(status.untracked[i]);
			fileChanges.push({ oldFilePath: filePath, newFilePath: filePath, type: GitFileStatus.Untracked, additions: null, deletions: null, submodule: null });
		}
	}

	for (i = 0; i < numStatRecords.length; i++) {
		if (typeof fileLookup[numStatRecords[i].filePath] === 'number' && fileChanges[fileLookup[numStatRecords[i].filePath]].submodule === null) {
			fileChanges[fileLookup[numStatRecords[i].filePath]].additions = numStatRecords[i].additions;
			fileChanges[fileLookup[numStatRecords[i].filePath]].deletions = numStatRecords[i].deletions;
		}
	}

	return fileChanges;
}

/**
 * Get the specified config value from a set of key-value config pairs.
 */
export function getConfigValue(configs: GitConfigSet, key: string): string | null {
	return typeof configs[key] !== 'undefined' ? configs[key] : null;
}

/**
 * Produce a suitable error message from a spawned Git command that terminated with an erroneous status code.
 */
export function getErrorMessage(error: Error | null, stdoutBuffer: Buffer, stderr: string): string {
	let stdout = stdoutBuffer.toString(), lines: string[];
	if (stdout !== '' || stderr !== '') {
		lines = (stderr + stdout).split(EOL_REGEX);
		lines.pop();
	} else if (error) {
		lines = error.message.split(EOL_REGEX);
	} else {
		lines = [];
	}
	return lines.join('\n');
}

/**
 * Remove trailing blank lines from an array of lines.
 */
export function removeTrailingBlankLines(lines: string[]): string[] {
	while (lines.length > 0 && lines[lines.length - 1] === '') {
		lines.pop();
	}
	return lines;
}

/**
 * Get all the unique strings from an array of strings.
 */
export function unique(items: ReadonlyArray<string>): string[] {
	const uniqueItems: { [item: string]: true } = {};
	items.forEach((item) => uniqueItems[item] = true);
	return Object.keys(uniqueItems);
}
