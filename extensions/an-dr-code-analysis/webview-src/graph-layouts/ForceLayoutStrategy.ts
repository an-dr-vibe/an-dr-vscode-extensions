import {
    createLayoutResult,
    GraphLayoutContext,
    GraphLayoutInput,
    GraphLayoutResult,
    GraphLayoutStrategy,
} from './GraphLayoutStrategy';

/** Strategy implementation for renderer-supplied force-directed layouts. */
export class ForceLayoutStrategy extends GraphLayoutStrategy {
    public constructor() { super('force'); }

    public compute(graph: GraphLayoutInput, context: GraphLayoutContext): GraphLayoutResult {
        return createLayoutResult(this.name, context.forceLayout(graph, context.hints));
    }
}
