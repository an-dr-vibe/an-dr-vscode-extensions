import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RecoveryAction } from '../webview/messages';
import { log } from '../logger';

export type ClangdIssue =
    | 'NO_COMPILE_COMMANDS'
    | 'STALE_COMPILE_COMMANDS'
    | 'CROSS_COMPILE';

const NS = 'an-dr-code-analysis';

// Cross-compile toolchain prefixes to detect in compile_commands.json
const CROSS_COMPILE_MARKERS = [
    'arm-none-eabi', 'arm-linux-gnueabi', 'arm-linux-gnueabihf',
    'riscv32', 'riscv64', 'riscv-none-elf',
    'aarch64-linux-gnu', 'aarch64-none-elf',
    'xtensa', 'mipsel', 'mips-',
];

export function detectCrossCompile(compileCommandsPath: string): string | null {
    try {
        const raw = fs.readFileSync(compileCommandsPath, 'utf8');
        for (const marker of CROSS_COMPILE_MARKERS) {
            if (raw.includes(marker)) { return marker; }
        }
    } catch { /* unreadable */ }
    return null;
}

export function recoveryActionsFor(issue: ClangdIssue): RecoveryAction[] {
    switch (issue) {
        case 'NO_COMPILE_COMMANDS':
            return [
                {
                    label: '⚙ CMake: generate compile_commands.json',
                    command: NS + '.recovery.cmakeGenerate',
                },
                {
                    label: '⚙ bear: wrap your build command',
                    command: NS + '.recovery.bearWrap',
                },
                {
                    label: '📂 Select existing compile_commands.json',
                    command: NS + '.selectCompileCommands',
                },
            ];

        case 'STALE_COMPILE_COMMANDS':
            return [
                {
                    label: '🔄 Regenerate via CMake',
                    command: NS + '.recovery.cmakeGenerate',
                },
                {
                    label: '📂 Select a different compile_commands.json',
                    command: NS + '.selectCompileCommands',
                },
            ];

        case 'CROSS_COMPILE':
            return [
                {
                    label: '✏ Generate .clangd for cross-compilation',
                    command: NS + '.recovery.generateClangdConfig',
                },
            ];
    }
}

// ── Command implementations ───────────────────────────────────────────────────

function workspaceRoot(): string | null {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}

export async function runCmakeGenerate(): Promise<void> {
    const root = workspaceRoot();
    if (!root) { return; }

    const buildDir = await vscode.window.showInputBox({
        title: 'CMake build directory',
        value: path.join(root, 'build').replace(/\\/g, '/'),
        prompt: 'Where should CMake place build files?',
    });
    if (!buildDir) { return; }

    const term = vscode.window.createTerminal({ name: 'CMake: generate compile_commands' });
    term.show();
    term.sendText(
        `cmake -S "${root.replace(/\\/g, '/')}" -B "${buildDir}" -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`
    );
    vscode.window.showInformationMessage(
        'After CMake finishes, run "Setup compile_commands.json" to point clangd at the new file.',
        'Setup compile_commands.json'
    ).then(choice => {
        if (choice) {
            void vscode.commands.executeCommand(NS + '.selectCompileCommands');
        }
    });
}

export async function runBearWrap(): Promise<void> {
    const root = workspaceRoot();
    if (!root) { return; }

    const buildCmd = await vscode.window.showInputBox({
        title: 'bear: build command to wrap',
        value: 'make',
        prompt: 'Enter your build command (e.g. make, ninja, cmake --build .)',
    });
    if (!buildCmd) { return; }

    const term = vscode.window.createTerminal({ name: 'bear: wrap build' });
    term.show();
    term.sendText(`cd "${root.replace(/\\/g, '/')}" && bear -- ${buildCmd}`);
    vscode.window.showInformationMessage(
        'After bear finishes, run "Setup compile_commands.json" to point clangd at the new file.',
        'Setup compile_commands.json'
    ).then(choice => {
        if (choice) {
            void vscode.commands.executeCommand(NS + '.selectCompileCommands');
        }
    });
}

export async function generateClangdConfig(crossMarker?: string): Promise<void> {
    const root = workspaceRoot();
    if (!root) { return; }

    const cfg = vscode.workspace.getConfiguration(NS);
    const ccPath = cfg.get<string>('tools.compileCommandsPath')?.trim() || null;
    const ccDir = ccPath ? path.dirname(ccPath) : root;

    const marker = crossMarker ?? 'arm-none-eabi';
    const clangdPath = path.join(root, '.clangd');

    const choice = await vscode.window.showWarningMessage(
        `Generate .clangd for cross-compilation (${marker})?` +
        (fs.existsSync(clangdPath) ? ' This will overwrite the existing .clangd file.' : ''),
        'Generate', 'Cancel'
    );
    if (choice !== 'Generate') { return; }

    const rel = path.relative(root, ccDir).replace(/\\/g, '/') || '.';
    const content = [
        `CompileFlags:`,
        `  CompilationDatabase: ${rel}`,
        `  Add: [--target=${marker}, --sysroot=/dev/null]`,
        `  Remove: [-m*, --specs=*]`,
    ].join('\n') + '\n';

    try {
        fs.writeFileSync(clangdPath, content, 'utf8');
        log.appendLine(`[RecoveryActions] wrote .clangd at ${clangdPath}`);
        const reload = await vscode.window.showInformationMessage(
            '.clangd written. Restart clangd to apply.', 'Restart clangd'
        );
        if (reload) {
            await vscode.commands.executeCommand('clangd.restart').then(
                () => {},
                () => { void vscode.commands.executeCommand('workbench.action.reloadWindow'); }
            );
        }
    } catch (e) {
        vscode.window.showErrorMessage(`Failed to write .clangd: ${e}`);
    }
}
