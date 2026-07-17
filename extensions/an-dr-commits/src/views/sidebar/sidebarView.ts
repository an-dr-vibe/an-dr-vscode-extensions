import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from '../../config';
import { DataSource, GitWorkingTreeChange, HeadInfo } from '../../dataSource';
import { ExtensionState } from '../../extensionState';
import { RepoManager } from '../../repoManager';
import { ErrorInfo, GitFileStatus, GitPushBranchMode, GitResetMode, UiDensity } from '../../types';
import { UNCOMMITTED, getSortedRepositoryPaths, viewDiff, viewSubmoduleDiff } from '../../utils';
import { Event } from '../../utils/event';
import {
	GitChangeCounts,
	countChanges, getRepoRoot
} from './gitUtils';
import { MINI_GRAPH_LIMIT, fetchMiniGraph } from './miniGraph';
import { renderHtml, renderLoadingHtml } from './html';
import { RepoSelectionEvent } from '../common/repoSelection';
import { SidebarGraphState, SidebarInitialState } from '../../types/sidebar-state';
import { SidebarRequestMessage, SidebarResponseMessage } from '../../types/sidebar-protocol';

export { GitActivityChange, GitChangeCounts, getWorkingTreeChanges, countChanges, countWorkingTreeChanges } from './gitUtils';

function resetModeLabel(mode: GitResetMode): string {
	switch (mode) {
		case GitResetMode.Soft: return 'Soft - Keep all changes, but reset head';
		case GitResetMode.Mixed: return 'Mixed - Keep working tree, but reset index';
		case GitResetMode.Hard: return 'Hard - Discard all changes';
	}
}

/** Return whether staging this change can update the parent repository index. */
function canStageWorkingTreeChange(change: GitWorkingTreeChange): boolean {
	return change.submodule === null || change.submodule.oldSha !== change.submodule.newSha;
}

/**
 * Activity Bar webview that mirrors the Commits uncommitted-changes panel for
 * the active repository, while keeping the existing activity badge behavior.
 */
export class SidebarView implements vscode.Disposable {
	private readonly dataSource: DataSource;
	private readonly extensionState: ExtensionState;
	private readonly repoManager: RepoManager;
	private readonly extensionPath: string;
	private readonly emitRepoSelection: (event: RepoSelectionEvent) => void;
	private readonly _disposables: vscode.Disposable[] = [];
	private readonly _fileWatchers = new Map<string, vscode.Disposable>();
	private _api: any = null;
	private _view: any = null;
	private _currentRepo: string | null = null;
	private _pinnedRepo: string | null = null;
	private _changes: GitWorkingTreeChange[] = [];
	private _refreshSeq = 0;
	private _refreshTimer: ReturnType<typeof setTimeout> | null = null;
	private _miniGraphLimit = MINI_GRAPH_LIMIT;
	private _hasRenderedOnce = false;

	constructor(context: vscode.ExtensionContext, dataSource: DataSource, extensionState: ExtensionState, repoManager: RepoManager, onDidChangeRepoSelection: Event<RepoSelectionEvent>, emitRepoSelection: (event: RepoSelectionEvent) => void) {
		this.dataSource = dataSource;
		this.extensionState = extensionState;
		this.repoManager = repoManager;
		this.extensionPath = context.extensionPath;
		this.emitRepoSelection = emitRepoSelection;
		this._pinnedRepo = extensionState.getLastActiveRepo();

		const registerWebviewViewProvider = (vscode.window as any).registerWebviewViewProvider;
		if (typeof registerWebviewViewProvider === 'function') {
			context.subscriptions.push(registerWebviewViewProvider.call(vscode.window, 'an-dr-commits.activityView', this, {
				webviewOptions: { retainContextWhenHidden: true }
			}));
		}
		this._disposables.push(onDidChangeRepoSelection((event) => {
			if (event.source === 'activity') return;
			this._pinRepoFromSharedSelection(event.repo);
		}));
		this._disposables.push(repoManager.onDidChangeRepos(() => {
			this._syncRepoWatchers();
			this._scheduleRefresh();
		}));
		if (typeof vscode.workspace.onDidChangeConfiguration === 'function') {
			this._disposables.push(vscode.workspace.onDidChangeConfiguration((event) => {
				if (!event.affectsConfiguration('an-dr-commits.uiDensity')) return;
				this._hasRenderedOnce = false;
				void this._refreshPanel();
			}));
		}
		this._syncRepoWatchers();
		this._subscribeToGitApi();
	}

