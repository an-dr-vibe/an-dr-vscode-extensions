import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IAnalyzer, AnalysisRequest, AnalysisResult } from '../IAnalyzer';
import { GraphModel, GraphNode, GraphEdge } from '../../graph/GraphModel';
import { log } from '../../logger';
import { TS_JS_LANG_IDS } from '../../config/languageGroups';
import { collectFiles } from '../../utils/fsUtils';

interface TsConfig {
    references?: Array<{ path: string }>;
    compilerOptions?: { outDir?: string };
}

function readTsConfig(filePath: string): TsConfig | null {
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        // Strip single-line comments so JSON.parse doesn't choke on tsconfig comments
        const stripped = raw.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
        return JSON.parse(stripped);
    } catch {
        return null;
    }
}

export class TsComponentDepsAnalyzer implements IAnalyzer {
    readonly name = 'tsconfig';

    canHandle(request: AnalysisRequest): boolean {
        return TS_JS_LANG_IDS.has(request.context.langId) && request.graphType === 'componentDeps';
    }

    async analyze(request: AnalysisRequest): Promise<AnalysisResult | null> {
        const { signal } = request;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders?.length) { return null; }

        const workspaceRoot = workspaceFolders[0].uri.fsPath.replace(/\\/g, '/');

        if (signal?.aborted) { return null; }

        // Find all tsconfig.json files in workspace (depth ≤ 3)
        const tsconfigs: string[] = [];
        collectFiles(workspaceRoot, 0, 3, new Set(['.json']), tsconfigs);
        // Keep only tsconfig.json files
        const filteredTsconfigs = tsconfigs.filter(f => path.basename(f) === 'tsconfig.json');

        if (filteredTsconfigs.length === 0) {
            log.appendLine('[TsComponentDepsAnalyzer] no tsconfig.json found in workspace');
            return null;
        }

        if (signal?.aborted) { return null; }

        const nodes = new Map<string, GraphNode>();
        const edges: GraphEdge[] = [];
        const edgeSet = new Set<string>();

        // Node id = tsconfig dir (the "project")
        function projectId(tsconfigPath: string): string {
            return path.dirname(tsconfigPath).replace(/\\/g, '/');
        }

        function projectLabel(tsconfigPath: string): string {
            const dir = path.dirname(tsconfigPath).replace(/\\/g, '/');
            return dir === workspaceRoot ? path.basename(workspaceRoot) : path.relative(workspaceRoot, dir).replace(/\\/g, '/');
        }

        function addNode(tsconfigPath: string, role: 'target' | 'caller' | 'callee' | 'external'): string {
            const id = projectId(tsconfigPath);
            if (!nodes.has(id)) {
                nodes.set(id, {
                    id,
                    label: projectLabel(tsconfigPath),
                    fullName: tsconfigPath,
                    filePath: tsconfigPath,
                    role,
                });
            }
            return id;
        }

        function addEdge(sourceId: string, targetId: string): void {
            const key = `${sourceId}->${targetId}`;
            if (!edgeSet.has(key)) {
                edgeSet.add(key);
                edges.push({ sourceId, targetId });
            }
        }

        // Find the root tsconfig (the one in the workspace root, or first found)
        const rootTsconfig = filteredTsconfigs.find(t => path.dirname(t).replace(/\\/g, '/') === workspaceRoot)
            ?? filteredTsconfigs[0];
        const rootId = addNode(rootTsconfig, 'target');

        // Walk all tsconfigs and resolve their references
        for (const tsconfigPath of filteredTsconfigs) {
            if (signal?.aborted) { return null; }
            const config = readTsConfig(tsconfigPath);
            if (!config?.references?.length) { continue; }

            const fromId = addNode(tsconfigPath, nodes.has(projectId(tsconfigPath)) ? nodes.get(projectId(tsconfigPath))!.role : 'caller');

            for (const ref of config.references) {
                const refDir = path.resolve(path.dirname(tsconfigPath), ref.path).replace(/\\/g, '/');
                // ref.path may point to a directory (with tsconfig.json) or directly to a tsconfig file
                const refTsconfig = refDir.endsWith('.json') ? refDir : refDir + '/tsconfig.json';
                const refNorm = refTsconfig.replace(/\\/g, '/');

                // Add the referenced project as a node
                const refLabel = path.relative(workspaceRoot, path.dirname(refNorm)).replace(/\\/g, '/') || path.basename(workspaceRoot);
                const refId = refDir;
                if (!nodes.has(refId)) {
                    nodes.set(refId, {
                        id: refId,
                        label: refLabel,
                        fullName: refNorm,
                        filePath: refNorm,
                        role: 'callee',
                    });
                }
                addEdge(fromId, refId);
            }
        }

        if (nodes.size <= 1 && edges.length === 0) {
            log.appendLine('[TsComponentDepsAnalyzer] no project references found in tsconfig.json files');
            return null;
        }

        const graph: GraphModel = {
            graphType: 'componentDeps',
            targetId: rootId,
            nodes: [...nodes.values()],
            edges,
            depth: request.depth,
            tool: this.name,
            confidence: 'high',
        };
        return { graph };
    }
}
