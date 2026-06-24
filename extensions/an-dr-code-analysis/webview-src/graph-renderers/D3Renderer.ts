import * as d3 from 'd3';
import { GraphModel, GraphNode, NodeEventCallback } from './types';
import { GraphRenderer } from './IGraphRenderer';
import { computeLevels, Pos } from '../../src/graph/positionEngine';
import {
    BaseGraphRenderer,
    Bounds,
    clipLineToRect,
    computeFrameDragHandleBounds,
    estimateNodeWidth,
    GroupedRenderState,
} from './BaseGraphRenderer';
import { GraphLayoutInput } from '../graph-layouts/layoutStrategies';
import { GroupFrame } from '../graph-layouts/groupedLayout';
import { getLevelColors } from './d3Colors';

const COLOR_EDGE_DEFAULT      = 'var(--vscode-panel-border,#666)';
const COLOR_EDGE_INCOMING     = '#2FB8A0';  // teal  — incoming to selected node
const COLOR_EDGE_OUTGOING     = '#F97316';  // coral — outgoing from selected node
const COLOR_EDGE_BIDIRECTIONAL = '#ef5350'; // red   — bidirectional edge
const COLOR_NODE_SELECTED     = '#4A9EDB';  // blue  — selected node outline
const NODE_H   = 28;
const NODE_RX  = 5;

// ─────────────────────────────────────────────────────────────────────────────

// D3-specific drawing/event binding stays here; renderer-agnostic layout,
// folded-frame state, and edge routing live in BaseGraphRenderer.
export class D3Renderer extends BaseGraphRenderer {
    private _container:      HTMLElement;
    private _tooltip:        HTMLElement;
    private _jumpBtn:        HTMLElement;
    private _onNodeClick:    NodeEventCallback;
    private _onNodeDblClick: NodeEventCallback;
    private _svg:  d3.Selection<SVGSVGElement, unknown, any, any> | null = null;
    private _zoom: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null;
    private _edgeEls:      Map<string, d3.Selection<SVGLineElement, unknown, any, any>> = new Map();
    private _nodeEls:      Map<string, d3.Selection<SVGGElement,    unknown, any, any>> = new Map();
    private _frameEls:     Map<string, d3.Selection<SVGGElement,    unknown, any, any>> = new Map();
    private _externalEdges: Set<string> = new Set();
    /** Original stroke color+width per node, for restoring after focus clear. */
    private _nodeBorderColors: Map<string, { stroke: string; strokeWidth: string }> = new Map();
    /** Original stroke+marker per edge, for restoring after focus clear. */
    private _edgeOrigColors: Map<string, { stroke: string; markerEnd: string }> = new Map();

    constructor(
        container: HTMLElement, tooltip: HTMLElement,
        onNodeClick: NodeEventCallback, onNodeDblClick: NodeEventCallback,
    ) {
        super();
        this._container      = container;
        this._tooltip        = tooltip;
        this._onNodeClick    = onNodeClick;
        this._onNodeDblClick = onNodeDblClick;
        this._jumpBtn        = this._createJumpBtn();
    }

    private _createJumpBtn(): HTMLElement {
        const btn = document.createElement('button');
        btn.textContent = '↗ Go to file';
        btn.style.cssText = [
            'position:absolute', 'display:none', 'bottom:6px', 'right:6px', 'z-index:10',
            'background:var(--vscode-button-background,#0e639c)', 'color:var(--vscode-button-foreground,#fff)',
            'border:none', 'border-radius:3px', 'padding:3px 10px', 'font-size:0.82em', 'cursor:pointer', 'opacity:0.92',
        ].join(';');
        btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
        btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.92'; });
        this._container.style.position = 'relative';
        this._container.appendChild(btn);
        return btn;
    }

    // ── Public API (GraphRenderer) ────────────────────────────────────────────

