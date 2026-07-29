import * as vscode from 'vscode';
import { getConfig } from './config';
import { BlameLineInfo, DataSource } from './dataSource';
import { Logger } from './logger';
import { RepoManager } from './repoManager';
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
	private readonly decorationType: vscode.TextEditorDecorationType;
	private readonly currentUserCache = new Map<string, Promise<CurrentUserIdentity | null>>();

	private refreshTimer: ReturnType<typeof setTimeout> | null = null;
	private requestId: number = 0;
	private cachedBlameKey: string | null = null;
	private cachedBlame: Promise<ReadonlyMap<number, BlameLineInfo>> | null = null;
	private blameCancellation: vscode.CancellationTokenSource | null = null;
	private renderedEditor: vscode.TextEditor | null = null;
	private renderedVersion: number | null = null;
	private renderedLine: number | null = null;

	constructor(dataSource: DataSource, repoManager: RepoManager, _statusBarItem: unknown, onDidChangeConfiguration: Event<vscode.ConfigurationChangeEvent>, logger: Logger) {
		super();
		this.dataSource = dataSource;
		this.logger = logger;
		this.repoManager = repoManager;
		this.decorationType = vscode.window.createTextEditorDecorationType({});

		this.registerDisposables(
			this.decorationType,
			repoManager.onDidChangeRepos(() => {
				this.currentUserCache.clear();
				this.invalidateBlameCache();
				this.scheduleRefresh(vscode.window.activeTextEditor, 0);
			}),
			vscode.window.onDidChangeActiveTextEditor((editor) => this.scheduleRefresh(editor, 0)),
			vscode.window.onDidChangeTextEditorSelection((event) => this.scheduleRefresh(event.textEditor, getConfig().blameDelay)),
			vscode.workspace.onDidChangeTextDocument((event) => {
				if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
					this.invalidateBlameCache();
					this.scheduleRefresh(vscode.window.activeTextEditor, getConfig().blameDelay);
				}
			}),
			vscode.workspace.onDidSaveTextDocument((document) => {
				if (vscode.window.activeTextEditor && document === vscode.window.activeTextEditor.document) {
					this.scheduleRefresh(vscode.window.activeTextEditor, 0);
				}
			}),
			vscode.workspace.onDidCloseTextDocument((document) => {
				this.invalidateBlameCache();
				if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document === document) {
					this.clear(vscode.window.activeTextEditor);
				}
			}),
			onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration('an-dr-commits.blame') || event.affectsConfiguration('an-dr-commits.inlineBlame.enabled')) {
					this.currentUserCache.clear();
					this.invalidateBlameCache();
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
		this.invalidateBlameCache();
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
		if (!config.inlineBlameEnabled) {
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

		const lineNumber = editor.selection.active.line;
		if (this.renderedEditor === editor && this.renderedVersion === editor.document.version && this.renderedLine === lineNumber) {
			return;
		}

		const filePath = getPathFromUri(editor.document.uri);
		const repo = await this.repoManager.resolveRepoContainingFile(filePath);
		if (repo === null) {
			this.clear(editor);
			return;
		}

		try {
			const blame = (await this.getDocumentBlame(repo, filePath, editor.document.uri.toString(), editor.document.version)).get(lineNumber) ?? null;
			if (this.isDisposed() || currentRequestId !== this.requestId || vscode.window.activeTextEditor !== editor) {
				return;
			}

			if (blame === null) {
				editor.setDecorations(this.decorationType, []);
				this.setRenderedLocation(editor, lineNumber);
				return;
			}

			const displayAuthor = await this.getDisplayAuthor(repo, blame);
			if (this.isDisposed() || currentRequestId !== this.requestId || vscode.window.activeTextEditor !== editor) {
				return;
			}
			const line = editor.document.lineAt(lineNumber);
			const hoverMessage = this.shouldShowInlineHover(config.blameExtendedHoverInformation) ? this.getTooltip(blame, displayAuthor) : undefined;
			this.setRenderedLocation(editor, lineNumber);
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
		this.renderedEditor = null;
		this.renderedVersion = null;
		this.renderedLine = null;
		if (editor) {
			editor.setDecorations(this.decorationType, []);
		}
	}

	private getDocumentBlame(repo: string, filePath: string, uri: string, version: number) {
		const key = repo + '\0' + uri + '@' + version;
		if (this.cachedBlameKey === key && this.cachedBlame !== null) return this.cachedBlame;
		this.invalidateBlameCache();
		const cancellation = new vscode.CancellationTokenSource();
		const blame = this.dataSource.getBlameFile(repo, filePath, cancellation.token);
		this.cachedBlameKey = key;
		this.cachedBlame = blame;
		this.blameCancellation = cancellation;
		blame.then(() => this.disposeBlameCancellation(cancellation), () => this.disposeBlameCancellation(cancellation));
		return blame;
	}

	private invalidateBlameCache() {
		this.blameCancellation?.cancel();
		this.blameCancellation?.dispose();
		this.blameCancellation = null;
		this.cachedBlameKey = null;
		this.cachedBlame = null;
	}

	private disposeBlameCancellation(cancellation: vscode.CancellationTokenSource) {
		cancellation.dispose();
		if (this.blameCancellation === cancellation) this.blameCancellation = null;
	}

	private setRenderedLocation(editor: vscode.TextEditor, line: number) {
		this.renderedEditor = editor;
		this.renderedVersion = editor.document.version;
		this.renderedLine = line;
	}

	private getInlineText(blame: BlameLineInfo, displayAuthor: string) {
		const config = getConfig();
		if (!blame.committed) {
			return config.blameInlineMessageNoCommit;
		}
		return formatBlameText(config.blameInlineMessageFormat, blame, displayAuthor);
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
