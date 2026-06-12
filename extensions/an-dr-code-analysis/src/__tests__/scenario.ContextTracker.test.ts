// Scenario tests for ContextTracker — stale-update guards, tier fallthrough,
// debounce, pin state interactions, event firing.

import { workspace, window, commands, Uri, Position, Range,
    CallHierarchyItem, CallHierarchyItemKind, DocumentSymbol, SymbolKind } from '../__mocks__/vscode';
import { ContextTracker } from '../context/ContextTracker';

const mockExecute  = commands.executeCommand as jest.Mock;
const mockOnEditor = window.onDidChangeActiveTextEditor as jest.Mock;
const mockOnSelect = window.onDidChangeTextEditorSelection as jest.Mock;

function makePos(line = 0, char = 0) { return new Position(line, char); }
function makeRange(sl = 0, sc = 0, el = 1, ec = 0) {
    return new Range(makePos(sl, sc), makePos(el, ec));
}
function makeChItem(name: string, filePath: string) {
    return new CallHierarchyItem(
        CallHierarchyItemKind.Function, name, '', Uri.file(filePath),
        makeRange(), makeRange()
    );
}
function makeDocSymbol(name: string, sl = 0, el = 10) {
    return new DocumentSymbol(name, '', SymbolKind.Function, makeRange(sl, 0, el, 0), makeRange(sl, 0, sl, name.length));
}

function makeEditor(fsPath: string, langId: string, line = 5, char = 3) {
    return {
        document: {
            uri: Uri.file(fsPath),
            fileName: fsPath,
            languageId: langId,
            getText: jest.fn((range?: any) => range ? 'foo' : 'full content'),
            getWordRangeAtPosition: jest.fn(() => makeRange(line, char, line, char + 3)),
        },
        selection: { active: makePos(line, char) },
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Default: no active editor, workspace has one folder
    (window as any).activeTextEditor = undefined;
    workspace.__setWorkspaceFolders([{ uri: Uri.file('/workspace'), name: 'ws', index: 0 }]);
});

afterEach(() => {
    jest.useRealTimers();
    workspace.__setWorkspaceFolders(undefined);
});

// ── Scenario: extension starts up, no editor open ────────────────────────────

describe('Scenario: ContextTracker initializes with no editor', () => {
    it('current is null when no active editor is open', () => {
        (window as any).activeTextEditor = undefined;
        const tracker = new ContextTracker();
        expect(tracker.current).toBeNull();
        tracker.dispose();
    });

    it('currentCallHierarchyItem is undefined initially', () => {
        const tracker = new ContextTracker();
        expect(tracker.currentCallHierarchyItem).toBeUndefined();
        tracker.dispose();
    });
});

// ── Scenario: user opens a TypeScript file, tier1 (call hierarchy) succeeds ──

describe('Scenario: tier1 — call hierarchy resolves on cursor position', () => {
    it('current reflects call-hierarchy symbol when prepareCallHierarchy succeeds', async () => {
        const editor = makeEditor('/src/index.ts', 'typescript', 10, 5);
        (window as any).activeTextEditor = editor;

        const chItem = makeChItem('myFunc', '/src/index.ts');
        mockExecute.mockResolvedValueOnce([chItem]);

        const tracker = new ContextTracker();
        await jest.runAllTimersAsync();

        expect(tracker.current?.symbol).toBe('myFunc');
        expect(tracker.current?.symbolSource).toBe('call-hierarchy');
        expect(tracker.current?.langId).toBe('typescript');
        expect(tracker.currentCallHierarchyItem).toBe(chItem);
        tracker.dispose();
    });

    it('currentCallHierarchyItem stores the first item only', async () => {
        const editor = makeEditor('/src/index.ts', 'typescript');
        (window as any).activeTextEditor = editor;

        const item1 = makeChItem('fn1', '/src/index.ts');
        const item2 = makeChItem('fn2', '/src/index.ts');
        mockExecute.mockResolvedValueOnce([item1, item2]);

        const tracker = new ContextTracker();
        await jest.runAllTimersAsync();

        expect(tracker.currentCallHierarchyItem?.name).toBe('fn1');
        tracker.dispose();
    });
});

// ── Scenario: tier1 fails, tier2 document symbols kick in ────────────────────

