import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { DataSource, GitWorkingTreeChange } from '../dataSource';
import { ExtensionState } from '../extensionState';
import { ErrorInfo, GitFileStatus } from '../types';
import { UNCOMMITTED, viewDiff } from '../utils';
import { Event } from '../utils/event';
import {
	ActivityBarMessage, GitChangeCounts,
	countChanges
} from './gitUtils';
import { MINI_GRAPH_LIMIT, fetchMiniGraph, renderMiniGraphInner } from './miniGraph';
import { renderHtml } from './html';
import { RepoSelectionEvent } from './repoSelection';

export { GitActivityChange, GitChangeCounts, getWorkingTreeChanges, countChanges, countWorkingTreeChanges } from './gitUtils';

/**
 * Activity Bar webview that mirrors the Commits uncommitted-changes panel for
 * the active repository, while keeping the existing activity badge behavior.
 */
export class ActivityBarView implements vscode.Disposable {
	private readonly dataSource: DataSource;
	private readonly extensionState: ExtensionState;
	private readonly extensionPath: string;
	private readonly emitRepoSelection: (event: RepoSelectionEvent) => void;
	private readonly _disposables: vscode.Disposable[] = [];
	private readonly _fileWatchers: vscode.Disposable[] = [];
	private _api: any = null;
	private _view: any = null;
	private _currentRepo: string | null = null;
	private _pinnedRepo: string | null = null;
	private _changes: GitWorkingTreeChange[] = [];
	private _refreshSeq = 0;
	private _refreshTimer: ReturnType<typeof setTimeout> | null = null;
	private _miniGraphLimit = MINI_GRAPH_LIMIT;

	constructor(context: vscode.ExtensionContext, dataSource: DataSource, extensionState: ExtensionState, onDidChangeRepoSelection: Event<RepoSelectionEvent>, emitRepoSelection: (event: RepoSelectionEvent) => void) {
		this.dataSource = dataSource;
		this.extensionState = extensionState;
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
		this._subscribeToGitApi();
	}

