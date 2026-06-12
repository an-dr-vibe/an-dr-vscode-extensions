import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { IAnalyzer, AnalysisRequest, AnalysisResult } from '../IAnalyzer';
import { GraphModel, GraphNode, GraphEdge } from '../../graph/GraphModel';
import { log } from '../../logger';

const C_CPP_LANG_IDS = new Set(['c', 'cpp', 'cuda-cpp', 'objective-c', 'objective-cpp']);

// Match: #include "foo.h" or #include <foo.h>
const INCLUDE_RE = /^\s*#\s*include\s*["<]([^">]+)[">]/;

// Walk workspace up to maxDepth and collect all C/C++ source/header files.
const MAX_SCAN_DEPTH = 5;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'build', 'out', 'subprojects', '.meson_build', '.cache']);
const C_CPP_EXTS = new Set(['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hxx', '.inl']);

function collectSourceFiles(dir: string, depth: number, files: string[]): void {
    if (depth >= MAX_SCAN_DEPTH) { return; }
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
        if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) { continue; }
        const full = path.join(dir, e.name).replace(/\\/g, '/');
        if (e.isDirectory()) {
            collectSourceFiles(full, depth + 1, files);
        } else if (e.isFile() && C_CPP_EXTS.has(path.extname(e.name))) {
            files.push(full);
        }
    }
}

// Parse #include directives from a file and return the list of included names.
function parseIncludes(filePath: string): string[] {
    let content: string;
    try { content = fs.readFileSync(filePath, 'utf8'); }
    catch { return []; }
    const includes: string[] = [];
    for (const line of content.split('\n')) {
        const m = INCLUDE_RE.exec(line);
        if (m) { includes.push(m[1]); }
    }
    return includes;
}

// Resolve an include name to an absolute file path from the set of known files.
// Tries: relative to current file's dir first, then basename match in all files.
function resolveInclude(
    includeName: string,
    fromFile: string,
    fileSet: Set<string>,
    basenameIndex: Map<string, string[]>,
): string | undefined {
    // Normalize separators in include name
    const norm = includeName.replace(/\\/g, '/');
    const fromDir = path.dirname(fromFile).replace(/\\/g, '/');
    const candidate = (fromDir + '/' + norm).replace(/\/\.\//g, '/');
    if (fileSet.has(candidate)) { return candidate; }

    // Try basename match
    const base = path.basename(norm);
    const matches = basenameIndex.get(base);
    if (matches && matches.length === 1) { return matches[0]; }
    if (matches && matches.length > 1) {
        // Prefer the one in the same directory or a parent
        const sameDir = matches.find(m => m.startsWith(fromDir));
        if (sameDir) { return sameDir; }
        return matches[0];
    }
    return undefined;
}

export class FileDepsAnalyzer implements IAnalyzer {
    readonly name = 'filedeps';

    canHandle(request: AnalysisRequest): boolean {
        return C_CPP_LANG_IDS.has(request.context.langId) && request.graphType === 'fileDeps';
    }

    async analyze(request: AnalysisRequest): Promise<AnalysisResult | null> {
        const { context, signal } = request;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) { return null; }

        const targetFilePath = context.filePath.replace(/\\/g, '/');
        if (!targetFilePath) { return null; }

        const workspaceRoot = workspaceFolders[0].uri.fsPath.replace(/\\/g, '/');

        if (signal?.aborted) { return null; }

        // Collect all C/C++ files in the workspace
        const allFiles: string[] = [];
        collectSourceFiles(workspaceRoot, 0, allFiles);

        if (signal?.aborted) { return null; }
        if (allFiles.length === 0) { return null; }

        const fileSet = new Set(allFiles);
        // Ensure the target file is in the set even if it's outside the workspace
        fileSet.add(targetFilePath);

        // Build basename index for fast resolution
        const basenameIndex = new Map<string, string[]>();
        for (const f of fileSet) {
            const base = path.basename(f);
            if (!basenameIndex.has(base)) { basenameIndex.set(base, []); }
            basenameIndex.get(base)!.push(f);
        }

        // BFS from target file up to request.depth
        const targetId = targetFilePath;
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
                    langId: path.extname(filePath).slice(1),
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

        // BFS: find what the target includes (outgoing = callees)
        const visited = new Set<string>();
        const queue: { filePath: string; depth: number }[] = [{ filePath: targetFilePath, depth: 0 }];

        while (queue.length > 0) {
            if (signal?.aborted) { return null; }
            const { filePath: current, depth } = queue.shift()!;
            if (visited.has(current)) { continue; }
            visited.add(current);

            if (depth >= request.depth) { continue; }

            const includes = parseIncludes(current);
            for (const inc of includes) {
                const resolved = resolveInclude(inc, current, fileSet, basenameIndex);
                if (!resolved) { continue; }
                if (resolved === targetFilePath) { continue; }

                const role = current === targetFilePath ? 'callee' : 'external';
                addNode(resolved, role);
                addEdge(current, resolved);

                if (!visited.has(resolved) && depth + 1 < request.depth) {
                    queue.push({ filePath: resolved, depth: depth + 1 });
                }
            }
        }

        // Also find who includes the target file (incoming = callers)
        const targetBase = path.basename(targetFilePath);
        for (const f of allFiles) {
            if (signal?.aborted) { return null; }
            if (f === targetFilePath) { continue; }
            const includes = parseIncludes(f);
            for (const inc of includes) {
                const base = path.basename(inc.replace(/\\/g, '/'));
                if (base === targetBase) {
                    const resolved = resolveInclude(inc, f, fileSet, basenameIndex);
                    if (resolved === targetFilePath) {
                        addNode(f, 'caller');
                        addEdge(f, targetFilePath);
                        break;
                    }
                }
            }
        }

        if (nodes.size === 1 && edges.length === 0) {
            log.appendLine(`[FileDepsAnalyzer] no dependencies found for "${targetFilePath}"`);
            return null;
        }

        const graph: GraphModel = {
            graphType: 'fileDeps',
            targetId,
            nodes: [...nodes.values()],
            edges,
            depth: request.depth,
            tool: this.name,
            confidence: 'medium',
        };
        return { graph };
    }
}
