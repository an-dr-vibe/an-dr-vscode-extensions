import * as path from 'path';
import * as vscode from 'vscode';
import { AvatarManager } from '../../avatarManager';
import { getConfig } from '../../config';
import { DataSource } from '../../dataSource';
import { ExtensionState } from '../../extensionState';
import { Logger } from '../../logger';
import { RepoFileWatcher } from '../../repoFileWatcher';
import { RepoManager } from '../../repoManager';
import { CommitsViewInitialState, GitRepoSet, LoadCommitsViewTo, RequestMessage, ResponseMessage, TabIconColourTheme } from '../../types';
import { UNABLE_TO_FIND_GIT_MSG, getNonce, isPathInWorkspace, resolveToSymbolicPath } from '../../utils';
import { Disposable, toDisposable } from '../../utils/disposable';
import { Event } from '../../utils/event';
import { renderCommitsWebviewHtml } from './webviewHtml';
import { getMatchingTabs, isMatchingWebviewTab } from '../../editorTabUtils';
import { RepoSelectionEvent } from '../common/repoSelection';
import { RepoLifecycleActionContext, handleExportRepoConfig, handleLoadCommits, handleLoadConfig, handleLoadRepoInfo, handleLoadRepos, handleRepoInProgressAction, handleRescanForRepos, handleSetColumnVisibility, handleSetGlobalViewState, handleSetRepoState, handleSetWorkspaceViewState } from './repoLifecycleActions';
import { BranchRemoteActionContext, handleAddRemote, handleCheckoutBranch, handleCleanupLocalBranches, handleCreateBranch, handleCreatePullRequest, handleDeleteBranch, handleDeleteRemote, handleDeleteRemoteBranch, handleEditRemote, handleFetch, handleFetchIntoLocalBranch, handleMerge, handlePruneRemote, handlePullBranch, handlePullBranchWithStash, handlePushBranch, handleRebase, handleRenameBranch, handleSetBranchUpstream, handleSetRemoteDefaultBranch, handleUnsetBranchUpstream } from './branchRemoteActions';
import { TagStashActionContext, handleAddTag, handleApplyStash, handleBranchFromStash, handleDeleteTag, handleDropStash, handlePopStash, handlePushStash, handlePushTag, handleResolveSidebarTagContext, handleTagDetails } from './tagStashActions';
import { CommitGraphActionContext, handleCheckoutCommit, handleCherrypickCommit, handleCommitDetails, handleCompareCommits, handleDropCommit, handleEditCommitAuthor, handleResetToCommit, handleResetToHead, handleRevertCommit, handleRewordCommit, handleSidebarBatchRefAction, handleSquashCommits } from './commitGraphActions';
import { DiffFileContentActionContext, handleAddToGitignore, handleCopyFilePath, handleCopyToClipboard, handleCreateArchive, handleGetFileDiff, handleGetFullDiffContent, handleOpenExternalDirDiff, handleOpenFile, handleResetFileToRevision, handleViewDiff, handleViewDiffWithWorkingFile, handleViewFileAtRevision } from './diffFileContentActions';
import { WorkingTreeActionContext, handleCleanUntrackedFiles, handleCommitChanges, handleDiscardFileChanges, handleLoadWorkingTreeChanges, handleStageFiles, handleUnstageFiles } from './workingTreeActions';
import { MiscActionContext, handleDeleteUserDetails, handleEditUserDetails, handleFetchAvatar, handleOpenExtensionSettings, handleOpenExternalUrl, handleSendToCodeReview, handleShowErrorMessage, handleViewScm } from './miscActions';
import { loadFileIcons } from './fileIcons';

/**
 * Manages the Commits View.
 */
export class TabView extends Disposable {
	public static currentPanel: TabView | undefined;
	private static readonly NAME = 'Commits';
	public static readonly VIEW_TYPE = 'an-dr-commits';

