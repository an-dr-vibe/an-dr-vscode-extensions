import {
    CallHierarchyItemKind,
    Uri,
    Range,
    Position,
} from '../__mocks__/vscode';
import type * as vscode from 'vscode';
import { buildCallGraph } from '../graph/GraphBuilder';

function makeItem(name: string, filePath: string, line = 0, detail = ''): vscode.CallHierarchyItem {
    const pos = new Position(line, 0);
    const range = new Range(pos, new Position(line, name.length));
    return {
        kind: CallHierarchyItemKind.Function as unknown as vscode.SymbolKind,
        name,
        detail,
        uri: Uri.file(filePath) as unknown as vscode.Uri,
        range: range as unknown as vscode.Range,
        selectionRange: range as unknown as vscode.Range,
        tags: undefined,
    } as vscode.CallHierarchyItem;
}

describe('buildCallGraph', () => {
    const target = makeItem('foo', '/src/foo.c', 10);

    it('produces a node with role=target for the focal symbol', () => {
        const graph = buildCallGraph(target, [], [], 'callGraph', 2, 'clangd');
        expect(graph.nodes).toHaveLength(1);
        expect(graph.nodes[0].role).toBe('target');
        expect(graph.nodes[0].label).toBe('foo');
        expect(graph.nodes[0].filePath).toBe('/src/foo.c');
    });

    it('sets graphType, depth, tool, confidence correctly', () => {
        const graph = buildCallGraph(target, [], [], 'callGraph', 3, 'clangd');
        expect(graph.graphType).toBe('callGraph');
        expect(graph.depth).toBe(3);
        expect(graph.tool).toBe('clangd');
        expect(graph.confidence).toBe('high');
    });

    it('adds caller nodes with role=caller and an edge pointing to target', () => {
        const caller = makeItem('bar', '/src/bar.c', 5);
        const incoming = [{ from: caller, fromRanges: [] }] as vscode.CallHierarchyIncomingCall[];
        const graph = buildCallGraph(target, incoming, [], 'callGraph', 2, 'clangd');

        const callerNode = graph.nodes.find(n => n.label === 'bar');
        expect(callerNode).toBeDefined();
        expect(callerNode!.role).toBe('caller');

        expect(graph.edges).toHaveLength(1);
        expect(graph.edges[0].sourceId).toBe(callerNode!.id);
        expect(graph.edges[0].targetId).toBe(graph.targetId);
    });

    it('adds callee nodes with role=callee and an edge from target', () => {
        const callee = makeItem('baz', '/src/baz.c', 20);
        const outgoing = [{ to: callee, fromRanges: [] }] as vscode.CallHierarchyOutgoingCall[];
        const graph = buildCallGraph(target, [], outgoing, 'callGraph', 2, 'clangd');

        const calleeNode = graph.nodes.find(n => n.label === 'baz');
        expect(calleeNode).toBeDefined();
        expect(calleeNode!.role).toBe('callee');

        expect(graph.edges).toHaveLength(1);
        expect(graph.edges[0].sourceId).toBe(graph.targetId);
        expect(graph.edges[0].targetId).toBe(calleeNode!.id);
    });

    it('deduplicates nodes when the same item appears as caller and callee', () => {
        // same name/file/line = same id
        const shared = makeItem('shared', '/src/shared.c', 1);
        const incoming = [{ from: shared, fromRanges: [] }] as vscode.CallHierarchyIncomingCall[];
        const outgoing = [{ to: shared, fromRanges: [] }] as vscode.CallHierarchyOutgoingCall[];
        const graph = buildCallGraph(target, incoming, outgoing, 'callGraph', 2, 'clangd');

        const sharedNodes = graph.nodes.filter(n => n.label === 'shared');
        expect(sharedNodes).toHaveLength(1);
        expect(graph.edges).toHaveLength(2);
    });

    it('includes both callers and callees together', () => {
        const caller = makeItem('caller', '/src/a.c', 1);
        const callee = makeItem('callee', '/src/b.c', 2);
        const incoming = [{ from: caller, fromRanges: [] }] as vscode.CallHierarchyIncomingCall[];
        const outgoing = [{ to: callee, fromRanges: [] }] as vscode.CallHierarchyOutgoingCall[];
        const graph = buildCallGraph(target, incoming, outgoing, 'callGraph', 2, 'clangd');

        expect(graph.nodes).toHaveLength(3); // target + caller + callee
        expect(graph.edges).toHaveLength(2);
    });

    it('builds fullName from detail::name when detail is present', () => {
        const item = makeItem('method', '/src/cls.cpp', 5, 'MyClass');
        const graph = buildCallGraph(item, [], [], 'callGraph', 2, 'clangd');
        expect(graph.nodes[0].fullName).toBe('MyClass::method');
    });

    it('uses just name as fullName when detail is empty', () => {
        const graph = buildCallGraph(target, [], [], 'callGraph', 2, 'clangd');
        expect(graph.nodes[0].fullName).toBe('foo');
    });

    it('derives langId from file extension', () => {
        const cppItem = makeItem('fn', '/src/foo.cpp', 0);
        const graph = buildCallGraph(cppItem, [], [], 'callGraph', 2, 'clangd');
        expect(graph.nodes[0].langId).toBe('cpp');
    });

    it('targetId matches the node id of the target item', () => {
        const graph = buildCallGraph(target, [], [], 'callGraph', 2, 'clangd');
        expect(graph.nodes.find(n => n.id === graph.targetId)).toBeDefined();
    });
});

