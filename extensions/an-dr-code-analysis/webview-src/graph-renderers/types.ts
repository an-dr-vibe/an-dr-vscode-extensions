/** Shared graph model types used by all renderers and the webview host. */

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

export type LayoutName = 'radial' | 'hierarchical' | 'force' | 'rose';

export function layoutForGraphType(graphType: string, expanded: boolean): LayoutName {
    if (expanded) { return 'hierarchical'; }
    if (graphType === 'callGraph') { return 'radial'; }
    return 'force';
}

/** Human-readable label and tooltip hint for each layout, keyed by LayoutName. */
export const LAYOUT_META: Record<LayoutName, [label: string, hint: string]> = {
    force:        ['Force',  'Force-directed — nodes repel, edges attract; good for dense graphs'],
    radial:       ['Radial', 'Concentric rings — target at centre, callers and callees on outer rings'],
    hierarchical: ['Tree',   'Breadth-first hierarchy — layers flow top-down'],
    rose:         ['Rose',   'Circular clusters — each caller/callee group fans out from the target'],
};
