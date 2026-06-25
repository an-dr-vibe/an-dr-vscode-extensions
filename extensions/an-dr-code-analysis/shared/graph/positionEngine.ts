/** Pure positioning algorithms — no Cytoscape dependency. */

export interface Pos { x: number; y: number; }
export interface Box { x: number; y: number; w: number; h: number; }

/** Minimal graph shape required by the positioning functions. */
export interface PosGraph {
    targetId: string;
    nodes: { id: string }[];
    edges: { sourceId: string; targetId: string }[];
}

// ── computeLevels ─────────────────────────────────────────────────────────────

/**
 * BFS from targetId through an undirected view of the graph.
 * Returns the hop count (level) for each node id.
 * Nodes unreachable from targetId get level 99.
 */
export function computeLevels(graph: PosGraph): Map<string, number> {
    const adj = new Map<string, string[]>(graph.nodes.map(n => [n.id, []]));
    for (const e of graph.edges) {
        adj.get(e.sourceId)?.push(e.targetId);
        adj.get(e.targetId)?.push(e.sourceId);
    }
    const levels = new Map<string, number>();
    const queue: string[] = [graph.targetId];
    levels.set(graph.targetId, 0);
    while (queue.length > 0) {
        const cur = queue.shift()!;
        const curLevel = levels.get(cur)!;
        for (const nb of (adj.get(cur) ?? [])) {
            if (!levels.has(nb)) { levels.set(nb, curLevel + 1); queue.push(nb); }
        }
    }
    for (const n of graph.nodes) {
        if (!levels.has(n.id)) { levels.set(n.id, 99); }
    }
    return levels;
}

// ── computeRoseLayout ────────────────────────────────────────────────────────

export interface RoseOptions {
    /** Radial step between consecutive rings in pixels. Default 150. */
    levelRadius?: number;
    /** Minimum chord gap between siblings in pixels. Default 120. */
    minSiblingSpacing?: number;
    /** Starting angle for the top-level ring (radians). Default −π/2 (up). */
    startAngle?: number;
}

/**
 * Hierarchical-radial "rose" layout.
 *
 * The target sits at the origin. Its BFS neighbours form the first ring.
 * Each ring-k node fans its children into an arc centred on the direction
 * away from its parent — creating a rose-like branching shape.
 *
 * Positions are returned in a coordinate system centred on (0, 0).
 */
export function computeRoseLayout(graph: PosGraph, opts?: RoseOptions): Map<string, Pos> {
    const LEVEL_R   = opts?.levelRadius       ?? 150;
    const MIN_CHORD = opts?.minSiblingSpacing ?? 120;
    const START_ANG = opts?.startAngle        ?? -Math.PI / 2;

    const adj = new Map<string, string[]>(graph.nodes.map(n => [n.id, []]));
    for (const e of graph.edges) {
        adj.get(e.sourceId)?.push(e.targetId);
        adj.get(e.targetId)?.push(e.sourceId);
    }

    // BFS spanning tree — children[id] = list of BFS children
    const children = new Map<string, string[]>(graph.nodes.map(n => [n.id, []]));
    const visited  = new Set([graph.targetId]);
    const bfsQ     = [graph.targetId];
    while (bfsQ.length > 0) {
        const cur = bfsQ.shift()!;
        for (const nb of (adj.get(cur) ?? [])) {
            if (!visited.has(nb)) {
                visited.add(nb);
                children.get(cur)!.push(nb);
                bfsQ.push(nb);
            }
        }
    }

    const positions = new Map<string, Pos>();
    const outAngle  = new Map<string, number>(); // direction parent → this node
    const halfArc   = new Map<string, number>(); // half of allocated angular budget

    positions.set(graph.targetId, { x: 0, y: 0 });
    halfArc.set(graph.targetId, Math.PI); // full 2π circle

    const procQ = [graph.targetId];
    while (procQ.length > 0) {
        const cur    = procQ.shift()!;
        const curPos = positions.get(cur)!;
        const kids   = children.get(cur) ?? [];
        if (kids.length === 0) { continue; }

        const myHalfArc = halfArc.get(cur)!;
        const myAngle   = outAngle.get(cur) ?? START_ANG;
        const N         = kids.length;
        const sliceHalf = myHalfArc / N;

        // Expand radius when siblings would be too close
        const minR = N > 1 ? MIN_CHORD / (2 * Math.sin(sliceHalf)) : LEVEL_R;
        const r    = Math.max(LEVEL_R, minR);

        for (let i = 0; i < N; i++) {
            const kid   = kids[i];
            const angle = N === 1
                ? myAngle
                : myAngle - myHalfArc + sliceHalf + i * 2 * sliceHalf;

            positions.set(kid, {
                x: curPos.x + r * Math.cos(angle),
                y: curPos.y + r * Math.sin(angle),
            });
            outAngle.set(kid, angle);
            halfArc.set(kid, sliceHalf);
            procQ.push(kid);
        }
    }

    // Scatter any node unreachable from targetId near the periphery
    let scatter = 0;
    for (const n of graph.nodes) {
        if (!positions.has(n.id)) {
            const a = (scatter++ / Math.max(1, graph.nodes.length)) * 2 * Math.PI;
            positions.set(n.id, { x: 200 * Math.cos(a), y: 200 * Math.sin(a) });
        }
    }

    return positions;
}