    update(graph: GraphModel): void {
        // Reuse drag-adjusted positions when the target node hasn't changed.
        const hints = this._lastGraph?.targetId === graph.targetId ? this._positions : undefined;
        this._lastGraph = graph;
        this._initFresh(graph, hints);
    }

    destroy(): void {
        this._svg?.remove();
        this._svg = null;
        this._zoom = null;
        this._resetBaseState();
        this._edgeEls          = new Map();
        this._nodeEls          = new Map();
        this._frameEls         = new Map();
        this._externalEdges    = new Set();
        this._nodeBorderColors = new Map();
        this._edgeOrigColors   = new Map();
        this._tooltip.style.display = 'none';
        this._jumpBtn.style.display = 'none';
        this._jumpBtn.onclick = null;
    }

    protected _rerenderLastGraph(): void {
        if (this._lastGraph) { this._initFresh(this._lastGraph); }
    }

    selectNode(nodeId: string): void {
        if (!nodeId || !this._nodeEls.has(nodeId)) { this._clearFocus(); return; }
        this._applyFocus(this._getNeighborIds(nodeId), nodeId);
    }

    selectNodesForFile(filePath: string): void {
        if (!filePath || !this._lastGraph) { this._clearFocus(); return; }
        const ids = new Set(
            this._lastGraph.nodes.filter(n => n.filePath === filePath).map(n => n.id)
        );
        ids.size > 0 ? this._applyFocus(ids) : this._clearFocus();
    }

    // ── Layout ────────────────────────────────────────────────────────────────

    private _forceLayout(graph: GraphLayoutInput, hints?: Map<string, Pos>): Map<string, Pos> {
        interface FNode extends d3.SimulationNodeDatum { _id: string; }
        const nodes: FNode[] = graph.nodes.map(n => {
            const h = hints?.get(n.id);
            return h ? { _id: n.id, x: h.x, y: h.y } : { _id: n.id };
        });
        const byIdx = new Map(nodes.map((n, i) => [n._id, i]));
        const links = graph.edges
            .filter(e => byIdx.has(e.sourceId) && byIdx.has(e.targetId))
            .map(e => ({ source: byIdx.get(e.sourceId)!, target: byIdx.get(e.targetId)! }));
        d3.forceSimulation(nodes)
            .force('link',    d3.forceLink(links).distance(140).strength(0.6))
            .force('charge',  d3.forceManyBody().strength(-400))
            .force('center',  d3.forceCenter(0, 0))
            .force('collide', d3.forceCollide(70))
            .stop()
            .tick(300);
        return new Map(nodes.map(n => [n._id, { x: n.x ?? 0, y: n.y ?? 0 }]));
    }

    // ── Render ────────────────────────────────────────────────────────────────

