// D3 is ESM-only; mock it so grouped strategy imports work in CommonJS Jest.
jest.mock('d3', () => ({
    forceSimulation: (nodes: any[]) => {
        const sim = {
            force: function() { return sim; },
            stop:  function() { return sim; },
            tick:  function() {
                nodes.forEach((n: any, i: number) => {
                    if (n.x === undefined) { n.x = i * 100; }
                    if (n.y === undefined) { n.y = 0; }
                });
                return sim;
            },
        };
        return sim;
    },
    forceLink:     () => ({ distance: () => ({ strength: () => ({}) }) }),
    forceManyBody: () => ({ strength: () => ({}) }),
    forceCenter:   () => ({}),
    forceCollide:  () => ({ radius: () => ({}) }),
}));

import {
    defaultLayoutForGraphType,
    GraphLayoutInput,
    resolveGraphLayout,
} from '../../webview-src/graph-layouts/layoutStrategies';

function graph(graphType = 'callGraph'): GraphLayoutInput {
    return {
        graphType,
        targetId: 'a',
        nodes: [
            { id: 'a', filePath: '/root/src/a.ts' },
            { id: 'b', filePath: '/root/src/b.ts' },
        ],
        edges: [{ sourceId: 'a', targetId: 'b' }],
    };
}

describe('layoutStrategies', () => {
    it('resolves the default layout policy by graph type and view mode', () => {
        expect(defaultLayoutForGraphType('callGraph', false)).toBe('radial');
        expect(defaultLayoutForGraphType('fileDeps', false)).toBe('force');
        expect(defaultLayoutForGraphType('callGraph', true)).toBe('hierarchical');
    });

    it('delegates force layout to the renderer callback', () => {
        const positions = new Map([['a', { x: 1, y: 2 }], ['b', { x: 3, y: 4 }]]);
        const forceLayout = jest.fn(() => positions);

        const result = resolveGraphLayout(graph('fileDeps'), { forceLayout });

        expect(result.name).toBe('force');
        expect(result.positions).toBe(positions);
        expect(result.groupedLayout).toBeNull();
        expect(forceLayout).toHaveBeenCalledTimes(1);
    });

    it('returns grouped frame data for the grouped strategy', () => {
        const result = resolveGraphLayout(graph(), {
            requestedLayoutName: 'grouped',
            forceLayout: jest.fn(),
        });

        expect(result.name).toBe('grouped');
        expect(result.groupedLayout).not.toBeNull();
        expect(result.groupedLayout!.frames.length).toBeGreaterThan(0);
        expect(result.positions.has('a')).toBe(true);
        expect(result.positions.has('b')).toBe(true);
    });
});
