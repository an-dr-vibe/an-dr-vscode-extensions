import * as os from 'os';
import * as vscode from 'vscode';
import { AvatarManager } from './avatarManager';
import { getConfig } from './config';
import { DataSource } from './dataSource';
import { DiffDocProvider, decodeDiffDocUri } from './diffDocProvider';
import { ExtensionState } from './extensionState';
import { CommitsView } from './commitsView';
import { Logger } from './logger';
import { RepoManager } from './repoManager';
import { GitExecutable, UNABLE_TO_FIND_GIT_MSG, VsCodeVersionRequirement, copyToClipboard, doesVersionMeetRequirement, getExtensionVersion, getPathFromUri, getRepoName, getSortedRepositoryPaths, isPathInWorkspace, openFile, resolveToSymbolicPath, showErrorMessage, showInformationMessage } from './utils';
import { Disposable } from './utils/disposable';
import { Event } from './utils/event';

/**
 * Manages the registration and execution of Commits Commands.
 */
export class CommandManager extends Disposable {
	private readonly context: vscode.ExtensionContext;
	private readonly avatarManager: AvatarManager;
	private readonly dataSource: DataSource;
	private readonly extensionState: ExtensionState;
	private readonly logger: Logger;
	private readonly repoManager: RepoManager;
	private gitExecutable: GitExecutable | null;

	/**
	 * Creates the Commits Command Manager.
	 * @param extensionPath The absolute file path of the directory containing the extension.
	 * @param avatarManger The Commits AvatarManager instance.
	 * @param dataSource The Commits DataSource instance.
	 * @param extensionState The Commits ExtensionState instance.
	 * @param repoManager The Commits RepoManager instance.
	 * @param gitExecutable The Git executable available to Commits at startup.
	 * @param onDidChangeGitExecutable The Event emitting the Git executable for Commits to use.
	 * @param logger The Commits Logger instance.
	 */
	constructor(context: vscode.ExtensionContext, avatarManger: AvatarManager, dataSource: DataSource, extensionState: ExtensionState, repoManager: RepoManager, gitExecutable: GitExecutable | null, onDidChangeGitExecutable: Event<GitExecutable>, logger: Logger) {
		super();
		this.context = context;
		this.avatarManager = avatarManger;
		this.dataSource = dataSource;
		this.extensionState = extensionState;
		this.logger = logger;
		this.repoManager = repoManager;
		this.gitExecutable = gitExecutable;

		// Register Extension Commands
		this.registerCommand('an-dr-commits.view', (arg) => this.view(arg));
		this.registerCommand('an-dr-commits.addGitRepository', () => this.addGitRepository());
		this.registerCommand('an-dr-commits.removeGitRepository', () => this.removeGitRepository());
		this.registerCommand('an-dr-commits.clearAvatarCache', () => this.clearAvatarCache());
		this.registerCommand('an-dr-commits.fetch', () => this.fetch());
		this.registerCommand('an-dr-commits.pull', () => this.pullFromScm());
		this.registerCommand('an-dr-commits.push', () => this.pushFromScm());
		this.registerCommand('an-dr-commits.version', () => this.version());
		this.registerCommand('an-dr-commits.openFile', (arg) => this.openFile(arg));

		this.registerDisposable(
			onDidChangeGitExecutable((gitExecutable) => {
				this.gitExecutable = gitExecutable;
			})
		);

		// Register Extension Contexts
		try {
			this.registerContext('an-dr-commits:codiconsSupported', doesVersionMeetRequirement(vscode.version, VsCodeVersionRequirement.Codicons));
		} catch (_) {
			this.logger.logError('Unable to set Visual Studio Code Context "an-dr-commits:codiconsSupported"');
		}
	}

	/**
	 * Register a Commits command with Visual Studio Code.
	 * @param command A unique identifier for the command.
	 * @param callback A command handler function.
	 */
	private registerCommand(command: string, callback: (...args: any[]) => any) {
		this.registerDisposable(
			vscode.commands.registerCommand(command, (...args: any[]) => {
				this.logger.logDebug('Command Invoked: ' + command);
				callback(...args);
			})
		);
	}

