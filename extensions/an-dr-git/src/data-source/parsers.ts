import { DiffNameStatusRecord, DiffNumStatRecord, GitStatusFiles, removeTrailingBlankLines } from './helpers';
import { BranchUpstreamData, GitBranchData, GitCommitRecord, GitRefData, ParsedCommitDetails } from './models';
import { GitFileStatus, GitStash, GitSignatureStatus } from '../types';
import { getPathFromStr } from '../utils';

type BranchParserOptions = {
	showRemoteHeads: boolean;
	hideRemotePatterns: ReadonlyArray<string>;
	detachedHeadRegex: RegExp;
	invalidBranchRegex: RegExp;
	remoteHeadRegex: RegExp;
};

type RefParserOptions = {
	showRemoteHeads: boolean;
	hideRemotePatterns: ReadonlyArray<string>;
};

export function parseBranchesOutput(stdout: string, options: BranchParserOptions): GitBranchData {
	const branchData: GitBranchData = { branches: [], branchUpstreams: {}, goneUpstreamBranches: [], remoteHeadTargets: {}, head: null, error: null };
	const lines = stdout.split(/\r\n|\r|\n/g);
	for (let i = 0; i < lines.length - 1; i++) {
		const lineContents = lines[i].substring(2);
		const symbolicRefSplit = lineContents.split(' -> ');
		const name = symbolicRefSplit[0];
		const symbolicTarget = symbolicRefSplit.length > 1 ? symbolicRefSplit.slice(1).join(' -> ').trim() : null;

		if (options.showRemoteHeads && symbolicTarget !== null && options.remoteHeadRegex.test(name)) {
			const remoteName = name.substring(8, name.length - 5);
			if (remoteName !== '' && symbolicTarget !== '') {
				branchData.remoteHeadTargets[remoteName] = symbolicTarget;
			}
		}

		if (options.detachedHeadRegex.test(name)) {
			branchData.head = 'HEAD';
			branchData.branches.unshift('HEAD');
			continue;
		}

		if (options.invalidBranchRegex.test(name) || options.hideRemotePatterns.some((pattern) => name.startsWith(pattern)) || (!options.showRemoteHeads && options.remoteHeadRegex.test(name))) {
			continue;
		}

		if (lines[i][0] === '*') {
			branchData.head = name;
			branchData.branches.unshift(name);
		} else {
			branchData.branches.push(name);
		}
	}
	return branchData;
}

export function parseBranchUpstreamsOutput(stdout: string, separator: string): BranchUpstreamData {
	const branchUpstreams: { [branchName: string]: string } = {};
	const goneUpstreamBranches: string[] = [];
	const lines = stdout.split(/\r\n|\r|\n/g);
	for (let i = 0; i < lines.length - 1; i++) {
		const record = lines[i].split(separator);
		if (record.length >= 2 && record[1] !== '') {
			branchUpstreams[record[0]] = record[1];
		}
		if (record.length >= 3 && record[2] === '[gone]') {
			goneUpstreamBranches.push(record[0]);
		}
	}
	return { branchUpstreams, goneUpstreamBranches };
}

export function applyBranchUpstreams(branchData: GitBranchData, upstreamData: BranchUpstreamData): GitBranchData {
	Object.keys(upstreamData.branchUpstreams).forEach((branch) => {
		if (branchData.branches.includes(branch)) {
			branchData.branchUpstreams[branch] = upstreamData.branchUpstreams[branch];
		}
	});
	branchData.goneUpstreamBranches = upstreamData.goneUpstreamBranches.filter((branch) => branchData.branches.includes(branch));
	return branchData;
}

export function parseCommitDetailsOutput(stdout: string, separator: string): ParsedCommitDetails {
	const commitInfo = stdout.split(separator);
	return {
		hash: commitInfo[0],
		parents: commitInfo[1] !== '' ? commitInfo[1].split(' ') : [],
		author: commitInfo[2],
		authorEmail: commitInfo[3],
		authorDate: parseInt(commitInfo[4]),
		committer: commitInfo[5],
		committerEmail: commitInfo[6],
		committerDate: parseInt(commitInfo[7]),
		signature: ['G', 'U', 'X', 'Y', 'R', 'E', 'B'].includes(commitInfo[8])
			? {
				key: commitInfo[10].trim(),
				signer: commitInfo[9].trim(),
				status: <GitSignatureStatus>commitInfo[8]
			}
			: null,
		body: removeTrailingBlankLines(commitInfo.slice(11).join(separator).split(/\r\n|\r|\n/g)).join('\n'),
		fileChanges: []
	};
}

