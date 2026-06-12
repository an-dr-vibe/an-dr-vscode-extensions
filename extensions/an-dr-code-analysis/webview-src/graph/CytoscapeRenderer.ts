import cytoscape from 'cytoscape';
import { getLayout, layoutForGraphType, LayoutName } from './layouts';

export interface GraphNode {
    id: string;
    label: string;
    fullName: string;
    filePath?: string;
    line?: number;
    role: 'target' | 'caller' | 'callee' | 'external' | 'folder';
}

export interface GraphEdge {
    sourceId: string;
    targetId: string;
    isExternal?: boolean;
    isBidirectional?: boolean;
}

export interface GraphModel {
    graphType: string;
    targetId: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    depth: number;
    tool: string;
    confidence: 'high' | 'medium' | 'low';
}

export type NodeEventCallback = (nodeId: string, filePath?: string, line?: number, fullName?: string) => void;

const ROLE_COLORS = {
    target:   { bg: 'var(--vscode-terminal-ansiGreen,  #4caf50)', border: 'var(--vscode-terminal-ansiGreen,  #388e3c)', label: 'var(--vscode-editor-foreground, #fff)' },
    caller:   { bg: 'var(--vscode-terminal-ansiBlue,   #42a5f5)', border: 'var(--vscode-terminal-ansiBlue,   #1976d2)', label: 'var(--vscode-editor-foreground, #fff)' },
    callee:   { bg: 'var(--vscode-terminal-ansiCyan,   #26c6da)', border: 'var(--vscode-terminal-ansiCyan,   #0097a7)', label: 'var(--vscode-editor-foreground, #fff)' },
    external: { bg: 'var(--vscode-disabledForeground,  #888)',    border: 'var(--vscode-panel-border,        #555)',    label: 'var(--vscode-editor-foreground, #ccc)' },
};

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

export class CytoscapeRenderer {
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

    // ── Public API ────────────────────────────────────────────────────────────

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

    // ── First render ──────────────────────────────────────────────────────────

