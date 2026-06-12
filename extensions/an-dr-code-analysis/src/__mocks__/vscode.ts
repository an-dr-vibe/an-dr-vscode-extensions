// Manual mock for the 'vscode' module.
// Only stubs the APIs actually used by production code under test.

export enum SymbolKind {
    File = 0, Module = 1, Namespace = 2, Package = 3, Class = 4, Method = 5,
    Property = 6, Field = 7, Constructor = 8, Enum = 9, Interface = 10,
    Function = 11, Variable = 12, Constant = 13, String = 14, Number = 15,
    Boolean = 16, Array = 17, Object = 18, Key = 19, Null = 20,
    EnumMember = 21, Struct = 22, Event = 23, Operator = 24, TypeParameter = 25,
}

export enum CallHierarchyItemKind {
    File = 0, Module = 1, Namespace = 2, Package = 3, Class = 4, Method = 5,
    Property = 6, Field = 7, Constructor = 8, Enum = 9, Interface = 10,
    Function = 11, Variable = 12, Constant = 13, String = 14, Number = 15,
    Boolean = 16, Array = 17,
}

export enum ProgressLocation {
    Notification = 15,
    Window = 10,
    SourceControl = 1,
}

export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3,
}

export class Position {
    constructor(public readonly line: number, public readonly character: number) {}
    isBeforeOrEqual(other: Position): boolean {
        return this.line < other.line || (this.line === other.line && this.character <= other.character);
    }
    isAfterOrEqual(other: Position): boolean {
        return this.line > other.line || (this.line === other.line && this.character >= other.character);
    }
}

export class Range {
    constructor(
        public readonly start: Position,
        public readonly end: Position,
    ) {}
    contains(pos: Position): boolean {
        return pos.isAfterOrEqual(this.start) && pos.isBeforeOrEqual(this.end);
    }
}

export class Selection extends Range {
    constructor(anchor: Position, active: Position) { super(anchor, active); }
}

export class Uri {
    private constructor(
        public readonly scheme: string,
        public readonly fsPath: string,
    ) {}
    static file(p: string): Uri { return new Uri('file', p); }
    static parse(s: string): Uri { return new Uri('file', s); }
    static joinPath(base: Uri, ...segments: string[]): Uri {
        const sep = base.fsPath.includes('\\') ? '\\' : '/';
        return new Uri(base.scheme, [base.fsPath, ...segments].join(sep));
    }
    toString(): string { return `file://${this.fsPath}`; }
    with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri {
        return new Uri(change.scheme ?? this.scheme, change.path ?? this.fsPath);
    }
}

export class EventEmitter<T> {
    private _listeners: ((e: T) => void)[] = [];
    readonly event = (listener: (e: T) => void) => {
        this._listeners.push(listener);
        return { dispose: () => { this._listeners = this._listeners.filter(l => l !== listener); } };
    };
    fire(data: T): void { this._listeners.forEach(l => l(data)); }
    dispose(): void { this._listeners = []; }
}

export class CallHierarchyItem {
    constructor(
        public kind: CallHierarchyItemKind,
        public name: string,
        public detail: string,
        public uri: Uri,
        public range: Range,
        public selectionRange: Range,
    ) {}
}

export class CallHierarchyIncomingCall {
    constructor(
        public from: CallHierarchyItem,
        public fromRanges: Range[],
    ) {}
}

export class CallHierarchyOutgoingCall {
    constructor(
        public to: CallHierarchyItem,
        public fromRanges: Range[],
    ) {}
}

export class DocumentSymbol {
    children: DocumentSymbol[] = [];
    constructor(
        public name: string,
        public detail: string,
        public kind: SymbolKind,
        public range: Range,
        public selectionRange: Range,
    ) {}
}

// ── workspace mock ──────────────────────────────────────────────────────────

let _workspaceFolders: { uri: Uri; name: string; index: number }[] | undefined;
let _config: Record<string, unknown> = {};

const _fsWatcherListeners: {
    change: ((u: Uri) => void)[];
    create: ((u: Uri) => void)[];
    delete: ((u: Uri) => void)[];
} = { change: [], create: [], delete: [] };

const _mockWatcher = {
    onDidChange: (cb: (u: Uri) => void) => { _fsWatcherListeners.change.push(cb); return { dispose: () => {} }; },
    onDidCreate: (cb: (u: Uri) => void) => { _fsWatcherListeners.create.push(cb); return { dispose: () => {} }; },
    onDidDelete: (cb: (u: Uri) => void) => { _fsWatcherListeners.delete.push(cb); return { dispose: () => {} }; },
    dispose: () => {},
};

export const workspace = {
    get workspaceFolders() { return _workspaceFolders; },
    createFileSystemWatcher: jest.fn(() => _mockWatcher),
    getConfiguration: jest.fn((_ns?: string) => ({
        get: jest.fn(<T>(key: string, def: T): T => (_config[key] as T) ?? def),
        update: jest.fn(),
    })),
    onDidChangeConfiguration: jest.fn(() => ({ dispose: () => {} })),
    onDidChangeWorkspaceFolders: jest.fn(() => ({ dispose: () => {} })),
    openTextDocument: jest.fn((_path: string) => Promise.resolve({ uri: Uri.file(_path) })),

    // test helpers — not part of real vscode API
    __setWorkspaceFolders(folders: { uri: Uri; name: string; index: number }[] | undefined) {
        _workspaceFolders = folders;
    },
    __setConfig(cfg: Record<string, unknown>) { _config = cfg; },
    __triggerFileChange(uri: Uri) { _fsWatcherListeners.change.forEach(l => l(uri)); },
    __triggerFileDelete(uri: Uri) { _fsWatcherListeners.delete.forEach(l => l(uri)); },
};

// ── window mock ─────────────────────────────────────────────────────────────

export const _mockEditor = {
    selection: new Selection(new Position(0, 0), new Position(0, 0)),
    revealRange: jest.fn(),
};

export const window = {
    activeTextEditor: undefined as unknown,
    onDidChangeActiveTextEditor: jest.fn(() => ({ dispose: () => {} })),
    onDidChangeTextEditorSelection: jest.fn(() => ({ dispose: () => {} })),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showQuickPick: jest.fn(),
    showOpenDialog: jest.fn(),
    showTextDocument: jest.fn((_doc: unknown, _opts?: unknown) => {
        // Reset the mock editor each call so tests get a fresh writable object
        _mockEditor.selection = new Selection(new Position(0, 0), new Position(0, 0));
        _mockEditor.revealRange = jest.fn();
        return Promise.resolve(_mockEditor);
    }),
    createOutputChannel: jest.fn(() => ({
        appendLine: jest.fn(),
        append: jest.fn(),
        show: jest.fn(),
        dispose: jest.fn(),
    })),
    withProgress: jest.fn(async (_opts: unknown, task: () => Promise<void>) => task()),
};

// ── commands mock ────────────────────────────────────────────────────────────

export const commands = {
    executeCommand: jest.fn(),
    registerCommand: jest.fn(() => ({ dispose: () => {} })),
};

// ── extensions mock ──────────────────────────────────────────────────────────

export const extensions = {
    getExtension: jest.fn(),
};
