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

        // H3: validate content — empty or malformed JSON is not useful for clangd
        try {
            const raw = fs.readFileSync(compileCommandsPath, 'utf8').trim();
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed) || parsed.length === 0) {
                return { name: 'clangd', state: 'warn', group: GROUP, detail: 'compile_commands.json is empty' };
            }
        } catch {
            return { name: 'clangd', state: 'warn', group: GROUP, detail: 'compile_commands.json is malformed' };
        }

        const ccStat = fs.statSync(compileCommandsPath);
        // H2: also check meson.build and build.ninja; H5: include lowercase 'makefile'
        for (const buildFile of ['CMakeLists.txt', 'Makefile', 'makefile', 'meson.build', 'build.ninja']) {
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
