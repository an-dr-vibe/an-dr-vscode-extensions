import * as vscode from 'vscode';
import { GraphModel, GraphType } from '../../shared/graph/GraphModel';
import { EditorContext } from '../context/ContextTracker';

export interface AnalysisRequest {
    context: EditorContext;
    callHierarchyItem?: vscode.CallHierarchyItem;
    graphType: GraphType;
    depth: number;
    signal?: AbortSignal;
}

export interface AnalysisResult {
    graph: GraphModel;
    warnings?: string[];
}

export interface IAnalyzer {
    readonly name: string;
    canHandle(request: AnalysisRequest): boolean;
    analyze(request: AnalysisRequest): Promise<AnalysisResult | null>;
}
