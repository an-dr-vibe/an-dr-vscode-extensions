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
		vscode.workspace.registerTextDocumentContentProvider(DiffDocProvider.scheme, diffDocProvider),
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			logger.log('VS Code active editor changed: ' + (editor ? editor.document.uri.toString() + ' (column ' + editor.viewColumn + ')' : 'undefined'));
		}),
		vscode.window.onDidChangeVisibleTextEditors((editors) => {
			logger.log('VS Code visible text editors changed: [' + editors.map((editor) => editor.document.uri.toString()).join(', ') + ']');
		}),
		vscode.workspace.onDidOpenTextDocument((doc) => {
			logger.log('VS Code opened document: ' + doc.uri.toString());
		}),
		vscode.workspace.onDidCloseTextDocument((doc) => {
			logger.log('VS Code closed document: ' + doc.uri.toString());
		}),
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
		const describeTab = (tab: any) => {
			const input = tab.input;
			const inputName = input && input.constructor ? input.constructor.name : typeof input;
			const uri = input && input.uri ? input.uri.toString() : '';
			const viewType = input && input.viewType ? input.viewType : '';
			const flags = [
				tab.isActive ? 'active' : null,
				tab.isDirty ? 'dirty' : null,
				tab.isPinned ? 'pinned' : null,
				tab.isPreview ? 'preview' : null
			].filter(Boolean).join(',');
			return tab.label + '<' + inputName + '>' +
				(viewType ? '[viewType=' + viewType + ']' : '') +
				(uri ? '[uri=' + uri + ']' : '') +
				(flags ? '[' + flags + ']' : '');
		};

		const doesGitGraphTabExist = () => {
			return tabGroups.all.some((group: any) => group.tabs.some((tab: any) => {
				const input = tab.input;
				return !!input && input.viewType === 'mainThreadWebview-an-dr-git';
			}));
		};

		context.subscriptions.push(tabGroups.onDidChangeTabs((event: any) => {
			try {
				const summary = tabGroups.all.map((group: any, groupIndex: number) =>
					'group ' + groupIndex + (group.isActive ? '*' : '') + ': [' + group.tabs.map((tab: any) => {
						return describeTab(tab);
					}).join(', ') + ']'
				).join(' | ');
				const opened = Array.isArray(event.opened) ? event.opened.map((tab: any) => describeTab(tab)).join(' | ') : '';
				const closed = Array.isArray(event.closed) ? event.closed.map((tab: any) => describeTab(tab)).join(' | ') : '';
				const changed = Array.isArray(event.changed) ? event.changed.map((tab: any) => describeTab(tab)).join(' | ') : '';
				logger.log('VS Code tabs changed: ' + summary);
				if (opened) logger.log('VS Code tabs opened: ' + opened);
				if (closed) logger.log('VS Code tabs closed: ' + closed);
				if (changed) logger.log('VS Code tabs changed payload: ' + changed);
				if (GitGraphView.currentPanel && !doesGitGraphTabExist()) {
					logger.log('VS Code tab tracking found no Git Graph tab, but currentPanel still exists.');
					GitGraphView.recoverOrphanedPanelIfNeeded(logger);
				}
			} catch (error) {
				logger.logError('Unable to summarize VS Code tabs changed event: ' + String(error));
			}
		}));
	}
	if (tabGroups && typeof tabGroups.onDidChangeTabGroups === 'function') {
		context.subscriptions.push(tabGroups.onDidChangeTabGroups((event: any) => {
			try {
				const opened = Array.isArray(event.opened) ? event.opened.length : 0;
				const closed = Array.isArray(event.closed) ? event.closed.length : 0;
				const changed = Array.isArray(event.changed) ? event.changed.length : 0;
				logger.log('VS Code tab groups changed: opened=' + opened + ', closed=' + closed + ', changed=' + changed + ', total=' + tabGroups.all.length);
			} catch (error) {
				logger.logError('Unable to summarize VS Code tab groups changed event: ' + String(error));
			}
		}));
	}
	logger.log('Started Git Graph - Ready to use!');

	extensionState.expireOldCodeReviews();
	onStartUp(context).catch(() => { });
}

/**
 * Deactivate Git Graph.
 */
export function deactivate() { }
