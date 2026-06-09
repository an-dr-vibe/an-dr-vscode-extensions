import * as vscode from 'vscode';

/** Counts of changed files derived from the VS Code Git API repo state. */
export interface GitChangeCounts { modified: number; deleted: number; }

export function countChanges(repo: any): GitChangeCounts {
	const all: any[] = [
		...(repo.state.workingTreeChanges ?? []),
		...(repo.state.indexChanges ?? []),
		...(repo.state.mergeChanges ?? []),
	];
	const seen = new Set<string>();
	let modified = 0, deleted = 0;
	for (const c of all) {
		const key: string = c.uri?.fsPath ?? '';
		if (key && seen.has(key)) { continue; }
		if (key) { seen.add(key); }
		const s: number = c.status;
		if (s === 2 || s === 6) { deleted++; } // INDEX_DELETED, DELETED
		else if (s !== 8) { modified++; }       // not IGNORED
	}
	return { modified, deleted };
}

class OpenCommitsItem extends vscode.TreeItem {
	constructor() {
		super('Open Commits', vscode.TreeItemCollapsibleState.None);
		this.command = { command: 'an-dr-commits.view', title: 'Open Commits' };
		this.tooltip = 'Open the Commits graph';
	}
}

class ActivityBarTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined>;
	private readonly _emitter = new vscode.EventEmitter<vscode.TreeItem | undefined>();
	private readonly _item = new OpenCommitsItem();

	constructor() { this.onDidChangeTreeData = this._emitter.event; }

	getTreeItem(el: vscode.TreeItem): vscode.TreeItem { return el; }
	getChildren(): vscode.TreeItem[] { return [this._item]; }
}

/**
 * Registers the Commits activity-bar icon and keeps its badge in sync with
 * the number of uncommitted file changes in the active repository.
 */
export class ActivityBarView implements vscode.Disposable {
	private readonly _treeView: vscode.TreeView<vscode.TreeItem>;
	private readonly _disposables: vscode.Disposable[] = [];

	constructor(context: vscode.ExtensionContext) {
		const provider = new ActivityBarTreeProvider();
		this._treeView = vscode.window.createTreeView('an-dr-commits.activityView', {
			treeDataProvider: provider,
			showCollapseAll: false,
		});
		context.subscriptions.push(this._treeView);
		this._subscribeToGitApi();
	}

	private _subscribeToGitApi() {
		const gitExt = vscode.extensions.getExtension('vscode.git');
		if (!gitExt) { return; }

		const attach = (api: any) => {
			const update = () => {
				let counts: GitChangeCounts = { modified: 0, deleted: 0 };
				if (api.repositories.length > 0) {
					for (const repo of api.repositories) {
						const c = countChanges(repo);
						counts.modified += c.modified;
						counts.deleted += c.deleted;
					}
				}
				this._updateBadge(counts);
			};

			for (const repo of api.repositories) {
				this._disposables.push(repo.state.onDidChange(update));
			}
			this._disposables.push(
				api.onDidOpenRepository((r: any) => {
					this._disposables.push(r.state.onDidChange(update));
					update();
				})
			);
			update();
		};

		if (gitExt.isActive) {
			attach(gitExt.exports.getAPI(1));
		} else {
			gitExt.activate().then(() => attach(gitExt.exports.getAPI(1)));
		}
	}

	private _updateBadge(counts: GitChangeCounts) {
		const total = counts.modified + counts.deleted;
		(this._treeView as any).badge = total > 0
			? { value: total, tooltip: `${counts.modified} modified, ${counts.deleted} deleted` }
			: undefined;
	}

	dispose() {
		this._disposables.forEach(d => d.dispose());
	}
}
