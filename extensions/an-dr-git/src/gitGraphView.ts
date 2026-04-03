import * as path from 'path';
import * as vscode from 'vscode';
// Refactor note: GitGraphView stays as the stable entrypoint while HTML rendering and message handling are extracted incrementally.
import { AvatarManager } from './avatarManager';
import { getConfig } from './config';
import { DataSource, GitCommitDetailsData, GitConfigKey } from './dataSource';
import { ExtensionState } from './extensionState';
import { Logger } from './logger';
import { RepoFileWatcher } from './repoFileWatcher';
import { RepoManager } from './repoManager';
import { ErrorInfo, GitConfigLocation, GitGraphViewInitialState, GitPushBranchMode, GitRepoSet, LoadGitGraphViewTo, RequestMessage, RequestSidebarBatchRefAction, ResponseMessage, SidebarBatchRefActionTarget, SidebarBatchRefActionType, SidebarBatchRefType, TabIconColourTheme } from './types';
import { UNABLE_TO_FIND_GIT_MSG, UNCOMMITTED, archive, copyFilePathToClipboard, copyToClipboard, createPullRequest, getNonce, openExtensionSettings, openExternalUrl, openFile, showErrorMessage, viewDiff, viewDiffWithWorkingFile, viewFileAtRevision, viewScm } from './utils';
import { Disposable, toDisposable } from './utils/disposable';
import { renderGitGraphWebviewHtml } from './view/webviewHtml';

/**
 * Manages the Git Graph View.
 */
export class GitGraphView extends Disposable {
	public static currentPanel: GitGraphView | undefined;
	private static readonly NAME = 'an-dr: Git';
	public static readonly VIEW_TYPE = 'an-dr-git';

	private static nextInstanceId = 1;

	private readonly panel: vscode.WebviewPanel;
	private readonly extensionPath: string;
	private readonly avatarManager: AvatarManager;
	private readonly dataSource: DataSource;
	private readonly extensionState: ExtensionState;
	private readonly instanceId: number;
	private readonly repoFileWatcher: RepoFileWatcher;
	private readonly repoManager: RepoManager;
	private readonly logger: Logger;
	private isGraphViewLoaded: boolean = false;
	private isPanelVisible: boolean = true;
	private currentRepo: string | null = null;
	private loadViewTo: LoadGitGraphViewTo = null; // Is used by the next call to getHtmlForWebview, and is then reset to null

	private loadRepoInfoRefreshId: number = 0;
	private loadCommitsRefreshId: number = 0;

	/**
	 * If a Git Graph View already exists, show and update it. Otherwise, create a Git Graph View.
	 * @param extensionPath The absolute file path of the directory containing the extension.
	 * @param dataSource The Git Graph DataSource instance.
	 * @param extensionState The Git Graph ExtensionState instance.
	 * @param avatarManger The Git Graph AvatarManager instance.
	 * @param repoManager The Git Graph RepoManager instance.
	 * @param logger The Git Graph Logger instance.
	 * @param loadViewTo What to load the view to.
	 */
	public static createOrShow(extensionPath: string, dataSource: DataSource, extensionState: ExtensionState, avatarManager: AvatarManager, repoManager: RepoManager, logger: Logger, loadViewTo: LoadGitGraphViewTo) {
		const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;

		if (GitGraphView.currentPanel) {
			// If Git Graph panel already exists
			if (GitGraphView.currentPanel.isPanelVisible) {
				// If the Git Graph panel is visible
				if (loadViewTo !== null) {
					GitGraphView.currentPanel.respondLoadRepos(repoManager.getRepos(), loadViewTo);
				}
			} else {
				// If the Git Graph panel is not visible
				GitGraphView.currentPanel.loadViewTo = loadViewTo;
			}
			GitGraphView.currentPanel.panel.reveal(column);
		} else {
			// If Git Graph panel doesn't already exist
			GitGraphView.currentPanel = new GitGraphView(extensionPath, dataSource, extensionState, avatarManager, repoManager, logger, loadViewTo, column);
		}
	}

	public static revive(panel: vscode.WebviewPanel, extensionPath: string, dataSource: DataSource, extensionState: ExtensionState, avatarManager: AvatarManager, repoManager: RepoManager, logger: Logger) {
		if (GitGraphView.currentPanel) {
			GitGraphView.currentPanel.dispose();
		}
		GitGraphView.currentPanel = new GitGraphView(extensionPath, dataSource, extensionState, avatarManager, repoManager, logger, null, panel.viewColumn, panel, true);
	}

	public static recoverOrphanedPanelIfNeeded(logger: Logger) {
		if (!GitGraphView.currentPanel) return;
		logger.logWarning('GitGraphView detected orphaned panel [' + GitGraphView.currentPanel.instanceId + '], disposing stale panel handle.');
		GitGraphView.currentPanel.dispose();
	}

