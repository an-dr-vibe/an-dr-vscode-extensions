import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { log } from '../logger';
import { writeConfig, clearConfigKey } from '../config/CodeAnalyserConfig';

const MAX_SCAN_DEPTH = 5;

/** Recursively find all tsconfig*.json files under `dir`, skipping common non-source dirs. */
function findTsconfigFiles(workspaceRoot: string): string[] {
    const results: string[] = [];

    function scan(dir: string, depth: number): void {
        if (depth >= MAX_SCAN_DEPTH) { return; }
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.isFile() && /^tsconfig.*\.json$/.test(entry.name)) {
                results.push(path.join(dir, entry.name));
            } else if (
                entry.isDirectory() &&
                !entry.name.startsWith('.') &&
                entry.name !== 'node_modules' &&
                entry.name !== 'out' &&
                entry.name !== 'out-test'
            ) {
                scan(path.join(dir, entry.name), depth + 1);
            }
        }
    }

    scan(workspaceRoot, 0);
    return results;
}

export async function selectTsconfigCommand(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showWarningMessage('No workspace folder open.');
        return;
    }

    const workspaceRoot = folders[0].uri.fsPath;

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Scanning for tsconfig files…', cancellable: false },
        async () => {
            const found = findTsconfigFiles(workspaceRoot);
            log.appendLine(`[selectTsconfig] found ${found.length} tsconfig files`);

            const NONE_LABEL   = '$(circle-slash) No override (use auto-detection)';
            const BROWSE_LABEL = '$(folder-opened) Browse…';

            const items: vscode.QuickPickItem[] = found.map(f => ({
                label: path.relative(workspaceRoot, f).replace(/\\/g, '/'),
                detail: f,
            }));
            items.push({ label: BROWSE_LABEL, detail: 'Pick a tsconfig file manually' });
            items.push({ label: NONE_LABEL,   detail: 'Clear override — extension will auto-detect the right tsconfig' });

            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: found.length === 0
                    ? 'No tsconfig files found — select an option'
                    : 'Select tsconfig to use for cross-project call analysis',
                title: 'TypeScript Config',
            });
            if (!picked) { return; }

            if (picked.label === NONE_LABEL) {
                clearConfigKey('tsconfigPath');
                log.appendLine('[selectTsconfig] cleared tsconfigPath override');
                return;
            }

            let filePath: string;
            if (picked.label === BROWSE_LABEL) {
                const uri = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    filters: { 'TypeScript Config': ['json'] },
                    title: 'Select tsconfig file',
                });
                if (!uri || uri.length === 0) { return; }
                filePath = uri[0].fsPath;
            } else {
                if (!picked.detail) { return; }
                filePath = picked.detail;
            }

            writeConfig({ tsconfigPath: filePath });
            log.appendLine(`[selectTsconfig] set tsconfigPath → ${filePath}`);

            const relPath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
            vscode.window.showInformationMessage(`tsconfig override set to ${relPath}.`);
        }
    );
}
