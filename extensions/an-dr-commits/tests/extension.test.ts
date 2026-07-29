import * as vscode from './mocks/vscode';
jest.mock('vscode', () => vscode, { virtual: true });

const core = {
	executeCommand: jest.fn(),
	ensureGit: jest.fn(() => Promise.resolve()),
	ensureRepositories: jest.fn(() => Promise.resolve()),
	resolveSidebar: jest.fn(),
	reviveTab: jest.fn(),
	provideDiffDocument: jest.fn()
};
const activateCore = jest.fn(() => core);
jest.mock('../src/core', () => ({ activateCore }));

import { activate } from '../src/extension';

describe('lazy extension activation', () => {
	let context: any;

	beforeEach(() => {
		jest.useFakeTimers();
		activateCore.mockClear();
		Object.values(core).forEach((mock) => mock.mockClear());
		core.ensureRepositories.mockResolvedValue(undefined);
		core.ensureGit.mockResolvedValue(undefined);
		context = {
			...vscode.mocks.extensionContext,
			subscriptions: [],
			workspaceState: {
				get: jest.fn(() => ({ '/workspace/repo': {} })),
				update: jest.fn()
			}
		};
		(vscode.window as any).registerWebviewPanelSerializer = jest.fn(() => ({ dispose: jest.fn() }));
		(vscode.workspace as any).registerTextDocumentContentProvider = jest.fn(() => ({ dispose: jest.fn() }));
		(vscode.workspace as any).onDidChangeConfiguration = jest.fn(() => ({ dispose: jest.fn() }));
	});

	afterEach(() => {
		context.subscriptions.forEach((disposable: { dispose: () => void }) => disposable.dispose());
		jest.useRealTimers();
	});

	it('Should return from activation without loading the core and share first-use loading', async () => {
		activate(context);

		expect(activateCore).not.toHaveBeenCalled();
		expect(vscode.mocks.statusBarItem.show).toHaveBeenCalled();

		await Promise.all([
			vscode.commands.executeCommand('an-dr-commits.view'),
			vscode.commands.executeCommand('an-dr-commits.version')
		]);

		expect(activateCore).toHaveBeenCalledTimes(1);
		expect(core.ensureRepositories).toHaveBeenCalledTimes(1);
		expect(core.ensureGit).toHaveBeenCalledTimes(1);
		expect(core.executeCommand).toHaveBeenCalledWith('an-dr-commits.view');
		expect(core.executeCommand).toHaveBeenCalledWith('an-dr-commits.version');
	});

	it('Should wait for Git discovery before executing the version command', async () => {
		let resolveGit!: () => void;
		core.ensureGit.mockReturnValueOnce(new Promise<void>((resolve) => { resolveGit = resolve; }));
		activate(context);

		const command = vscode.commands.executeCommand('an-dr-commits.version');
		await Promise.resolve();
		await Promise.resolve();
		expect(core.executeCommand).not.toHaveBeenCalled();

		resolveGit();
		await command;
		expect(core.executeCommand).toHaveBeenCalledWith('an-dr-commits.version');
	});

	it('Should permit a command to retry when core activation fails', async () => {
		activateCore.mockImplementationOnce(() => { throw new Error('transient'); });
		activate(context);

		await expect(vscode.commands.executeCommand('an-dr-commits.version')).rejects.toThrow('transient');
		await vscode.commands.executeCommand('an-dr-commits.version');

		expect(activateCore).toHaveBeenCalledTimes(2);
		expect(core.executeCommand).toHaveBeenCalledWith('an-dr-commits.version');
	});

	it('Should load the core after the startup-critical window', async () => {
		activate(context);

		jest.advanceTimersByTime(5000);
		await Promise.resolve();
		await Promise.resolve();

		expect(activateCore).toHaveBeenCalledTimes(1);
	});

	it('Should load the core immediately when the current inline blame setting is enabled', async () => {
		vscode.mockExtensionSettingReturnValue('blame.inlineMessageEnabled', true);

		activate(context);
		await Promise.resolve();
		await Promise.resolve();

		expect(activateCore).toHaveBeenCalledTimes(1);
	});
});
