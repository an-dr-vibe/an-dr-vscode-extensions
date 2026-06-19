import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ToolStatus, ToolGroup } from '../webview/messages';
import { ClangdIssue, detectCrossCompile } from './RecoveryActions';
import { readConfig } from '../config/CodeAnalyserConfig';

const GROUP: ToolGroup = 'c-cpp';

export interface ClangdHealthResult {
    issue: ClangdIssue | null;
    message: string;
    compileCommandsPath: string | null;
    crossMarker?: string;
}

// Parse CompilationDatabase from a .clangd YAML file (simple line scan, no full YAML parser).
function readClangdCompilationDatabase(root: string): string | null {
    const clangdPath = path.join(root, '.clangd');
    if (!fs.existsSync(clangdPath)) { return null; }
    try {
        for (const line of fs.readFileSync(clangdPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*CompilationDatabase\s*:\s*(.+)$/);
            if (m) {
                const val = m[1].trim();
                // Resolve relative to workspace root
                const resolved = path.isAbsolute(val) ? val : path.join(root, val);
                const ccPath = path.join(resolved, 'compile_commands.json');
                return fs.existsSync(ccPath) ? ccPath : null;
            }
        }
    } catch { /* unreadable */ }
    return null;
}

function resolveCompileCommandsPath(root: string): string | null {
    // 1. User override stored in .vscode/code-analyser/config.json
    const configured = readConfig().compileCommandsPath;
    if (configured && configured.trim()) { return configured.trim(); }

    // 2. .clangd CompilationDatabase directive
    const fromClangd = readClangdCompilationDatabase(root);
    if (fromClangd) { return fromClangd; }

    // 3. compile_commands.json at workspace root
    const rootPath = path.join(root, 'compile_commands.json');
    return fs.existsSync(rootPath) ? rootPath : null;
}

export class ClangdHealth {
    static check(): ToolStatus {
        const result = ClangdHealth.checkDetail();
        if (result.issue === null) {
            return { name: 'clangd', state: 'ok', group: GROUP, detail: result.compileCommandsPath ?? undefined };
        }
        const stateMap: Record<string, 'warn' | 'missing'> = {
            NO_COMPILE_COMMANDS:    'warn',
            STALE_COMPILE_COMMANDS: 'warn',
            CROSS_COMPILE:          'warn',
        };
        return { name: 'clangd', state: stateMap[result.issue] ?? 'warn', group: GROUP, detail: result.message };
    }

    static checkDetail(): ClangdHealthResult {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return { issue: 'NO_COMPILE_COMMANDS', message: 'No workspace open.', compileCommandsPath: null };
        }

        const root = folders[0].uri.fsPath;
        const compileCommandsPath = resolveCompileCommandsPath(root);

        if (!compileCommandsPath || !fs.existsSync(compileCommandsPath)) {
            return { issue: 'NO_COMPILE_COMMANDS', message: 'compile_commands.json not found. clangd needs it to analyze your code.', compileCommandsPath: null };
        }

        try {
            const raw = fs.readFileSync(compileCommandsPath, 'utf8').trim();
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length === 0) {
                return { issue: 'NO_COMPILE_COMMANDS', message: 'compile_commands.json is empty.', compileCommandsPath };
            }
        } catch {
            return { issue: 'NO_COMPILE_COMMANDS', message: 'compile_commands.json is malformed.', compileCommandsPath };
        }

        // Stale check
        const ccStat = fs.statSync(compileCommandsPath);
        for (const buildFile of ['CMakeLists.txt', 'Makefile', 'makefile', 'meson.build', 'build.ninja']) {
            const bfPath = path.join(root, buildFile);
            if (fs.existsSync(bfPath) && fs.statSync(bfPath).mtimeMs > ccStat.mtimeMs) {
                return { issue: 'STALE_COMPILE_COMMANDS', message: `compile_commands.json may be stale (${buildFile} is newer).`, compileCommandsPath };
            }
        }

        // Cross-compilation check
        const crossMarker = detectCrossCompile(compileCommandsPath);
        if (crossMarker) {
            return { issue: 'CROSS_COMPILE', message: `Cross-compilation toolchain detected (${crossMarker}). clangd may need a .clangd config to work correctly.`, compileCommandsPath, crossMarker };
        }

        return { issue: null, message: '', compileCommandsPath };
    }
}