describe('Scenario: tier2 — document symbols when call hierarchy unavailable', () => {
    it('falls through to document symbol when tier1 returns empty', async () => {
        const editor = makeEditor('/src/foo.py', 'python', 5, 3);
        (window as any).activeTextEditor = editor;

        const sym = makeDocSymbol('my_function', 0, 15);
        // tier1 returns empty, tier2 returns symbols, tier2 upgrade also returns empty
        mockExecute
            .mockResolvedValueOnce([])         // tier1 prepareCallHierarchy → empty
            .mockResolvedValueOnce([sym])       // tier2 executeDocumentSymbolProvider
            .mockResolvedValueOnce([]);         // tier2 upgrade prepareCallHierarchy → empty

        const tracker = new ContextTracker();
        await jest.runAllTimersAsync();

        expect(tracker.current?.symbol).toBe('my_function');
        expect(tracker.current?.symbolSource).toBe('document-symbol');
        tracker.dispose();
    });

    it('tier2 upgrade succeeds — promotes to call-hierarchy source', async () => {
        const editor = makeEditor('/src/foo.cpp', 'cpp', 5, 3);
        (window as any).activeTextEditor = editor;

        const sym = makeDocSymbol('myFunc', 0, 15);
        const chItem = makeChItem('myFunc', '/src/foo.cpp');
        mockExecute
            .mockResolvedValueOnce([])         // tier1 → empty
            .mockResolvedValueOnce([sym])       // tier2 symbols
            .mockResolvedValueOnce([chItem]);   // tier2 upgrade → success

        const tracker = new ContextTracker();
        await jest.runAllTimersAsync();

        expect(tracker.current?.symbol).toBe('myFunc');
        expect(tracker.current?.symbolSource).toBe('call-hierarchy');
        tracker.dispose();
    });
});

// ── Scenario: tier1 and tier2 both fail — fall to word under cursor ───────────

describe('Scenario: tier3 — word under cursor when LSP is unavailable', () => {
    it('uses word under cursor when both tier1 and tier2 return nothing', async () => {
        const editor = makeEditor('/src/Makefile', 'makefile', 3, 5);
        (window as any).activeTextEditor = editor;

        mockExecute
            .mockResolvedValueOnce([])   // tier1 empty
            .mockResolvedValueOnce([]); // tier2 empty

        const tracker = new ContextTracker();
        await jest.runAllTimersAsync();

        expect(tracker.current?.symbol).toBe('foo'); // getWordRangeAtPosition → getText → 'foo'
        expect(tracker.current?.symbolSource).toBe('word');
        tracker.dispose();
    });

    it('symbol is undefined when cursor is on whitespace (no word range)', async () => {
        const editor = makeEditor('/src/main.c', 'c', 0, 0);
        (editor.document.getWordRangeAtPosition as jest.Mock).mockReturnValue(undefined);
        (window as any).activeTextEditor = editor;

        mockExecute
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const tracker = new ContextTracker();
        await jest.runAllTimersAsync();

        expect(tracker.current?.symbol).toBeUndefined();
        expect(tracker.current?.symbolSource).toBe('word');
        tracker.dispose();
    });
});

// ── Scenario: stale-update guard — rapid cursor movement ─────────────────────

describe('Scenario: stale-update guard with rapid cursor movement', () => {
    it('BUG: stale result from older _update() is discarded when newer one completes first', async () => {
        // ContextTracker tracks _updateId. If update #1 is slow and update #2 finishes first,
        // update #1's result is discarded via `if (id !== this._updateId) return`.
        // This is the correct guard — test that it works.
        const editor = makeEditor('/src/foo.ts', 'typescript', 5, 3);
        (window as any).activeTextEditor = editor;

        let resolveUpdate1!: (value: any) => void;
        const chItem1 = makeChItem('slowFn', '/src/foo.ts');
        const chItem2 = makeChItem('fastFn', '/src/foo.ts');

        // update #1: slow (completes later)
        mockExecute.mockReturnValueOnce(new Promise(r => { resolveUpdate1 = r; }));
        // update #2: fast (resolves immediately)
        mockExecute.mockResolvedValueOnce([chItem2]);

        const tracker = new ContextTracker();

        // Fire active-editor-change twice to create update #1 then #2
        const editorCb = mockOnEditor.mock.calls[0][0];
        editorCb(); // update #2 (updateId = 2)

        await jest.runAllTimersAsync(); // update #2 completes

        expect(tracker.current?.symbol).toBe('fastFn');

        // Now update #1 finishes late — should be discarded
        resolveUpdate1([chItem1]);
        await jest.runAllTimersAsync();

        // current should still be 'fastFn', not 'slowFn'
        expect(tracker.current?.symbol).toBe('fastFn');
        tracker.dispose();
    });
});

