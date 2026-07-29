import * as vscode from './mocks/vscode';
jest.mock('vscode', () => vscode, { virtual: true });

import { parseDiffNameStatusOutput, parseRefSnapshotOutput } from '../src/data-source/parsers';

const SEPARATOR = '<sep>';
const formatRef = (...fields: string[]) => fields.join(SEPARATOR);

describe('parseRefSnapshotOutput', () => {
	it('parses branches, upstreams, remote heads, and tags from one snapshot', () => {
		const output = [
			formatRef('local-hash', 'refs/heads/main', '', '', 'origin/main', '', '*'),
			formatRef('gone-hash', 'refs/heads/old', '', '', 'origin/old', '[gone]', ' '),
			formatRef('remote-hash', 'refs/remotes/origin/main', '', '', '', '', ' '),
			formatRef('remote-hash', 'refs/remotes/origin/HEAD', '', 'refs/remotes/origin/main', '', '', ' '),
			formatRef('tag-object', 'refs/tags/v1', 'tag-target', '', '', '', ' '),
			formatRef('light-target', 'refs/tags/v2', '', '', '', '', ' ')
		].join('\n');

		const result = parseRefSnapshotOutput(output, 'local-hash', SEPARATOR, {
			showRemoteBranches: true,
			showRemoteHeads: true,
			hideRemotePatterns: []
		});

		expect(result.branches).toMatchObject({
			head: 'main',
			branches: ['main', 'old', 'remotes/origin/main', 'remotes/origin/HEAD'],
			branchUpstreams: { main: 'origin/main', old: 'origin/old' },
			goneUpstreamBranches: ['old'],
			remoteHeadTargets: { origin: 'origin/main' }
		});
		expect(result.refs).toEqual({
			head: 'local-hash',
			heads: [{ hash: 'local-hash', name: 'main' }, { hash: 'gone-hash', name: 'old' }],
			remotes: [{ hash: 'remote-hash', name: 'origin/main' }, { hash: 'remote-hash', name: 'origin/HEAD' }],
			tags: [{ hash: 'tag-target', name: 'v1', annotated: true }, { hash: 'light-target', name: 'v2', annotated: false }]
		});
	});

	it('represents detached HEAD and filters hidden remotes', () => {
		const output = [
			formatRef('visible', 'refs/remotes/origin/main', '', '', '', '', ' '),
			formatRef('hidden', 'refs/remotes/private/main', '', '', '', '', ' ')
		].join('\n');

		const result = parseRefSnapshotOutput(output, 'detached-hash', SEPARATOR, {
			showRemoteBranches: true,
			showRemoteHeads: false,
			hideRemotePatterns: ['refs/remotes/private/']
		});

		expect(result.branches.head).toBe('HEAD');
		expect(result.branches.branches).toEqual(['HEAD', 'remotes/origin/main']);
		expect(result.refs.remotes).toEqual([{ hash: 'visible', name: 'origin/main' }]);
	});
});

describe('parseDiffNameStatusOutput', () => {
	it('parses gitlink modes and object IDs from raw diff records', () => {
		const result = parseDiffNameStatusOutput([
			':160000 160000 old-submodule new-submodule M', 'modules/modified',
			':000000 160000 0000000000000000 added-submodule A', 'modules/added',
			':160000 000000 deleted-submodule 0000000000000000 D', 'modules/deleted',
			':100644 160000 old-blob converted-submodule T', 'modules/converted',
			''
		]);

		expect(result).toEqual([
			{ type: 'M', oldFilePath: 'modules/modified', newFilePath: 'modules/modified', oldMode: '160000', newMode: '160000', oldSha: 'old-submodule', newSha: 'new-submodule' },
			{ type: 'A', oldFilePath: 'modules/added', newFilePath: 'modules/added', oldMode: '000000', newMode: '160000', oldSha: '0000000000000000', newSha: 'added-submodule' },
			{ type: 'D', oldFilePath: 'modules/deleted', newFilePath: 'modules/deleted', oldMode: '160000', newMode: '000000', oldSha: 'deleted-submodule', newSha: '0000000000000000' },
			{ type: 'M', oldFilePath: 'modules/converted', newFilePath: 'modules/converted', oldMode: '100644', newMode: '160000', oldSha: 'old-blob', newSha: 'converted-submodule' }
		]);
	});

	it('keeps parsing legacy name-status records for compatibility', () => {
		expect(parseDiffNameStatusOutput(['R100', 'old.txt', 'new.txt', ''])).toEqual([{
			type: 'R', oldFilePath: 'old.txt', newFilePath: 'new.txt',
			oldMode: null, newMode: null, oldSha: null, newSha: null
		}]);
	});
});
