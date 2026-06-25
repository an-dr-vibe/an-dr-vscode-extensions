import { computeTreeLayout } from '../../shared/graph/positionEngine';
import {
    createLayoutResult,
    GraphLayoutInput,
    GraphLayoutResult,
    GraphLayoutStrategy,
} from './GraphLayoutStrategy';

/** Strategy implementation for the top-down hierarchical tree layout. */
export class HierarchicalLayoutStrategy extends GraphLayoutStrategy {
    public constructor() { super('hierarchical'); }

    public compute(graph: GraphLayoutInput): GraphLayoutResult {
        return createLayoutResult(this.name, computeTreeLayout(graph));
    }
}
