import * as vscode from './mocks/vscode';
jest.mock('vscode', () => vscode, { virtual: true });
jest.mock('../src/logger');

import { ConfigurationChangeEvent } from 'vscode';
import { BlameLineInfo } from '../src/dataSource';
import { InlineBlameController } from '../src/inlineBlame';
import { Logger } from '../src/logger';
import { EventEmitter } from '../src/utils/event';

const jane: BlameLineInfo = {
	author: 'Jane Doe', authorEmail: 'jane@example.com', authorTime: 1710000000,
	committed: true, hash: '1a2b3c4d5e6f7g8h9i0j', summary: 'Fix inline blame rendering'
};
const other: BlameLineInfo = {
	author: 'Other Dev', authorEmail: 'other@example.com', authorTime: 1710000000,
	committed: true, hash: 'abcdef1234567890', summary: 'Touch unrelated line'
};

describe('InlineBlameController', () => {
	let onDidChangeConfiguration: EventEmitter<ConfigurationChangeEvent>;
	let onDidChangeRepos: EventEmitter<any>;
	let logger: Logger;
	let dataSource: { getBlameFile: jest.Mock, getConfig: jest.Mock };
	let repoManager: { resolveRepoContainingFile: jest.Mock, onDidChangeRepos: any };

	beforeEach(() => {
		jest.useFakeTimers();
		onDidChangeConfiguration = new EventEmitter<ConfigurationChangeEvent>();
		onDidChangeRepos = new EventEmitter<any>();
		logger = new Logger();
		dataSource = {
			getBlameFile: jest.fn().mockResolvedValue(new Map([[0, jane], [1, other]])),
			getConfig: jest.fn().mockResolvedValue({
				config: { user: { name: { local: 'Jane Doe', global: null }, email: { local: 'jane@example.com', global: null } } },
				error: null
			})
		};
		repoManager = {
			resolveRepoContainingFile: jest.fn().mockResolvedValue('/path/to/workspace-folder'),
			onDidChangeRepos: onDidChangeRepos.subscribe
		};
		vscode.mockExtensionSettingReturnValue('inlineBlame.enabled', true);
	});

	afterEach(() => {
		jest.useRealTimers();
		logger.dispose();
	});

	it('Should render inline blame for the active line', async () => {
		const controller = new InlineBlameController(dataSource as any, repoManager as any, {}, onDidChangeConfiguration.subscribe, logger);

		await (controller as any).update(vscode.window.activeTextEditor);

		expect(repoManager.resolveRepoContainingFile).toHaveBeenCalledWith('/path/to/workspace-folder/active-file.txt');
		expect(dataSource.getBlameFile).toHaveBeenCalledWith('/path/to/workspace-folder', '/path/to/workspace-folder/active-file.txt', expect.anything());
		const decoration = vscode.window.activeTextEditor.setDecorations.mock.calls[0][1][0];
		expect(decoration.renderOptions.after.contentText).toContain('Jane Doe');
		expect(decoration.renderOptions.after.contentText).toContain('Blame');
		controller.dispose();
	});

	it('Should reuse one document blame when the active line changes', async () => {
		const controller = new InlineBlameController(dataSource as any, repoManager as any, {}, onDidChangeConfiguration.subscribe, logger);
		await (controller as any).update(vscode.window.activeTextEditor);
		vscode.window.activeTextEditor.selection.active.line = 1;

		await (controller as any).update(vscode.window.activeTextEditor);

		expect(dataSource.getBlameFile).toHaveBeenCalledTimes(1);
		const decoration = vscode.window.activeTextEditor.setDecorations.mock.calls[1][1][0];
		expect(decoration.renderOptions.after.contentText).toContain('Other Dev');
		controller.dispose();
	});

	it('Should cancel stale document blame requests', () => {
		const tokens: any[] = [];
		dataSource.getBlameFile.mockImplementation((_repo, _file, token) => {
			tokens.push(token);
			return Promise.resolve(new Map());
		});
		const controller = new InlineBlameController(dataSource as any, repoManager as any, {}, onDidChangeConfiguration.subscribe, logger);

		(controller as any).getDocumentBlame('/repo', '/repo/file', 'file:///repo/file', 1);
		(controller as any).getDocumentBlame('/repo', '/repo/file', 'file:///repo/file', 2);

		expect(tokens[0].isCancellationRequested).toBe(true);
		expect(tokens[1].isCancellationRequested).toBe(false);
		controller.dispose();
	});

	it('Should only apply blame.currentUserAlias to the configured Git user', async () => {
		vscode.mockExtensionSettingReturnValue('blame.currentUserAlias', 'You');
		const controller = new InlineBlameController(dataSource as any, repoManager as any, {}, onDidChangeConfiguration.subscribe, logger);
		await (controller as any).update(vscode.window.activeTextEditor);
		vscode.window.activeTextEditor.selection.active.line = 1;
		await (controller as any).update(vscode.window.activeTextEditor);

		const firstDecoration = vscode.window.activeTextEditor.setDecorations.mock.calls[0][1][0];
		const secondDecoration = vscode.window.activeTextEditor.setDecorations.mock.calls[1][1][0];
		expect(firstDecoration.renderOptions.after.contentText).toContain('You');
		expect(secondDecoration.renderOptions.after.contentText).toContain('Other Dev');
		expect(dataSource.getConfig).toHaveBeenCalledTimes(1);
		controller.dispose();
	});
});