    private _initFresh(graph: GraphModel): void {
        this._cy?.destroy();
        this._container.appendChild(this._jumpBtn);
        this._selectedNodeId = null;
        this._jumpBtn.style.display = 'none';
        this._jumpBtn.onclick = null;

        const elements = this._toElements(graph);

        let cy: cytoscape.Core;
        cy = cytoscape({
            container: this._container,
            elements,
            style: this._buildStyle(),
            layout: {
                ...this._pickLayout(graph), stop: () => {
                    if (!cy || (this._cy !== cy && this._cy !== null)) { return; }
                    if (cy.destroyed()) { return; }
                    this._resolveOverlaps(cy.nodes());
                    cy.fit(undefined, 24);
                    // Seed position cache with post-layout positions
                    cy.nodes().forEach(n => { this._posCache.set(n.id(), n.position()); });
                },
            } as any,
            userZoomingEnabled: true,
            userPanningEnabled: true,
            boxSelectionEnabled: false,
        });
        this._cy = cy;
        this._lastGraph = graph;
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

        // Add new nodes — restore from cache if available, otherwise spawn near neighbours
        const trulyNew: GraphNode[] = [];
        if (addedNodeIds.length > 0) {
            const newEles: cytoscape.ElementDefinition[] = addedNodeIds.map(n => {
                const cached = this._posCache.get(n.id);
                if (!cached) { trulyNew.push(n); }
                return {
                    group: 'nodes' as const,
                    data: {
                        id: n.id, label: n.label, fullName: n.fullName,
                        filePath: n.filePath, line: n.line, role: n.role,
                    },
                    position: cached ?? this._spawnPosition(n.id, graph, cy),
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

        // Resolve overlaps only for genuinely new nodes (no cached position)
        if (trulyNew.length > 0) {
            const selector = trulyNew.map(n => `#${CSS.escape(n.id)}`).join(',');
            this._resolveOverlaps(cy.nodes(selector));
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

    /** Pick a spawn position for a new node: centroid of neighbours (live or cached) + jitter. */
    private _spawnPosition(nodeId: string, graph: GraphModel, cy: cytoscape.Core): { x: number; y: number } {
        const neighbourIds = graph.edges
            .filter(e => e.sourceId === nodeId || e.targetId === nodeId)
            .map(e => e.sourceId === nodeId ? e.targetId : e.sourceId);

        const positions: { x: number; y: number }[] = [];
        for (const id of neighbourIds) {
            const live = cy.getElementById(id);
            if (!live.empty()) { positions.push(live.position()); }
            else {
                const cached = this._posCache.get(id);
                if (cached) { positions.push(cached); }
            }
        }

        if (positions.length > 0) {
            const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
            const cy2 = positions.reduce((s, p) => s + p.y, 0) / positions.length;
            const angle = Math.random() * 2 * Math.PI;
            const r = 60 + Math.random() * 40;
            return { x: cx + Math.cos(angle) * r, y: cy2 + Math.sin(angle) * r };
        }

        // No neighbours found anywhere — place near viewport center with jitter
        const ext = cy.extent();
        return {
            x: (ext.x1 + ext.x2) / 2 + (Math.random() - 0.5) * 120,
            y: (ext.y1 + ext.y2) / 2 + (Math.random() - 0.5) * 120,
        };
    }

    // ── Overlap resolver ──────────────────────────────────────────────────────

    private _resolveOverlaps(nodes: cytoscape.NodeCollection): void {
        const cy = this._cy;
        if (!cy || cy.destroyed()) { return; }

        const MARGIN = 12;
        const MAX_PASSES = 80;
        const allNodes = cy.nodes();

        for (let pass = 0; pass < MAX_PASSES; pass++) {
            if (cy.destroyed()) { break; }
            let moved = false;

            nodes.forEach(a => {
                allNodes.forEach(b => {
                    if (a.id() === b.id()) { return; }
                    const bb1 = a.boundingBox({});
                    const bb2 = b.boundingBox({});

                    const ox = Math.min(bb1.x2 + MARGIN, bb2.x2 + MARGIN) - Math.max(bb1.x1 - MARGIN, bb2.x1 - MARGIN);
                    const oy = Math.min(bb1.y2 + MARGIN, bb2.y2 + MARGIN) - Math.max(bb1.y1 - MARGIN, bb2.y1 - MARGIN);

                    if (ox <= 0 || oy <= 0) { return; }

                    const half = 0.5;
                    if (ox < oy) {
                        const c1 = (bb1.x1 + bb1.x2) / 2;
                        const c2 = (bb2.x1 + bb2.x2) / 2;
                        const dir = c1 <= c2 ? -1 : 1;
                        a.shift({ x: dir * ox * half, y: 0 });
                        b.shift({ x: -dir * ox * half, y: 0 });
                    } else {
                        const c1 = (bb1.y1 + bb1.y2) / 2;
                        const c2 = (bb2.y1 + bb2.y2) / 2;
                        const dir = c1 <= c2 ? -1 : 1;
                        a.shift({ x: 0, y: dir * oy * half });
                        b.shift({ x: 0, y: -dir * oy * half });
                    }
                    moved = true;
                });
            });

            if (!moved) { break; }
        }
    }

    private _pickLayout(graph: GraphModel): cytoscape.LayoutOptions {
        const name: LayoutName = layoutForGraphType(graph.graphType, false);
        return getLayout(name, graph.nodes.length);
    }

    private _toElements(graph: GraphModel): cytoscape.ElementDefinition[] {
        return [
            ...graph.nodes.map(n => ({
                group: 'nodes' as const,
                data: {
                    id: n.id, label: n.label, fullName: n.fullName,
                    filePath: n.filePath, line: n.line, role: n.role,
                },
            })),
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
                    'background-color': ROLE_COLORS.callee.bg,
                    'border-color': ROLE_COLORS.callee.border,
                    'border-width': 1.5,
                    'color': ROLE_COLORS.callee.label,
                    'text-wrap': 'wrap',
                    'text-max-width': '160px',
                    'transition-property': 'opacity, background-color, border-color',
                    'transition-duration': '200ms' as any,
                },
            },
            {
                selector: 'node[role = "target"]',
                style: {
                    'width': 'label',
                    'height': 'label',
                    'padding': '12px 18px',
                    'font-size': '15px',
                    'font-weight': 'bold',
                    'background-color': ROLE_COLORS.target.bg,
                    'border-color': ROLE_COLORS.target.border,
                    'border-width': 3,
                    'color': ROLE_COLORS.target.label,
                },
            },
            {
                selector: 'node[role = "caller"]',
                style: {
                    'background-color': ROLE_COLORS.caller.bg,
                    'border-color': ROLE_COLORS.caller.border,
                    'color': ROLE_COLORS.caller.label,
                },
            },
            {
                selector: 'node[role = "external"]',
                style: {
                    'background-color': ROLE_COLORS.external.bg,
                    'border-color': ROLE_COLORS.external.border,
                    'color': ROLE_COLORS.external.label,
                    'opacity': 0.65,
                },
            },
            {
                selector: 'node[role = "folder"]',
                style: {
                    'background-color': ROLE_COLORS.external.bg,
                    'border-color': ROLE_COLORS.external.border,
                    'border-width': 1.5,
                    'border-style': 'dashed' as any,
                    'color': ROLE_COLORS.external.label,
                    'font-style': 'italic' as any,
                    'opacity': 0.85,
                },
            },
            {
                selector: 'node:selected',
                style: { 'border-width': 1.5, 'overlay-opacity': 0 },
            },
            {
                selector: 'edge:selected',
                style: { 'overlay-opacity': 0 },
            },
            // ── Highlight classes ─────────────────────────────────────────────
            {
                selector: '.hl-dim',
                style: { 'opacity': HL.dimOpacity },
            },
            {
                selector: 'node.hl-selected',
                style: {
                    'border-width': 2,
                    'border-color': HL.selectedBorder,
                    'background-color': HL.selectedBg,
                    'color': HL.selectedLabel,
                },
            },
            {
                selector: 'edge.hl-incoming',
                style: {
                    'line-color': HL.incoming,
                    'target-arrow-color': HL.incoming,
                    'source-arrow-color': HL.incoming,
                    'width': 2,
                    'opacity': 1,
                    'line-style': 'solid' as any,
                },
            },
            {
                selector: 'edge.hl-outgoing',
                style: {
                    'line-color': HL.outgoing(),
                    'target-arrow-color': HL.outgoing(),
                    'source-arrow-color': HL.outgoing(),
                    'width': 2,
                    'opacity': 1,
                    'line-style': 'solid' as any,
                },
            },
            // ── Base edge ─────────────────────────────────────────────────────
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
            {
                selector: 'edge[?isExternal]',
                style: {
                    'line-style': 'dashed',
                    'line-dash-pattern': [6, 3],
                    'opacity': 0.6,
                },
            },
            {
                selector: 'edge[?isBidirectional]',
                style: {
                    'line-color': '#ef5350',
                    'target-arrow-color': '#ef5350',
                    'source-arrow-color': '#ef5350',
                    'source-arrow-shape': 'triangle',
                    'target-arrow-shape': 'triangle',
                    'width': 3,
                    'opacity': 1,
                },
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
            this._showTooltip(lines.join('\n'), {
                x: containerRect.left + rp.x,
                y: containerRect.top  + rp.y,
            });
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