	/**
	 * Creates a Git Graph View.
	 * @param extensionPath The absolute file path of the directory containing the extension.
	 * @param dataSource The Git Graph DataSource instance.
	 * @param extensionState The Git Graph ExtensionState instance.
	 * @param avatarManger The Git Graph AvatarManager instance.
	 * @param repoManager The Git Graph RepoManager instance.
	 * @param logger The Git Graph Logger instance.
	 * @param loadViewTo What to load the view to.
	 * @param column The column the view should be loaded in.
	 */
	private constructor(extensionPath: string, dataSource: DataSource, extensionState: ExtensionState, avatarManager: AvatarManager, repoManager: RepoManager, logger: Logger, loadViewTo: LoadGitGraphViewTo, column: vscode.ViewColumn | undefined, existingPanel?: vscode.WebviewPanel, restoredFromSerializer: boolean = false) {
		super();
		this.extensionPath = extensionPath;
		this.avatarManager = avatarManager;
		this.dataSource = dataSource;
		this.extensionState = extensionState;
		this.instanceId = GitGraphView.nextInstanceId++;
		this.repoManager = repoManager;
		this.logger = logger;
		this.loadViewTo = loadViewTo;

		const config = getConfig();
		if (existingPanel) {
			this.panel = existingPanel;
			this.panel.webview.options = {
				enableScripts: true,
				localResourceRoots: [vscode.Uri.file(path.join(extensionPath, 'media'))]
			};
		} else {
			this.panel = vscode.window.createWebviewPanel(GitGraphView.VIEW_TYPE, GitGraphView.NAME, column || vscode.ViewColumn.One, {
				enableScripts: true,
				localResourceRoots: [vscode.Uri.file(path.join(extensionPath, 'media'))],
				retainContextWhenHidden: config.retainContextWhenHidden
			});
			// Keep the Git Graph tab pinned so branch checkouts that reload editors don't replace it.
			void vscode.commands.executeCommand('workbench.action.keepEditor');
		}
		this.extensionState.setReopenGitGraphOnStartup(true);
		this.isPanelVisible = this.panel.visible;
		this.panel.iconPath = config.tabIconColourTheme === TabIconColourTheme.Colour
			? this.getResourcesUri('webview-icon.svg')
			: {
				light: this.getResourcesUri('webview-icon-light.svg'),
				dark: this.getResourcesUri('webview-icon-dark.svg')
			};


		this.registerDisposables(
			// Dispose Git Graph View resources when disposed
			toDisposable(() => {
				GitGraphView.currentPanel = undefined;
				this.repoFileWatcher.stop();
			}),

			// Dispose this Git Graph View when the Webview Panel is disposed
			this.panel.onDidDispose(() => {
				this.extensionState.setReopenGitGraphOnStartup(false);
				this.dispose();
			}),

			// Register a callback that is called when the view is shown or hidden
			this.panel.onDidChangeViewState(() => {
				if (this.panel.visible !== this.isPanelVisible) {
					if (this.panel.visible) {
						if (this.panel.webview.html.trim().length === 0) {
							this.update();
						} else {
							this.respondLoadRepos(this.repoManager.getRepos(), this.loadViewTo);
							this.loadViewTo = null;
							this.sendMessage({ command: 'refresh' });
						}
					} else {
						this.repoFileWatcher.stop();
					}
					this.isPanelVisible = this.panel.visible;
				}
			}),

			// Subscribe to events triggered when a repository is added or deleted from Git Graph
			repoManager.onDidChangeRepos((event) => {
				if (!this.panel.visible) return;
				const loadViewTo = event.loadRepo !== null ? { repo: event.loadRepo } : null;
				if ((event.numRepos === 0 && this.isGraphViewLoaded) || (event.numRepos > 0 && !this.isGraphViewLoaded)) {
					this.loadViewTo = loadViewTo;
					this.update();
				} else {
					this.respondLoadRepos(event.repos, loadViewTo);
				}
			}),

			// Subscribe to events triggered when an avatar is available
			avatarManager.onAvatar((event) => {
				this.sendMessage({
					command: 'fetchAvatar',
					email: event.email,
					image: event.image
				});
			}),

			// Respond to messages sent from the Webview
			this.panel.webview.onDidReceiveMessage((msg) => this.respondToMessage(msg)),

			// Dispose the Webview Panel when disposed
			this.panel
		);

		// Instantiate a RepoFileWatcher that watches for file changes in the repository currently open in the Git Graph View
		this.repoFileWatcher = new RepoFileWatcher(logger, () => {
			if (this.panel.visible) {
				this.sendMessage({ command: 'refresh' });
			}
		});

		// Render the content of the Webview
		this.update();

		this.logger.log((restoredFromSerializer ? 'Restored' : 'Created') + ' Git Graph View [' + this.instanceId + ']' + (loadViewTo !== null ? ' (active repo: ' + loadViewTo.repo + ')' : ''));
	}

