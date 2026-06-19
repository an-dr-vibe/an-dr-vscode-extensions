import {
    computeLevels, roseLayout, resolveOverlaps,
    treeLayout, radialLayout,
    countEdgeCrossings, countLayerViolations, countRadiusViolations,
    PosGraph, Box, Pos,
} from '../graph/positionEngine';

// ── Helpers ───────────────────────────────────────────────────────────────────

function g(targetId: string, nodeIds: string[], edges: [string, string][]): PosGraph {
    return {
        targetId,
        nodes: nodeIds.map(id => ({ id })),
        edges: edges.map(([s, t]) => ({ sourceId: s, targetId: t })),
    };
}

function dist(a: Pos, b: Pos): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function angle(origin: Pos, p: Pos): number {
    return Math.atan2(p.y - origin.y, p.x - origin.x);
}

function box(id: string, x: number, y: number, w = 80, h = 30): [string, Box] {
    return [id, { x, y, w, h }];
}

const EPS = 1e-4;

// ── computeLevels ─────────────────────────────────────────────────────────────

describe('computeLevels', () => {
    it('returns 0 for the target in a single-node graph', () => {
        expect(computeLevels(g('A', ['A'], [])).get('A')).toBe(0);
    });

    it('assigns level 1 to all direct neighbours of the target', () => {
        const graph = g('T', ['T', 'A', 'B', 'C'], [['T', 'A'], ['T', 'B'], ['T', 'C']]);
        const lv = computeLevels(graph);
        expect(lv.get('T')).toBe(0);
        expect(lv.get('A')).toBe(1);
        expect(lv.get('B')).toBe(1);
        expect(lv.get('C')).toBe(1);
    });

    it('correctly levels a chain T→A→B→C', () => {
        const graph = g('T', ['T', 'A', 'B', 'C'], [['T', 'A'], ['A', 'B'], ['B', 'C']]);
        const lv = computeLevels(graph);
        expect(lv.get('T')).toBe(0);
        expect(lv.get('A')).toBe(1);
        expect(lv.get('B')).toBe(2);
        expect(lv.get('C')).toBe(3);
    });

    it('treats edges as undirected — reverse edges give the same levels', () => {
        const graph = g('T', ['T', 'A', 'B'], [['A', 'T'], ['B', 'A']]);
        const lv = computeLevels(graph);
        expect(lv.get('T')).toBe(0);
        expect(lv.get('A')).toBe(1);
        expect(lv.get('B')).toBe(2);
    });

    it('assigns level 99 to nodes not reachable from the target', () => {
        const graph = g('T', ['T', 'X'], []);
        expect(computeLevels(graph).get('X')).toBe(99);
    });

    it('includes all nodes in the result map', () => {
        const graph = g('T', ['T', 'A', 'B'], [['T', 'A']]);
        const lv = computeLevels(graph);
        expect(lv.size).toBe(3);
        expect(lv.has('B')).toBe(true);
    });
});

// ── roseLayout ────────────────────────────────────────────────────────────────

