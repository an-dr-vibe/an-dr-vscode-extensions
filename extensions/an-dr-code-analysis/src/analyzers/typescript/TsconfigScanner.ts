import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { log } from '../../logger';
import { readConfig } from '../../config/CodeAnalyserConfig';
import { collectFiles } from '../../utils/fsUtils';

const TS_EXTS    = new Set(['.ts', '.tsx']);
const MAX_DEPTH  = 8;
const SKIP_DIRS  = new Set(['.git', 'node_modules', 'out', 'out-test', 'dist', 'build', '.cache']);

interface TsconfigJson {
    include?: string[];
    exclude?: string[];
    compilerOptions?: { rootDir?: string };
}

/** Read and parse a tsconfig file. Returns null on error. */
function parseTsconfig(tsconfigPath: string): TsconfigJson | null {
    try {
        return JSON.parse(fs.readFileSync(tsconfigPath, 'utf8')) as TsconfigJson;
    } catch {
        return null;
    }
}

/**
 * Resolve a tsconfig `include` glob pattern to a directory prefix.
 * Handles the common `dir/**\/*` and `dir/**\/*.ts` patterns used in real projects.
 * Returns the absolute directory that the pattern roots to, or null for patterns
 * we cannot reduce to a simple prefix (e.g. negations, brace expansions).
 */
function patternToPrefix(pattern: string, tsconfigDir: string): string | null {
    // Strip trailing glob segment(s): "src/**/*" → "src", "**/*" → ""
    const bare = pattern.replace(/[/\\]?\*\*.*$/, '').replace(/\*.*$/, '').replace(/[/\\]$/, '');
    if (bare.includes('*') || bare.includes('{')) { return null; }
    return path.resolve(tsconfigDir, bare || '.');
}

/**
 * Return true if `filePath` is covered by the given tsconfig's include/exclude rules.
 * Uses prefix matching — accurate for the standard `dir/**\/*` patterns; may produce
 * false positives for complex glob patterns (acceptable: we only scan candidate files).
 */
function isCoveredBy(filePath: string, tsconfigPath: string): boolean {
    const cfg = parseTsconfig(tsconfigPath);
    if (!cfg) { return false; }

    const dir  = path.dirname(tsconfigPath);
    const norm = filePath.replace(/\\/g, '/');

    // Default include when omitted: everything under the tsconfig directory
    const includes = cfg.include ?? ['**/*'];
    const excludes = cfg.exclude ?? ['node_modules', 'out', 'out-test'];

    const excluded = excludes.some(p => {
        const prefix = patternToPrefix(p, dir);
        return prefix ? norm.startsWith(prefix.replace(/\\/g, '/')) : false;
    });
    if (excluded) { return false; }

    return includes.some(p => {
        const prefix = patternToPrefix(p, dir);
        return prefix ? norm.startsWith(prefix.replace(/\\/g, '/')) : false;
    });
}

/** Find all tsconfig*.json files in the workspace, skipping common non-source dirs. */
function discoverTsconfigs(workspaceRoot: string): string[] {
    const results: string[] = [];
    function scan(dir: string, depth: number): void {
        if (depth >= 5) { return; }
        let entries: fs.Dirent[];
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
        catch { return; }
        for (const e of entries) {
            if (e.isFile() && /^tsconfig.*\.json$/.test(e.name)) {
                results.push(path.join(dir, e.name));
            } else if (e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) {
                scan(path.join(dir, e.name), depth + 1);
            }
        }
    }
    scan(workspaceRoot, 0);
    return results;
}

/**
 * Resolve which tsconfig to use for cross-project scanning of `filePath`.
 * Priority: user override in config.json → first tsconfig whose include covers the file → null.
 */
export function resolveTsconfigForFile(filePath: string, workspaceRoot: string): string | null {
    // 1. User override
    const override = readConfig().tsconfigPath;
    if (override) {
        const abs = path.isAbsolute(override) ? override : path.join(workspaceRoot, override);
        if (fs.existsSync(abs)) { return abs; }
        log.appendLine(`[TsconfigScanner] override path not found: ${abs}`);
    }

    // 2. Auto-detect: find the tsconfig that covers this file
    const all = discoverTsconfigs(workspaceRoot);
    for (const tc of all) {
        if (isCoveredBy(filePath, tc)) {
            log.appendLine(`[TsconfigScanner] auto-matched ${path.basename(tc)} for ${path.basename(filePath)}`);
            return tc;
        }
    }
    return null;
}

/**
 * Scan all TypeScript files covered by `tsconfigPath` for references to `symbolName`.
 * Returns absolute file paths of files that contain a call-like reference to the symbol.
 * This is a text scan — it catches direct calls but not aliased or dynamically constructed ones.
 */
export function scanForCallers(symbolName: string, tsconfigPath: string): string[] {
    const tsconfigDir = path.dirname(tsconfigPath);
    const cfg = parseTsconfig(tsconfigPath);
    if (!cfg) { return []; }

    // Collect all TS files under the tsconfig's root directory
    const includes = cfg.include ?? ['**/*'];
    const roots = includes
        .map(p => patternToPrefix(p, tsconfigDir))
        .filter((p): p is string => p !== null);

    const allFiles: string[] = [];
    for (const root of roots) {
        if (fs.existsSync(root)) {
            collectFiles(root, 0, MAX_DEPTH, TS_EXTS, allFiles, SKIP_DIRS);
        }
    }

    // Match `symbolName(` to find call sites; exclude the declaration itself
    const callRe = new RegExp(`\\b${escapeRegex(symbolName)}\\s*\\(`, 'g');
    const declRe = new RegExp(`(?:function|class|const|let|var)\\s+${escapeRegex(symbolName)}\\b`);

    return allFiles.filter(f => {
        let src: string;
        try { src = fs.readFileSync(f, 'utf8'); }
        catch { return false; }
        if (declRe.test(src)) { return false; } // skip the file that declares the symbol
        callRe.lastIndex = 0;
        return callRe.test(src);
    });
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Workspace root from the first open folder, or null. */
export function workspaceRoot(): string | null {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}
