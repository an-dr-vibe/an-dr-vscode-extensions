import { abbrevCommit } from "@an-dr/commits-core/backend/utils/string";
import { BlameLineInfo } from "@an-dr/commits-core/data-source/models";
import * as vscode from "vscode";

import { Config } from "@/config";
import { CurrentUserIdentity, DataSource } from "@/dataSource";
import { RepoManager } from "@/extension/repoManager";
import { getPathFromUri } from "@/extension/utils/hostPaths";
import { logger } from "@/extension/utils/logger";
import { getRelativeTimeDiff } from "@/utils";

/**
 * Substitutes `${token}` placeholders in an inline blame message.
 *
 * `commit.hash_short` and `commit.summary` also accept a length, written
 * `${commit.summary,40}`. An unknown token renders as empty rather than
 * leaving the raw placeholder in the editor.
 */
export function formatBlameText(
  template: string,
  blame: BlameLineInfo,
  displayAuthor: string
): string {
  const tokens: { [token: string]: string } = {
    "author.name": displayAuthor,
    "author.mail": blame.authorEmail,
    "commit.hash": blame.hash,
    "commit.hash_short": abbrevCommit(blame.hash),
    "commit.summary": blame.summary,
    "time.ago": getRelativeTimeDiff(blame.authorTime)
  };
  return template.replace(/\$\{([^}]+)\}/g, (_match, token: string) => {
    const trimmed = token.trim();
    if (typeof tokens[trimmed] === "string") {
      return tokens[trimmed];
    }
    const shortHash = trimmed.match(/^commit\.hash_short,(\d+)$/);
    if (shortHash) {
      return blame.hash.substring(0, parseInt(shortHash[1], 10));
    }
    const summary = trimmed.match(/^commit\.summary,(\d+)$/);
    if (summary) {
      return blame.summary.substring(0, parseInt(summary[1], 10));
    }
    return "";
  });
}

/** Whether a hover setting shows blame detail on the inline decoration. */
export function shouldShowInlineHover(mode: string) {
  return mode === "inline" || mode === "inline-status";
}

/**
 * Renders inline blame for the active line of the active editor.
 *
 * Blame is read per document version and cached, so moving the cursor within
 * an unchanged document costs nothing. Editing invalidates the cache and
 * cancels any in-flight blame, because that result can no longer be mapped to
 * the new line numbering.
 */
