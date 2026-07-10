import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExecResult { stdout: string; stderr: string; code: number; }
interface FetchCompareResult { code: number; stderr: string; behind?: string; ahead?: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

let outputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('Sync');
    }
    return outputChannel;
}

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

function execWithOutput(cmd: string, cwd: string, timeoutMs = 180_000): Promise<ExecResult> {
    const channel = getOutputChannel();
    channel.show(true);
    channel.appendLine(`> ${cmd}`);

    return new Promise(resolve => {
        const proc = cp.spawn(cmd, [], { cwd, shell: true });
        const stdout: string[] = [];
        const stderr: string[] = [];

        proc.stdout.on('data', (data: Buffer) => {
            const text = data.toString();
            stdout.push(text);
            channel.append(text);
        });
        proc.stderr.on('data', (data: Buffer) => {
            const text = data.toString();
            stderr.push(text);
            channel.append(text);
        });

        const timer = setTimeout(() => {
            proc.kill();
            channel.appendLine('[timed out]');
            resolve({ stdout: stdout.join('').trim(), stderr: stderr.join('').trim(), code: 1 });
        }, timeoutMs);

        proc.on('close', code => {
            clearTimeout(timer);
            channel.appendLine(`[exit ${code ?? 0}]`);
            resolve({ stdout: stdout.join('').trim(), stderr: stderr.join('').trim(), code: code ?? 0 });
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
 *  1. User config override (sync.repoPath)
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
            'Sync: repo not found. Set sync.repoPath in settings.',
            'Open Settings'
        ).then(choice => {
            if (choice === 'Open Settings') {
                vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    'sync.repoPath'
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
        { location: vscode.ProgressLocation.Notification, title: 'Sync', cancellable: false },
        async progress => {
            // Stash uncommitted changes if any
            const status = await exec('git status --porcelain', root);
            let stashed = false;
            if (status.stdout) {
                progress.report({ message: 'Stashing local changes…' });
                const stash = await exec('git stash', root);
                if (stash.code !== 0) {
                    vscode.window.showErrorMessage(`git stash failed:\n${stash.stderr || stash.stdout}`);
                    return;
                }
                stashed = true;
            }

            progress.report({ message: 'Pulling from remote…' });
            const pull = await exec('git pull', root);

            if (pull.code !== 0) {
                if (stashed) { await exec('git stash pop', root); }
                vscode.window.showErrorMessage(`git pull failed:\n${pull.stderr || pull.stdout}`);
                return;
            }

            if (pull.stdout.toLowerCase().includes('already up to date')) {
                if (stashed) { await exec('git stash pop', root); }
                vscode.window.showInformationMessage('Extensions are already up to date.');
                return;
            }

            if (stashed) {
                progress.report({ message: 'Restoring local changes…' });
                const pop = await exec('git stash pop', root);
                if (pop.code !== 0) {
                    vscode.window.showWarningMessage(
                        'Extensions updated, but your local changes could not be re-applied automatically. ' +
                        'Your stash is still saved — run `git stash pop` and resolve conflicts manually when ready.'
                    );
                    return;
                }
            }

            progress.report({ message: 'Rebuilding extensions… (see Sync output)' });
            const installScript = path.join(root, 'install.ps1');
            const build = await execWithOutput(`pwsh -File "${installScript}"`, root, 180_000);

            if (build.code !== 0) {
                vscode.window.showErrorMessage(
                    `Sync: build failed.\n${build.stderr || build.stdout}`
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

async function forceRebuild(config: vscode.WorkspaceConfiguration): Promise<void> {
    const root = requireRepo(config);
    if (!root) { return; }
    const term = vscode.window.createTerminal({ name: 'an-dr: Force Rebuild Extensions' });
    term.show();
    const installScript = path.join(root, 'install.ps1');
    term.sendText(`pwsh -File "${installScript}" -Force`);
}

/** Runs `git fetch` and compares against upstream. Never throws. */
async function fetchAndCompare(root: string): Promise<FetchCompareResult> {
    const fetch = await exec('git fetch', root);
    if (fetch.code !== 0) {
        return { code: fetch.code, stderr: fetch.stderr };
    }

    const status = await exec('git status -b --short', root);
    const behind = status.stdout.match(/behind (\d+)/);
    const ahead = status.stdout.match(/ahead (\d+)/);
    return { code: 0, stderr: '', behind: behind?.[1], ahead: ahead?.[1] };
}

async function checkUpdates(config: vscode.WorkspaceConfiguration): Promise<void> {
    const root = requireRepo(config);
    if (!root) { return; }

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Sync', cancellable: false },
        async progress => {
            progress.report({ message: 'Fetching remote…' });
            const result = await fetchAndCompare(root);

            if (result.code !== 0) {
                vscode.window.showErrorMessage(`git fetch failed:\n${result.stderr}`);
                return;
            }

            if (result.behind) {
                const choice = await vscode.window.showInformationMessage(
                    `${result.behind} new commit(s) available. Pull and reload?`,
                    'Pull & Reload',
                    'Later'
                );
                if (choice === 'Pull & Reload') {
                    await pullAndReload(config);
                }
            } else if (result.ahead) {
                vscode.window.showInformationMessage(
                    `Extensions repo is ${result.ahead} commit(s) ahead of remote.`
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
            'Extensions repo not found. Set sync.repoPath.',
            'Open Settings'
        ).then(c => {
            if (c === 'Open Settings') {
                vscode.commands.executeCommand(
                    'workbench.action.openSettings',
                    'sync.repoPath'
                );
            }
        });
    }
}

// ── Auto-operations ───────────────────────────────────────────────────────────

// Fixed poll cadence for the WIP quiet-period check. Kept independent of the
// quiet-period threshold itself so a commit lands shortly after the repo goes
// quiet, instead of waiting for the next multi-minute threshold tick.
const WIP_CHECK_POLL_MS = 60_000;

// Delay before the startup update check fires, so it doesn't compete with
// other extensions activating and doesn't pop a notification the instant the
// window appears.
const STARTUP_CHECK_DELAY_MS = 5_000;

const LAST_UPDATE_CHECK_KEY = 'sync.lastUpdateCheckAt';

/** Resolves a `git status --porcelain` path entry, unwrapping rename arrows and quotes. */
function parsePorcelainPath(line: string): string {
    let filePath = line.slice(3);
    const arrow = filePath.indexOf(' -> ');
    if (arrow !== -1) { filePath = filePath.slice(arrow + 4); }
    return filePath.trim().replace(/^"|"$/g, '');
}

async function autoWipCommit(root: string, quietMinutes: number): Promise<void> {
    const status = await exec('git status --porcelain', root);
    if (status.code !== 0 || !status.stdout) { return; }

    // Newest mtime among changed files stands in for "how recently was this
    // repo touched" — commit only once every changed file has been quiet for
    // the configured threshold. Files that fail to stat (e.g. deleted) are
    // skipped rather than blocking the commit indefinitely.
    let newestMtime = 0;
    for (const line of status.stdout.split('\n').filter(Boolean)) {
        try {
            const mtime = fs.statSync(path.join(root, parsePorcelainPath(line))).mtimeMs;
            if (mtime > newestMtime) { newestMtime = mtime; }
        } catch { /* deleted or inaccessible — doesn't block the quiet check */ }
    }

    if (newestMtime > 0 && Date.now() - newestMtime < quietMinutes * 60_000) {
        return; // still being actively modified — skip this tick
    }

    await exec('git add -A', root);
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const commit = await exec(`git commit -m "WIP [${ts}]"`, root);
    if (commit.code !== 0) {
        vscode.window.showErrorMessage(
            `Sync: WIP commit failed.\n${commit.stderr || commit.stdout}`
        );
    }
}

async function autoPush(root: string): Promise<void> {
    const status = await exec('git status -b --short', root);
    if (status.code !== 0 || !status.stdout.includes('ahead')) { return; }
    const push = await exec('git push', root);
    if (push.code !== 0) {
        vscode.window.showErrorMessage(
            `Sync: auto-push failed.\n${push.stderr || push.stdout}`
        );
    }
}

/**
 * Mirrors `checkUpdates`, but silent unless there's something to act on, and
 * throttled via globalState — each VS Code window activates this extension
 * independently, so without throttling a multi-window session (or repeated
 * reloads) would re-fetch, and potentially re-prompt, once per window/reload.
 * A failed fetch does not update the timestamp, so the next launch retries
 * instead of waiting out the throttle window on a transient failure (e.g. no
 * network). If no repo root can be resolved, this exits silently rather than
 * showing the "repo not found" error the manual commands show — an
 * unconfigured/undetected repo shouldn't nag on every launch.
 */
async function autoCheckUpdatesOnStartup(
    context: vscode.ExtensionContext,
    config: vscode.WorkspaceConfiguration
): Promise<void> {
    if (!config.get<boolean>('checkUpdatesOnStartup', true)) { return; }

    const throttleHours = config.get<number>('checkUpdatesOnStartupThrottleHours', 4);
    const lastCheck = context.globalState.get<number>(LAST_UPDATE_CHECK_KEY, 0);
    if (throttleHours > 0 && Date.now() - lastCheck < throttleHours * 3_600_000) { return; }

    const root = findRepoRoot(config);
    if (!root) { return; }

    const result = await fetchAndCompare(root);
    if (result.code !== 0) { return; }

    await context.globalState.update(LAST_UPDATE_CHECK_KEY, Date.now());

    if (result.behind) {
        const choice = await vscode.window.showInformationMessage(
            `${result.behind} new commit(s) available. Pull and reload?`,
            'Pull & Reload',
            'Later'
        );
        if (choice === 'Pull & Reload') {
            await pullAndReload(config);
        }
    }
}

function startAutoTimers(
    context: vscode.ExtensionContext,
    getConfig: () => vscode.WorkspaceConfiguration
): void {
    let wipTimer: ReturnType<typeof setInterval> | undefined;
    let pushTimer: ReturnType<typeof setInterval> | undefined;

    function restart(): void {
        clearInterval(wipTimer);
        clearInterval(pushTimer);
        wipTimer = undefined;
        pushTimer = undefined;

        const cfg = getConfig();
        const root = findRepoRoot(cfg);
        if (!root) { return; }

        if (cfg.get<boolean>('autoWipCommit', true)) {
            const quietMinutes = cfg.get<number>('autoWipCommitIntervalMinutes', 30);
            wipTimer = setInterval(() => { void autoWipCommit(root, quietMinutes); }, WIP_CHECK_POLL_MS);
        }

        if (cfg.get<boolean>('autoPush', true)) {
            const ms = cfg.get<number>('autoPushIntervalMinutes', 30) * 60_000;
            pushTimer = setInterval(() => { void autoPush(root); }, ms);
        }
    }

    restart();

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('sync')) { restart(); }
        }),
        { dispose: () => { clearInterval(wipTimer); clearInterval(pushTimer); } }
    );
}

// ── Activate ──────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    const cfg = (): vscode.WorkspaceConfiguration =>
        vscode.workspace.getConfiguration('sync');

    const cmds: Array<[string, () => Promise<void>]> = [
        ['an-dr-sync.pullAndReload', () => pullAndReload(cfg())],
        ['an-dr-sync.openRepo',      () => openRepo(cfg())],
        ['an-dr-sync.rebuild',       () => rebuild(cfg())],
        ['an-dr-sync.forceRebuild',  () => forceRebuild(cfg())],
        ['an-dr-sync.checkUpdates',  () => checkUpdates(cfg())],
        ['an-dr-sync.showRepoPath',  () => showRepoPath(cfg())],
    ];

    for (const [id, fn] of cmds) {
        context.subscriptions.push(
            vscode.commands.registerCommand(id, () =>
                fn().catch((e: unknown) => {
                    const msg = e instanceof Error ? e.message : String(e);
                    vscode.window.showErrorMessage(`Sync: ${msg}`);
                })
            )
        );
    }

    startAutoTimers(context, cfg);

    const startupCheckTimer = setTimeout(() => {
        void autoCheckUpdatesOnStartup(context, cfg());
    }, STARTUP_CHECK_DELAY_MS);
    context.subscriptions.push({ dispose: () => clearTimeout(startupCheckTimer) });
}

export function deactivate(): void {}
