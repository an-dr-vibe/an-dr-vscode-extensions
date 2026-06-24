import * as d3 from 'd3';
import { Pos } from '../../src/graph/positionEngine';

// ── Public interfaces ──────────────────────────────────────────────────────────

/** Minimal node shape required by the grouped layout engine. */
export interface GroupedLayoutNode {
    id: string;
    filePath?: string;
    label?: string; // display label; used to estimate rendered width
}

/** Minimal edge shape required by the grouped layout engine. */
export interface GroupedLayoutEdge {
    sourceId: string;
    targetId: string;
}

/** Minimal graph shape required by the grouped layout engine. */
export interface GroupedLayoutGraph {
    nodes: GroupedLayoutNode[];
    edges: GroupedLayoutEdge[];
    workspaceRoot?: string;
}

export interface GroupFrame {
    id:            string;       // unique key — compressed relative path
    label:         string;       // display label (may be truncated for long external paths)
    fullLabel?:    string;       // full un-truncated path, shown as hover tooltip when set
    nodeIds:       string[];     // direct function node members (file frames only)
    childFrameIds: string[];     // sub-frame ids (dir frames only)
    parentId:      string | null;
    isFile:        boolean;      // true = file frame, false = dir frame
    bounds:        { x: number; y: number; w: number; h: number };
}

export interface GroupedLayout {
    positions:   Map<string, Pos>;
    frames:      GroupFrame[];
    frameBounds: Map<string, { x: number; y: number; w: number; h: number }>;
}

// ── Internal constants ────────────────────────────────────────────────────────

const NODE_W       = 110; // minimum / default node width
const NODE_H       = 28;
const FRAME_PAD    = 16;
const LABEL_H      = 20;
const MIN_FRAME_W  = 140;
const MIN_FRAME_H  = 60;
const ISOLATED_GAP = 16; // gap between items with no direct edges
const CLUSTER_GAP  = 32; // gap between items in the same connected cluster, and between blocks

/** Estimate rendered pixel width of a node when no renderer sizing primitive is supplied. */
function estimateDefaultNodeWidth(label: string): number {
    return Math.max(NODE_W, Math.min(label.length * 7 + 28, 200));
}

// ── Internal tree types ───────────────────────────────────────────────────────

interface DirNode  { type: 'dir';  children: Map<string, TreeNode>; }
interface FileNode { type: 'file'; name: string; nodeIds: string[]; }
type TreeNode = DirNode | FileNode;
const EMPTY_BOUNDS = { x: 0, y: 0, w: 0, h: 0 };

// ── Path helpers ──────────────────────────────────────────────────────────────

/** Longest common directory prefix of all paths (ends with '/'). */
export function commonPathPrefix(paths: string[]): string {
    if (paths.length === 0) { return ''; }
    if (paths.length === 1) {
        const i = paths[0].lastIndexOf('/');
        return i >= 0 ? paths[0].slice(0, i + 1) : '';
    }
    const parts = paths.map(p => p.split('/'));
    const minLen = Math.min(...parts.map(p => p.length - 1)); // exclude filename
    let i = 0;
    while (i < minLen && parts.every(p => p[i] === parts[0][i])) { i++; }
    return i > 0 ? parts[0].slice(0, i).join('/') + '/' : '';
}

function insertIntoTree(root: DirNode, segments: string[], nodeIds: string[]): void {
    let cur = root;
    for (let i = 0; i < segments.length - 1; i++) {
        const seg = segments[i];
        if (!cur.children.has(seg)) { cur.children.set(seg, { type: 'dir', children: new Map() }); }
        const child = cur.children.get(seg)!;
        if (child.type !== 'dir') { return; }
        cur = child;
    }
    const filename = segments[segments.length - 1];
    cur.children.set(filename, { type: 'file', name: filename, nodeIds });
}

/**
 * Format an external path label for compact display.
 * Strips the "external/" prefix, prepends "/", and truncates the middle when
 * there are more than 4 segments, keeping first 2 + "..." + last 2.
 * Returns null for non-external labels (no formatting needed).
 */
