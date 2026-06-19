import cytoscape from 'cytoscape';
import { GraphModel, GraphNode, LayoutName, NodeEventCallback, layoutForGraphType } from './types';
import { GraphRenderer } from './IGraphRenderer';
import { computeLevels, resolveOverlaps, roseLayout, treeLayout, radialLayout, Box, Pos } from '../../src/graph/positionEngine';

/** Colors per BFS depth level from the target node. Index = level; index 5 is the fallback for level ≥ 5. */
const LEVEL_COLORS = [
    { bg: '#E05565', border: '#B83040', label: '#fff' }, // 0 — coral/red   (target)
    { bg: '#E8A838', border: '#C07828', label: '#fff' }, // 1 — amber/yellow
    { bg: '#2FB8A0', border: '#1A8870', label: '#fff' }, // 2 — aqua/teal
    { bg: '#28AACC', border: '#1880A0', label: '#fff' }, // 3 — cyan
    { bg: '#5B6AC4', border: '#3A48A0', label: '#fff' }, // 4 — indigo
    { bg: '#8B5CF6', border: '#6D35CC', label: '#fff' }, // 5+ — purple
];

const EXTERNAL_COLORS = { bg: 'var(--vscode-disabledForeground, #888)', border: 'var(--vscode-panel-border, #555)', label: 'var(--vscode-editor-foreground, #ccc)' };

function isLightTheme(): boolean {
    return document.body.dataset['vscodeThemeKind'] === 'vscode-light' ||
           document.body.dataset['vscodeThemeKind'] === 'vscode-high-contrast-light';
}

// Highlight colours for selected-node connections
const HL = {
    incoming:        '#26a69a',  // teal green — edges flowing INTO the selected node
    outgoing:        () => isLightTheme() ? '#e65100' : '#ffb300',  // amber (dark) / deep orange (light)
    selectedBg:      '#3949ab',  // indigo
    selectedBorder:  '#7986cb',  // indigo-300
    selectedLabel:   '#ffffff',
    dimOpacity:      0.12,
};

export class CytoscapeRenderer implements GraphRenderer {
    private _cy: cytoscape.Core | null = null;
    private _container: HTMLElement;
    private _tooltip: HTMLElement;
    private _jumpBtn: HTMLElement;
    private _onNodeClick: NodeEventCallback;
    private _onNodeDblClick: NodeEventCallback;
    private _selectedNodeId: string | null = null;
    private _lastGraph: GraphModel | null = null;
    // Remembers the last known position of every node by id — survives fold/unfold cycles.
    private _posCache: Map<string, { x: number; y: number }> = new Map();
    // null = use graph-type default; set by applyLayout() when the user picks explicitly.
    private _layoutName: LayoutName | null = null;

    constructor(
        container: HTMLElement,
        tooltip: HTMLElement,
        onNodeClick: NodeEventCallback,
        onNodeDblClick: NodeEventCallback,
    ) {
        this._container = container;
        this._tooltip = tooltip;
        this._onNodeClick = onNodeClick;
        this._onNodeDblClick = onNodeDblClick;
        this._jumpBtn = this._createJumpBtn();
    }

    private _createJumpBtn(): HTMLElement {
        const btn = document.createElement('button');
        btn.textContent = '↗ Go to file';
        btn.style.cssText = [
            'position:absolute',
            'display:none',
            'bottom:6px',
            'right:6px',
            'z-index:10',
            'background:var(--vscode-button-background,#0e639c)',
            'color:var(--vscode-button-foreground,#fff)',
            'border:none',
            'border-radius:3px',
            'padding:3px 10px',
            'font-size:0.82em',
            'cursor:pointer',
            'opacity:0.92',
        ].join(';');
        btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
        btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.92'; });
        this._container.style.position = 'relative';
        this._container.appendChild(btn);
        return btn;
    }

    // ── Public API (implements GraphRenderer) ─────────────────────────────────