	public resolveWebviewView(webviewView: any) {
		this._view = webviewView;
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.file(path.join(this.extensionPath, 'media'))]
		};
		webviewView.webview.onDidReceiveMessage((msg: ActivityBarMessage) => {
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
		const watcher = vscode.workspace.createFileSystemWatcher(repoPath + '/.git/**');
		const onEvent = () => this._scheduleRefresh();
		watcher.onDidCreate(onEvent);
		watcher.onDidChange(onEvent);
		watcher.onDidDelete(onEvent);
		this._fileWatchers.push(watcher);
	}

	private _subscribeToGitApi() {
		const gitExt = vscode.extensions.getExtension('vscode.git');
		if (!gitExt) { return; }

		const attach = (api: any) => {
			this._api = api;
			const update = () => {
				this._updateBadge();
				void this._refreshPanel();
			};

			for (const repo of api.repositories) {
				this._disposables.push(repo.state.onDidChange(update));
				const repoPath = repo.rootUri?.fsPath as string | undefined;
				if (repoPath) this._watchRepo(repoPath);
			}
			this._disposables.push(
				api.onDidOpenRepository((r: any) => {
					this._disposables.push(r.state.onDidChange(update));
					const repoPath = r.rootUri?.fsPath as string | undefined;
					if (repoPath) this._watchRepo(repoPath);
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

	private _resolveActiveRepoPath(): string | null {
		if (this._api === null || this._api.repositories.length === 0) return null;
		if (this._pinnedRepo !== null) {
			const still = this._findApiRepoPath(this._pinnedRepo);
			if (still !== null) return still;
			this._pinnedRepo = null;
		}
		const activeUri = vscode.window.activeTextEditor?.document.uri;
		let repo = activeUri && typeof this._api.getRepository === 'function'
			? this._api.getRepository(activeUri)
			: null;
		if (!repo) repo = this._api.repositories[0];
		return (repo?.rootUri?.fsPath as string | undefined) ?? null;
	}

	private _getRepoPaths(): string[] {
		if (this._api === null) return [];
		return (this._api.repositories as any[])
			.map((r) => r.rootUri?.fsPath as string | undefined)
			.filter((p): p is string => typeof p === 'string');
	}

	private _pathsEqual(a: string, b: string) {
		const left = path.resolve(a);
		const right = path.resolve(b);
		return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
	}

	private _findApiRepoPath(repoPath: string): string | null {
		if (this._api === null) return null;
		const repo = (this._api.repositories as any[]).find((r) => {
			const candidate = r.rootUri?.fsPath as string | undefined;
			return typeof candidate === 'string' && this._pathsEqual(candidate, repoPath);
		});
		return (repo?.rootUri?.fsPath as string | undefined) ?? null;
	}

	private _pinRepoFromSharedSelection(repoPath: string) {
		const selected = this._findApiRepoPath(repoPath) ?? repoPath;
		if (this._pinnedRepo !== null && this._pathsEqual(this._pinnedRepo, selected)) return;
		this._pinnedRepo = selected;
		this.extensionState.setLastActiveRepo(selected);
		void this._refreshPanel();
	}

	private _updateBadge() {
		if (this._api === null || this._view === null) return;
		let counts: GitChangeCounts = { modified: 0, deleted: 0 };
		for (const repo of this._api.repositories) {
			const c = countChanges(repo);
			counts.modified += c.modified;
			counts.deleted += c.deleted;
		}
		const total = counts.modified + counts.deleted;
		this._view.badge = total > 0
			? { value: total, tooltip: `${counts.modified} modified, ${counts.deleted} deleted` }
			: undefined;
	}

	private async _refreshPanel() {
		if (this._view === null) return;
		const seq = ++this._refreshSeq;
		const repoPaths = this._getRepoPaths();
		const repo = this._resolveActiveRepoPath();
		if (repo !== this._currentRepo) this._miniGraphLimit = MINI_GRAPH_LIMIT;
		this._currentRepo = repo;
		if (repo === null) {
			this._changes = [];
			this._view.webview.html = renderHtml(this._view.webview, this.extensionPath, null, [], null, repoPaths, null);
			return;
		}
		const [result, miniGraph] = await Promise.all([
			this.dataSource.getWorkingTreeChanges(repo),
			fetchMiniGraph(this._api, this.dataSource, repo, this._miniGraphLimit)
		]);
		if (seq !== this._refreshSeq) return;
		this._changes = result.changes;
		this._view.webview.html = renderHtml(this._view.webview, this.extensionPath, repo, result.changes, result.error, repoPaths, miniGraph);
	}

	private async _handleMessage(msg: ActivityBarMessage) {
		const repo = this._currentRepo;
		if (msg.command === 'openCommits') {
			await vscode.commands.executeCommand('an-dr-commits.view');
			return;
		}
		if (msg.command === 'loadMoreGraph') {
			this._miniGraphLimit += MINI_GRAPH_LIMIT;
			if (repo !== null && this._view !== null) {
				const miniGraph = await fetchMiniGraph(this._api, this.dataSource, repo, this._miniGraphLimit);
				await this._view.webview.postMessage({
					command: 'updateGraph',
					html: miniGraph ? renderMiniGraphInner(miniGraph) : '',
					more: miniGraph?.moreAvailable ?? false
				});
			}
			return;
		}
		if (msg.command === 'selectRepo' && msg.filePath) {
			this._pinnedRepo = this._findApiRepoPath(msg.filePath) ?? msg.filePath;
			this.extensionState.setLastActiveRepo(this._pinnedRepo);
			this.emitRepoSelection({ repo: this._pinnedRepo, source: 'activity' });
			await this._refreshPanel();
			return;
		}
		if (msg.command === 'refresh') {
			await this._refreshPanel();
			return;
		}
		if (repo === null) return;

		let error: ErrorInfo = null;
		if (msg.command === 'stage' && msg.filePath) {
			error = await this.dataSource.stageFiles(repo, [msg.filePath]);
		} else if (msg.command === 'unstage' && msg.filePath) {
			error = await this.dataSource.unstageFiles(repo, [msg.filePath]);
		} else if (msg.command === 'stageAll') {
			error = await this.dataSource.stageFiles(repo, this._changes.filter((c) => !c.staged).map((c) => c.path));
		} else if (msg.command === 'unstageAll') {
			error = await this.dataSource.unstageFiles(repo, this._changes.filter((c) => c.staged).map((c) => c.path));
		} else if (msg.command === 'discard' && msg.filePath) {
			error = await this.dataSource.discardFileChanges(repo, [msg.filePath], !!msg.isUntracked, !!msg.restoreToIndex);
		} else if (msg.command === 'commit') {
			error = await this._commit(repo, msg.message ?? '', !!msg.amend);
		} else if (msg.command === 'openChanges' && msg.filePath) {
			const change = this._changes.find((c) => c.path === msg.filePath);
			if (change !== undefined && change.status !== 'U') {
				error = await viewDiff(repo, UNCOMMITTED, UNCOMMITTED, change.oldPath || change.path, change.path, this._toGitFileStatus(change.status));
			}
		}

		if (error !== null) {
			void vscode.window.showErrorMessage(error);
		}
		await this._refreshPanel();
	}

	private async _commit(repo: string, message: string, amend: boolean): Promise<ErrorInfo> {
		let commitMessage = message.trim();
		if (!commitMessage && getConfig().defaultCommitMessage) {
			commitMessage = getConfig().defaultCommitMessage + ' (' + this._timestamp() + ')';
		}
		if (!commitMessage && !amend) return 'Commit message is required.';
		const hasStagedChanges = this._changes.some((c) => c.staged);
		if (!hasStagedChanges) {
			const files = this._changes.map((c) => c.path);
			if (files.length === 0) return null;
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
		this._fileWatchers.forEach(d => d.dispose());
		if (this._refreshTimer !== null) clearTimeout(this._refreshTimer);
	}
}