	/**
	 * Respond to a message sent from the front-end.
	 * @param msg The message that was received.
	 */
	private async respondToMessage(msg: RequestMessage) {
		this.repoFileWatcher.mute();
		let errorInfos: ErrorInfo[];

		switch (msg.command) {
			case 'addRemote':
				this.sendMessage({
					command: 'addRemote',
					error: await this.dataSource.addRemote(msg.repo, msg.name, msg.url, msg.pushUrl, msg.fetch)
				});
				break;
			case 'addTag':
				errorInfos = [await this.dataSource.addTag(msg.repo, msg.tagName, msg.commitHash, msg.type, msg.message, msg.force)];
				if (errorInfos[0] === null && msg.pushToRemote !== null) {
					errorInfos.push(...await this.dataSource.pushTag(msg.repo, msg.tagName, [msg.pushToRemote], msg.commitHash, msg.pushSkipRemoteCheck));
				}
				this.sendMessage({
					command: 'addTag',
					repo: msg.repo,
					tagName: msg.tagName,
					pushToRemote: msg.pushToRemote,
					commitHash: msg.commitHash,
					errors: errorInfos
				});
				break;
			case 'applyStash':
				this.sendMessage({
					command: 'applyStash',
					error: await this.dataSource.applyStash(msg.repo, msg.selector, msg.reinstateIndex)
				});
				break;
			case 'branchFromStash':
				this.sendMessage({
					command: 'branchFromStash',
					error: await this.dataSource.branchFromStash(msg.repo, msg.selector, msg.branchName)
				});
				break;
			case 'checkoutBranch':
				this.logger.log('Processing checkoutBranch command for repo: ' + msg.repo + ', branch: ' + msg.branchName);
				errorInfos = [await this.dataSource.checkoutBranch(msg.repo, msg.branchName, msg.remoteBranch)];
				if (errorInfos[0] === null && msg.pullAfterwards !== null) {
					errorInfos.push(await this.dataSource.pullBranch(msg.repo, msg.pullAfterwards.branchName, msg.pullAfterwards.remote, msg.pullAfterwards.createNewCommit, msg.pullAfterwards.squash));
				}
				this.sendMessage({
					command: 'checkoutBranch',
					pullAfterwards: msg.pullAfterwards,
					errors: errorInfos
				});
				this.logger.log('Finished checkoutBranch command.');
				break;
			case 'checkoutCommit':
				this.logger.log('Processing checkoutCommit command for repo: ' + msg.repo + ', commit: ' + msg.commitHash);
				const checkoutCommitError = await this.dataSource.checkoutCommit(msg.repo, msg.commitHash);
				this.sendMessage({
					command: 'checkoutCommit',
					error: checkoutCommitError
				});
				this.logger.log('Finished checkoutCommit command.');
				break;
			case 'cherrypickCommit':
				errorInfos = [await this.dataSource.cherrypickCommit(msg.repo, msg.commitHash, msg.parentIndex, msg.recordOrigin, msg.noCommit)];
				if (errorInfos[0] === null && msg.noCommit) {
					errorInfos.push(await viewScm());
				}
				this.sendMessage({ command: 'cherrypickCommit', errors: errorInfos });
				break;
			case 'cleanUntrackedFiles':
				this.sendMessage({
					command: 'cleanUntrackedFiles',
					error: await this.dataSource.cleanUntrackedFiles(msg.repo, msg.directories)
				});
				break;
			case 'commitDetails':
				let data = await Promise.all<GitCommitDetailsData, string | null>([
					msg.commitHash === UNCOMMITTED
						? this.dataSource.getUncommittedDetails(msg.repo)
						: msg.stash === null
							? this.dataSource.getCommitDetails(msg.repo, msg.commitHash, msg.hasParents)
							: this.dataSource.getStashDetails(msg.repo, msg.commitHash, msg.stash),
					msg.avatarEmail !== null ? this.avatarManager.getAvatarImage(msg.avatarEmail) : Promise.resolve(null)
				]);
				this.sendMessage({
					command: 'commitDetails',
					...data[0],
					avatar: data[1],
					codeReview: msg.commitHash !== UNCOMMITTED ? this.extensionState.getCodeReview(msg.repo, msg.commitHash) : null,
					refresh: msg.refresh
				});
				break;
			case 'compareCommits':
				this.sendMessage({
					command: 'compareCommits',
					commitHash: msg.commitHash,
					compareWithHash: msg.compareWithHash,
					...await this.dataSource.getCommitComparison(msg.repo, msg.fromHash, msg.toHash),
					codeReview: msg.toHash !== UNCOMMITTED ? this.extensionState.getCodeReview(msg.repo, msg.fromHash + '-' + msg.toHash) : null,
					refresh: msg.refresh
				});
				break;
			case 'copyFilePath':
				this.sendMessage({
					command: 'copyFilePath',
					error: await copyFilePathToClipboard(msg.repo, msg.filePath, msg.absolute)
				});
				break;
			case 'copyToClipboard':
				this.sendMessage({
					command: 'copyToClipboard',
					type: msg.type,
					error: await copyToClipboard(msg.data)
				});
				break;
			case 'createArchive':
				this.sendMessage({
					command: 'createArchive',
					error: await archive(msg.repo, msg.ref, this.dataSource)
				});
				break;
			case 'createBranch':
				this.sendMessage({
					command: 'createBranch',
					errors: await this.dataSource.createBranch(msg.repo, msg.branchName, msg.commitHash, msg.checkout, msg.force)
				});
				break;
			case 'createPullRequest':
				errorInfos = [msg.push ? await this.dataSource.pushBranch(msg.repo, msg.sourceBranch, msg.sourceRemote, true, GitPushBranchMode.Normal) : null];
				if (errorInfos[0] === null) {
					errorInfos.push(await createPullRequest(msg.config, msg.sourceOwner, msg.sourceRepo, msg.sourceBranch));
				}
				this.sendMessage({
					command: 'createPullRequest',
					push: msg.push,
					errors: errorInfos
				});
				break;
			case 'cleanupLocalBranches':
				this.sendMessage({
					command: 'cleanupLocalBranches',
					branchNames: msg.branchNames,
					errors: await this.dataSource.cleanupLocalBranches(msg.repo, msg.branchNames, msg.forceDelete)
				});
				break;
			case 'deleteBranch':
				errorInfos = [await this.dataSource.deleteBranch(msg.repo, msg.branchName, msg.forceDelete)];
				if (errorInfos[0] === null) {
					for (let i = 0; i < msg.deleteOnRemotes.length; i++) {
						errorInfos.push(await this.dataSource.deleteRemoteBranch(msg.repo, msg.branchName, msg.deleteOnRemotes[i]));
					}
				}
				this.sendMessage({
					command: 'deleteBranch',
					repo: msg.repo,
					branchName: msg.branchName,
					deleteOnRemotes: msg.deleteOnRemotes,
					errors: errorInfos
				});
				break;
			case 'deleteRemote':
				this.sendMessage({
					command: 'deleteRemote',
					error: await this.dataSource.deleteRemote(msg.repo, msg.name)
				});
				break;
			case 'deleteRemoteBranch':
				this.sendMessage({
					command: 'deleteRemoteBranch',
					error: await this.dataSource.deleteRemoteBranch(msg.repo, msg.branchName, msg.remote)
				});
				break;
			case 'deleteTag':
				this.sendMessage({
					command: 'deleteTag',
					error: await this.dataSource.deleteTag(msg.repo, msg.tagName, msg.deleteOnRemote)
				});
				break;
			case 'deleteUserDetails':
				errorInfos = [];
				if (msg.name) {
					errorInfos.push(await this.dataSource.unsetConfigValue(msg.repo, GitConfigKey.UserName, msg.location));
				}
				if (msg.email) {
					errorInfos.push(await this.dataSource.unsetConfigValue(msg.repo, GitConfigKey.UserEmail, msg.location));
				}
				this.sendMessage({
					command: 'deleteUserDetails',
					errors: errorInfos
				});
				break;
			case 'dropCommit':
				this.sendMessage({
					command: 'dropCommit',
					error: await this.dataSource.dropCommit(msg.repo, msg.commitHash)
				});
				break;
			case 'rewordCommit':
				const rewordCommitMessage = await this.dataSource.promptForRewordCommitMessage(msg.repo, msg.commitHash);
				if (rewordCommitMessage.error !== null || rewordCommitMessage.message === null) {
					this.sendMessage({
						command: 'rewordCommit',
						error: rewordCommitMessage.error
					});
					break;
				}
				this.sendMessage({
					command: 'rewordCommit',
					error: await this.dataSource.rewordCommit(msg.repo, msg.commitHash, rewordCommitMessage.message)
				});
				break;
			case 'editCommitAuthor':
				this.sendMessage({
					command: 'editCommitAuthor',
					error: await this.dataSource.editCommitAuthor(msg.repo, msg.commitHash, msg.name, msg.email)
				});
				break;
			case 'squashCommits':
				const squashCommitMessage = await this.dataSource.promptForSquashCommitMessage(msg.repo, msg.commitHashes);
				if (squashCommitMessage.error !== null || squashCommitMessage.message === null) {
					this.sendMessage({
						command: 'squashCommits',
						error: squashCommitMessage.error
					});
					break;
				}
				this.sendMessage({
					command: 'squashCommits',
					error: await this.dataSource.squashCommits(msg.repo, msg.commitHashes, squashCommitMessage.message)
				});
				break;
			case 'dropStash':
				this.sendMessage({
					command: 'dropStash',
					error: await this.dataSource.dropStash(msg.repo, msg.selector)
				});
				break;
			case 'editRemote':
				this.sendMessage({
					command: 'editRemote',
					error: await this.dataSource.editRemote(msg.repo, msg.nameOld, msg.nameNew, msg.urlOld, msg.urlNew, msg.pushUrlOld, msg.pushUrlNew)
				});
				break;
			case 'editUserDetails':
				errorInfos = [
					await this.dataSource.setConfigValue(msg.repo, GitConfigKey.UserName, msg.name, msg.location),
					await this.dataSource.setConfigValue(msg.repo, GitConfigKey.UserEmail, msg.email, msg.location)
				];
				if (errorInfos[0] === null && errorInfos[1] === null) {
					if (msg.deleteLocalName) {
						errorInfos.push(await this.dataSource.unsetConfigValue(msg.repo, GitConfigKey.UserName, GitConfigLocation.Local));
					}
					if (msg.deleteLocalEmail) {
						errorInfos.push(await this.dataSource.unsetConfigValue(msg.repo, GitConfigKey.UserEmail, GitConfigLocation.Local));
					}
				}
				this.sendMessage({
					command: 'editUserDetails',
					errors: errorInfos
				});
				break;
			case 'endCodeReview':
				this.extensionState.endCodeReview(msg.repo, msg.id);
				break;
			case 'exportRepoConfig':
				this.sendMessage({
					command: 'exportRepoConfig',
					error: await this.repoManager.exportRepoConfig(msg.repo)
				});
				break;
			case 'fetch':
				this.sendMessage({
					command: 'fetch',
					error: await this.dataSource.fetch(msg.repo, msg.name, msg.prune, msg.pruneTags)
				});
				break;
			case 'fetchAvatar':
				this.avatarManager.fetchAvatarImage(msg.email, msg.repo, msg.remote, msg.commits);
				break;
			case 'fetchIntoLocalBranch':
				this.sendMessage({
					command: 'fetchIntoLocalBranch',
					error: await this.dataSource.fetchIntoLocalBranch(msg.repo, msg.remote, msg.remoteBranch, msg.localBranch, msg.force)
				});
				break;
			case 'loadCommits':
				this.loadCommitsRefreshId = msg.refreshId;
				this.sendMessage({
					command: 'loadCommits',
					refreshId: msg.refreshId,
					onlyFollowFirstParent: msg.onlyFollowFirstParent,
					...await this.dataSource.getCommits(msg.repo, msg.branches, msg.maxCommits, msg.showTags, msg.showRemoteBranches, msg.includeCommitsMentionedByReflogs, msg.onlyFollowFirstParent, msg.commitOrdering, msg.remotes, msg.hideRemotes, msg.stashes)
				});
				break;
			case 'loadConfig':
				this.sendMessage({
					command: 'loadConfig',
					repo: msg.repo,
					...await this.dataSource.getConfig(msg.repo, msg.remotes)
				});
				break;
			case 'loadRepoInfo':
				this.loadRepoInfoRefreshId = msg.refreshId;
				let repoInfo = await this.dataSource.getRepoInfo(msg.repo, msg.showRemoteBranches, msg.showStashes, msg.hideRemotes), isRepo = true;
				if (repoInfo.error) {
					// If an error occurred, check to make sure the repo still exists
					let root = await this.dataSource.repoRoot(msg.repo);
					if (root === null) {
						// Retry if repoRoot returns null (could be transient during checkout)
						for (let i = 0; i < 2; i++) {
							await new Promise(resolve => setTimeout(resolve, 200));
							root = await this.dataSource.repoRoot(msg.repo);
							if (root !== null) break;
						}
					}
					isRepo = root !== null;
					if (!isRepo) repoInfo.error = null; // If the error is caused by the repo no longer existing, clear the error message
				}
				this.sendMessage({
					command: 'loadRepoInfo',
					refreshId: msg.refreshId,
					...repoInfo,
					isRepo: isRepo
				});
				if (msg.repo !== this.currentRepo) {
					this.currentRepo = msg.repo;
					this.extensionState.setLastActiveRepo(msg.repo);
					this.repoFileWatcher.start(msg.repo);
				}
				break;
			case 'loadRepos':
				if (!msg.check || !await this.repoManager.checkReposExist()) {
					// If not required to check repos, or no changes were found when checking, respond with repos
					this.respondLoadRepos(this.repoManager.getRepos(), null);
				} else {
					this.logger.logDebug('RepoManager.checkReposExist() returned true during loadRepos command.');
				}
				break;
			case 'merge':
				this.sendMessage({
					command: 'merge',
					actionOn: msg.actionOn,
					error: await this.dataSource.merge(msg.repo, msg.obj, msg.actionOn, msg.createNewCommit, msg.squash, msg.noCommit)
				});
				break;
			case 'openExtensionSettings':
				this.sendMessage({
					command: 'openExtensionSettings',
					error: await openExtensionSettings()
				});
				break;
			case 'openExternalDirDiff':
				this.sendMessage({
					command: 'openExternalDirDiff',
					error: await this.dataSource.openExternalDirDiff(msg.repo, msg.fromHash, msg.toHash, msg.isGui)
				});
				break;
			case 'openExternalUrl':
				this.sendMessage({
					command: 'openExternalUrl',
					error: await openExternalUrl(msg.url)
				});
				break;
			case 'openFile':
				this.sendMessage({
					command: 'openFile',
					error: await openFile(msg.repo, msg.filePath, msg.hash, this.dataSource)
				});
				break;
			case 'popStash':
				this.sendMessage({
					command: 'popStash',
					error: await this.dataSource.popStash(msg.repo, msg.selector, msg.reinstateIndex)
				});
				break;
			case 'pruneRemote':
				this.sendMessage({
					command: 'pruneRemote',
					error: await this.dataSource.pruneRemote(msg.repo, msg.name)
				});
				break;
			case 'setRemoteDefaultBranch':
				this.sendMessage({
					command: 'setRemoteDefaultBranch',
					error: await this.dataSource.setRemoteDefaultBranch(msg.repo, msg.remote, msg.branch)
				});
				break;
			case 'pullBranch':
				this.sendMessage({
					command: 'pullBranch',
					error: await this.dataSource.pullBranch(msg.repo, msg.branchName, msg.remote, msg.createNewCommit, msg.squash)
				});
				break;
			case 'pushBranch':
				this.sendMessage({
					command: 'pushBranch',
					willUpdateBranchConfig: msg.willUpdateBranchConfig,
					errors: await this.dataSource.pushBranchToMultipleRemotes(msg.repo, msg.branchName, msg.remotes, msg.setUpstream, msg.mode)
				});
				break;
			case 'pushStash':
				this.sendMessage({
					command: 'pushStash',
					error: await this.dataSource.pushStash(msg.repo, msg.message, msg.includeUntracked)
				});
				break;
			case 'pushTag':
				this.sendMessage({
					command: 'pushTag',
					repo: msg.repo,
					tagName: msg.tagName,
					remotes: msg.remotes,
					commitHash: msg.commitHash,
					errors: await this.dataSource.pushTag(msg.repo, msg.tagName, msg.remotes, msg.commitHash, msg.skipRemoteCheck)
				});
				break;
			case 'rebase':
				this.sendMessage({
					command: 'rebase',
					actionOn: msg.actionOn,
					interactive: msg.interactive,
					error: await this.dataSource.rebase(msg.repo, msg.obj, msg.actionOn, msg.ignoreDate, msg.interactive)
				});
				break;
			case 'repoInProgressAction':
				this.sendMessage({
					command: 'repoInProgressAction',
					action: msg.action,
					error: await this.dataSource.repoInProgressAction(msg.repo, msg.state, msg.action)
				});
				break;
			case 'renameBranch':
				this.sendMessage({
					command: 'renameBranch',
					error: await this.dataSource.renameBranch(msg.repo, msg.oldName, msg.newName)
				});
				break;
			case 'rescanForRepos':
				if (!(await this.repoManager.searchWorkspaceForRepos())) {
					showErrorMessage('No Git repositories were found in the current workspace.');
				}
				break;
			case 'resetFileToRevision':
				this.sendMessage({
					command: 'resetFileToRevision',
					error: await this.dataSource.resetFileToRevision(msg.repo, msg.commitHash, msg.filePath)
				});
				break;
			case 'resetToCommit':
				this.sendMessage({
					command: 'resetToCommit',
					error: await this.dataSource.resetToCommit(msg.repo, msg.commit, msg.resetMode)
				});
				break;
			case 'revertCommit':
				this.sendMessage({
					command: 'revertCommit',
					error: await this.dataSource.revertCommit(msg.repo, msg.commitHash, msg.parentIndex)
				});
				break;
			case 'setGlobalViewState':
				this.sendMessage({
					command: 'setGlobalViewState',
					error: await this.extensionState.setGlobalViewState(msg.state)
				});
				break;
			case 'setColumnVisibility':
				let setColumnVisibilityError: ErrorInfo = null;
				try {
					await vscode.workspace.getConfiguration('an-dr-git').update('repository.commits.columnVisibility', {
						Committed: msg.visibility.committed,
						ID: msg.visibility.id
					}, vscode.ConfigurationTarget.Global);
				} catch (e) {
					setColumnVisibilityError = e instanceof Error ? e.message : 'Unable to update setting "an-dr-git.repository.commits.columnVisibility".';
				}
				this.sendMessage({
					command: 'setColumnVisibility',
					error: setColumnVisibilityError
				});
				break;
			case 'setRepoState':
				this.repoManager.setRepoState(msg.repo, msg.state);
				break;
			case 'setWorkspaceViewState':
				this.sendMessage({
					command: 'setWorkspaceViewState',
					error: await this.extensionState.setWorkspaceViewState(msg.state)
				});
				break;
			case 'sidebarBatchRefAction':
				this.sendMessage({
					command: 'sidebarBatchRefAction',
					action: msg.action,
					results: await this.executeSidebarBatchRefAction(msg)
				});
				break;
			case 'showErrorMessage':
				showErrorMessage(msg.message);
				break;
			case 'startCodeReview':
				this.sendMessage({
					command: 'startCodeReview',
					commitHash: msg.commitHash,
					compareWithHash: msg.compareWithHash,
					...await this.extensionState.startCodeReview(msg.repo, msg.id, msg.files, msg.lastViewedFile)
				});
				break;
			case 'tagDetails':
				this.sendMessage({
					command: 'tagDetails',
					tagName: msg.tagName,
					commitHash: msg.commitHash,
					...await this.dataSource.getTagDetails(msg.repo, msg.tagName)
				});
				break;
			case 'resolveSidebarTagContext':
				this.sendMessage({
					command: 'resolveSidebarTagContext',
					requestId: msg.requestId,
					tagName: msg.tagName,
					...await this.dataSource.getTagContext(msg.repo, msg.tagName)
				});
				break;
			case 'updateCodeReview':
				this.sendMessage({
					command: 'updateCodeReview',
					error: await this.extensionState.updateCodeReview(msg.repo, msg.id, msg.remainingFiles, msg.lastViewedFile)
				});
				break;
			case 'viewDiff':
				this.sendMessage({
					command: 'viewDiff',
					error: await viewDiff(msg.repo, msg.fromHash, msg.toHash, msg.oldFilePath, msg.newFilePath, msg.type)
				});
				break;
			case 'viewDiffWithWorkingFile':
				this.sendMessage({
					command: 'viewDiffWithWorkingFile',
					error: await viewDiffWithWorkingFile(msg.repo, msg.hash, msg.filePath, this.dataSource)
				});
				break;
			case 'viewFileAtRevision':
				this.sendMessage({
					command: 'viewFileAtRevision',
					error: await viewFileAtRevision(msg.repo, msg.hash, msg.filePath)
				});
				break;
			case 'viewScm':
				this.sendMessage({
					command: 'viewScm',
					error: await viewScm()
				});
				break;
		}

		this.repoFileWatcher.unmute();
	}