    /** Full or incremental render. First call builds from scratch; subsequent calls patch. */
    update(graph: GraphModel): void {
        if (!this._cy || this._cy.destroyed()) {
            this._initFresh(graph);
            return;
        }
        this._patch(graph);
    }

    destroy(): void {
        this._cy?.destroy();
        this._cy = null;
        this._lastGraph = null;
        this._posCache.clear();
        this._hideTooltip();
        this._jumpBtn.style.display = 'none';
    }

    /** Change the active layout and immediately re-apply it to the current graph. */
    applyLayout(name: LayoutName): void {
        this._layoutName = name;
        const cy = this._cy;
        const graph = this._lastGraph;
        if (!cy || cy.destroyed() || !graph) { return; }

        const pure = this._computePureLayout(name, graph);
        if (pure) {
            cy.nodes().forEach(n => { const p = pure.get(n.id()); if (p) { n.position(p); } });
            this._resolveOverlaps(cy.nodes());
            cy.fit(undefined, 24);
            cy.nodes().forEach(n => { this._posCache.set(n.id(), n.position()); });
        } else {
            cy.layout({
                ...CytoscapeRenderer._forceLayout(cy.nodes().length),
                stop: () => {
                    if (!cy || cy.destroyed()) { return; }
                    this._resolveOverlaps(cy.nodes());
                    cy.fit(undefined, 24);
                    cy.nodes().forEach(n => { this._posCache.set(n.id(), n.position()); });
                },
            } as any).run();
        }
    }

    selectNode(nodeId: string): void {
        const cy = this._cy;
        if (!cy) { return; }
        const node = cy.getElementById(nodeId);
        if (node.empty()) { return; }
        this._selectedNodeId = nodeId;
        this._applyHighlight(nodeId);
        const filePath: string | undefined = node.data('filePath');
        const line: number | undefined = node.data('line');
        const fullName: string | undefined = node.data('fullName');
        if (filePath) {
            this._jumpBtn.style.display = 'block';
            this._jumpBtn.onclick = () => this._onNodeDblClick(nodeId, filePath, line, fullName);
        }
        cy.animate({ center: { eles: node } } as any, { duration: 200 });
    }

    selectNodesForFile(filePath: string): void {
        const cy = this._cy;
        if (!cy) { return; }
        const norm = (s: string) => s.replace(/\\/g, '/');
        const nfp = norm(filePath);
        const matching = cy.nodes().filter(n => norm(n.data('filePath') ?? '') === nfp);
        if (matching.empty()) { return; }
        this._selectedNodeId = null;
        this._jumpBtn.style.display = 'none';
        this._jumpBtn.onclick = null;
        this._clearHighlight();
        cy.elements().addClass('hl-dim');
        matching.removeClass('hl-dim').addClass('hl-selected');
        const connectedEdges = matching.connectedEdges();
        connectedEdges.removeClass('hl-dim');
        connectedEdges.forEach(edge => {
            const srcInFile = norm(edge.source().data('filePath') ?? '') === nfp;
            const tgtInFile = norm(edge.target().data('filePath') ?? '') === nfp;
            if (srcInFile) { edge.addClass('hl-outgoing'); }
            if (tgtInFile) { edge.addClass('hl-incoming'); }
        });
        connectedEdges.connectedNodes().removeClass('hl-dim');
        cy.animate({ fit: { eles: matching, padding: 40 } } as any, { duration: 200 });
    }

    // ── Layout ────────────────────────────────────────────────────────────────

    private _getEffectiveLayoutName(graph: GraphModel): LayoutName {
        return this._layoutName ?? layoutForGraphType(graph.graphType, false);
    }

    private static _forceLayout(_nodeCount: number): cytoscape.LayoutOptions {
        return {
            name: 'cose',
            animate: false,
            padding: 30,
            nodeRepulsion: (node: cytoscape.NodeSingular) => {
                const bb = node.boundingBox({});
                const size = Math.max(bb.w, bb.h, 40);
                return size * size * 80;
            },
            nodeOverlap: 20,
            idealEdgeLength: (edge: cytoscape.EdgeSingular) => {
                const srcBb = edge.source().boundingBox({});
                const tgtBb = edge.target().boundingBox({});
                return (Math.max(srcBb.w, tgtBb.w, 40) / 2) + 80;
            },
            edgeElasticity: () => 100,
            gravity: 1,
            numIter: 2000,
            randomize: true,
        } as cytoscape.LayoutOptions;
    }

