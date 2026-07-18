import * as vscode from 'vscode';
import { AvatarManager } from './avatarManager';
import { CommandId } from './commandIds';
import { CommandManager } from './commands';
import { getConfig } from './config';
import { DataSource } from './dataSource';
import { DiffDocProvider } from './diffDocProvider';
import { ExtensionState } from './extensionState';
import { GitStatusMonitor } from './gitStatusMonitor';
import { InlineBlameController } from './inlineBlame';
import { onStartUp } from './life-cycle/startup';
import { Logger } from './logger';
import { RepoManager } from './repoManager';
import { StatusBarItem } from './statusBarItem';
import { GitExecutable, UNABLE_TO_FIND_GIT_MSG, findGit, getGitExecutableFromPaths, showErrorMessage, showInformationMessage } from './utils';
import { EventEmitter } from './utils/event';
import { RepoSelectionEvent } from './views/common/repoSelection';
import { SidebarView } from './views/sidebar/sidebarView';
import { TabView } from './views/tab/tabView';

export interface ActivatedCore {
	executeCommand: (command: CommandId, ...args: any[]) => any;
	ensureGit: () => Promise<void>;
	ensureRepositories: () => Promise<void>;
	resolveSidebar: (webviewView: any) => void;
	reviveTab: (panel: vscode.WebviewPanel, state: unknown) => void;
	provideDiffDocument: (uri: vscode.Uri) => vscode.ProviderResult<string>;
}

/** Load the Git-backed implementation after the lightweight activation shell has returned. */
export function activateCore(context: vscode.ExtensionContext): ActivatedCore {
	const logger = new Logger();
	logger.log('Starting Commits core ...');
	const gitExecutableEmitter = new EventEmitter<GitExecutable>();
	const onDidChangeGitExecutable = gitExecutableEmitter.subscribe;
	const extensionState = new ExtensionState(context, onDidChangeGitExecutable);
	const whenGitExecutableResolved = findGit(extensionState).then((gitExecutable) => {
		gitExecutableEmitter.emit(gitExecutable);
		logger.log('Using ' + gitExecutable.path + ' (version: ' + gitExecutable.version + ')');
	}, () => {
		showErrorMessage(UNABLE_TO_FIND_GIT_MSG);
		logger.logError(UNABLE_TO_FIND_GIT_MSG);
	});
	const configurationEmitter = new EventEmitter<vscode.ConfigurationChangeEvent>();
	const onDidChangeConfiguration = configurationEmitter.subscribe;
	const dataSource = new DataSource(whenGitExecutableResolved, onDidChangeConfiguration, onDidChangeGitExecutable, logger);
	const avatarManager = new AvatarManager(dataSource, extensionState, logger);
	const repoManager = new RepoManager(dataSource, extensionState, onDidChangeConfiguration, logger);
	const repoSelectionEmitter = new EventEmitter<RepoSelectionEvent>();
	const statusMonitor = new GitStatusMonitor(dataSource, extensionState, repoManager, repoSelectionEmitter.subscribe, logger);
	const statusBarItem = new StatusBarItem(repoManager.getNumRepos(), repoManager.onDidChangeRepos, statusMonitor, onDidChangeConfiguration, logger);
	TabView.configureRepoSelectionSync(repoSelectionEmitter.subscribe, (event) => repoSelectionEmitter.emit(event));
	const sidebarView = new SidebarView(context, dataSource, extensionState, repoManager, statusMonitor, repoSelectionEmitter.subscribe, (event) => repoSelectionEmitter.emit(event), false);
	const inlineBlameController = new InlineBlameController(dataSource, repoManager, statusBarItem, onDidChangeConfiguration, logger);
	const commandManager = new CommandManager(context, avatarManager, dataSource, extensionState, repoManager, statusMonitor, null, onDidChangeGitExecutable, logger, false);
	const diffDocProvider = new DiffDocProvider(dataSource);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration('an-dr-commits')) {
				configurationEmitter.emit(event);
			} else if (event.affectsConfiguration('git.path')) {
				const paths = getConfig().gitPaths;
				if (paths.length === 0) return;
				getGitExecutableFromPaths(paths).then((gitExecutable) => {
					gitExecutableEmitter.emit(gitExecutable);
					const msg = 'Commits is now using ' + gitExecutable.path + ' (version: ' + gitExecutable.version + ')';
					showInformationMessage(msg);
					logger.log(msg);
					void repoManager.searchWorkspaceForRepos();
				}, () => {
					const msg = 'The new value of "git.path" ("' + paths.join('", "') + '") does not ' + (paths.length > 1 ? 'contain a string that matches' : 'match') + ' the path and filename of a valid Git executable.';
					showErrorMessage(msg);
					logger.logError(msg);
				});
			}
		}),
		diffDocProvider, commandManager, statusBarItem, statusMonitor, repoSelectionEmitter,
		sidebarView, inlineBlameController, repoManager, avatarManager, dataSource,
		configurationEmitter, extensionState, gitExecutableEmitter, logger
	);

	void onStartUp(context).catch(() => { });
	inlineBlameController.refresh();
	logger.log('Started Commits core - Ready to use!');

	return {
		executeCommand(command, ...args) {
			logger.logDebug('Command Invoked: ' + command);
			return commandManager.execute(command, ...args);
		},
		ensureGit() {
			return whenGitExecutableResolved;
		},
		ensureRepositories() {
			return repoManager.ensureReady();
		},
		resolveSidebar(webviewView) {
			sidebarView.resolveWebviewView(webviewView);
		},
		reviveTab(panel, state) {
			logger.logDebug('Deserializing Commits webview panel...');
			TabView.revive(panel, state, context.extensionPath, dataSource, extensionState, avatarManager, repoManager, logger);
		},
		provideDiffDocument(uri) {
			return diffDocProvider.provideTextDocumentContent(uri);
		}
	};
}
