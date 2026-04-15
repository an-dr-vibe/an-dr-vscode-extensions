import * as vscode from 'vscode';
import { getConfig } from './config';
import { BlameLineInfo, CommitDisplayInfo, DataSource } from './dataSource';
import { Logger } from './logger';
import { RepoManager } from './repoManager';
import { StatusBarItem } from './statusBarItem';
import { abbrevCommit, getPathFromUri, getRelativeTimeDiff } from './utils';
import { Disposable } from './utils/disposable';
import { Event } from './utils/event';

type HoverMode = 'off' | 'inline-status' | 'inline' | 'status';
type CurrentUserIdentity = {
	readonly emails: Set<string>;
	readonly names: Set<string>;
};

/**
 * Renders inline blame decorations for the active editor and optionally mirrors
	 * inline blame plus both status bar commit surfaces.
 */
export class InlineBlameController extends Disposable {
	private readonly dataSource: DataSource;
	private readonly logger: Logger;
	private readonly repoManager: RepoManager;
	private readonly statusBarItem: StatusBarItem;
	private readonly decorationType: vscode.TextEditorDecorationType;
	private readonly currentUserCache = new Map<string, Promise<CurrentUserIdentity | null>>();

	private refreshTimer: ReturnType<typeof setTimeout> | null = null;
	private requestId: number = 0;

