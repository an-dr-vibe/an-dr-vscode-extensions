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

// Highlight colours for selected-node connections
const HL = {
    incoming:        '#ef5350',  // coral red  — edges flowing INTO the selected node
    outgoing:        '#26a69a',  // teal green — edges flowing OUT of the selected node
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

    render(graph: GraphModel): void {
        const prevSelectedId = this._selectedNodeId;
        this._cy?.destroy();
        this._selectedNodeId = null;
        this._jumpBtn.style.display = 'none';
        this._jumpBtn.onclick = null;

        const elements: cytoscape.ElementDefinition[] = [
            ...graph.nodes.map(n => ({
                group: 'nodes' as const,
                data: {
                    id: n.id,
                    label: n.label,
                    fullName: n.fullName,
                    filePath: n.filePath,
                    line: n.line,
                    role: n.role,
                },
            })),
            ...graph.edges.map((e, i) => ({
                group: 'edges' as const,
                data: {
                    id: `e${i}`,
                    source: e.sourceId,
                    target: e.targetId,
                    isExternal: e.isExternal ?? false,
                    isBidirectional: e.isBidirectional ?? false,
                },
            })),
        ];

        this._cy = cytoscape({
            container: this._container,
            elements,
            style: this._buildStyle(),
            layout: {
                ...this._pickLayout(graph), stop: () => {
                    this._resolveOverlaps();
                    // Re-apply highlight if the previously selected node still exists in the new graph.
                    if (prevSelectedId && this._cy?.getElementById(prevSelectedId).length) {
                        this.selectNode(prevSelectedId);
                    }
                },
            } as any,
            userZoomingEnabled: true,
            userPanningEnabled: true,
            boxSelectionEnabled: false,
        });

        this._bindEvents();
    }

    destroy(): void {
        this._cy?.destroy();
        this._cy = null;
        this._hideTooltip();
        this._jumpBtn.style.display = 'none';
    }

    private _resolveOverlaps(): void {
        const cy = this._cy;
        if (!cy) { return; }

        const MARGIN = 12;
        const MAX_PASSES = 80;

        for (let pass = 0; pass < MAX_PASSES; pass++) {
            const nodes = cy.nodes();
            let moved = false;

            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const a = nodes[i];
                    const b = nodes[j];
                    const bb1 = a.boundingBox({});
                    const bb2 = b.boundingBox({});

                    // Overlap on each axis: positive means overlapping
                    const ox = Math.min(bb1.x2 + MARGIN, bb2.x2 + MARGIN) - Math.max(bb1.x1 - MARGIN, bb2.x1 - MARGIN);
                    const oy = Math.min(bb1.y2 + MARGIN, bb2.y2 + MARGIN) - Math.max(bb1.y1 - MARGIN, bb2.y1 - MARGIN);

                    if (ox <= 0 || oy <= 0) { continue; }

                    // Separate along the axis of least overlap
                    const half = 0.5;
                    if (ox < oy) {
                        const cx1 = (bb1.x1 + bb1.x2) / 2;
                        const cx2 = (bb2.x1 + bb2.x2) / 2;
                        const dir = cx1 <= cx2 ? -1 : 1;
                        a.shift({ x: dir * ox * half, y: 0 });
                        b.shift({ x: -dir * ox * half, y: 0 });
                    } else {
                        const cy1 = (bb1.y1 + bb1.y2) / 2;
                        const cy2 = (bb2.y1 + bb2.y2) / 2;
                        const dir = cy1 <= cy2 ? -1 : 1;
                        a.shift({ x: 0, y: dir * oy * half });
                        b.shift({ x: 0, y: -dir * oy * half });
                    }
                    moved = true;
                }
            }

            if (!moved) { break; }
        }

        cy.fit(undefined, 24);
    }

    private _pickLayout(graph: GraphModel): cytoscape.LayoutOptions {
        const name: LayoutName = layoutForGraphType(graph.graphType, false);
        return getLayout(name, graph.nodes.length);
    }

    // ── Public API ────────────────────────────────────────────────────────────

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

    // ── Selection highlight ───────────────────────────────────────────────────

    private _applyHighlight(nodeId: string): void {
        const cy = this._cy;
        if (!cy) { return; }

        const node = cy.getElementById(nodeId);
        if (node.empty()) { return; }

        // Clear cytoscape native selection state before applying our own classes
        cy.elements().unselect();
        this._clearHighlight();

        const incomingEdges = node.incomers('edge');
        const outgoingEdges = node.outgoers('edge');
        const connectedEdges = incomingEdges.union(outgoingEdges);
        const connectedNodes = connectedEdges.connectedNodes();

        // Dim everything first
        cy.elements().addClass('hl-dim');

        // Un-dim the selected node and its neighbours
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
                    'transition-property': 'opacity',
                    'transition-duration': '150ms' as any,
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
            // Suppress Cytoscape's native selection overlay entirely — we manage it via hl- classes
            {
                selector: 'node:selected',
                style: {
                    'border-width': 1.5,
                    'overlay-opacity': 0,
                },
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
                    'line-color': HL.outgoing,
                    'target-arrow-color': HL.outgoing,
                    'source-arrow-color': HL.outgoing,
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
                    'transition-duration': '150ms' as any,
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
                // Second tap on same node — deselect
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
            // Tap on background — clear selection
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
        // Measure after making visible so offsetWidth is accurate
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
