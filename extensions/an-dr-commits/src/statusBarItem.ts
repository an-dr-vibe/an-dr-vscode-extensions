import * as vscode from 'vscode';
import { getConfig } from './config';
import { Logger } from './logger';
import { RepoChangeEvent } from './repoManager';
import { Disposable } from './utils/disposable';
import { Event } from './utils/event';
import { countChanges, GitChangeCounts } from './views/sidebar/sidebarView';

/**
 * Manages the Commits Status Bar Item — a single button that opens the Commits View.
 * Displays the current branch name, updated whenever the active editor's repo HEAD changes.
 */
export class StatusBarItem extends Disposable {
	private static readonly ICON = '$(git-branch)';
	private static readonly FALLBACK_LABEL = 'Commits';

	private readonly logger: Logger;
	private readonly item: vscode.StatusBarItem;
	private numRepos: number = 0;
	private branchName: string | null = null;
	private isVisible: boolean = false;
	private changes: GitChangeCounts = { modified: 0, deleted: 0 };

	constructor(initialNumRepos: number, onDidChangeRepos: Event<RepoChangeEvent>, onDidChangeConfiguration: Event<vscode.ConfigurationChangeEvent>, logger: Logger) {
		super();
		this.logger = logger;

		this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
		this.item.command = 'an-dr-commits.viewFromStatusBar';

		this.registerDisposables(
			onDidChangeRepos((event) => {
				this.numRepos = event.numRepos;
				this.refresh();
			}),
			onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration('an-dr-commits.showStatusBarItem') ||
					event.affectsConfiguration('an-dr-commits.statusBarIconOnly') ||
					event.affectsConfiguration('an-dr-commits.statusBarItem.dirtyIndicator')) {
					this.refresh();
				}
			}),
			this.item
		);

		this.numRepos = initialNumRepos;
		this.subscribeToGitApi();
		this.refresh();
	}

	private subscribeToGitApi() {
		const gitExt = vscode.extensions.getExtension('vscode.git');
		if (!gitExt) { return; }

		const attach = (api: any) => {
			const pickRepo = () => {
				// Prefer the repo rooted at the workspace folder to avoid picking a
				// submodule when the active editor happens to be inside one.
				const folders = vscode.workspace.workspaceFolders;
				if (folders && folders.length > 0) {
					const wsPath = folders[0].uri.fsPath;
					const wsRepo = api.repositories.find((r: any) => r.rootUri?.fsPath === wsPath);
					if (wsRepo) { return wsRepo; }
				}
				const activeUri = vscode.window.activeTextEditor?.document.uri;
				const activeRepo = activeUri ? api.getRepository(activeUri) : null;
				return activeRepo ?? (api.repositories.length > 0 ? api.repositories[0] : null);
			};

			const update = () => {
				const repo = pickRepo();
				this.branchName = (repo?.state?.HEAD?.name as string | undefined) ?? null;
				this.changes = repo ? countChanges(repo) : { modified: 0, deleted: 0 };
				this.refresh();
			};

			const watchRepo = (r: any) => {
				this.registerDisposables(r.state.onDidChange(update));
			};

			api.repositories.forEach(watchRepo);
			this.registerDisposables(
				api.onDidOpenRepository((r: any) => { watchRepo(r); update(); }),
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

	private refresh() {
		const config = getConfig();
		const label = this.branchName ?? StatusBarItem.FALLBACK_LABEL;
		const base = config.statusBarIconOnly ? StatusBarItem.ICON : StatusBarItem.ICON + ' ' + label;
		this.item.text = base + this.formatDirty(config.statusBarItemDirtyIndicator);
		this.item.tooltip = this.branchName !== null
			? StatusBarItem.FALLBACK_LABEL + ': ' + this.branchName
			: StatusBarItem.FALLBACK_LABEL;

		const shouldShow = config.showStatusBarItem && this.numRepos > 0;
		if (this.isVisible !== shouldShow) {
			if (shouldShow) {
				this.item.show();
				this.logger.logDebug('Showing Commits Status Bar Item');
			} else {
				this.item.hide();
				this.logger.logDebug('Hiding Commits Status Bar Item');
			}
			this.isVisible = shouldShow;
		}
	}

	private formatDirty(format: '+N -M' | '*' | 'none'): string {
		const { modified, deleted } = this.changes;
		const total = modified + deleted;
		if (total === 0 || format === 'none') { return ''; }
		if (format === '*') { return ' *'; }
		// '+N -M'
		const parts: string[] = [];
		if (modified > 0) { parts.push('+' + modified); }
		if (deleted > 0) { parts.push('-' + deleted); }
		return parts.length > 0 ? ' ' + parts.join(' ') : '';
	}
}
