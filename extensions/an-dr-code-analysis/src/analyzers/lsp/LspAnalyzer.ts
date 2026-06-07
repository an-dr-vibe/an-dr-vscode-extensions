import * as vscode from 'vscode';
import { IAnalyzer, AnalysisRequest, AnalysisResult } from '../IAnalyzer';
import { getIncomingCalls, getOutgoingCalls, prepareCallHierarchy } from './LspClient';
import { buildCallGraph } from '../../graph/GraphBuilder';
import { ContextTracker } from '../../context/ContextTracker';

const C_CPP_LANG_IDS = new Set(['c', 'cpp', 'cuda-cpp', 'objective-c', 'objective-cpp']);

export class LspAnalyzer implements IAnalyzer {
    readonly name = 'clangd';

    constructor(private readonly _contextTracker: ContextTracker) {}

    canHandle(request: AnalysisRequest): boolean {
        return C_CPP_LANG_IDS.has(request.context.langId) && request.graphType === 'callGraph';
    }

    async analyze(request: AnalysisRequest): Promise<AnalysisResult | null> {
        const { context, graphType, depth, signal } = request;

        // Reuse the CallHierarchyItem already fetched by ContextTracker (no second round-trip)
        let target = this._contextTracker.currentCallHierarchyItem;

        // If stale (context changed) or missing, fetch fresh
        if (!target || target.name !== context.symbol) {
            const uri = vscode.Uri.file(context.filePath);
            // We don't have the exact position, so use line 0 as fallback — the
            // context tracker already resolved the symbol so it should be in scope.
            // Better: resolve from the active editor position if available.
            const editor = vscode.window.activeTextEditor;
            const pos = editor?.document.uri.fsPath === context.filePath
                ? editor.selection.active
                : new vscode.Position(0, 0);
            const items = await prepareCallHierarchy(uri, pos, signal);
            if (!items?.length) { return null; }
            target = items[0];
        }

        if (signal?.aborted) { return null; }

        const [incoming, outgoing] = await Promise.all([
            getIncomingCalls(target, signal),
            getOutgoingCalls(target, signal),
        ]);

        if (signal?.aborted) { return null; }

        const graph = buildCallGraph(target, incoming, outgoing, graphType, depth, this.name);

        // A graph with only the target node (no callers/callees) means LSP returned nothing useful
        if (graph.nodes.length <= 1 && incoming.length === 0 && outgoing.length === 0) {
            return null;
        }

        return { graph };
    }
}
