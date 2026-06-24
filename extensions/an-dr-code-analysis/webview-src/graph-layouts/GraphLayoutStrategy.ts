import { Pos } from '../../src/graph/positionEngine';
import type { GroupedLayout } from './groupedLayout';

/** Layout identifiers exposed to the webview controls and renderer contract. */
export type LayoutName = 'radial' | 'hierarchical' | 'force' | 'rose' | 'grouped';

/** Minimal graph shape required by the layout strategy layer. */
export interface GraphLayoutInput {
    graphType: string;
    targetId: string;
    nodes: { id: string; filePath?: string }[];
    edges: { sourceId: string; targetId: string }[];
    workspaceRoot?: string;
}

/** D3-backed force layout callback supplied by the concrete renderer. */
export type ForceLayout = (graph: GraphLayoutInput, hints?: Map<string, Pos>) => Map<string, Pos>;

/** Output from a graph layout strategy. */
export interface GraphLayoutResult {
    name: LayoutName;
    positions: Map<string, Pos>;
    groupedLayout: GroupedLayout | null;
}

/** Dependencies that strategies need but should not import directly. */
export interface GraphLayoutContext {
    hints?: Map<string, Pos>;
    forceLayout: ForceLayout;
    estimateNodeWidth?: (label: string) => number;
}

/** Base class for one graph layout algorithm. */
export abstract class GraphLayoutStrategy {
    readonly name: LayoutName;

    protected constructor(name: LayoutName) {
        this.name = name;
    }

    public abstract compute(graph: GraphLayoutInput, context: GraphLayoutContext): GraphLayoutResult;
}

/** Options used when resolving the active graph layout. */
export interface ResolveGraphLayoutOptions extends GraphLayoutContext {
    requestedLayoutName?: LayoutName | null;
    expanded?: boolean;
}

/** Create a consistent layout result object from a concrete strategy. */
export function createLayoutResult(
    name: LayoutName,
    positions: Map<string, Pos>,
    groupedLayout: GroupedLayout | null = null,
): GraphLayoutResult {
    return { name, positions, groupedLayout };
}