// ── Edge cases and fixed bugs ─────────────────────────────────────────────────

function pos(line: number, ch = 0) { return new Position(line, ch); }
function rng(l: number, c = 0) { return new Range(pos(l, c), pos(l, c + 1)); }

function itemEx(
    name: string,
    filePath: string,
    line = 0,
    detail = '',
    selRange?: ReturnType<typeof rng>,
    range?: ReturnType<typeof rng>,
): vscode.CallHierarchyItem {
    return {
        kind: CallHierarchyItemKind.Function as unknown as vscode.SymbolKind,
        name,
        detail,
        uri: Uri.file(filePath) as unknown as vscode.Uri,
        range: (range ?? rng(line)) as unknown as vscode.Range,
        selectionRange: (selRange ?? rng(line)) as unknown as vscode.Range,
        tags: undefined,
    } as vscode.CallHierarchyItem;
}

function incomingCall(from: vscode.CallHierarchyItem): vscode.CallHierarchyIncomingCall {
    return { from, fromRanges: [] } as vscode.CallHierarchyIncomingCall;
}
function outgoingCall(to: vscode.CallHierarchyItem): vscode.CallHierarchyOutgoingCall {
    return { to, fromRanges: [] } as vscode.CallHierarchyOutgoingCall;
}

describe('role when same item is both caller and callee', () => {
    it('node first seen as caller keeps role=caller even if also in outgoing; both edges present', () => {
        const t = itemEx('foo', '/src/foo.c', 10);
        const shared = itemEx('bar', '/src/bar.c', 5);
        const graph = buildCallGraph(t, [incomingCall(shared)], [outgoingCall(shared)], 'callGraph', 2, 'clangd');
        const sharedNode = graph.nodes.find(n => n.label === 'bar')!;
        const callerEdges = graph.edges.filter(e => e.targetId === graph.targetId);
        const calleeEdges = graph.edges.filter(e => e.sourceId === graph.targetId);
        expect(callerEdges).toHaveLength(1);
        expect(calleeEdges).toHaveLength(1);
        expect(sharedNode.role).toBe('caller');
    });
});

