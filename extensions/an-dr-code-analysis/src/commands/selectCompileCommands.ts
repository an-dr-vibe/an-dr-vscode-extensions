import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { log } from '../logger';

const NS = 'an-dr-code-analysis';

async function findCompileCommandsFiles(workspaceRoot: string): Promise<string[]> {
    const results: string[] = [];
    const maxDepth = 5;

    function scan(dir: string, depth: number): void {
        if (depth > maxDepth) { return; }
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (entry.isFile() && entry.name === 'compile_commands.json') {
                results.push(path.join(dir, entry.name));
            } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                scan(path.join(dir, entry.name), depth + 1);
            }
        }
    }

    scan(workspaceRoot, 0);
    return results;
}

function writeClangdConfig(workspaceRoot: string, compilationDatabaseDir: string): void {
    const rel = path.relative(workspaceRoot, compilationDatabaseDir).replace(/\\/g, '/');
    const clangdPath = path.join(workspaceRoot, '.clangd');
    const content = `CompileFlags:\n  CompilationDatabase: ${rel}\n`;
    fs.writeFileSync(clangdPath, content, 'utf8');
    log.appendLine(`[selectCompileCommands] wrote .clangd at ${clangdPath} → CompilationDatabase: ${rel}`);
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

            const items: vscode.QuickPickItem[] = found.map(f => ({
                label: path.relative(workspaceRoot, f).replace(/\\/g, '/'),
                detail: f,
            }));

            items.push({ label: '$(folder-opened) Browse…', detail: 'Pick a compile_commands.json manually' });

            if (items.length === 0) {
                vscode.window.showWarningMessage('No compile_commands.json found in workspace.');
                return;
            }

            const picked = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select compile_commands.json to use with clangd',
                title: 'Compile Commands',
            });
            if (!picked) { return; }

            let filePath: string;
            if (picked.label.startsWith('$(folder-opened)')) {
                const uri = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    filters: { 'Compile Commands': ['json'] },
                    title: 'Select compile_commands.json',
                });
                if (!uri || uri.length === 0) { return; }
                filePath = uri[0].fsPath;
            } else {
                filePath = picked.detail!;
            }

            const dir = path.dirname(filePath);

            // Save to extension settings
            const cfg = vscode.workspace.getConfiguration(NS);
            await cfg.update('tools.compileCommandsPath', filePath, vscode.ConfigurationTarget.Workspace);

            // Write .clangd at workspace root
            writeClangdConfig(workspaceRoot, dir);

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