export function parseDiffNameStatusOutput(output: string[]): DiffNameStatusRecord[] {
	const records: DiffNameStatusRecord[] = [];
	let i = 0;
	while (i < output.length && output[i] !== '') {
		const type = <GitFileStatus>output[i][0];
		if (type === GitFileStatus.Added || type === GitFileStatus.Deleted || type === GitFileStatus.Modified) {
			const path = getPathFromStr(output[i + 1]);
			records.push({ type, oldFilePath: path, newFilePath: path });
			i += 2;
		} else if (type === GitFileStatus.Renamed) {
			records.push({ type, oldFilePath: getPathFromStr(output[i + 1]), newFilePath: getPathFromStr(output[i + 2]) });
			i += 3;
		} else {
			break;
		}
	}
	return records;
}

export function parseDiffNumStatOutput(output: string[]): DiffNumStatRecord[] {
	const records: DiffNumStatRecord[] = [];
	let i = 0;
	while (i < output.length && output[i] !== '') {
		const fields = output[i].split('\t');
		if (fields.length !== 3) break;
		if (fields[2] !== '') {
			records.push({ filePath: getPathFromStr(fields[2]), additions: parseInt(fields[0]), deletions: parseInt(fields[1]) });
			i += 1;
		} else {
			records.push({ filePath: getPathFromStr(output[i + 2]), additions: parseInt(fields[0]), deletions: parseInt(fields[1]) });
			i += 3;
		}
	}
	return records;
}

export function parseLogOutput(stdout: string, separator: string): GitCommitRecord[] {
	const lines = stdout.split(/\r\n|\r|\n/g);
	const commits: GitCommitRecord[] = [];
	for (let i = 0; i < lines.length - 1; i++) {
		const line = lines[i].split(separator);
		if (line.length !== 6) break;
		commits.push({ hash: line[0], parents: line[1] !== '' ? line[1].split(' ') : [], author: line[2], email: line[3], date: parseInt(line[4]), message: line[5] });
	}
	return commits;
}

export function parseRefsOutput(stdout: string, options: RefParserOptions): GitRefData {
	const refData: GitRefData = { head: null, heads: [], tags: [], remotes: [] };
	const lines = stdout.split(/\r\n|\r|\n/g);
	for (let i = 0; i < lines.length - 1; i++) {
		const line = lines[i].split(' ');
		if (line.length < 2) continue;

		const hash = line.shift()!;
		const ref = line.join(' ');

		if (ref.startsWith('refs/heads/')) {
			refData.heads.push({ hash, name: ref.substring(11) });
		} else if (ref.startsWith('refs/tags/')) {
			const annotated = ref.endsWith('^{}');
			refData.tags.push({ hash, name: (annotated ? ref.substring(10, ref.length - 3) : ref.substring(10)), annotated });
		} else if (ref.startsWith('refs/remotes/')) {
			if (!options.hideRemotePatterns.some((pattern) => ref.startsWith(pattern)) && (options.showRemoteHeads || !ref.endsWith('/HEAD'))) {
				refData.remotes.push({ hash, name: ref.substring(13) });
			}
		} else if (ref === 'HEAD') {
			refData.head = hash;
		}
	}
	return refData;
}

export function parseRemotesContainingCommitOutput(stdout: string, invalidBranchRegex: RegExp, knownRemotes: string[]): string[] {
	const branchNames = stdout.split(/\r\n|\r|\n/g)
		.filter((line) => line.length > 2)
		.map((line) => line.substring(2).split(' -> ')[0])
		.filter((branchName) => !invalidBranchRegex.test(branchName));

	return knownRemotes.filter((knownRemote) => {
		const knownRemotePrefix = knownRemote + '/';
		return branchNames.some((branchName) => branchName.startsWith(knownRemotePrefix));
	});
}

export function parseStashesOutput(stdout: string, separator: string): GitStash[] {
	const lines = stdout.split(/\r\n|\r|\n/g);
	const stashes: GitStash[] = [];
	for (let i = 0; i < lines.length - 1; i++) {
		const line = lines[i].split(separator);
		if (line.length !== 7 || line[1] === '') continue;
		const parentHashes = line[1].split(' ');
		stashes.push({
			hash: line[0],
			baseHash: parentHashes[0],
			untrackedFilesHash: parentHashes.length === 3 ? parentHashes[2] : null,
			selector: line[2],
			author: line[3],
			email: line[4],
			date: parseInt(line[5]),
			message: line[6]
		});
	}
	return stashes;
}

export function parseStatusOutput(stdout: string): GitStatusFiles {
	const output = stdout.split('\0');
	const status: GitStatusFiles = { deleted: [], untracked: [] };
	let i = 0;
	while (i < output.length && output[i] !== '') {
		if (output[i].length < 4) break;
		const path = output[i].substring(3);
		const c1 = output[i].substring(0, 1);
		const c2 = output[i].substring(1, 2);
		if (c1 === 'D' || c2 === 'D') {
			status.deleted.push(path);
		} else if (c1 === '?' || c2 === '?') {
			status.untracked.push(path);
		}

		if (c1 === 'R' || c2 === 'R' || c1 === 'C' || c2 === 'C') {
			i += 2;
		} else {
			i += 1;
		}
	}
	return status;
}