describe('item with missing selectionRange and range', () => {
    it('produces a stable id when both ranges are undefined', () => {
        const noRangeItem: vscode.CallHierarchyItem = {
            kind: CallHierarchyItemKind.Function as unknown as vscode.SymbolKind,
            name: 'foo',
            detail: '',
            uri: Uri.file('/src/foo.c') as unknown as vscode.Uri,
            range: undefined as unknown as vscode.Range,
            selectionRange: undefined as unknown as vscode.Range,
            tags: undefined,
        } as unknown as vscode.CallHierarchyItem;
        expect(() => buildCallGraph(noRangeItem, [], [], 'callGraph', 2, 'clangd')).not.toThrow();
        const graph = buildCallGraph(noRangeItem, [], [], 'callGraph', 2, 'clangd');
        expect(graph.nodes[0].id).toContain('foo');
    });

    it('two different functions at line 0 in different files produce unique ids', () => {
        const a = itemEx('init', '/src/a.c', 0);
        const b = itemEx('init', '/src/b.c', 0);
        const graph = buildCallGraph(a, [incomingCall(b)], [], 'callGraph', 2, 'clangd');
        const ids = graph.nodes.map(n => n.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('two callers with identical name+file+line produce one node and one edge (G2 fix)', () => {
        const t = itemEx('foo', '/src/foo.c', 5);
        const c1 = itemEx('bar', '/src/foo.c', 1);
        const c2 = itemEx('bar', '/src/foo.c', 1);
        const graph = buildCallGraph(t, [incomingCall(c1), incomingCall(c2)], [], 'callGraph', 2, 'clangd');
        expect(graph.nodes.filter(n => n.role === 'caller')).toHaveLength(1);
        expect(graph.edges).toHaveLength(1);
    });
});

describe('langId edge cases', () => {
    it('file with no extension uses basename as langId (G4 fix)', () => {
        const noExt = itemEx('main', '/src/Makefile', 0);
        const graph = buildCallGraph(noExt, [], [], 'callGraph', 2, 'clangd');
        expect(graph.nodes[0].langId).toBe('makefile');
    });

    it('file with double extension uses only last segment', () => {
        const dotMin = itemEx('fn', '/src/foo.test.ts', 0);
        const graph = buildCallGraph(dotMin, [], [], 'callGraph', 2, 'clangd');
        expect(graph.nodes[0].langId).toBe('ts');
    });
});

describe('fullName construction edge cases', () => {
    it('detail with :: already in it produces ns::Class::method', () => {
        const i = itemEx('method', '/src/foo.cpp', 0, 'ns::Class');
        const graph = buildCallGraph(i, [], [], 'callGraph', 2, 'clangd');
        expect(graph.nodes[0].fullName).toBe('ns::Class::method');
    });

    it('empty detail is treated as falsy — no separator added', () => {
        const i = itemEx('fn', '/src/foo.c', 0, '');
        const graph = buildCallGraph(i, [], [], 'callGraph', 2, 'clangd');
        expect(graph.nodes[0].fullName).toBe('fn');
    });
});

describe('confidence derived from tool (G3 fix)', () => {
    it('clangd → high, ctags → medium, unknown → low', () => {
        const t = itemEx('foo', '/src/foo.c', 0);
        expect(buildCallGraph(t, [], [], 'callGraph', 2, 'clangd').confidence).toBe('high');
        expect(buildCallGraph(t, [], [], 'callGraph', 2, 'ctags').confidence).toBe('medium');
        expect(buildCallGraph(t, [], [], 'callGraph', 2, 'some-other-tool').confidence).toBe('low');
    });
});

describe('edge direction', () => {
    it('incoming call edge goes from caller to target', () => {
        const t = itemEx('foo', '/src/foo.c', 10);
        const caller = itemEx('bar', '/src/bar.c', 1);
        const graph = buildCallGraph(t, [incomingCall(caller)], [], 'callGraph', 2, 'clangd');
        expect(graph.edges[0].targetId).toBe(graph.targetId);
        expect(graph.edges[0].sourceId).not.toBe(graph.targetId);
    });

    it('outgoing call edge goes from target to callee', () => {
        const t = itemEx('foo', '/src/foo.c', 10);
        const callee = itemEx('baz', '/src/baz.c', 20);
        const graph = buildCallGraph(t, [], [outgoingCall(callee)], 'callGraph', 2, 'clangd');
        expect(graph.edges[0].sourceId).toBe(graph.targetId);
        expect(graph.edges[0].targetId).not.toBe(graph.targetId);
    });
});