    private _computePureLayout(name: LayoutName, graph: GraphModel): Map<string, Pos> | null {
        if (name === 'rose')         { return roseLayout(graph); }
        if (name === 'hierarchical') { return treeLayout(graph); }
        if (name === 'radial')       { return radialLayout(graph); }
        return null;
    }

    // ── First render ──────────────────────────────────────────────────────────

    private _initFresh(graph: GraphModel): void {
        this._cy?.destroy();
        this._container.appendChild(this._jumpBtn);
        this._selectedNodeId = null;
        this._jumpBtn.style.display = 'none';
        this._jumpBtn.onclick = null;

        const layoutName = this._getEffectiveLayoutName(graph);
        const prePos = this._computePureLayout(layoutName, graph) ?? undefined;
        const elements = this._toElements(graph, prePos);

        const layoutOpts: cytoscape.LayoutOptions = prePos
            ? { name: 'preset', animate: false, fit: true, padding: 24 } as cytoscape.LayoutOptions
            : {
                ...CytoscapeRenderer._forceLayout(graph.nodes.length),
                stop: () => {
                    if (!cy || (this._cy !== cy && this._cy !== null)) { return; }
                    if (cy.destroyed()) { return; }
                    this._resolveOverlaps(cy.nodes());
                    cy.fit(undefined, 24);
                    cy.nodes().forEach(n => { this._posCache.set(n.id(), n.position()); });
                },
            } as any;

        let cy: cytoscape.Core;
        cy = cytoscape({
            container: this._container,
            elements,
            style: this._buildStyle(),
            layout: layoutOpts,
            userZoomingEnabled: true,
            userPanningEnabled: true,
            boxSelectionEnabled: false,
        });
        this._cy = cy;
        this._lastGraph = graph;
        if (prePos) {
            // preset layout runs synchronously; resolve overlaps and cache positions now
            this._resolveOverlaps(cy.nodes());
            cy.fit(undefined, 24);
            cy.nodes().forEach(n => { this._posCache.set(n.id(), n.position()); });
        }
        this._bindEvents();
    }

    // ── Incremental patch ─────────────────────────────────────────────────────