	private static nextInstanceId = 1;
	private static onDidChangeRepoSelection: Event<RepoSelectionEvent> | null = null;
	private static emitRepoSelection: ((event: RepoSelectionEvent) => void) | null = null;

	/**
	 * Connects the Commits tab to the extension-level repository selection bus.
	 */
	public static configureRepoSelectionSync(onDidChangeRepoSelection: Event<RepoSelectionEvent>, emitRepoSelection: (event: RepoSelectionEvent) => void) {
		TabView.onDidChangeRepoSelection = onDidChangeRepoSelection;
		TabView.emitRepoSelection = emitRepoSelection;
	}

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
	private sourceControlRepos: Set<string> | null = null;
	private loadViewTo: LoadCommitsViewTo = null; // Is used by the next call to getHtmlForWebview, and is then reset to null

	private loadRepoInfoRefreshId: number = 0;
	private loadCommitsRefreshId: number = 0;
	private messageHandlerChain: Promise<void> = Promise.resolve();
	private readonly repoLifecycleCtx: RepoLifecycleActionContext;
	private readonly branchRemoteCtx: BranchRemoteActionContext;
	private readonly tagStashCtx: TagStashActionContext;
	private readonly commitGraphCtx: CommitGraphActionContext;
	private readonly diffFileContentCtx: DiffFileContentActionContext;
	private readonly workingTreeCtx: WorkingTreeActionContext;
	private readonly miscCtx: MiscActionContext;

	/**
	 * If a Commits View already exists, show and update it. Otherwise, create a Commits View.
	 * @param extensionPath The absolute file path of the directory containing the extension.
	 * @param dataSource The Commits DataSource instance.
	 * @param extensionState The Commits ExtensionState instance.
	 * @param avatarManger The Commits AvatarManager instance.
	 * @param repoManager The Commits RepoManager instance.
	 * @param logger The Commits Logger instance.
	 * @param loadViewTo What to load the view to.
	 */
	public static async createOrShow(extensionPath: string, dataSource: DataSource, extensionState: ExtensionState, avatarManager: AvatarManager, repoManager: RepoManager, logger: Logger, loadViewTo: LoadCommitsViewTo) {
		const column = vscode.window.activeTextEditor ? vscode.window.activeTextEditor.viewColumn : undefined;
		if (TabView.currentPanel) {
			// If Commits panel already exists
			if (TabView.currentPanel.isPanelVisible) {
				// If the Commits panel is visible
				if (loadViewTo !== null) {
					TabView.currentPanel.respondLoadRepos(repoManager.getRepos(), loadViewTo);
				}
			} else {
				// If the Commits panel is not visible
				TabView.currentPanel.loadViewTo = loadViewTo;
			}
			TabView.currentPanel.panel.reveal(column);
		} else {
			// If Commits panel doesn't already exist
			const tabGroups = (vscode.window as any).tabGroups;
			if (tabGroups && typeof tabGroups.close === 'function') {
				const commitsTabViewTypes = new Set([TabView.VIEW_TYPE, 'mainThreadWebview-' + TabView.VIEW_TYPE]);
				const matchingTabs = getMatchingTabs(tabGroups, (tab) => isMatchingWebviewTab(tab, commitsTabViewTypes, TabView.NAME));
				if (matchingTabs.length > 0) {
					try {
						await tabGroups.close(matchingTabs, true);
						logger.logWarning('Closed ' + matchingTabs.length + ' existing Commits tab' + (matchingTabs.length === 1 ? '' : 's') + ' before creating a new panel.');
					} catch (error) {
						logger.logError('Unable to close existing Commits tabs before creating a new panel: ' + String(error));
					}
				}
			}
			TabView.currentPanel = new TabView(extensionPath, dataSource, extensionState, avatarManager, repoManager, logger, loadViewTo, column);
		}
	}

