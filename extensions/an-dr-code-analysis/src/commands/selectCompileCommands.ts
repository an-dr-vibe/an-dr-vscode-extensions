import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { log } from '../logger';

const NS = 'an-dr-code-analysis';

// S1: MAX_SCAN_DEPTH is the exclusive limit; scan(dir, depth) with depth >= MAX_SCAN_DEPTH
// returns immediately, so files up to MAX_SCAN_DEPTH-1 subdirectory levels deep are found.
const MAX_SCAN_DEPTH = 5;

async function findCompileCommandsFiles(workspaceRoot: string): Promise<string[]> {
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
            if (entry.isFile() && entry.name === 'compile_commands.json') {
                const filePath = path.join(dir, entry.name);
                try {
                    const content = fs.readFileSync(filePath, 'utf8').trim();
                    const parsed = JSON.parse(content);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        results.push(filePath);
                    } else {
                        log.appendLine(`[selectCompileCommands] skipping empty: ${filePath}`);
                    }
                } catch {
                    results.push(filePath); // include unparseable files, let user decide
                }
            } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                scan(path.join(dir, entry.name), depth + 1);
            }
        }
    }

    scan(workspaceRoot, 0);
    return results;
}

async function writeClangdConfig(workspaceRoot: string, compilationDatabaseDir: string): Promise<boolean> {
    const rel = path.relative(workspaceRoot, compilationDatabaseDir).replace(/\\/g, '/');
    const clangdPath = path.join(workspaceRoot, '.clangd');
    const content = `CompileFlags:\n  CompilationDatabase: ${rel}\n`;

    // S3: prompt before overwriting an existing hand-crafted .clangd
    if (fs.existsSync(clangdPath)) {
        const choice = await vscode.window.showWarningMessage(
            '.clangd already exists. Overwrite it with the new CompilationDatabase path?',
            'Overwrite', 'Cancel'
        );
        if (choice !== 'Overwrite') { return false; }
    }

    fs.writeFileSync(clangdPath, content, 'utf8');
    log.appendLine(`[selectCompileCommands] wrote .clangd at ${clangdPath} → CompilationDatabase: ${rel}`);
    return true;
}

export async function selectCompileCommandsCommand(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        vscode.window.showWarningMessage('No workspace folder open.');
        return;
    }

    const workspaceRoot = folders[0].uri.fsPath;

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Scanning for compile_commands.json…', cancellable: false },
        async () => {
            const found = await findCompileCommandsFiles(workspaceRoot);
            log.appendLine(`[selectCompileCommands] found ${found.length} compile_commands.json files`);

            const NONE_LABEL  = '$(circle-slash) No compile_commands (use ctags fallback)';
            const BROWSE_LABEL = '$(folder-opened) Browse…';

            const items: vscode.QuickPickItem[] = found.map(f => ({
                label: path.relative(workspaceRoot, f).replace(/\\/g, '/'),
                detail: f,
            }));
            items.push({ label: BROWSE_LABEL, detail: 'Pick a compile_commands.json manually' });
            items.push({ label: NONE_LABEL,   detail: 'Remove .clangd config — rely on ctags fallback' });

            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: found.length === 0
                    ? 'No compile_commands.json found — select an option'
                    : 'Select compile_commands.json to use with clangd',
                title: 'Compile Commands',
            });
            if (!picked) { return; }

            // "No compile_commands" — remove .clangd and clear setting
            if (picked.label === NONE_LABEL) {
                const cfg = vscode.workspace.getConfiguration(NS);
                await cfg.update('tools.compileCommandsPath', '', vscode.ConfigurationTarget.Workspace);
                const clangdPath = path.join(workspaceRoot, '.clangd');
                if (fs.existsSync(clangdPath)) {
                    fs.unlinkSync(clangdPath);
                    log.appendLine(`[selectCompileCommands] removed .clangd at ${clangdPath}`);
                }
                // S4: no showInformationMessage for a remove action — it's just noise
                return;
            }

            let filePath: string;
            if (picked.label === BROWSE_LABEL) {
                const uri = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    filters: { 'Compile Commands': ['json'] },
                    title: 'Select compile_commands.json',
                });
                if (!uri || uri.length === 0) { return; }
                filePath = uri[0].fsPath;
            } else {
                // S5: guard against undefined detail instead of non-null assertion
                if (!picked.detail) { return; }
                filePath = picked.detail;
            }

            const dir = path.dirname(filePath);

            // Save to extension settings
            const cfg = vscode.workspace.getConfiguration(NS);
            await cfg.update('tools.compileCommandsPath', filePath, vscode.ConfigurationTarget.Workspace);

            // Write .clangd at workspace root (S3: may prompt if .clangd already exists)
            const written = await writeClangdConfig(workspaceRoot, dir);
            if (!written) { return; }

            const relPath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
            const choice = await vscode.window.showInformationMessage(
                `Compile commands set to ${relPath}. Restart clangd to apply.`,
                'Restart clangd'
            );
            if (choice === 'Restart clangd') {
                await vscode.commands.executeCommand('clangd.restart').then(
                    () => {},
                    () => {
                        // clangd.restart not available — fall back to full extension host restart
                        void vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }
                );
            }
        }
    );
}