    private _patch(graph: GraphModel): void {
        const cy = this._cy!;
        const prev = this._lastGraph;

        const prevNodeIds = new Set(prev?.nodes.map(n => n.id) ?? []);
        const nextNodeIds = new Set(graph.nodes.map(n => n.id));
        const prevEdgeKeys = new Set(prev?.edges.map(e => `${e.sourceId}->${e.targetId}`) ?? []);
        const nextEdgeKeys = new Set(graph.edges.map(e => `${e.sourceId}->${e.targetId}`));

        const addedNodeIds   = graph.nodes.filter(n => !prevNodeIds.has(n.id));
        const removedNodeIds = (prev?.nodes ?? []).filter(n => !nextNodeIds.has(n.id));
        const addedEdges     = graph.edges.filter(e => !prevEdgeKeys.has(`${e.sourceId}->${e.targetId}`));
        const removedEdges   = (prev?.edges ?? []).filter(e => !nextEdgeKeys.has(`${e.sourceId}->${e.targetId}`));

        // Update data on nodes whose role or label may have changed (e.g. old target becomes caller)
        for (const node of graph.nodes) {
            const el = cy.getElementById(node.id);
            if (!el.empty()) {
                el.data('label',    node.label);
                el.data('fullName', node.fullName);
                el.data('role',     node.role);
                el.data('filePath', node.filePath);
                el.data('line',     node.line);
            }
        }

        // Snapshot positions of nodes about to be removed into the cache
        for (const n of removedNodeIds) {
            const el = cy.getElementById(n.id);
            if (!el.empty()) { this._posCache.set(n.id, { ...el.position() }); }
        }
        // Also keep positions of all currently visible nodes up-to-date
        cy.nodes().forEach(n => { this._posCache.set(n.id(), { ...n.position() }); });

        // Remove stale edges first (before removing nodes they depend on)
        for (const e of removedEdges) {
            cy.getElementById(`e_${e.sourceId}_${e.targetId}`).remove();
        }
        // Remove stale nodes
        for (const n of removedNodeIds) {
            cy.getElementById(n.id).remove();
        }

        // Add new nodes — restore from cache if available, otherwise place via angular layout
        const trulyNew: GraphNode[] = [];
        if (addedNodeIds.length > 0) {
            const spawnPositions = this._placeNewNodes(
                addedNodeIds.filter(n => !this._posCache.has(n.id)),
                graph, cy
            );
            const newEles: cytoscape.ElementDefinition[] = addedNodeIds.map(n => {
                const cached = this._posCache.get(n.id);
                if (!cached) { trulyNew.push(n); }
                return {
                    group: 'nodes' as const,
                    data: {
                        id: n.id, label: n.label, fullName: n.fullName,
                        filePath: n.filePath, line: n.line, role: n.role,
                    },
                    position: cached ?? spawnPositions.get(n.id)!,
                };
            });
            cy.add(newEles);
        }

        // Add new edges
        if (addedEdges.length > 0) {
            const newEdgeEles: cytoscape.ElementDefinition[] = addedEdges.map(e => ({
                group: 'edges' as const,
                data: {
                    id: `e_${e.sourceId}_${e.targetId}`,
                    source: e.sourceId,
                    target: e.targetId,
                    isExternal: e.isExternal ?? false,
                    isBidirectional: e.isBidirectional ?? false,
                },
            }));
            cy.add(newEdgeEles);
        }

        this._lastGraph = graph;

        // Recompute BFS levels after structural changes and apply to all live nodes
        const levels = computeLevels(graph);
        cy.nodes().forEach(n => { n.data('level', levels.get(n.id()) ?? 99); });

        // Resolve overlaps only for genuinely new nodes (no cached position)
        if (trulyNew.length > 0) {
            const selector = trulyNew.map(n => `#${CSS.escape(n.id)}`).join(',');
            const newCol = cy.nodes(selector);
            console.log(`[overlap] before: ${trulyNew.map(n => { const el = cy.getElementById(n.id); return `${n.id}=(${el.position().x.toFixed(1)},${el.position().y.toFixed(1)})`; }).join(', ')}`);
            this._resolveOverlaps(newCol);
            console.log(`[overlap] after:  ${trulyNew.map(n => { const el = cy.getElementById(n.id); return `${n.id}=(${el.position().x.toFixed(1)},${el.position().y.toFixed(1)})`; }).join(', ')}`);
        }

        // Decide whether to fit:
        // - target node changed → fit to new target
        // - node count changed substantially (>30%) → fit all
        // - only minor changes → keep viewport
        const prevCount = prev?.nodes.length ?? 0;
        const nextCount = graph.nodes.length;
        const targetChanged = prev?.targetId !== graph.targetId;
        const countShift = prevCount > 0 ? Math.abs(nextCount - prevCount) / prevCount : 1;

        if (targetChanged || countShift > 0.3) {
            cy.animate({ fit: { eles: cy.nodes(), padding: 24 } } as any, { duration: 250 });
        }

        // Re-apply selection if the selected node is still present
        if (this._selectedNodeId && cy.getElementById(this._selectedNodeId).length) {
            this._applyHighlight(this._selectedNodeId);
        } else {
            this._selectedNodeId = null;
            this._jumpBtn.style.display = 'none';
            this._jumpBtn.onclick = null;
            this._clearHighlight();
        }
    }

