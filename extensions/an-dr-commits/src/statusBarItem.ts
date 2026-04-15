import * as vscode from 'vscode';
import { getConfig } from './config';
import { Logger } from './logger';
import { RepoChangeEvent } from './repoManager';
import { Disposable } from './utils/disposable';
import { Event } from './utils/event';

/**
 * Manages the Commits Status Bar Item, which allows users to open the Commits View from the Visual Studio Code Status Bar.
 */
export class StatusBarItem extends Disposable {
	private static readonly COMMITS_NAME = 'Commits';
	private static readonly COMMITS_ICON = '$(git-commit)';
	private static readonly BLAME_NAME = 'Blame';
	private static readonly BLAME_ICON = '$(edit)';

	private readonly logger: Logger;
	private readonly commitsStatusBarItem: vscode.StatusBarItem;
	private readonly blameStatusBarItem: vscode.StatusBarItem;
	private activeCommit: { repo: string, hash: string | null, text: string, tooltip: string } | null = null;
	private isCommitsVisible: boolean = false;
	private isBlameVisible: boolean = false;
	private numRepos: number = 0;

	/**
	 * Creates the Commits Status Bar Item.
	 * @param repoManager The Commits RepoManager instance.
	 * @param logger The Commits Logger instance.
	 */
	constructor(initialNumRepos: number, onDidChangeRepos: Event<RepoChangeEvent>, onDidChangeConfiguration: Event<vscode.ConfigurationChangeEvent>, logger: Logger) {
		super();
		this.logger = logger;

		this.commitsStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
		this.commitsStatusBarItem.command = 'an-dr-commits.view';
		this.blameStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 0);

		this.registerDisposables(
			onDidChangeRepos((event) => {
				this.setNumRepos(event.numRepos);
			}),
			onDidChangeConfiguration((event) => {
				if (
					event.affectsConfiguration('an-dr-commits.showStatusBarItem') ||
					event.affectsConfiguration('an-dr-commits.statusBarIconOnly') ||
					event.affectsConfiguration('an-dr-commits.statusBarShowCurrentCommit') ||
					event.affectsConfiguration('an-dr-commits.blame.statusBarShowCurrentCommit') ||
					event.affectsConfiguration('an-dr-commits.blame.statusBarItemEnabled') ||
					event.affectsConfiguration('an-dr-commits.blame.statusBarIconOnly')
				) {
					this.refresh();
				}
			}),
			this.commitsStatusBarItem,
			this.blameStatusBarItem
		);

		this.setNumRepos(initialNumRepos);
	}

	/**
	 * Sets the number of repositories known to Commits, before refreshing the Status Bar Item.
	 * @param numRepos The number of repositories known to Commits.
	 */
	private setNumRepos(numRepos: number) {
		this.numRepos = numRepos;
		this.refresh();
	}

	/**
	 * Updates the current line's commit shown in the Status Bar Item.
	 * @param activeCommit The active commit display, or NULL to show the default Commits label.
	 */
	public setActiveCommit(activeCommit: { repo: string, hash: string | null, text: string, tooltip: string } | null) {
		this.activeCommit = activeCommit;
		this.refresh();
	}

	/**
	 * Show or hide the Status Bar Item according to the configured value of `an-dr-commits.showStatusBarItem`, and the number of repositories known to Commits.
	 */
	private refresh() {
		const config = getConfig();
		if (config.statusBarShowCurrentCommit && this.activeCommit !== null) {
			this.commitsStatusBarItem.text = StatusBarItem.COMMITS_ICON + ' ' + this.activeCommit.text;
			this.commitsStatusBarItem.tooltip = this.activeCommit.tooltip;
		} else {
			this.commitsStatusBarItem.text = config.statusBarIconOnly
				? StatusBarItem.COMMITS_ICON
				: StatusBarItem.COMMITS_ICON + ' ' + StatusBarItem.COMMITS_NAME;
			this.commitsStatusBarItem.tooltip = StatusBarItem.COMMITS_NAME;
		}
		const shouldShowCommits = config.showStatusBarItem && this.numRepos > 0;
		if (this.isCommitsVisible !== shouldShowCommits) {
			if (shouldShowCommits) {
				this.commitsStatusBarItem.show();
				this.logger.logDebug('Showing "' + StatusBarItem.COMMITS_NAME + '" Status Bar Item');
			} else {
				this.commitsStatusBarItem.hide();
				this.logger.logDebug('Hiding "' + StatusBarItem.COMMITS_NAME + '" Status Bar Item');
			}
			this.isCommitsVisible = shouldShowCommits;
		}

		if (this.activeCommit !== null) {
			this.blameStatusBarItem.text = config.blameStatusBarIconOnly
				? StatusBarItem.BLAME_ICON + ' ' + this.activeCommit.text
				: StatusBarItem.BLAME_ICON + ' ' + StatusBarItem.BLAME_NAME + ' ' + this.activeCommit.text;
			this.blameStatusBarItem.tooltip = this.activeCommit.tooltip;
			(this.blameStatusBarItem as vscode.StatusBarItem & { command?: any }).command = this.activeCommit.hash !== null
				? {
					title: 'Reveal Commit in Commits',
					command: 'an-dr-commits.revealCommitInGraph',
					arguments: [{ repo: this.activeCommit.repo, commitHash: this.activeCommit.hash }]
				}
				: undefined;
		}
		const shouldShowBlame = config.blameStatusBarItemEnabled && this.numRepos > 0 && this.activeCommit !== null;
		if (this.isBlameVisible !== shouldShowBlame) {
			if (shouldShowBlame) {
				this.blameStatusBarItem.show();
				this.logger.logDebug('Showing "' + StatusBarItem.BLAME_NAME + '" Status Bar Item');
			} else {
				this.blameStatusBarItem.hide();
				this.logger.logDebug('Hiding "' + StatusBarItem.BLAME_NAME + '" Status Bar Item');
			}
			this.isBlameVisible = shouldShowBlame;
		}
	}
}
