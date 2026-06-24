import { ForceLayoutStrategy } from './ForceLayoutStrategy';
import { GroupedLayoutStrategy } from './GroupedLayoutStrategy';
import { HierarchicalLayoutStrategy } from './HierarchicalLayoutStrategy';
import { RadialLayoutStrategy } from './RadialLayoutStrategy';
import { RoseLayoutStrategy } from './RoseLayoutStrategy';
import { GraphLayoutInput, GraphLayoutResult, GraphLayoutStrategy, LayoutName, ResolveGraphLayoutOptions } from './GraphLayoutStrategy';

export type {
    ForceLayout,
    GraphLayoutContext,
    GraphLayoutInput,
    GraphLayoutResult,
    LayoutName,
    ResolveGraphLayoutOptions,
} from './GraphLayoutStrategy';

/** Human-readable label and tooltip hint for each layout, keyed by LayoutName. */
export const LAYOUT_META: Record<LayoutName, [label: string, hint: string]> = {
    force:        ['Force',  'Force-directed — nodes repel, edges attract; good for dense graphs'],
    radial:       ['Radial', 'Concentric rings — target at centre, callers and callees on outer rings'],
    hierarchical: ['Tree',   'Breadth-first hierarchy — layers flow top-down'],
    rose:         ['Rose',   'Circular clusters — each caller/callee group fans out from the target'],
    grouped:      ['Group',  'File frames — functions are grouped by compressed file and folder paths'],
};

/** Strategy registry used by renderers and tests to resolve layout behavior by name. */
export const LAYOUT_STRATEGIES: Record<LayoutName, GraphLayoutStrategy> = {
    radial: new RadialLayoutStrategy(),
    hierarchical: new HierarchicalLayoutStrategy(),
    force: new ForceLayoutStrategy(),
    rose: new RoseLayoutStrategy(),
    grouped: new GroupedLayoutStrategy(),
};

/** Default layout policy for graph type and view mode. */
export function defaultLayoutForGraphType(graphType: string, expanded: boolean): LayoutName {
    if (expanded) { return 'hierarchical'; }
    if (graphType === 'callGraph') { return 'radial'; }
    return 'force';
}

/**
 * Resolve the active graph layout and execute its strategy.
 *
 * Concrete renderers pass their current user-selected layout and renderer-specific
 * force callback. This keeps layout dispatch out of the renderer implementation.
 */
export function resolveGraphLayout(graph: GraphLayoutInput, options: ResolveGraphLayoutOptions): GraphLayoutResult {
    const name = options.requestedLayoutName ?? defaultLayoutForGraphType(graph.graphType, options.expanded ?? false);
    return LAYOUT_STRATEGIES[name].compute(graph, options);
}
