import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
// Refactor note: RepoManager remains a larger façade while scanning/watching/config import logic is being incrementally moved into topic modules.
import { getConfig } from './config';
import { DataSource } from './dataSource';
import { DEFAULT_REPO_STATE, ExtensionState } from './extensionState';
import { Logger } from './logger';
import { applyExternalConfigFile, generateExternalConfigFile, readExternalConfigFile, validateExternalConfigFile, writeExternalConfigFile } from './repo-manager/externalRepoConfig';
import { doesPathExist, getWorkspaceFolderInfoForRepoInclusionMapping, isDirectory } from './repo-manager/workspaceUtils';
import { ErrorInfo, GitRepoSet, GitRepoState } from './types';
import { evalPromises, getPathFromStr, getPathFromUri, getRepoName, pathWithTrailingSlash, realpath, showErrorMessage, showInformationMessage } from './utils';
import { BufferedQueue } from './utils/bufferedQueue';
import { Disposable, toDisposable } from './utils/disposable';
import { Event, EventEmitter } from './utils/event';

export interface RepoChangeEvent {
	readonly repos: GitRepoSet;
	readonly numRepos: number;
	readonly loadRepo: string | null;
}

export { ExternalRepoConfig } from './repo-manager/externalRepoConfig';

/**
 * Detects and manages repositories in Commits.
 */
export class RepoManager extends Disposable {
	private readonly dataSource: DataSource;
	private readonly extensionState: ExtensionState;
	private readonly logger: Logger;

	private repos: GitRepoSet;
	private ignoredRepos: string[];
	private maxDepthOfRepoSearch: number;

	private readonly folderWatchers: { [workspace: string]: vscode.FileSystemWatcher } = {};
	private readonly configWatcher: vscode.FileSystemWatcher;

	private readonly repoEventEmitter: EventEmitter<RepoChangeEvent>;

	private readonly onWatcherCreateQueue: BufferedQueue<string>;
	private readonly onWatcherChangeQueue: BufferedQueue<string>;
	private readonly checkRepoConfigQueue: BufferedQueue<string>;