    /**
     * Place a batch of new nodes (no cached position) around their hubs using
     * angular spacing. Returns a map nodeId → position.
     */
    private _placeNewNodes(
        newNodes: GraphNode[],
        graph: GraphModel,
        cy: cytoscape.Core,
    ): Map<string, { x: number; y: number }> {
        const MIN_GAP_DEG  = 3;
        const MIN_GAP_RAD  = MIN_GAP_DEG * Math.PI / 180;
        const NODE_SPACING = 90;
        const MIN_RADIUS   = 100;

        const result = new Map<string, { x: number; y: number }>();

        const resolvePos = (id: string): { x: number; y: number } | null => {
            const el = cy.getElementById(id);
            if (!el.empty()) { return el.position(); }
            return this._posCache.get(id) ?? null;
        };

        const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const angDist = (a: number, b: number) => { const d = norm(b - a); return d > Math.PI ? 2 * Math.PI - d : d; };

        const hubGroups = new Map<string, GraphNode[]>();
        const noHub: GraphNode[] = [];

        for (const node of newNodes) {
            const neighbours = graph.edges
                .filter(e => e.sourceId === node.id || e.targetId === node.id)
                .map(e => e.sourceId === node.id ? e.targetId : e.sourceId);

            let hub: string | null = null;
            if (neighbours.includes(graph.targetId) && resolvePos(graph.targetId)) {
                hub = graph.targetId;
            } else {
                hub = neighbours.find(id => resolvePos(id) !== null) ?? null;
            }

            if (hub) {
                if (!hubGroups.has(hub)) { hubGroups.set(hub, []); }
                hubGroups.get(hub)!.push(node);
            } else {
                noHub.push(node);
            }
        }

        for (const [hubId, siblings] of hubGroups) {
            const hubPos = resolvePos(hubId)!;
            const newIds = new Set(siblings.map(n => n.id));
            const occupiedAngles: number[] = [];
            cy.getElementById(hubId).neighborhood('node').forEach(nb => {
                if (newIds.has(nb.id())) { return; }
                const p = nb.position();
                occupiedAngles.push(norm(Math.atan2(p.y - hubPos.y, p.x - hubPos.x)));
            });

            const count = siblings.length;
            let startAngle: number;
            let bestGapSize = 2 * Math.PI;

            if (occupiedAngles.length === 0) {
                startAngle = -Math.PI / 2;
            } else {
                occupiedAngles.sort((a, b) => a - b);
                bestGapSize = 0;
                let bestGapStart = 0;
                for (let i = 0; i < occupiedAngles.length; i++) {
                    const a = occupiedAngles[i];
                    const b = occupiedAngles[(i + 1) % occupiedAngles.length];
                    const gap = norm(b - a);
                    if (gap > bestGapSize) { bestGapSize = gap; bestGapStart = a; }
                }
                const needed = (count + 1) * MIN_GAP_RAD;
                const usable = Math.max(needed, bestGapSize);
                startAngle = bestGapStart + usable / 2 - ((count - 1) / 2) * MIN_GAP_RAD;
            }

            const minRFromSpacing = count > 1
                ? NODE_SPACING / (2 * Math.sin(MIN_GAP_RAD / 2))
                : MIN_RADIUS;
            let maxExistingR = MIN_RADIUS;
            cy.getElementById(hubId).neighborhood('node').forEach(nb => {
                const p = nb.position();
                const d = Math.hypot(p.x - hubPos.x, p.y - hubPos.y);
                if (d > maxExistingR) { maxExistingR = d; }
            });
            const r = Math.max(MIN_RADIUS, minRFromSpacing, maxExistingR * 0.9);

            const takenAngles = [...occupiedAngles];
            console.log(`[place] hub=${hubId} r=${r.toFixed(1)} occupiedAngles=[${occupiedAngles.map(a=>(a*180/Math.PI).toFixed(1)).join(', ')}] startAngle=${(startAngle*180/Math.PI).toFixed(1)}° siblings=${siblings.map(n=>n.id).join(', ')}`);
            for (let i = 0; i < count; i++) {
                let θ = norm(startAngle + i * MIN_GAP_RAD);
                let attempts = 0;
                while (attempts < 72 && takenAngles.some(a => angDist(a, θ) < MIN_GAP_RAD * 0.95)) {
                    θ = norm(θ + MIN_GAP_RAD * 0.5);
                    attempts++;
                }
                takenAngles.push(θ);
                console.log(`[place]   ${siblings[i].id} → θ=${( θ*180/Math.PI).toFixed(1)}° (${attempts} nudges) pos=(${(hubPos.x + r * Math.cos(θ)).toFixed(1)}, ${(hubPos.y + r * Math.sin(θ)).toFixed(1)})`);
                result.set(siblings[i].id, {
                    x: hubPos.x + r * Math.cos(θ),
                    y: hubPos.y + r * Math.sin(θ),
                });
            }
        }

        if (noHub.length > 0) {
            const ext = cy.extent();
            const cx = (ext.x1 + ext.x2) / 2;
            const cy2 = (ext.y1 + ext.y2) / 2;
            const spreadR = 120;
            noHub.forEach((n, i) => {
                const θ = (i / Math.max(noHub.length, 1)) * 2 * Math.PI;
                result.set(n.id, { x: cx + spreadR * Math.cos(θ), y: cy2 + spreadR * Math.sin(θ) });
            });
        }

        return result;
    }