	private async executeSidebarBatchRefAction(msg: RequestSidebarBatchRefAction): Promise<ReadonlyArray<{ type: SidebarBatchRefType, name: string, error: ErrorInfo }>> {
		const results: { type: SidebarBatchRefType, name: string, error: ErrorInfo }[] = [];
		for (let i = 0; i < msg.refs.length; i++) {
			const ref = msg.refs[i];
			results.push({
				type: ref.type,
				name: this.getSidebarBatchRefDisplayName(ref),
				error: await this.executeSidebarBatchRefActionForRef(msg, ref)
			});
		}
		return results;
	}

	private async executeSidebarBatchRefActionForRef(msg: RequestSidebarBatchRefAction, ref: SidebarBatchRefActionTarget): Promise<ErrorInfo> {
		switch (msg.action) {
			case SidebarBatchRefActionType.Delete:
				if (ref.type === SidebarBatchRefType.LocalBranch) {
					return this.dataSource.deleteBranch(msg.repo, ref.name, false);
				}
				if (ref.type === SidebarBatchRefType.RemoteBranch) {
					if (ref.remote === null) return 'Unable to delete remote branch: Missing remote name.';
					return this.dataSource.deleteRemoteBranch(msg.repo, ref.name, ref.remote);
				}
				if (ref.type === SidebarBatchRefType.Tag) {
					return this.dataSource.deleteTag(msg.repo, ref.name, null);
				}
				break;

			case SidebarBatchRefActionType.Push:
				if (ref.type === SidebarBatchRefType.LocalBranch) {
					const errors = await this.dataSource.pushBranchToMultipleRemotes(msg.repo, ref.name, <string[]>msg.remotes, msg.setUpstream, msg.pushMode);
					return this.reduceSequentialCommandErrors(errors);
				}
				if (ref.type === SidebarBatchRefType.Tag) {
					if (ref.hash === null) return 'Unable to push tag "' + ref.name + '": Missing resolved tag hash.';
					const errors = await this.dataSource.pushTag(msg.repo, ref.name, <string[]>msg.remotes, ref.hash, msg.skipRemoteCheck);
					return this.reduceSequentialCommandErrors(errors);
				}
				return 'Push is not supported for the selected remote-tracking branch "' + this.getSidebarBatchRefDisplayName(ref) + '".';

			case SidebarBatchRefActionType.Archive:
				if (ref.type === SidebarBatchRefType.RemoteBranch) {
					if (ref.remote === null) return 'Unable to create archive: Missing remote name.';
					return archive(msg.repo, ref.remote + '/' + ref.name, this.dataSource);
				}
				return archive(msg.repo, ref.name, this.dataSource);
		}

		return 'Unsupported sidebar batch action.';
	}

