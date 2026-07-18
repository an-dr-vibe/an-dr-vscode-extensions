import * as vscode from './mocks/vscode';
jest.mock('vscode', () => vscode, { virtual: true });
jest.mock('../src/logger');

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GitStatusMonitor } from '../src/gitStatusMonitor';
import { Logger } from '../src/logger';
import { EventEmitter } from '../src/utils/event';
import { waitForExpect } from './helpers/expectations';

describe('GitStatusMonitor', () => {
	let tempRoot: string;
	let logger: Logger;

	beforeEach(() => {
		tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'an-dr-commits-status-'));
		logger = new Logger();
	});

	afterEach(() => {
		logger.dispose();
		(fs as any).rmSync(tempRoot, { recursive: true, force: true });
	});

	it('Should own active-repo selection, branch detection, and working-tree counts', async () => {
		const repo1 = createRepo('repo1', 'main');
		const repo2 = createRepo('repo2', 'feature/status');
		const repoChanges = new EventEmitter<any>();
		const repoSelections = new EventEmitter<any>();
		const extensionState = {
			getLastActiveRepo: jest.fn(() => null),
			setLastActiveRepo: jest.fn()
		};
		const repoManager = {
			getRepos: jest.fn(() => ({ [repo1]: {}, [repo2]: {} })),
			findKnownRepoPath: jest.fn((repo: string) => repo === repo1 || repo === repo2 ? repo : null),
			getRepoContainingFile: jest.fn(() => null),
			onDidChangeRepos: repoChanges.subscribe
		};
		const dataSource = {
			getStatusCounts: jest.fn((repo: string) => Promise.resolve(repo === repo1
				? { modified: 2, deleted: 1 }
				: { modified: 0, deleted: 3 }))
		};

		const monitor = new GitStatusMonitor(dataSource as any, extensionState as any, repoManager as any, repoSelections.subscribe, logger);
		await waitForExpect(() => {
			expect(monitor.getStatus()).toStrictEqual({
				repo: repo1,
				branchName: 'main',
				counts: { modified: 2, deleted: 1 }
			});
		});
		expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalledWith(repo1 + '/**');

		repoSelections.emit({ repo: repo2, source: 'activity' });
		await waitForExpect(() => {
			expect(monitor.getStatus()).toStrictEqual({
				repo: repo2,
				branchName: 'feature/status',
				counts: { modified: 0, deleted: 3 }
			});
		});
		expect(extensionState.setLastActiveRepo).toHaveBeenCalledWith(repo2);
		expect(vscode.workspace.createFileSystemWatcher).toHaveBeenLastCalledWith(repo2 + '/**');
		monitor.dispose();
	});

	function createRepo(name: string, branch: string): string {
		const repo = path.join(tempRoot, name);
		fs.mkdirSync(repo);
		fs.mkdirSync(path.join(repo, '.git'));
		fs.writeFileSync(path.join(repo, '.git', 'HEAD'), 'ref: refs/heads/' + branch + '\n');
		return repo;
	}
});
