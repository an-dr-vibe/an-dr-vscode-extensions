import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IAnalyzer, AnalysisRequest, AnalysisResult } from '../IAnalyzer';
import { GraphModel, GraphNode, GraphEdge } from '../../graph/GraphModel';
import { log } from '../../logger';
import { PYTHON_LANG_IDS } from '../../config/languageGroups';
import { collectFiles, DEFAULT_SKIP_DIRS } from '../../utils/fsUtils';

const PY_EXTS = new Set(['.py']);
const MAX_SCAN_DEPTH = 6;

// Absolute imports: "import foo", "import foo.bar", "from foo.bar import baz"
const ABS_IMPORT_RE = /^\s*(?:import\s+([\w.]+)|from\s+([\w.]+)\s+import\s+)/gm;
// Single-level relative imports: "from .foo import bar", "from . import bar"
const REL_IMPORT_RE = /^\s*from\s+\.([\w.]*)\s+import\s+/gm;

/** Parse import statements and return module specifiers.
 *  Relative imports are prefixed with '.' to distinguish them during resolution. */
function parseImports(filePath: string): string[] {
    let content: string;
    try { content = fs.readFileSync(filePath, 'utf8'); }
    catch { return []; }

    const modules = new Set<string>();
    ABS_IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ABS_IMPORT_RE.exec(content)) !== null) { modules.add(m[1] ?? m[2]); }

    REL_IMPORT_RE.lastIndex = 0;
    while ((m = REL_IMPORT_RE.exec(content)) !== null) {
        if (m[1]) { modules.add('.' + m[1]); }  // skip bare "from . import x" — no path to resolve
    }
    return [...modules];
}

/**
 * Resolve a module specifier to an absolute file path.
 * Handles absolute dotted names (foo.bar → foo/bar.py) and single-level relative imports (.foo → ./foo.py).
 */
function resolveModule(
    moduleName: string,
    fromFile: string,
    fileSet: Set<string>,
    workspaceRoot: string,
): string | undefined {
    const isRelative = moduleName.startsWith('.');
    const relPath = (isRelative ? moduleName.slice(1) : moduleName).replace(/\./g, '/');

    function tryAt(base: string): string | undefined {
        const asPy = base + '.py';
        if (fileSet.has(asPy)) { return asPy; }
        const asInit = base + '/__init__.py';
        if (fileSet.has(asInit)) { return asInit; }
        return undefined;
    }

    if (isRelative) {
        // Resolve relative to importing file's package directory
        const dir = path.dirname(fromFile).replace(/\\/g, '/');
        return relPath ? tryAt(dir + '/' + relPath) : undefined;
    }

    // Absolute: try from workspace root first, then from file's own directory (non-package layouts)
    return tryAt(workspaceRoot + '/' + relPath) ?? tryAt(path.dirname(fromFile).replace(/\\/g, '/') + '/' + relPath);
}

export class AstWalkAnalyzer implements IAnalyzer {
    readonly name = 'ast-walk';

    canHandle(request: AnalysisRequest): boolean {
        return PYTHON_LANG_IDS.has(request.context.langId) && request.graphType === 'fileDeps';
    }

    async analyze(request: AnalysisRequest): Promise<AnalysisResult | null> {
        const { context, signal } = request;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders?.length) { return null; }

        const targetFilePath = context.filePath.replace(/\\/g, '/');
        if (!targetFilePath) { return null; }

        const workspaceRoot = workspaceFolders[0].uri.fsPath.replace(/\\/g, '/');

        if (signal?.aborted) { return null; }

        const allFiles: string[] = [];
        collectFiles(workspaceRoot, 0, MAX_SCAN_DEPTH, PY_EXTS, allFiles, DEFAULT_SKIP_DIRS);

        if (signal?.aborted) { return null; }

        const fileSet = new Set(allFiles);
        fileSet.add(targetFilePath);

        const nodes = new Map<string, GraphNode>();
        const edges: GraphEdge[] = [];
        const edgeSet = new Set<string>();

        function addNode(filePath: string, role: 'target' | 'caller' | 'callee' | 'external'): void {
            if (!nodes.has(filePath)) {
                nodes.set(filePath, {
                    id: filePath, label: path.basename(filePath), fullName: filePath,
                    filePath, role, langId: 'python',
                });
            }
        }

        function addEdge(sourceId: string, dstId: string): void {
            const key = `${sourceId}->${dstId}`;
            if (!edgeSet.has(key)) { edgeSet.add(key); edges.push({ sourceId, targetId: dstId }); }
        }

        addNode(targetFilePath, 'target');

        // Reverse index: resolved file → files that import it (built once over the whole workspace)
        const reverseIndex = new Map<string, string[]>();
        for (const f of allFiles) {
            if (signal?.aborted) { return null; }
            for (const mod of parseImports(f)) {
                const resolved = resolveModule(mod, f, fileSet, workspaceRoot);
                if (resolved) {
                    if (!reverseIndex.has(resolved)) { reverseIndex.set(resolved, []); }
                    reverseIndex.get(resolved)!.push(f);
                }
            }
        }

        if (signal?.aborted) { return null; }

        // BFS from target outward (imports) and inward (importers) up to request.depth
        const visited = new Set<string>();
        const queue: { filePath: string; depth: number }[] = [{ filePath: targetFilePath, depth: 0 }];

        while (queue.length > 0) {
            if (signal?.aborted) { return null; }
            const { filePath: current, depth } = queue.shift()!;
            if (visited.has(current)) { continue; }
            visited.add(current);
            if (depth >= request.depth) { continue; }

            for (const mod of parseImports(current)) {
                const resolved = resolveModule(mod, current, fileSet, workspaceRoot);
                if (!resolved || resolved === targetFilePath) { continue; }
                addNode(resolved, current === targetFilePath ? 'callee' : 'external');
                addEdge(current, resolved);
                if (!visited.has(resolved)) { queue.push({ filePath: resolved, depth: depth + 1 }); }
            }

            for (const importer of reverseIndex.get(current) ?? []) {
                if (importer === targetFilePath) { continue; }
                addNode(importer, current === targetFilePath ? 'caller' : 'external');
                addEdge(importer, current);
                if (!visited.has(importer)) { queue.push({ filePath: importer, depth: depth + 1 }); }
            }
        }

        if (nodes.size === 1 && edges.length === 0) {
            log.appendLine(`[AstWalkAnalyzer] no imports found for "${targetFilePath}"`);
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
            warnings: ['Import resolution is heuristic — dynamic imports and __import__() calls are not detected.'],
        };
        return { graph };
    }
}