	public static revive(panel: vscode.WebviewPanel, extensionPath: string, dataSource: DataSource, extensionState: ExtensionState, avatarManager: AvatarManager, repoManager: RepoManager, logger: Logger) {
		if (TabView.currentPanel) {
			TabView.currentPanel.dispose();
		}
		TabView.currentPanel = new TabView(extensionPath, dataSource, extensionState, avatarManager, repoManager, logger, null, panel.viewColumn, panel, true);
	}

	public static recoverOrphanedPanelIfNeeded(logger: Logger) {
		if (!TabView.currentPanel) return;
		logger.logWarning('TabView detected orphaned panel [' + TabView.currentPanel.instanceId + '], disposing stale panel handle.');
		TabView.currentPanel.dispose();
	}

	/**
	 * Creates a Commits View.
	 * @param extensionPath The absolute file path of the directory containing the extension.
	 * @param dataSource The Commits DataSource instance.
	 * @param extensionState The Commits ExtensionState instance.
	 * @param avatarManger The Commits AvatarManager instance.
	 * @param repoManager The Commits RepoManager instance.
	 * @param logger The Commits Logger instance.
	 * @param loadViewTo What to load the view to.
	 * @param column The column the view should be loaded in.
	 */
	private constructor(extensionPath: string, dataSource: DataSource, extensionState: ExtensionState, avatarManager: AvatarManager, repoManager: RepoManager, logger: Logger, loadViewTo: LoadCommitsViewTo, column: vscode.ViewColumn | undefined, existingPanel?: vscode.WebviewPanel, restoredFromSerializer: boolean = false) {
		super();
		this.extensionPath = extensionPath;
		this.avatarManager = avatarManager;
		this.dataSource = dataSource;
		this.extensionState = extensionState;
		this.instanceId = TabView.nextInstanceId++;
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
			this.panel = vscode.window.createWebviewPanel(TabView.VIEW_TYPE, TabView.NAME, column || vscode.ViewColumn.One, {
				enableScripts: true,
				localResourceRoots: [vscode.Uri.file(path.join(extensionPath, 'media'))],
				retainContextWhenHidden: config.retainContextWhenHidden
			});
			// Keep the Commits tab pinned so branch checkouts that reload editors don't replace it.
			void vscode.commands.executeCommand('workbench.action.keepEditor');
		}
		this.extensionState.setReopenCommitsOnStartup(true);
		this.isPanelVisible = this.panel.visible;
		this.panel.iconPath = config.tabIconColourTheme === TabIconColourTheme.Colour
			? this.getResourcesUri('webview-icon.svg')
			: {
				light: this.getResourcesUri('webview-icon-light.svg'),
				dark: this.getResourcesUri('webview-icon-dark.svg')
			};


