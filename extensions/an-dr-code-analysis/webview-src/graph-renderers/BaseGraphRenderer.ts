import { GraphRenderer } from './IGraphRenderer';
import { GraphEdge, GraphModel, LayoutName } from './types';
import { ForceLayout, resolveGraphLayout } from '../graph-layouts/layoutStrategies';
import { GroupFrame, GroupedLayout } from '../graph-layouts/groupedLayout';
import { Pos } from '../../shared/graph/positionEngine';

export interface Bounds { x: number; y: number; w: number; h: number }
export interface EdgeAnchor { id: string; x: number; y: number; w: number; h: number }
export interface EdgeRoute { source: EdgeAnchor; target: EdgeAnchor }

export interface GroupedRenderState {
    frameById: Map<string, GroupFrame>;
    nodeToFrameId: Map<string, string>;
    frameToNodeIds: Map<string, string[]>;
    visibleFrameIds: Set<string>;
    hiddenNodeIds: Set<string>;
    frameBounds: Map<string, Bounds>;
}

export interface FrameMoveResult {
    nodeIds: string[];
    frameIds: string[];
}

const COLLAPSED_FRAME_W = 120;
const COLLAPSED_FRAME_H = 28;
const NODE_H = 28;
const FRAME_PAD_X = 10;
const FRAME_PAD_Y = 8;
const FRAME_LABEL_H = 22;
const MIN_FRAME_W = 70;
const MIN_FRAME_H = 42;

/** Approximate pixel width of a node from its display label. */
export function estimateNodeWidth(label: string): number {
    return Math.min((label ?? '').length * 7 + 28, 160);
}

/**
 * Return the small top-left handle used to drag a grouped frame.
 * The handle follows the frame label and avoids the fold button area.
 */
export function computeFrameDragHandleBounds(label: string, frame: Bounds): Bounds {
    const leftPad = 6;
    const topPad = 3;
    const minW = 48;
    const reservedRight = 34;
    const maxW = Math.max(0, frame.w - leftPad - reservedRight);
    const preferredW = Math.max(minW, estimateNodeWidth(label) + 10);
    const usableMinW = Math.min(minW, maxW);
    return {
        x: frame.x + leftPad,
        y: frame.y + topPad,
        w: Math.max(usableMinW, Math.min(preferredW, maxW)),
        h: 18,
    };
}

/**
 * Clip a line endpoint to the rectangular boundary of the target node.
 * Returns the point on the rectangle perimeter where the line from (sx,sy)
 * toward (tx,ty) first enters the rectangle centred at (tx,ty).
 */
export function clipLineToRect(
    sx: number, sy: number,
    tx: number, ty: number,
    hw: number, hh: number,
): { x: number; y: number } {
    const dx = tx - sx, dy = ty - sy;
    if (dx === 0 && dy === 0) { return { x: tx, y: ty }; }
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx <= hw && ady <= hh) { return { x: tx, y: ty }; }
    if (adx === 0) { return { x: tx, y: ty - hh * Math.sign(dy) }; }
    return hw * ady <= hh * adx
        ? { x: tx - hw * Math.sign(dx), y: ty - dy * hw / adx }
        : { x: tx - dx * hh / ady,      y: ty - hh * Math.sign(dy) };
}

/**
 * Renderer-agnostic graph state and geometry.
 *
 * Concrete renderers own DOM/canvas bindings. This base owns layout resolution,
 * grouped-frame fold state, folded edge endpoints, and frame movement math.
 */
export abstract class BaseGraphRenderer implements GraphRenderer {
    protected _lastGraph: GraphModel | null = null;
    protected _selectedNodeId: string | null = null;
    protected _layoutName: LayoutName | null = null;
    protected _positions: Map<string, Pos> = new Map();
    protected _groupedLayout: GroupedLayout | null = null;
    protected _foldedFrames: Set<string> = new Set();
    protected _groupedRenderState: GroupedRenderState | null = null;

    public abstract update(graph: GraphModel): void;
    public abstract destroy(): void;
    public abstract selectNode(nodeId: string): void;
    public abstract selectNodesForFile(filePath: string): void;

    public applyLayout(name: LayoutName): void {
        this._layoutName = name;
        this._rerenderLastGraph();
    }

    protected abstract _rerenderLastGraph(): void;

    protected _resetBaseState(): void {
        this._lastGraph = null;
        this._selectedNodeId = null;
        this._layoutName = null;
        this._positions = new Map();
        this._groupedLayout = null;
        this._foldedFrames = new Set();
        this._groupedRenderState = null;
    }