	/**
	 * Creates the Commits Repository Manager, and runs startup tasks.
	 * @param dataSource The Commits DataSource instance.
	 * @param extensionState The Commits ExtensionState instance.
	 * @param logger The Commits Logger instance.
	 */
	constructor(dataSource: DataSource, extensionState: ExtensionState, onDidChangeConfiguration: Event<vscode.ConfigurationChangeEvent>, logger: Logger) {
		super();
		this.dataSource = dataSource;
		this.extensionState = extensionState;
		this.logger = logger;
		this.repos = extensionState.getRepos();
		this.ignoredRepos = extensionState.getIgnoredRepos();
		this.maxDepthOfRepoSearch = getConfig().maxDepthOfRepoSearch;

		this.configWatcher = vscode.workspace.createFileSystemWatcher('**/.vscode/vscode-an-dr-commits.json');
		this.configWatcher.onDidCreate(this.onConfigWatcherCreateOrChange.bind(this));
		this.configWatcher.onDidChange(this.onConfigWatcherCreateOrChange.bind(this));

		this.repoEventEmitter = new EventEmitter<RepoChangeEvent>();

		this.onWatcherCreateQueue = new BufferedQueue<string>(this.processOnWatcherCreateEvent.bind(this), this.sendRepos.bind(this));
		this.onWatcherChangeQueue = new BufferedQueue<string>(this.processOnWatcherChangeEvent.bind(this), this.sendRepos.bind(this));
		this.checkRepoConfigQueue = new BufferedQueue<string>(this.checkRepoForNewConfig.bind(this), this.sendRepos.bind(this));

		this.startupTasks();

		this.registerDisposables(
			// Monitor changes to the workspace folders to:
			// - search added folders for repositories
			// - remove repositories within deleted folders
			// - apply changes to the order of workspace folders
			vscode.workspace.onDidChangeWorkspaceFolders(async (e) => {
				let changes = false, path;
				if (e.added.length > 0) {
					for (let i = 0; i < e.added.length; i++) {
						path = getPathFromUri(e.added[i].uri);
						if (await this.searchDirectoryForRepos(path, this.maxDepthOfRepoSearch)) changes = true;
						this.startWatchingFolder(path);
					}
				}
				if (e.removed.length > 0) {
					for (let i = 0; i < e.removed.length; i++) {
						path = getPathFromUri(e.removed[i].uri);
						if (this.removeReposWithinFolder(path)) changes = true;
						this.stopWatchingFolder(path);
					}
				}
				if (this.updateReposWorkspaceFolderIndex()) {
					this.extensionState.saveRepos(this.repos);
					changes = true;
				}

				if (changes) {
					this.sendRepos();
				}
			}),

			// Monitor changes to the maxDepthOfRepoSearch Extension Setting, and trigger a new search if needed
			onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration('an-dr-commits.maxDepthOfRepoSearch')) {
					this.maxDepthOfRepoSearchChanged();
				}
			}),

			// Dispose the Repository Event Emitter when disposed
			this.repoEventEmitter,

			// Dispose the configWatcher
			this.configWatcher,

			// Dispose the onWatcherCreateQueue
			this.onWatcherCreateQueue,

			// Dispose the onWatcherChangeQueue
			this.onWatcherChangeQueue,

			// Dispose the checkRepoConfigQueue,
			this.checkRepoConfigQueue,

			// Stop watching folders when disposed
			toDisposable(() => {
				const folders = Object.keys(this.folderWatchers);
				for (let i = 0; i < folders.length; i++) {
					this.stopWatchingFolder(folders[i]);
				}
			})
		);
	}

	/**
	 * Get the Event that can be used to subscribe to updates when the repositories available in Commits change.
	 */
	get onDidChangeRepos() {
		return this.repoEventEmitter.subscribe;
	}

	/**
	 * Apply the new value of `an-dr-commits.maxDepthOfRepoSearch` to the RepoManager.
	 */
	private maxDepthOfRepoSearchChanged() {
		const newDepth = getConfig().maxDepthOfRepoSearch;
		if (newDepth > this.maxDepthOfRepoSearch) {
			this.maxDepthOfRepoSearch = newDepth;
			this.searchWorkspaceForRepos();
		} else {
			this.maxDepthOfRepoSearch = newDepth;
		}
	}

	/**
	 * Run various startup tasks when Commits is activated.
	 */
	private async startupTasks() {
		this.removeReposNotInWorkspace();
		if (this.updateReposWorkspaceFolderIndex()) {
			this.extensionState.saveRepos(this.repos);
		}
		if (!await this.checkReposExist()) {
			// On startup, ensure that sendRepo is called (even if no changes were made)
			this.sendRepos();
		}
		this.checkReposForNewConfig();
		await this.checkReposForNewSubmodules();
		await this.searchWorkspaceForRepos();
		this.startWatchingFolders();
	}

	/**
	 * Remove any repositories that are no longer in the current workspace.
	 */
	private removeReposNotInWorkspace() {
		const workspaceFolderInfo = getWorkspaceFolderInfoForRepoInclusionMapping();
		const rootsExact = workspaceFolderInfo.rootsExact, rootsFolder = workspaceFolderInfo.rootsFolder, repoPaths = Object.keys(this.repos);
		for (let i = 0; i < repoPaths.length; i++) {
			const repoPathFolder = pathWithTrailingSlash(repoPaths[i]);
			if (rootsExact.indexOf(repoPaths[i]) === -1 && !rootsFolder.find(root => repoPaths[i].startsWith(root)) && !rootsExact.find(root => root.startsWith(repoPathFolder))) {
				this.removeRepo(repoPaths[i]);
			}
		}
	}

	/**
	 * Register a new repository with Commits.
	 * @param path The path of the repository.
	 * @param loadRepo If TRUE and the Commits View is visible, load the Commits View with the repository being registered.
	 */
	public registerRepo(path: string, loadRepo: boolean) {
		return new Promise<{ root: string | null, error: string | null }>(async resolve => {
			let root = await this.dataSource.repoRoot(path);
			if (root === null) {
				resolve({ root: null, error: 'The folder "' + path + '" is not a Git repository.' });
			} else if (typeof this.repos[root] !== 'undefined') {
				resolve({ root: null, error: 'The folder "' + path + '" is contained within the known repository "' + root + '".' });
			} else {
				if (this.ignoredRepos.includes(root)) {
					this.ignoredRepos.splice(this.ignoredRepos.indexOf(root), 1);
					this.extensionState.setIgnoredRepos(this.ignoredRepos);
				}
				await this.addRepo(root);
				this.sendRepos(loadRepo ? root : null);
				resolve({ root: root, error: null });
			}
		});
	}

	/**
	 * Ignore a repository known to Commits. Unlike `removeRepo`, ignoring the repository will prevent it from being automatically detected and re-added the next time Visual Studio Code is started.
	 * @param repo The path of the repository.
	 * @returns TRUE => Repository was ignored, FALSE => Repository is not know to Commits.
	 */
	public ignoreRepo(repo: string) {
		if (this.isKnownRepo(repo)) {
			if (!this.ignoredRepos.includes(repo)) this.ignoredRepos.push(repo);
			this.extensionState.setIgnoredRepos(this.ignoredRepos);
			this.removeRepo(repo);
			this.sendRepos();
			return true;
		} else {
			return false;
		}
	}


	/* Repo Management */

	/**
	 * Get a set of all known repositories in the current workspace.
	 * @returns The set of repositories.
	 */
	public getRepos() {
		return Object.assign({}, this.repos);
	}

	/**
	 * Get the number of all known repositories in the current workspace.
	 * @returns The number of repositories.
	 */
	public getNumRepos() {
		return Object.keys(this.repos).length;
	}

	/**
	 * Get the repository that contains the specified file.
	 * @param path The path of the file.
	 * @returns The path of the repository containing the file, or NULL if no known repository contains the file.
	 */
	public getRepoContainingFile(path: string) {
		let repoPaths = Object.keys(this.repos), repo = null;
		for (let i = 0; i < repoPaths.length; i++) {
			if (path.startsWith(pathWithTrailingSlash(repoPaths[i])) && (repo === null || repo.length < repoPaths[i].length)) repo = repoPaths[i];
		}
		return repo;
	}

	/**
	 * Get all known repositories that are contained in the specified folder.
	 * @param path The path of the folder.
	 * @returns An array of the paths of all known repositories contained in the specified folder.
	 */
	private getReposInFolder(path: string) {
		let pathFolder = pathWithTrailingSlash(path), repoPaths = Object.keys(this.repos), reposInFolder: string[] = [];
		for (let i = 0; i < repoPaths.length; i++) {
			if (repoPaths[i] === path || repoPaths[i].startsWith(pathFolder)) reposInFolder.push(repoPaths[i]);
		}
		return reposInFolder;
	}

	/**
	 * Get the path of the known repository matching the specified repository path (checking symbolic links if necessary).
	 * @param repo The path of the repository.
	 * @returns The path of the known repository, or NULL if the specified repository is unknown.
	 */
	public async getKnownRepo(repo: string) {
		if (this.isKnownRepo(repo)) {
			// The path is already known as a repo
			return repo;
		}

		// Check to see if a known repository contains a symlink that resolves the repo
		let canonicalRepo = await realpath(repo);
		let repoPaths = Object.keys(this.repos);
		for (let i = 0; i < repoPaths.length; i++) {
			if (canonicalRepo === (await realpath(repoPaths[i]))) {
				return repoPaths[i];
			}
		}

		// Repo is unknown
		return null;
	}

	/**
	 * Check to see if a repository exactly matches a known repository.
	 * @param repo The path of the repository to check.
	 * @returns TRUE => Known repository, FALSE => Unknown repository.
	 */
	public isKnownRepo(repo: string) {
		return typeof this.repos[repo] !== 'undefined';
	}

	/**
	 * Add a new repository to Commits.
	 * @param repo The path of the repository.
	 * @returns TRUE => The repository was added, FALSE => The repository is ignored and couldn't be added.
	 */
	private async addRepo(repo: string) {
		if (this.ignoredRepos.includes(repo)) {
			return false;
		} else {
			this.repos[repo] = Object.assign({}, DEFAULT_REPO_STATE);
			this.updateReposWorkspaceFolderIndex(repo);
			this.extensionState.saveRepos(this.repos);
			this.logger.log('Added new repo: ' + repo);
			await this.checkRepoForNewConfig(repo, true);
			await this.searchRepoForSubmodules(repo);
			return true;
		}
	}

	/**
	 * Remove a known repository from Commits.
	 * @param repo The path of the repository.
	 */
	private removeRepo(repo: string) {
		this.logger.logDebug('Attempting to remove repo: ' + repo);
		delete this.repos[repo];
		this.extensionState.saveRepos(this.repos);
		this.logger.log('Removed repo: ' + repo);
	}

	/**
	 * Remove all repositories that are contained within the specified folder.
	 * @param path The path of the folder.
	 * @returns TRUE => At least one repository was removed, FALSE => No repositories were removed.
	 */
	private removeReposWithinFolder(path: string) {
		let reposInFolder = this.getReposInFolder(path);
		for (let i = 0; i < reposInFolder.length; i++) {
			this.removeRepo(reposInFolder[i]);
		}
		return reposInFolder.length > 0;
	}

	/**
	 * Checks if the specified path is within a known repository.
	 * @param path The path to check.
	 * @returns TRUE => Path is within a known repository, FALSE => Path isn't within a known repository.
	 */
	private isDirectoryWithinRepos(path: string) {
		let repoPaths = Object.keys(this.repos);
		for (let i = 0; i < repoPaths.length; i++) {
			if (path === repoPaths[i] || path.startsWith(pathWithTrailingSlash(repoPaths[i]))) return true;
		}
		return false;
	}

	/**
	 * Send the latest set of known repositories to subscribers as they have changed.
	 * @param loadRepo The optional path of a repository to load in the Commits View.
	 */
	private sendRepos(loadRepo: string | null = null) {
		this.repoEventEmitter.emit({
			repos: this.getRepos(),
			numRepos: this.getNumRepos(),
			loadRepo: loadRepo
		});
	}

	/**
	 * Check that all known repositories still exist. If they don't, remove them.
	 * @returns TRUE => At least one repository was removed or transferred, FALSE => No repositories were removed.
	 */
	public checkReposExist() {
		let repoPaths = Object.keys(this.repos), changes = false;
		return evalPromises(repoPaths, 3, async (path) => {
			let root = await this.dataSource.repoRoot(path);
			if (root === null) {
				// Retry if repoRoot returns null (could be transient during checkout)
				for (let i = 0; i < 2; i++) {
					await new Promise(resolve => setTimeout(resolve, 200));
					root = await this.dataSource.repoRoot(path);
					if (root !== null) break;
				}
			}
			return root;
		}).then((results) => {
			for (let i = 0; i < repoPaths.length; i++) {
				if (results[i] === null) {
					this.removeRepo(repoPaths[i]);
					changes = true;
				} else if (repoPaths[i] !== results[i]) {
					this.transferRepoState(repoPaths[i], results[i]!);
					changes = true;
				}
			}
		}).catch(() => { }).then(() => {
			if (changes) {
				this.sendRepos();
			}
			return changes;
		});
	}

	/**
	 * Update each repositories workspaceFolderIndex based on the current workspace.
	 * @param repo If provided, only update this specific repository.
	 * @returns TRUE => At least one repository was changed, FALSE => No repositories were changed.
	 */
	private updateReposWorkspaceFolderIndex(repo: string | null = null) {
		const workspaceFolderInfo = getWorkspaceFolderInfoForRepoInclusionMapping();
		const rootsExact = workspaceFolderInfo.rootsExact, rootsFolder = workspaceFolderInfo.rootsFolder, workspaceFolders = workspaceFolderInfo.workspaceFolders;
		const repoPaths = repo !== null && this.isKnownRepo(repo) ? [repo] : Object.keys(this.repos);
		let changes = false, rootIndex: number, workspaceFolderIndex: number | null;
		for (let i = 0; i < repoPaths.length; i++) {
			rootIndex = rootsExact.indexOf(repoPaths[i]);
			if (rootIndex === -1) {
				// Find a workspace folder that contains the repository
				rootIndex = rootsFolder.findIndex((root) => repoPaths[i].startsWith(root));
			}
			if (rootIndex === -1) {
				// Find a workspace folder that is contained within the repository
				const repoPathFolder = pathWithTrailingSlash(repoPaths[i]);
				rootIndex = rootsExact.findIndex((root) => root.startsWith(repoPathFolder));
			}
			workspaceFolderIndex = rootIndex > -1 ? workspaceFolders[rootIndex].index : null;
			if (this.repos[repoPaths[i]].workspaceFolderIndex !== workspaceFolderIndex) {
				this.repos[repoPaths[i]].workspaceFolderIndex = workspaceFolderIndex;
				changes = true;
			}
		}
		return changes;
	}

	/**
	 * Set the state of a known repository.
	 * @param repo The repository the state belongs to.
	 * @param state The state.
	 */
	public setRepoState(repo: string, state: GitRepoState) {
		this.repos[repo] = state;
		this.extensionState.saveRepos(this.repos);
	}

	/**
	 * Transfer the repository state from one known repository to another.
	 * @param oldRepo The repository to transfer the state from.
	 * @param newRepo The repository to transfer the state to.
	 */
	private transferRepoState(oldRepo: string, newRepo: string) {
		this.repos[newRepo] = this.repos[oldRepo];
		delete this.repos[oldRepo];
		this.updateReposWorkspaceFolderIndex(newRepo);
		this.extensionState.saveRepos(this.repos);
		this.extensionState.transferRepo(oldRepo, newRepo);

		this.logger.logDebug('Transferred repo state: ' + oldRepo + ' -> ' + newRepo);
	}


	/* Repo Searching */

	/**
	 * Search all of the current workspace folders for new repositories (and add them).
	 * @returns TRUE => At least one repository was added, FALSE => No repositories were added.
	 */
	public async searchWorkspaceForRepos() {
		this.logger.logDebug('Searching workspace for new repos ...');
		let rootFolders = vscode.workspace.workspaceFolders, changes = false;
		if (typeof rootFolders !== 'undefined') {
			for (let i = 0; i < rootFolders.length; i++) {
				if (await this.searchDirectoryForRepos(getPathFromUri(rootFolders[i].uri), this.maxDepthOfRepoSearch)) changes = true;
			}
		}
		this.logger.logDebug('Completed searching workspace for new repos');
		if (changes) this.sendRepos();
		return changes;
	}

	/**
	 * Search the specified directory for new repositories (and add them).
	 * @param directory The path of the directory to search.
	 * @param maxDepth The maximum depth to recursively search.
	 * @returns TRUE => At least one repository was added, FALSE => No repositories were added.
	 */
	private searchDirectoryForRepos(directory: string, maxDepth: number) {
		return new Promise<boolean>(resolve => {
			if (this.isDirectoryWithinRepos(directory)) {
				resolve(false);
				return;
			}

			this.dataSource.repoRoot(directory).then(async (root) => {
				if (root !== null) {
					resolve(await this.addRepo(root));
				} else if (maxDepth > 0) {
					fs.readdir(directory, async (err, dirContents) => {
						if (err) {
							resolve(false);
						} else {
							let dirs = [];
							for (let i = 0; i < dirContents.length; i++) {
								if (dirContents[i] !== '.git' && await isDirectory(directory + '/' + dirContents[i])) {
									dirs.push(directory + '/' + dirContents[i]);
								}
							}
							resolve((await evalPromises(dirs, 2, dir => this.searchDirectoryForRepos(dir, maxDepth - 1))).indexOf(true) > -1);
						}
					});
				} else {
					resolve(false);
				}
			}).catch(() => resolve(false));
		});
	}

	/**
	 * Check the know repositories for any new submodules (and add them).
	 */
	private async checkReposForNewSubmodules() {
		let repoPaths = Object.keys(this.repos), changes = false;
		for (let i = 0; i < repoPaths.length; i++) {
			if (await this.searchRepoForSubmodules(repoPaths[i])) changes = true;
		}
		if (changes) this.sendRepos();
	}

	/**
	 * Search a repository for any new submodules (and add them).
	 * @param repo The path of the repository to search.
	 * @returns TRUE => At least one submodule was added, FALSE => No submodules were added.
	 */
	private async searchRepoForSubmodules(repo: string) {
		let submodules = await this.dataSource.getSubmodules(repo), changes = false;
		for (let i = 0; i < submodules.length; i++) {
			if (!this.isKnownRepo(submodules[i])) {
				if (await this.addRepo(submodules[i])) changes = true;
			}
		}
		return changes;
	}


	/* Workspace Folder Watching */

	/**
	 * Start watching each of the folders in the current workspace for changes.
	 */
	private startWatchingFolders() {
		let rootFolders = vscode.workspace.workspaceFolders;
		if (typeof rootFolders !== 'undefined') {
			for (let i = 0; i < rootFolders.length; i++) {
				this.startWatchingFolder(getPathFromUri(rootFolders[i].uri));
			}
		}
	}

	/**
	 * Start watching the specified directory for file system events.
	 * @param path The path of the directory.
	 */
	private startWatchingFolder(path: string) {
		const watcher = vscode.workspace.createFileSystemWatcher(path + '/**');
		watcher.onDidCreate(this.onWatcherCreate.bind(this));
		watcher.onDidChange(this.onWatcherChange.bind(this));
		watcher.onDidDelete(this.onWatcherDelete.bind(this));
		this.folderWatchers[path] = watcher;
	}

	/**
	 * Stop watching the specified directory for file system events.
	 * @param path The path of the directory.
	 */
	private stopWatchingFolder(path: string) {
		this.folderWatchers[path].dispose();
		delete this.folderWatchers[path];
	}

	/**
	 * Handle a file system creation event.
	 * @param uri The URI of the creation event.
	 */
	private onWatcherCreate(uri: vscode.Uri) {
		let path = getPathFromUri(uri);
		if (path.indexOf('/.git/') > -1) return;
		if (path.endsWith('/.git')) path = path.slice(0, -5);
		this.onWatcherCreateQueue.enqueue(path);
	}

	/**
	 * Handle a file system change event.
	 * @param uri The URI of the change event.
	 */
	private onWatcherChange(uri: vscode.Uri) {
		let path = getPathFromUri(uri);
		if (path.indexOf('/.git/') > -1) return;
		if (path.endsWith('/.git')) path = path.slice(0, -5);
		this.onWatcherChangeQueue.enqueue(path);
	}

	/**
	 * Handle a file system deletion event.
	 * @param uri The URI of the deletion event.
	 */
	private async onWatcherDelete(uri: vscode.Uri) {
		let path = getPathFromUri(uri);
		this.logger.logDebug('Watcher Delete Event: ' + path);
		if (path.indexOf('/.git/') > -1) return;
		if (path.endsWith('/.git')) path = path.slice(0, -5);

		// Verify that the path really doesn't exist before removing repositories (could be transient during checkout)
		if (await doesPathExist(path)) return;
		for (let i = 0; i < 2; i++) {
			await new Promise(resolve => setTimeout(resolve, 200));
			if (await doesPathExist(path)) return;
		}

		if (this.removeReposWithinFolder(path)) {
			this.logger.log('Removed one or more repos due to watcher delete event at: ' + path);
			this.sendRepos();
		}
	}

	/**
	 * Process a file system creation event.
	 * @param path The path of the file that was created.
	 * @returns TRUE => Change was made. FALSE => No change was made.
	 */
	private async processOnWatcherCreateEvent(path: string) {
		if (await isDirectory(path)) {
			if (await this.searchDirectoryForRepos(path, this.maxDepthOfRepoSearch)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Process a file system change event.
	 * @param path The path of the file that was changed.
	 * @returns TRUE => Change was made. FALSE => No change was made.
	 */
	private async processOnWatcherChangeEvent(path: string) {
		if (!await doesPathExist(path)) {
			// Verify that the path really doesn't exist before removing repositories (could be transient during checkout)
			for (let i = 0; i < 2; i++) {
				await new Promise(resolve => setTimeout(resolve, 200));
				if (await doesPathExist(path)) return false;
			}

			this.logger.logDebug('Watcher Change Event: path does not exist: ' + path);
			if (this.removeReposWithinFolder(path)) {
				this.logger.log('Removed one or more repos due to watcher change event at: ' + path);
				return true;
			}
		}
		return false;
	}


	/* Repository Configuration Management */

	/**
	 * Check the known repositories for new configuration files.
	 */
	private checkReposForNewConfig() {
		Object.keys(this.repos).forEach((repo) => this.checkRepoConfigQueue.enqueue(repo));
	}

	/**
	 * Check to see if the repository has a new configuration file.
	 * @param repo The repository to check.
	 * @param isRepoNew Is the repository new (was it just added)
	 */
	private async checkRepoForNewConfig(repo: string, isRepoNew: boolean = false) {
		try {
			const file = await readExternalConfigFile(repo);
			const state = this.repos[repo];
			if (state && file !== null && typeof file.exportedAt === 'number' && file.exportedAt > state.lastImportAt) {
				const validationError = validateExternalConfigFile(file);
				if (validationError === null) {
					const action = isRepoNew ? 'Yes' : await vscode.window.showInformationMessage('A newer Commits Repository Configuration File has been detected for the repository "' + (state.name || getRepoName(repo)) + '". Would you like to override your current repository configuration with the new changes?', 'Yes', 'No');
					if (this.isKnownRepo(repo) && action) {
						const state = this.repos[repo];
						if (action === 'Yes') {
							applyExternalConfigFile(file, state);
						}
						state.lastImportAt = file.exportedAt;
						this.extensionState.saveRepos(this.repos);
						if (!isRepoNew && action === 'Yes') {
							showInformationMessage('Commits Repository Configuration was successfully imported for the repository "' + (state.name || getRepoName(repo)) + '".');
						}
						return true;
					}
				} else {
					showErrorMessage('The value for "' + validationError + '" in the configuration file "' + getPathFromStr(path.join(repo, '.vscode', 'vscode-an-dr-commits.json')) + '" is invalid.');
				}
			}
		} catch (_) { }
		return false;
	}

	/**
	 * Handle a file system create or change event for a configuration file.
	 * @param uri The URI of the create or change event.
	 */
	private onConfigWatcherCreateOrChange(uri: vscode.Uri) {
		const path = getPathFromUri(uri);
		const repo = this.getRepoContainingFile(path);
		if (repo !== null) {
			this.checkRepoConfigQueue.enqueue(repo);
		}
	}

	/**
	 * Export a repositories configuration.
	 * @param repo The path of the repository to export.
	 * @returns The ErrorInfo produced when performing this action.
	 */
	public exportRepoConfig(repo: string): Promise<ErrorInfo> {
		const file = generateExternalConfigFile(this.repos[repo]);
		return writeExternalConfigFile(repo, file).then((message) => {
			showInformationMessage(message);
			if (this.isKnownRepo(repo)) {
				this.repos[repo].lastImportAt = file.exportedAt!;
				this.extensionState.saveRepos(this.repos);
			}
			return null;
		}, (error) => error);
	}
}
