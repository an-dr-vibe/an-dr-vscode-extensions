import * as vscode from 'vscode';
import * as path from 'path';
import { log } from '../logger';
import type { SymbolSource, EditorContext } from '../../shared/protocol/messages';
import { SymbolResolver, SymbolResolveResult } from './SymbolResolver';

export type { SymbolSource, EditorContext };

const LANG_DISPLAY: Record<string, string> = {
    c:                  'C',
    cpp:                'C++',
    rust:               'Rust',
    python:             'Python',
    typescript:         'TypeScript',
    typescriptreact:    'TypeScript (React)',
    javascript:         'JavaScript',
    javascriptreact:    'JavaScript (React)',
    go:                 'Go',
    java:               'Java',
    csharp:             'C#',
    ruby:               'Ruby',
    shellscript:        'Shell',
    yaml:               'YAML',
    json:               'JSON',
    markdown:           'Markdown',
    html:               'HTML',
    css:                'CSS',
    xml:                'XML',
};

export class ContextTracker implements vscode.Disposable {
    private readonly _onContextChange = new vscode.EventEmitter<EditorContext | null>();
    readonly onContextChange = this._onContextChange.event;
    private readonly _symbolResolver = new SymbolResolver();

    private _isPinned = false;
    private _current: EditorContext | null = null;
    private _currentCallHierarchyItem: vscode.CallHierarchyItem | undefined;
    // Track the position at which the current item was resolved, to detect staleness.
    private _callHierarchyItemPos: { fsPath: string; line: number; character: number } | undefined;
    private _debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private _updateId = 0;
    private _lastResolvedPos: { fsPath: string; line: number; character: number } | undefined;
    private readonly _disposables: vscode.Disposable[] = [];