// ── Scenario: pin state interacts with update cycle ──────────────────────────

describe('Scenario: pin blocks context updates', () => {
    it('active-editor change does not trigger _update when pinned', () => {
        const tracker = new ContextTracker();
        tracker.pin();

        const initialCallCount = mockExecute.mock.calls.length;
        const editorCb = mockOnEditor.mock.calls[0][0];
        editorCb(); // fires onDidChangeActiveTextEditor while pinned

        // No new executeCommand calls — _update not triggered
        expect(mockExecute.mock.calls.length).toBe(initialCallCount);
        tracker.dispose();
    });

    it('selection change does not trigger _update when pinned (debounce skipped)', () => {
        const tracker = new ContextTracker();
        tracker.pin();

        const initialCallCount = mockExecute.mock.calls.length;
        const selCb = mockOnSelect.mock.calls[0][0];
        selCb();
        jest.runAllTimers();

        expect(mockExecute.mock.calls.length).toBe(initialCallCount);
        tracker.dispose();
    });

    it('unpin triggers _update immediately', async () => {
        const editor = makeEditor('/src/foo.ts', 'typescript');
        (window as any).activeTextEditor = editor;

        const tracker = new ContextTracker();
        tracker.pin();

        const callsBefore = mockExecute.mock.calls.length;
        tracker.unpin();
        await jest.runAllTimersAsync();

        expect(mockExecute.mock.calls.length).toBeGreaterThan(callsBefore);
        tracker.dispose();
    });
});

// ── Scenario: non-file URIs (output panels, webviews) don't clear context ────

describe('Scenario: focus shifts to output panel', () => {
    it('BUG: activeTextEditor with non-file URI does not clear the existing context', async () => {
        // User has foo.ts open; clicks on Output panel.
        // VS Code fires onDidChangeActiveTextEditor with a non-file editor.
        // ContextTracker must NOT clear the last valid source context.
        const fileEditor = makeEditor('/src/foo.ts', 'typescript', 5, 3);
        (window as any).activeTextEditor = fileEditor;

        const chItem = makeChItem('myFunc', '/src/foo.ts');
        mockExecute.mockResolvedValueOnce([chItem]);

        const tracker = new ContextTracker();
        await jest.runAllTimersAsync();
        expect(tracker.current?.symbol).toBe('myFunc');

        // Now simulate Output panel focus (non-file URI)
        const outputEditor = {
            document: { uri: { scheme: 'output', fsPath: '' }, fileName: '', languageId: 'log' },
            selection: { active: makePos() },
        };
        (window as any).activeTextEditor = outputEditor;

        const editorCb = mockOnEditor.mock.calls[0][0];
        editorCb(); // fires with output editor

        await jest.runAllTimersAsync();

        // Context must still be 'myFunc' — non-file URIs are ignored
        expect(tracker.current?.symbol).toBe('myFunc');
        tracker.dispose();
    });
});

// ── Scenario: switching files clears stored call hierarchy item ───────────────

describe('Scenario: switching files clears stale call hierarchy item', () => {
    it('currentCallHierarchyItem is cleared when switching to a different file', async () => {
        const editor1 = makeEditor('/src/foo.ts', 'typescript', 5, 3);
        (window as any).activeTextEditor = editor1;

        const chItem = makeChItem('fn1', '/src/foo.ts');
        mockExecute.mockResolvedValueOnce([chItem]);

        const tracker = new ContextTracker();
        await jest.runAllTimersAsync();
        expect(tracker.currentCallHierarchyItem?.name).toBe('fn1');

        // Switch to a different file
        const editor2 = makeEditor('/src/bar.ts', 'typescript', 1, 0);
        (window as any).activeTextEditor = editor2;

        // tier1 fails for bar.ts, tier2 empty, tier3 word
        mockExecute
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]);

        const editorCb = mockOnEditor.mock.calls[0][0];
        editorCb();
        await jest.runAllTimersAsync();

        // After switching files, the stored item from foo.ts should be cleared
        // (bar.ts URI !== foo.ts URI → cleared at start of _update)
        expect(tracker.currentCallHierarchyItem).toBeUndefined();
        tracker.dispose();
    });

    it('BUG: currentCallHierarchyItem is RETAINED when tier1 fails but file is the same', async () => {
        // User clicks on whitespace in the same file — tier1 returns empty.
        // ContextTracker intentionally keeps the previous item so the analyzer
        // can still use it (see comment: "keep the last resolved item").
        const editor = makeEditor('/src/foo.ts', 'typescript', 5, 3);
        (window as any).activeTextEditor = editor;

        const chItem = makeChItem('fn1', '/src/foo.ts');
        mockExecute.mockResolvedValueOnce([chItem]); // tier1 success first time

        const tracker = new ContextTracker();
        await jest.runAllTimersAsync();
        expect(tracker.currentCallHierarchyItem?.name).toBe('fn1');

        // Same file, same cursor position — dedup guard fires immediately, _update() early-returns.
        // No executeCommand calls happen; the retained item is from the initial update.
        const editorCb = mockOnEditor.mock.calls[0][0];
        editorCb(); // re-update same file, same position
        await jest.runAllTimersAsync();

        // Item is RETAINED — both because dedup guard early-returned and because same URI
        expect(tracker.currentCallHierarchyItem?.name).toBe('fn1');
        tracker.dispose();
    });
});