    protected _resolvePositions(
        graph: GraphModel,
        hints: Map<string, Pos> | undefined,
        forceLayout: ForceLayout,
    ): Map<string, Pos> {
        const layout = resolveGraphLayout(graph, {
            requestedLayoutName: this._layoutName,
            expanded: false,
            hints,
            forceLayout,
            estimateNodeWidth,
        });
        this._groupedLayout = layout.groupedLayout;
        return layout.positions;
    }

    protected _buildGroupedRenderState(
        layout: GroupedLayout,
        dims: Map<string, { w: number; h: number }>,
    ): GroupedRenderState {
        const frameById = new Map(layout.frames.map(f => [f.id, f]));
        const nodeToFrameId = new Map<string, string>();
        for (const f of layout.frames) {
            for (const id of f.nodeIds) { nodeToFrameId.set(id, f.id); }
        }

        const collectNodes = (frameId: string): string[] => {
            const f = frameById.get(frameId);
            if (!f) { return []; }
            const ids = [...f.nodeIds];
            for (const childId of f.childFrameIds) { ids.push(...collectNodes(childId)); }
            return ids;
        };
        const frameToNodeIds = new Map(layout.frames.map(f => [f.id, collectNodes(f.id)]));

        const visibleFrameIds = new Set<string>();
        const frameBounds = new Map<string, Bounds>();
        for (const f of layout.frames) {
            if (this._hasFoldedAncestor(f.id, frameById)) { continue; }
            visibleFrameIds.add(f.id);
            const raw = layout.frameBounds.get(f.id) ?? f.bounds;
            frameBounds.set(f.id, this._foldedFrames.has(f.id) ? this._collapsedBounds(raw) : { ...raw });
        }

        const hiddenNodeIds = new Set<string>();
        for (const [nodeId, frameId] of nodeToFrameId) {
            if (this._foldedFrameForFrame(frameId, frameById) !== null) { hiddenNodeIds.add(nodeId); }
        }

        const state = { frameById, nodeToFrameId, frameToNodeIds, visibleFrameIds, hiddenNodeIds, frameBounds };
        this._refreshDynamicFrameBounds(dims, state);
        return state;
    }

    protected _toggleFrameFold(frameId: string): void {
        if (this._foldedFrames.has(frameId)) { this._foldedFrames.delete(frameId); }
        else { this._foldedFrames.add(frameId); }
    }

    protected _isFrameFolded(frameId: string): boolean {
        return this._foldedFrames.has(frameId);
    }

    protected _getNeighborIds(nodeId: string): Set<string> {
        const ids = new Set([nodeId]);
        if (!this._lastGraph) { return ids; }
        for (const e of this._lastGraph.edges) {
            if (e.sourceId === nodeId) { ids.add(e.targetId); }
            if (e.targetId === nodeId) { ids.add(e.sourceId); }
        }
        return ids;
    }

    protected _edgeRoute(
        edge: GraphEdge,
        dims: Map<string, { w: number; h: number }>,
        state: GroupedRenderState | null,
    ): EdgeRoute | null {
        const source = this._edgeAnchor(edge.sourceId, dims, state);
        const target = this._edgeAnchor(edge.targetId, dims, state);
        if (!source || !target || source.id === target.id) { return null; }
        return { source, target };
    }

    protected _moveFrameModel(frameId: string, dx: number, dy: number, state: GroupedRenderState): FrameMoveResult {
        const nodeIds = state.frameToNodeIds.get(frameId) ?? [];
        for (const nodeId of nodeIds) {
            const p = this._positions.get(nodeId);
            if (!p) { continue; }
            p.x += dx;
            p.y += dy;
        }

        const frameIds: string[] = [];
        for (const id of state.visibleFrameIds) {
            if (!this._frameWithin(id, frameId, state.frameById)) { continue; }
            const b = state.frameBounds.get(id);
            if (!b) { continue; }
            b.x += dx;
            b.y += dy;
            frameIds.push(id);
        }
        return { nodeIds, frameIds };
    }

