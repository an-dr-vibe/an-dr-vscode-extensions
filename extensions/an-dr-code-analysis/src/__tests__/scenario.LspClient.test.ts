// Scenario tests for LspClient — signal/abort semantics, null result handling,
// exception swallowing, empty vs undefined return.

import { commands, Uri, Position, Range, CallHierarchyItem, CallHierarchyItemKind,
    CallHierarchyIncomingCall, CallHierarchyOutgoingCall } from '../__mocks__/vscode';
import { prepareCallHierarchy, getIncomingCalls, getOutgoingCalls } from '../analyzers/language-agnostic/LspClient';

const mockExecute = commands.executeCommand as jest.Mock;

function mockUri(p: string): import('vscode').Uri { return Uri.file(p) as any; }
function mockPos(line = 0, char = 0): import('vscode').Position { return new Position(line, char) as any; }
function makeItem(name: string): import('vscode').CallHierarchyItem {
    const uri = Uri.file('/src/foo.ts');
    const pos = new Position(0, 0);
    const range = new Range(pos, pos);
    return new CallHierarchyItem(CallHierarchyItemKind.Function as any, name, '', uri as any, range as any, range as any) as any;
}

beforeEach(() => jest.clearAllMocks());

// ── Scenario: user opens a file and triggers context update ───────────────────

describe('prepareCallHierarchy', () => {
    it('returns array of items when command succeeds', async () => {
        const item = makeItem('foo');
        mockExecute.mockResolvedValueOnce([item]);

        const result = await prepareCallHierarchy(mockUri('/src/foo.ts'), mockPos());
        expect(result).toHaveLength(1);
        expect(result![0].name).toBe('foo');
    });

    it('returns undefined when command returns empty array', async () => {
        mockExecute.mockResolvedValueOnce([]);
        const result = await prepareCallHierarchy(mockUri('/src/foo.ts'), mockPos());
        expect(result).toBeUndefined();
    });

    it('returns undefined when command returns null', async () => {
        mockExecute.mockResolvedValueOnce(null);
        const result = await prepareCallHierarchy(mockUri('/src/foo.ts'), mockPos());
        expect(result).toBeUndefined();
    });

    it('returns undefined when command returns undefined', async () => {
        mockExecute.mockResolvedValueOnce(undefined);
        const result = await prepareCallHierarchy(mockUri('/src/foo.ts'), mockPos());
        expect(result).toBeUndefined();
    });

    it('swallows command errors and returns undefined', async () => {
        mockExecute.mockRejectedValueOnce(new Error('clangd not ready'));
        const result = await prepareCallHierarchy(mockUri('/src/foo.ts'), mockPos());
        expect(result).toBeUndefined();
    });

    it('BUG: returns undefined immediately when signal is already aborted — command is NOT called', async () => {
        const controller = new AbortController();
        controller.abort();
        // No mockResolvedValueOnce here — the command should never be called

        const result = await prepareCallHierarchy(mockUri('/src/foo.ts'), mockPos(), controller.signal);
        expect(result).toBeUndefined();
        // Command was NOT executed — signal checked first
        expect(mockExecute).not.toHaveBeenCalled();
    });

    it('BUG: signal aborted AFTER command is dispatched — result is still returned (no abort mid-flight)', async () => {
        // The signal is checked only at entry. If the command is already in-flight
        // and then the signal is aborted, LspClient does NOT cancel the in-flight command.
        // The result is returned normally.
        const controller = new AbortController();
        let resolveCmd!: (value: any) => void;
        mockExecute.mockReturnValueOnce(new Promise(r => { resolveCmd = r; }));

        const p = prepareCallHierarchy(mockUri('/src/foo.ts'), mockPos(), controller.signal);
        controller.abort(); // abort while command is in-flight
        resolveCmd([makeItem('foo')]); // command eventually resolves

        const result = await p;
        // BUG: the result is returned even though signal was aborted mid-flight.
        // The caller (LspAnalyzer) should discard it, but LspClient itself doesn't re-check.
        expect(result).toBeDefined(); // documents the gap: mid-flight abort is not honoured
    });

    it('calls vscode.prepareCallHierarchy command', async () => {
        mockExecute.mockResolvedValueOnce([makeItem('foo')]);
        await prepareCallHierarchy(mockUri('/src/foo.ts'), mockPos(5, 3));
        expect(mockExecute).toHaveBeenCalledWith(
            'vscode.prepareCallHierarchy',
            expect.any(Uri),
            expect.any(Position)
        );
    });
});

// ── Scenario: user requests incoming callers ──────────────────────────────────

