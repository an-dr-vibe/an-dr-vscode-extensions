import { DiffNameStatusRecord, DiffNumStatRecord, GitStatusFiles, removeTrailingBlankLines } from './helpers';
import { BlameLineInfo, GitBranchData, GitCommitRecord, GitRefData, GitRefSnapshot, ParsedCommitDetails } from './models';
import { GitFileStatus, GitStash, GitSignatureStatus } from '../types';
import { getPathFromStr } from '../utils';

type RefSnapshotParserOptions = {
	showRemoteBranches: boolean;
	showRemoteHeads: boolean;
	hideRemotePatterns: ReadonlyArray<string>;
};

export function parseBlameIncrementalOutput(stdout: string): ReadonlyMap<number, BlameLineInfo> {
	const lines = stdout.split(/\r\n|\r|\n/g);
	const commitInfo = new Map<string, Omit<BlameLineInfo, 'hash' | 'committed'>>();
	const result = new Map<number, BlameLineInfo>();
	for (let i = 0; i < lines.length; i++) {
		const header = lines[i].match(/^([0-9a-f]{40}) \d+ (\d+) (\d+)$/);
		if (header === null) continue;
		const hash = header[1], finalLine = parseInt(header[2], 10) - 1, lineCount = parseInt(header[3], 10);
		const previous = commitInfo.get(hash);
		let author = previous?.author ?? '', authorEmail = previous?.authorEmail ?? '';
		let authorTime = previous?.authorTime ?? 0, summary = previous?.summary ?? '';
		for (i++; i < lines.length && !lines[i].startsWith('filename '); i++) {
			if (lines[i].startsWith('author ')) author = lines[i].substring(7);
			else if (lines[i].startsWith('author-mail ')) authorEmail = lines[i].substring(12).replace(/^<|>$/g, '');
			else if (lines[i].startsWith('author-time ')) authorTime = parseInt(lines[i].substring(12), 10) || 0;
			else if (lines[i].startsWith('summary ')) summary = lines[i].substring(8);
		}
		commitInfo.set(hash, { author, authorEmail, authorTime, summary });
		const info = { author, authorEmail, authorTime, committed: hash !== '0000000000000000000000000000000000000000', hash, summary };
		for (let offset = 0; offset < lineCount; offset++) result.set(finalLine + offset, info);
	}
	return result;
}

/** Parses one `for-each-ref` snapshot into branch-navigation and commit-reference data. */
export function parseRefSnapshotOutput(stdout: string, headHash: string | null, separator: string, options: RefSnapshotParserOptions): GitRefSnapshot {
	const branches: GitBranchData = { branches: [], branchUpstreams: {}, goneUpstreamBranches: [], remoteHeadTargets: {}, head: null, repoInProgressState: null, error: null };
	const refs: GitRefData = { head: headHash, heads: [], tags: [], remotes: [] };
	for (const line of stdout.split(/\r\n|\r|\n/g)) {
		const record = line.split(separator);
		if (record.length !== 7) continue;
		const [objectHash, ref, peeledHash, symbolicTarget, upstream, upstreamTrack, headMarker] = record;
		if (ref.startsWith('refs/heads/')) {
			const name = ref.substring(11);
			refs.heads.push({ hash: objectHash, name });
			if (headMarker === '*') {
				branches.head = name;
				branches.branches.unshift(name);
			} else branches.branches.push(name);
			if (upstream !== '') branches.branchUpstreams[name] = upstream;
			if (upstreamTrack === '[gone]') branches.goneUpstreamBranches.push(name);
		} else if (ref.startsWith('refs/remotes/')) {
			if (!options.showRemoteBranches || options.hideRemotePatterns.some((pattern) => ref.startsWith(pattern))) continue;
			const name = ref.substring(13), isHead = name.endsWith('/HEAD');
			if (isHead && symbolicTarget !== '' && options.showRemoteHeads) {
				const remoteName = name.substring(0, name.length - 5);
				branches.remoteHeadTargets[remoteName] = symbolicTarget.replace(/^refs\/remotes\/|^remotes\//, '');
			}
			if (!isHead || options.showRemoteHeads) {
				branches.branches.push('remotes/' + name);
				refs.remotes.push({ hash: objectHash, name });
			}
		} else if (ref.startsWith('refs/tags/')) {
			refs.tags.push({ hash: peeledHash || objectHash, name: ref.substring(10), annotated: peeledHash !== '' });
		}
	}
	if (branches.head === null && headHash !== null) {
		branches.head = 'HEAD';
		branches.branches.unshift('HEAD');
	}
	return { branches, refs };
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
		const rawFields = output[i][0] === ':' ? output[i].substring(1).split(' ') : null;
		const rawType = rawFields !== null ? rawFields[4]?.[0] : output[i][0];
		const type = <GitFileStatus>(rawType === 'T' ? GitFileStatus.Modified : rawType);
		const metadata = rawFields !== null && rawFields.length === 5
			? { oldMode: rawFields[0], newMode: rawFields[1], oldSha: rawFields[2], newSha: rawFields[3] }
			: { oldMode: null, newMode: null, oldSha: null, newSha: null };
		if (type === GitFileStatus.Added || type === GitFileStatus.Deleted || type === GitFileStatus.Modified) {
			const path = getPathFromStr(output[i + 1]);
			records.push({ type, oldFilePath: path, newFilePath: path, ...metadata });
			i += 2;
		} else if (type === GitFileStatus.Renamed) {
			records.push({ type, oldFilePath: getPathFromStr(output[i + 1]), newFilePath: getPathFromStr(output[i + 2]), ...metadata });
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

export interface WorkingTreeStatusRecord {
	readonly path: string;
	readonly oldPath?: string;
	readonly indexStatus: string;
	readonly workTreeStatus: string;
	readonly headSha: string | null;
	readonly indexSha: string | null;
	readonly submodule: {
		readonly commitChanged: boolean;
		readonly trackedChanges: boolean;
		readonly untrackedChanges: boolean;
	} | null;
}

/** Parses Git's machine-readable porcelain v2 working-tree records. */
export function parseWorkingTreeStatusOutput(stdout: string): WorkingTreeStatusRecord[] {
	const entries = stdout.split('\0');
	const records: WorkingTreeStatusRecord[] = [];
	for (let i = 0; i < entries.length && entries[i] !== ''; i++) {
		const entry = entries[i];
		if (entry[0] === '?') {
			records.push({ path: entry.substring(2), indexStatus: '.', workTreeStatus: '?', headSha: null, indexSha: null, submodule: null });
			continue;
		}
		if (entry[0] !== '1' && entry[0] !== '2') continue;
		const fields = entry.split(' ');
		const renamed = entry[0] === '2';
		const pathIndex = renamed ? 9 : 8;
		if (fields.length <= pathIndex) continue;
		const submoduleState = fields[2];
		records.push({
			path: fields.slice(pathIndex).join(' '),
			oldPath: renamed ? entries[++i] : undefined,
			indexStatus: fields[1][0],
			workTreeStatus: fields[1][1],
			headSha: fields[6],
			indexSha: fields[7],
			submodule: submoduleState[0] === 'S' ? {
				commitChanged: submoduleState[1] === 'C',
				trackedChanges: submoduleState[2] === 'M',
				untrackedChanges: submoduleState[3] === 'U'
			} : null
		});
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
