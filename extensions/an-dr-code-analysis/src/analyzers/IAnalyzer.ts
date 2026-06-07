import { GraphModel, GraphType } from '../graph/GraphModel';
import { EditorContext } from '../context/ContextTracker';

export interface AnalysisRequest {
    context: EditorContext;
    graphType: GraphType;
    depth: number;
    signal?: AbortSignal;
}

export interface AnalysisResult {
    graph: GraphModel;
}

export interface IAnalyzer {
    readonly name: string;
    canHandle(request: AnalysisRequest): boolean;
    analyze(request: AnalysisRequest): Promise<AnalysisResult | null>;
}
