import * as vscode from './mocks/vscode';
jest.mock('vscode', () => vscode, { virtual: true });
jest.mock('../src/logger');

import { ConfigurationChangeEvent } from 'vscode';
import { Logger } from '../src/logger';
import { RepoChangeEvent } from '../src/repoManager';
import { StatusBarItem } from '../src/statusBarItem';
import { EventEmitter } from '../src/utils/event';

let onDidChangeRepos: EventEmitter<RepoChangeEvent>;
let onDidChangeConfiguration: EventEmitter<ConfigurationChangeEvent>;
let logger: Logger;

beforeAll(() => {
	onDidChangeRepos = new EventEmitter<RepoChangeEvent>();
	onDidChangeConfiguration = new EventEmitter<ConfigurationChangeEvent>();
	logger = new Logger();
});

afterAll(() => {
	logger.dispose();
});

describe('StatusBarItem', () => {
	it('Should show the Status Bar Item on vscode startup', () => {
		// Setup
		vscode.mockExtensionSettingReturnValue('showStatusBarItem', true);

		// Run
		const statusBarItem = new StatusBarItem(1, onDidChangeRepos.subscribe, onDidChangeConfiguration.subscribe, logger);
		const commitsItem = vscode.getStatusBarItem(0);
		const blameItem = vscode.getStatusBarItem(1);

		// Assert
		expect(commitsItem.text).toBe('$(git-commit)');
		expect(commitsItem.tooltip).toBe('Commits');
		expect(commitsItem.command).toBe('an-dr-commits.view');
		expect(commitsItem.show).toHaveBeenCalledTimes(1);
		expect(commitsItem.hide).toHaveBeenCalledTimes(0);
		expect(blameItem.show).toHaveBeenCalledTimes(0);
		expect(blameItem.hide).toHaveBeenCalledTimes(0);

		// Teardown
		statusBarItem.dispose();

		// Asset
		expect(commitsItem.dispose).toHaveBeenCalledTimes(1);
		expect(blameItem.dispose).toHaveBeenCalledTimes(1);
		expect(onDidChangeRepos['listeners']).toHaveLength(0);
		expect(onDidChangeConfiguration['listeners']).toHaveLength(0);
	});

	it('Should show the full name in the Status Bar Item when icon-only is disabled', () => {
		// Setup
		vscode.mockExtensionSettingReturnValue('showStatusBarItem', true);
		vscode.mockExtensionSettingReturnValue('statusBarIconOnly', false);

		// Run
		const statusBarItem = new StatusBarItem(1, onDidChangeRepos.subscribe, onDidChangeConfiguration.subscribe, logger);
		const commitsItem = vscode.getStatusBarItem(0);

		// Assert
		expect(commitsItem.text).toBe('$(git-commit) Commits');
		expect(commitsItem.tooltip).toBe('Commits');

		// Teardown
		statusBarItem.dispose();
	});

	it('Should hide the Status Bar Item after the number of repositories becomes zero', () => {
		// Setup
		vscode.mockExtensionSettingReturnValue('showStatusBarItem', true);

		// Run
		const statusBarItem = new StatusBarItem(1, onDidChangeRepos.subscribe, onDidChangeConfiguration.subscribe, logger);
		const commitsItem = vscode.getStatusBarItem(0);

		// Assert
		expect(commitsItem.show).toHaveBeenCalledTimes(1);
		expect(commitsItem.hide).toHaveBeenCalledTimes(0);

		// Run
		onDidChangeRepos.emit({
			repos: {},
			numRepos: 0,
			loadRepo: null
		});

		// Assert
		expect(commitsItem.show).toHaveBeenCalledTimes(1);
		expect(commitsItem.hide).toHaveBeenCalledTimes(1);

		// Teardown
		statusBarItem.dispose();
	});

	it('Should show the Status Bar Item after the number of repositories increases above zero', () => {
		// Setup
		vscode.mockExtensionSettingReturnValue('showStatusBarItem', true);

		// Run
		const statusBarItem = new StatusBarItem(0, onDidChangeRepos.subscribe, onDidChangeConfiguration.subscribe, logger);
		const commitsItem = vscode.getStatusBarItem(0);

		// Assert
		expect(commitsItem.show).toHaveBeenCalledTimes(0);
		expect(commitsItem.hide).toHaveBeenCalledTimes(0);

		// Run
		onDidChangeRepos.emit({
			repos: {},
			numRepos: 1,
			loadRepo: null
		});

		// Assert
		expect(commitsItem.show).toHaveBeenCalledTimes(1);
		expect(commitsItem.hide).toHaveBeenCalledTimes(0);

		// Teardown
		statusBarItem.dispose();
	});

	it('Should hide the Status Bar Item the extension setting an-dr-commits.showStatusBarItem becomes disabled', () => {
		// Setup
		vscode.mockExtensionSettingReturnValue('showStatusBarItem', true);

		// Run
		const statusBarItem = new StatusBarItem(1, onDidChangeRepos.subscribe, onDidChangeConfiguration.subscribe, logger);
		const commitsItem = vscode.getStatusBarItem(0);

		// Assert
		expect(commitsItem.show).toHaveBeenCalledTimes(1);
		expect(commitsItem.hide).toHaveBeenCalledTimes(0);

		// Run
		vscode.mockExtensionSettingReturnValue('showStatusBarItem', false);
		onDidChangeConfiguration.emit({
			affectsConfiguration: () => true
		});

		// Assert
		expect(commitsItem.show).toHaveBeenCalledTimes(1);
		expect(commitsItem.hide).toHaveBeenCalledTimes(1);

		// Teardown
		statusBarItem.dispose();
	});

	it('Should ignore extension setting changes unrelated to an-dr-commits.showStatusBarItem', () => {
		// Setup
		vscode.mockExtensionSettingReturnValue('showStatusBarItem', true);

		// Run
		const statusBarItem = new StatusBarItem(1, onDidChangeRepos.subscribe, onDidChangeConfiguration.subscribe, logger);
		const commitsItem = vscode.getStatusBarItem(0);

		// Assert
		expect(commitsItem.show).toHaveBeenCalledTimes(1);
		expect(commitsItem.hide).toHaveBeenCalledTimes(0);

		// Run
		onDidChangeConfiguration.emit({
			affectsConfiguration: () => false
		});

		// Assert
		expect(commitsItem.show).toHaveBeenCalledTimes(1);
		expect(commitsItem.hide).toHaveBeenCalledTimes(0);

		// Teardown
		statusBarItem.dispose();
	});

	it('Should update the Status Bar Item text when an-dr-commits.statusBarIconOnly changes', () => {
		// Setup
		vscode.mockExtensionSettingReturnValue('showStatusBarItem', true);

		// Run
		const statusBarItem = new StatusBarItem(1, onDidChangeRepos.subscribe, onDidChangeConfiguration.subscribe, logger);
		const commitsItem = vscode.getStatusBarItem(0);

		// Assert
		expect(commitsItem.text).toBe('$(git-commit)');

		// Run
		vscode.mockExtensionSettingReturnValue('statusBarIconOnly', false);
		onDidChangeConfiguration.emit({
			affectsConfiguration: (section: string) => section === 'an-dr-commits.statusBarIconOnly'
		});

		// Assert
		expect(commitsItem.text).toBe('$(git-commit) Commits');
		expect(commitsItem.show).toHaveBeenCalledTimes(1);
		expect(commitsItem.hide).toHaveBeenCalledTimes(0);

		// Teardown
		statusBarItem.dispose();
	});

	it('Should show the current commit when an-dr-commits.statusBarShowCurrentCommit is enabled', () => {
		// Setup
		vscode.mockExtensionSettingReturnValue('showStatusBarItem', true);
		vscode.mockExtensionSettingReturnValue('statusBarShowCurrentCommit', true);
		const statusBarItem = new StatusBarItem(1, onDidChangeRepos.subscribe, onDidChangeConfiguration.subscribe, logger);
		const commitsItem = vscode.getStatusBarItem(0);

		// Run
		statusBarItem.setRepoCommit({
			text: '1a2b3c4d',
			tooltip: 'Fix current line blame'
		});

		// Assert
		expect(commitsItem.text).toBe('$(git-commit) 1a2b3c4d');
		expect(commitsItem.tooltip).toBe('Fix current line blame');
		expect(commitsItem.command).toBe('an-dr-commits.view');

		// Teardown
		statusBarItem.dispose();
	});

	it('Should show an optional blame Status Bar Item that reveals the commit in Commits', () => {
		vscode.mockExtensionSettingReturnValue('showStatusBarItem', true);
		const statusBarItem = new StatusBarItem(1, onDidChangeRepos.subscribe, onDidChangeConfiguration.subscribe, logger);
		const blameItem = vscode.getStatusBarItem(1);

		statusBarItem.setBlameCommit({
			repo: '/path/to/workspace-folder',
			hash: '1a2b3c4d',
			text: '1a2b3c4d',
			tooltip: 'Fix current line blame'
		});

		expect(blameItem.text).toBe('$(edit) 1a2b3c4d');
		expect(blameItem.tooltip).toBe('Fix current line blame');
		expect(blameItem.show).toHaveBeenCalledTimes(1);
		expect(blameItem.command).toStrictEqual({
			title: 'Reveal Commit in Commits',
			command: 'an-dr-commits.revealCommitInGraph',
			arguments: [{ repo: '/path/to/workspace-folder', commitHash: '1a2b3c4d' }]
		});
		statusBarItem.dispose();
	});

	it('Should show the Blame label when blame.statusBarIconOnly is disabled', () => {
		vscode.mockExtensionSettingReturnValue('showStatusBarItem', true);
		vscode.mockExtensionSettingReturnValue('blame.statusBarIconOnly', false);
		const statusBarItem = new StatusBarItem(1, onDidChangeRepos.subscribe, onDidChangeConfiguration.subscribe, logger);
		const blameItem = vscode.getStatusBarItem(1);

		statusBarItem.setBlameCommit({
			repo: '/path/to/workspace-folder',
			hash: '1a2b3c4d',
			text: '1a2b3c4d',
			tooltip: 'Fix current line blame'
		});

		expect(blameItem.text).toBe('$(edit) Blame 1a2b3c4d');

		// Teardown
		statusBarItem.dispose();
	});
});