	public resolveWebviewView(webviewView: any) {
		this._view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.file(path.join(this.extensionPath, 'media'))]
		};
		webviewView.webview.onDidReceiveMessage((msg: SidebarRequestMessage) => {
			void this._handleMessage(msg);
		});
		this._updateBadge();
		void this._refreshPanel();
	}

	private _scheduleRefresh() {
		if (this._refreshTimer !== null) clearTimeout(this._refreshTimer);
		this._refreshTimer = setTimeout(() => {
			this._refreshTimer = null;
			this._updateBadge();
			void this._refreshPanel();
		}, 500);
	}

	private _watchRepo(repoPath: string) {
		if (this._fileWatchers.has(repoPath)) return;
		const watcher = vscode.workspace.createFileSystemWatcher(repoPath + '/.git/**');
		const onEvent = () => this._scheduleRefresh();
		watcher.onDidCreate(onEvent);
		watcher.onDidChange(onEvent);
		watcher.onDidDelete(onEvent);
		this._fileWatchers.set(repoPath, watcher);
	}

	/**
	 * Keeps the `.git/**` file watchers in sync with RepoManager's known repos (the sidebar's
	 * repo source of truth, see ADR-005's follow-up) - added when a repo is discovered, disposed
	 * when it's removed. Idempotent, so it's safe to call on every `onDidChangeRepos` event.
	 */
	private _syncRepoWatchers() {
		const knownPaths = new Set(Object.keys(this.repoManager.getRepos()));
		for (const [repoPath, watcher] of this._fileWatchers) {
			if (!knownPaths.has(repoPath)) {
				watcher.dispose();
				this._fileWatchers.delete(repoPath);
			}
		}
		for (const repoPath of knownPaths) {
			this._watchRepo(repoPath);
		}
	}

	/**
	 * Keeps `this._api` pointed at the native VS Code Git extension - used for the working-tree
	 * badge's instant fast-path (`countChanges`) and as a live-refresh signal. Head/branch/remote
	 * resolution (Pull/Push/Reset) and the mini graph no longer depend on it (see
	 * `DataSource.getHeadInfo`), nor does repo enumeration / watching (see
	 * `_getRepoPaths`/`_syncRepoWatchers`) - RepoManager can know about repos this API hasn't
	 * opened.
	 */
	private _subscribeToGitApi() {
		const gitExt = vscode.extensions.getExtension('vscode.git');
		if (!gitExt) { return; }

		const attach = (api: any) => {
			this._api = api;
			// Badge updates instantly (native API state, no git spawn); the panel's own git
			// fetches go through _scheduleRefresh so rapid events (editor switches, vscode.git
			// state churn) coalesce instead of spawning git per event.
			const update = () => {
				this._updateBadge();
				this._scheduleRefresh();
			};

			for (const repo of api.repositories) {
				this._disposables.push(repo.state.onDidChange(update));
			}
			this._disposables.push(
				api.onDidOpenRepository((r: any) => {
					this._disposables.push(r.state.onDidChange(update));
					update();
				}),
				vscode.window.onDidChangeActiveTextEditor(update)
			);
			update();
		};

		if (gitExt.isActive) {
			attach(gitExt.exports.getAPI(1));
		} else {
			gitExt.activate().then(() => attach(gitExt.exports.getAPI(1)));
		}
	}

	/**
	 * Resolves which repo is active: the pinned repo if still known, else whichever known repo
	 * contains the active editor's file, else the first repo in dropdown order (starred repos
	 * first, then the configured `repositoryDropdownOrder`) - mirrors the tab's own default-repo
	 * fallback (`web/main/loadProcessing.ts`). Sourced entirely from RepoManager (see
	 * `_getRepoPaths`) rather than the native VS Code Git API, so this resolves correctly even
	 * for repos that API hasn't opened.
	 */
	private _resolveActiveRepoPath(): string | null {
		const repos = this.repoManager.getRepos();
		if (Object.keys(repos).length === 0) return null;
		if (this._pinnedRepo !== null) {
			const known = this.repoManager.findKnownRepoPath(this._pinnedRepo);
			if (known !== null) return known;
			this._pinnedRepo = null;
		}
		const activeUri = vscode.window.activeTextEditor?.document.uri;
		const fileRepo = activeUri ? this.repoManager.getRepoContainingFile(activeUri.fsPath) : null;
		if (fileRepo !== null) return fileRepo;
		return getSortedRepositoryPaths(repos, getConfig().repoDropdownOrder)[0];
	}

	/** The sidebar's repo dropdown source of truth - RepoManager's own workspace-wide discovery (see ADR-005's follow-up), not the native VS Code Git API's (narrower) auto-detected repo list. */
	private _getRepoPaths(): string[] {
		return Object.keys(this.repoManager.getRepos());
	}

	private _pathsEqual(a: string, b: string) {
		const left = path.resolve(a);
		const right = path.resolve(b);
		return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
	}

	private _pinRepoFromSharedSelection(repoPath: string) {
		const selected = this.repoManager.findKnownRepoPath(repoPath) ?? repoPath;
		if (this._pinnedRepo !== null && this._pathsEqual(this._pinnedRepo, selected)) return;
		this._pinnedRepo = selected;
		this.extensionState.setLastActiveRepo(selected);
		this._updateBadge();
		void this._refreshPanel();
	}

	/**
	 * Badge reflects only the currently selected repository's changes - not every repository in
	 * the workspace summed together - matching what the sidebar's own changes tree shows.
	 * Prefers the native Git extension's live state (instant, no git spawn); if the active repo
	 * isn't tracked there (RepoManager can know about repos that API hasn't opened), falls back
	 * to this view's own last-fetched working tree changes for that same repo.
	 *
	 * Called both eagerly (for instant feedback before a refresh's async git calls resolve) and
	 * again from `_refreshPanel` once `this._changes` actually reflects the just-fetched data -
	 * the eager call alone left the badge always one refresh behind whenever the vscode.git fast
	 * path wasn't available for the active repo.
	 */
	private _updateBadge() {
		if (this._view === null) return;
		const activePath = this._resolveActiveRepoPath();
		const activeApiRepo = activePath !== null && this._api !== null
			? (this._api.repositories as any[]).find((r) => this._pathsEqual(getRepoRoot(r), activePath))
			: undefined;
		let counts: GitChangeCounts = { modified: 0, deleted: 0 };
		if (activeApiRepo) {
			counts = countChanges(activeApiRepo);
		} else if (activePath !== null && activePath === this._currentRepo) {
			counts = {
				modified: this._changes.filter((c) => c.status !== 'D').length,
				deleted: this._changes.filter((c) => c.status === 'D').length
			};
		}
		const total = counts.modified + counts.deleted;
		this._view.badge = total > 0
			? { value: total, tooltip: `${counts.modified} modified, ${counts.deleted} deleted` }
			: undefined;
	}

	private async _sendMessage(msg: SidebarResponseMessage) {
		if (this._view === null) return;
		await this._view.webview.postMessage(msg);
	}

	/**
	 * Assembles the sidebar's client-side state contract (see ADR-003) from fetched data plus
	 * live config - used for both the shell's initial render and the raw-data patch messages,
	 * so both stay in sync by construction.
	 */
	private _buildInitialState(repo: string | null, repoPaths: string[], starredRepos: string[], changes: GitWorkingTreeChange[], error: ErrorInfo, graph: SidebarGraphState, graphHeight: number): SidebarInitialState {
		const config = getConfig();
		const grid = config.graph.grid;
		const gridY = config.uiDensity === UiDensity.Big ? grid.y : config.uiDensity === UiDensity.Normal ? 20 : 18;
		return {
			repo, repoPaths, starredRepos, changes, error, graphHeight, graph,
			uiDensity: config.uiDensity,
			enhancedAccessibility: config.enhancedAccessibility,
			graphConfig: {
				showTags: config.graph.showTagsInActivityBar,
				colours: config.graph.colours,
				grid: gridY === grid.y ? grid : { ...grid, y: gridY, offsetY: gridY / 2 },
				uncommittedChangesStyle: config.graph.uncommittedChanges
			}
		};
	}

	/**
	 * Refreshes the panel's data. By default this patches the existing DOM in place
	 * (preserving scroll position, in-progress graph resize, and any typed-but-uncommitted
	 * message) since most refreshes are triggered by routine file-watcher events while the
	 * same repo stays open. A full page replace only happens on the very first render or a
	 * repo switch - the sidebar's own client-side rendering (web/sidebar/main.ts) now handles
	 * the mini graph appearing/disappearing via a patch (show/hide, not a DOM structure change),
	 * so that no longer needs a full replace the way the pre-port server-rendered HTML did.
	 *
	 * The graph fetch is deliberately not awaited together with the changes fetch: it settles on
	 * its own schedule and is always pushed via its own 'updateGraph' message (never bundled into
	 * 'updateContent'), so a slow or failing graph fetch never delays the repo selector / changes
	 * tree, and the graph's own always-present container can show its own loading/error state
	 * (SidebarGraphState) in the meantime - see ADR-007.
	 */
	private async _refreshPanel() {
		if (this._view === null) return;
		const seq = ++this._refreshSeq;
		const repoPaths = this._getRepoPaths();
		const starredRepos = repoPaths.filter((p) => this.repoManager.isRepoStarred(p));
		const repo = this._resolveActiveRepoPath();
		const repoChanged = repo !== this._currentRepo;
		if (repoChanged) this._miniGraphLimit = MINI_GRAPH_LIMIT;
		this._currentRepo = repo;
		const graphHeight = this.extensionState.getActivityGraphHeight();
		const needsFullRender = !this._hasRenderedOnce || repoChanged;

		if (repo === null) {
			this._changes = [];
			this._updateBadge();
			if (needsFullRender) {
				this._view.webview.html = renderHtml(this._view.webview, this.extensionPath, this._buildInitialState(null, repoPaths, starredRepos, [], null, { status: 'ready', data: null }, graphHeight));
				this._hasRenderedOnce = true;
			} else {
				await this._sendMessage({ command: 'updateContent', repo: null, repoPaths, starredRepos, changes: [], error: null });
			}
			return;
		}

		if (needsFullRender) {
			// Shown synchronously, before the async git calls below, so there's no blank gap -
			// replaced by the real content once it's ready, per _refreshPanel's own render path.
			this._view.webview.html = renderLoadingHtml(this._view.webview, this.extensionPath);
		}

		const graphPromise = fetchMiniGraph(this.dataSource, repo, this._miniGraphLimit);

		const result = await this.dataSource.getWorkingTreeChanges(repo);
		if (seq !== this._refreshSeq) return;
		this._changes = result.changes;
		this._updateBadge();

		if (needsFullRender) {
			this._view.webview.html = renderHtml(this._view.webview, this.extensionPath, this._buildInitialState(repo, repoPaths, starredRepos, result.changes, result.error, { status: 'loading' }, graphHeight));
			this._hasRenderedOnce = true;
		} else {
			await this._sendMessage({ command: 'updateContent', repo, repoPaths, starredRepos, changes: result.changes, error: result.error });
		}

		const graph = await graphPromise;
		if (seq !== this._refreshSeq) return;
		await this._sendMessage({ command: 'updateGraph', graph });
	}

	private async _handleMessage(msg: SidebarRequestMessage) {
		const repo = this._currentRepo;
		switch (msg.command) {
			case 'openCommits':
				await vscode.commands.executeCommand('an-dr-commits.view');
				return;
			case 'loadMoreGraph':
				this._miniGraphLimit += MINI_GRAPH_LIMIT;
				if (repo !== null && this._view !== null) {
					const graph = await fetchMiniGraph(this.dataSource, repo, this._miniGraphLimit);
					await this._sendMessage({ command: 'updateGraph', graph });
				}
				return;
			case 'selectRepo':
				this._pinnedRepo = this.repoManager.findKnownRepoPath(msg.filePath) ?? msg.filePath;
				this.extensionState.setLastActiveRepo(this._pinnedRepo);
				this.emitRepoSelection({ repo: this._pinnedRepo, source: 'activity' });
				this._updateBadge();
				await this._refreshPanel();
				return;
			case 'setRepoStarred':
				this.repoManager.setRepoStarred(msg.filePath, msg.starred);
				await this._refreshPanel();
				return;
			case 'refresh':
				this._updateBadge();
				await this._refreshPanel();
				return;
			case 'setGraphHeight':
				await this.extensionState.setActivityGraphHeight(msg.height);
				return;
		}

		if (repo === null) return;

		let error: ErrorInfo = null;
		switch (msg.command) {
			case 'stage':
				error = await this.dataSource.stageFiles(repo, [msg.filePath]);
				break;
			case 'unstage':
				error = await this.dataSource.unstageFiles(repo, [msg.filePath]);
				break;
			case 'stageAll':
				{
					const files = this._changes.filter((c) => !c.staged && canStageWorkingTreeChange(c)).map((c) => c.path);
					error = files.length > 0 ? await this.dataSource.stageFiles(repo, files) : null;
				}
				break;
			case 'unstageAll':
				{
					const files = this._changes.filter((c) => c.staged && canStageWorkingTreeChange(c)).map((c) => c.path);
					error = files.length > 0 ? await this.dataSource.unstageFiles(repo, files) : null;
				}
				break;
			case 'discard':
				error = await this.dataSource.discardFileChanges(repo, [msg.filePath], msg.isUntracked, !!msg.restoreToIndex);
				break;
			case 'discardSubmodule':
				error = await this.dataSource.discardSubmoduleChanges(repo, msg.filePath, msg.cleanUntracked);
				break;
			case 'commit':
				error = await this._commit(repo, msg.message, msg.amend);
				break;
			case 'openChanges': {
				const change = this._changes.find((c) => c.path === msg.filePath);
				if (change !== undefined) {
					// viewDiff falls back to opening the file directly for GitFileStatus.Untracked,
					// since there's nothing to diff against - no need to special-case it here too.
					error = change.submodule !== null
						? await viewSubmoduleDiff(repo, UNCOMMITTED, UNCOMMITTED, change.path, this.dataSource)
						: await viewDiff(repo, UNCOMMITTED, UNCOMMITTED, change.oldPath || change.path, change.path, this._toGitFileStatus(change.status));
				}
				break;
			}
			case 'gitFetch':
				error = await this._gitFetch(repo);
				break;
			case 'gitPull':
				error = await this._gitPull(repo);
				break;
			case 'gitPush':
				error = await this._gitPush(repo, GitPushBranchMode.Normal);
				break;
			case 'gitForcePush':
				error = await this._gitPush(repo, GitPushBranchMode.ForceWithLease);
				break;
			case 'gitReset':
				error = await this._gitReset(repo);
				break;
		}

		if (error !== null) {
			void vscode.window.showErrorMessage(error);
		}
		await this._refreshPanel();
	}

	private _resolveHead(repo: string): Promise<HeadInfo | null> {
		return this.dataSource.getHeadInfo(repo);
	}

	private async _gitFetch(repo: string): Promise<ErrorInfo> {
		const cfg = getConfig().dialogDefaults.fetchRemote;
		return this.dataSource.fetch(repo, null, cfg.prune, cfg.pruneTags);
	}

	private async _gitPull(repo: string): Promise<ErrorInfo> {
		const head = await this._resolveHead(repo);
		if (head === null) return 'Unable to pull: there is no checked out local branch.';
		if (head.upstreamRemote === null) return 'Unable to pull because the current branch has no configured remote.';
		const cfg = getConfig().dialogDefaults.pullBranch;
		return this.dataSource.pullBranch(repo, head.branchName, head.upstreamRemote, cfg.noFastForward, cfg.squash);
	}

	private async _gitPush(repo: string, mode: GitPushBranchMode): Promise<ErrorInfo> {
		const head = await this._resolveHead(repo);
		if (head === null) return 'Unable to push: there is no checked out local branch.';
		const remote = head.upstreamRemote ?? (head.remoteNames.length === 1 ? head.remoteNames[0] : null);
		if (remote === null) {
			return 'Unable to push: no upstream is configured and the repository has no single unambiguous remote. Use the Commits tab to choose a remote.';
		}
		if (mode === GitPushBranchMode.ForceWithLease) {
			const choice = await vscode.window.showWarningMessage(
				`Force push "${head.branchName}" to "${remote}"? This can overwrite commits on the remote.`,
				{ modal: true }, 'Force Push'
			);
			if (choice !== 'Force Push') return null;
		}
		return this.dataSource.pushBranch(repo, head.branchName, remote, head.upstreamRemote === null, mode);
	}

	private async _gitReset(repo: string): Promise<ErrorInfo> {
		const head = await this._resolveHead(repo);
		if (head === null || head.headHash === null) return 'Unable to reset: there is no checked out local branch.';
		const defaultMode = getConfig().dialogDefaults.resetCommit.mode;
		const order = Array.from(new Set([defaultMode, GitResetMode.Soft, GitResetMode.Mixed, GitResetMode.Hard]));
		const picked = await vscode.window.showQuickPick(
			order.map((mode) => resetModeLabel(mode)),
			{ placeHolder: `Reset "${head.branchName}" to HEAD (${head.headHash.substring(0, 7)})` }
		);
		if (!picked) return null;
		const mode = order.find((m) => resetModeLabel(m) === picked)!;
		return this.dataSource.resetToCommit(repo, head.headHash, mode);
	}

	private async _commit(repo: string, message: string, amend: boolean): Promise<ErrorInfo> {
		let commitMessage = message.trim();
		if (!commitMessage && getConfig().defaultCommitMessage) {
			commitMessage = getConfig().defaultCommitMessage + ' (' + this._timestamp() + ')';
		}
		if (!commitMessage && !amend) return 'Commit message is required.';
		const hasStagedChanges = this._changes.some((c) => c.staged);
		if (!hasStagedChanges) {
			const files = this._changes.filter(canStageWorkingTreeChange).map((c) => c.path);
			if (files.length === 0) return 'No submodule pointer change is available to commit. Commit the nested submodule changes inside the submodule first.';
			const stageError = await this.dataSource.stageFiles(repo, files);
			if (stageError !== null) return stageError;
		}
		return this.dataSource.commitChanges(repo, commitMessage, amend);
	}

	private _timestamp() {
		const now = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
			' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
	}

	private _toGitFileStatus(status: GitWorkingTreeChange['status']): GitFileStatus {
		if (status === 'A') return GitFileStatus.Added;
		if (status === 'D') return GitFileStatus.Deleted;
		if (status === 'R') return GitFileStatus.Renamed;
		if (status === 'U') return GitFileStatus.Untracked;
		return GitFileStatus.Modified;
	}

	dispose() {
		this._disposables.forEach(d => d.dispose());
		this._fileWatchers.forEach((watcher) => watcher.dispose());
		if (this._refreshTimer !== null) clearTimeout(this._refreshTimer);
	}
}
