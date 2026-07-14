import './mocks/date';
import * as vscode from './mocks/vscode';
jest.mock('vscode', () => vscode, { virtual: true });
jest.mock('fs');

import * as fs from 'fs';
import { ExtensionState } from '../src/extensionState';
import { BooleanOverride, FileViewType, CommitsViewGlobalState, CommitsViewWorkspaceState, GitRepoState, RepoCommitOrdering } from '../src/types';
import { GitExecutable } from '../src/utils';
import { EventEmitter } from '../src/utils/event';

let extensionContext = vscode.mocks.extensionContext;
let workspaceConfiguration = vscode.mocks.workspaceConfiguration;
let onDidChangeGitExecutable: EventEmitter<GitExecutable>;

beforeAll(() => {
	onDidChangeGitExecutable = new EventEmitter<GitExecutable>();
});

afterAll(() => {
	onDidChangeGitExecutable.dispose();
});

describe('ExtensionState', () => {
	let extensionState: ExtensionState;
	beforeEach(() => {
		extensionState = new ExtensionState(extensionContext, onDidChangeGitExecutable.subscribe);
	});
	afterEach(() => {
		extensionState.dispose();
	});

	describe('GitExecutable Change Event Processing', () => {
		it('Should subscribe to GitExecutable change events', () => {
			// Assert
			expect(onDidChangeGitExecutable['listeners']).toHaveLength(1);
		});

		it('Should unsubscribe from GitExecutable change events after disposal', () => {
			// Run
			extensionState.dispose();

			// Assert
			expect(onDidChangeGitExecutable['listeners']).toHaveLength(0);
		});

		it('Should save the last known git executable path received from GitExecutable change events', () => {
			// Run
			onDidChangeGitExecutable.emit({ path: '/path/to/git', version: '1.2.3' });

			// Assert
			expect(extensionContext.globalState.update).toHaveBeenCalledWith('lastKnownGitPath', '/path/to/git');
		});
	});

	describe('getRepos', () => {
		it('Should return the stored repositories', () => {
			// Setup
			const repoState: GitRepoState = {
				commitDetailsViewDivider: 0.5,
				commitDetailsViewHeight: 250,
				commitDetailsViewTopRowRatio: 0.45,
				fullDiffCompact: false,
				fullDiffPanelHeight: 250,
				columnWidths: null,
				commitOrdering: RepoCommitOrdering.AuthorDate,
				fileViewType: FileViewType.List,
				hideRemotes: [],
				includeCommitsMentionedByReflogs: BooleanOverride.Enabled,
				issueLinkingConfig: null,
				lastImportAt: 0,
				name: 'Custom Name',
				onlyFollowFirstParent: BooleanOverride.Disabled,
				onRepoLoadShowCheckedOutBranch: BooleanOverride.Enabled,
				onRepoLoadShowSpecificBranches: ['master'],
				pullRequestConfig: null,
				showRemoteBranches: true,
				showRemoteBranchesV2: BooleanOverride.Enabled,
				showStashes: BooleanOverride.Enabled,
				showTags: BooleanOverride.Enabled,
				starred: false,
				workspaceFolderIndex: 0
			};
			extensionContext.workspaceState.get.mockReturnValueOnce({
				'/path/to/repo': repoState
			});

			// Run
			const result = extensionState.getRepos();

			// Assert
			expect(result).toStrictEqual({
				'/path/to/repo': repoState
			});
		});

		it('Should assign missing repository state variables to their default values', () => {
			// Setup
			extensionContext.workspaceState.get.mockReturnValueOnce({
				'/path/to/repo': {
					columnWidths: null,
					hideRemotes: []
				}
			});

			// Run
			const result = extensionState.getRepos();

			// Assert
			expect(result).toStrictEqual({
				'/path/to/repo': {
					commitDetailsViewDivider: 0.5,
					commitDetailsViewHeight: 250,
					commitDetailsViewTopRowRatio: 0.45,
					fullDiffCompact: false,
					fullDiffPanelHeight: 250,
					columnWidths: null,
					commitOrdering: RepoCommitOrdering.Default,
					fileViewType: FileViewType.Default,
					hideRemotes: [],
					includeCommitsMentionedByReflogs: BooleanOverride.Default,
					issueLinkingConfig: null,
					lastImportAt: 0,
					name: null,
					onlyFollowFirstParent: BooleanOverride.Default,
					onRepoLoadShowCheckedOutBranch: BooleanOverride.Default,
					onRepoLoadShowSpecificBranches: null,
					pullRequestConfig: null,
					showRemoteBranches: true,
					showRemoteBranchesV2: BooleanOverride.Default,
					showStashes: BooleanOverride.Default,
					showTags: BooleanOverride.Default,
					starred: false,
					workspaceFolderIndex: null
				}
			});
		});

		it('Should migrate showRemoteBranches = TRUE from boolean to enum (repository.showRemoteBranches = TRUE)', () => {
			// Setup
			extensionContext.workspaceState.get.mockReturnValueOnce({
				'/path/to/repo': {
					showRemoteBranches: true
				}
			});
			vscode.mockExtensionSettingReturnValue('repository.showRemoteBranches', true);

			// Run
			const result = extensionState.getRepos();

			// Assert
			expect(result).toStrictEqual({
				'/path/to/repo': {
					commitDetailsViewDivider: 0.5,
					commitDetailsViewHeight: 250,
					commitDetailsViewTopRowRatio: 0.45,
					fullDiffCompact: false,
					fullDiffPanelHeight: 250,
					columnWidths: null,
					commitOrdering: RepoCommitOrdering.Default,
					fileViewType: FileViewType.Default,
					hideRemotes: [],
					includeCommitsMentionedByReflogs: BooleanOverride.Default,
					issueLinkingConfig: null,
					lastImportAt: 0,
					name: null,
					onlyFollowFirstParent: BooleanOverride.Default,
					onRepoLoadShowCheckedOutBranch: BooleanOverride.Default,
					onRepoLoadShowSpecificBranches: null,
					pullRequestConfig: null,
					showRemoteBranches: true,
					showRemoteBranchesV2: BooleanOverride.Default,
					showStashes: BooleanOverride.Default,
					showTags: BooleanOverride.Default,
					starred: false,
					workspaceFolderIndex: null
				}
			});
		});

		it('Should migrate showRemoteBranches = FALSE from boolean to enum (repository.showRemoteBranches = TRUE)', () => {
			// Setup
			extensionContext.workspaceState.get.mockReturnValueOnce({
				'/path/to/repo': {
					showRemoteBranches: false
				}
			});
			vscode.mockExtensionSettingReturnValue('repository.showRemoteBranches', true);

			// Run
			const result = extensionState.getRepos();

			// Assert
			expect(result).toStrictEqual({
				'/path/to/repo': {
					commitDetailsViewDivider: 0.5,
					commitDetailsViewHeight: 250,
					commitDetailsViewTopRowRatio: 0.45,
					fullDiffCompact: false,
					fullDiffPanelHeight: 250,
					columnWidths: null,
					commitOrdering: RepoCommitOrdering.Default,
					fileViewType: FileViewType.Default,
					hideRemotes: [],
					includeCommitsMentionedByReflogs: BooleanOverride.Default,
					issueLinkingConfig: null,
					lastImportAt: 0,
					name: null,
					onlyFollowFirstParent: BooleanOverride.Default,
					onRepoLoadShowCheckedOutBranch: BooleanOverride.Default,
					onRepoLoadShowSpecificBranches: null,
					pullRequestConfig: null,
					showRemoteBranches: false,
					showRemoteBranchesV2: BooleanOverride.Disabled,
					showStashes: BooleanOverride.Default,
					showTags: BooleanOverride.Default,
					starred: false,
					workspaceFolderIndex: null
				}
			});
		});

		it('Should migrate showRemoteBranches = FALSE from boolean to enum (repository.showRemoteBranches = FALSE)', () => {
			// Setup
			extensionContext.workspaceState.get.mockReturnValueOnce({
				'/path/to/repo': {
					showRemoteBranches: false
				}
			});
			vscode.mockExtensionSettingReturnValue('repository.showRemoteBranches', false);

			// Run
			const result = extensionState.getRepos();

			// Assert
			expect(result).toStrictEqual({
				'/path/to/repo': {
					commitDetailsViewDivider: 0.5,
					commitDetailsViewHeight: 250,
					commitDetailsViewTopRowRatio: 0.45,
					fullDiffCompact: false,
					fullDiffPanelHeight: 250,
					columnWidths: null,
					commitOrdering: RepoCommitOrdering.Default,
					fileViewType: FileViewType.Default,
					hideRemotes: [],
					includeCommitsMentionedByReflogs: BooleanOverride.Default,
					issueLinkingConfig: null,
					lastImportAt: 0,
					name: null,
					onlyFollowFirstParent: BooleanOverride.Default,
					onRepoLoadShowCheckedOutBranch: BooleanOverride.Default,
					onRepoLoadShowSpecificBranches: null,
					pullRequestConfig: null,
					showRemoteBranches: false,
					showRemoteBranchesV2: BooleanOverride.Default,
					showStashes: BooleanOverride.Default,
					showTags: BooleanOverride.Default,
					starred: false,
					workspaceFolderIndex: null
				}
			});
		});

		it('Should migrate showRemoteBranches = TRUE from boolean to enum (repository.showRemoteBranches = FALSE)', () => {
			// Setup
			extensionContext.workspaceState.get.mockReturnValueOnce({
				'/path/to/repo': {
					showRemoteBranches: true
				}
			});
			vscode.mockExtensionSettingReturnValue('repository.showRemoteBranches', false);

			// Run
			const result = extensionState.getRepos();

			// Assert
			expect(result).toStrictEqual({
				'/path/to/repo': {
					commitDetailsViewDivider: 0.5,
					commitDetailsViewHeight: 250,
					commitDetailsViewTopRowRatio: 0.45,
					fullDiffCompact: false,
					fullDiffPanelHeight: 250,
					columnWidths: null,
					commitOrdering: RepoCommitOrdering.Default,
					fileViewType: FileViewType.Default,
					hideRemotes: [],
					includeCommitsMentionedByReflogs: BooleanOverride.Default,
					issueLinkingConfig: null,
					lastImportAt: 0,
					name: null,
					onlyFollowFirstParent: BooleanOverride.Default,
					onRepoLoadShowCheckedOutBranch: BooleanOverride.Default,
					onRepoLoadShowSpecificBranches: null,
					pullRequestConfig: null,
					showRemoteBranches: true,
					showRemoteBranchesV2: BooleanOverride.Enabled,
					showStashes: BooleanOverride.Default,
					showTags: BooleanOverride.Default,
					starred: false,
					workspaceFolderIndex: null
				}
			});
		});

		it('Should migrate multiple showRemoteBranches from boolean to enum (repository.showRemoteBranches = TRUE)', () => {
			// Setup
			extensionContext.workspaceState.get.mockReturnValueOnce({
				'/path/to/repo-1': {
					showRemoteBranches: true
				},
				'/path/to/repo-2': {
					showRemoteBranches: false
				}
			});
			vscode.mockExtensionSettingReturnValue('repository.showRemoteBranches', true);

			// Run
			const result = extensionState.getRepos();

			// Assert
			expect(result).toStrictEqual({
				'/path/to/repo-1': {
					commitDetailsViewDivider: 0.5,
					commitDetailsViewHeight: 250,
					commitDetailsViewTopRowRatio: 0.45,
					fullDiffCompact: false,
					fullDiffPanelHeight: 250,
					columnWidths: null,
					commitOrdering: RepoCommitOrdering.Default,
					fileViewType: FileViewType.Default,
					hideRemotes: [],
					includeCommitsMentionedByReflogs: BooleanOverride.Default,
					issueLinkingConfig: null,
					lastImportAt: 0,
					name: null,
					onlyFollowFirstParent: BooleanOverride.Default,
					onRepoLoadShowCheckedOutBranch: BooleanOverride.Default,
					onRepoLoadShowSpecificBranches: null,
					pullRequestConfig: null,
					showRemoteBranches: true,
					showRemoteBranchesV2: BooleanOverride.Default,
					showStashes: BooleanOverride.Default,
					showTags: BooleanOverride.Default,
					starred: false,
					workspaceFolderIndex: null
				},
				'/path/to/repo-2': {
					commitDetailsViewDivider: 0.5,
					commitDetailsViewHeight: 250,
					commitDetailsViewTopRowRatio: 0.45,
					fullDiffCompact: false,
					fullDiffPanelHeight: 250,
					columnWidths: null,
					commitOrdering: RepoCommitOrdering.Default,
					fileViewType: FileViewType.Default,
					hideRemotes: [],
					includeCommitsMentionedByReflogs: BooleanOverride.Default,
					issueLinkingConfig: null,
					lastImportAt: 0,
					name: null,
					onlyFollowFirstParent: BooleanOverride.Default,
					onRepoLoadShowCheckedOutBranch: BooleanOverride.Default,
					onRepoLoadShowSpecificBranches: null,
					pullRequestConfig: null,
					showRemoteBranches: false,
					showRemoteBranchesV2: BooleanOverride.Disabled,
					showStashes: BooleanOverride.Default,
					showTags: BooleanOverride.Default,
					starred: false,
					workspaceFolderIndex: null
				}
			});
			expect(workspaceConfiguration.get).toHaveBeenCalledTimes(1);
		});

		it('Should return the default value if it is not defined', () => {
			// Setup
			extensionContext.workspaceState.get.mockImplementationOnce((_, defaultValue) => defaultValue);

			// Run
			const result = extensionState.getRepos();

			// Assert
			expect(result).toStrictEqual({});
		});
	});

	describe('saveRepos', () => {
		it('Should store the provided repositories in the workspace state', () => {
			// Setup
			const repos = {};
			extensionContext.workspaceState.update.mockResolvedValueOnce(null);

			// Run
			extensionState.saveRepos(repos);

			// Assert
			expect(extensionContext.workspaceState.update).toHaveBeenCalledWith('repoStates', repos);
		});
	});

	describe('transferRepo', () => {
		it('Should update the last active repo with the new repository path', () => {
			// Setup
			extensionContext.workspaceState.get.mockReturnValueOnce('/path/to/repo');
			extensionContext.workspaceState.update.mockResolvedValueOnce(null);

			// Run
			extensionState.transferRepo('/path/to/repo', '/new/path/to/repo');

			// Assert
			expect(extensionContext.workspaceState.update).toHaveBeenCalledWith('lastActiveRepo', '/new/path/to/repo');
		});

		it('Shouldn\'t update the last active repo when no match is found with the transfer repository', () => {
			// Setup
			extensionContext.workspaceState.get.mockReturnValueOnce('/path/to/repo');

			// Run
			extensionState.transferRepo('/path/to/repo1', '/new/path/to/repo');

			// Assert
			expect(extensionContext.workspaceState.update).toHaveBeenCalledTimes(0);
		});
	});

	describe('getGlobalViewState', () => {
		it('Should return the stored global view state', () => {
			// Setup
			const globalViewState: CommitsViewGlobalState = {
				alwaysAcceptCheckoutCommit: true,
				issueLinkingConfig: null,
				pushTagSkipRemoteCheck: false,
				fullDiffViewMode: 'sideBySide',
				filesPanelWidth: 220,
				filesPanelHidden: false
			};
			extensionContext.globalState.get.mockReturnValueOnce(globalViewState);

			// Run
			const result = extensionState.getGlobalViewState();

			// Assert
			expect(extensionContext.globalState.get).toHaveBeenCalledWith('globalViewState', expect.anything());
			expect(result).toStrictEqual(globalViewState);
		});

		it('Should assign missing global view state variables to their default values', () => {
			// Setup
			extensionContext.globalState.get.mockReturnValueOnce({
				issueLinkingConfig: null
			});

			// Run
			const result = extensionState.getGlobalViewState();

			// Assert
			expect(extensionContext.globalState.get).toHaveBeenCalledWith('globalViewState', expect.anything());
			expect(result).toStrictEqual({
				alwaysAcceptCheckoutCommit: false,
				issueLinkingConfig: null,
				pushTagSkipRemoteCheck: false,
				fullDiffViewMode: 'sideBySide',
				filesPanelWidth: 220,
				filesPanelHidden: false
			});
		});

		it('Should return the default global view state if it is not defined', () => {
			// Setup
			extensionContext.globalState.get.mockImplementationOnce((_, defaultValue) => defaultValue);

			// Run
			const result = extensionState.getGlobalViewState();

			// Assert
			expect(extensionContext.globalState.get).toHaveBeenCalledWith('globalViewState', expect.anything());
			expect(result).toStrictEqual({
				alwaysAcceptCheckoutCommit: false,
				issueLinkingConfig: null,
				pushTagSkipRemoteCheck: false,
				fullDiffViewMode: 'sideBySide',
				filesPanelWidth: 220,
				filesPanelHidden: false
			});
		});
	});

	describe('setGlobalViewState', () => {
		it('Should successfully store the global view state', async () => {
			// Setup
			const globalViewState: CommitsViewGlobalState = {
				alwaysAcceptCheckoutCommit: true,
				issueLinkingConfig: null,
				pushTagSkipRemoteCheck: false,
				fullDiffViewMode: 'sideBySide',
				filesPanelWidth: 220,
				filesPanelHidden: false
			};
			extensionContext.globalState.update.mockResolvedValueOnce(null);

			// Run
			const result = await extensionState.setGlobalViewState(globalViewState);

			// Assert
			expect(extensionContext.globalState.update).toHaveBeenCalledWith('globalViewState', globalViewState);
			expect(result).toBe(null);
		});

		it('Should return an error message when vscode is unable to store the global view state', async () => {
			// Setup
			const globalViewState: CommitsViewGlobalState = {
				alwaysAcceptCheckoutCommit: true,
				issueLinkingConfig: null,
				pushTagSkipRemoteCheck: false,
				fullDiffViewMode: 'sideBySide',
				filesPanelWidth: 220,
				filesPanelHidden: false
			};
			extensionContext.globalState.update.mockRejectedValueOnce(null);

			// Run
			const result = await extensionState.setGlobalViewState(globalViewState);

			// Assert
			expect(extensionContext.globalState.update).toHaveBeenCalledWith('globalViewState', globalViewState);
			expect(result).toBe('Visual Studio Code was unable to save the Commits Global State Memento.');
		});
	});

	describe('getWorkspaceViewState', () => {
		it('Should return the stored workspace view state', () => {
			// Setup
			const workspaceViewState: CommitsViewWorkspaceState = {
				findIsCaseSensitive: true,
				findIsRegex: false,
				findOpenCommitDetailsView: true
			};
			extensionContext.workspaceState.get.mockReturnValueOnce(workspaceViewState);

			// Run
			const result = extensionState.getWorkspaceViewState();

			// Assert
			expect(extensionContext.workspaceState.get).toHaveBeenCalledWith('workspaceViewState', expect.anything());
			expect(result).toStrictEqual(workspaceViewState);
		});

		it('Should assign missing workspace view state variables to their default values', () => {
			// Setup
			extensionContext.workspaceState.get.mockReturnValueOnce({
				findIsCaseSensitive: true,
				findIsRegex: false
			});

			// Run
			const result = extensionState.getWorkspaceViewState();

			// Assert
			expect(extensionContext.workspaceState.get).toHaveBeenCalledWith('workspaceViewState', expect.anything());
			expect(result).toStrictEqual({
				findIsCaseSensitive: true,
				findIsRegex: false,
				findOpenCommitDetailsView: false
			});
		});

		it('Should return the default workspace view state if it is not defined', () => {
			// Setup
			extensionContext.workspaceState.get.mockImplementationOnce((_, defaultValue) => defaultValue);

			// Run
			const result = extensionState.getWorkspaceViewState();

			// Assert
			expect(extensionContext.workspaceState.get).toHaveBeenCalledWith('workspaceViewState', expect.anything());
			expect(result).toStrictEqual({
				findIsCaseSensitive: false,
				findIsRegex: false,
				findOpenCommitDetailsView: false
			});
		});
	});

	describe('setWorkspaceViewState', () => {
		it('Should successfully store the workspace view state', async () => {
			// Setup
			const workspaceViewState: CommitsViewWorkspaceState = {
				findIsCaseSensitive: true,
				findIsRegex: false,
				findOpenCommitDetailsView: true
			};
			extensionContext.workspaceState.update.mockResolvedValueOnce(null);

			// Run
			const result = await extensionState.setWorkspaceViewState(workspaceViewState);

			// Assert
			expect(extensionContext.workspaceState.update).toHaveBeenCalledWith('workspaceViewState', workspaceViewState);
			expect(result).toBe(null);
		});

		it('Should return an error message when vscode is unable to store the workspace view state', async () => {
			// Setup
			const workspaceViewState: CommitsViewWorkspaceState = {
				findIsCaseSensitive: true,
				findIsRegex: false,
				findOpenCommitDetailsView: true
			};
			extensionContext.workspaceState.update.mockRejectedValueOnce(null);

			// Run
			const result = await extensionState.setWorkspaceViewState(workspaceViewState);

			// Assert
			expect(extensionContext.workspaceState.update).toHaveBeenCalledWith('workspaceViewState', workspaceViewState);
			expect(result).toBe('Visual Studio Code was unable to save the Commits Workspace State Memento.');
		});
	});

	describe('getIgnoredRepos', () => {
		it('Should return the stored ignored repositories', () => {
			// Setup
			const ignoredRepos = ['/ignored-repo1'];
			extensionContext.workspaceState.get.mockReturnValueOnce(ignoredRepos);

			// Run
			const result = extensionState.getIgnoredRepos();

			// Assert
			expect(extensionContext.workspaceState.get).toHaveBeenCalledWith('ignoredRepos', []);
			expect(result).toBe(ignoredRepos);
		});

		it('Should return the default value if not defined', () => {
			// Setup
			extensionContext.workspaceState.get.mockImplementationOnce((_, defaultValue) => defaultValue);

			// Run
			const result = extensionState.getIgnoredRepos();

			// Assert
			expect(extensionContext.workspaceState.get).toHaveBeenCalledWith('ignoredRepos', []);
			expect(result).toStrictEqual([]);
		});
	});

	describe('setIgnoredRepos', () => {
		it('Should successfully store the ignored repositories', async () => {
			// Setup
			const ignoreRepos = ['/path/to/ignore'];
			extensionContext.workspaceState.update.mockResolvedValueOnce(null);

			// Run
			const result = await extensionState.setIgnoredRepos(ignoreRepos);

			// Assert
			expect(extensionContext.workspaceState.update).toHaveBeenCalledWith('ignoredRepos', ignoreRepos);
			expect(result).toBe(null);
		});

		it('Should return an error message when vscode is unable to store the ignored repositories', async () => {
			// Setup
			const ignoreRepos = ['/path/to/ignore'];
			extensionContext.workspaceState.update.mockRejectedValueOnce(null);

			// Run
			const result = await extensionState.setIgnoredRepos(ignoreRepos);

			// Assert
			expect(extensionContext.workspaceState.update).toHaveBeenCalledWith('ignoredRepos', ignoreRepos);
			expect(result).toBe('Visual Studio Code was unable to save the Commits Workspace State Memento.');
		});
	});

	describe('getLastActiveRepo', () => {
		it('Should return the stored last active repository', () => {
			// Setup
			extensionContext.workspaceState.get.mockReturnValueOnce('/last/active/repo');

			// Run
			const result = extensionState.getLastActiveRepo();

			// Assert
			expect(extensionContext.workspaceState.get).toHaveBeenCalledWith('lastActiveRepo', null);
			expect(result).toBe('/last/active/repo');
		});

		it('Should return the default value if not defined', () => {
			// Setup
			extensionContext.workspaceState.get.mockImplementationOnce((_, defaultValue) => defaultValue);

			// Run
			const result = extensionState.getLastActiveRepo();

			// Assert
			expect(extensionContext.workspaceState.get).toHaveBeenCalledWith('lastActiveRepo', null);
			expect(result).toBe(null);
		});
	});

	describe('setLastActiveRepo', () => {
		it('Should store the last active repository', () => {
			// Setup
			extensionContext.workspaceState.update.mockResolvedValueOnce(null);

			// Run
			extensionState.setLastActiveRepo('/path/to/repo');

			// Assert
			expect(extensionContext.workspaceState.update).toHaveBeenCalledWith('lastActiveRepo', '/path/to/repo');
		});
	});

	describe('getLastKnownGitPath', () => {
		it('Should return the stored last active repository', () => {
			// Setup
			extensionContext.globalState.get.mockReturnValueOnce('/path/to/git');

			// Run
			const result = extensionState.getLastKnownGitPath();

			// Assert
			expect(extensionContext.globalState.get).toHaveBeenCalledWith('lastKnownGitPath', null);
			expect(result).toBe('/path/to/git');
		});

		it('Should return the default value if not defined', () => {
			// Setup
			extensionContext.globalState.get.mockImplementationOnce((_, defaultValue) => defaultValue);

			// Run
			const result = extensionState.getLastKnownGitPath();

			// Assert
			expect(extensionContext.globalState.get).toHaveBeenCalledWith('lastKnownGitPath', null);
			expect(result).toBe(null);
		});
	});

	describe('isAvatarStorageAvailable', () => {
		it('Should return TRUE if the avatar storage folder existed on startup', () => {
			// Setup
			const spyOnStat = jest.spyOn(fs, 'stat');
			spyOnStat.mockImplementationOnce((_, callback) => callback(null, {} as fs.Stats));
			const extensionState = new ExtensionState(extensionContext, onDidChangeGitExecutable.subscribe);

			// Run
			const result = extensionState.isAvatarStorageAvailable();

			// Assert
			expect(spyOnStat.mock.calls[0][0]).toBe('/path/to/globalStorage/avatars');
			expect(result).toBe(true);

			// Teardown
			extensionState.dispose();
		});

		it('Should return TRUE if the avatar storage folder was successfully created', () => {
			// Setup
			jest.spyOn(fs, 'stat').mockImplementationOnce((_, callback) => callback(new Error(), {} as fs.Stats));
			const spyOnMkdir = jest.spyOn(fs, 'mkdir');
			spyOnMkdir.mockImplementation((_, callback) => callback(null));
			const extensionState = new ExtensionState(extensionContext, onDidChangeGitExecutable.subscribe);

			// Run
			const result = extensionState.isAvatarStorageAvailable();

			// Assert
			expect(spyOnMkdir.mock.calls[0][0]).toBe('/path/to/globalStorage');
			expect(spyOnMkdir.mock.calls[1][0]).toBe('/path/to/globalStorage/avatars');
			expect(result).toBe(true);

			// Teardown
			extensionState.dispose();
		});

		it('Should return TRUE if the avatar storage folder was created after the initial stat check', () => {
			// Setup
			jest.spyOn(fs, 'stat').mockImplementationOnce((_, callback) => callback(new Error(), {} as fs.Stats));
			const spyOnMkdir = jest.spyOn(fs, 'mkdir');
			spyOnMkdir.mockImplementation((_, callback) => callback({ code: 'EEXIST' } as NodeJS.ErrnoException));
			const extensionState = new ExtensionState(extensionContext, onDidChangeGitExecutable.subscribe);

			// Run
			const result = extensionState.isAvatarStorageAvailable();

			// Assert
			expect(spyOnMkdir.mock.calls[0][0]).toBe('/path/to/globalStorage');
			expect(spyOnMkdir.mock.calls[1][0]).toBe('/path/to/globalStorage/avatars');
			expect(result).toBe(true);

			// Teardown
			extensionState.dispose();
		});

		it('Should return FALSE if the avatar storage folder could not be created', () => {
			// Setup
			jest.spyOn(fs, 'stat').mockImplementationOnce((_, callback) => callback(new Error(), {} as fs.Stats));
			const spyOnMkdir = jest.spyOn(fs, 'mkdir');
			spyOnMkdir.mockImplementation((_, callback) => callback({} as NodeJS.ErrnoException));
			const extensionState = new ExtensionState(extensionContext, onDidChangeGitExecutable.subscribe);

			// Run
			const result = extensionState.isAvatarStorageAvailable();

			// Assert
			expect(spyOnMkdir.mock.calls[0][0]).toBe('/path/to/globalStorage');
			expect(spyOnMkdir.mock.calls[1][0]).toBe('/path/to/globalStorage/avatars');
			expect(result).toBe(false);

			// Teardown
			extensionState.dispose();
		});
	});

	describe('getAvatarStoragePath', () => {
		it('Should return the avatar storage path', () => {
			// Run
			const result = extensionState.getAvatarStoragePath();

			// Assert
			expect(result).toBe('/path/to/globalStorage/avatars');
		});
	});

	describe('getAvatarCache', () => {
		it('Should return the stored avatar cache', () => {
			// Setup
			const cache = {};
			extensionContext.globalState.get.mockReturnValueOnce(cache);

			// Run
			const result = extensionState.getAvatarCache();

			// Assert
			expect(extensionContext.globalState.get).toHaveBeenCalledWith('avatarCache', {});
			expect(result).toBe(cache);
		});

		it('Should return the default value if not defined', () => {
			// Setup
			extensionContext.globalState.get.mockImplementationOnce((_, defaultValue) => defaultValue);

			// Run
			const result = extensionState.getAvatarCache();

			// Assert
			expect(extensionContext.globalState.get).toHaveBeenCalledWith('avatarCache', {});
			expect(result).toStrictEqual({});
		});
	});

	describe('saveAvatar', () => {
		it('Should save the avatar to the avatar cache', () => {
			// Setup
			const avatar = { image: 'name.jpg', timestamp: 0, identicon: false };
			extensionContext.globalState.get.mockReturnValueOnce({});
			extensionContext.globalState.update.mockResolvedValueOnce(null);

			// Run
			extensionState.saveAvatar('test@example.com', avatar);

			// Assert
			expect(extensionContext.globalState.update).toHaveBeenCalledWith('avatarCache', { 'test@example.com': avatar });
		});
	});

	describe('removeAvatarFromCache', () => {
		it('Should remove an avatar from the cache', () => {
			// Setup
			const avatar = { image: 'name.jpg', timestamp: 0, identicon: false };
			extensionContext.globalState.get.mockReturnValueOnce({
				'test1@example.com': avatar,
				'test2@example.com': avatar
			});
			extensionContext.globalState.update.mockResolvedValueOnce(null);

			// Run
			extensionState.removeAvatarFromCache('test1@example.com');

			// Assert
			expect(extensionContext.globalState.update).toHaveBeenCalledWith('avatarCache', { 'test2@example.com': avatar });
		});
	});

	describe('clearAvatarCache', () => {
		let spyOnReaddir: jest.SpyInstance, spyOnUnlink: jest.SpyInstance;
		beforeAll(() => {
			spyOnReaddir = jest.spyOn(fs, 'readdir');
			spyOnUnlink = jest.spyOn(fs, 'unlink');
		});

		it('Should clear all avatars from the cache and delete all avatars that are currently stored on the file system', async () => {
			// Setup
			extensionContext.globalState.update.mockResolvedValueOnce(null);
			spyOnReaddir.mockImplementationOnce((_, callback) => callback(null, ['file1.jpg', 'file2.jpg']));
			spyOnUnlink.mockImplementationOnce((_, callback) => callback(null));
			spyOnUnlink.mockImplementationOnce((_, callback) => callback(null));

			// Run
			const result = await extensionState.clearAvatarCache();

			// Assert
			expect(result).toBeNull();
			expect(extensionContext.globalState.update).toHaveBeenCalledWith('avatarCache', {});
			expect(spyOnReaddir).toHaveBeenCalledTimes(1);
			expect(spyOnReaddir).toHaveBeenNthCalledWith(1, '/path/to/globalStorage/avatars', expect.anything());
			expect(spyOnUnlink).toHaveBeenCalledTimes(2);
			expect(spyOnUnlink).toHaveBeenNthCalledWith(1, '/path/to/globalStorage/avatars/file1.jpg', expect.anything());
			expect(spyOnUnlink).toHaveBeenNthCalledWith(2, '/path/to/globalStorage/avatars/file2.jpg', expect.anything());
		});

		it('Should skip deleting avatars on the file system if they could not be listed from the file system', async () => {
			// Setup
			extensionContext.globalState.update.mockResolvedValueOnce(null);
			spyOnReaddir.mockImplementationOnce((_, callback) => callback(new Error(), ['file1.jpg', 'file2.jpg']));

			// Run
			const result = await extensionState.clearAvatarCache();

			// Assert
			expect(result).toBeNull();
			expect(extensionContext.globalState.update).toHaveBeenCalledWith('avatarCache', {});
			expect(spyOnReaddir).toHaveBeenCalledTimes(1);
			expect(spyOnReaddir).toHaveBeenNthCalledWith(1, '/path/to/globalStorage/avatars', expect.anything());
			expect(spyOnUnlink).toHaveBeenCalledTimes(0);
		});

		it('Shouldn\'t delete avatars on the file system if globalState.update rejects, and return the error message', async () => {
			// Setup
			extensionContext.globalState.update.mockRejectedValueOnce(null);

			// Run
			const result = await extensionState.clearAvatarCache();

			// Assert
			expect(result).toBe('Visual Studio Code was unable to save the Commits Global State Memento.');
			expect(extensionContext.globalState.update).toHaveBeenCalledWith('avatarCache', {});
			expect(spyOnReaddir).not.toHaveBeenCalled();
		});
	});

});