    constructor() {
        this._disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => {
                if (!this._isPinned) { void this._update(); }
            }),
            vscode.window.onDidChangeTextEditorSelection(() => {
                if (this._isPinned) { return; }
                clearTimeout(this._debounceTimer);
                this._debounceTimer = setTimeout(() => void this._update(), 300);
            }),
        );
        void this._update();
    }

    pin(): void {
        this._isPinned = true;
        if (this._current) {
            this._current = { ...this._current, isPinned: true };
            this._onContextChange.fire(this._current);
        }
    }

    unpin(): void {
        this._isPinned = false;
        this._lastResolvedPos = undefined; // force re-resolve after unpin
        void this._update();
    }

    toggle(): void {
        this._isPinned ? this.unpin() : this.pin();
    }

    isPinned(): boolean { return this._isPinned; }

    get current(): EditorContext | null { return this._current; }

    /**
     * Force an immediate re-resolve from the active editor at the given position.
     * Clears the position cache so the same-position guard doesn't skip the update.
     * Returns the resolved context (or current after safety timeout).
     */
    async forceUpdateAt(doc: vscode.TextDocument, pos: vscode.Position): Promise<EditorContext | null> {
        this._lastResolvedPos = undefined;
        log.appendLine(`[forceUpdateAt] ${doc.uri.fsPath.split(/[\\/]/).pop()}:${pos.line}:${pos.character}`);

        // Try up to 4 times with increasing delays — clangd often cancels the first
        // prepareCallHierarchy call while the editor is still opening/focusing.
        const delays = [200, 500, 1000, 1500];
        for (const delay of delays) {
            await new Promise<void>(r => setTimeout(r, delay));
            this._lastResolvedPos = undefined;
            const ctx = await new Promise<EditorContext | null>(resolve => {
                const disposable = this._onContextChange.event(ctx => {
                    log.appendLine(`[forceUpdateAt] onContextChange fired: symbol=${ctx?.symbol} source=${ctx?.symbolSource}`);
                    if (ctx?.symbolSource === 'call-hierarchy' || ctx?.symbolSource === 'document-symbol') {
                        disposable.dispose();
                        resolve(ctx);
                    }
                });
                void this._resolveAt(doc, pos, ++this._updateId);
                setTimeout(() => { disposable.dispose(); resolve(null); }, 1500);
            });
            if (ctx) {
                log.appendLine(`[forceUpdateAt] resolved after ${delay}ms delay: symbol=${ctx.symbol} source=${ctx.symbolSource}`);
                return ctx;
            }
            log.appendLine(`[forceUpdateAt] attempt after ${delay}ms failed, retrying…`);
        }
        log.appendLine(`[forceUpdateAt] all retries exhausted — current: symbol=${this._current?.symbol} source=${this._current?.symbolSource}`);
        return this._current;
    }

    get currentCallHierarchyItem(): vscode.CallHierarchyItem | undefined {
        return this._currentCallHierarchyItem;
    }

    private async _update(): Promise<void> {
        const id = ++this._updateId;
        const editor = vscode.window.activeTextEditor;

        if (!editor || editor.document.uri.scheme !== 'file') {
            // Webview panels and output channels fire onDidChangeActiveTextEditor with
            // undefined or non-file URIs — don't clear the last valid source-file context.
            return;
        }

        const doc = editor.document;
        const pos = editor.selection.active;
        const fsPath = doc.uri.fsPath;

        // Skip if position hasn't changed since last completed resolve — VS Code fires
        // onDidChangeTextEditorSelection for reasons beyond cursor movement (LSP responses,
        // highlight updates) which would otherwise cause continuous re-polling.
        if (
            this._lastResolvedPos &&
            this._lastResolvedPos.fsPath === fsPath &&
            this._lastResolvedPos.line === pos.line &&
            this._lastResolvedPos.character === pos.character
        ) {
            return;
        }

        // Clear the stored item only when switching to a different file — not when
        // tier 1 simply fails at the current cursor position (e.g. cursor on whitespace).
        if (this._currentCallHierarchyItem?.uri.fsPath !== fsPath) {
            this._currentCallHierarchyItem = undefined;
            this._callHierarchyItemPos = undefined;
        }

        await this._resolveAt(doc, pos, id);
    }

    /** Resolve the symbol at the given position and emit context when still current. */
    private async _resolveAt(doc: vscode.TextDocument, pos: vscode.Position, id: number): Promise<void> {
        const result = await this._symbolResolver.resolveAt(doc, pos, () => id === this._updateId);
        if (!result) { return; }
        this._applyResolveResult(id, doc, result);
    }

    private _applyResolveResult(id: number, doc: vscode.TextDocument, result: SymbolResolveResult): void {
        const fsPath = doc.uri.fsPath;
        if (result.callHierarchyItem) {
            this._currentCallHierarchyItem = result.callHierarchyItem;
            this._callHierarchyItemPos = {
                fsPath,
                line: result.resolvedPos.line,
                character: result.resolvedPos.character,
            };
        } else if (result.callHierarchyMissed && this._callHierarchyItemPos?.fsPath === fsPath) {
            this._currentCallHierarchyItem = undefined;
            this._callHierarchyItemPos = undefined;
        }
        this._emit(id, doc, {
            symbol: result.symbol,
            symbolKind: result.symbolKind,
            symbolSource: result.symbolSource,
        }, result.resolvedPos);
    }

    private _emit(
        id: number,
        doc: vscode.TextDocument,
        partial: Pick<EditorContext, 'symbol' | 'symbolSource'> & Partial<EditorContext>,
        pos?: vscode.Position
    ): void {
        if (id !== this._updateId) { return; }
        const filePath = doc.fileName ?? doc.uri.fsPath;
        const langId = doc.languageId ?? '';
        if (pos) {
            this._lastResolvedPos = { fsPath: filePath, line: pos.line, character: pos.character };
        }
        this._current = {
            ...partial,
            symbolSource: partial.symbolSource,
            file: path.basename(filePath),
            filePath,
            lang: LANG_DISPLAY[langId] ?? langId,
            langId,
            isPinned: this._isPinned,
        };
        this._onContextChange.fire(this._current);
    }

    dispose(): void {
        clearTimeout(this._debounceTimer);
        this._disposables.forEach(d => d.dispose());
        this._onContextChange.dispose();
    }
}