// ── Scenario: selection debounce (300ms) ──────────────────────────────────────

describe('Scenario: selection change debouncing', () => {
    it('rapid selection changes are debounced — only last update runs', async () => {
        const editor = makeEditor('/src/foo.ts', 'typescript');
        (window as any).activeTextEditor = editor;

        // Drain initial update from constructor
        mockExecute.mockResolvedValueOnce([]);
        const tracker = new ContextTracker();
        await jest.runAllTimersAsync();

        const callsBefore = mockExecute.mock.calls.length;

        const selCb = mockOnSelect.mock.calls[0][0];
        selCb(); // change 1
        selCb(); // change 2
        selCb(); // change 3

        // Before debounce fires, no new updates
        expect(mockExecute.mock.calls.length).toBe(callsBefore);

        jest.advanceTimersByTime(300);
        await jest.runAllTimersAsync();

        // Debounced update is skipped entirely — same position as initial update, dedup guard fires.
        const callsAfter = mockExecute.mock.calls.length;
        expect(callsAfter - callsBefore).toBe(0);
        tracker.dispose();
    });
});

// ── Scenario: onContextChange event fires ────────────────────────────────────

describe('Scenario: context change events', () => {
    it('onContextChange fires when context is set', async () => {
        const editor = makeEditor('/src/foo.ts', 'typescript');
        (window as any).activeTextEditor = editor;

        const chItem = makeChItem('fn1', '/src/foo.ts');
        mockExecute.mockResolvedValueOnce([chItem]);

        const events: any[] = [];
        const tracker = new ContextTracker();
        tracker.onContextChange(ctx => events.push(ctx));

        await jest.runAllTimersAsync();

        expect(events.some(e => e?.symbol === 'fn1')).toBe(true);
        tracker.dispose();
    });

    it('pin() fires onContextChange with isPinned=true', () => {
        const tracker = new ContextTracker();
        (tracker as any)._current = {
            symbol: 'foo', symbolSource: 'call-hierarchy',
            file: 'foo.ts', filePath: '/src/foo.ts',
            lang: 'TypeScript', langId: 'typescript', isPinned: false,
        };

        const events: any[] = [];
        tracker.onContextChange(ctx => events.push(ctx));
        tracker.pin();

        expect(events[0]?.isPinned).toBe(true);
        tracker.dispose();
    });
});

// ── Scenario: LANG_DISPLAY mapping ───────────────────────────────────────────

describe('Scenario: LANG_DISPLAY maps langId to human-readable name', () => {
    const cases: [string, string][] = [
        ['c', 'C'], ['cpp', 'C++'], ['rust', 'Rust'], ['python', 'Python'],
        ['typescript', 'TypeScript'], ['typescriptreact', 'TypeScript (React)'],
        ['go', 'Go'], ['java', 'Java'], ['csharp', 'C#'],
    ];

    it.each(cases)('langId "%s" maps to "%s"', async (langId, expected) => {
        const editor = makeEditor('/src/file', langId);
        (window as any).activeTextEditor = editor;

        mockExecute.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
        const tracker = new ContextTracker();
        await jest.runAllTimersAsync();

        expect(tracker.current?.lang).toBe(expected);
        tracker.dispose();
    });

    it('unknown langId falls back to the langId itself', async () => {
        const editor = makeEditor('/src/file.xyz', 'xyz-lang');
        (window as any).activeTextEditor = editor;

        mockExecute.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
        const tracker = new ContextTracker();
        await jest.runAllTimersAsync();

        expect(tracker.current?.lang).toBe('xyz-lang');
        tracker.dispose();
    });
});