    // ── Overlap resolver ──────────────────────────────────────────────────────

    private _resolveOverlaps(nodes: cytoscape.NodeCollection): void {
        const cy = this._cy;
        if (!cy || cy.destroyed()) { return; }

        const boxes = new Map<string, Box>();
        cy.nodes().forEach(n => {
            const p  = n.position();
            const bb = n.boundingBox({});
            boxes.set(n.id(), { x: p.x, y: p.y, w: bb.x2 - bb.x1, h: bb.y2 - bb.y1 });
        });

        const movers = new Set<string>();
        nodes.forEach((n: cytoscape.NodeSingular) => { movers.add(n.id()); });

        const updated = resolveOverlaps(boxes, movers);
        updated.forEach((pos, id) => {
            const el = cy.getElementById(id);
            if (!el.empty()) { el.position(pos); }
        });
    }

    private _toElements(graph: GraphModel, positions?: Map<string, Pos>): cytoscape.ElementDefinition[] {
        const levels = computeLevels(graph);
        return [
            ...graph.nodes.map(n => {
                const def: cytoscape.ElementDefinition = {
                    group: 'nodes' as const,
                    data: {
                        id: n.id, label: n.label, fullName: n.fullName,
                        filePath: n.filePath, line: n.line, role: n.role,
                        level: levels.get(n.id) ?? 99,
                    },
                };
                const pos = positions?.get(n.id);
                if (pos) { def.position = pos; }
                return def;
            }),
            ...graph.edges.map(e => ({
                group: 'edges' as const,
                data: {
                    id: `e_${e.sourceId}_${e.targetId}`,
                    source: e.sourceId,
                    target: e.targetId,
                    isExternal: e.isExternal ?? false,
                    isBidirectional: e.isBidirectional ?? false,
                },
            })),
        ];
    }

    // ── Selection highlight ───────────────────────────────────────────────────

    private _applyHighlight(nodeId: string): void {
        const cy = this._cy;
        if (!cy) { return; }
        const node = cy.getElementById(nodeId);
        if (node.empty()) { return; }
        cy.elements().unselect();
        this._clearHighlight();
        const incomingEdges = node.incomers('edge');
        const outgoingEdges = node.outgoers('edge');
        const connectedEdges = incomingEdges.union(outgoingEdges);
        const connectedNodes = connectedEdges.connectedNodes();
        cy.elements().addClass('hl-dim');
        node.removeClass('hl-dim').addClass('hl-selected');
        connectedNodes.removeClass('hl-dim');
        incomingEdges.removeClass('hl-dim').addClass('hl-incoming');
        outgoingEdges.removeClass('hl-dim').addClass('hl-outgoing');
    }