	constructor(dataSource: DataSource, repoManager: RepoManager, statusBarItem: StatusBarItem, onDidChangeConfiguration: Event<vscode.ConfigurationChangeEvent>, logger: Logger) {
		super();
		this.dataSource = dataSource;
		this.logger = logger;
		this.repoManager = repoManager;
		this.statusBarItem = statusBarItem;
		this.decorationType = vscode.window.createTextEditorDecorationType({});

		this.registerDisposables(
			this.decorationType,
			repoManager.onDidChangeRepos(() => {
				this.currentUserCache.clear();
				this.scheduleRefresh(vscode.window.activeTextEditor, 0);
			}),
			vscode.window.onDidChangeActiveTextEditor((editor) => this.scheduleRefresh(editor, 0)),
			vscode.window.onDidChangeTextEditorSelection((event) => this.scheduleRefresh(event.textEditor, getConfig().blameDelay)),
			vscode.workspace.onDidChangeTextDocument((event) => {
				if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
					this.scheduleRefresh(vscode.window.activeTextEditor, getConfig().blameDelay);
				}
			}),
			vscode.workspace.onDidSaveTextDocument((document) => {
				if (vscode.window.activeTextEditor && document === vscode.window.activeTextEditor.document) {
					this.scheduleRefresh(vscode.window.activeTextEditor, 0);
				}
			}),
			vscode.workspace.onDidCloseTextDocument((document) => {
				if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document === document) {
					this.clear(vscode.window.activeTextEditor);
				}
			}),
			onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration('an-dr-commits.blame') || event.affectsConfiguration('an-dr-commits.inlineBlame.enabled') || event.affectsConfiguration('an-dr-commits.statusBarShowCurrentCommit')) {
					this.currentUserCache.clear();
					this.scheduleRefresh(vscode.window.activeTextEditor, 0);
				}
			})
		);
	}

	public refresh() {
		this.scheduleRefresh(vscode.window.activeTextEditor, 0);
	}

	public dispose() {
		if (this.refreshTimer !== null) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
		this.clear(vscode.window.activeTextEditor);
		super.dispose();
	}

	private scheduleRefresh(editor: vscode.TextEditor | undefined, delayMs: number) {
		if (this.refreshTimer !== null) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}

		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = null;
			void this.update(editor);
		}, Math.max(0, delayMs));
	}

	private async update(editor: vscode.TextEditor | undefined) {
		const currentRequestId = ++this.requestId;
		const config = getConfig();
		if (!config.inlineBlameEnabled && !config.statusBarShowCurrentCommit && !config.blameStatusBarItemEnabled) {
			this.clear(editor);
			return;
		}

		if (!editor || editor.document.uri.scheme !== 'file') {
			this.clear(editor);
			return;
		}

		if (editor.document.lineCount > config.blameMaxLineCount) {
			this.clear(editor);
			return;
		}

		const filePath = getPathFromUri(editor.document.uri);
		const repo = await this.repoManager.resolveRepoContainingFile(filePath);
		if (repo === null) {
			this.clear(editor);
			return;
		}

		try {
			const [repoCommit, blame] = await Promise.all([
				config.statusBarShowCurrentCommit ? this.dataSource.getCommitDisplayInfo(repo, 'HEAD') : Promise.resolve(null),
				(config.inlineBlameEnabled || config.blameStatusBarItemEnabled) ? this.dataSource.getBlameLine(repo, filePath, editor.selection.active.line) : Promise.resolve(null)
			]);
			if (this.isDisposed() || currentRequestId !== this.requestId || vscode.window.activeTextEditor !== editor) {
				return;
			}

			this.statusBarItem.setRepoCommit(this.getRepoCommitDisplay(repo, repoCommit));
			if (blame === null) {
				this.statusBarItem.setBlameCommit(null);
				editor.setDecorations(this.decorationType, []);
				return;
			}

			const displayAuthor = await this.getDisplayAuthor(repo, blame);
			if (this.isDisposed() || currentRequestId !== this.requestId || vscode.window.activeTextEditor !== editor) {
				return;
			}
			const statusBarDisplay = this.getStatusBarDisplay(blame, displayAuthor);
			this.statusBarItem.setBlameCommit({
				...statusBarDisplay,
				repo: repo
			});
			if (config.inlineBlameEnabled) {
				const line = editor.document.lineAt(editor.selection.active.line);
				const hoverMessage = this.shouldShowInlineHover(config.blameExtendedHoverInformation) ? this.getTooltip(blame, displayAuthor) : undefined;
				editor.setDecorations(this.decorationType, [{
					hoverMessage: hoverMessage,
					range: line.range,
					renderOptions: {
						after: {
							contentText: this.getInlineText(blame, displayAuthor),
							margin: '0 0 0 ' + config.blameInlineMessageMargin + 'rem',
							color: new vscode.ThemeColor('gitblame.inlineMessage')
						}
					}
				}]);
			} else {
				editor.setDecorations(this.decorationType, []);
			}
		} catch (error) {
			if (currentRequestId !== this.requestId) {
				return;
			}
			this.logger.logDebug('Unable to load inline blame: ' + String(error));
			this.clear(editor);
		}
	}

	private clear(editor: vscode.TextEditor | undefined) {
		this.requestId++;
		this.statusBarItem.setRepoCommit(null);
		this.statusBarItem.setBlameCommit(null);
		if (editor) {
			editor.setDecorations(this.decorationType, []);
		}
	}

	private getRepoCommitDisplay(repo: string, repoCommit: CommitDisplayInfo | null) {
		if (repoCommit === null) {
			return null;
		}
		return {
			repo: repo,
			text: abbrevCommit(repoCommit.hash),
			tooltip: repoCommit.summary || abbrevCommit(repoCommit.hash)
		};
	}

	private getInlineText(blame: BlameLineInfo, displayAuthor: string) {
		const config = getConfig();
		if (!blame.committed) {
			return config.blameInlineMessageNoCommit;
		}
		return formatBlameText(config.blameInlineMessageFormat, blame, displayAuthor);
	}

	private getStatusBarDisplay(blame: BlameLineInfo, displayAuthor: string) {
		const config = getConfig();
		if (!blame.committed) {
			return {
				repo: '',
				hash: null,
				text: config.blameStatusBarMessageNoCommit,
				tooltip: this.shouldShowStatusHover(config.blameExtendedHoverInformation)
					? 'Commits\n' + config.blameStatusBarMessageNoCommit
					: 'Commits'
			};
		}
		return {
			repo: '',
			hash: blame.hash,
			text: formatBlameText(config.blameStatusBarMessageFormat, blame, displayAuthor),
			tooltip: this.shouldShowStatusHover(config.blameExtendedHoverInformation) ? this.getTooltip(blame, displayAuthor) : 'Commits'
		};
	}

	private getTooltip(blame: BlameLineInfo, displayAuthor: string) {
		const config = getConfig();
		if (!blame.committed) {
			return 'Commits\n' + config.blameInlineMessageNoCommit;
		}
		return [
			blame.summary,
			displayAuthor + ' • ' + getRelativeTimeDiff(blame.authorTime),
			abbrevCommit(blame.hash)
		].join('\n');
	}

	private async getDisplayAuthor(repo: string, blame: BlameLineInfo) {
		const alias = getConfig().blameCurrentUserAlias.trim();
		if (!blame.committed || alias === '' || blame.authorEmail === '') {
			return blame.author;
		}

		const currentUser = await this.getCurrentUserIdentity(repo);
		if (currentUser === null) {
			return blame.author;
		}

		const authorEmail = blame.authorEmail.toLowerCase();
		return currentUser.emails.has(authorEmail) || currentUser.names.has(blame.author)
			? alias
			: blame.author;
	}

	private getCurrentUserIdentity(repo: string) {
		let promise = this.currentUserCache.get(repo);
		if (typeof promise !== 'undefined') {
			return promise;
		}

		promise = this.dataSource.getConfig(repo, []).then((result) => {
			if (result.config === null) {
				return null;
			}

			const emails = new Set<string>();
			const names = new Set<string>();
			const localEmail = result.config.user.email.local;
			const globalEmail = result.config.user.email.global;
			const localName = result.config.user.name.local;
			const globalName = result.config.user.name.global;
			if (localEmail !== null) emails.add(localEmail.toLowerCase());
			if (globalEmail !== null) emails.add(globalEmail.toLowerCase());
			if (localName !== null) names.add(localName);
			if (globalName !== null) names.add(globalName);
			return { emails, names };
		}).catch(() => null);
		this.currentUserCache.set(repo, promise);
		return promise;
	}

	private shouldShowInlineHover(mode: HoverMode) {
		return mode === 'inline' || mode === 'inline-status';
	}

	private shouldShowStatusHover(mode: HoverMode) {
		return mode === 'status' || mode === 'inline-status';
	}
}

function formatBlameText(template: string, blame: BlameLineInfo, displayAuthor: string) {
	const tokens: { [token: string]: string } = {
		'author.name': displayAuthor,
		'author.mail': blame.authorEmail,
		'commit.hash': blame.hash,
		'commit.hash_short': abbrevCommit(blame.hash),
		'commit.summary': blame.summary,
		'time.ago': getRelativeTimeDiff(blame.authorTime)
	};
	return template.replace(/\$\{([^}]+)\}/g, (_match, token: string) => {
		const trimmed = token.trim();
		if (typeof tokens[trimmed] === 'string') {
			return tokens[trimmed];
		}
		const shortHashMatch = trimmed.match(/^commit\.hash_short,(\d+)$/);
		if (shortHashMatch) {
			return blame.hash.substring(0, parseInt(shortHashMatch[1], 10));
		}
		const summaryMatch = trimmed.match(/^commit\.summary,(\d+)$/);
		if (summaryMatch) {
			return blame.summary.substring(0, parseInt(summaryMatch[1], 10));
		}
		return '';
	});
}
