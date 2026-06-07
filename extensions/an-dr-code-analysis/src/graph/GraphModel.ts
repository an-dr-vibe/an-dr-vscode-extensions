export type GraphType = 'callGraph' | 'fileDeps' | 'componentDeps';

export type NodeRole = 'target' | 'caller' | 'callee' | 'external';

export interface GraphNode {
    id: string;
    label: string;
    fullName: string;
    filePath?: string;
    line?: number;
    role: NodeRole;
    langId?: string;
}

export interface GraphEdge {
    sourceId: string;
    targetId: string;
    isExternal?: boolean;
}

export interface GraphModel {
    graphType: GraphType;
    targetId: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    depth: number;
    tool: string;
    confidence: 'high' | 'medium' | 'low';
}
