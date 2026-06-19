import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IAnalyzer, AnalysisRequest, AnalysisResult } from '../IAnalyzer';
import { GraphModel, GraphNode, GraphEdge } from '../../graph/GraphModel';
import { log } from '../../logger';
import { RUST_LANG_IDS } from '../../config/languageGroups';

// Matches `mod name;` (declaration form only — not inline `mod name { ... }` blocks)
const MOD_DECL_RE = /^\s*(?:pub(?:\s*\([^)]*\))?\s+)?mod\s+(\w+)\s*;/gm;

function parseMods(filePath: string): string[] {
    let content: string;
    try { content = fs.readFileSync(filePath, 'utf8'); }
    catch { return []; }

    const mods: string[] = [];
    MOD_DECL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = MOD_DECL_RE.exec(content)) !== null) { mods.push(m[1]); }
    return mods;
}

/** Resolve `mod name;` declared in fromFile to an absolute path.
 *  Checks both the Rust 2018 flat-file form (name.rs sibling) and the old-style directory form (name/mod.rs). */
function resolveMod(modName: string, fromFile: string): string | undefined {
    const dir = path.dirname(fromFile);
    const asFile = path.join(dir, modName + '.rs').replace(/\\/g, '/');
    if (fs.existsSync(asFile)) { return asFile; }
    const asDirMod = path.join(dir, modName, 'mod.rs').replace(/\\/g, '/');
    if (fs.existsSync(asDirMod)) { return asDirMod; }
    return undefined;
}

export class RustModAnalyzer implements IAnalyzer {
    readonly name = 'rust-mod';

    canHandle(request: AnalysisRequest): boolean {
        return RUST_LANG_IDS.has(request.context.langId) && request.graphType === 'fileDeps';
    }

    async analyze(request: AnalysisRequest): Promise<AnalysisResult | null> {
        const { context, signal } = request;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders?.length) { return null; }

        const targetFilePath = context.filePath.replace(/\\/g, '/');
        if (!targetFilePath) { return null; }

        const nodes = new Map<string, GraphNode>();
        const edges: GraphEdge[] = [];
        const edgeSet = new Set<string>();

        function addNode(filePath: string, role: GraphNode['role']): void {
            if (!nodes.has(filePath)) {
                nodes.set(filePath, {
                    id: filePath,
                    label: path.basename(filePath),
                    fullName: filePath,
                    filePath,
                    role,
                    langId: 'rust',
                });
            }
        }

        function addEdge(srcId: string, dstId: string): void {
            const key = `${srcId}->${dstId}`;
            if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ sourceId: srcId, targetId: dstId }); }
        }

        addNode(targetFilePath, 'target');

        // BFS outward: follow mod declarations from the current file
        const visited = new Set<string>();
        const queue: { filePath: string; depth: number }[] = [{ filePath: targetFilePath, depth: 0 }];

        while (queue.length > 0) {
            if (signal?.aborted) { return null; }
            const { filePath: current, depth } = queue.shift()!;
            if (visited.has(current)) { continue; }
            visited.add(current);
            if (depth >= request.depth) { continue; }

            for (const modName of parseMods(current)) {
                const resolved = resolveMod(modName, current);
                if (!resolved) { continue; }
                const role: GraphNode['role'] = current === targetFilePath ? 'callee' : 'external';
                addNode(resolved, role);
                addEdge(current, resolved);
                if (!visited.has(resolved)) { queue.push({ filePath: resolved, depth: depth + 1 }); }
            }
        }

        if (nodes.size === 1 && edges.length === 0) {
            log.appendLine(`[RustModAnalyzer] no mod declarations found in "${targetFilePath}"`);
            return null;
        }

        const graph: GraphModel = {
            graphType: 'fileDeps',
            targetId: targetFilePath,
            nodes: [...nodes.values()],
            edges,
            depth: request.depth,
            tool: this.name,
            confidence: 'low',
            warnings: ['Only mod declarations are followed — use statements and re-exports are not traced.'],
        };
        return { graph };
    }
}