// ── computeTreeLayout ────────────────────────────────────────────────────────

export interface TreeOptions {
    /** Vertical distance between BFS levels in pixels. Default 120. */
    levelSpacing?: number;
    /** Minimum horizontal gap between nodes on the same level in pixels. Default 100. */
    nodeSpacing?: number;
}

/**
 * Pure top-down tree layout.
 * Target is at y=0; each BFS level is placed at y = level × levelSpacing.
 * Nodes within a level are spread evenly, centred on x=0.
 */
export function computeTreeLayout(graph: PosGraph, opts?: TreeOptions): Map<string, Pos> {
    const LEVEL_SPACING = opts?.levelSpacing ?? 120;
    const NODE_SPACING  = opts?.nodeSpacing  ?? 100;

    const levels = computeLevels(graph);
    const byLevel = new Map<number, string[]>();
    for (const [id, lv] of levels) {
        if (lv === 99) { continue; }
        if (!byLevel.has(lv)) { byLevel.set(lv, []); }
        byLevel.get(lv)!.push(id);
    }

    const positions = new Map<string, Pos>();
    for (const [lv, ids] of byLevel) {
        const totalWidth = (ids.length - 1) * NODE_SPACING;
        ids.forEach((id, i) => {
            positions.set(id, { x: -totalWidth / 2 + i * NODE_SPACING, y: lv * LEVEL_SPACING });
        });
    }

    const maxLevel = byLevel.size > 0 ? Math.max(...byLevel.keys()) : 0;
    let scatter = 0;
    for (const n of graph.nodes) {
        if (!positions.has(n.id)) {
            const a = (scatter++ / Math.max(1, graph.nodes.length)) * 2 * Math.PI;
            const r = (maxLevel + 2) * LEVEL_SPACING;
            positions.set(n.id, { x: r * Math.cos(a), y: r + r * 0.3 * Math.sin(a) });
        }
    }
    return positions;
}

// ── computeRadialLayout ──────────────────────────────────────────────────────

export interface RadialOptions {
    /** Radius step per BFS level in pixels. Default 150. */
    ringRadius?: number;
}

/**
 * Pure BFS-ring radial layout.
 * Target sits at (0,0); all nodes at BFS level L are placed on a circle of
 * radius L × ringRadius, distributed evenly by angle.
 * Unlike computeRoseLayout, angles are not parent-relative — each ring is independent.
 */
export function computeRadialLayout(graph: PosGraph, opts?: RadialOptions): Map<string, Pos> {
    const RING_R    = opts?.ringRadius ?? 150;
    const START_ANG = -Math.PI / 2;

    const levels = computeLevels(graph);
    const byLevel = new Map<number, string[]>();
    for (const [id, lv] of levels) {
        if (lv === 99) { continue; }
        if (!byLevel.has(lv)) { byLevel.set(lv, []); }
        byLevel.get(lv)!.push(id);
    }

    const positions = new Map<string, Pos>();
    positions.set(graph.targetId, { x: 0, y: 0 });

    for (const [lv, ids] of byLevel) {
        if (lv === 0) { continue; }
        const r = lv * RING_R;
        ids.forEach((id, i) => {
            const angle = START_ANG + (i / ids.length) * 2 * Math.PI;
            positions.set(id, { x: r * Math.cos(angle), y: r * Math.sin(angle) });
        });
    }

    const maxLevel = byLevel.size > 0 ? Math.max(...byLevel.keys()) : 0;
    let scatter = 0;
    for (const n of graph.nodes) {
        if (!positions.has(n.id)) {
            const a = (scatter++ / Math.max(1, graph.nodes.length)) * 2 * Math.PI;
            const r = (maxLevel + 2) * RING_R;
            positions.set(n.id, { x: r * Math.cos(a), y: r * Math.sin(a) });
        }
    }
    return positions;
}

// ── Metrics ───────────────────────────────────────────────────────────────────