	private getSidebarBatchRefDisplayName(ref: SidebarBatchRefActionTarget) {
		return ref.type === SidebarBatchRefType.RemoteBranch && ref.remote !== null ? ref.remote + '/' + ref.name : ref.name;
	}

	private reduceSequentialCommandErrors(errors: ErrorInfo[]): ErrorInfo {
		for (let i = 0; i < errors.length; i++) {
			if (errors[i] !== null) return errors[i];
		}
		return null;
	}

	/**
	 * Send a message to the front-end.
	 * @param msg The message to be sent.
	 */
	private sendMessage(msg: ResponseMessage) {
		if (this.isDisposed()) {
			this.logger.logDebug('The Git Graph View has already been disposed, ignored sending "' + msg.command + '" message.');
		} else {
			this.panel.webview.postMessage(msg).then(
				() => { },
				() => {
					if (this.isDisposed()) {
						this.logger.logDebug('The Git Graph View was disposed while sending "' + msg.command + '" message.');
					} else {
						this.logger.logError('Unable to send "' + msg.command + '" message to the Git Graph View.');
					}
				}
			);
		}
	}

	/**
	 * Update the HTML document loaded in the Webview.
	 */
	private update() {
		this.panel.webview.html = this.getHtmlForWebview();
	}

	/**
	 * Get the HTML document to be loaded in the Webview.
	 * @returns The HTML.
	 */
	private getHtmlForWebview() {
		const config = getConfig(), nonce = getNonce();
		const initialState: GitGraphViewInitialState = {
			config: {
				avatarMode: config.authorAvatarMode,
				avatarSize: config.authorAvatarSize,
				avatarShape: config.authorAvatarShape,
				committedVisual: config.committedVisual,
				branchPanel: config.branchPanel,
				commitDetailsView: config.commitDetailsView,
				commitOrdering: config.commitOrder,
				commitsColumnVisibility: config.commitsColumnVisibility,
				contextMenuActionsVisibility: config.contextMenuActionsVisibility,
				customBranchGlobPatterns: config.customBranchGlobPatterns,
				customEmojiShortcodeMappings: config.customEmojiShortcodeMappings,
				customPullRequestProviders: config.customPullRequestProviders,
				dateFormat: config.dateFormat,
				dialogDefaults: config.dialogDefaults,
				enhancedAccessibility: config.enhancedAccessibility,
				fetchAndPrune: config.fetchAndPrune,
				fetchAndPruneTags: config.fetchAndPruneTags,
				fetchAvatars: config.fetchAvatars && this.extensionState.isAvatarStorageAvailable(),
				graph: config.graph,
				includeCommitsMentionedByReflogs: config.includeCommitsMentionedByReflogs,
				initialLoadCommits: config.initialLoadCommits,
				keybindings: config.keybindings,
				loadMoreCommits: config.loadMoreCommits,
				loadMoreCommitsAutomatically: config.loadMoreCommitsAutomatically,
				markdown: config.markdown,
				mute: config.muteCommits,
				onlyFollowFirstParent: config.onlyFollowFirstParent,
				onRepoLoad: config.onRepoLoad,
				referenceLabels: config.referenceLabels,
				repoDropdownOrder: config.repoDropdownOrder,
				showRemoteBranches: config.showRemoteBranches,
				showStashes: config.showStashes,
				showTags: config.showTags
			},
			lastActiveRepo: this.extensionState.getLastActiveRepo(),
			loadViewTo: this.loadViewTo,
			repos: this.repoManager.getRepos(),
			loadRepoInfoRefreshId: this.loadRepoInfoRefreshId,
			loadCommitsRefreshId: this.loadCommitsRefreshId
		};
		const globalState = this.extensionState.getGlobalViewState();
		const workspaceState = this.extensionState.getWorkspaceViewState();
		const html = renderGitGraphWebviewHtml({
			panel: this.panel,
			nonce: nonce,
			viewName: GitGraphView.NAME,
			gitExecutableUnknown: this.dataSource.isGitExecutableUnknown(),
			initialState: initialState,
			globalState: globalState,
			workspaceState: workspaceState,
			unableToFindGitMessage: UNABLE_TO_FIND_GIT_MSG,
			mediaCssUri: this.getMediaUri('out.min.css'),
			mediaJsUri: this.getMediaUri('out.min.js')
		});
		this.isGraphViewLoaded = html.isGraphViewLoaded;
		this.loadViewTo = null;
		return html.html;
	}


