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
	it('Should show the Status Bar Item on vscode startup (icon-only by default)', () => {
		// Setup
		vscode.mockExtensionSettingReturnValue('showStatusBarItem', true);

		// Run
		const statusBarItem = new StatusBarItem(1, onDidChangeRepos.subscribe, onDidChangeConfiguration.subscribe, logger);
		const commitsItem = vscode.getStatusBarItem(0);

		// Assert
		expect(commitsItem.text).toBe('$(git-branch)');
		expect(commitsItem.tooltip).toBe('Commits');
		expect(commitsItem.command).toBe('an-dr-commits.viewFromStatusBar');
		expect(commitsItem.show).toHaveBeenCalledTimes(1);
		expect(commitsItem.hide).toHaveBeenCalledTimes(0);

		// Teardown
		statusBarItem.dispose();

		// Assert
		expect(commitsItem.dispose).toHaveBeenCalledTimes(1);
		expect(onDidChangeRepos['listeners']).toHaveLength(0);
		expect(onDidChangeConfiguration['listeners']).toHaveLength(0);
	});

	it('Should show the full label in the Status Bar Item when icon-only is disabled', () => {
		// Setup
		vscode.mockExtensionSettingReturnValue('showStatusBarItem', true);
		vscode.mockExtensionSettingReturnValue('statusBarIconOnly', false);

		// Run
		const statusBarItem = new StatusBarItem(1, onDidChangeRepos.subscribe, onDidChangeConfiguration.subscribe, logger);
		const commitsItem = vscode.getStatusBarItem(0);

		// Assert
		expect(commitsItem.text).toBe('$(git-branch) Commits');
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

	it('Should hide the Status Bar Item when the extension setting an-dr-commits.showStatusBarItem becomes disabled', () => {
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

	it('Should ignore extension setting changes unrelated to the status bar', () => {
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
		vscode.mockExtensionSettingReturnValue('statusBarIconOnly', true);

		// Run
		const statusBarItem = new StatusBarItem(1, onDidChangeRepos.subscribe, onDidChangeConfiguration.subscribe, logger);
		const commitsItem = vscode.getStatusBarItem(0);

		// Assert
		expect(commitsItem.text).toBe('$(git-branch)');

		// Run
		vscode.mockExtensionSettingReturnValue('statusBarIconOnly', false);
		onDidChangeConfiguration.emit({
			affectsConfiguration: (section: string) => section === 'an-dr-commits.statusBarIconOnly'
		});

		// Assert
		expect(commitsItem.text).toBe('$(git-branch) Commits');
		expect(commitsItem.show).toHaveBeenCalledTimes(1);
		expect(commitsItem.hide).toHaveBeenCalledTimes(0);

		// Teardown
		statusBarItem.dispose();
	});
});
