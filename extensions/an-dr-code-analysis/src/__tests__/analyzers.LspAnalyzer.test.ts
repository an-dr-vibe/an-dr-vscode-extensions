// Red test: depth-2 callee edges must go between intermediate nodes,
// not between the origin and every node reached.
//
// Bug: LspAnalyzer BFS collects ALL outgoing calls (across all levels) into
// a flat allOutgoing array. buildCallGraph then creates `target → callee` for
// every item in that array, losing the actual intermediate caller context.
//
// Chain:  foo (target) → bar → baz
// Should: edges  foo→bar, bar→baz
// Actual: edges  foo→bar, foo→baz  (baz wrongly attributed to target)

import {
    CallHierarchyItem, CallHierarchyItemKind,
    CallHierarchyIncomingCall, CallHierarchyOutgoingCall,
    Uri, Range, Position,
} from '../__mocks__/vscode';
import type * as vscode from 'vscode';
import { LspAnalyzer } from '../analyzers/language-agnostic/LspAnalyzer';

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock('../analyzers/language-agnostic/LspClient', () => ({
    prepareCallHierarchy: jest.fn(),
    getIncomingCalls: jest.fn(),
    getOutgoingCalls: jest.fn(),
}));

jest.mock('../analyzers/typescript/TsconfigScanner', () => ({
    workspaceRoot: jest.fn(() => null),
    resolveTsconfigForFile: jest.fn(() => null),
    scanForCallers: jest.fn(() => []),
}));

import { getIncomingCalls, getOutgoingCalls } from '../analyzers/language-agnostic/LspClient';

const mockIncoming = getIncomingCalls as jest.Mock;
const mockOutgoing = getOutgoingCalls as jest.Mock;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeItem(name: string, filePath: string, line = 0): vscode.CallHierarchyItem {
    const pos = new Position(line, 0);
    const range = new Range(pos, new Position(line, name.length));
    return new CallHierarchyItem(
        CallHierarchyItemKind.Function,
        name, '',
        Uri.file(filePath) as any,
        range as any,
        range as any,
    ) as unknown as vscode.CallHierarchyItem;
}

function outgoing(to: vscode.CallHierarchyItem): vscode.CallHierarchyOutgoingCall {
    return new CallHierarchyOutgoingCall(to as any, []) as unknown as vscode.CallHierarchyOutgoingCall;
}

function incoming(from: vscode.CallHierarchyItem): vscode.CallHierarchyIncomingCall {
    return new CallHierarchyIncomingCall(from as any, []) as unknown as vscode.CallHierarchyIncomingCall;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LspAnalyzer — multi-level call graph edges', () => {
    const contextTracker = {} as any;

    beforeEach(() => jest.clearAllMocks());

    it('BUG: depth-2 callee edge goes from intermediate node, not from target (foo→bar→baz)', async () => {
        const foo = makeItem('foo', '/src/foo.ts', 10);
        const bar = makeItem('bar', '/src/bar.ts', 20);
        const baz = makeItem('baz', '/src/baz.ts', 30);

        // foo calls bar; bar calls baz
        mockOutgoing.mockImplementation((item: vscode.CallHierarchyItem) => {
            if (item.name === 'foo') { return Promise.resolve([outgoing(bar)]); }
            if (item.name === 'bar') { return Promise.resolve([outgoing(baz)]); }
            return Promise.resolve([]);
        });
        mockIncoming.mockResolvedValue([]);

        const analyzer = LspAnalyzer.forTsJs(contextTracker);
        const result = await analyzer.analyze({
            context: { filePath: '/src/foo.ts', langId: 'typescript' } as any,
            graphType: 'callGraph',
            depth: 2,
            callHierarchyItem: foo,
        } as any);

        expect(result).not.toBeNull();
        const graph = result!.graph;

        const fooNode = graph.nodes.find(n => n.label === 'foo')!;
        const barNode = graph.nodes.find(n => n.label === 'bar')!;
        const bazNode = graph.nodes.find(n => n.label === 'baz')!;

        expect(fooNode).toBeDefined();
        expect(barNode).toBeDefined();
        expect(bazNode).toBeDefined();

        const edgeExists = (src: string, tgt: string) =>
            graph.edges.some(e => e.sourceId === src && e.targetId === tgt);

        // foo → bar must exist (depth 1 — always correct)
        expect(edgeExists(fooNode.id, barNode.id)).toBe(true);

        // bar → baz must exist (depth 2 edge, between intermediate nodes)
        // BUG: this is currently foo → baz instead
        expect(edgeExists(barNode.id, bazNode.id)).toBe(true);

        // foo → baz must NOT exist (baz is not a direct callee of foo)
        expect(edgeExists(fooNode.id, bazNode.id)).toBe(false);
    });

    it('BUG: depth-2 caller edge goes from depth-2 caller to intermediate, not to target (qux→bar→foo)', async () => {
        const foo = makeItem('foo', '/src/foo.ts', 10);
        const bar = makeItem('bar', '/src/bar.ts', 20);
        const qux = makeItem('qux', '/src/qux.ts', 30);

        // bar calls foo; qux calls bar
        mockIncoming.mockImplementation((item: vscode.CallHierarchyItem) => {
            if (item.name === 'foo') { return Promise.resolve([incoming(bar)]); }
            if (item.name === 'bar') { return Promise.resolve([incoming(qux)]); }
            return Promise.resolve([]);
        });
        mockOutgoing.mockResolvedValue([]);

        const analyzer = LspAnalyzer.forTsJs(contextTracker);
        const result = await analyzer.analyze({
            context: { filePath: '/src/foo.ts', langId: 'typescript' } as any,
            graphType: 'callGraph',
            depth: 2,
            callHierarchyItem: foo,
        } as any);

        expect(result).not.toBeNull();
        const graph = result!.graph;

        const fooNode = graph.nodes.find(n => n.label === 'foo')!;
        const barNode = graph.nodes.find(n => n.label === 'bar')!;
        const quxNode = graph.nodes.find(n => n.label === 'qux')!;

        expect(fooNode).toBeDefined();
        expect(barNode).toBeDefined();
        expect(quxNode).toBeDefined();

        const edgeExists = (src: string, tgt: string) =>
            graph.edges.some(e => e.sourceId === src && e.targetId === tgt);

        // bar → foo must exist (depth 1 caller — always correct)
        expect(edgeExists(barNode.id, fooNode.id)).toBe(true);

        // qux → bar must exist (depth 2 edge, between intermediate nodes)
        // BUG: this is currently qux → foo instead
        expect(edgeExists(quxNode.id, barNode.id)).toBe(true);

        // qux → foo must NOT exist (qux is not a direct caller of foo)
        expect(edgeExists(quxNode.id, fooNode.id)).toBe(false);
    });
});
