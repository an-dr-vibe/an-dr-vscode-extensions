import './mocks/date';
import * as vscode from './mocks/vscode';
jest.mock('vscode', () => vscode, { virtual: true });
jest.mock('../src/logger');

import { DataSource } from '../src/dataSource';
import { ExtensionState } from '../src/extensionState';
import { Logger } from '../src/logger';
import { CommitOrdering } from '../src/types';
import { RepoWarmer } from '../src/views/common/repoWarmer';

let logger: Logger;

beforeAll(() => {
	logger = new Logger();
});

afterAll(() => {
	logger.dispose();
});

describe('RepoWarmer', () => {
	let dataSource: any;
	let extensionState: any;
	let warmer: RepoWarmer;

	const repoInfoRequest = { showRemoteBranches: true, showStashes: true, hideRemotes: [] };
	const commitsRequest = {
		branches: ['develop'], maxCommits: 300, showTags: true, showRemoteBranches: true,
		includeCommitsMentionedByReflogs: false, onlyFollowFirstParent: false,
		commitOrdering: CommitOrdering.Date, hideRemotes: []
	};
	const repoInfo = { remotes: ['origin'], stashes: [{ selector: 'refs/stash@{0}' }], error: null };

	beforeEach(() => {
		jest.useFakeTimers();
		dataSource = {
			getRepoInfo: jest.fn(() => Promise.resolve(repoInfo)),
			getCommits: jest.fn(() => Promise.resolve({ commits: [], head: null, tags: [], moreCommitsAvailable: false, error: null }))
		};
		extensionState = {
			getLastRepoRequests: jest.fn(() => ({ repoInfo: repoInfoRequest, commits: commitsRequest }))
		};
		warmer = new RepoWarmer(dataSource as unknown as DataSource, extensionState as unknown as ExtensionState, logger);
	});

	afterEach(() => {
		warmer.dispose();
		jest.useRealTimers();
	});

	/** Runs the deferred warm-up and lets its promise chain settle. */
	const flush = async () => {
		jest.runOnlyPendingTimers();
		await Promise.resolve();
		await Promise.resolve();
		await Promise.resolve();
	};

	it('Should replay the recorded requests, recombining volatile remotes and stashes', async () => {
		warmer.warm('/path/to/repo');
		await flush();

		expect(dataSource.getRepoInfo).toHaveBeenCalledWith('/path/to/repo', true, true, []);
		expect(dataSource.getCommits).toHaveBeenCalledWith(
			'/path/to/repo', ['develop'], 300, true, true, false, false, CommitOrdering.Date,
			repoInfo.remotes, [], repoInfo.stashes
		);
	});

	it('Should not warm until the deferral elapses', () => {
		warmer.warm('/path/to/repo');

		expect(dataSource.getRepoInfo).not.toHaveBeenCalled();
	});

	it('Should collapse repeated requests for the same repository into one run', async () => {
		warmer.warm('/path/to/repo');
		warmer.warm('/path/to/repo');
		warmer.warm('/path/to/repo');
		await flush();

		expect(dataSource.getRepoInfo).toHaveBeenCalledTimes(1);
	});

	it('Should do nothing when the repository has never been loaded', async () => {
		extensionState.getLastRepoRequests.mockReturnValue(null);

		warmer.warm('/path/to/repo');
		await flush();

		expect(dataSource.getRepoInfo).not.toHaveBeenCalled();
	});

	it('Should not warm commits when only repo info has been recorded', async () => {
		extensionState.getLastRepoRequests.mockReturnValue({ repoInfo: repoInfoRequest, commits: null });

		warmer.warm('/path/to/repo');
		await flush();

		expect(dataSource.getRepoInfo).toHaveBeenCalledTimes(1);
		expect(dataSource.getCommits).not.toHaveBeenCalled();
	});

	it('Should not warm commits when the repo-info load fails', async () => {
		dataSource.getRepoInfo.mockResolvedValue({ ...repoInfo, error: 'error message' });

		warmer.warm('/path/to/repo');
		await flush();

		expect(dataSource.getCommits).not.toHaveBeenCalled();
	});

	it('Should swallow failures so warming never surfaces an error', async () => {
		dataSource.getRepoInfo.mockRejectedValue('error message');

		warmer.warm('/path/to/repo');
		await expect(flush()).resolves.not.toThrow();
	});

	it('Should not warm after disposal', async () => {
		warmer.warm('/path/to/repo');
		warmer.dispose();
		await flush();

		expect(dataSource.getRepoInfo).not.toHaveBeenCalled();
	});
});
