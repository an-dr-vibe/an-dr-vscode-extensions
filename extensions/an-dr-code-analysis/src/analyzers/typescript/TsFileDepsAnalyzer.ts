import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IAnalyzer, AnalysisRequest, AnalysisResult } from '../IAnalyzer';
import { GraphModel, GraphNode, GraphEdge } from '../../graph/GraphModel';
import { log } from '../../logger';
import { TS_JS_LANG_IDS } from '../../config/languageGroups';
import { collectFiles, DEFAULT_SKIP_DIRS } from '../../utils/fsUtils';

const TS_JS_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']);

// Matches: import ... from '...' / import('...') / require('...')
const IMPORT_RE = /(?:^|\s)(?:import|export)\s+(?:.+?\s+from\s+)?['"]([^'"]+)['"]/gm;
const REQUIRE_RE = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/gm;

const MAX_SCAN_DEPTH = 6;

function parseImports(filePath: string): string[] {
    let content: string;
    try { content = fs.readFileSync(filePath, 'utf8'); }
    catch { return []; }
    const specifiers = new Set<string>();
    for (const re of [IMPORT_RE, REQUIRE_RE]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
            specifiers.add(m[1]);
        }
    }
    // Only keep relative imports (start with ./ or ../)
    return [...specifiers].filter(s => s.startsWith('.'));
}

// Resolve a relative import specifier to an absolute file path.
function resolveImport(
    specifier: string,
    fromFile: string,
    fileSet: Set<string>,
): string | undefined {
    const fromDir = path.dirname(fromFile).replace(/\\/g, '/');
    const base = (fromDir + '/' + specifier).replace(/\/\.\//g, '/');

    // Try exact match first (already has extension)
    if (fileSet.has(base)) { return base; }

    // Try common extensions
    for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']) {
        const candidate = base + ext;
        if (fileSet.has(candidate)) { return candidate; }
    }

    // Try index file in directory
    for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
        const candidate = base + '/index' + ext;
        if (fileSet.has(candidate)) { return candidate; }
    }

    return undefined;
}

export class TsFileDepsAnalyzer implements IAnalyzer {
    readonly name = 'tsserver';

    canHandle(request: AnalysisRequest): boolean {
        return TS_JS_LANG_IDS.has(request.context.langId) && request.graphType === 'fileDeps';
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
        collectFiles(workspaceRoot, 0, MAX_SCAN_DEPTH, TS_JS_EXTS, allFiles, DEFAULT_SKIP_DIRS);

        if (signal?.aborted) { return null; }

        const fileSet = new Set(allFiles);
        fileSet.add(targetFilePath);

        const nodes = new Map<string, GraphNode>();
        const edges: GraphEdge[] = [];
        const edgeSet = new Set<string>();

        function addNode(filePath: string, role: 'target' | 'caller' | 'callee' | 'external'): void {
            if (!nodes.has(filePath)) {
                nodes.set(filePath, {
                    id: filePath,
                    label: path.basename(filePath),
                    fullName: filePath,
                    filePath,
                    role,
                });
            }
        }

        function addEdge(sourceId: string, targetId: string): void {
            const key = `${sourceId}->${targetId}`;
            if (!edgeSet.has(key)) {
                edgeSet.add(key);
                edges.push({ sourceId, targetId });
            }
        }

        addNode(targetFilePath, 'target');

        // Build reverse index: file → files that import it
        const reverseIndex = new Map<string, string[]>();
        for (const f of allFiles) {
            if (signal?.aborted) { return null; }
            for (const spec of parseImports(f)) {
                const resolved = resolveImport(spec, f, fileSet);
                if (resolved) {
                    if (!reverseIndex.has(resolved)) { reverseIndex.set(resolved, []); }
                    reverseIndex.get(resolved)!.push(f);
                }
            }
        }

        if (signal?.aborted) { return null; }

        // BFS from target
        const visited = new Set<string>();
        const queue: { filePath: string; depth: number }[] = [{ filePath: targetFilePath, depth: 0 }];

        while (queue.length > 0) {
            if (signal?.aborted) { return null; }
            const { filePath: current, depth } = queue.shift()!;
            if (visited.has(current)) { continue; }
            visited.add(current);
            if (depth >= request.depth) { continue; }

            // Outgoing: what current imports
            for (const spec of parseImports(current)) {
                const resolved = resolveImport(spec, current, fileSet);
                if (!resolved || resolved === targetFilePath) { continue; }
                addNode(resolved, current === targetFilePath ? 'callee' : 'external');
                addEdge(current, resolved);
                if (!visited.has(resolved)) { queue.push({ filePath: resolved, depth: depth + 1 }); }
            }

            // Incoming: who imports current
            for (const importer of reverseIndex.get(current) ?? []) {
                if (importer === targetFilePath) { continue; }
                addNode(importer, current === targetFilePath ? 'caller' : 'external');
                addEdge(importer, current);
                if (!visited.has(importer)) { queue.push({ filePath: importer, depth: depth + 1 }); }
            }
        }

        if (nodes.size === 1 && edges.length === 0) {
            log.appendLine(`[TsFileDepsAnalyzer] no dependencies found for "${targetFilePath}"`);
            return null;
        }

        const graph: GraphModel = {
            graphType: 'fileDeps',
            targetId: targetFilePath,
            nodes: [...nodes.values()],
            edges,
            depth: request.depth,
            tool: this.name,
            confidence: 'high',
        };
        return { graph };
    }
}
