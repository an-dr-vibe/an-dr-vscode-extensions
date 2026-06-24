import { computeGroupedLayout } from './groupedLayout';
import {
    createLayoutResult,
    GraphLayoutContext,
    GraphLayoutInput,
    GraphLayoutResult,
    GraphLayoutStrategy,
} from './GraphLayoutStrategy';

/** Strategy implementation for file/folder grouped graphs. */
export class GroupedLayoutStrategy extends GraphLayoutStrategy {
    public constructor() { super('grouped'); }

    public compute(graph: GraphLayoutInput, context: GraphLayoutContext): GraphLayoutResult {
        const groupedLayout = computeGroupedLayout(graph, context.estimateNodeWidth);
        return createLayoutResult(this.name, groupedLayout.positions, groupedLayout);
    }
}