function doSegmentsIntersect(a: Pos, b: Pos, c: Pos, d: Pos): boolean {
    const cross = (p: Pos, q: Pos, r: Pos) =>
        (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const d1 = cross(c, d, a), d2 = cross(c, d, b);
    const d3 = cross(a, b, c), d4 = cross(a, b, d);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
           ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Count pairs of edges whose drawn segments cross (shared-endpoint pairs are skipped). */
export function countEdgeCrossings(
    positions: Map<string, Pos>,
    edges: { sourceId: string; targetId: string }[],
): number {
    let count = 0;
    for (let i = 0; i < edges.length; i++) {
        const a = positions.get(edges[i].sourceId), b = positions.get(edges[i].targetId);
        if (!a || !b) { continue; }
        for (let j = i + 1; j < edges.length; j++) {
            const c = positions.get(edges[j].sourceId), d = positions.get(edges[j].targetId);
            if (!c || !d) { continue; }
            if (edges[i].sourceId === edges[j].sourceId || edges[i].sourceId === edges[j].targetId ||
                edges[i].targetId === edges[j].sourceId || edges[i].targetId === edges[j].targetId) { continue; }
            if (doSegmentsIntersect(a, b, c, d)) { count++; }
        }
    }
    return count;
}

/**
 * Count (A, B) node pairs where level(A) < level(B) but pos(A).y >= pos(B).y.
 * Zero means the tree invariant holds: deeper nodes are always lower on screen.
 */
export function countLayerViolations(
    positions: Map<string, Pos>,
    levels: Map<string, number>,
): number {
    const entries = [...levels.entries()].filter(([, lv]) => lv !== 99);
    let violations = 0;
    for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
            const [idA, lvA] = entries[i], [idB, lvB] = entries[j];
            if (lvA === lvB) { continue; }
            const [shallow, deep] = lvA < lvB ? [idA, idB] : [idB, idA];
            const yS = positions.get(shallow)?.y ?? 0;
            const yD = positions.get(deep)?.y    ?? 0;
            if (yS >= yD) { violations++; }
        }
    }
    return violations;
}

/**
 * Count (A, B) node pairs where level(A) < level(B) but radius(A) >= radius(B).
 * Zero means the radial invariant holds: deeper nodes are always on a wider ring.
 */
export function countRadiusViolations(
    positions: Map<string, Pos>,
    levels: Map<string, number>,
): number {
    const entries = [...levels.entries()].filter(([, lv]) => lv !== 99);
    let violations = 0;
    for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
            const [idA, lvA] = entries[i], [idB, lvB] = entries[j];
            if (lvA === lvB) { continue; }
            const [shallow, deep] = lvA < lvB ? [idA, idB] : [idB, idA];
            const pS = positions.get(shallow), pD = positions.get(deep);
            if (!pS || !pD) { continue; }
            if (Math.hypot(pS.x, pS.y) >= Math.hypot(pD.x, pD.y)) { violations++; }
        }
    }
    return violations;
}

// ── resolveOverlaps ───────────────────────────────────────────────────────────

/**
 * Iteratively separates overlapping boxes using a mutual push approach.
 *
 * `movers`  — the node ids that initiate overlap checks. Both the mover and
 *             the colliding node are pushed apart on each collision.
 * `margin`  — extra clearance added around every box (default 12).
 *
 * Returns updated centre positions for ALL nodes (unchanged nodes keep their
 * input position).
 */
export function resolveOverlaps(
    boxes:  Map<string, Box>,
    movers: Set<string>,
    margin = 12,
): Map<string, Pos> {
    // Working positions — initialised from box centres
    const pos = new Map<string, Pos>();
    boxes.forEach((b, id) => pos.set(id, { x: b.x, y: b.y }));

    const allIds     = [...boxes.keys()];
    const MAX_PASSES = 80;

    for (let pass = 0; pass < MAX_PASSES; pass++) {
        let moved = false;

        for (const aid of movers) {
            const ab = boxes.get(aid);
            if (!ab) { continue; }

            for (const bid of allIds) {
                if (aid === bid) { continue; }
                const bb = boxes.get(bid)!;
                const ap = pos.get(aid)!;
                const bp = pos.get(bid)!;

                const ox = Math.min(ap.x + ab.w / 2 + margin, bp.x + bb.w / 2 + margin)
                         - Math.max(ap.x - ab.w / 2 - margin, bp.x - bb.w / 2 - margin);
                const oy = Math.min(ap.y + ab.h / 2 + margin, bp.y + bb.h / 2 + margin)
                         - Math.max(ap.y - ab.h / 2 - margin, bp.y - bb.h / 2 - margin);

                if (ox <= 0 || oy <= 0) { continue; }

                if (ox < oy) {
                    const dir = ap.x <= bp.x ? -1 : 1;
                    pos.set(aid, { x: ap.x + dir * ox * 0.5, y: ap.y });
                    pos.set(bid, { x: bp.x - dir * ox * 0.5, y: bp.y });
                } else {
                    const dir = ap.y <= bp.y ? -1 : 1;
                    pos.set(aid, { x: ap.x, y: ap.y + dir * oy * 0.5 });
                    pos.set(bid, { x: bp.x, y: bp.y - dir * oy * 0.5 });
                }
                moved = true;
            }
        }

        if (!moved) { break; }
    }

    return pos;
}
