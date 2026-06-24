import { computeRoseLayout } from '../../src/graph/positionEngine';
import {
    createLayoutResult,
    GraphLayoutInput,
    GraphLayoutResult,
    GraphLayoutStrategy,
} from './GraphLayoutStrategy';

/** Strategy implementation for the parent-relative radial rose layout. */
export class RoseLayoutStrategy extends GraphLayoutStrategy {
    public constructor() { super('rose'); }

    public compute(graph: GraphLayoutInput): GraphLayoutResult {
        return createLayoutResult(this.name, computeRoseLayout(graph));
    }
}