    private _initFresh(graph: GraphModel, hints?: Map<string, Pos>, preserveTransform?: d3.ZoomTransform): void {
        this._svg?.remove();
        this._container.appendChild(this._jumpBtn);
        this._selectedNodeId   = null;
        this._nodeBorderColors = new Map();
        this._edgeOrigColors   = new Map();
        this._jumpBtn.style.display = 'none';
        this._jumpBtn.onclick = null;

        const svg = d3.select(this._container).append<SVGSVGElement>('svg')
            .attr('width', '100%').attr('height', '100%').style('overflow', 'hidden');
        this._svg = svg;
        svg.on('dblclick.zoom', null);  // prevent default double-click zoom

        const defs = svg.append('defs');
        this._addMarker(defs, 'arr',     COLOR_EDGE_DEFAULT,     'auto');
        this._addMarker(defs, 'arr-bwd', COLOR_EDGE_BIDIRECTIONAL,    'auto-start-reverse');
        this._addMarker(defs, 'arr-in',  COLOR_EDGE_INCOMING,  'auto');
        this._addMarker(defs, 'arr-out', COLOR_EDGE_OUTGOING, 'auto');

        const root = svg.append('g').attr('class', 'zoom-root');
        const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.05, 8])
            .on('zoom', (ev: any) => { root.attr('transform', ev.transform.toString()); this._hideTooltip(); });
        svg.call(zoom);
        this._zoom = zoom;

        const pos  = this._resolvePositions(graph, hints, (g, h) => this._forceLayout(g, h));
        const lvls = computeLevels(graph);
        this._positions     = new Map(pos);
        this._edgeEls       = new Map();
        this._nodeEls       = new Map();
        this._frameEls      = new Map();
        this._externalEdges = new Set();

        const dims = new Map<string, { w: number; h: number }>();
        for (const n of graph.nodes) { dims.set(n.id, { w: estimateNodeWidth(n.label), h: n.id === graph.targetId ? 34 : NODE_H }); }
        this._groupedRenderState = this._groupedLayout ? this._buildGroupedRenderState(this._groupedLayout, dims) : null;

        if (this._groupedRenderState) { this._drawGroupFrames(root, graph, dims, this._groupedRenderState, svg.node()!); }

        // ── Edges ──────────────────────────────────────────────────────────────
        const eg = root.append('g').attr('class', 'edges');
        for (const e of graph.edges) {
            const route = this._edgeRoute(e, dims, this._groupedRenderState);
            if (!route) { continue; }
            const ep  = clipLineToRect(route.source.x, route.source.y, route.target.x, route.target.y, route.target.w / 2, route.target.h / 2);
            const sp2 = clipLineToRect(route.target.x, route.target.y, route.source.x, route.source.y, route.source.w / 2, route.source.h / 2);
            const col = e.isBidirectional ? COLOR_EDGE_BIDIRECTIONAL : COLOR_EDGE_DEFAULT;
            const ln  = eg.append('line')
                .attr('x1', sp2.x).attr('y1', sp2.y).attr('x2', ep.x).attr('y2', ep.y)
                .attr('stroke', col).attr('stroke-width', e.isBidirectional ? 2.5 : 1.5)
                .attr('marker-end', 'url(#arr)');
            if (e.isExternal)      { ln.attr('stroke-dasharray', '6 3').attr('opacity', '0.6'); this._externalEdges.add(`${e.sourceId}:${e.targetId}`); }
            if (e.isBidirectional) { ln.attr('marker-start', 'url(#arr-bwd)'); }
            const edgeKey = `${e.sourceId}:${e.targetId}`;
            this._edgeEls.set(edgeKey, ln as d3.Selection<SVGLineElement, unknown, any, any>);
            this._edgeOrigColors.set(edgeKey, { stroke: col, markerEnd: 'url(#arr)' });
        }

        // ── Nodes ──────────────────────────────────────────────────────────────
        const ng      = root.append('g').attr('class', 'nodes');
        const svgNode = svg.node()!;
        for (const n of graph.nodes) {
            if (this._groupedRenderState?.hiddenNodeIds.has(n.id)) { continue; }
            const p  = pos.get(n.id) ?? { x: 0, y: 0 };
            const lv = lvls.get(n.id) ?? 99;
            const dm = dims.get(n.id)!;
            const cl = getLevelColors(lv, n.role);
            const isTgt = n.id === graph.targetId;

            const g = ng.append('g')
                .attr('class', 'node').attr('data-id', n.id)
                .attr('transform', `translate(${p.x},${p.y})`).style('cursor', 'grab');

            const strokeW = isTgt ? '3' : '1.5';
            g.append('rect')
                .attr('x', -dm.w / 2).attr('y', -dm.h / 2)
                .attr('width', dm.w).attr('height', dm.h)
                .attr('rx', NODE_RX).attr('ry', NODE_RX)
                .attr('fill', cl.bg).attr('stroke', cl.border).attr('stroke-width', strokeW)
                .attr('opacity', n.role === 'external' ? 0.65 : 1);

            g.append('text')
                .attr('text-anchor', 'middle').attr('dominant-baseline', 'middle')
                .attr('fill', cl.label).attr('font-size', isTgt ? '15px' : '13px')
                .attr('font-weight', isTgt ? 'bold' : 'normal')
                .attr('font-style', n.role === 'folder' ? 'italic' : 'normal')
                .attr('pointer-events', 'none').text(n.label);

            this._nodeEls.set(n.id, g as d3.Selection<SVGGElement, unknown, any, any>);
            this._nodeBorderColors.set(n.id, { stroke: cl.border, strokeWidth: strokeW });
            this._bindNode(g, n);

            const drag = d3.drag<SVGGElement, unknown>()
                .clickDistance(4)  // allow up to 4px movement before suppressing click
                .on('start', () => { this._hideTooltip(); g.style('cursor', 'grabbing'); })
                .on('drag',  (ev: d3.D3DragEvent<SVGGElement, unknown, unknown>) => {
                    const k = d3.zoomTransform(svgNode).k;
                    const p2 = this._positions.get(n.id)!;
                    p2.x += ev.dx / k;  p2.y += ev.dy / k;
                    g.attr('transform', `translate(${p2.x},${p2.y})`);
                    this._refreshFrameElements(dims, this._groupedRenderState);
                    this._updateAllEdges(graph.edges, dims, this._groupedRenderState);
                })
                .on('end', () => { g.style('cursor', 'grab'); });
            g.call(drag);
        }

        if (preserveTransform) {
            this._zoom.transform(this._svg, preserveTransform);
        } else {
            this._fitView(pos, dims, this._groupedRenderState?.frameBounds, this._groupedRenderState?.hiddenNodeIds);
        }
    }

    private _drawGroupFrames(
        root: d3.Selection<SVGGElement, unknown, any, any>,
        graph: GraphModel,
        dims: Map<string, { w: number; h: number }>,
        state: GroupedRenderState,
        svgNode: SVGSVGElement,
    ): void {
        const fg = root.append('g').attr('class', 'group-frames');
        for (const frame of this._groupedLayout?.frames ?? []) {
            if (!state.visibleFrameIds.has(frame.id)) { continue; }
            const b = state.frameBounds.get(frame.id);
            if (!b) { continue; }
            const g = fg.append('g')
                .attr('class', frame.isFile ? 'group-frame file-frame' : 'group-frame dir-frame')
                .attr('data-frame-id', frame.id);
            g.append('rect')
                .attr('x', b.x).attr('y', b.y)
                .attr('width', b.w).attr('height', b.h)
                .attr('rx', frame.isFile ? 6 : 8).attr('ry', frame.isFile ? 6 : 8)
                .attr('fill', frame.isFile ? 'var(--vscode-editor-background,#1e1e1e)' : 'var(--vscode-sideBar-background,#252526)')
                .attr('stroke', frame.isFile ? 'var(--vscode-panel-border,#555)' : 'var(--vscode-focusBorder,#4A9EDB)')
                .attr('stroke-width', frame.isFile ? 1 : 1.5)
                .attr('stroke-dasharray', frame.isFile ? null : '6 4')
                .attr('opacity', frame.isFile ? 0.72 : 0.38);
            this._drawFrameHandle(g, frame, b, graph.edges, dims, state, svgNode);
            this._drawFrameToggle(g, frame, b);
            this._frameEls.set(frame.id, g as d3.Selection<SVGGElement, unknown, any, any>);
        }
    }

    private _drawFrameHandle(
        g: d3.Selection<SVGGElement, unknown, any, any>,
        frame: GroupFrame,
        b: Bounds,
        edges: GraphModel['edges'],
        dims: Map<string, { w: number; h: number }>,
        state: GroupedRenderState,
        svgNode: SVGSVGElement,
    ): void {
        const hb = computeFrameDragHandleBounds(frame.label, b);
        const handle = g.append('g')
            .attr('class', 'frame-drag-handle')
            .attr('transform', `translate(${hb.x},${hb.y})`)
            .style('cursor', 'grab');
        handle.append('rect')
            .attr('width', hb.w).attr('height', hb.h)
            .attr('rx', 4).attr('ry', 4)
            .attr('fill', 'transparent')
            .attr('pointer-events', 'all');
        if (frame.fullLabel) { handle.append('title').text(frame.fullLabel); }
        handle.append('text')
            .attr('class', 'frame-label')
            .attr('x', 4).attr('y', 12)
            .attr('fill', 'var(--vscode-descriptionForeground,#aaa)')
            .attr('font-size', frame.isFile ? '11px' : '12px')
            .attr('font-weight', frame.isFile ? 'normal' : 'bold')
            .attr('pointer-events', 'none')
            .text(frame.label);

        const drag = d3.drag<SVGGElement, unknown>()
            .clickDistance(4)
            .on('start', (ev: d3.D3DragEvent<SVGGElement, unknown, unknown>) => {
                ev.sourceEvent?.stopPropagation();
                this._hideTooltip();
                handle.style('cursor', 'grabbing');
            })
            .on('drag', (ev: d3.D3DragEvent<SVGGElement, unknown, unknown>) => {
                ev.sourceEvent?.stopPropagation();
                const k = d3.zoomTransform(svgNode).k;
                this._dragFrame(frame.id, ev.dx / k, ev.dy / k, edges, dims, state);
            })
            .on('end', (ev: d3.D3DragEvent<SVGGElement, unknown, unknown>) => {
                ev.sourceEvent?.stopPropagation();
                handle.style('cursor', 'grab');
            });
        handle.call(drag);
    }

    private _drawFrameToggle(g: d3.Selection<SVGGElement, unknown, any, any>, frame: GroupFrame, b: Bounds): void {
        const folded = this._isFrameFolded(frame.id);
        const btn = g.append('g')
            .attr('class', 'frame-toggle')
            .attr('transform', `translate(${b.x + b.w - 20},${b.y + 4})`)
            .style('cursor', 'pointer');
        btn.append('rect')
            .attr('width', 16).attr('height', 16).attr('rx', 3).attr('ry', 3)
            .attr('fill', 'var(--vscode-button-secondaryBackground,#3a3d41)')
            .attr('stroke', 'var(--vscode-panel-border,#666)');
        btn.append('text')
            .attr('x', 8).attr('y', 11)
            .attr('text-anchor', 'middle')
            .attr('fill', 'var(--vscode-button-secondaryForeground,#fff)')
            .attr('font-size', '12px')
            .attr('pointer-events', 'none')
            .text(folded ? '+' : '-');
        btn.on('mousedown', (ev: MouseEvent) => ev.stopPropagation());
        btn.on('click', (ev: MouseEvent) => {
            ev.stopPropagation();
            const savedTransform = this._svg?.node() ? d3.zoomTransform(this._svg.node()!) : undefined;
            this._toggleFrameFold(frame.id);
            if (this._lastGraph) { this._initFresh(this._lastGraph, undefined, savedTransform); }
        });
    }

    private _applyFocus(focusIds: Set<string>, selectedId?: string): void {
        for (const [id, g] of this._nodeEls) {
            g.attr('opacity', focusIds.has(id) ? '1' : '0.15');
            if (id === selectedId) {
                g.select('rect').attr('stroke', COLOR_NODE_SELECTED).attr('stroke-width', '3');
            } else {
                const orig = this._nodeBorderColors.get(id);
                if (orig) { g.select('rect').attr('stroke', orig.stroke).attr('stroke-width', orig.strokeWidth); }
            }
        }
        // Iterate over graph edges directly — avoids parsing keys that contain colons
        // (node IDs include Windows drive letters and line numbers, both containing ':').
        for (const e of this._lastGraph?.edges ?? []) {
            const key = `${e.sourceId}:${e.targetId}`;
            const ln = this._edgeEls.get(key);
            if (!ln) { continue; }
            const active = focusIds.has(e.sourceId) || focusIds.has(e.targetId);
            const baseOpacity = this._externalEdges.has(key) ? '0.6' : '1';
            ln.attr('opacity', active ? baseOpacity : '0.06');
            if (selectedId) {
                if (e.targetId === selectedId) {
                    ln.attr('stroke', COLOR_EDGE_INCOMING).attr('marker-end', 'url(#arr-in)');
                } else if (e.sourceId === selectedId) {
                    ln.attr('stroke', COLOR_EDGE_OUTGOING).attr('marker-end', 'url(#arr-out)');
                } else {
                    const orig = this._edgeOrigColors.get(key);
                    if (orig) { ln.attr('stroke', orig.stroke).attr('marker-end', orig.markerEnd); }
                }
            }
        }
    }

    private _clearFocus(): void {
        for (const [id, g] of this._nodeEls) {
            g.attr('opacity', '1');
            const orig = this._nodeBorderColors.get(id);
            if (orig) { g.select('rect').attr('stroke', orig.stroke).attr('stroke-width', orig.strokeWidth); }
        }
        for (const [key, ln] of this._edgeEls) {
            ln.attr('opacity', this._externalEdges.has(key) ? '0.6' : null);
            const orig = this._edgeOrigColors.get(key);
            if (orig) { ln.attr('stroke', orig.stroke).attr('marker-end', orig.markerEnd); }
        }
    }

    private _updateAllEdges(
        edges: GraphModel['edges'],
        dims:  Map<string, { w: number; h: number }>,
        state: GroupedRenderState | null,
    ): void {
        for (const e of edges) {
            const ln = this._edgeEls.get(`${e.sourceId}:${e.targetId}`);
            if (!ln) { continue; }
            const route = this._edgeRoute(e, dims, state);
            if (!route) { continue; }
            const ep  = clipLineToRect(route.source.x, route.source.y, route.target.x, route.target.y, route.target.w / 2, route.target.h / 2);
            const sp2 = clipLineToRect(route.target.x, route.target.y, route.source.x, route.source.y, route.source.w / 2, route.source.h / 2);
            ln.attr('x1', sp2.x).attr('y1', sp2.y).attr('x2', ep.x).attr('y2', ep.y);
        }
    }

    private _dragFrame(
        frameId: string,
        dx: number,
        dy: number,
        edges: GraphModel['edges'],
        dims: Map<string, { w: number; h: number }>,
        state: GroupedRenderState,
    ): void {
        const moved = this._moveFrameModel(frameId, dx, dy, state);
        for (const nodeId of moved.nodeIds) {
            const p = this._positions.get(nodeId);
            if (!p) { continue; }
            this._nodeEls.get(nodeId)?.attr('transform', `translate(${p.x},${p.y})`);
        }
        const frameIds = new Set([...moved.frameIds, ...this._refreshDynamicFrameBounds(dims, state)]);
        for (const id of frameIds) {
            const b = state.frameBounds.get(id);
            if (!b) { continue; }
            this._updateFrameElement(id, b);
        }
        this._updateAllEdges(edges, dims, state);
    }

    private _refreshFrameElements(
        dims: Map<string, { w: number; h: number }>,
        state: GroupedRenderState | null,
    ): void {
        if (!state) { return; }
        for (const id of this._refreshDynamicFrameBounds(dims, state)) {
            const b = state.frameBounds.get(id);
            if (b) { this._updateFrameElement(id, b); }
        }
    }

    private _updateFrameElement(frameId: string, b: Bounds): void {
        const g = this._frameEls.get(frameId);
        if (!g) { return; }
        g.select('rect')
            .attr('x', b.x).attr('y', b.y)
            .attr('width', b.w).attr('height', b.h);
        const frame = this._groupedRenderState?.frameById.get(frameId);
        if (frame) {
            const hb = computeFrameDragHandleBounds(frame.label, b);
            const handle = g.select('g.frame-drag-handle')
                .attr('transform', `translate(${hb.x},${hb.y})`);
            handle.select('rect')
                .attr('width', hb.w).attr('height', hb.h);
            handle.select('text.frame-label')
                .attr('x', 4).attr('y', 12);
        }
        g.select('g.frame-toggle')
            .attr('transform', `translate(${b.x + b.w - 20},${b.y + 4})`);
    }

    private _addMarker(defs: d3.Selection<SVGDefsElement, unknown, any, any>, id: string, color: string, orient: string): void {
        defs.append('marker')
            .attr('id', id).attr('markerWidth', 8).attr('markerHeight', 6)
            .attr('refX', 8).attr('refY', 3).attr('orient', orient)
            .append('path').attr('d', 'M0,0 L8,3 L0,6 Z').attr('fill', color);
    }

    private _fitView(pos: Map<string, Pos>, dims: Map<string, { w: number; h: number }>, frameBounds?: Map<string, Bounds>, hiddenNodeIds?: Set<string>): void {
        if (!this._svg || !this._zoom || pos.size === 0) { return; }
        const bounds = this._fitBounds(pos, dims, frameBounds, hiddenNodeIds);
        if (!bounds) { return; }
        const cw = this._container.clientWidth  || 400;
        const ch = this._container.clientHeight || 400;
        const pad = 24;
        const bw = bounds.w + 2 * pad, bh = bounds.h + 2 * pad;
        const sc = Math.min(cw / bw, ch / bh, 1.5);
        const t  = d3.zoomIdentity
            .translate((cw - bw * sc) / 2 - (bounds.x - pad) * sc, (ch - bh * sc) / 2 - (bounds.y - pad) * sc)
            .scale(sc);
        this._zoom.transform(this._svg, t);
    }

    private _bindNode(g: d3.Selection<SVGGElement, unknown, any, any>, node: GraphNode): void {
        g.on('click', (ev: MouseEvent) => {
            ev.stopPropagation();
            this._onNodeClick(node.id, node.filePath, node.line);
            if (this._selectedNodeId === node.id) {
                this._selectedNodeId = null;
                this._clearFocus();
                this._jumpBtn.style.display = 'none';
                this._jumpBtn.onclick = null;
            } else {
                this._selectedNodeId = node.id;
                this._applyFocus(this._getNeighborIds(node.id), node.id);
                if (node.filePath) {
                    this._jumpBtn.style.display = 'block';
                    this._jumpBtn.onclick = () => this._onNodeDblClick(node.id, node.filePath!, node.line, node.fullName);
                }
            }
        });
        g.on('dblclick', (ev: MouseEvent) => {
            ev.stopPropagation();
            this._onNodeDblClick(node.id, node.filePath, node.line, node.fullName);
        });
        g.on('mouseover', (ev: MouseEvent) => {
            const lines = [node.fullName];
            if (node.filePath) { lines.push(node.filePath + (node.line !== undefined ? `:${node.line + 1}` : '')); }
            this._showTooltip(lines.join('\n'), { x: ev.clientX, y: ev.clientY });
        });
        g.on('mouseout', () => this._hideTooltip());
    }

    private _showTooltip(text: string, p: { x: number; y: number }): void {
        this._tooltip.textContent = text;
        this._tooltip.style.display = 'block';
        const tw = this._tooltip.offsetWidth, th = this._tooltip.offsetHeight, GAP = 12;
        this._tooltip.style.left = `${(p.x + GAP + tw > window.innerWidth)  ? Math.max(0, p.x - tw - GAP) : p.x + GAP}px`;
        this._tooltip.style.top  = `${(p.y + GAP + th > window.innerHeight) ? Math.max(0, p.y - th - GAP) : p.y + GAP}px`;
    }

    private _hideTooltip(): void { this._tooltip.style.display = 'none'; }
}

/** Factory — returns the default renderer without exposing the concrete class. */
export function createRenderer(
    container: HTMLElement, tooltip: HTMLElement,
    onNodeClick: NodeEventCallback, onNodeDblClick: NodeEventCallback,
): GraphRenderer {
    return new D3Renderer(container, tooltip, onNodeClick, onNodeDblClick);
}