describe('roseLayout', () => {
    it('places the target at the origin', () => {
        const pos = roseLayout(g('T', ['T'], []));
        expect(pos.get('T')!.x).toBeCloseTo(0, 5);
        expect(pos.get('T')!.y).toBeCloseTo(0, 5);
    });

    it('returns a position for every node in the graph', () => {
        const graph = g('T', ['T', 'A', 'B'], [['T', 'A'], ['T', 'B']]);
        const pos = roseLayout(graph);
        expect(pos.has('T')).toBe(true);
        expect(pos.has('A')).toBe(true);
        expect(pos.has('B')).toBe(true);
    });

    it('all level-1 nodes are equidistant from the origin', () => {
        const graph = g('T', ['T', 'A', 'B', 'C', 'D'], [
            ['T', 'A'], ['T', 'B'], ['T', 'C'], ['T', 'D'],
        ]);
        const pos = roseLayout(graph);
        const origin = pos.get('T')!;
        const radii = ['A', 'B', 'C', 'D'].map(id => dist(origin, pos.get(id)!));
        for (const r of radii) { expect(r).toBeCloseTo(radii[0], 3); }
    });

    it('level-1 nodes are spread at evenly spaced angles', () => {
        const graph = g('T', ['T', 'A', 'B', 'C'], [['T', 'A'], ['T', 'B'], ['T', 'C']]);
        const pos = roseLayout(graph);
        const origin = pos.get('T')!;
        const angles = ['A', 'B', 'C']
            .map(id => angle(origin, pos.get(id)!))
            .sort((a, b) => a - b);
        const gaps = [angles[1] - angles[0], angles[2] - angles[1]];
        expect(gaps[0]).toBeCloseTo(gaps[1], 3);
    });

    it('level-2 node is further from origin than its level-1 parent', () => {
        const graph = g('T', ['T', 'A', 'B'], [['T', 'A'], ['A', 'B']]);
        const pos = roseLayout(graph);
        const origin = pos.get('T')!;
        expect(dist(origin, pos.get('B')!)).toBeGreaterThan(dist(origin, pos.get('A')!) + EPS);
    });

    it('level-2 children are placed in the outward direction of their parent', () => {
        // T at centre; A is the single level-1 node so it goes to startAngle (-π/2, i.e. upward).
        // B is A's only child and should be further in the same direction.
        const graph = g('T', ['T', 'A', 'B'], [['T', 'A'], ['A', 'B']]);
        const pos = roseLayout(graph);
        const origin = pos.get('T')!;
        const aAngle = angle(origin, pos.get('A')!);
        const bAngle = angle(pos.get('A')!, pos.get('B')!);
        // B continues outward from A — the angles should be close
        const diff = Math.abs(((bAngle - aAngle) + Math.PI) % (2 * Math.PI) - Math.PI);
        expect(diff).toBeLessThan(0.3); // within ~17°
    });

    it('all node positions are unique', () => {
        const ids = ['T', 'A', 'B', 'C', 'D', 'E'];
        const graph = g('T', ids, [
            ['T', 'A'], ['T', 'B'], ['A', 'C'], ['A', 'D'], ['B', 'E'],
        ]);
        const pos = roseLayout(graph);
        const keys = ids.map(id => {
            const p = pos.get(id)!;
            return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
        });
        expect(new Set(keys).size).toBe(ids.length);
    });

    it('levelRadius option scales ring distance', () => {
        const graph = g('T', ['T', 'A'], [['T', 'A']]);
        const d150 = dist(roseLayout(graph, { levelRadius: 150 }).get('T')!, roseLayout(graph, { levelRadius: 150 }).get('A')!);
        const d300 = dist(roseLayout(graph, { levelRadius: 300 }).get('T')!, roseLayout(graph, { levelRadius: 300 }).get('A')!);
        expect(d300).toBeGreaterThan(d150 + EPS);
    });

    it('disconnected nodes still get a position (not undefined)', () => {
        const graph = g('T', ['T', 'A', 'X'], [['T', 'A']]); // X is isolated
        const pos = roseLayout(graph);
        expect(pos.get('X')).toBeDefined();
    });
});

// ── resolveOverlaps ───────────────────────────────────────────────────────────

describe('resolveOverlaps', () => {
    it('does not move nodes that are already well-separated', () => {
        const boxes = new Map([box('A', 0, 0), box('B', 200, 0)]);
        const result = resolveOverlaps(boxes, new Set(['A', 'B']), 0);
        expect(result.get('A')!.x).toBeCloseTo(0, 3);
        expect(result.get('B')!.x).toBeCloseTo(200, 3);
    });

    it('separates two horizontally overlapping boxes', () => {
        // Tall thin boxes (w=30, h=200) placed 20px apart on x-axis.
        // x-overlap is small, y-overlap is large → algorithm pushes horizontally (min overlap axis).
        const boxes = new Map([box('A', 0, 0, 30, 200), box('B', 20, 0, 30, 200)]);
        const result = resolveOverlaps(boxes, new Set(['A', 'B']), 0);
        const ax = result.get('A')!.x;
        const bx = result.get('B')!.x;
        // Centres must be ≥ one box-width apart so edges no longer touch
        expect(bx - ax).toBeGreaterThanOrEqual(30 - EPS);
    });

    it('separates two vertically overlapping boxes', () => {
        // Wide flat boxes (w=200, h=30) placed 20px apart on y-axis.
        // y-overlap is small, x-overlap is large → algorithm pushes vertically.
        const boxes = new Map([box('A', 0, 0, 200, 30), box('B', 0, 20, 200, 30)]);
        const result = resolveOverlaps(boxes, new Set(['A', 'B']), 0);
        const ay = result.get('A')!.y;
        const by = result.get('B')!.y;
        expect(Math.abs(by - ay)).toBeGreaterThanOrEqual(30 - EPS);
    });

    it('returns positions for all nodes, not just movers', () => {
        const boxes = new Map([box('A', 0, 0), box('B', 10, 0), box('C', 200, 0)]);
        const result = resolveOverlaps(boxes, new Set(['A']), 0);
        expect(result.has('A')).toBe(true);
        expect(result.has('B')).toBe(true);
        expect(result.has('C')).toBe(true);
    });

    it('respects the margin — leaves at least margin gap on each side', () => {
        const margin = 20;
        // A(40×40) at x=0, B(40×40) at x=50: right of A=20, left of B=30, 10px overlap without margin
        // With margin=20 on each side: A extends to 40, B starts at 10 → now overlap = 30px
        const boxes = new Map([box('A', 0, 0, 40, 40), box('B', 50, 0, 40, 40)]);
        const result = resolveOverlaps(boxes, new Set(['A', 'B']), margin);
        const ax = result.get('A')!.x;
        const bx = result.get('B')!.x;
        // Centre gap must be at least w + 2*margin = 40 + 40 = 80
        expect(bx - ax).toBeGreaterThanOrEqual(80 - EPS);
    });

    it('converges — identical stacked boxes get pushed apart within MAX_PASSES', () => {
        const boxes = new Map([
            box('A', 0, 0, 60, 60),
            box('B', 0, 0, 60, 60),
            box('C', 0, 0, 60, 60),
        ]);
        const result = resolveOverlaps(boxes, new Set(['A', 'B', 'C']), 5);
        const positions = ['A', 'B', 'C'].map(id => result.get(id)!);
        // All three should be at distinct positions
        const keys = positions.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
        expect(new Set(keys).size).toBe(3);
    });
});

