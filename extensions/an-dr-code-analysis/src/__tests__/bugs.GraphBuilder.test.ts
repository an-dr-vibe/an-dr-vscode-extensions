// Adversarial tests for GraphBuilder — probing edge cases and suspected bugs.
// Each test is labelled BUG-? when it is expected to expose a defect.

import type * as vscode from 'vscode';
import { Uri, Range, Position, CallHierarchyItemKind } from '../__mocks__/vscode';
import { buildCallGraph } from '../graph/GraphBuilder';

function pos(line: number, ch = 0) { return new Position(line, ch); }
function rng(l: number, c = 0) { return new Range(pos(l, c), pos(l, c + 1)); }

function item(
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

function incoming(from: vscode.CallHierarchyItem): vscode.CallHierarchyIncomingCall {
    return { from, fromRanges: [] } as vscode.CallHierarchyIncomingCall;
}
function outgoing(to: vscode.CallHierarchyItem): vscode.CallHierarchyOutgoingCall {
    return { to, fromRanges: [] } as vscode.CallHierarchyOutgoingCall;
}

// ── Role precedence when same item is caller AND callee ─────────────────────

describe('BUG: role when same item is both caller and callee', () => {
    it('a node first seen as caller should keep role=caller even if also in outgoing', () => {
        const target = item('foo', '/src/foo.c', 10);
        const shared  = item('bar', '/src/bar.c', 5);

        // bar calls foo (incoming) AND foo calls bar (outgoing) — shared appears in both
        const graph = buildCallGraph(
            target,
            [incoming(shared)],
            [outgoing(shared)],
            'callGraph', 2, 'clangd',
        );

        const sharedNode = graph.nodes.find(n => n.label === 'bar')!;
        // BUG: addNode uses first-write-wins; the node will have role='caller' because
        // incoming is processed first. The outgoing pass silently skips adding a second
        // node for the same id. So callee role is LOST — there is no edge from target→bar
        // reflecting bar as a callee of foo.
        // The edge IS pushed (sourceId=targetId, targetId=barId) but the node role stays 'caller'.
        // A caller-only node labelled as a callee edge creates a graph inconsistency.
        const callerEdges = graph.edges.filter(e => e.targetId  === graph.targetId);
        const calleeEdges = graph.edges.filter(e => e.sourceId  === graph.targetId);
        expect(callerEdges).toHaveLength(1);
        expect(calleeEdges).toHaveLength(1);
        // The single node must serve both roles but only has one role field:
        expect(sharedNode.role).not.toBe('callee'); // it's stuck as 'caller'
    });
});

// ── selectionRange and range both absent ─────────────────────────────────────

describe('BUG: item with missing selectionRange and range', () => {
    it('should produce a stable id when both ranges are undefined', () => {
        // The itemId() function: selectionRange?.start?.line ?? range?.start?.line ?? 0
        // If both are undefined the fallback is 0, so ids from different files could collide.
        const noRangeItem: vscode.CallHierarchyItem = {
            kind: CallHierarchyItemKind.Function as unknown as vscode.SymbolKind,
            name: 'foo',
            detail: '',
            uri: Uri.file('/src/foo.c') as unknown as vscode.Uri,
            range: undefined as unknown as vscode.Range,
            selectionRange: undefined as unknown as vscode.Range,
            tags: undefined,
        } as unknown as vscode.CallHierarchyItem;

        // Should not throw; id will be "/src/foo.c:0:foo"
        expect(() => buildCallGraph(noRangeItem, [], [], 'callGraph', 2, 'clangd')).not.toThrow();
        const graph = buildCallGraph(noRangeItem, [], [], 'callGraph', 2, 'clangd');
        expect(graph.nodes[0].id).toContain('foo');
    });

    it('BUG: two different functions both at line 0 in different files produce non-unique ids', () => {
        // Both items have selectionRange.start.line = 0 and same name — different files
        const a = item('init', '/src/a.c', 0);
        const b = item('init', '/src/b.c', 0);
        const graph = buildCallGraph(a, [incoming(b)], [], 'callGraph', 2, 'clangd');
        // a and b have different fsPath so ids differ — this is fine.
        // But if same file AND same line AND same name: ids ARE equal (dedup, may drop a node).
        const ids = graph.nodes.map(n => n.id);
        const unique = new Set(ids);
        expect(unique.size).toBe(ids.length); // ids should be unique
    });

    it('BUG: two callers with identical name + file + line produce only one node (silent dedup)', () => {
        const target = item('foo', '/src/foo.c', 5);
        const caller1 = item('bar', '/src/foo.c', 1); // same file, same line, same name
        const caller2 = item('bar', '/src/foo.c', 1); // exact duplicate
        const graph = buildCallGraph(target, [incoming(caller1), incoming(caller2)], [], 'callGraph', 2, 'clangd');
        // Two incoming calls from identical items → addNode deduplicates → 1 caller node
        // but TWO edges are still pushed. So edge count > unique caller node count.
        const callerNodes = graph.nodes.filter(n => n.role === 'caller');
        expect(callerNodes).toHaveLength(1); // dedup correct
        // BUG: edges are NOT deduplicated — there will be 2 edges for 1 caller node
        expect(graph.edges).toHaveLength(2);
    });
});

// ── langId derivation ─────────────────────────────────────────────────────────

describe('BUG: langId from file extension', () => {
    it('file with no extension gets empty string langId', () => {
        const noExt = item('main', '/src/Makefile', 0);
        const graph = buildCallGraph(noExt, [], [], 'callGraph', 2, 'clangd');
        // path.extname('Makefile') = '' → slice(1) = '' → langId = ''
        expect(graph.nodes[0].langId).toBe('');
    });

    it('file with double extension uses only last segment', () => {
        const dotMin = item('fn', '/src/foo.test.ts', 0);
        const graph = buildCallGraph(dotMin, [], [], 'callGraph', 2, 'clangd');
        // path.extname('foo.test.ts') = '.ts' → langId = 'ts' — correct
        expect(graph.nodes[0].langId).toBe('ts');
    });
});

// ── fullName / detail edge cases ──────────────────────────────────────────────

describe('fullName construction', () => {
    it('detail with :: already in it produces double-:: in fullName', () => {
        // If detail is "ns::Class", fullName = "ns::Class::method"
        const it = item('method', '/src/foo.cpp', 0, 'ns::Class');
        const graph = buildCallGraph(it, [], [], 'callGraph', 2, 'clangd');
        expect(graph.nodes[0].fullName).toBe('ns::Class::method');
    });

    it('empty string detail is treated as falsy — no separator added', () => {
        const it = item('fn', '/src/foo.c', 0, '');
        const graph = buildCallGraph(it, [], [], 'callGraph', 2, 'clangd');
        expect(graph.nodes[0].fullName).toBe('fn');
    });
});

// ── confidence is always 'high' regardless of tool ───────────────────────────

describe('BUG: confidence hardcoded to high', () => {
    it('buildCallGraph always returns confidence=high, even for non-clangd tools', () => {
        const target = item('foo', '/src/foo.c', 0);
        const graph = buildCallGraph(target, [], [], 'callGraph', 2, 'some-other-tool');
        // BUG: confidence is hardcoded to 'high' in buildCallGraph regardless of tool param
        expect(graph.confidence).toBe('high');
        // If called with tool='ctags', the graph will still say confidence='high'
        // which contradicts CtagsAnalyzer which sets confidence='medium' manually.
    });
});

// ── edge direction sanity ─────────────────────────────────────────────────────

describe('edge direction', () => {
    it('incoming call edge goes from caller to target (not reversed)', () => {
        const target = item('foo', '/src/foo.c', 10);
        const caller = item('bar', '/src/bar.c', 1);
        const graph = buildCallGraph(target, [incoming(caller)], [], 'callGraph', 2, 'clangd');
        const edge = graph.edges[0];
        expect(edge.targetId).toBe(graph.targetId);
        expect(edge.sourceId).not.toBe(graph.targetId);
    });

    it('outgoing call edge goes from target to callee (not reversed)', () => {
        const target = item('foo', '/src/foo.c', 10);
        const callee = item('baz', '/src/baz.c', 20);
        const graph = buildCallGraph(target, [], [outgoing(callee)], 'callGraph', 2, 'clangd');
        const edge = graph.edges[0];
        expect(edge.sourceId).toBe(graph.targetId);
        expect(edge.targetId).not.toBe(graph.targetId);
    });
});
