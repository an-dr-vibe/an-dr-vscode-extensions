/** Shared graph model types used by all renderers and the webview host. */

import type {
    GraphEdge as PayloadGraphEdge,
    GraphModel as PayloadGraphModel,
    GraphNode as PayloadGraphNode,
} from '../../shared/graph/GraphModel';

export { LAYOUT_META } from '../graph-layouts/layoutStrategies';
export type { LayoutName } from '../graph-layouts/layoutStrategies';

export interface GraphNode extends Omit<PayloadGraphNode, 'role'> {
    role: PayloadGraphNode['role'] | 'folder';
}

export interface GraphEdge extends PayloadGraphEdge {
    isBidirectional?: boolean;
}

export interface GraphModel extends Omit<PayloadGraphModel, 'nodes' | 'edges'> {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export type NodeEventCallback = (nodeId: string, filePath?: string, line?: number, fullName?: string) => void;
