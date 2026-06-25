import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import { IAnalyzer, AnalysisRequest, AnalysisResult } from '../IAnalyzer';
import { GraphModel, GraphNode, GraphEdge } from '../../../shared/graph/GraphModel';
import { log } from '../../logger';
import { collectFiles, DEFAULT_SKIP_DIRS } from '../../utils/fsUtils';
import { PYTHON_LANG_IDS } from '../../config/languageGroups';

const PY_EXTS = new Set(['.py']);
const MAX_PY_FILES = 200;

// pyan3 node definition: "id" [label="name" URL="file.py" ...]
const NODE_RE = /^\s*"([^"]+)"\s*\[.*?label\s*=\s*"([^"]+)"(?:[^[\]]*?URL\s*=\s*"([^"]*)")?/;
// pyan3 edge definition: "src" -> "dst"
const EDGE_RE = /^\s*"([^"]+)"\s*->\s*"([^"]+)"/;

interface DotNode { id: string; label: string; url: string; }
interface DotEdge { src: string; dst: string; }

/** Parse pyan3 DOT output into node and edge maps. */
function parseDot(dot: string): { nodes: Map<string, DotNode>; edges: DotEdge[] } {
    const nodes = new Map<string, DotNode>();
    const edges: DotEdge[] = [];
    for (const line of dot.split('\n')) {
        const nm = NODE_RE.exec(line);
        if (nm) { nodes.set(nm[1], { id: nm[1], label: nm[2], url: nm[3] ?? '' }); continue; }
        const em = EDGE_RE.exec(line);
        if (em) { edges.push({ src: em[1], dst: em[2] }); }
    }
    return { nodes, edges };
}

/** Spawn pyan3 with paths relative to workspaceRoot so DOT URL attributes are usable. */
function runPyan3(files: string[], workspaceRoot: string, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted || files.length === 0) { return Promise.resolve(''); }
    return new Promise(resolve => {
        const relFiles = files.map(f => path.relative(workspaceRoot, f));
        const proc = child_process.spawn(
            'pyan3',
            [...relFiles, '--dot', '--no-defines'],
            { cwd: workspaceRoot },
        );
        let out = '';
        proc.stdout.on('data', (chunk: Buffer) => { out += chunk.toString('utf8'); });
        proc.on('error', err => { log.appendLine(`[Pyan3Analyzer] pyan3 failed: ${err}`); resolve(''); });
        proc.on('close', () => { log.appendLine(`[Pyan3Analyzer] parsed ${out.length} chars of DOT`); resolve(out); });
        signal?.addEventListener('abort', () => { proc.kill(); resolve(''); }, { once: true });
    });
}

export class Pyan3Analyzer implements IAnalyzer {
    readonly name = 'pyan3';

    canHandle(request: AnalysisRequest): boolean {
        return PYTHON_LANG_IDS.has(request.context.langId) && request.graphType === 'callGraph';
    }

    async analyze(request: AnalysisRequest): Promise<AnalysisResult | null> {
        const { context, signal } = request;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders?.length) { return null; }

        const targetName = context.symbol?.trim();
        if (!targetName) { return null; }

        const workspaceRoot = workspaceFolders[0].uri.fsPath.replace(/\\/g, '/');

        const allFiles: string[] = [];
        collectFiles(workspaceRoot, 0, 6, PY_EXTS, allFiles, DEFAULT_SKIP_DIRS);
        if (signal?.aborted) { return null; }

        const warnings: string[] = [];
        const files = allFiles.slice(0, MAX_PY_FILES);
        if (allFiles.length > MAX_PY_FILES) {
            warnings.push(`Only ${MAX_PY_FILES} of ${allFiles.length} Python files were analyzed.`);
        }

        const dot = await runPyan3(files, workspaceRoot, signal);
        if (signal?.aborted || !dot) { return null; }

        const { nodes: dotNodes, edges: dotEdges } = parseDot(dot);

        // A label may appear in multiple modules; prefer the one whose URL matches the active file.
        const targetFilePath = context.filePath.replace(/\\/g, '/');
        const candidates = [...dotNodes.values()].filter(n => n.label === targetName);
        if (candidates.length === 0) {
            log.appendLine(`[Pyan3Analyzer] "${targetName}" not found in pyan3 output`);
            return null;
        }
        const targetDotNode = candidates.find(n =>
            targetFilePath.endsWith(n.url.replace(/\\/g, '/'))
        ) ?? candidates[0];
        const targetDotId = targetDotNode.id;

        const resolvedTargetFile = targetDotNode.url
            ? path.join(workspaceRoot, targetDotNode.url).replace(/\\/g, '/')
            : targetFilePath;

        const targetId = `${resolvedTargetFile}:${targetName}`;
        const nodes = new Map<string, GraphNode>();
        const edges: GraphEdge[] = [];

        nodes.set(targetId, {
            id: targetId, label: targetName, fullName: targetDotId,
            filePath: resolvedTargetFile, role: 'target', langId: 'python',
        });

        /** Register a DOT node as caller or callee and return its graph node ID. */
        function addDotNode(dotNode: DotNode, role: GraphNode['role']): string {
            const fp = dotNode.url
                ? path.join(workspaceRoot, dotNode.url).replace(/\\/g, '/')
                : workspaceRoot;
            const nodeId = `${fp}:${dotNode.label}`;
            if (!nodes.has(nodeId)) {
                nodes.set(nodeId, { id: nodeId, label: dotNode.label, fullName: dotNode.id, filePath: fp, role, langId: 'python' });
            }
            return nodeId;
        }

        for (const edge of dotEdges) {
            if (edge.dst === targetDotId) {
                const srcNode = dotNodes.get(edge.src);
                if (srcNode) { edges.push({ sourceId: addDotNode(srcNode, 'caller'), targetId }); }
            } else if (edge.src === targetDotId) {
                const dstNode = dotNodes.get(edge.dst);
                if (dstNode) { edges.push({ sourceId: targetId, targetId: addDotNode(dstNode, 'callee') }); }
            }
        }

        if (nodes.size === 1 && edges.length === 0) {
            log.appendLine(`[Pyan3Analyzer] no calls found for "${targetName}"`);
            return null;
        }

        const graph: GraphModel = {
            graphType: 'callGraph',
            targetId,
            nodes: [...nodes.values()],
            edges,
            depth: request.depth,
            tool: this.name,
            confidence: 'medium',
            warnings,
        };
        return { graph };
    }
}
