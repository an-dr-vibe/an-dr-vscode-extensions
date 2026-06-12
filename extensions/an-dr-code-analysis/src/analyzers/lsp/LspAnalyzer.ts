import * as vscode from 'vscode';
import { IAnalyzer, AnalysisRequest, AnalysisResult } from '../IAnalyzer';
import { getIncomingCalls, getOutgoingCalls, prepareCallHierarchy } from './LspClient';
import { buildCallGraph } from '../../graph/GraphBuilder';
import { ContextTracker } from '../../context/ContextTracker';
import { ClangdHealth } from '../../tools/ClangdHealth';
import { log } from '../../logger';

const C_CPP_LANG_IDS = new Set(['c', 'cpp', 'cuda-cpp', 'objective-c', 'objective-cpp']);
const TS_JS_LANG_IDS = new Set(['typescript', 'javascript', 'typescriptreact', 'javascriptreact']);

export class LspAnalyzer implements IAnalyzer {
    readonly name: string;
    private readonly _langIds: Set<string>;
    private readonly _requireClangdHealth: boolean;

    constructor(
        private readonly _contextTracker: ContextTracker,
        config: { name: string; langIds: Set<string>; requireClangdHealth: boolean },
    ) {
        this.name = config.name;
        this._langIds = config.langIds;
        this._requireClangdHealth = config.requireClangdHealth;
    }

    static forCCpp(contextTracker: ContextTracker): LspAnalyzer {
        return new LspAnalyzer(contextTracker, {
            name: 'clangd',
            langIds: C_CPP_LANG_IDS,
            requireClangdHealth: true,
        });
    }

    static forTsJs(contextTracker: ContextTracker): LspAnalyzer {
        return new LspAnalyzer(contextTracker, {
            name: 'tsserver',
            langIds: TS_JS_LANG_IDS,
            requireClangdHealth: false,
        });
    }

    canHandle(request: AnalysisRequest): boolean {
        if (!this._langIds.has(request.context.langId) || request.graphType !== 'callGraph') {
            return false;
        }
        if (this._requireClangdHealth) {
            const health = ClangdHealth.checkDetail();
            if (health.issue === 'NO_COMPILE_COMMANDS') {
                log.appendLine('[LspAnalyzer] skipping — compile_commands.json not found');
                return false;
            }
        }
        return true;
    }

    async analyze(request: AnalysisRequest): Promise<AnalysisResult | null> {
        const { context, graphType, depth, signal, callHierarchyItem } = request;

        let target = callHierarchyItem;

        if (!target) {
            const editor = vscode.window.activeTextEditor;
            const uri = vscode.Uri.file(context.filePath);
            const pos = (editor?.document.uri.fsPath === context.filePath)
                ? editor.selection.active
                : new vscode.Position(0, 0);
            const items = await prepareCallHierarchy(uri, pos, signal);
            if (!items?.length) {
                log.appendLine(`[LspAnalyzer:${this.name}] returned no call hierarchy for ${context.filePath}`);
                return null;
            }
            target = items[0];
        }

        if (signal?.aborted) { return null; }

        // BFS up to `depth` levels. Each visited item expands one level of callers + callees.
        // allIncoming/allOutgoing accumulate every call edge found across all levels.
        const visited = new Set<string>();
        const queue: { item: vscode.CallHierarchyItem; level: number }[] = [{ item: target, level: 0 }];
        const allIncoming: vscode.CallHierarchyIncomingCall[] = [];
        const allOutgoing: vscode.CallHierarchyOutgoingCall[] = [];

        function itemKey(item: vscode.CallHierarchyItem): string {
            const line = item.selectionRange?.start?.line ?? item.range?.start?.line ?? 0;
            return `${item.uri.fsPath}:${line}:${item.name}`;
        }

        while (queue.length > 0) {
            if (signal?.aborted) { return null; }
            const { item, level } = queue.shift()!;
            const key = itemKey(item);
            if (visited.has(key)) { continue; }
            visited.add(key);

            if (level >= depth) { continue; }

            const [inc, out] = await Promise.all([
                getIncomingCalls(item, signal),
                getOutgoingCalls(item, signal),
            ]);
            if (signal?.aborted) { return null; }

            allIncoming.push(...inc);
            allOutgoing.push(...out);

            for (const c of inc) {
                if (!visited.has(itemKey(c.from))) {
                    queue.push({ item: c.from, level: level + 1 });
                }
            }
            for (const c of out) {
                if (!visited.has(itemKey(c.to))) {
                    queue.push({ item: c.to, level: level + 1 });
                }
            }
        }

        const graph = buildCallGraph(target, allIncoming, allOutgoing, graphType, depth, this.name);
        return { graph };
    }
}
