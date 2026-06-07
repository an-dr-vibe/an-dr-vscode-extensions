import cytoscape from 'cytoscape';
import { getLayout, layoutForGraphType, LayoutName } from './layouts';

export interface GraphNode {
    id: string;
    label: string;
    fullName: string;
    filePath?: string;
    line?: number;
    role: 'target' | 'caller' | 'callee' | 'external';
}

export interface GraphEdge {
    sourceId: string;
    targetId: string;
    isExternal?: boolean;
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

export type NodeEventCallback = (nodeId: string, filePath?: string, line?: number) => void;

// VS Code CSS variable → hex fallback pairs used for cy stylesheet
const ROLE_COLORS = {
    target:   { bg: 'var(--vscode-terminal-ansiGreen,  #4caf50)', border: 'var(--vscode-terminal-ansiGreen,  #388e3c)', label: 'var(--vscode-editor-foreground, #fff)' },
    caller:   { bg: 'var(--vscode-terminal-ansiBlue,   #42a5f5)', border: 'var(--vscode-terminal-ansiBlue,   #1976d2)', label: 'var(--vscode-editor-foreground, #fff)' },
    callee:   { bg: 'var(--vscode-terminal-ansiCyan,   #26c6da)', border: 'var(--vscode-terminal-ansiCyan,   #0097a7)', label: 'var(--vscode-editor-foreground, #fff)' },
    external: { bg: 'var(--vscode-disabledForeground,  #888)',    border: 'var(--vscode-panel-border,        #555)',    label: 'var(--vscode-editor-foreground, #ccc)' },
};

export class CytoscapeRenderer {
    private _cy: cytoscape.Core | null = null;
    private _container: HTMLElement;
    private _tooltip: HTMLElement;
    private _onNodeClick: NodeEventCallback;
    private _onNodeDblClick: NodeEventCallback;

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
    }

    render(graph: GraphModel): void {
        this._cy?.destroy();

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
                },
            })),
        ];

        this._cy = cytoscape({
            container: this._container,
            elements,
            style: this._buildStyle(),
            layout: this._pickLayout(graph),
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
    }

    private _pickLayout(graph: GraphModel): cytoscape.LayoutOptions {
        const name: LayoutName = layoutForGraphType(graph.graphType, false);
        return getLayout(name, graph.nodes.length);
    }

    private _buildStyle(): cytoscape.StylesheetJsonBlock[] {
        return [
            {
                selector: 'node',
                style: {
                    'label': 'data(label)',
                    'text-valign': 'center',
                    'text-halign': 'center',
                    'font-size': '10px',
                    'width': 'label',
                    'height': 'label',
                    'shape': 'roundrectangle',
                    'padding': '10px 14px',
                    'background-color': ROLE_COLORS.callee.bg,
                    'border-color': ROLE_COLORS.callee.border,
                    'border-width': 1.5,
                    'color': ROLE_COLORS.callee.label,
                    'text-wrap': 'none',
                },
            },
            {
                selector: 'node[role = "target"]',
                style: {
                    'width': 'label',
                    'height': 'label',
                    'padding': '12px 18px',
                    'font-size': '12px',
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
                selector: 'node:selected',
                style: {
                    'border-width': 3,
                    'border-color': 'var(--vscode-focusBorder, #007fd4)',
                },
            },
            {
                selector: 'edge',
                style: {
                    'width': 1.5,
                    'line-color': 'var(--vscode-panel-border, #666)',
                    'target-arrow-color': 'var(--vscode-panel-border, #666)',
                    'target-arrow-shape': 'triangle',
                    'curve-style': 'bezier',
                    'arrow-scale': 1,
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
        ];
    }

    private _bindEvents(): void {
        if (!this._cy) { return; }

        this._cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            this._onNodeClick(node.id(), node.data('filePath'), node.data('line'));
        });

        this._cy.on('dbltap', 'node', (evt) => {
            const node = evt.target;
            this._onNodeDblClick(node.id(), node.data('filePath'), node.data('line'));
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
        this._tooltip.style.left = `${pos.x + 12}px`;
        this._tooltip.style.top  = `${pos.y + 12}px`;
        this._tooltip.style.display = 'block';
    }

    private _hideTooltip(): void {
        this._tooltip.style.display = 'none';
    }
}
