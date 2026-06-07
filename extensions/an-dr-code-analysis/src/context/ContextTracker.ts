import * as vscode from 'vscode';
import * as path from 'path';

export interface EditorContext {
    symbol?: string;
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
    private _debounceTimer: ReturnType<typeof setTimeout> | undefined;
    private readonly _disposables: vscode.Disposable[] = [];

    constructor() {
        this._disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => {
                if (!this._isPinned) { this._update(); }
            }),
            vscode.window.onDidChangeTextEditorSelection(() => {
                if (this._isPinned) { return; }
                clearTimeout(this._debounceTimer);
                this._debounceTimer = setTimeout(() => this._update(), 300);
            }),
        );
        this._update();
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
        this._update();
    }

    toggle(): void {
        this._isPinned ? this.unpin() : this.pin();
    }

    isPinned(): boolean { return this._isPinned; }

    get current(): EditorContext | null { return this._current; }

    private _update(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            this._current = null;
            this._onContextChange.fire(null);
            return;
        }
        const doc = editor.document;
        const pos = editor.selection.active;
        const wordRange = doc.getWordRangeAtPosition(pos);
        const symbol = wordRange ? doc.getText(wordRange) : undefined;
        this._current = {
            symbol,
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
