import * as vscode from 'vscode';
import * as path from 'path';

export type SymbolSource = 'call-hierarchy' | 'document-symbol' | 'word';

export interface EditorContext {
    symbol?: string;
    symbolKind?: number;
    symbolSource: SymbolSource;
    file: string;
    filePath: string;
    lang: string;
    langId: string;
    isPinned: boolean;
}

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

export class ContextTracker implements vscode.Disposable {
    private readonly _onContextChange = new vscode.EventEmitter<EditorContext | null>();
    readonly onContextChange = this._onContextChange.event;

    private _isPinned = false;
    private _current: EditorContext | null = null;
    private _currentCallHierarchyItem: vscode.CallHierarchyItem | undefined;
    private _debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private _updateId = 0;
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
        void this._update();
    }

    toggle(): void {
        this._isPinned ? this.unpin() : this.pin();
    }

    isPinned(): boolean { return this._isPinned; }

    get current(): EditorContext | null { return this._current; }

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

        // Clear the stored item only when switching to a different file — not when
        // tier 1 simply fails at the current cursor position (e.g. cursor on whitespace).
        if (this._currentCallHierarchyItem?.uri.fsPath !== doc.uri.fsPath) {
            this._currentCallHierarchyItem = undefined;
        }

        // Tier 1: LSP call hierarchy — exact semantic symbol, reusable by analyzer
        try {
            const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                'vscode.prepareCallHierarchy', doc.uri, pos
            );
            if (id !== this._updateId) { return; }
            if (items && items.length > 0) {
                this._currentCallHierarchyItem = items[0];
                this._emit(id, doc, {
                    symbol: items[0].name,
                    symbolKind: items[0].kind,
                    symbolSource: 'call-hierarchy',
                });
                return;
            }
        } catch {
            if (id !== this._updateId) { return; }
        }
        // Do NOT clear _currentCallHierarchyItem here — keep the last resolved item
        // so it's available when the user clicks the analysis panel.

        // Tier 2: Document symbol provider — finds enclosing function from file structure,
        // works for header files and projects without compile_commands.json
        try {
            const allSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider', doc.uri
            );
            if (id !== this._updateId) { return; }
            if (allSymbols && allSymbols.length > 0) {
                const sym = findDeepestContaining(allSymbols, pos);
                if (sym) {
                    this._emit(id, doc, {
                        symbol: sym.name,
                        symbolKind: sym.kind,
                        symbolSource: 'document-symbol',
                    });
                    return;
                }
            }
        } catch {
            if (id !== this._updateId) { return; }
        }

        // Tier 3: Word under cursor — always available, semantically unreliable
        const wordRange = doc.getWordRangeAtPosition(pos);
        this._emit(id, doc, {
            symbol: wordRange ? doc.getText(wordRange) : undefined,
            symbolSource: 'word',
        });
    }

    private _emit(
        id: number,
        doc: vscode.TextDocument,
        partial: Pick<EditorContext, 'symbol' | 'symbolSource'> & Partial<EditorContext>
    ): void {
        if (id !== this._updateId) { return; }
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
