import * as vscode from './mocks/vscode';
jest.mock('vscode', () => vscode, { virtual: true });

import { parseRefSnapshotOutput } from '../src/data-source/parsers';

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
