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
	private static readonly NAME = 'Commits';
	private static readonly ICON = '$(git-branch)';

	private readonly logger: Logger;
	private readonly statusBarItem: vscode.StatusBarItem;
	private isVisible: boolean = false;
	private numRepos: number = 0;

	/**
	 * Creates the Commits Status Bar Item.
	 * @param repoManager The Commits RepoManager instance.
	 * @param logger The Commits Logger instance.
	 */
	constructor(initialNumRepos: number, onDidChangeRepos: Event<RepoChangeEvent>, onDidChangeConfiguration: Event<vscode.ConfigurationChangeEvent>, logger: Logger) {
		super();
		this.logger = logger;

		const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1);
		statusBarItem.command = 'an-dr-commits.view';
		this.statusBarItem = statusBarItem;

		this.registerDisposables(
			onDidChangeRepos((event) => {
				this.setNumRepos(event.numRepos);
			}),
			onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration('an-dr-commits.showStatusBarItem') || event.affectsConfiguration('an-dr-commits.statusBarIconOnly')) {
					this.refresh();
				}
			}),
			statusBarItem
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
	 * Show or hide the Status Bar Item according to the configured value of `an-dr-commits.showStatusBarItem`, and the number of repositories known to Commits.
	 */
	private refresh() {
		const config = getConfig();
		this.statusBarItem.text = config.statusBarIconOnly
			? StatusBarItem.ICON
			: StatusBarItem.ICON + ' ' + StatusBarItem.NAME;
		this.statusBarItem.tooltip = StatusBarItem.NAME;
		const shouldBeVisible = config.showStatusBarItem && this.numRepos > 0;
		if (this.isVisible !== shouldBeVisible) {
			if (shouldBeVisible) {
				this.statusBarItem.show();
				this.logger.logDebug('Showing "' + StatusBarItem.NAME + '" Status Bar Item');
			} else {
				this.statusBarItem.hide();
				this.logger.logDebug('Hiding "' + StatusBarItem.NAME + '" Status Bar Item');
			}
			this.isVisible = shouldBeVisible;
		}
	}
}