// ── Scenarios ─────────────────────────────────────────────────────────────────
// Three hardcoded graphs that represent real-world layout stress cases.

/** Hub: 1 target + 15 leaves all connected to it + 5 cross-edges between leaves. */
const hubGraph: PosGraph = (() => {
    const leaves = Array.from({ length: 15 }, (_, i) => `L${i}`);
    const crossEdges: [string, string][] = [
        ['L0', 'L3'], ['L2', 'L7'], ['L5', 'L10'], ['L8', 'L13'], ['L11', 'L1'],
    ];
    return g('T', ['T', ...leaves], [
        ...leaves.map(l => ['T', l] as [string, string]),
        ...crossEdges,
    ]);
})();

/** Chain: linear A→B→C→…→L (12 nodes, 11 edges). */
const chainGraph: PosGraph = (() => {
    const ids = Array.from({ length: 12 }, (_, i) => String.fromCharCode(65 + i)); // A..L
    return g(ids[0], ids, ids.slice(0, -1).map((id, i) => [id, ids[i + 1]] as [string, string]));
})();

/** Balanced binary tree: target + 3 children each with 3 grandchildren (13 nodes, 12 edges). */
const balancedTree: PosGraph = (() => {
    const children = ['C0', 'C1', 'C2'];
    const grandchildren = children.flatMap(c => [0, 1, 2].map(i => `${c}G${i}`));
    return g('T', ['T', ...children, ...grandchildren], [
        ...children.map(c => ['T', c] as [string, string]),
        ...children.flatMap(c => [0, 1, 2].map(i => [c, `${c}G${i}`] as [string, string])),
    ]);
})();

// ── treeLayout metrics ────────────────────────────────────────────────────────

describe('treeLayout — layer violations', () => {
    it('hub graph: zero layer violations', () => {
        const pos = treeLayout(hubGraph);
        const levels = computeLevels(hubGraph);
        expect(countLayerViolations(pos, levels)).toBe(0);
    });

    it('chain graph: zero layer violations', () => {
        const pos = treeLayout(chainGraph);
        const levels = computeLevels(chainGraph);
        expect(countLayerViolations(pos, levels)).toBe(0);
    });

    it('balanced tree: zero layer violations', () => {
        const pos = treeLayout(balancedTree);
        const levels = computeLevels(balancedTree);
        expect(countLayerViolations(pos, levels)).toBe(0);
    });
});

// ── radialLayout metrics ──────────────────────────────────────────────────────

describe('radialLayout — radius violations', () => {
    it('hub graph: zero radius violations', () => {
        const pos = radialLayout(hubGraph);
        const levels = computeLevels(hubGraph);
        expect(countRadiusViolations(pos, levels)).toBe(0);
    });

    it('chain graph: zero radius violations', () => {
        const pos = radialLayout(chainGraph);
        const levels = computeLevels(chainGraph);
        expect(countRadiusViolations(pos, levels)).toBe(0);
    });

    it('balanced tree: zero radius violations', () => {
        const pos = radialLayout(balancedTree);
        const levels = computeLevels(balancedTree);
        expect(countRadiusViolations(pos, levels)).toBe(0);
    });
});

// ── roseLayout metrics ────────────────────────────────────────────────────────

describe('roseLayout — edge crossings', () => {
    it('chain graph: zero crossings (single path, no branches)', () => {
        const pos = roseLayout(chainGraph);
        expect(countEdgeCrossings(pos, chainGraph.edges)).toBe(0);
    });

    it('balanced tree: zero crossings (pure tree, no cycles)', () => {
        const pos = roseLayout(balancedTree);
        expect(countEdgeCrossings(pos, balancedTree.edges)).toBe(0);
    });

    it('hub graph: fewer crossings than a random baseline', () => {
        // Random baseline: scatter all nodes on a fixed grid, count crossings
        const ids = hubGraph.nodes.map(n => n.id);
        const randomPos = new Map(ids.map((id, i) => [id, { x: (i % 4) * 50, y: Math.floor(i / 4) * 50 }]));
        const roseCrossings   = countEdgeCrossings(roseLayout(hubGraph), hubGraph.edges);
        const randomCrossings = countEdgeCrossings(randomPos,            hubGraph.edges);
        expect(roseCrossings).toBeLessThan(randomCrossings);
    });
});