	/**
	 * Register a context with Visual Studio Code.
	 * @param key The Context Key.
	 * @param value The Context Value.
	 */
	private registerContext(key: string, value: any) {
		return vscode.commands.executeCommand('setContext', key, value).then(
			() => this.logger.logDebug('Successfully set Visual Studio Code Context "' + key + '" to "' + JSON.stringify(value) + '"'),
			() => this.logger.logError('Failed to set Visual Studio Code Context "' + key + '" to "' + JSON.stringify(value) + '"')
		);
	}


	/* Commands */

	/**
	 * The method run when the `an-dr-commits.view` command is invoked.
	 * @param arg An optional argument passed to the command (when invoked from the Visual Studio Code Git Extension).
	 */
	private async view(arg: any) {
		let loadRepo: string | null = null;

		if (typeof arg === 'object' && arg.rootUri) {
			// If command is run from the Visual Studio Code Source Control View, load the specific repo
			const repoPath = getPathFromUri(arg.rootUri);
			loadRepo = await this.repoManager.getKnownRepo(repoPath);
			if (loadRepo === null) {
				// The repo is not currently known, add it
				loadRepo = (await this.repoManager.registerRepo(await resolveToSymbolicPath(repoPath), true)).root;
			}
		} else if (getConfig().openToTheRepoOfTheActiveTextEditorDocument && vscode.window.activeTextEditor) {
			// If the config setting is enabled, load the repo containing the active text editor document
			loadRepo = this.repoManager.getRepoContainingFile(getPathFromUri(vscode.window.activeTextEditor.document.uri));
		}

		CommitsView.createOrShow(this.context.extensionPath, this.dataSource, this.extensionState, this.avatarManager, this.repoManager, this.logger, loadRepo !== null ? { repo: loadRepo } : null);
	}

