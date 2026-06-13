import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { IAnalyzer, AnalysisRequest, AnalysisResult } from '../IAnalyzer';
import { GraphModel, GraphNode, GraphEdge } from '../../graph/GraphModel';
import { log } from '../../logger';
import { C_CPP_LANG_IDS, PYTHON_LANG_IDS, RUST_LANG_IDS } from '../../config/languageGroups';

const CTAGS_LANG_IDS = new Set([...C_CPP_LANG_IDS, ...PYTHON_LANG_IDS, ...RUST_LANG_IDS]);

interface CtagsEntry {
    name: string;
    path: string;
    line: number;
    kind: string;
}

// Run ctags over the workspace and return all entries, streaming line-by-line to avoid buffer limits.
function runCtags(workspaceRoot: string, signal?: AbortSignal): Promise<CtagsEntry[]> {
    if (signal?.aborted) { return Promise.resolve([]); }
    return new Promise(resolve => {
        const entries: CtagsEntry[] = [];
        const proc = child_process.spawn('ctags', [
            '-R',
            '--output-format=json',
            '--fields=+n',
            '--kinds-C=f',
            '--kinds-C++=f',
            '--kinds-Python=f',
            '--exclude=.git',
            '--exclude=build',
            '--exclude=build_*',
            '--exclude=out',
            '--exclude=node_modules',
            '--exclude=subprojects',
            '--exclude=.meson*',
            workspaceRoot,
        ]);

        let tail = '';
        proc.stdout.on('data', (chunk: Buffer) => {
            if (signal?.aborted) { proc.kill(); return; }
            const text = tail + chunk.toString('utf8');
            const lines = text.split('\n');
            tail = lines.pop() ?? '';
            for (const line of lines) {
                if (!line) { continue; }
                try {
                    const e = JSON.parse(line) as { name: string; path: string; line: number; kind: string };
                    if (typeof e.name === 'string') { entries.push(e); }
                } catch { /* skip malformed line */ }
            }
        });

        proc.on('error', err => {
            log.appendLine(`[CtagsAnalyzer] ctags failed: ${err}`);
            resolve([]);
        });

        proc.on('close', () => {
            // flush any trailing partial line
            if (tail.trim()) {
                try {
                    const e = JSON.parse(tail) as CtagsEntry;
                    if (typeof e.name === 'string') { entries.push(e); }
                } catch { /* ignore */ }
            }
            log.appendLine(`[CtagsAnalyzer] ctags returned ${entries.length} entries`);
            resolve(entries);
        });

        signal?.addEventListener('abort', () => { proc.kill(); resolve([]); }, { once: true });
    });
}

// Search files ctags knows about for calls to targetName.
// Uses ctags paths directly — no separate file walk needed.
function findCallers(
    targetName: string,
    entries: CtagsEntry[],
    signal?: AbortSignal,
): { name: string; filePath: string; line: number }[] {
    if (signal?.aborted) { return []; }

    // Build map: normalized filePath → sorted function definitions
    const fileToFns = new Map<string, { name: string; line: number }[]>();
    for (const e of entries) {
        const key = e.path.replace(/\\/g, '/');
        if (!fileToFns.has(key)) { fileToFns.set(key, []); }
        fileToFns.get(key)!.push({ name: e.name, line: e.line });
    }
    for (const fns of fileToFns.values()) { fns.sort((a, b) => a.line - b.line); }

    const escaped = targetName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const callPattern = new RegExp(`\\b${escaped}\\s*\\(`);
    const callers: { name: string; filePath: string; line: number }[] = [];
    const seen = new Set<string>();

    for (const [filePath, fns] of fileToFns) {
        if (signal?.aborted) { break; }
        let content: string;
        try { content = fs.readFileSync(filePath, 'utf8'); }
        catch { continue; }

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (!callPattern.test(lines[i])) { continue; }

            // Find enclosing function: last fn whose definition line ≤ this line (1-based)
            let enclosing: { name: string; line: number } | undefined;
            for (const fn of fns) {
                if (fn.line <= i + 1) { enclosing = fn; }
                else { break; }
            }
            if (!enclosing || enclosing.name === targetName) { continue; }

            const key = `${filePath}:${enclosing.name}`;
            if (!seen.has(key)) {
                seen.add(key);
                callers.push({ name: enclosing.name, filePath, line: enclosing.line - 1 });
            }
        }
    }

    return callers;
}

export class CtagsAnalyzer implements IAnalyzer {
    readonly name = 'ctags';

    canHandle(request: AnalysisRequest): boolean {
        return CTAGS_LANG_IDS.has(request.context.langId) && request.graphType === 'callGraph';
    }

    async analyze(request: AnalysisRequest): Promise<AnalysisResult | null> {
        const { context, signal } = request;
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) { return null; }
        const workspaceRoot = workspaceFolders[0].uri.fsPath;

        const targetName = context.symbol?.replace(/\(.*$/, '').trim(); // strip params if present
        if (!targetName) { return null; }

        const entries = await runCtags(workspaceRoot, signal);
        if (signal?.aborted || entries.length === 0) { return null; }

        // Find the target's own definition (use all overloads; report the first)
        const targetEntries = entries.filter(e => e.name === targetName);
        if (targetEntries.length === 0) {
            log.appendLine(`[CtagsAnalyzer] "${targetName}" not found in ctags output`);
            return null;
        }
        const targetEntry = targetEntries[0];

        const callers = findCallers(targetName, entries, signal);
        if (signal?.aborted) { return null; }

        // C3/C4: normalize to 0-based; guard against line=0 from ctags (clamp to 0)
        const targetLine0 = Math.max(0, targetEntry.line - 1);
        // Build GraphModel using consistent 0-based lines in both id and node.line
        const targetId = `${targetEntry.path}:${targetLine0}:${targetName}`;
        const nodes: GraphNode[] = [{
            id: targetId,
            label: targetName,
            fullName: targetName,
            filePath: targetEntry.path,
            line: targetLine0,
            role: 'target',
            langId: path.extname(targetEntry.path).slice(1),
        }];
        const edges: GraphEdge[] = [];

        for (const caller of callers) {
            const callerId = `${caller.filePath}:${caller.line}:${caller.name}`;
            if (!nodes.find(n => n.id === callerId)) {
                nodes.push({
                    id: callerId,
                    label: caller.name,
                    fullName: caller.name,
                    filePath: caller.filePath,
                    line: caller.line,
                    role: 'caller',
                    langId: path.extname(caller.filePath).slice(1),
                });
            }
            edges.push({ sourceId: callerId, targetId });
        }

        // A lone target with no callers is still a valid result.

        const graph: GraphModel = {
            graphType: request.graphType,
            targetId,
            nodes,
            edges,
            depth: request.depth,
            tool: this.name,
            confidence: 'medium',
            warnings: ['Macro-expanded calls and template instantiations are not visible with ctags fallback.'],
        };
        return { graph };
    }
}