		this.registerDisposables(
			// Dispose Commits View resources when disposed
			toDisposable(() => {
				TabView.currentPanel = undefined;
				this.repoFileWatcher.stop();
			}),

			// Dispose this Commits View when the Webview Panel is disposed
			this.panel.onDidDispose(() => {
				this.extensionState.setReopenCommitsOnStartup(false);
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

			// Subscribe to events triggered when a repository is added or deleted from Commits
			repoManager.onDidChangeRepos((event) => {
				if (!this.panel.visible) return;
				const visibleRepos = this.getVisibleRepos(event.repos);
				const numVisibleRepos = Object.keys(visibleRepos).length;
				const loadViewTo = event.loadRepo !== null ? { repo: event.loadRepo } : null;
				if ((numVisibleRepos === 0 && this.isGraphViewLoaded) || (numVisibleRepos > 0 && !this.isGraphViewLoaded)) {
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
			// Chain each handler on the previous one so only one runs at a time, preventing
			// concurrent git operations from racing for index.lock.
			this.panel.webview.onDidReceiveMessage((msg) => {
				this.messageHandlerChain = this.messageHandlerChain.then(() => this.respondToMessage(msg));
			}),

			TabView.onDidChangeRepoSelection !== null
				? TabView.onDidChangeRepoSelection((event) => {
					if (event.source !== 'commits') void this.loadRepoFromSharedSelection(event.repo);
				})
				: toDisposable(() => { }),

			// Dispose the Webview Panel when disposed
			this.panel
		);

		// Instantiate a RepoFileWatcher that watches for file changes in the repository currently open in the Commits View
		this.repoFileWatcher = new RepoFileWatcher(logger, () => {
			if (this.panel.visible) {
				this.sendMessage({ command: 'refresh' });
			}
		});

		this.repoLifecycleCtx = {
			dataSource: this.dataSource,
			repoManager: this.repoManager,
			extensionState: this.extensionState,
			logger: this.logger,
			repoFileWatcher: this.repoFileWatcher,
			sendMessage: (msg) => this.sendMessage(msg),
			respondLoadRepos: (repos, loadViewTo) => this.respondLoadRepos(repos, loadViewTo),
			getCurrentRepo: () => this.currentRepo,
			setCurrentRepo: (repo) => { this.currentRepo = repo; },
			setLoadRepoInfoRefreshId: (id) => { this.loadRepoInfoRefreshId = id; },
			setLoadCommitsRefreshId: (id) => { this.loadCommitsRefreshId = id; },
			emitRepoSelection: (repo) => {
				if (TabView.emitRepoSelection !== null) {
					TabView.emitRepoSelection({ repo, source: 'commits' });
				}
			}
		};

		this.branchRemoteCtx = {
			dataSource: this.dataSource,
			logger: this.logger,
			sendMessage: (msg) => this.sendMessage(msg)
		};

		this.tagStashCtx = {
			dataSource: this.dataSource,
			sendMessage: (msg) => this.sendMessage(msg)
		};

		this.commitGraphCtx = {
			dataSource: this.dataSource,
			avatarManager: this.avatarManager,
			logger: this.logger,
			sendMessage: (msg) => this.sendMessage(msg)
		};

		this.diffFileContentCtx = {
			dataSource: this.dataSource,
			sendMessage: (msg) => this.sendMessage(msg)
		};

		this.workingTreeCtx = {
			dataSource: this.dataSource,
			repoManager: this.repoManager,
			sendMessage: (msg) => this.sendMessage(msg),
			respondLoadRepos: (repos, loadViewTo) => this.respondLoadRepos(repos, loadViewTo)
		};

		this.miscCtx = {
			dataSource: this.dataSource,
			avatarManager: this.avatarManager,
			sendMessage: (msg) => this.sendMessage(msg)
		};

		// Also hook into VS Code's built-in Git extension to catch commits made via the native SCM panel.
		// This handles cases where the file watcher is muted or misses events from external git operations.
		this.setupNativeScmWatcher();

		// Render the content of the Webview
		this.update();
		if (loadViewTo !== null) {
			setTimeout(() => {
				if (this.isDisposed()) return;
				this.logger.logDebug('Re-sending requested repo to Commits webview after initial render: ' + loadViewTo.repo);
				this.respondLoadRepos(this.repoManager.getRepos(), loadViewTo);
			}, 300);
		}

		this.logger.log((restoredFromSerializer ? 'Restored' : 'Created') + ' Commits View [' + this.instanceId + ']' + (loadViewTo !== null ? ' (active repo: ' + loadViewTo.repo + ')' : ''));
	}

	/**
	 * Respond to a message sent from the front-end.
	 * @param msg The message that was received.
	 */
	private async respondToMessage(msg: RequestMessage) {
		this.repoFileWatcher.mute();

		switch (msg.command) {
			case 'addRemote':
				await handleAddRemote(this.branchRemoteCtx, msg);
				break;
			case 'addTag':
				await handleAddTag(this.tagStashCtx, msg);
				break;
			case 'applyStash':
				await handleApplyStash(this.tagStashCtx, msg);
				break;
			case 'branchFromStash':
				await handleBranchFromStash(this.tagStashCtx, msg);
				break;
			case 'checkoutBranch':
				await handleCheckoutBranch(this.branchRemoteCtx, msg);
				break;
			case 'checkoutCommit':
				await handleCheckoutCommit(this.commitGraphCtx, msg);
				break;
			case 'cherrypickCommit':
				await handleCherrypickCommit(this.commitGraphCtx, msg);
				break;
			case 'cleanUntrackedFiles':
				await handleCleanUntrackedFiles(this.workingTreeCtx, msg);
				break;
			case 'commitDetails':
				await handleCommitDetails(this.commitGraphCtx, msg);
				break;
			case 'compareCommits':
				await handleCompareCommits(this.commitGraphCtx, msg);
				break;
			case 'copyFilePath':
				await handleCopyFilePath(this.diffFileContentCtx, msg);
				break;
			case 'copyToClipboard':
				await handleCopyToClipboard(this.diffFileContentCtx, msg);
				break;
			case 'createArchive':
				await handleCreateArchive(this.diffFileContentCtx, msg);
				break;
			case 'createBranch':
				await handleCreateBranch(this.branchRemoteCtx, msg);
				break;
			case 'createPullRequest':
				await handleCreatePullRequest(this.branchRemoteCtx, msg);
				break;
			case 'cleanupLocalBranches':
				await handleCleanupLocalBranches(this.branchRemoteCtx, msg);
				break;
			case 'deleteBranch':
				await handleDeleteBranch(this.branchRemoteCtx, msg);
				break;
			case 'deleteRemote':
				await handleDeleteRemote(this.branchRemoteCtx, msg);
				break;
			case 'deleteRemoteBranch':
				await handleDeleteRemoteBranch(this.branchRemoteCtx, msg);
				break;
			case 'deleteTag':
				await handleDeleteTag(this.tagStashCtx, msg);
				break;
			case 'deleteUserDetails':
				await handleDeleteUserDetails(this.miscCtx, msg);
				break;
			case 'dropCommit':
				await handleDropCommit(this.commitGraphCtx, msg);
				break;
			case 'rewordCommit':
				await handleRewordCommit(this.commitGraphCtx, msg);
				break;
			case 'editCommitAuthor':
				await handleEditCommitAuthor(this.commitGraphCtx, msg);
				break;
			case 'squashCommits':
				await handleSquashCommits(this.commitGraphCtx, msg);
				break;
			case 'dropStash':
				await handleDropStash(this.tagStashCtx, msg);
				break;
			case 'editRemote':
				await handleEditRemote(this.branchRemoteCtx, msg);
				break;
			case 'editUserDetails':
				await handleEditUserDetails(this.miscCtx, msg);
				break;
			case 'exportRepoConfig':
				await handleExportRepoConfig(this.repoLifecycleCtx, msg);
				break;
			case 'fetch':
				await handleFetch(this.branchRemoteCtx, msg);
				break;
			case 'fetchAvatar':
				handleFetchAvatar(this.miscCtx, msg);
				break;
			case 'fetchIntoLocalBranch':
				await handleFetchIntoLocalBranch(this.branchRemoteCtx, msg);
				break;
			case 'loadCommits':
				await handleLoadCommits(this.repoLifecycleCtx, msg);
				break;
			case 'loadConfig':
				await handleLoadConfig(this.repoLifecycleCtx, msg);
				break;
			case 'loadRepoInfo':
				await handleLoadRepoInfo(this.repoLifecycleCtx, msg);
				break;
			case 'loadRepos':
				await handleLoadRepos(this.repoLifecycleCtx, msg);
				break;
			case 'merge':
				await handleMerge(this.branchRemoteCtx, msg);
				break;
			case 'openExtensionSettings':
				await handleOpenExtensionSettings(this.miscCtx, msg);
				break;
			case 'openExternalDirDiff':
				await handleOpenExternalDirDiff(this.diffFileContentCtx, msg);
				break;
			case 'openExternalUrl':
				await handleOpenExternalUrl(this.miscCtx, msg);
				break;
			case 'openFile':
				await handleOpenFile(this.diffFileContentCtx, msg);
				break;
			case 'popStash':
				await handlePopStash(this.tagStashCtx, msg);
				break;
			case 'pruneRemote':
				await handlePruneRemote(this.branchRemoteCtx, msg);
				break;
			case 'setRemoteDefaultBranch':
				await handleSetRemoteDefaultBranch(this.branchRemoteCtx, msg);
				break;
			case 'pullBranch':
				await handlePullBranch(this.branchRemoteCtx, msg);
				break;
			case 'pullBranchWithStash':
				await handlePullBranchWithStash(this.branchRemoteCtx, msg);
				break;
			case 'pushBranch':
				await handlePushBranch(this.branchRemoteCtx, msg);
				break;
			case 'pushStash':
				await handlePushStash(this.tagStashCtx, msg);
				break;
			case 'pushTag':
				await handlePushTag(this.tagStashCtx, msg);
				break;
			case 'rebase':
				await handleRebase(this.branchRemoteCtx, msg);
				break;
			case 'repoInProgressAction':
				await handleRepoInProgressAction(this.repoLifecycleCtx, msg);
				break;
			case 'renameBranch':
				await handleRenameBranch(this.branchRemoteCtx, msg);
				break;
			case 'setBranchUpstream':
				await handleSetBranchUpstream(this.branchRemoteCtx, msg);
				break;
			case 'unsetBranchUpstream':
				await handleUnsetBranchUpstream(this.branchRemoteCtx, msg);
				break;
			case 'rescanForRepos':
				await handleRescanForRepos(this.repoLifecycleCtx, msg);
				break;
			case 'resetFileToRevision':
				await handleResetFileToRevision(this.diffFileContentCtx, msg);
				break;
			case 'resetToCommit':
				await handleResetToCommit(this.commitGraphCtx, msg);
				break;
			case 'resetToHead':
				await handleResetToHead(this.commitGraphCtx, msg);
				break;
			case 'revertCommit':
				await handleRevertCommit(this.commitGraphCtx, msg);
				break;
			case 'setGlobalViewState':
				await handleSetGlobalViewState(this.repoLifecycleCtx, msg);
				break;
			case 'setColumnVisibility':
				await handleSetColumnVisibility(this.repoLifecycleCtx, msg);
				break;
			case 'setRepoState':
				handleSetRepoState(this.repoLifecycleCtx, msg);
				break;
			case 'setWorkspaceViewState':
				await handleSetWorkspaceViewState(this.repoLifecycleCtx, msg);
				break;
			case 'sidebarBatchRefAction':
				await handleSidebarBatchRefAction(this.commitGraphCtx, msg);
				break;
			case 'showErrorMessage':
				handleShowErrorMessage(this.miscCtx, msg);
				break;
			case 'tagDetails':
				await handleTagDetails(this.tagStashCtx, msg);
				break;
			case 'resolveSidebarTagContext':
				await handleResolveSidebarTagContext(this.tagStashCtx, msg);
				break;
			case 'viewDiff':
				await handleViewDiff(this.diffFileContentCtx, msg);
				break;
			case 'getFileDiff':
				await handleGetFileDiff(this.diffFileContentCtx, msg);
				break;
			case 'getFullDiffContent':
				await handleGetFullDiffContent(this.diffFileContentCtx, msg);
				break;
			case 'viewDiffWithWorkingFile':
				await handleViewDiffWithWorkingFile(this.diffFileContentCtx, msg);
				break;
			case 'viewFileAtRevision':
				await handleViewFileAtRevision(this.diffFileContentCtx, msg);
				break;
			case 'viewScm':
				await handleViewScm(this.miscCtx, msg);
				break;
			case 'loadWorkingTreeChanges':
				await handleLoadWorkingTreeChanges(this.workingTreeCtx, msg);
				break;
			case 'stageFiles':
				await handleStageFiles(this.workingTreeCtx, msg);
				break;
			case 'unstageFiles':
				await handleUnstageFiles(this.workingTreeCtx, msg);
				break;
			case 'commitChanges':
				await handleCommitChanges(this.workingTreeCtx, msg);
				break;
			case 'discardFileChanges':
				await handleDiscardFileChanges(this.workingTreeCtx, msg);
				break;
			case 'addToGitignore':
				await handleAddToGitignore(this.diffFileContentCtx, msg);
				break;
			case 'sendToCodeReview':
				handleSendToCodeReview(this.miscCtx, msg);
				break;
		}

		this.repoFileWatcher.unmute();
	}

	/**
	 * Send a message to the front-end.
	 * @param msg The message to be sent.
	 */
	private sendMessage(msg: ResponseMessage) {
		if (this.isDisposed()) {
			this.logger.logDebug('The Commits View has already been disposed, ignored sending "' + msg.command + '" message.');
		} else {
			this.panel.webview.postMessage(msg).then(
				() => { },
				() => {
					if (this.isDisposed()) {
						this.logger.logDebug('The Commits View was disposed while sending "' + msg.command + '" message.');
					} else {
						this.logger.logError('Unable to send "' + msg.command + '" message to the Commits View.');
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

	private async loadRepoFromSharedSelection(repoPath: string) {
		let loadRepo = await this.repoManager.getKnownRepo(repoPath);
		if (loadRepo === null && isPathInWorkspace(repoPath)) {
			const registeredRepo = await this.repoManager.registerRepo(await resolveToSymbolicPath(repoPath), false);
			loadRepo = registeredRepo.root;
		}
		if (loadRepo === null || loadRepo === this.currentRepo) return;
		const loadViewTo: LoadCommitsViewTo = { repo: loadRepo };
		if (this.panel.visible) {
			this.respondLoadRepos(this.repoManager.getRepos(), loadViewTo);
		} else {
			this.loadViewTo = loadViewTo;
		}
	}

	/**
	 * Get the HTML document to be loaded in the Webview.
	 * @returns The HTML.
	 */
	private getHtmlForWebview() {
		const config = getConfig(), nonce = getNonce();
		const initialState: CommitsViewInitialState = {
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
				defaultCommitMessage: config.defaultCommitMessage,
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
			loadCommitsRefreshId: this.loadCommitsRefreshId,
			fileIcons: loadFileIcons()
		};
		const globalState = this.extensionState.getGlobalViewState();
		const workspaceState = this.extensionState.getWorkspaceViewState();
		const html = renderCommitsWebviewHtml({
			panel: this.panel,
			nonce: nonce,
			viewName: TabView.NAME,
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


	/**
	 * Subscribe to VS Code's built-in Git extension repository state changes so that commits
	 * made via the native Source Control panel are detected and trigger a refresh.
	 */
	private setupNativeScmWatcher(): void {
		const gitExt = vscode.extensions.getExtension<any>('vscode.git');
		if (!gitExt) return;

		const attach = (api: any) => {
			if (this.isDisposed()) return;
			let refreshTimeout: NodeJS.Timer | null = null;

			const scheduleRefresh = () => {
				if (refreshTimeout !== null) clearTimeout(refreshTimeout);
				refreshTimeout = setTimeout(() => {
					refreshTimeout = null;
					if (this.panel.visible) {
						this.sendMessage({ command: 'refresh' });
					}
				}, 750);
			};

			const getSelectedApiRepository = () => {
				if (!api || !Array.isArray(api.repositories)) return null;
				for (const repo of api.repositories) {
					if (repo?.ui?.selected) return repo;
				}
				return null;
			};

			const getKnownRepoForScmPath = async (repoPath: string) => {
				let knownRepo = await this.repoManager.getKnownRepo(repoPath);
				if (knownRepo === null && isPathInWorkspace(repoPath)) {
					const registerResult = await this.repoManager.registerRepo(await resolveToSymbolicPath(repoPath), false);
					knownRepo = registerResult.root;
				}
				return knownRepo;
			};

			const syncVisibleRepositories = async (loadSelectedRepository: boolean) => {
				if (this.isDisposed()) return;

				const visibleRepos = new Set<string>();
				if (api && Array.isArray(api.repositories)) {
					for (const repo of api.repositories) {
						const repoPath = repo?.rootUri?.fsPath;
						if (typeof repoPath !== 'string' || repoPath.length === 0) continue;
						const knownRepo = await getKnownRepoForScmPath(repoPath);
						if (knownRepo !== null) visibleRepos.add(knownRepo);
					}
				}
				this.sourceControlRepos = visibleRepos;

				if (!this.panel.visible) return;
				let loadViewTo: LoadCommitsViewTo = null;
				if (loadSelectedRepository) {
					const selectedRepoPath = getSelectedApiRepository()?.rootUri?.fsPath;
					if (typeof selectedRepoPath === 'string' && selectedRepoPath.length > 0) {
						const knownRepo = await getKnownRepoForScmPath(selectedRepoPath);
						if (knownRepo !== null) loadViewTo = { repo: knownRepo };
					}
				}

				this.respondLoadRepos(this.repoManager.getRepos(), loadViewTo);
				if (loadSelectedRepository) scheduleRefresh();
			};

			const watchRepo = (repo: any) => {
				this.registerDisposables(repo.state.onDidChange(scheduleRefresh));
				if (repo?.ui && typeof repo.ui.onDidChange === 'function') {
					this.registerDisposables(repo.ui.onDidChange(() => {
						void syncVisibleRepositories(true);
					}));
				}
			};

			api.repositories.forEach(watchRepo);
			this.registerDisposables(api.onDidOpenRepository((repo: any) => {
				watchRepo(repo);
				void syncVisibleRepositories(false);
			}));
			if (typeof api.onDidCloseRepository === 'function') {
				this.registerDisposables(api.onDidCloseRepository(() => {
					void syncVisibleRepositories(false);
				}));
			}
			void syncVisibleRepositories(true);
		};

		if (gitExt.isActive) {
			attach(gitExt.exports.getAPI(1));
		} else {
			gitExt.activate().then(() => attach(gitExt.exports.getAPI(1)));
		}
	}


	/* Response Construction Methods */

	/**
	 * Send the known repositories to the front-end.
	 * @param repos The set of known repositories.
	 * @param loadViewTo What to load the view to.
	 */
	private respondLoadRepos(repos: GitRepoSet, loadViewTo: LoadCommitsViewTo) {
		const visibleRepos = this.getVisibleRepos(repos, loadViewTo?.repo ?? null);
		this.sendMessage({
			command: 'loadRepos',
			repos: visibleRepos,
			lastActiveRepo: this.extensionState.getLastActiveRepo(),
			loadViewTo: loadViewTo
		});
	}

	private getVisibleRepos(repos: GitRepoSet, forceIncludeRepo: string | null = null): GitRepoSet {
		if (this.sourceControlRepos === null) return repos;
		const visibleRepos: GitRepoSet = {};
		for (const repo of this.sourceControlRepos) {
			if (typeof repos[repo] !== 'undefined') visibleRepos[repo] = repos[repo];
		}
		if (forceIncludeRepo !== null && typeof repos[forceIncludeRepo] !== 'undefined') {
			visibleRepos[forceIncludeRepo] = repos[forceIncludeRepo];
		}
		return visibleRepos;
	}

}

export { standardiseCspSource } from '../common/webviewChrome';
