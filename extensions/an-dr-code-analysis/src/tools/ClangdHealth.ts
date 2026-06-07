import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ToolStatus, ToolGroup } from '../webview/messages';

const GROUP: ToolGroup = 'c-cpp';

export class ClangdHealth {
    static check(): ToolStatus {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return { name: 'clangd', state: 'warn', group: GROUP, detail: 'no workspace open' };
        }

        const root = folders[0].uri.fsPath;
        const compileCommandsPath = path.join(root, 'compile_commands.json');

        if (!fs.existsSync(compileCommandsPath)) {
            return { name: 'clangd', state: 'warn', group: GROUP, detail: 'compile_commands.json missing' };
        }

        const ccStat = fs.statSync(compileCommandsPath);
        for (const buildFile of ['CMakeLists.txt', 'Makefile']) {
            const buildFilePath = path.join(root, buildFile);
            if (fs.existsSync(buildFilePath)) {
                const bfStat = fs.statSync(buildFilePath);
                if (bfStat.mtimeMs > ccStat.mtimeMs) {
                    return { name: 'clangd', state: 'warn', group: GROUP, detail: 'compile_commands.json may be stale' };
                }
            }
        }

        return { name: 'clangd', state: 'ok', group: GROUP };
    }
}