    private _clearHighlight(): void {
        const cy = this._cy;
        if (!cy) { return; }
        cy.elements().unselect()
            .removeClass('hl-dim')
            .removeClass('hl-selected')
            .removeClass('hl-incoming')
            .removeClass('hl-outgoing');
    }

    // ── Style ─────────────────────────────────────────────────────────────────

    private _buildStyle(): cytoscape.StylesheetJsonBlock[] {
        return [
            {
                selector: 'node',
                style: {
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '13px',
                    'width': 'label',
                    'height': 'label',
                    'shape': 'roundrectangle',
                    'padding': '10px 14px',
                    'background-color': LEVEL_COLORS[5].bg,
                    'border-color': LEVEL_COLORS[5].border,
                    'border-width': 1.5,
                    'color': LEVEL_COLORS[5].label,
                    'text-wrap': 'wrap',
                    'text-max-width': '160px',
                    'transition-property': 'opacity, background-color, border-color',
                    'transition-duration': '200ms' as any,
                },
            },
            {
                selector: 'node[level = 0]',
                style: {
                    'background-color': LEVEL_COLORS[0].bg,
                    'border-color': LEVEL_COLORS[0].border,
                    'border-width': 3,
                    'color': LEVEL_COLORS[0].label,
                    'padding': '12px 18px',
                    'font-size': '15px',
                    'font-weight': 'bold',
                },
            },
            { selector: 'node[level = 1]', style: { 'background-color': LEVEL_COLORS[1].bg, 'border-color': LEVEL_COLORS[1].border, 'color': LEVEL_COLORS[1].label } },
            { selector: 'node[level = 2]', style: { 'background-color': LEVEL_COLORS[2].bg, 'border-color': LEVEL_COLORS[2].border, 'color': LEVEL_COLORS[2].label } },
            { selector: 'node[level = 3]', style: { 'background-color': LEVEL_COLORS[3].bg, 'border-color': LEVEL_COLORS[3].border, 'color': LEVEL_COLORS[3].label } },
            { selector: 'node[level = 4]', style: { 'background-color': LEVEL_COLORS[4].bg, 'border-color': LEVEL_COLORS[4].border, 'color': LEVEL_COLORS[4].label } },
            {
                selector: 'node[role = "external"]',
                style: { 'background-color': EXTERNAL_COLORS.bg, 'border-color': EXTERNAL_COLORS.border, 'color': EXTERNAL_COLORS.label, 'opacity': 0.65 },
            },
            {
                selector: 'node[role = "folder"]',
                style: { 'background-color': EXTERNAL_COLORS.bg, 'border-color': EXTERNAL_COLORS.border, 'border-width': 1.5, 'border-style': 'dashed' as any, 'color': EXTERNAL_COLORS.label, 'font-style': 'italic' as any, 'opacity': 0.85 },
            },
            { selector: 'node:selected',  style: { 'border-width': 1.5, 'overlay-opacity': 0 } },
            { selector: 'edge:selected',  style: { 'overlay-opacity': 0 } },
            { selector: '.hl-dim',        style: { 'opacity': HL.dimOpacity } },
            {
                selector: 'node.hl-selected',
                style: { 'border-width': 2, 'border-color': HL.selectedBorder, 'background-color': HL.selectedBg, 'color': HL.selectedLabel },
            },
            {
                selector: 'edge.hl-incoming',
                style: { 'line-color': HL.incoming, 'target-arrow-color': HL.incoming, 'source-arrow-color': HL.incoming, 'width': 2, 'opacity': 1, 'line-style': 'solid' as any },
            },
            {
                selector: 'edge.hl-outgoing',
                style: { 'line-color': HL.outgoing(), 'target-arrow-color': HL.outgoing(), 'source-arrow-color': HL.outgoing(), 'width': 2, 'opacity': 1, 'line-style': 'solid' as any },
            },
            {
                selector: 'edge',
                style: {
                    'width': 1.5,
                    'line-color': 'var(--vscode-panel-border, #666)',
                    'target-arrow-color': 'var(--vscode-panel-border, #666)',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'straight',
                    'arrow-scale': 1,
                    'transition-property': 'opacity, line-color, target-arrow-color, width',
                    'transition-duration': '200ms' as any,
                },
            },
            { selector: 'edge[?isExternal]',     style: { 'line-style': 'dashed', 'line-dash-pattern': [6, 3], 'opacity': 0.6 } },
            {
                selector: 'edge[?isBidirectional]',
                style: { 'line-color': '#ef5350', 'target-arrow-color': '#ef5350', 'source-arrow-color': '#ef5350', 'source-arrow-shape': 'triangle', 'target-arrow-shape': 'triangle', 'width': 3, 'opacity': 1 },
            },
        ];
    }