export class InlineBlameController {
  private readonly decorationType: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly currentUserCache = new Map<string, Promise<CurrentUserIdentity | null>>();

  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private requestId = 0;
  private cachedBlameKey: string | null = null;
  private cachedBlame: Promise<ReadonlyMap<number, BlameLineInfo>> | null = null;
  private blameCancellation: vscode.CancellationTokenSource | null = null;
  private renderedEditor: vscode.TextEditor | null = null;
  private renderedVersion: number | null = null;
  private renderedLine: number | null = null;
  private disposed = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly repoManager: RepoManager,
    private readonly config: Config
  ) {
    this.decorationType = vscode.window.createTextEditorDecorationType({});
    this.disposables.push(
      this.decorationType,
      repoManager.onDidChangeRepos(() => {
        this.currentUserCache.clear();
        this.invalidateBlameCache();
        this.scheduleRefresh(vscode.window.activeTextEditor, 0);
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => this.scheduleRefresh(editor, 0)),
      vscode.window.onDidChangeTextEditorSelection((event) =>
        this.scheduleRefresh(event.textEditor, this.config.blameDelay())
      ),
      vscode.workspace.onDidChangeTextDocument((event) => {
        const active = vscode.window.activeTextEditor;
        if (active && event.document === active.document) {
          this.invalidateBlameCache();
          this.scheduleRefresh(active, this.config.blameDelay());
        }
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        const active = vscode.window.activeTextEditor;
        if (active && document === active.document) {
          this.scheduleRefresh(active, 0);
        }
      }),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.invalidateBlameCache();
        const active = vscode.window.activeTextEditor;
        if (active && active.document === document) {
          this.clear(active);
        }
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (this.config.affectsBlame(event)) {
          this.currentUserCache.clear();
          this.invalidateBlameCache();
          this.scheduleRefresh(vscode.window.activeTextEditor, 0);
        }
      })
    );
    this.scheduleRefresh(vscode.window.activeTextEditor, 0);
  }

  public dispose() {
    this.disposed = true;
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.clear(vscode.window.activeTextEditor);
    this.invalidateBlameCache();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }

  private scheduleRefresh(editor: vscode.TextEditor | undefined, delayMs: number) {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(
      () => {
        this.refreshTimer = null;
        void this.update(editor);
      },
      Math.max(0, delayMs)
    );
  }

  private async update(editor: vscode.TextEditor | undefined) {
    const requestId = ++this.requestId;
    if (!this.config.inlineBlameEnabled()) {
      this.clear(editor);
      return;
    }
    // Only real files on disk can be blamed; diffs and virtual documents cannot.
    if (!editor || editor.document.uri.scheme !== "file") {
      this.clear(editor);
      return;
    }
    if (editor.document.lineCount > this.config.blameMaxLineCount()) {
      this.clear(editor);
      return;
    }

    const lineNumber = editor.selection.active.line;
    if (
      this.renderedEditor === editor &&
      this.renderedVersion === editor.document.version &&
      this.renderedLine === lineNumber
    ) {
      return;
    }

    const filePath = getPathFromUri(editor.document.uri);
    const repo = this.repoManager.getRepoContainingFile(filePath);
    if (repo === null) {
      this.clear(editor);
      return;
    }

    try {
      const blameMap = await this.getDocumentBlame(
        repo,
        filePath,
        editor.document.uri.toString(),
        editor.document.version
      );
      const blame = blameMap.get(lineNumber) ?? null;
      if (this.isStale(requestId, editor)) {
        return;
      }
      if (blame === null) {
        editor.setDecorations(this.decorationType, []);
        this.setRenderedLocation(editor, lineNumber);
        return;
      }

      const displayAuthor = await this.getDisplayAuthor(repo, blame);
      if (this.isStale(requestId, editor)) {
        return;
      }

      this.setRenderedLocation(editor, lineNumber);
      editor.setDecorations(this.decorationType, [
        {
          hoverMessage: shouldShowInlineHover(this.config.blameExtendedHoverInformation())
            ? this.getTooltip(blame, displayAuthor)
            : undefined,
          range: editor.document.lineAt(lineNumber).range,
          renderOptions: {
            after: {
              contentText: this.getInlineText(blame, displayAuthor),
              margin: `0 0 0 ${this.config.blameInlineMessageMargin()}rem`,
              color: new vscode.ThemeColor("gitblame.inlineMessage")
            }
          }
        }
      ]);
    } catch (error) {
      if (requestId !== this.requestId) {
        return;
      }
      logger.log(`Unable to load inline blame: ${String(error)}`);
      this.clear(editor);
    }
  }

  /** A result is stale once disposed, superseded, or the editor changed. */
  private isStale(requestId: number, editor: vscode.TextEditor) {
    return (
      this.disposed || requestId !== this.requestId || vscode.window.activeTextEditor !== editor
    );
  }

  private clear(editor: vscode.TextEditor | undefined) {
    this.requestId++;
    this.renderedEditor = null;
    this.renderedVersion = null;
    this.renderedLine = null;
    editor?.setDecorations(this.decorationType, []);
  }

  /** Blame for one document version, reused until that version changes. */
  private getDocumentBlame(repo: string, filePath: string, uri: string, version: number) {
    const key = `${repo}\0${uri}@${version}`;
    if (this.cachedBlameKey === key && this.cachedBlame !== null) {
      return this.cachedBlame;
    }
    this.invalidateBlameCache();

    const cancellation = new vscode.CancellationTokenSource();
    const blame = this.dataSource.getBlameFile(
      repo,
      filePath,
      {
        ignoreWhitespace: this.config.blameIgnoreWhitespace(),
        detectMoveOrCopyFromOtherFiles: this.config.blameDetectMoveOrCopyFromOtherFiles()
      },
      cancellation.token
    );
    this.cachedBlameKey = key;
    this.cachedBlame = blame;
    this.blameCancellation = cancellation;
    blame.then(
      () => this.disposeBlameCancellation(cancellation),
      () => this.disposeBlameCancellation(cancellation)
    );
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
    if (this.blameCancellation === cancellation) {
      this.blameCancellation = null;
    }
  }

  private setRenderedLocation(editor: vscode.TextEditor, line: number) {
    this.renderedEditor = editor;
    this.renderedVersion = editor.document.version;
    this.renderedLine = line;
  }

  private getInlineText(blame: BlameLineInfo, displayAuthor: string) {
    return blame.committed
      ? formatBlameText(this.config.blameInlineMessageFormat(), blame, displayAuthor)
      : this.config.blameInlineMessageNoCommit();
  }

  private getTooltip(blame: BlameLineInfo, displayAuthor: string) {
    if (!blame.committed) {
      return `Commits\n${this.config.blameInlineMessageNoCommit()}`;
    }
    return [
      blame.summary,
      `${displayAuthor} • ${getRelativeTimeDiff(blame.authorTime)}`,
      abbrevCommit(blame.hash)
    ].join("\n");
  }

  /** Substitutes the configured alias when the line is your own work. */
  private async getDisplayAuthor(repo: string, blame: BlameLineInfo) {
    const alias = this.config.blameCurrentUserAlias().trim();
    if (!blame.committed || alias === "" || blame.authorEmail === "") {
      return blame.author;
    }
    const currentUser = await this.getCurrentUserIdentity(repo);
    if (currentUser === null) {
      return blame.author;
    }
    return currentUser.emails.has(blame.authorEmail.toLowerCase()) ||
      currentUser.names.has(blame.author)
      ? alias
      : blame.author;
  }

  private getCurrentUserIdentity(repo: string) {
    const cached = this.currentUserCache.get(repo);
    if (cached !== undefined) {
      return cached;
    }
    const promise = this.dataSource.getCurrentUserIdentity(repo).catch(() => null);
    this.currentUserCache.set(repo, promise);
    return promise;
  }
}
