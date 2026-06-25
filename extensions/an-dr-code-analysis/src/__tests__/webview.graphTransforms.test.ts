import { applyFilter, foldCollapsedDirs, isNodeFiltered, mergeCircularEdges } from '../../webview-src/graph/graphTransforms';
import { GraphModel, GraphNode } from '../../webview-src/graph-renderers/types';

function graph(nodes: GraphNode[], edges: GraphModel['edges'] = []): GraphModel {
    return {
        graphType: 'callGraph',
        targetId: 'target',
        nodes,
        edges,
        depth: 2,
        tool: 'test',
        confidence: 'high',
    };
}

const target: GraphNode = {
    id: 'target',
    label: 'target',
    fullName: 'target',
    filePath: '/repo/src/main.ts',
    role: 'target',
};

describe('webview graph transforms', () => {
    it('filters non-target nodes by file path prefix', () => {
        const node: GraphNode = {
            id: 'helper',
            label: 'helper',
            fullName: 'helper',
            filePath: '/repo/src/helpers/a.ts',
            role: 'callee',
        };

        expect(isNodeFiltered(node, new Set(['/repo/src/helpers']))).toBe(true);
        expect(isNodeFiltered(target, new Set(['/repo/src']))).toBe(false);
    });

    it('applies filters and removes disconnected nodes', () => {
        const visible: GraphNode = { id: 'visible', label: 'visible', fullName: 'visible', filePath: '/repo/src/visible.ts', role: 'callee' };
        const hidden: GraphNode = { id: 'hidden', label: 'hidden', fullName: 'hidden', filePath: '/repo/src/hidden.ts', role: 'callee' };
        const disconnected: GraphNode = { id: 'orphan', label: 'orphan', fullName: 'orphan', filePath: '/repo/src/orphan.ts', role: 'callee' };
        const transformed = applyFilter(
            graph([target, visible, hidden, disconnected], [
                { sourceId: 'target', targetId: 'visible' },
                { sourceId: 'target', targetId: 'hidden' },
            ]),
            new Set(['/repo/src/hidden.ts']),
        );

        expect(transformed.nodes.map(n => n.id).sort()).toEqual(['target', 'visible']);
        expect(transformed.edges).toEqual([{ sourceId: 'target', targetId: 'visible' }]);
    });

    it('folds collapsed directories into folder nodes', () => {
        const a: GraphNode = { id: 'a', label: 'a', fullName: 'a', filePath: '/repo/pkg/a.ts', role: 'callee' };
        const b: GraphNode = { id: 'b', label: 'b', fullName: 'b', filePath: '/repo/pkg/b.ts', role: 'caller' };
        const transformed = foldCollapsedDirs(
            graph([target, a, b], [
                { sourceId: 'target', targetId: 'a' },
                { sourceId: 'b', targetId: 'target' },
                { sourceId: 'a', targetId: 'b' },
            ]),
            new Set(['/repo/pkg']),
        );

        expect(transformed.nodes.some(n => n.id === '/repo/pkg' && n.role === 'folder')).toBe(true);
        expect(transformed.edges).toEqual([
            { sourceId: 'target', targetId: '/repo/pkg', isExternal: undefined },
            { sourceId: '/repo/pkg', targetId: 'target', isExternal: undefined },
        ]);
    });

    it('merges reciprocal edges into one bidirectional edge', () => {
        const transformed = mergeCircularEdges(graph([target], [
            { sourceId: 'b', targetId: 'a' },
            { sourceId: 'a', targetId: 'b' },
        ]));

        expect(transformed.edges).toEqual([{ sourceId: 'a', targetId: 'b', isBidirectional: true }]);
    });
});
