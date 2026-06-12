import * as vscode from 'vscode';
import { IAnalyzer, AnalysisRequest, AnalysisResult } from '../IAnalyzer';
import { getIncomingCalls, getOutgoingCalls, prepareCallHierarchy } from './LspClient';
import { buildCallGraph } from '../../graph/GraphBuilder';
import { ContextTracker } from '../../context/ContextTracker';
import { ClangdHealth } from '../../tools/ClangdHealth';
import { log } from '../../logger';

const C_CPP_LANG_IDS = new Set(['c', 'cpp', 'cuda-cpp', 'objective-c', 'objective-cpp']);

export class LspAnalyzer implements IAnalyzer {
    readonly name = 'clangd';

    constructor(private readonly _contextTracker: ContextTracker) {}

    canHandle(request: AnalysisRequest): boolean {
        if (!C_CPP_LANG_IDS.has(request.context.langId) || request.graphType !== 'callGraph') {
            return false;
        }
        // Skip clangd entirely when compile_commands.json is absent — its index is
        // unreliable without it and the result would look authoritative but isn't.
        const health = ClangdHealth.checkDetail();
        if (health.issue === 'NO_COMPILE_COMMANDS') {
            log.appendLine('[LspAnalyzer] skipping — compile_commands.json not found');
            return false;
        }
        return true;
    }

    async analyze(request: AnalysisRequest): Promise<AnalysisResult | null> {
        const { context, graphType, depth, signal, callHierarchyItem } = request;

        // Use the item snapshotted at request time (before focus changed away from the editor).
        let target = callHierarchyItem;

        if (!target) {
            // ContextTracker fell back to document-symbol or word — try to resolve from
            // the active editor position if it's still on the right file.
            const editor = vscode.window.activeTextEditor;
            const uri = vscode.Uri.file(context.filePath);
            const pos = (editor?.document.uri.fsPath === context.filePath)
                ? editor.selection.active
                : new vscode.Position(0, 0);
            const items = await prepareCallHierarchy(uri, pos, signal);
            if (!items?.length) {
                log.appendLine(`[LspAnalyzer] clangd returned no call hierarchy — ensure compile_commands.json is` +
                    ` discoverable from the source file's directory (or add a .clangd config at the workspace root).`);
                return null;
            }
            target = items[0];
        }

        if (signal?.aborted) { return null; }

        const [incoming, outgoing] = await Promise.all([
            getIncomingCalls(target, signal),
            getOutgoingCalls(target, signal),
        ]);

        if (signal?.aborted) { return null; }

        // Even a lone target with no edges is a valid result — it means the function
        // exists but has no callers/callees visible to clangd at this depth.

        const graph = buildCallGraph(target, incoming, outgoing, graphType, depth, this.name);
        return { graph };
    }
}
