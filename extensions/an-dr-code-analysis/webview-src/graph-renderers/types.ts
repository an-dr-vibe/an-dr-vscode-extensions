/** Shared graph model types used by all renderers and the webview host. */

export { LAYOUT_META } from '../graph-layouts/layoutStrategies';
export type { LayoutName } from '../graph-layouts/layoutStrategies';

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
    workspaceRoot?: string;
    depth: number;
    tool: string;
    confidence: 'high' | 'medium' | 'low';
}

export type NodeEventCallback = (nodeId: string, filePath?: string, line?: number, fullName?: string) => void;