function formatExternalLabel(label: string): { display: string; full: string } | null {
    if (!label.startsWith('external/')) { return null; }
    const parts = label.slice('external/'.length).split('/').filter(Boolean);
    const full = '/' + parts.join('/');
    if (parts.length <= 4) { return { display: full, full }; }
    const display = `/${parts[0]}/${parts[1]}/.../${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    return { display, full };
}

function normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

function stripLeadingDot(path: string): string {
    return path.replace(/^\.\//, '');
}

function isWindowsAbsolute(path: string): boolean {
    return /^[A-Za-z]:\//.test(path);
}

function isAbsolutePath(path: string): boolean {
    return path.startsWith('/') || isWindowsAbsolute(path);
}

function stripTrailingSlash(path: string): string {
    if (path === '/' || /^[A-Za-z]:\/$/.test(path)) { return path; }
    return path.replace(/\/+$/, '');
}

function pathKey(path: string, workspaceRoot: string): string {
    return /^[A-Za-z]:($|\/)/.test(workspaceRoot) ? path.toLowerCase() : path;
}

function basename(path: string): string {
    const parts = path.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? path;
}

function externalPath(path: string): string {
    const parts = normalizePath(path).split('/').filter(part => part && part !== '.')
        .map(part => part === '..' ? 'parent' : part);
    if (parts.length === 0) { return 'external/unknown'; }
    if (/^[A-Za-z]:$/.test(parts[0])) { parts[0] = parts[0].replace(':', ''); }
    return `external/${parts.join('/')}`;
}

/** Convert a node path to the grouped-layout display path. */
export function displayPathForGroup(filePath: string, workspaceRoot?: string): string {
    const fp = stripLeadingDot(normalizePath(filePath));
    if (!fp) { return ''; }
    if (!isAbsolutePath(fp)) {
        return fp === '..' || fp.startsWith('../') ? externalPath(fp) : fp;
    }

    if (workspaceRoot) {
        const root = stripTrailingSlash(normalizePath(workspaceRoot));
        if (!root) { return externalPath(fp); }
        const fpCmp = pathKey(fp, root);
        const rootCmp = pathKey(root, root);
        const separator = root.endsWith('/') ? '' : '/';
        if (fpCmp === rootCmp) { return basename(root); }
        if (fpCmp.startsWith(rootCmp + separator)) { return fp.slice(root.length + separator.length); }
        return externalPath(fp);
    }

    const parts = fp.split('/').filter(Boolean);
    if (parts.length <= 1) { return parts.join('/'); }

    // Absolute paths carry a workspace/root prefix that is noisy in frame labels.
    // Windows paths include the drive segment, so drop drive + root together.
    if (/^[A-Za-z]:$/.test(parts[0]) && parts.length > 2) {
        return parts.slice(2).join('/');
    }
    return parts.slice(1).join('/');
}

/**
 * Returns the display label for a frame, stripping the parent's path prefix so
 * that nested frames show only the segment(s) that differ from their parent.
 * External paths (starting with "external/") are returned unchanged so that
 * formatExternalLabel can apply its own truncation logic.
 */
function displayLabelFor(fullPath: string, parentId: string | null): string {
    if (fullPath.startsWith('external/')) { return fullPath; }
    if (!parentId) { return fullPath; }
    const prefix = parentId + '/';
    return fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
}

function createFrame(
    id: string,
    label: string,
    nodeIds: string[],
    childFrameIds: string[],
    parentId: string | null,
    isFile: boolean,
): GroupFrame {
    const ext = formatExternalLabel(label);
    return {
        id,
        label:     ext ? ext.display : label,
        fullLabel: ext && ext.display !== ext.full ? ext.full : undefined,
        nodeIds, childFrameIds, parentId, isFile, bounds: { ...EMPTY_BOUNDS },
    };
}

// ── Tree building (exported for testing) ─────────────────────────────────────

/** Build a raw directory tree from node filePaths. Uses full normalised path segments. */
export function buildGroupTree(graph: GroupedLayoutGraph): { root: DirNode } {
    const fileToNodes = new Map<string, string[]>();
    for (const node of graph.nodes) {
        const fp = node.filePath ? displayPathForGroup(node.filePath, graph.workspaceRoot) : undefined;
        if (!fp) { continue; }
        if (!fileToNodes.has(fp)) { fileToNodes.set(fp, []); }
        fileToNodes.get(fp)!.push(node.id);
    }
    // Strip the common root directory prefix shared by all workspace-relative paths
    // so that labels like "dir1/src/utils" appear as "src/utils" instead.
    const localPaths = [...fileToNodes.keys()].filter(fp => !fp.startsWith('external/'));
    const rootPrefix = localPaths.length > 1 ? commonPathPrefix(localPaths) : '';

    const root: DirNode = { type: 'dir', children: new Map() };
    for (const [fp, nodeIds] of fileToNodes) {
        const effective = rootPrefix && !fp.startsWith('external/') ? fp.slice(rootPrefix.length) : fp;
        const segments = effective.split('/').filter(Boolean);
        if (segments.length > 0) { insertIntoTree(root, segments, nodeIds); }
    }
    return { root };
}

/**
 * Flatten the tree into GroupFrame[], compressing single-child chains.
 * a/ → b/ → c/ (each with one child) → one dir frame labeled "a/b/c".
 * a/ → b/ → file.ts (single chain all the way to a file) → one file frame "a/b/file.ts".
 */
export function buildFrameTree(graph: GroupedLayoutGraph): GroupFrame[] {
    const { root } = buildGroupTree(graph);
    const frames: GroupFrame[] = [];
    for (const [key, child] of root.children) {
        flattenNode(child, key, null, frames);
    }
    return frames;
}

function flattenNode(node: TreeNode, label: string, parentId: string | null, frames: GroupFrame[]): string[] {
    if (node.type === 'file') {
        frames.push(createFrame(label, displayLabelFor(label, parentId), node.nodeIds, [], parentId, true));
        return [label];
    }
    // Dir: walk down single-child chains, compressing them into the label.
    let curLabel = label;
    let curNode: DirNode = node;
    while (curNode.children.size === 1) {
        const [childKey, childNode] = [...curNode.children.entries()][0];
        curLabel = `${curLabel}/${childKey}`;
        if (childNode.type === 'file') {
            // Chain ends at a single file — emit as one file frame.
            frames.push(createFrame(curLabel, displayLabelFor(curLabel, parentId), childNode.nodeIds, [], parentId, true));
            return [curLabel];
        }
        curNode = childNode;
    }
    // Multiple children: emit a dir frame, then recurse into each child.
    const dirFrame = createFrame(curLabel, displayLabelFor(curLabel, parentId), [], [], parentId, false);
    frames.push(dirFrame);
    for (const [childKey, childNode] of curNode.children) {
        const childLabel = `${curLabel}/${childKey}`;
        const created = flattenNode(childNode, childLabel, curLabel, frames);
        dirFrame.childFrameIds.push(...created);
    }
    return [curLabel];
}

// ── Compact connectivity-aware layout ─────────────────────────────────────────

/** BFS connected-component finder over an id list with an undirected adjacency predicate. */
function findComponents(ids: string[], hasEdge: (a: string, b: string) => boolean): string[][] {
    const visited = new Set<string>();
    const components: string[][] = [];
    for (const id of ids) {
        if (visited.has(id)) { continue; }
        const comp: string[] = [];
        const stack = [id];
        while (stack.length > 0) {
            const cur = stack.pop()!;
            if (visited.has(cur)) { continue; }
            visited.add(cur);
            comp.push(cur);
            for (const other of ids) {
                if (!visited.has(other) && (hasEdge(cur, other) || hasEdge(other, cur))) {
                    stack.push(other);
                }
            }
        }
        components.push(comp);
    }
    return components;
}

/**
 * Place items in a ⌈√N⌉-column grid at the given gap.
 * Returns top-left positions in a local coordinate system starting at (0, 0).
 */
function layoutGrid(
    ids: string[],
    itemW: (id: string) => number,
    itemH: (id: string) => number,
    gap: number,
): Map<string, { x: number; y: number }> {
    const cols = Math.max(1, Math.ceil(Math.sqrt(ids.length)));
    const pos = new Map<string, { x: number; y: number }>();
    let x = 0, y = 0, rowH = 0;
    ids.forEach((id, i) => {
        if (i > 0 && i % cols === 0) { x = 0; y += rowH + gap; rowH = 0; }
        pos.set(id, { x, y });
        x += itemW(id) + gap;
        rowH = Math.max(rowH, itemH(id));
    });
    return pos;
}

/**
 * Arrange items so that unrelated items (component size 1) form a square-ish grid
 * with ISOLATED_GAP, while connected clusters each become their own grid block
 * with CLUSTER_GAP. All resulting blocks are shelf-packed together.
 * Returns top-left positions in a local coordinate system starting at (0, 0).
 */
function layoutGroup(
    itemIds: string[],
    itemW: (id: string) => number,
    itemH: (id: string) => number,
    hasEdge: (a: string, b: string) => boolean,
    isolatedGap: number,
    clusterGap: number,
): Map<string, { x: number; y: number }> {
    if (itemIds.length === 0) { return new Map(); }
    if (itemIds.length === 1) { return new Map([[itemIds[0], { x: 0, y: 0 }]]); }

    const components = findComponents(itemIds, hasEdge);
    const isolated: string[] = [];
    const clusters: string[][] = [];
    for (const comp of components) {
        if (comp.length === 1) { isolated.push(comp[0]); } else { clusters.push(comp); }
    }

    const blockBounds = (pos: Map<string, { x: number; y: number }>): { w: number; h: number } => {
        let w = 0, h = 0;
        for (const [id, p] of pos) { w = Math.max(w, p.x + itemW(id)); h = Math.max(h, p.y + itemH(id)); }
        return { w, h };
    };
    const blocks: Array<{ pos: Map<string, { x: number; y: number }>; w: number; h: number }> = [];
    for (const cluster of clusters) {
        const pos = layoutGrid(cluster, itemW, itemH, clusterGap);
        blocks.push({ pos, ...blockBounds(pos) });
    }
    if (isolated.length > 0) {
        const pos = layoutGrid(isolated, itemW, itemH, isolatedGap);
        blocks.push({ pos, ...blockBounds(pos) });
    }

    if (blocks.length === 1) { return blocks[0].pos; }

    // Shelf-pack all blocks tallest-first; target width ≈ √(total area) × 1.4
    const sorted = [...blocks].sort((a, b) => b.h - a.h);
    const targetW = Math.sqrt(sorted.reduce((s, b) => s + (b.w + clusterGap) * (b.h + clusterGap), 0)) * 1.4;
    let rowX = 0, rowY = 0, rowH = 0;
    const result = new Map<string, { x: number; y: number }>();
    for (const block of sorted) {
        if (rowX + block.w > targetW && rowX > 0) { rowX = 0; rowY += rowH + clusterGap; rowH = 0; }
        for (const [id, p] of block.pos) { result.set(id, { x: rowX + p.x, y: rowY + p.y }); }
        rowX += block.w + clusterGap;
        rowH = Math.max(rowH, block.h);
    }
    return result;
}

// ── Within-frame layout ───────────────────────────────────────────────────────

/**
 * Lay out nodes within a single file frame using connectivity-aware compact packing.
 * Nodes that share a direct edge form a cluster (clusterGap); isolated nodes go
 * into a square-ish grid (isolatedGap). Returns positions centered at (0, 0).
 * nodeWidths maps each node id to its estimated rendered pixel width.
 */
function layoutFileFrame(
    nodeIds: string[],
    edges: GroupedLayoutEdge[],
    nodeWidths: Map<string, number>,
): Map<string, Pos> {
    if (nodeIds.length === 0) { return new Map(); }
    if (nodeIds.length === 1) { return new Map([[nodeIds[0], { x: 0, y: 0 }]]); }

    const edgeFwd = new Set(edges.map(e => `${e.sourceId}\x00${e.targetId}`));
    const hasEdge = (a: string, b: string) => edgeFwd.has(`${a}\x00${b}`) || edgeFwd.has(`${b}\x00${a}`);
    const nw = (id: string) => nodeWidths.get(id) ?? NODE_W;

    const topLeft = layoutGroup(nodeIds, nw, () => NODE_H, hasEdge, ISOLATED_GAP, CLUSTER_GAP);

    // Convert top-left corners to node centers, then re-center the whole frame at (0, 0).
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const [id, p] of topLeft) {
        x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
        x2 = Math.max(x2, p.x + nw(id)); y2 = Math.max(y2, p.y + NODE_H);
    }
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    return new Map([...topLeft.entries()].map(([id, p]) => [
        id, { x: p.x + nw(id) / 2 - cx, y: p.y + NODE_H / 2 - cy },
    ]));
}

// ── Frame size ────────────────────────────────────────────────────────────────

function localFrameSize(
    nodeIds: string[],
    localPos: Map<string, Pos>,
    nodeWidths: Map<string, number>,
): { w: number; h: number } {
    if (nodeIds.length === 0) { return { w: MIN_FRAME_W, h: MIN_FRAME_H }; }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const id of nodeIds) {
        const p = localPos.get(id) ?? { x: 0, y: 0 };
        const hw = (nodeWidths.get(id) ?? NODE_W) / 2;
        x1 = Math.min(x1, p.x - hw);
        y1 = Math.min(y1, p.y - NODE_H / 2);
        x2 = Math.max(x2, p.x + hw);
        y2 = Math.max(y2, p.y + NODE_H / 2);
    }
    return {
        w: Math.max(x2 - x1 + 2 * FRAME_PAD, MIN_FRAME_W),
        h: Math.max(y2 - y1 + 2 * FRAME_PAD + LABEL_H, MIN_FRAME_H),
    };
}

function computeDirectoryBounds(
    frame: GroupFrame,
    byFrameId: Map<string, GroupFrame>,
    frameBounds: Map<string, { x: number; y: number; w: number; h: number }>,
): { x: number; y: number; w: number; h: number } {
    const cached = frameBounds.get(frame.id);
    if (cached) { return cached; }

    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const childId of frame.childFrameIds) {
        const child = byFrameId.get(childId);
        if (!child) { continue; }
        const b = child.isFile
            ? frameBounds.get(child.id)
            : computeDirectoryBounds(child, byFrameId, frameBounds);
        if (!b) { continue; }
        x1 = Math.min(x1, b.x);
        y1 = Math.min(y1, b.y);
        x2 = Math.max(x2, b.x + b.w);
        y2 = Math.max(y2, b.y + b.h);
    }

    const bounds = x1 === Infinity
        ? { x: 0, y: 0, w: MIN_FRAME_W, h: MIN_FRAME_H }
        : {
            x: x1 - FRAME_PAD,
            y: y1 - FRAME_PAD - LABEL_H,
            w: Math.max(x2 - x1 + 2 * FRAME_PAD, MIN_FRAME_W),
            h: Math.max(y2 - y1 + 2 * FRAME_PAD + LABEL_H, MIN_FRAME_H),
        };
    frameBounds.set(frame.id, bounds);
    return bounds;
}

// ── Inter-frame force layout ──────────────────────────────────────────────────

function layoutFrames(
    frames: GroupFrame[],
    graph: GroupedLayoutGraph,
    localPositions: Map<string, Map<string, Pos>>,
    nodeWidths: Map<string, number>,
): { positions: Map<string, Pos>; frameCenters: Map<string, Pos> } {
    const fileFrames = frames.filter(f => f.isFile && f.nodeIds.length > 0);
    const positions  = new Map<string, Pos>();
    const frameCenters = new Map<string, Pos>();

    if (fileFrames.length === 0) { return { positions, frameCenters }; }
    if (fileFrames.length === 1) {
        const f   = fileFrames[0];
        const loc = localPositions.get(f.id) ?? new Map();
        for (const [id, p] of loc) { positions.set(id, p); }
        frameCenters.set(f.id, { x: 0, y: 0 });
        return { positions, frameCenters };
    }

    interface FFNode extends d3.SimulationNodeDatum { _id: string; w: number; h: number; }
    const simNodes: FFNode[] = fileFrames.map(f => {
        const loc = localPositions.get(f.id) ?? new Map();
        const { w, h } = localFrameSize(f.nodeIds, loc, nodeWidths);
        return { _id: f.id, w, h };
    });

    const byIdx = new Map(simNodes.map((n, i) => [n._id, i]));
    const nodeToFrame = new Map<string, string>();
    for (const f of fileFrames) { for (const id of f.nodeIds) { nodeToFrame.set(id, f.id); } }

    const edgeKeySet = new Set<string>();
    const frameLinks: { source: number; target: number }[] = [];
    for (const e of graph.edges) {
        const sf = nodeToFrame.get(e.sourceId);
        const tf = nodeToFrame.get(e.targetId);
        if (!sf || !tf || sf === tf) { continue; }
        const key = `${sf}->${tf}`;
        if (edgeKeySet.has(key)) { continue; }
        edgeKeySet.add(key);
        frameLinks.push({ source: byIdx.get(sf)!, target: byIdx.get(tf)! });
    }

    d3.forceSimulation(simNodes)
        .force('link',    d3.forceLink(frameLinks).distance(200).strength(0.2))
        .force('charge',  d3.forceManyBody().strength(-1000))
        .force('center',  d3.forceCenter(0, 0))
        .force('collide', d3.forceCollide<FFNode>().radius(n => Math.max(n.w, n.h) / 2 + 40))
        .stop()
        .tick(300);

    for (const sn of simNodes) {
        const f   = fileFrames.find(ff => ff.id === sn._id)!;
        const loc = localPositions.get(f.id) ?? new Map();
        const cx  = sn.x ?? 0;
        const cy  = sn.y ?? 0;
        frameCenters.set(f.id, { x: cx, y: cy });
        for (const [id, p] of loc) { positions.set(id, { x: cx + p.x, y: cy + p.y }); }
    }
    return { positions, frameCenters };
}

// ── Frame separation ──────────────────────────────────────────────────────────

const FRAME_GAP         = 16; // minimum gap between sibling frames (isolated)
const FRAME_CLUSTER_GAP = 40; // gap between frames in the same connected cluster

/** Recursively shift a frame and its entire subtree (bounds + node positions). */
function moveSubtree(
    frameId: string,
    dx: number,
    dy: number,
    frameBoundsMap: Map<string, { x: number; y: number; w: number; h: number }>,
    positions: Map<string, Pos>,
    byFrameId: Map<string, GroupFrame>,
): void {
    const b = frameBoundsMap.get(frameId);
    if (b) { b.x += dx; b.y += dy; }
    const f = byFrameId.get(frameId);
    if (!f) { return; }
    for (const nodeId of f.nodeIds) {
        const p = positions.get(nodeId);
        if (p) { p.x += dx; p.y += dy; }
    }
    for (const childId of f.childFrameIds) {
        moveSubtree(childId, dx, dy, frameBoundsMap, positions, byFrameId);
    }
}

/** Recompute a dir frame's bounds as the bounding box of its children's current bounds. */
function recomputeDirBounds(
    frameId: string,
    frameBoundsMap: Map<string, { x: number; y: number; w: number; h: number }>,
    byFrameId: Map<string, GroupFrame>,
): void {
    const f = byFrameId.get(frameId);
    if (!f || f.isFile) { return; }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const childId of f.childFrameIds) {
        const b = frameBoundsMap.get(childId);
        if (!b) { continue; }
        x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
        x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
    }
    if (x1 === Infinity) { return; }
    frameBoundsMap.set(frameId, {
        x: x1 - FRAME_PAD,
        y: y1 - FRAME_PAD - LABEL_H,
        w: Math.max(x2 - x1 + 2 * FRAME_PAD, MIN_FRAME_W),
        h: Math.max(y2 - y1 + 2 * FRAME_PAD + LABEL_H, MIN_FRAME_H),
    });
}

/**
 * Push overlapping siblings apart along the axis of minimum overlap.
 * Each moved frame carries its entire subtree via moveSubtree.
 */
function separateSiblings(
    siblingIds: string[],
    frameBoundsMap: Map<string, { x: number; y: number; w: number; h: number }>,
    positions: Map<string, Pos>,
    byFrameId: Map<string, GroupFrame>,
    gap: number,
): void {
    for (let pass = 0; pass < 30; pass++) {
        let anyOverlap = false;
        for (let i = 0; i < siblingIds.length - 1; i++) {
            for (let j = i + 1; j < siblingIds.length; j++) {
                const a = frameBoundsMap.get(siblingIds[i]);
                const b = frameBoundsMap.get(siblingIds[j]);
                if (!a || !b) { continue; }
                const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
                const bx = b.x + b.w / 2, by = b.y + b.h / 2;
                const ox = (a.w + b.w) / 2 + gap - Math.abs(bx - ax);
                const oy = (a.h + b.h) / 2 + gap - Math.abs(by - ay);
                if (ox <= 0 || oy <= 0) { continue; }
                anyOverlap = true;
                if (ox <= oy) {
                    const half = ox / 2, sign = bx >= ax ? 1 : -1;
                    moveSubtree(siblingIds[i], -half * sign, 0, frameBoundsMap, positions, byFrameId);
                    moveSubtree(siblingIds[j],  half * sign, 0, frameBoundsMap, positions, byFrameId);
                } else {
                    const half = oy / 2, sign = by >= ay ? 1 : -1;
                    moveSubtree(siblingIds[i], 0, -half * sign, frameBoundsMap, positions, byFrameId);
                    moveSubtree(siblingIds[j], 0,  half * sign, frameBoundsMap, positions, byFrameId);
                }
            }
        }
        if (!anyOverlap) { break; }
    }
}

/**
 * Pack sibling frames using connectivity-aware compact layout (mirrors layoutGroup).
 * Frames with cross-frame edges form clusters (FRAME_CLUSTER_GAP); isolated frames
 * go into a square-ish grid (FRAME_GAP). All blocks are shelf-packed.
 * The result is translated so its centroid matches the pre-pack centroid.
 */
function layoutSiblings(
    siblingIds: string[],
    frameBoundsMap: Map<string, { x: number; y: number; w: number; h: number }>,
    positions: Map<string, Pos>,
    byFrameId: Map<string, GroupFrame>,
    graph: GroupedLayoutGraph,
): void {
    const entries = siblingIds
        .map(id => ({ id, b: frameBoundsMap.get(id) }))
        .filter((e): e is { id: string; b: { x: number; y: number; w: number; h: number } } => !!e.b);
    if (entries.length < 2) { return; }

    const cx = entries.reduce((s, e) => s + e.b.x + e.b.w / 2, 0) / entries.length;
    const cy = entries.reduce((s, e) => s + e.b.y + e.b.h / 2, 0) / entries.length;

    // Map every node to its top-level sibling frame for O(1) edge look-up.
    const nodeToSibling = new Map<string, string>();
    const collectNodes = (fid: string, siblingId: string): void => {
        const f = byFrameId.get(fid);
        if (!f) { return; }
        for (const nid of f.nodeIds) { nodeToSibling.set(nid, siblingId); }
        for (const cid of f.childFrameIds) { collectNodes(cid, siblingId); }
    };
    for (const { id } of entries) { collectNodes(id, id); }

    const edgeSet = new Set<string>();
    for (const e of graph.edges) {
        const sf = nodeToSibling.get(e.sourceId), tf = nodeToSibling.get(e.targetId);
        if (sf && tf && sf !== tf) { edgeSet.add(`${sf}\x00${tf}`); edgeSet.add(`${tf}\x00${sf}`); }
    }
    const hasEdge = (a: string, b: string) => edgeSet.has(`${a}\x00${b}`);

    const itemW = (id: string) => frameBoundsMap.get(id)?.w ?? 0;
    const itemH = (id: string) => frameBoundsMap.get(id)?.h ?? 0;
    const localPos = layoutGroup(entries.map(e => e.id), itemW, itemH, hasEdge, FRAME_GAP, FRAME_CLUSTER_GAP);

    let lx1 = Infinity, ly1 = Infinity, lx2 = -Infinity, ly2 = -Infinity;
    for (const [id, p] of localPos) {
        lx1 = Math.min(lx1, p.x); ly1 = Math.min(ly1, p.y);
        lx2 = Math.max(lx2, p.x + itemW(id)); ly2 = Math.max(ly2, p.y + itemH(id));
    }
    const lcx = (lx1 + lx2) / 2, lcy = (ly1 + ly2) / 2;

    for (const [id, p] of localPos) {
        const b = frameBoundsMap.get(id)!;
        moveSubtree(id, cx - lcx + p.x - b.x, cy - lcy + p.y - b.y, frameBoundsMap, positions, byFrameId);
    }
}

/**
 * Compact and separate all sibling groups in the frame tree, deepest first.
 * Each level is first packed tightly (treating each child as an atomic rect),
 * then the safety-net separation pass resolves any residual overlaps.
 * Parent bounds are refreshed before the next level is processed.
 */
function separateHierarchically(
    frames: GroupFrame[],
    frameBoundsMap: Map<string, { x: number; y: number; w: number; h: number }>,
    positions: Map<string, Pos>,
    byFrameId: Map<string, GroupFrame>,
    graph: GroupedLayoutGraph,
): void {
    const depthOf = new Map<string, number>();
    const getDepth = (id: string): number => {
        if (depthOf.has(id)) { return depthOf.get(id)!; }
        const f = byFrameId.get(id);
        const d = f?.parentId == null ? 0 : getDepth(f.parentId) + 1;
        depthOf.set(id, d);
        return d;
    };
    for (const f of frames) { getDepth(f.id); }

    const byParent = new Map<string | null, string[]>();
    for (const f of frames) {
        if (!byParent.has(f.parentId)) { byParent.set(f.parentId, []); }
        byParent.get(f.parentId)!.push(f.id);
    }

    const groups = [...byParent.entries()].sort((a, b) => {
        const da = a[0] == null ? 0 : getDepth(a[0]) + 1;
        const db = b[0] == null ? 0 : getDepth(b[0]) + 1;
        return db - da;
    });

    for (const [parentId, siblingIds] of groups) {
        if (siblingIds.length < 2) { continue; }
        layoutSiblings(siblingIds, frameBoundsMap, positions, byFrameId, graph);
        separateSiblings(siblingIds, frameBoundsMap, positions, byFrameId, FRAME_GAP);
        if (parentId != null) { recomputeDirBounds(parentId, frameBoundsMap, byFrameId); }
    }
}

// ── Public entry point ────────────────────────────────────────────────────────

export function computeGroupedLayout(
    graph: GroupedLayoutGraph,
    estimateNodeWidth: (label: string) => number = estimateDefaultNodeWidth,
): GroupedLayout {
    const frames = buildFrameTree(graph);

    // Estimate rendered width for each node from its display label.
    const nodeWidths = new Map(graph.nodes.map(n => [n.id, Math.max(NODE_W, estimateNodeWidth(n.label ?? n.id))]));

    // Per-frame local layout (nodes centered at origin within their frame).
    const localPositions = new Map<string, Map<string, Pos>>();
    for (const f of frames) {
        if (f.isFile && f.nodeIds.length > 0) {
            localPositions.set(f.id, layoutFileFrame(f.nodeIds, graph.edges, nodeWidths));
        }
    }

    // Inter-frame layout → absolute positions.
    const { positions, frameCenters } = layoutFrames(frames, graph, localPositions, nodeWidths);

    // Absolute frame bounds (top-left corner + size).
    const frameBoundsMap = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const f of frames) {
        if (!f.isFile) { continue; }
        const center = frameCenters.get(f.id) ?? { x: 0, y: 0 };
        const loc    = localPositions.get(f.id) ?? new Map();
        const { w, h } = localFrameSize(f.nodeIds, loc, nodeWidths);
        frameBoundsMap.set(f.id, { x: center.x - w / 2, y: center.y - h / 2, w, h });
    }

    const byFrameId = new Map(frames.map(f => [f.id, f]));
    for (const f of frames) {
        if (!f.isFile) { computeDirectoryBounds(f, byFrameId, frameBoundsMap); }
    }

    // Separate all sibling groups bottom-up now that every frame has bounds.
    separateHierarchically(frames, frameBoundsMap, positions, byFrameId, graph);

    for (const f of frames) {
        f.bounds = frameBoundsMap.get(f.id) ?? { ...EMPTY_BOUNDS };
    }

    const maxFrameY = Math.max(0, ...[...frameBoundsMap.values()].map(b => b.y + b.h));

    // Nodes without a filePath land in a fallback row below all frames.
    const placed = new Set(positions.keys());
    graph.nodes.filter(n => !placed.has(n.id)).forEach((n, i) => {
        positions.set(n.id, { x: i * 130, y: maxFrameY + 120 });
    });

    return { positions, frames, frameBounds: frameBoundsMap };
}