	/* URI Manipulation Methods */

	/**
	 * Get a WebviewUri for a media file included in the extension.
	 * @param file The file name in the `media` directory.
	 * @returns The WebviewUri.
	 */
	private getMediaUri(file: string) {
		return this.panel.webview.asWebviewUri(this.getUri('media', file));
	}

	/**
	 * Get a File Uri for a resource file included in the extension.
	 * @param file The file name in the `resource` directory.
	 * @returns The Uri.
	 */
	private getResourcesUri(file: string) {
		return this.getUri('resources', file);
	}

	/**
	 * Get a File Uri for a file included in the extension.
	 * @param pathComps The path components relative to the root directory of the extension.
	 * @returns The File Uri.
	 */
	private getUri(...pathComps: string[]) {
		return vscode.Uri.file(path.join(this.extensionPath, ...pathComps));
	}


	/* Response Construction Methods */

	/**
	 * Send the known repositories to the front-end.
	 * @param repos The set of known repositories.
	 * @param loadViewTo What to load the view to.
	 */
	private respondLoadRepos(repos: GitRepoSet, loadViewTo: LoadGitGraphViewTo) {
		this.sendMessage({
			command: 'loadRepos',
			repos: repos,
			lastActiveRepo: this.extensionState.getLastActiveRepo(),
			loadViewTo: loadViewTo
		});
	}

}

export { standardiseCspSource } from './view/webviewHtml';
