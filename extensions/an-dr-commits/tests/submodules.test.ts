import * as vscode from './mocks/vscode';
jest.mock('vscode', () => vscode, { virtual: true });
jest.mock('../src/askpass/askpassManager');
jest.mock('../src/gitEditor/gitEditorManager');
jest.mock('../src/logger');

import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from '../src/dataSource';
import { encodeDiffDocUri, decodeDiffDocUri, DiffSide } from '../src/diffDocProvider';
import { GitFileStatus } from '../src/types';
import { handleDiscardSubmoduleChanges } from '../src/views/tab/workingTreeActions';

function createDataSource(): DataSource {
	return Object.create(DataSource.prototype) as DataSource;
}

describe('Submodule bug anchors', () => {
	it('commit details identify a modified gitlink', async () => {
		const dataSource = createDataSource();
		jest.spyOn(dataSource as any, 'getCommitDetailsBase').mockResolvedValue({
			hash: 'new-super', parents: ['old-super'], author: '', authorEmail: '',
			authorDate: 0, committer: '', committerEmail: '', committerDate: 0,
			signature: null, body: '', fileChanges: []
		});
		jest.spyOn(dataSource as any, 'getDiffFileChanges').mockResolvedValue([{
			type: GitFileStatus.Modified,
			oldFilePath: 'modules/library',
			newFilePath: 'modules/library',
			oldMode: '160000',
			newMode: '160000',
			oldSha: 'old-submodule',
			newSha: 'new-submodule'
		}]);
		jest.spyOn(dataSource as any, 'getDiffNumStat').mockResolvedValue([{
			filePath: 'modules/library', additions: 1, deletions: 1
		}]);

		const result = await dataSource.getCommitDetails('/repo', 'new-super', true);

		expect(result.commitDetails!.fileChanges[0]).toStrictEqual({
			oldFilePath: 'modules/library',
			newFilePath: 'modules/library',
			type: GitFileStatus.Modified,
			additions: null,
			deletions: null,
			submodule: { oldSha: 'old-submodule', newSha: 'new-submodule', trackedChanges: false, untrackedChanges: false }
		});
	});

	it('includes a submodule with only nested untracked files', async () => {
		const dataSource = createDataSource();
		const outputs = ['1 .M S..U 160000 160000 160000 head-sha index-sha modules/library\0', '', ''];
		jest.spyOn(dataSource as any, 'spawnGit').mockImplementation((...args: unknown[]) => {
			const transform = args[2] as (stdout: string) => unknown;
			return Promise.resolve(transform(outputs.shift()!));
		});

		const result = await dataSource.getWorkingTreeChanges('/repo');

		expect(result).toStrictEqual({
			changes: [{
				path: 'modules/library', status: 'M', staged: false, additions: null, deletions: null,
				submodule: { oldSha: 'index-sha', newSha: 'index-sha', trackedChanges: false, untrackedChanges: true }
			}],
			error: null
		});
	});

	it('includes tracked submodule changes with gitlink metadata', async () => {
		const dataSource = createDataSource();
		const outputs = ['1 .M S.M. 160000 160000 160000 head-sha index-sha modules/library\0', '', ''];
		jest.spyOn(dataSource as any, 'spawnGit').mockImplementation((...args: unknown[]) => {
			const transform = args[2] as (stdout: string) => unknown;
			return Promise.resolve(transform(outputs.shift()!));
		});

		const result = await dataSource.getWorkingTreeChanges('/repo');

			expect(result.changes).toStrictEqual([{
			path: 'modules/library',
			status: 'M',
			staged: false,
			additions: null,
			deletions: null,
			submodule: { oldSha: 'index-sha', newSha: 'index-sha', trackedChanges: true, untrackedChanges: false }
		}]);
	});

	it('tracks staged and working-tree submodule pointers independently', async () => {
		const dataSource = createDataSource();
		const outputs = ['1 MM SC.. 160000 160000 160000 head-sha index-sha modules/library\0', '', '', 'worktree-sha\n'];
		jest.spyOn(dataSource as any, 'spawnGit').mockImplementation((...args: unknown[]) => {
			const transform = args[2] as (stdout: string) => unknown;
			return Promise.resolve(transform(outputs.shift()!));
		});

		const result = await dataSource.getWorkingTreeChanges('/repo');

		expect(result.changes).toMatchObject([
			{ path: 'modules/library', staged: true, submodule: { oldSha: 'head-sha', newSha: 'index-sha' } },
			{ path: 'modules/library', staged: false, submodule: { oldSha: 'index-sha', newSha: 'worktree-sha' } }
		]);
	});

	it('BUG: discard only checks out the parent gitlink path', async () => {
		const dataSource = createDataSource();
		const runGitCommand = jest.spyOn(dataSource as any, 'runGitCommand').mockResolvedValue(null);

		await dataSource.discardFileChanges('/repo', ['modules/library'], false);

		expect(runGitCommand).toHaveBeenCalledTimes(1);
		expect(runGitCommand).toHaveBeenCalledWith(['checkout', 'HEAD', '--', 'modules/library'], '/repo');
	});

	it('resets a selected submodule while preserving nested untracked files', async () => {
		const dataSource = createDataSource();
		const runGitCommand = jest.spyOn(dataSource as any, 'runGitCommand').mockResolvedValue(null);

		const result = await dataSource.discardSubmoduleChanges('/repo', 'modules/library', false);

		expect(result).toBeNull();
		expect(runGitCommand).toHaveBeenCalledTimes(1);
		expect(runGitCommand).toHaveBeenCalledWith(['submodule', 'update', '--checkout', '--force', '--recursive', '--', 'modules/library'], '/repo');
	});

	it('resets a selected submodule and deletes nested untracked files on request', async () => {
		const dataSource = createDataSource();
		const runGitCommand = jest.spyOn(dataSource as any, 'runGitCommand').mockResolvedValue(null);

		const result = await dataSource.discardSubmoduleChanges('/repo', 'modules/library', true);

		expect(result).toBeNull();
		expect(runGitCommand).toHaveBeenNthCalledWith(1, ['submodule', 'update', '--checkout', '--force', '--recursive', '--', 'modules/library'], '/repo');
		expect(runGitCommand).toHaveBeenNthCalledWith(2, ['-C', 'modules/library', 'clean', '-fd'], '/repo');
		expect(runGitCommand).toHaveBeenNthCalledWith(3, ['-C', 'modules/library', 'submodule', 'foreach', '--recursive', 'git clean -fd'], '/repo');
	});

	it('encodes semantic submodule diff content in native document URIs', () => {
		const uri = encodeDiffDocUri('/repo', 'modules/library', 'new-super', GitFileStatus.Modified, DiffSide.New, 'Submodule modules/library\n-old\n+new');

		expect(decodeDiffDocUri(uri)).toStrictEqual({
			filePath: 'modules/library',
			commit: 'new-super',
			repo: '/repo',
			exists: true,
			content: 'Submodule modules/library\n-old\n+new'
		});
	});

	it('uses Git submodule log mode for semantic gitlink diffs', async () => {
		const dataSource = createDataSource();
		const spawnGit = jest.spyOn(dataSource as any, 'spawnGit').mockImplementation((...args: unknown[]) => {
			const transform = args[2] as (stdout: string) => string;
			return Promise.resolve(transform('Submodule modules/library old..new:\n'));
		});

		await expect(dataSource.getSubmoduleDiff('/repo', 'old-super', 'new-super', 'modules/library')).resolves.toBe('Submodule modules/library old..new:\n');
		expect(spawnGit).toHaveBeenCalledWith(['diff', '--submodule=log', 'old-super', 'new-super', '--', 'modules/library'], '/repo', expect.any(Function));
	});

	it('loads author, date, subject, and body for a submodule commit endpoint', async () => {
		const dataSource = createDataSource();
		jest.spyOn(dataSource as any, 'spawnGit').mockImplementation((...args: unknown[]) => {
			const transform = args[2] as (stdout: string) => unknown;
			return Promise.resolve(transform('new-sha\x1fAda Lovelace\x1fada@example.com\x1f2026-07-17T12:30:00+00:00\x1fImprove parser\x1fExplain the edge case\x1e'));
		});

		await expect(dataSource.getSubmoduleCommit('/repo', 'modules/library', 'new-sha')).resolves.toEqual({
			hash: 'new-sha', author: 'Ada Lovelace', authorEmail: 'ada@example.com', authorDate: 1784291400, subject: 'Improve parser', body: 'Explain the edge case'
		});
	});

	it('uses Unified, Split, and Raw modes for submodule endpoint details', () => {
		const fullDiffPanel = fs.readFileSync(path.join(__dirname, '../web/main/fullDiffPanel.ts'), 'utf8');
		const fileView = fs.readFileSync(path.join(__dirname, '../web/main/commitDetailsView/fileView.ts'), 'utf8');
		expect(fullDiffPanel).toContain("? commitsBuildRawDiffView(data.diff)");
		expect(fullDiffPanel).toContain('commitsBuildSubmoduleSplitDiffView(data.oldSubmoduleCommit, data.newSubmoduleCommit)');
		expect(fullDiffPanel).toContain('commitsBuildSubmoduleUnifiedDiffView(data.oldSubmoduleCommit, data.newSubmoduleCommit)');
		expect(fileView).not.toContain("file.submodule !== null) view.fullDiffViewMode = 'raw'");
	});

	it('keeps a gitlink change as a file row even when its submodule is discovered', () => {
		const source = fs.readFileSync(path.join(__dirname, '../web/main/commitDetailsView/lifecycle.ts'), 'utf8');
		expect(source).toContain("typeof view.gitRepos[absPath] !== 'undefined' && gitFiles[i].submodule === null");
		expect(source).toContain("cur.contents[path[j]] = { type: 'file'");
	});

	it('dispatches submodule reset through the dedicated backend operation', async () => {
		const dataSource = createDataSource();
		jest.spyOn(dataSource, 'discardSubmoduleChanges').mockResolvedValue(null);
		const sendMessage = jest.fn();

		await handleDiscardSubmoduleChanges({ dataSource, sendMessage } as any, {
			command: 'discardSubmoduleChanges', repo: '/repo', filePath: 'modules/library', cleanUntracked: true
		});

		expect(dataSource.discardSubmoduleChanges).toHaveBeenCalledWith('/repo', 'modules/library', true);
		expect(sendMessage).toHaveBeenCalledWith({ command: 'discardSubmoduleChanges', error: null });
	});

	it('renders a safe and complete reset choice for working-tree submodules', () => {
		const source = fs.readFileSync(path.join(__dirname, '../web/changesPanel.ts'), 'utf8');
		expect(source).toContain('Reset and delete untracked files');
		expect(source).toContain("command: 'discardSubmoduleChanges'");
		expect(source).toContain('f.submodule.oldSha !== f.submodule.newSha');
	});

	it('keeps the Activity Bar sidebar on the same submodule safety boundary', () => {
		const treeSource = fs.readFileSync(path.join(__dirname, '../web/sidebar/changesTree.ts'), 'utf8');
		const sidebarSource = fs.readFileSync(path.join(__dirname, '../src/views/sidebar/sidebarView.ts'), 'utf8');
		expect(treeSource).toContain('function sidebarCanStage');
		expect(treeSource).toContain('data-submodule');
		expect(sidebarSource).toContain('discardSubmoduleChanges');
		expect(sidebarSource).toContain('viewSubmoduleDiff');
	});
});
