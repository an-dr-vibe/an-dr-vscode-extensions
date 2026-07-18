// Based on vscode-an-dr-commits by Michael Hutchison
// Original: https://github.com/mhutchie/vscode-an-dr-commits
// License: MIT
import * as vscode from 'vscode';
import { COMMAND_IDS, CommandId } from './commandIds';
import type { ActivatedCore } from './core';

const CORE_FALLBACK_DELAY_MS = 5000;
const REPOSITORY_COMMANDS = new Set<CommandId>([
	'an-dr-commits.view',
	'an-dr-commits.viewFromStatusBar',
	'an-dr-commits.addGitRepository',
	'an-dr-commits.removeGitRepository',
	'an-dr-commits.fetch',
	'an-dr-commits.pull',
	'an-dr-commits.push',
	'an-dr-commits.revealCommitInGraph'
]);
const GIT_METADATA_COMMANDS = new Set<CommandId>(['an-dr-commits.version']);

function isInlineBlameEnabled(): boolean {
	const config = vscode.workspace.getConfiguration('an-dr-commits');
	const current = config.inspect<boolean>('blame.inlineMessageEnabled');
	const legacy = config.inspect<boolean>('inlineBlame.enabled');
	if (typeof current?.workspaceValue !== 'undefined') return current.workspaceValue;
	if (typeof legacy?.workspaceValue !== 'undefined') return legacy.workspaceValue;
	if (typeof current?.globalValue !== 'undefined') return current.globalValue;
	if (typeof legacy?.globalValue !== 'undefined') return legacy.globalValue;
	return false;
}

/** Activate a lightweight shell; load the Git-backed core on use or during idle time. */
export function activate(context: vscode.ExtensionContext) {
	let corePromise: Promise<ActivatedCore> | null = null;
	let coreLoaded = false;
	let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
	const bootstrapStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
	bootstrapStatusBar.command = 'an-dr-commits.viewFromStatusBar';

	const refreshBootstrapStatusBar = () => {
		if (coreLoaded) return;
		const config = vscode.workspace.getConfiguration('an-dr-commits');
		const repos = context.workspaceState.get<Record<string, unknown>>('repoStates', {});
		bootstrapStatusBar.text = config.get<boolean>('statusBarIconOnly', true) ? '$(git-branch)' : '$(git-branch) Commits';
		bootstrapStatusBar.tooltip = 'Commits';
		if (config.get<boolean>('showStatusBarItem', true) && Object.keys(repos).length > 0) {
			bootstrapStatusBar.show();
		} else {
			bootstrapStatusBar.hide();
		}
	};

	const ensureCore = (): Promise<ActivatedCore> => {
		if (corePromise !== null) return corePromise;
		corePromise = import('./core').then(({ activateCore }) => {
			const core = activateCore(context);
			coreLoaded = true;
			if (fallbackTimer !== null) {
				clearTimeout(fallbackTimer);
				fallbackTimer = null;
			}
			bootstrapStatusBar.dispose();
			return core;
		}).catch((error) => {
			// Permit a later command or view-open event to retry transient module-load failures.
			corePromise = null;
			void vscode.window.showErrorMessage('Commits could not finish loading. Please retry the command.');
			throw error;
		});
		return corePromise;
	};

	COMMAND_IDS.forEach((command) => {
		context.subscriptions.push(vscode.commands.registerCommand(command, async (...args: any[]) => {
			const core = await ensureCore();
			if (GIT_METADATA_COMMANDS.has(command)) await core.ensureGit();
			if (REPOSITORY_COMMANDS.has(command)) await core.ensureRepositories();
			return core.executeCommand(command, ...args);
		}));
	});

	const registerWebviewViewProvider = (vscode.window as any).registerWebviewViewProvider;
	if (typeof registerWebviewViewProvider === 'function') {
		context.subscriptions.push(registerWebviewViewProvider.call(vscode.window, 'an-dr-commits.activityView', {
			async resolveWebviewView(webviewView: any) {
				const core = await ensureCore();
				core.resolveSidebar(webviewView);
				void core.ensureRepositories().catch(() => { });
			}
		}, { webviewOptions: { retainContextWhenHidden: true } }));
	}

	context.subscriptions.push(
		vscode.window.registerWebviewPanelSerializer('an-dr-commits', {
			async deserializeWebviewPanel(panel, state) {
				const core = await ensureCore();
				core.reviveTab(panel, state);
				void core.ensureRepositories().catch(() => { });
			}
		}),
		vscode.workspace.registerTextDocumentContentProvider('an-dr-commits', {
			async provideTextDocumentContent(uri) {
				return ensureCore().then((core) => core.provideDiffDocument(uri));
			}
		}),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('an-dr-commits.showStatusBarItem') || event.affectsConfiguration('an-dr-commits.statusBarIconOnly')) {
				refreshBootstrapStatusBar();
			}
			if ((event.affectsConfiguration('an-dr-commits.blame.inlineMessageEnabled') || event.affectsConfiguration('an-dr-commits.inlineBlame.enabled')) && isInlineBlameEnabled()) {
				void ensureCore().catch(() => { });
			}
		}),
		bootstrapStatusBar
	);

	refreshBootstrapStatusBar();
	fallbackTimer = setTimeout(() => void ensureCore().catch(() => { }), CORE_FALLBACK_DELAY_MS);
	context.subscriptions.push({ dispose: () => {
		if (fallbackTimer !== null) clearTimeout(fallbackTimer);
	} });
	if (isInlineBlameEnabled()) {
		void ensureCore().catch(() => { });
	}
}

export function deactivate() { }