    protected _refreshDynamicFrameBounds(
        dims: Map<string, { w: number; h: number }>,
        state: GroupedRenderState,
    ): string[] {
        const changed = new Set<string>();
        const visiting = new Set<string>();

        const fitFrame = (frameId: string): Bounds | null => {
            if (!state.visibleFrameIds.has(frameId)) { return null; }
            const frame = state.frameById.get(frameId);
            if (!frame) { return null; }
            if (this._foldedFrames.has(frameId)) { return state.frameBounds.get(frameId) ?? null; }
            if (visiting.has(frameId)) { return state.frameBounds.get(frameId) ?? null; }

            visiting.add(frameId);
            let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
            const include = (b: Bounds): void => {
                x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
                x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
            };

            for (const nodeId of frame.nodeIds) {
                if (state.hiddenNodeIds.has(nodeId)) { continue; }
                const p = this._positions.get(nodeId);
                if (!p) { continue; }
                const d = dims.get(nodeId) ?? { w: 100, h: NODE_H };
                include({ x: p.x - d.w / 2, y: p.y - d.h / 2, w: d.w, h: d.h });
            }
            for (const childId of frame.childFrameIds) {
                const childBounds = fitFrame(childId);
                if (childBounds) { include(childBounds); }
            }

            const fallback = state.frameBounds.get(frameId) ?? frame.bounds;
            const next = x1 === Infinity
                ? { ...fallback }
                : {
                    x: x1 - FRAME_PAD_X,
                    y: y1 - FRAME_LABEL_H - FRAME_PAD_Y,
                    w: Math.max(x2 - x1 + 2 * FRAME_PAD_X, MIN_FRAME_W),
                    h: Math.max(y2 - y1 + FRAME_LABEL_H + 2 * FRAME_PAD_Y, MIN_FRAME_H),
                };
            visiting.delete(frameId);

            const prev = state.frameBounds.get(frameId);
            state.frameBounds.set(frameId, next);
            if (!prev || prev.x !== next.x || prev.y !== next.y || prev.w !== next.w || prev.h !== next.h) {
                changed.add(frameId);
            }
            return next;
        };

        for (const id of state.visibleFrameIds) { fitFrame(id); }
        return [...changed];
    }

    protected _fitBounds(
        positions: Map<string, Pos>,
        dims: Map<string, { w: number; h: number }>,
        frameBounds?: Map<string, Bounds>,
        hiddenNodeIds?: Set<string>,
    ): Bounds | null {
        let x1 = Infinity, x2 = -Infinity, y1 = Infinity, y2 = -Infinity;
        for (const [id, p] of positions) {
            if (hiddenNodeIds?.has(id)) { continue; }
            const d = dims.get(id) ?? { w: 100, h: NODE_H };
            x1 = Math.min(x1, p.x - d.w / 2); x2 = Math.max(x2, p.x + d.w / 2);
            y1 = Math.min(y1, p.y - d.h / 2); y2 = Math.max(y2, p.y + d.h / 2);
        }
        for (const b of frameBounds?.values() ?? []) {
            x1 = Math.min(x1, b.x); x2 = Math.max(x2, b.x + b.w);
            y1 = Math.min(y1, b.y); y2 = Math.max(y2, b.y + b.h);
        }
        return x1 === Infinity ? null : { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }

    private _collapsedBounds(bounds: Bounds): Bounds {
        return {
            x: bounds.x + bounds.w / 2 - COLLAPSED_FRAME_W / 2,
            y: bounds.y + bounds.h / 2 - COLLAPSED_FRAME_H / 2,
            w: COLLAPSED_FRAME_W,
            h: COLLAPSED_FRAME_H,
        };
    }

    private _hasFoldedAncestor(frameId: string, frameById: Map<string, GroupFrame>): boolean {
        let parentId = frameById.get(frameId)?.parentId ?? null;
        while (parentId !== null) {
            if (this._foldedFrames.has(parentId)) { return true; }
            parentId = frameById.get(parentId)?.parentId ?? null;
        }
        return false;
    }

    private _foldedFrameForFrame(frameId: string, frameById: Map<string, GroupFrame>): string | null {
        let cur: string | null = frameId;
        while (cur !== null) {
            if (this._foldedFrames.has(cur)) { return cur; }
            cur = frameById.get(cur)?.parentId ?? null;
        }
        return null;
    }

    private _frameWithin(frameId: string, ancestorId: string, frameById: Map<string, GroupFrame>): boolean {
        let cur: string | null = frameId;
        while (cur !== null) {
            if (cur === ancestorId) { return true; }
            cur = frameById.get(cur)?.parentId ?? null;
        }
        return false;
    }

    private _edgeAnchor(
        nodeId: string,
        dims: Map<string, { w: number; h: number }>,
        state: GroupedRenderState | null,
    ): EdgeAnchor | null {
        if (state) {
            const frameId = state.nodeToFrameId.get(nodeId);
            const foldedFrameId = frameId ? this._foldedFrameForFrame(frameId, state.frameById) : null;
            if (foldedFrameId !== null) {
                const b = state.frameBounds.get(foldedFrameId);
                return b ? { id: 'frame:' + foldedFrameId, x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h } : null;
            }
            if (state.hiddenNodeIds.has(nodeId)) { return null; }
        }
        const p = this._positions.get(nodeId);
        if (!p) { return null; }
        const d = dims.get(nodeId) ?? { w: 100, h: NODE_H };
        return { id: 'node:' + nodeId, x: p.x, y: p.y, w: d.w, h: d.h };
    }
}