describe('getIncomingCalls', () => {
    it('returns array of incoming calls when command succeeds', async () => {
        const item = makeItem('foo');
        const caller = makeItem('bar');
        const pos = new Position(0, 0) as any;
        const inCall = new CallHierarchyIncomingCall(caller as any, [new Range(pos, pos) as any]);
        mockExecute.mockResolvedValueOnce([inCall]);

        const result = await getIncomingCalls(item);
        expect(result).toHaveLength(1);
        expect(result[0].from.name).toBe('bar');
    });

    it('returns empty array when command returns null', async () => {
        mockExecute.mockResolvedValueOnce(null);
        const result = await getIncomingCalls(makeItem('foo'));
        expect(result).toEqual([]);
    });

    it('returns empty array when command returns undefined', async () => {
        mockExecute.mockResolvedValueOnce(undefined);
        const result = await getIncomingCalls(makeItem('foo'));
        expect(result).toEqual([]);
    });

    it('swallows command errors and returns empty array', async () => {
        mockExecute.mockRejectedValueOnce(new Error('LSP timeout'));
        const result = await getIncomingCalls(makeItem('foo'));
        expect(result).toEqual([]);
    });

    it('BUG: returns [] immediately when signal is aborted before call', async () => {
        const controller = new AbortController();
        controller.abort();

        const result = await getIncomingCalls(makeItem('foo'), controller.signal);
        expect(result).toEqual([]);
        expect(mockExecute).not.toHaveBeenCalled();
    });

    it('uses _executeProvideIncomingCalls command', async () => {
        mockExecute.mockResolvedValueOnce([]);
        await getIncomingCalls(makeItem('foo'));
        expect(mockExecute).toHaveBeenCalledWith('_executeProvideIncomingCalls', expect.any(Object));
    });
});

// ── Scenario: user requests outgoing callees ──────────────────────────────────

describe('getOutgoingCalls', () => {
    it('returns array of outgoing calls when command succeeds', async () => {
        const item = makeItem('foo');
        const callee = makeItem('bar');
        const pos = new Position(0, 0);
        const outCall = new CallHierarchyOutgoingCall(callee as any, [new Range(pos as any, pos as any) as any]);
        mockExecute.mockResolvedValueOnce([outCall]);

        const result = await getOutgoingCalls(item);
        expect(result).toHaveLength(1);
        expect(result[0].to.name).toBe('bar');
    });

    it('returns empty array when command returns null', async () => {
        mockExecute.mockResolvedValueOnce(null);
        const result = await getOutgoingCalls(makeItem('foo'));
        expect(result).toEqual([]);
    });

    it('swallows errors and returns empty array', async () => {
        mockExecute.mockRejectedValueOnce(new Error('provider gone'));
        const result = await getOutgoingCalls(makeItem('foo'));
        expect(result).toEqual([]);
    });

    it('BUG: returns [] when signal is already aborted — command is NOT called', async () => {
        const controller = new AbortController();
        controller.abort();

        const result = await getOutgoingCalls(makeItem('foo'), controller.signal);
        expect(result).toEqual([]);
        expect(mockExecute).not.toHaveBeenCalled();
    });

    it('uses _executeProvideOutgoingCalls command', async () => {
        mockExecute.mockResolvedValueOnce([]);
        await getOutgoingCalls(makeItem('foo'));
        expect(mockExecute).toHaveBeenCalledWith('_executeProvideOutgoingCalls', expect.any(Object));
    });
});

// ── Scenario: concurrent requests — only the latest signal aborts the older ───

describe('Scenario: rapid cursor movement cancels stale requests', () => {
    it('BUG: LspClient has no way to cancel in-flight commands — AbortSignal only prevents dispatch', () => {
        // When the user moves the cursor rapidly (5 times in 100ms), ContextTracker
        // increments _updateId each time. But any in-flight LspClient calls from
        // previous updates are NOT cancelled — they run to completion.
        // The result is discarded by the `id !== this._updateId` check in ContextTracker,
        // but the underlying VSCode command still runs. This means:
        //   - Extra CPU/network for cancelled context updates
        //   - No way to cancel clangd's call hierarchy lookup mid-flight
        // This test documents that LspClient does not use signal.abort() to cancel.
        const controller = new AbortController();
        let commandStarted = false;
        mockExecute.mockImplementation(() => {
            commandStarted = true;
            return Promise.resolve([]);
        });

        // Signal not yet aborted when command starts
        const p = prepareCallHierarchy(mockUri('/src/foo.ts'), mockPos(), controller.signal);
        expect(commandStarted).toBe(true); // command was started

        controller.abort(); // abort after command was dispatched
        return p.then(result => {
            // Command ran, result came back (even though signal is now aborted)
            // LspClient returned undefined because result was empty array → undefined
            expect(result).toBeUndefined();
        });
    });
});
