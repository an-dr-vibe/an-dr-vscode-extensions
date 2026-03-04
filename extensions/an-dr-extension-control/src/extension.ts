import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExecResult { stdout: string; stderr: string; code: number; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function exec(cmd: string, cwd: string, timeoutMs = 90_000): Promise<ExecResult> {
    return new Promise(resolve => {
        cp.exec(cmd, { cwd, timeout: timeoutMs }, (err, stdout, stderr) => {
            resolve({
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                code: err ? (err.code ?? 1) : 0,
            });
        });
    });
}

function isRepoRoot(dir: string): boolean {
    return (
        fs.existsSync(path.join(dir, 'extensions')) &&
        fs.existsSync(path.join(dir, 'install.ps1'))
    );
}

/**
 * Find the extensions repo root by:
 *  1. User config override (extensionControl.repoPath)
 *  2. Resolve NTFS junction / symlink from ~/.vscode/extensions/an-dr-*
 *  3. Well-known fallback: ~/.vscode-an-dr
 */
function findRepoRoot(config: vscode.WorkspaceConfiguration): string | undefined {
    // 1. Config override
    const configPath = config.get<string>('repoPath', '').trim();
    if (configPath && isRepoRoot(configPath)) {
        return configPath;
    }

    // 2. Resolve via linked extensions in ~/.vscode/extensions/
    const vscodeExts = path.join(os.homedir(), '.vscode', 'extensions');
    if (fs.existsSync(vscodeExts)) {
        try {
            for (const entry of fs.readdirSync(vscodeExts)) {
                if (!entry.startsWith('an-dr-')) { continue; }
                const linkPath = path.join(vscodeExts, entry);
                try {
                    // realpathSync resolves both symlinks (Linux/Mac) and
                    // NTFS junctions (Windows) to their real targets.
                    const realPath = fs.realpathSync(linkPath);
                    if (realPath !== linkPath) {
                        // realPath: .../extensions/<name> → parent: .../extensions → parent: repo root
                        const candidate = path.dirname(path.dirname(realPath));
                        if (isRepoRoot(candidate)) { return candidate; }
                    }
                } catch { /* broken link — skip */ }
            }
        } catch { /* can't read dir — skip */ }
    }

    // 3. Fallback to well-known path
    const known = path.join(os.homedir(), '.vscode-an-dr');
    if (isRepoRoot(known)) { return known; }

    return undefined;
}

function requireRepo(config: vscode.WorkspaceConfiguration): string | undefined {
    const root = findRepoRoot(config);
    if (!root) {
        vscode.window.showErrorMessage(
            'Extension Control: repo not found. Set extensionControl.repoPath in settings.',
            'Open Settings'
        ).then(choice => {
            if (choice === 'Open Settings') {
                vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    'extensionControl.repoPath'
                );
            }
        });
    }
    return root;
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function pullAndReload(config: vscode.WorkspaceConfiguration): Promise<void> {
    const root = requireRepo(config);
    if (!root) { return; }

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Extension Control', cancellable: false },
        async progress => {
            progress.report({ message: 'Pulling from remote…' });
            const pull = await exec('git pull', root);

            if (pull.code !== 0) {
                vscode.window.showErrorMessage(`git pull failed:\n${pull.stderr || pull.stdout}`);
                return;
            }

            if (pull.stdout.toLowerCase().includes('already up to date')) {
                vscode.window.showInformationMessage('Extensions are already up to date.');
                return;
            }

            progress.report({ message: 'Rebuilding extensions…' });
            const installScript = path.join(root, 'install.ps1');
            const build = await exec(`pwsh -File "${installScript}"`, root, 180_000);

            if (build.code !== 0) {
                vscode.window.showErrorMessage(
                    `Extension Control: build failed.\n${build.stderr || build.stdout}`
                );
                return;
            }

            const choice = await vscode.window.showInformationMessage(
                'Extensions updated. Reload window to activate?',
                'Reload Now',
                'Later'
            );
            if (choice === 'Reload Now') {
                vscode.commands.executeCommand('workbench.action.reloadWindow');
            }
        }
    );
}

async function openRepo(config: vscode.WorkspaceConfiguration): Promise<void> {
    const root = requireRepo(config);
    if (!root) { return; }
    await vscode.commands.executeCommand(
        'vscode.openFolder',
        vscode.Uri.file(root),
        { forceNewWindow: true }
    );
}

async function rebuild(config: vscode.WorkspaceConfiguration): Promise<void> {
    const root = requireRepo(config);
    if (!root) { return; }
    const term = vscode.window.createTerminal({ name: 'an-dr: Rebuild Extensions' });
    term.show();
    const installScript = path.join(root, 'install.ps1');
    term.sendText(`pwsh -File "${installScript}"`);
}

async function checkUpdates(config: vscode.WorkspaceConfiguration): Promise<void> {
    const root = requireRepo(config);
    if (!root) { return; }

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Extension Control', cancellable: false },
        async progress => {
            progress.report({ message: 'Fetching remote…' });
            const fetch = await exec('git fetch', root);

            if (fetch.code !== 0) {
                vscode.window.showErrorMessage(`git fetch failed:\n${fetch.stderr}`);
                return;
            }

            const status = await exec('git status -b --short', root);
            const behind = status.stdout.match(/behind (\d+)/);
            const ahead  = status.stdout.match(/ahead (\d+)/);

            if (behind) {
                const n = behind[1];
                const choice = await vscode.window.showInformationMessage(
                    `${n} new commit(s) available. Pull and reload?`,
                    'Pull & Reload',
                    'Later'
                );
                if (choice === 'Pull & Reload') {
                    await pullAndReload(config);
                }
            } else if (ahead) {
                vscode.window.showInformationMessage(
                    `Extensions repo is ${ahead[1]} commit(s) ahead of remote.`
                );
            } else {
                vscode.window.showInformationMessage('Extensions are up to date.');
            }
        }
    );
}

async function showRepoPath(config: vscode.WorkspaceConfiguration): Promise<void> {
    const root = findRepoRoot(config);
    if (root) {
        const choice = await vscode.window.showInformationMessage(
            `Extensions repo: ${root}`,
            'Open in New Window',
            'Copy Path'
        );
        if (choice === 'Open in New Window') { await openRepo(config); }
        if (choice === 'Copy Path') { await vscode.env.clipboard.writeText(root); }
    } else {
        vscode.window.showWarningMessage(
            'Extensions repo not found. Set extensionControl.repoPath.',
            'Open Settings'
        ).then(c => {
            if (c === 'Open Settings') {
                vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    'extensionControl.repoPath'
                );
            }
        });
    }
}

// ── Activate ──────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    const cfg = (): vscode.WorkspaceConfiguration =>
        vscode.workspace.getConfiguration('extensionControl');

    const cmds: Array<[string, () => Promise<void>]> = [
        ['an-dr-extension-control.pullAndReload', () => pullAndReload(cfg())],
        ['an-dr-extension-control.openRepo',      () => openRepo(cfg())],
        ['an-dr-extension-control.rebuild',       () => rebuild(cfg())],
        ['an-dr-extension-control.checkUpdates',  () => checkUpdates(cfg())],
        ['an-dr-extension-control.showRepoPath',  () => showRepoPath(cfg())],
    ];

    for (const [id, fn] of cmds) {
        context.subscriptions.push(
            vscode.commands.registerCommand(id, () =>
                fn().catch((e: unknown) => {
                    const msg = e instanceof Error ? e.message : String(e);
                    vscode.window.showErrorMessage(`Extension Control: ${msg}`);
                })
            )
        );
    }
}

export function deactivate(): void {}