    // ── Events ────────────────────────────────────────────────────────────────

    private _bindEvents(): void {
        if (!this._cy) { return; }

        this._cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            const nodeId: string = node.id();
            const filePath: string | undefined = node.data('filePath');
            const line: number | undefined = node.data('line');
            this._onNodeClick(nodeId, filePath, line);
            if (this._selectedNodeId === nodeId) {
                this._selectedNodeId = null;
                this._clearHighlight();
                this._jumpBtn.style.display = 'none';
                this._jumpBtn.onclick = null;
            } else {
                this._selectedNodeId = nodeId;
                this._applyHighlight(nodeId);
                if (filePath) {
                    const fn: string | undefined = node.data('fullName');
                    this._jumpBtn.style.display = 'block';
                    this._jumpBtn.onclick = () => this._onNodeDblClick(nodeId, filePath, line, fn);
                } else {
                    this._jumpBtn.style.display = 'none';
                    this._jumpBtn.onclick = null;
                }
            }
        });

        this._cy.on('tap', (evt) => {
            if (evt.target === this._cy) {
                this._selectedNodeId = null;
                this._clearHighlight();
                this._jumpBtn.style.display = 'none';
                this._jumpBtn.onclick = null;
            }
        });

        this._cy.on('dbltap', 'node', (evt) => {
            const node = evt.target;
            this._onNodeDblClick(node.id(), node.data('filePath'), node.data('line'), node.data('fullName'));
        });

        this._cy.on('mouseover', 'node', (evt) => {
            const node = evt.target;
            const fullName: string = node.data('fullName') || node.id();
            const filePath: string | undefined = node.data('filePath');
            const line: number | undefined = node.data('line');
            const lines = [fullName];
            if (filePath) { lines.push(filePath + (line !== undefined ? `:${line + 1}` : '')); }
            const containerRect = this._container.getBoundingClientRect();
            const rp = evt.renderedPosition as { x: number; y: number };
            this._showTooltip(lines.join('\n'), { x: containerRect.left + rp.x, y: containerRect.top + rp.y });
        });

        this._cy.on('mouseout', 'node', () => this._hideTooltip());
        this._cy.on('pan zoom', () => this._hideTooltip());
    }

    private _showTooltip(text: string, pos: { x: number; y: number }): void {
        this._tooltip.textContent = text;
        this._tooltip.style.display = 'block';
        const tw = this._tooltip.offsetWidth;
        const th = this._tooltip.offsetHeight;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const GAP = 12;
        const x = (pos.x + GAP + tw > vw) ? Math.max(0, pos.x - tw - GAP) : pos.x + GAP;
        const y = (pos.y + GAP + th > vh) ? Math.max(0, pos.y - th - GAP) : pos.y + GAP;
        this._tooltip.style.left = `${x}px`;
        this._tooltip.style.top  = `${y}px`;
    }

    private _hideTooltip(): void {
        this._tooltip.style.display = 'none';
    }
}

/** Factory — returns the default renderer without exposing the concrete class. */
export function createRenderer(
    container: HTMLElement,
    tooltip: HTMLElement,
    onNodeClick: NodeEventCallback,
    onNodeDblClick: NodeEventCallback,
): GraphRenderer {
    return new CytoscapeRenderer(container, tooltip, onNodeClick, onNodeDblClick);
}
