import * as path from 'path';
import * as vscode from 'vscode';
import { IAnalyzer, AnalysisRequest, AnalysisResult } from '../IAnalyzer';
import { getIncomingCalls, getOutgoingCalls, prepareCallHierarchy } from './LspClient';
import { buildCallGraph, CallEdge } from '../../graph/GraphBuilder';
import { ContextTracker } from '../../context/ContextTracker';
import { ClangdHealth } from '../../tools/ClangdHealth';
import { log } from '../../logger';
import { C_CPP_LANG_IDS, TS_JS_LANG_IDS, RUST_LANG_IDS } from '../../config/languageGroups';
import { resolveTsconfigForFile, scanForCallers, workspaceRoot } from '../typescript/TsconfigScanner';

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

    static forRust(contextTracker: ContextTracker): LspAnalyzer {
        return new LspAnalyzer(contextTracker, {
            name: 'rust-analyzer',
            langIds: RUST_LANG_IDS,
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
        // allEdges accumulates resolved {from, to} pairs so intermediate-node edges are
        // preserved (e.g. bar→baz at depth 2 rather than target→baz).
        const visited = new Set<string>();
        const queue: { item: vscode.CallHierarchyItem; level: number }[] = [{ item: target, level: 0 }];
        const allEdges: CallEdge[] = [];
        const incomingCallerFiles = new Set<string>(); // for tsconfig-scan dedup

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

            for (const c of inc) {
                allEdges.push({ from: c.from, to: item });
                incomingCallerFiles.add(c.from.uri.fsPath);
                if (!visited.has(itemKey(c.from))) {
                    queue.push({ item: c.from, level: level + 1 });
                }
            }
            for (const c of out) {
                allEdges.push({ from: item, to: c.to });
                if (!visited.has(itemKey(c.to))) {
                    queue.push({ item: c.to, level: level + 1 });
                }
            }
        }

        // Supplement incoming calls with cross-project text scan for TS/JS.
        // tsserver's _executeProvideIncomingCalls is bounded to a single tsconfig project;
        // files in a different project (e.g. webview-src/ vs src/) are invisible to it.
        if (this.name === 'tsserver') {
            const root = workspaceRoot();
            if (root) {
                const tsconfig = resolveTsconfigForFile(context.filePath, root);
                if (tsconfig) {
                    const callerFiles = scanForCallers(target.name, tsconfig);
                    for (const filePath of callerFiles) {
                        if (incomingCallerFiles.has(filePath)) { continue; }
                        // Synthesise a file-level CallHierarchyItem — line precision is not
                        // available from a text scan; callers show as file nodes (line 0).
                        const synthetic = new vscode.CallHierarchyItem(
                            vscode.SymbolKind.File,
                            path.basename(filePath),
                            '',
                            vscode.Uri.file(filePath),
                            new vscode.Range(0, 0, 0, 0),
                            new vscode.Range(0, 0, 0, 0),
                        );
                        allEdges.push({ from: synthetic, to: target });
                        log.appendLine(`[LspAnalyzer] tsconfig-scan caller: ${path.basename(filePath)}`);
                    }
                }
            }
        }

        const graph = buildCallGraph(target, allEdges, graphType, depth, this.name);
        return { graph };
    }
}
