import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from './config';
import { DataSource, GitWorkingTreeChange } from './dataSource';
import { ErrorInfo, GitFileStatus } from './types';
import { UNCOMMITTED, viewDiff } from './utils';

// Refactor note: this file intentionally keeps the Activity Bar provider and
// matching uncommitted-panel renderer together so the view remains self-contained.

/** Counts of changed files derived from the VS Code Git API repo state. */
export interface GitChangeCounts { modified: number; deleted: number; }

export interface GitActivityChange {
	readonly uri: vscode.Uri;
	readonly status: number;
	readonly repoRoot: string;
	readonly relativePath: string;
	readonly deleted: boolean;
}

interface ActivityBarMessage {
	readonly command: string;
	readonly filePath?: string;
	readonly message?: string;
	readonly amend?: boolean;
	readonly isUntracked?: boolean;
	readonly restoreToIndex?: boolean;
}

type CpTreeFolder = {
	folders: { [name: string]: CpTreeFolder };
	files: GitWorkingTreeChange[];
};

const STATUS_INDEX_DELETED = 2;
const STATUS_DELETED = 6;
const STATUS_IGNORED = 8;

function normalizePath(filePath: string) {
	return filePath.replace(/\\/g, '/');
}

function getRelativePath(repoRoot: string, filePath: string) {
	if (repoRoot === '') return normalizePath(filePath);
	const relative = path.relative(repoRoot, filePath);
	return normalizePath(relative === '' ? filePath : relative);
}

function getRepoRoot(repo: any) {
	return (repo.rootUri?.fsPath as string | undefined) ?? '';
}

