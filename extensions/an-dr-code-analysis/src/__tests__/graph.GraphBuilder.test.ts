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
