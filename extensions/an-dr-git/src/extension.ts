// Based on vscode-git-graph by Michael Hutchison
// Original: https://github.com/mhutchie/vscode-git-graph
// License: MIT
import * as vscode from 'vscode';
import { AvatarManager } from './avatarManager';
import { CommandManager } from './commands';
import { getConfig } from './config';
import { DataSource } from './dataSource';
import { DiffDocProvider } from './diffDocProvider';
import { ExtensionState } from './extensionState';
import { GitGraphView } from './gitGraphView';
import { onStartUp } from './life-cycle/startup';
import { Logger } from './logger';
import { RepoManager } from './repoManager';
import { StatusBarItem } from './statusBarItem';
import { GitExecutable, UNABLE_TO_FIND_GIT_MSG, findGit, getGitExecutableFromPaths, showErrorMessage, showInformationMessage } from './utils';
import { EventEmitter } from './utils/event';

/**
 * Activate Git Graph.
 * @param context The context of the extension.
 */
export async function activate(context: vscode.ExtensionContext) {
	const logger = new Logger();
	logger.log('Starting Git Graph ...');
	const gitGraphTabViewTypes = new Set([GitGraphView.VIEW_TYPE, 'mainThreadWebview-' + GitGraphView.VIEW_TYPE]);
	const gitGraphTabLabel = 'an-dr: Git';
	let orphanCheckTimeout: ReturnType<typeof setTimeout> | null = null;
	let suppressOrphanChecksUntil = 0;

	const delayOrphanChecks = (reason: string, durationMs: number) => {
		const nextSuppressionTime = Date.now() + durationMs;
		if (nextSuppressionTime > suppressOrphanChecksUntil) {
			suppressOrphanChecksUntil = nextSuppressionTime;
		}
		logger.logDebug('Suppressing Git Graph orphan checks for ' + durationMs + 'ms (' + reason + ').');
	};

	const gitExecutableEmitter = new EventEmitter<GitExecutable>();
	const onDidChangeGitExecutable = gitExecutableEmitter.subscribe;

	const extensionState = new ExtensionState(context, onDidChangeGitExecutable);

	let gitExecutable: GitExecutable | null;
	try {
		gitExecutable = await findGit(extensionState);
		gitExecutableEmitter.emit(gitExecutable);
		logger.log('Using ' + gitExecutable.path + ' (version: ' + gitExecutable.version + ')');
	} catch (_) {
		gitExecutable = null;
		showErrorMessage(UNABLE_TO_FIND_GIT_MSG);
		logger.logError(UNABLE_TO_FIND_GIT_MSG);
	}

	const configurationEmitter = new EventEmitter<vscode.ConfigurationChangeEvent>();
	const onDidChangeConfiguration = configurationEmitter.subscribe;

	const dataSource = new DataSource(gitExecutable, onDidChangeConfiguration, onDidChangeGitExecutable, logger);
	const avatarManager = new AvatarManager(dataSource, extensionState, logger);
	const repoManager = new RepoManager(dataSource, extensionState, onDidChangeConfiguration, logger);
	const statusBarItem = new StatusBarItem(repoManager.getNumRepos(), repoManager.onDidChangeRepos, onDidChangeConfiguration, logger);
	const commandManager = new CommandManager(context, avatarManager, dataSource, extensionState, repoManager, gitExecutable, onDidChangeGitExecutable, logger);
	const diffDocProvider = new DiffDocProvider(dataSource);

	context.subscriptions.push(
		vscode.window.registerWebviewPanelSerializer(GitGraphView.VIEW_TYPE, {
			async deserializeWebviewPanel(panel: vscode.WebviewPanel, _state: any) {
				logger.logDebug('Deserializing Git Graph webview panel...');
				delayOrphanChecks('webview serializer restore', 750);
				GitGraphView.revive(panel, context.extensionPath, dataSource, extensionState, avatarManager, repoManager, logger);
			}
		}),
		vscode.workspace.registerTextDocumentContentProvider(DiffDocProvider.scheme, diffDocProvider),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('an-dr-git')) {
				configurationEmitter.emit(event);
			} else if (event.affectsConfiguration('git.path')) {
				const paths = getConfig().gitPaths;
				if (paths.length === 0) return;

				getGitExecutableFromPaths(paths).then((gitExecutable) => {
					gitExecutableEmitter.emit(gitExecutable);
					const msg = 'Git Graph is now using ' + gitExecutable.path + ' (version: ' + gitExecutable.version + ')';
					showInformationMessage(msg);
					logger.log(msg);
					repoManager.searchWorkspaceForRepos();
				}, () => {
					const msg = 'The new value of "git.path" ("' + paths.join('", "') + '") does not ' + (paths.length > 1 ? 'contain a string that matches' : 'match') + ' the path and filename of a valid Git executable.';
					showErrorMessage(msg);
					logger.logError(msg);
				});
			}
		}),
		diffDocProvider,
		commandManager,
		statusBarItem,
		repoManager,
		avatarManager,
		dataSource,
		configurationEmitter,
		extensionState,
		gitExecutableEmitter,
		logger
	);

	const tabGroups = (vscode.window as any).tabGroups;
	if (tabGroups && typeof tabGroups.onDidChangeTabs === 'function') {
		const isGitGraphTab = (tab: any) => {
			const input = tab && tab.input;
			const viewType = input && typeof input.viewType === 'string' ? input.viewType : '';
			return gitGraphTabViewTypes.has(viewType) || tab.label === gitGraphTabLabel;
		};

		const doesGitGraphTabExist = () => {
			return tabGroups.all.some((group: any) => group.tabs.some((tab: any) => {
				return isGitGraphTab(tab);
			}));
		};

		const cancelPendingOrphanCheck = () => {
			if (orphanCheckTimeout === null) return;
			clearTimeout(orphanCheckTimeout);
			orphanCheckTimeout = null;
		};

		const scheduleOrphanCheck = () => {
			cancelPendingOrphanCheck();
			orphanCheckTimeout = setTimeout(() => {
				orphanCheckTimeout = null;
				if (!GitGraphView.currentPanel) return;
				const remainingSuppressionMs = suppressOrphanChecksUntil - Date.now();
				if (remainingSuppressionMs > 0) {
					scheduleOrphanCheck();
					return;
				}
				if (doesGitGraphTabExist()) return;
				GitGraphView.recoverOrphanedPanelIfNeeded(logger);
			}, 250);
		};

		context.subscriptions.push(tabGroups.onDidChangeTabs(() => {
			try {
				const hasGitGraphTab = doesGitGraphTabExist();
				if (GitGraphView.currentPanel && !hasGitGraphTab) {
					scheduleOrphanCheck();
				} else if (hasGitGraphTab) {
					cancelPendingOrphanCheck();
				}
			} catch (error) {
				logger.logError('Unable to evaluate Git Graph tab tracking: ' + String(error));
			}
		}));
	}
	logger.log('Started Git Graph - Ready to use!');
	if (extensionState.getReopenGitGraphOnStartup()) {
		logger.log('Reopening Git Graph because it was open before reload.');
		setTimeout(() => {
			void vscode.commands.executeCommand('an-dr-git.view');
		}, 150);
	}

	extensionState.expireOldCodeReviews();
	onStartUp(context).catch(() => { });
}

/**
 * Deactivate Git Graph.
 */
export function deactivate() { }
