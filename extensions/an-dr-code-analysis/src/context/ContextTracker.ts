import * as vscode from 'vscode';
import * as path from 'path';

export interface EditorContext {
    symbol?: string;
    symbolKind?: number;
    symbolFromLsp: boolean;
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

        if (!editor) {
            this._current = null;
            this._currentCallHierarchyItem = undefined;
            this._onContextChange.fire(null);
            return;
        }

        const doc = editor.document;
        const pos = editor.selection.active;

        // Try LSP call hierarchy first — this is the exact symbol the analyzer will use
        let symbol: string | undefined;
        let symbolKind: number | undefined;
        let symbolFromLsp = false;
        let callHierarchyItem: vscode.CallHierarchyItem | undefined;

        try {
            const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                'vscode.prepareCallHierarchy', doc.uri, pos
            );
            if (id !== this._updateId) { return; } // cursor moved while we were waiting
            if (items && items.length > 0) {
                callHierarchyItem = items[0];
                symbol = items[0].name;
                symbolKind = items[0].kind;
                symbolFromLsp = true;
            }
        } catch {
            if (id !== this._updateId) { return; }
        }

        // Fall back to word under cursor when LSP has no result (e.g. no server installed)
        if (!symbol) {
            const wordRange = doc.getWordRangeAtPosition(pos);
            symbol = wordRange ? doc.getText(wordRange) : undefined;
        }

        this._currentCallHierarchyItem = callHierarchyItem;
        this._current = {
            symbol,
            symbolKind,
            symbolFromLsp,
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
