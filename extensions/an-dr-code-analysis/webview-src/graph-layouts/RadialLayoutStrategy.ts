import { computeRadialLayout } from '../../shared/graph/positionEngine';
import {
    createLayoutResult,
    GraphLayoutInput,
    GraphLayoutResult,
    GraphLayoutStrategy,
} from './GraphLayoutStrategy';

/** Strategy implementation for the radial BFS-ring layout. */
export class RadialLayoutStrategy extends GraphLayoutStrategy {
    public constructor() { super('radial'); }

    public compute(graph: GraphLayoutInput): GraphLayoutResult {
        return createLayoutResult(this.name, computeRadialLayout(graph));
    }
}
