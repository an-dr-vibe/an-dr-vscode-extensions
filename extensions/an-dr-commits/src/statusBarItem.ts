import * as vscode from 'vscode';
import { getConfig } from './config';
import { GitChangeCounts } from './dataSource';
import { GitStatusMonitor } from './gitStatusMonitor';
import { Logger } from './logger';
import { RepoChangeEvent } from './repoManager';
import { Disposable } from './utils/disposable';
import { Event } from './utils/event';

/**
 * Manages the Commits Status Bar Item — a single button that opens the Commits View.
 * Displays the active repository's branch name and dirty state, sourced from the
 * GitStatusMonitor (no dependency on the vscode.git extension - see ADR-022).
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

	constructor(initialNumRepos: number, onDidChangeRepos: Event<RepoChangeEvent>, statusMonitor: GitStatusMonitor, onDidChangeConfiguration: Event<vscode.ConfigurationChangeEvent>, logger: Logger) {
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
			statusMonitor.onDidChangeStatus((status) => {
				this.branchName = status.branchName;
				this.changes = status.counts;
				this.refresh();
			}),
			this.item
		);

		this.numRepos = initialNumRepos;
		const status = statusMonitor.getStatus();
		this.branchName = status.branchName;
		this.changes = status.counts;
		this.refresh();
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
