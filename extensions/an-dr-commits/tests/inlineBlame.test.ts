import * as vscode from './mocks/vscode';
jest.mock('vscode', () => vscode, { virtual: true });
jest.mock('../src/logger');

import { ConfigurationChangeEvent } from 'vscode';
import { InlineBlameController } from '../src/inlineBlame';
import { Logger } from '../src/logger';
import { EventEmitter } from '../src/utils/event';

describe('InlineBlameController', () => {
	let onDidChangeConfiguration: EventEmitter<ConfigurationChangeEvent>;
	let onDidChangeRepos: EventEmitter<any>;
	let logger: Logger;
	let dataSource: { getBlameLine: jest.Mock, getConfig: jest.Mock };
	let repoManager: { getRepoContainingFile: jest.Mock, onDidChangeRepos: any };
	let statusBarItem: { setActiveCommit: jest.Mock };

	beforeEach(() => {
		jest.useFakeTimers();
		onDidChangeConfiguration = new EventEmitter<ConfigurationChangeEvent>();
		onDidChangeRepos = new EventEmitter<any>();
		logger = new Logger();
		dataSource = {
			getBlameLine: jest.fn().mockResolvedValue({
				author: 'Jane Doe',
				authorEmail: 'jane@example.com',
				authorTime: 1710000000,
				committed: true,
				hash: '1a2b3c4d5e6f7g8h9i0j',
				summary: 'Fix inline blame rendering'
			}),
			getConfig: jest.fn().mockResolvedValue({
				config: {
					user: {
						name: { local: 'Jane Doe', global: null },
						email: { local: 'jane@example.com', global: null }
					}
				},
				error: null
			})
		};
		repoManager = {
			getRepoContainingFile: jest.fn(() => '/path/to/workspace-folder'),
			onDidChangeRepos: onDidChangeRepos.subscribe
		};
		statusBarItem = {
			setActiveCommit: jest.fn()
		};
		vscode.mockExtensionSettingReturnValue('inlineBlame.enabled', true);
	});

	afterEach(() => {
		jest.useRealTimers();
		logger.dispose();
	});

	it('Should render inline blame for the active line', async () => {
		const controller = new InlineBlameController(dataSource as any, repoManager as any, statusBarItem as any, onDidChangeConfiguration.subscribe, logger);

		await (controller as any).update(vscode.window.activeTextEditor);

		expect(dataSource.getBlameLine).toHaveBeenCalledWith('/path/to/workspace-folder', '/path/to/workspace-folder/active-file.txt', 0);
		expect(vscode.window.activeTextEditor.setDecorations).toHaveBeenCalledTimes(1);
		const decoration = vscode.window.activeTextEditor.setDecorations.mock.calls[0][1][0];
		expect(decoration.renderOptions.after.contentText).toContain('Jane Doe');
		expect(decoration.renderOptions.after.contentText).toContain('Blame');
		expect(statusBarItem.setActiveCommit).toHaveBeenCalledWith(expect.objectContaining({
			text: expect.stringContaining('1a2b3c4d')
		}));

		controller.dispose();
	});

	it('Should only update the status bar when inline blame is disabled but current commit display is enabled', async () => {
		vscode.mockExtensionSettingReturnValue('inlineBlame.enabled', false);
		vscode.mockExtensionSettingReturnValue('statusBarShowCurrentCommit', true);
		const controller = new InlineBlameController(dataSource as any, repoManager as any, statusBarItem as any, onDidChangeConfiguration.subscribe, logger);

		await (controller as any).update(vscode.window.activeTextEditor);

		expect(vscode.window.activeTextEditor.setDecorations).toHaveBeenCalledWith(expect.anything(), []);
		expect(statusBarItem.setActiveCommit).toHaveBeenCalledWith(expect.objectContaining({
			text: expect.stringContaining('1a2b3c4d')
		}));

		controller.dispose();
	});

	it('Should clear the blame display when the active editor is not inside a known repo', async () => {
		repoManager.getRepoContainingFile.mockReturnValue(null);
		const controller = new InlineBlameController(dataSource as any, repoManager as any, statusBarItem as any, onDidChangeConfiguration.subscribe, logger);

		await (controller as any).update(vscode.window.activeTextEditor);

		expect(dataSource.getBlameLine).not.toHaveBeenCalled();
		expect(vscode.window.activeTextEditor.setDecorations).toHaveBeenCalledWith(expect.anything(), []);
		expect(statusBarItem.setActiveCommit).toHaveBeenCalledWith(null);

		controller.dispose();
	});

	it('Should only apply blame.currentUserAlias to the configured Git user', async () => {
		vscode.mockExtensionSettingReturnValue('blame.inlineMessageEnabled', true);
		vscode.mockExtensionSettingReturnValue('blame.currentUserAlias', 'You');
		const controller = new InlineBlameController(dataSource as any, repoManager as any, statusBarItem as any, onDidChangeConfiguration.subscribe, logger);

		await (controller as any).update(vscode.window.activeTextEditor);

		const decoration = vscode.window.activeTextEditor.setDecorations.mock.calls[0][1][0];
		expect(decoration.renderOptions.after.contentText).toContain('You');
		expect(dataSource.getConfig).toHaveBeenCalledWith('/path/to/workspace-folder', []);

		vscode.window.activeTextEditor.setDecorations.mockClear();
		dataSource.getBlameLine.mockResolvedValueOnce({
			author: 'Other Dev',
			authorEmail: 'other@example.com',
			authorTime: 1710000000,
			committed: true,
			hash: 'abcdef1234567890',
			summary: 'Touch unrelated line'
		});

		await (controller as any).update(vscode.window.activeTextEditor);

		const secondDecoration = vscode.window.activeTextEditor.setDecorations.mock.calls[0][1][0];
		expect(secondDecoration.renderOptions.after.contentText).toContain('Other Dev');
		expect(secondDecoration.renderOptions.after.contentText).not.toContain('You');

		controller.dispose();
	});
});
