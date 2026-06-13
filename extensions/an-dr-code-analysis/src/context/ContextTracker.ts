import * as vscode from 'vscode';
import * as path from 'path';
import { log } from '../logger';
import type { SymbolSource, EditorContext } from '../webview/messages';

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

function findDeepestContaining(
    symbols: vscode.DocumentSymbol[],
    pos: vscode.Position
): vscode.DocumentSymbol | undefined {
    for (const sym of symbols) {
        if (sym.range.contains(pos)) {
            return findDeepestContaining(sym.children, pos) ?? sym;
        }
    }
    return undefined;
}

// Result of the 3-tier resolution attempt.
interface ResolveResult {
    symbol: string | undefined;
    symbolKind: number | undefined;
    symbolSource: SymbolSource;
    callHierarchyItem: vscode.CallHierarchyItem | undefined;
    // Position that was actually used (may differ from requested pos after tier-2 upgrade)
    resolvedPos: vscode.Position;
}

export class ContextTracker implements vscode.Disposable {
    private readonly _onContextChange = new vscode.EventEmitter<EditorContext | null>();
    readonly onContextChange = this._onContextChange.event;

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

    /**
     * 3-tier symbol resolution at the given position. Emits context change on success.
     * id is the current _updateId snapshot — any async step checks it to detect
     * superseded updates and bail out early.
     */
    private async _resolveAt(doc: vscode.TextDocument, pos: vscode.Position, id: number): Promise<void> {
        const fsPath = doc.uri.fsPath;
        const tag = `[resolveAt ${fsPath.split(/[\\/]/).pop()}:${pos.line}:${pos.character}]`;

        // Tier 1: LSP call hierarchy — exact semantic symbol, reusable by analyzer
        try {
            log.appendLine(`${tag} tier1 prepareCallHierarchy…`);
            const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                'vscode.prepareCallHierarchy', doc.uri, pos
            );
            if (id !== this._updateId) { log.appendLine(`${tag} tier1 cancelled`); return; }
            log.appendLine(`${tag} tier1 result: ${items?.length ?? 0} items`);
            if (items?.length) {
                this._currentCallHierarchyItem = items[0];
                this._callHierarchyItemPos = { fsPath, line: pos.line, character: pos.character };
                this._emit(id, doc, {
                    symbol: items[0].name,
                    symbolKind: items[0].kind,
                    symbolSource: 'call-hierarchy',
                }, pos);
                return;
            }
            // Tier 1 returned no items at this position — clear stale item if it was
            // resolved in this same file (it belongs to a different symbol now).
            if (this._callHierarchyItemPos?.fsPath === fsPath) {
                this._currentCallHierarchyItem = undefined;
                this._callHierarchyItemPos = undefined;
            }
        } catch (e) {
            log.appendLine(`${tag} tier1 threw: ${e}`);
            if (id !== this._updateId) { return; }
        }

        // Tier 2: Document symbol at the position
        try {
            log.appendLine(`${tag} tier2 executeDocumentSymbolProvider…`);
            const allSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider', doc.uri
            );
            if (id !== this._updateId) { log.appendLine(`${tag} tier2 cancelled`); return; }
            log.appendLine(`${tag} tier2 symbols: ${allSymbols?.length ?? 0} top-level`);
            if (allSymbols?.length) {
                const sym = findDeepestContaining(allSymbols, pos);
                log.appendLine(`${tag} tier2 deepest: ${sym?.name ?? 'none'}`);
                if (sym) {
                    // Try to upgrade to call-hierarchy using the symbol's name token position.
                    const upgradePos = sym.selectionRange.start;
                    log.appendLine(`${tag} tier2 upgrade prepareCallHierarchy at ${upgradePos.line}:${upgradePos.character}…`);
                    try {
                        const chItems = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                            'vscode.prepareCallHierarchy', doc.uri, upgradePos
                        );
                        if (id !== this._updateId) { return; }
                        log.appendLine(`${tag} tier2 upgrade result: ${chItems?.length ?? 0} items`);
                        if (chItems?.length) {
                            this._currentCallHierarchyItem = chItems[0];
                            this._callHierarchyItemPos = { fsPath, line: upgradePos.line, character: upgradePos.character };
                            this._emit(id, doc, {
                                symbol: chItems[0].name,
                                symbolKind: chItems[0].kind,
                                symbolSource: 'call-hierarchy',
                            }, upgradePos);
                            return;
                        }
                    } catch (e) {
                        log.appendLine(`${tag} tier2 upgrade threw: ${e}`);
                        if (id !== this._updateId) { return; }
                    }
                    log.appendLine(`${tag} tier2 emitting document-symbol: ${sym.name}`);
                    this._emit(id, doc, { symbol: sym.name, symbolKind: sym.kind, symbolSource: 'document-symbol' }, pos);
                    return;
                }
            }
        } catch (e) {
            log.appendLine(`${tag} tier2 threw: ${e}`);
            if (id !== this._updateId) { return; }
        }

        // Tier 3: Word under cursor — always available, semantically unreliable
        const wordRange = doc.getWordRangeAtPosition(pos);
        log.appendLine(`${tag} fell through to word: ${wordRange ? doc.getText(wordRange) : 'none'}`);
        this._emit(id, doc, { symbol: wordRange ? doc.getText(wordRange) : undefined, symbolSource: 'word' }, pos);
    }

    private _emit(
        id: number,
        doc: vscode.TextDocument,
        partial: Pick<EditorContext, 'symbol' | 'symbolSource'> & Partial<EditorContext>,
        pos?: vscode.Position
    ): void {
        if (id !== this._updateId) { return; }
        if (pos) {
            this._lastResolvedPos = { fsPath: doc.uri.fsPath, line: pos.line, character: pos.character };
        }
        this._current = {
            ...partial,
            symbolSource: partial.symbolSource,
            file: path.basename(doc.fileName),
            filePath: doc.fileName,
            lang: LANG_DISPLAY[doc.languageId] ?? doc.languageId,
            langId: doc.languageId,
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