export function getWorkingTreeChanges(repo: any): GitActivityChange[] {
	const all: any[] = [
		...(repo.state.workingTreeChanges ?? []),
		...(repo.state.indexChanges ?? []),
		...(repo.state.mergeChanges ?? []),
	];
	const seen = new Set<string>();
	const repoRoot = getRepoRoot(repo);
	const changes: GitActivityChange[] = [];
	for (const c of all) {
		const uri = c.uri as vscode.Uri | undefined;
		if (!uri || c.status === STATUS_IGNORED) continue;
		const key = uri.fsPath;
		if (key && seen.has(key)) { continue; }
		if (key) { seen.add(key); }
		changes.push({
			uri,
			status: c.status,
			repoRoot,
			relativePath: getRelativePath(repoRoot, uri.fsPath),
			deleted: c.status === STATUS_INDEX_DELETED || c.status === STATUS_DELETED
		});
	}
	return changes.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export function countChanges(repo: any): GitChangeCounts {
	return countWorkingTreeChanges(getWorkingTreeChanges(repo));
}

export function countWorkingTreeChanges(changes: ReadonlyArray<GitActivityChange>): GitChangeCounts {
	let modified = 0, deleted = 0;
	for (const change of changes) {
		if (change.deleted) { deleted++; }
		else { modified++; }
	}
	return { modified, deleted };
}

/**
 * Activity Bar webview that mirrors the Commits uncommitted-changes panel for
 * the active repository, while keeping the existing activity badge behavior.
 */
export class ActivityBarView implements vscode.Disposable {
	private readonly dataSource: DataSource;
	private readonly extensionPath: string;
	private readonly _disposables: vscode.Disposable[] = [];
	private readonly _fileWatchers: vscode.Disposable[] = [];
	private _api: any = null;
	private _view: any = null;
	private _currentRepo: string | null = null;
	private _changes: GitWorkingTreeChange[] = [];
	private _refreshSeq = 0;
	private _refreshTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(context: vscode.ExtensionContext, dataSource: DataSource) {
		this.dataSource = dataSource;
		this.extensionPath = context.extensionPath;

		const registerWebviewViewProvider = (vscode.window as any).registerWebviewViewProvider;
		if (typeof registerWebviewViewProvider === 'function') {
			context.subscriptions.push(registerWebviewViewProvider.call(vscode.window, 'an-dr-commits.activityView', this, {
				webviewOptions: { retainContextWhenHidden: true }
			}));
		}
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
		const activeUri = vscode.window.activeTextEditor?.document.uri;
		let repo = activeUri && typeof this._api.getRepository === 'function'
			? this._api.getRepository(activeUri)
			: null;
		if (!repo) repo = this._api.repositories[0];
		return (repo?.rootUri?.fsPath as string | undefined) ?? null;
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
		const repo = this._resolveActiveRepoPath();
		this._currentRepo = repo;
		if (repo === null) {
			this._changes = [];
			this._view.webview.html = this._renderHtml(null, [], null);
			return;
		}
		const result = await this.dataSource.getWorkingTreeChanges(repo);
		if (seq !== this._refreshSeq) return;
		this._changes = result.changes;
		this._view.webview.html = this._renderHtml(repo, result.changes, result.error);
	}

	private async _handleMessage(msg: ActivityBarMessage) {
		const repo = this._currentRepo;
		if (msg.command === 'openCommits') {
			await vscode.commands.executeCommand('an-dr-commits.view');
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

	private _renderHtml(repo: string | null, changes: GitWorkingTreeChange[], error: ErrorInfo) {
		const nonce = Date.now().toString(36);
		const cssUri = this._view.webview.asWebviewUri(vscode.Uri.file(path.join(this.extensionPath, 'media', 'out.min.css')));
		const cspSource = String(this._view.webview.cspSource).replace(/\/$/g, '');
		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${cssUri}">
<style>${this._activityCss()}</style>
</head>
<body class="activityChangesBody">
<div id="activityTop">
	<button id="activityOpenCommits" class="activityPrimaryBtn">${this._codicon('git-commit')}<span>Open Commits</span></button>
	<button id="activityRefresh" class="activityIconBtn" title="Refresh">${this._codicon('sync')}</button>
</div>
<div id="activityRepo" title="${this._esc(repo ?? '')}">${repo === null ? 'No Git repository' : this._esc(path.basename(repo))}</div>
<div id="activityContent">${error !== null ? '<div class="cpError">' + this._esc(error) + '</div>' : this._renderContent(changes)}</div>
<div id="activityFooter">${this._renderFooter()}</div>
<script nonce="${nonce}">${this._activityScript()}</script>
</body>
</html>`;
	}

	private _renderFooter() {
		return `<div id="cpFooter">` +
			`<textarea id="cpMessage" placeholder="Message (Ctrl+Enter to commit)" rows="3"></textarea>` +
			`<div id="cpCommitRow">` +
			`<button id="cpCommitBtn" disabled>${this._codicon('check')}&nbsp;Commit</button>` +
			`<button id="cpCommitArrow" disabled title="More commit options">&#9660;</button>` +
			`<div id="cpCommitMenu" class="hidden">` +
			`<button id="cpAmendBtn">Amend Previous Commit</button>` +
			`</div>` +
			`</div>` +
			`</div>`;
	}

	private _renderContent(changes: GitWorkingTreeChange[]) {
		const staged = changes.filter((c) => c.staged);
		const unstaged = changes.filter((c) => !c.staged && c.status !== 'U');
		const untracked = changes.filter((c) => c.status === 'U');
		const allUnstaged = [...unstaged, ...untracked];
		if (changes.length === 0) {
			return '<div class="cpPlaceholder">No uncommitted changes.</div>';
		}
		return this._renderSection('Staged Changes', staged, true) +
			this._renderSection('Changes', allUnstaged, false);
	}

	private _renderSection(title: string, files: GitWorkingTreeChange[], isStaged: boolean) {
		if (files.length === 0) return '';
		const stageAllAction = isStaged ? 'unstageAll' : 'stageAll';
		const stageAllTitle = isStaged ? 'Unstage all' : 'Stage all';
		const stageAllIcon = isStaged ? this._codicon('remove') : this._codicon('add');
		return `<div class="cpSection" data-staged="${isStaged}">` +
			`<div class="cpSectionHeader fileTreeFolder">` +
			`<span class="cpSectionArrow fileTreeFolderIcon">${this._codicon('folder-opened', 'fileTreeCodicon openFolderIcon')}</span>` +
			`<span class="cpSectionTitle gitFolderName">${this._esc(title)}</span>` +
			`<span class="cpSectionCount">${files.length}</span>` +
			`<button class="cpFileBtn cpSectionBtn" data-action="${stageAllAction}" title="${stageAllTitle}">${stageAllIcon}</button>` +
			`</div>` +
			this._renderTree(this._buildTree(files), isStaged) +
			`</div>`;
	}

	private _buildTree(files: GitWorkingTreeChange[]): CpTreeFolder {
		const root: CpTreeFolder = { folders: {}, files: [] };
		files.forEach((file) => {
			const parts = normalizePath(file.path).split('/');
			const fileName = parts.pop();
			if (!fileName) return;
			let cur = root;
			parts.forEach((part) => {
				if (!cur.folders[part]) cur.folders[part] = { folders: {}, files: [] };
				cur = cur.folders[part];
			});
			cur.files.push(file);
		});
		return root;
	}

	private _renderTree(folder: CpTreeFolder, isStaged: boolean, topLevel: boolean = true): string {
		const folderNames = Object.keys(folder.folders).sort((a, b) => a.localeCompare(b));
		const files = folder.files.slice().sort((a, b) => this._basename(a.path).localeCompare(this._basename(b.path)));
		const children = folderNames.map((name) =>
			`<li data-pathseg="${encodeURIComponent(name)}"><span class="fileTreeFolder cpTreeFolder">` +
			`<span class="fileTreeFolderIcon">${this._codicon('folder-opened', 'fileTreeCodicon openFolderIcon')}</span><span class="gitFolderName">${this._esc(name)}</span></span>` +
			this._renderTree(folder.folders[name], isStaged, false) +
			`</li>`
		).concat(files.map((file) => `<li data-pathseg="${encodeURIComponent(this._basename(file.path))}">${this._renderFileRow(file, isStaged)}</li>`));
		return `<ul class="fileTreeFolderContents${topLevel ? ' cpSectionFiles' : ''}">${children.join('')}</ul>`;
	}

	private _renderFileRow(f: GitWorkingTreeChange, isStaged: boolean): string {
		const name = this._esc(this._basename(f.path));
		const encodedPath = this._esc(f.path);
		const stageTitle = isStaged ? 'Unstage file' : 'Stage file';
		const stageAction = isStaged ? 'unstage' : 'stage';
		const stageIcon = isStaged ? this._codicon('remove') : this._codicon('add');
		const changeTypeMessage = this._statusTitle(f.status) + (f.oldPath ? ' (' + this._esc(f.oldPath) + ' -> ' + encodedPath + ')' : '');
		return `<div class="cpFile fileTreeFileRecord" data-path="${encodedPath}" data-status="${f.status}" data-staged="${isStaged}">` +
			`<span class="fileTreeFile gitDiffPossible" title="Click to View Diff - ${changeTypeMessage}">` +
			`<span class="fileTreeFileIcon">${this._codicon('file', 'fileTreeCodicon fileIcon')}</span>` +
			`<span class="gitFileName ${f.status}" title="${encodedPath + (f.oldPath ? ' <- ' + this._esc(f.oldPath) : '')}">${name}</span>` +
			`</span>` +
			(getConfig().enhancedAccessibility ? `<span class="fileTreeFileType" title="${changeTypeMessage}">${f.status}</span>` : '') +
			this._renderAddDel(f) +
			`<span class="cpFileActions">` +
			(isStaged
				? `<button class="cpFileBtn" data-action="${stageAction}" data-path="${encodedPath}" title="${stageTitle}">${stageIcon}</button>`
				: `<button class="cpFileBtn" data-action="${stageAction}" data-path="${encodedPath}" title="${stageTitle}">${stageIcon}</button>` +
				  `<button class="cpFileBtn" data-action="discard" data-path="${encodedPath}" data-untracked="${f.status === 'U'}" title="Discard changes">${this._codicon('discard')}</button>`
			) +
			`</span>` +
			`</div>`;
	}

	private _renderAddDel(f: GitWorkingTreeChange): string {
		if (f.additions === null || f.deletions === null) return '';
		return '<span class="fileTreeFileAddDel cpFileAddDel">(<span class="fileTreeFileAdd" title="' + f.additions + ' addition' + (f.additions !== 1 ? 's' : '') + '">+' + f.additions + '</span>|<span class="fileTreeFileDel" title="' + f.deletions + ' deletion' + (f.deletions !== 1 ? 's' : '') + '">-' + f.deletions + '</span>)</span>';
	}

	private _activityCss() {
		return `
body.activityChangesBody{position:fixed;inset:0;margin:0;background:var(--vscode-sideBar-background,var(--vscode-editor-background));color:var(--vscode-sideBar-foreground,var(--vscode-editor-foreground));font-family:var(--vscode-font-family);font-size:13px;display:flex;flex-direction:column;overflow:hidden;}
#activityTop{display:flex;align-items:center;gap:6px;padding:8px;border-bottom:1px solid rgba(128,128,128,0.22);box-sizing:border-box;}
.activityPrimaryBtn{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0;flex:1;border:1px solid var(--vscode-button-border,transparent);border-radius:3px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);font:inherit;font-weight:600;padding:5px 8px;cursor:pointer;}
.activityPrimaryBtn:hover{background:var(--vscode-button-hoverBackground);}
.activityIconBtn{display:flex;align-items:center;justify-content:center;width:28px;height:28px;border:none;border-radius:3px;background:transparent;color:inherit;opacity:0.72;cursor:pointer;}
.activityIconBtn:hover{opacity:1;background:var(--vscode-toolbar-hoverBackground,rgba(128,128,128,0.18));}
#activityRepo{padding:5px 10px;border-bottom:1px solid rgba(128,128,128,0.16);color:var(--vscode-descriptionForeground);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#activityContent{flex:1 1 0;overflow:auto;min-height:0;padding-top:4px;}
#activityFooter{flex:0 0 auto;border-top:1px solid rgba(128,128,128,0.2);}
#activityContent > .fileTreeFolderContents{display:inline-block;min-width:100%;}
#cpCommitBtn{display:flex;align-items:center;justify-content:center;gap:4px;}
`;
	}

	private _activityScript() {
		return `
const vscode = acquireVsCodeApi();
const root = document.body;
const message = document.getElementById('cpMessage');
const commitBtn = document.getElementById('cpCommitBtn');
const commitArrow = document.getElementById('cpCommitArrow');
const commitMenu = document.getElementById('cpCommitMenu');
function post(command, extra = {}) { vscode.postMessage(Object.assign({ command }, extra)); }
function updateCommitButton() {
	const hasChanges = document.querySelector('.cpFile') !== null;
	const hasMessage = !!(message && message.value.trim());
	const enabled = hasChanges && hasMessage;
	if (commitBtn) commitBtn.disabled = !enabled && !hasChanges;
	if (commitArrow) commitArrow.disabled = !hasChanges;
}
document.getElementById('activityOpenCommits')?.addEventListener('click', () => post('openCommits'));
document.getElementById('activityRefresh')?.addEventListener('click', () => post('refresh'));
message?.addEventListener('input', updateCommitButton);
message?.addEventListener('keydown', (e) => {
	if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && commitBtn && !commitBtn.disabled) {
		post('commit', { message: message.value, amend: false });
	}
});
commitBtn?.addEventListener('click', () => post('commit', { message: message ? message.value : '', amend: false }));
commitArrow?.addEventListener('click', (e) => { e.stopPropagation(); commitMenu?.classList.toggle('hidden'); });
document.getElementById('cpAmendBtn')?.addEventListener('click', () => post('commit', { message: message ? message.value : '', amend: true }));
document.addEventListener('click', () => commitMenu?.classList.add('hidden'));
root.addEventListener('click', (e) => {
	const target = e.target;
	const sectionHeader = target.closest?.('.cpSectionHeader');
	if (sectionHeader && !target.closest('.cpFileBtn')) {
		const section = sectionHeader.closest('.cpSection');
		section?.classList.toggle('cpCollapsed');
		const arrow = sectionHeader.querySelector('.cpSectionArrow .codicon');
		if (arrow) {
			const closed = section?.classList.contains('cpCollapsed');
			arrow.classList.toggle('codicon-folder', !!closed);
			arrow.classList.toggle('codicon-folder-opened', !closed);
		}
		return;
	}
	const folderElem = target.closest?.('.cpTreeFolder');
	if (folderElem) {
		const parent = folderElem.parentElement;
		const childList = parent?.querySelector(':scope > .fileTreeFolderContents');
		const icon = folderElem.querySelector('.fileTreeFolderIcon .codicon');
		const closed = !childList?.classList.contains('hidden');
		childList?.classList.toggle('hidden', closed);
		icon?.classList.toggle('codicon-folder', closed);
		icon?.classList.toggle('codicon-folder-opened', !closed);
		return;
	}
	const fileButton = target.closest?.('.cpFileBtn');
	if (fileButton) {
		e.stopPropagation();
		const action = fileButton.dataset.action;
		const path = fileButton.dataset.path;
		if (action === 'discard' && path && !confirm('Discard changes in ' + path + '?')) return;
		post(action, { filePath: path, isUntracked: fileButton.dataset.untracked === 'true' });
		return;
	}
	const fileRow = target.closest?.('.cpFile');
	if (fileRow && fileRow.dataset.status !== 'U') {
		post('openChanges', { filePath: fileRow.dataset.path });
	}
});
updateCommitButton();
`;
	}

	private _basename(p: string) {
		return normalizePath(p).split('/').pop() || p;
	}

	private _statusTitle(status: GitWorkingTreeChange['status']) {
		return status === 'U' ? 'Untracked' : status === 'A' ? 'Added' : status === 'D' ? 'Deleted' : status === 'R' ? 'Renamed' : 'Modified';
	}

	private _codicon(name: string, extraClass: string = '') {
		return '<span class="codicon codicon-' + name + (extraClass === '' ? '' : ' ' + extraClass) + '" aria-hidden="true"></span>';
	}

	private _esc(str: string) {
		const escapes: { [key: string]: string } = {
			'&': '&amp;',
			'<': '&lt;',
			'>': '&gt;',
			'"': '&quot;',
			'\'': '&#x27;',
			'/': '&#x2F;'
		};
		return str.replace(/[&<>"'\/]/g, (ch) => escapes[ch]);
	}

	dispose() {
		this._disposables.forEach(d => d.dispose());
		this._fileWatchers.forEach(d => d.dispose());
		if (this._refreshTimer !== null) clearTimeout(this._refreshTimer);
	}
}