	/**
	 * The method run when the `an-dr-commits.addGitRepository` command is invoked.
	 */
	private addGitRepository() {
		if (this.gitExecutable === null) {
			showErrorMessage(UNABLE_TO_FIND_GIT_MSG);
			return;
		}

		vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false }).then(uris => {
			if (uris && uris.length > 0) {
				let path = getPathFromUri(uris[0]);
				if (isPathInWorkspace(path)) {
					this.repoManager.registerRepo(path, false).then(status => {
						if (status.error === null) {
							showInformationMessage('The repository "' + status.root! + '" was added to Commits.');
						} else {
							showErrorMessage(status.error + ' Therefore it could not be added to Commits.');
						}
					});
				} else {
					showErrorMessage('The folder "' + path + '" is not within the opened Visual Studio Code workspace, and therefore could not be added to Commits.');
				}
			}
		}, () => { });
	}

	/**
	 * The method run when the `an-dr-commits.removeGitRepository` command is invoked.
	 */
	private removeGitRepository() {
		if (this.gitExecutable === null) {
			showErrorMessage(UNABLE_TO_FIND_GIT_MSG);
			return;
		}

		const repos = this.repoManager.getRepos();
		const items: vscode.QuickPickItem[] = getSortedRepositoryPaths(repos, getConfig().repoDropdownOrder).map((path) => ({
			label: repos[path].name || getRepoName(path),
			description: path
		}));

		vscode.window.showQuickPick(items, {
			placeHolder: 'Select a repository to remove from Commits:',
			canPickMany: false
		}).then((item) => {
			if (item && item.description !== undefined) {
				if (this.repoManager.ignoreRepo(item.description)) {
					showInformationMessage('The repository "' + item.label + '" was removed from Commits.');
				} else {
					showErrorMessage('The repository "' + item.label + '" is not known to Commits.');
				}
			}
		}, () => { });
	}

	/**
	 * The method run when the `an-dr-commits.clearAvatarCache` command is invoked.
	 */
	private clearAvatarCache() {
		this.avatarManager.clearCache().then((errorInfo) => {
			if (errorInfo === null) {
				showInformationMessage('The Avatar Cache was successfully cleared.');
			} else {
				showErrorMessage(errorInfo);
			}
		}, () => {
			showErrorMessage('An unexpected error occurred while running the command "Clear Avatar Cache".');
		});
	}

	/**
	 * The method run when the `an-dr-commits.fetch` command is invoked.
	 */
	private async fetch() {
		const selectedRepo = await this.getSelectedSourceControlRepo();
		if (selectedRepo !== null) {
			CommitsView.createOrShow(this.context.extensionPath, this.dataSource, this.extensionState, this.avatarManager, this.repoManager, this.logger, {
				repo: selectedRepo,
				runCommandOnLoad: 'fetch'
			});
			return;
		}

		const repos = this.repoManager.getRepos();
		const repoPaths = getSortedRepositoryPaths(repos, getConfig().repoDropdownOrder);

		if (repoPaths.length > 1) {
			const items: vscode.QuickPickItem[] = repoPaths.map((path) => ({
				label: repos[path].name || getRepoName(path),
				description: path
			}));

			const lastActiveRepo = this.extensionState.getLastActiveRepo();
			if (lastActiveRepo !== null) {
				let lastActiveRepoIndex = items.findIndex((item) => item.description === lastActiveRepo);
				if (lastActiveRepoIndex > -1) {
					const item = items.splice(lastActiveRepoIndex, 1)[0];
					items.unshift(item);
				}
			}

			vscode.window.showQuickPick(items, {
				placeHolder: 'Select the repository you want to open in Commits, and fetch from remote(s):',
				canPickMany: false
			}).then((item) => {
				if (item && item.description) {
					CommitsView.createOrShow(this.context.extensionPath, this.dataSource, this.extensionState, this.avatarManager, this.repoManager, this.logger, {
						repo: item.description,
						runCommandOnLoad: 'fetch'
					});
				}
			}, () => {
				showErrorMessage('An unexpected error occurred while running the command "Fetch from Remote(s)".');
			});
		} else if (repoPaths.length === 1) {
			CommitsView.createOrShow(this.context.extensionPath, this.dataSource, this.extensionState, this.avatarManager, this.repoManager, this.logger, {
				repo: repoPaths[0],
				runCommandOnLoad: 'fetch'
			});
		} else {
			CommitsView.createOrShow(this.context.extensionPath, this.dataSource, this.extensionState, this.avatarManager, this.repoManager, this.logger, null);
		}
	}

	/**
	 * The method run when the `an-dr-commits.pull` command is invoked from the SCM panel.
	 */
	private async pullFromScm() {
		await this.openViewWithCommand('pull', 'Pull Current Branch');
	}

	/**
	 * The method run when the `an-dr-commits.push` command is invoked from the SCM panel.
	 */
	private async pushFromScm() {
		await this.openViewWithCommand('push', 'Push Current Branch');
	}

	/**
	 * Helper: opens the Commits view for a single-repo or lets the user pick, then fires a command on load.
	 */
	private async openViewWithCommand(command: 'pull' | 'push', actionLabel: string) {
		const selectedRepo = await this.getSelectedSourceControlRepo();
		if (selectedRepo !== null) {
			CommitsView.createOrShow(this.context.extensionPath, this.dataSource, this.extensionState, this.avatarManager, this.repoManager, this.logger, {
				repo: selectedRepo,
				runCommandOnLoad: command
			});
			return;
		}

		const repos = this.repoManager.getRepos();
		const repoPaths = getSortedRepositoryPaths(repos, getConfig().repoDropdownOrder);

		if (repoPaths.length > 1) {
			const items: vscode.QuickPickItem[] = repoPaths.map((path) => ({
				label: repos[path].name || getRepoName(path),
				description: path
			}));

			const lastActiveRepo = this.extensionState.getLastActiveRepo();
			if (lastActiveRepo !== null) {
				const idx = items.findIndex((item) => item.description === lastActiveRepo);
				if (idx > -1) items.unshift(items.splice(idx, 1)[0]);
			}

			vscode.window.showQuickPick(items, {
				placeHolder: 'Select the repository to open in Commits and ' + actionLabel.toLowerCase() + ':',
				canPickMany: false
			}).then((item) => {
				if (item && item.description) {
					CommitsView.createOrShow(this.context.extensionPath, this.dataSource, this.extensionState, this.avatarManager, this.repoManager, this.logger, {
						repo: item.description,
						runCommandOnLoad: command
					});
				}
			}, () => {
				showErrorMessage('An unexpected error occurred while running the command "' + actionLabel + '".');
			});
		} else if (repoPaths.length === 1) {
			CommitsView.createOrShow(this.context.extensionPath, this.dataSource, this.extensionState, this.avatarManager, this.repoManager, this.logger, {
				repo: repoPaths[0],
				runCommandOnLoad: command
			});
		} else {
			CommitsView.createOrShow(this.context.extensionPath, this.dataSource, this.extensionState, this.avatarManager, this.repoManager, this.logger, null);
		}
	}

	private async getSelectedSourceControlRepo() {
		const gitExtension = vscode.extensions.getExtension<any>('vscode.git');
		if (!gitExtension) return null;

		const api = gitExtension.isActive ? gitExtension.exports.getAPI(1) : (await gitExtension.activate()).getAPI(1);
		if (!api || !Array.isArray(api.repositories)) return null;

		const selectedRepoPath = api.repositories.find((repo: any) => repo?.ui?.selected)?.rootUri?.fsPath;
		if (typeof selectedRepoPath !== 'string' || selectedRepoPath.length === 0) return null;

		let knownRepo = await this.repoManager.getKnownRepo(selectedRepoPath);
		if (knownRepo === null && isPathInWorkspace(selectedRepoPath)) {
			const registerResult = await this.repoManager.registerRepo(await resolveToSymbolicPath(selectedRepoPath), false);
			knownRepo = registerResult.root;
		}

		return knownRepo;
	}

	/**
	 * The method run when the `an-dr-commits.version` command is invoked.
	 */
	private async version() {
		try {
			const commitsVersion = await getExtensionVersion(this.context);
			const information = 'Commits: ' + commitsVersion + '\nVisual Studio Code: ' + vscode.version + '\nOS: ' + os.type() + ' ' + os.arch() + ' ' + os.release() + '\nGit: ' + (this.gitExecutable !== null ? this.gitExecutable.version : '(none)');
			vscode.window.showInformationMessage(information, { modal: true }, 'Copy').then((selectedItem) => {
				if (selectedItem === 'Copy') {
					copyToClipboard(information).then((result) => {
						if (result !== null) {
							showErrorMessage(result);
						}
					});
				}
			}, () => { });
		} catch (_) {
			showErrorMessage('An unexpected error occurred while retrieving version information.');
		}
	}

	/**
	 * Opens a file in Visual Studio Code, based on a Commits URI (from the Diff View).
	 * The method run when the `an-dr-commits.openFile` command is invoked.
	 * @param arg The Commits URI.
	 */
	private openFile(arg?: vscode.Uri) {
		const uri = arg || vscode.window.activeTextEditor?.document.uri;
		if (typeof uri === 'object' && uri && uri.scheme === DiffDocProvider.scheme) {
			// A Commits URI has been provided
			const request = decodeDiffDocUri(uri);
			return openFile(request.repo, request.filePath, request.commit, this.dataSource, vscode.ViewColumn.Active).then((errorInfo) => {
				if (errorInfo !== null) {
					return showErrorMessage('Unable to Open File: ' + errorInfo);
				}
			});
		} else {
			return showErrorMessage('Unable to Open File: The command was not called with the required arguments.');
		}
	}


}
