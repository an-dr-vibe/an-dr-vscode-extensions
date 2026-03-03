import * as vscode from 'vscode';
import * as path from 'path';
import { execSync } from 'child_process';

// ── Git helpers ───────────────────────────────────────────────────────────────

function execGit(args: string, cwd: string): string {
    try {
        return execSync(`git ${args}`, {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch {
        return '';
    }
}

function getGitRoot(filePath: string): string {
    return execGit('rev-parse --show-toplevel', path.dirname(filePath));
}

function getRemoteUrl(gitRoot: string, remoteName: string): string {
    return execGit(`remote get-url ${remoteName}`, gitRoot);
}

function getCurrentBranch(gitRoot: string): string {
    return (
        execGit('symbolic-ref --short HEAD', gitRoot) ||
        execGit('rev-parse HEAD', gitRoot)
    );
}

// ── URL building ──────────────────────────────────────────────────────────────

interface ParsedRemote {
    host: string;
    owner: string;
    repo: string;
    baseUrl: string;
}

function parseRemoteUrl(
    remoteUrl: string,
    customHostMap: Record<string, string>
): ParsedRemote | null {
    let host: string, owner: string, repo: string;

    // SSH: git@github.com:owner/repo.git
    const sshMatch = remoteUrl.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
    if (sshMatch) {
        [, host, owner, repo] = sshMatch;
    } else {
        // HTTPS: https://github.com/owner/repo.git  or  http://...
        // Also handles tokens: https://token@github.com/owner/repo
        const httpsMatch = remoteUrl.match(
            /^https?:\/\/(?:[^@]+@)?([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/
        );
        if (!httpsMatch) return null;
        [, host, owner, repo] = httpsMatch;
    }

    const baseUrl = customHostMap[host] ?? `https://${host}`;
    return { host, owner, repo, baseUrl };
}

function buildUrl(
    parsed: ParsedRemote,
    branch: string,
    filePath: string,
    startLine?: number,
    endLine?: number
): string {
    const isBitbucket = parsed.host.includes('bitbucket');
    const pathSegment = isBitbucket ? 'src' : 'blob';

    let url = `${parsed.baseUrl}/${parsed.owner}/${parsed.repo}/${pathSegment}/${branch}/${filePath}`;

    if (startLine !== undefined) {
        if (isBitbucket) {
            url += endLine && endLine !== startLine
                ? `#lines-${startLine}:${endLine}`
                : `#lines-${startLine}`;
        } else {
            // GitHub and GitLab both use #L10-L20 for ranges
            url += endLine && endLine !== startLine
                ? `#L${startLine}-L${endLine}`
                : `#L${startLine}`;
        }
    }

    return url;
}

// ── Platform presentation ─────────────────────────────────────────────────────

function getPlatformLabel(host: string): { icon: string; name: string } {
    if (host.includes('github'))    return { icon: '$(github)', name: 'GitHub' };
    if (host.includes('gitlab'))    return { icon: '$(git-branch)', name: 'GitLab' };
    if (host.includes('bitbucket')) return { icon: '$(git-commit)', name: 'Bitbucket' };
    return { icon: '$(link-external)', name: host };
}

// ── Extension state ───────────────────────────────────────────────────────────

interface RemoteInfo {
    parsed: ParsedRemote;
    gitRoot: string;
}

function resolveRemoteInfo(filePath: string, config: vscode.WorkspaceConfiguration): RemoteInfo | null {
    const gitRoot = getGitRoot(filePath);
    if (!gitRoot) return null;

    const remoteName = config.get<string>('remote', 'origin');
    const remoteUrl = getRemoteUrl(gitRoot, remoteName);
    if (!remoteUrl) return null;

    const customHostMap = config.get<Record<string, string>>('customHostMap', {});
    const parsed = parseRemoteUrl(remoteUrl, customHostMap);
    if (!parsed) return null;

    return { parsed, gitRoot };
}

// ── Core action ───────────────────────────────────────────────────────────────

async function openOrCopy(
    includeLineNumber: boolean,
    forceTarget: 'browser' | 'clipboard' | null
): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('an-dr View Online: no active editor.');
        return;
    }
    if (editor.document.isUntitled || editor.document.uri.scheme !== 'file') {
        vscode.window.showErrorMessage('an-dr View Online: file must be saved to disk.');
        return;
    }

    const config = vscode.workspace.getConfiguration('viewOnline');
    const filePath = editor.document.uri.fsPath;

    const info = resolveRemoteInfo(filePath, config);
    if (!info) {
        vscode.window.showErrorMessage(
            'an-dr View Online: could not resolve git remote. ' +
            'Check that the file is inside a git repo and the remote is reachable.'
        );
        return;
    }

    const { parsed, gitRoot } = info;
    const defaultBranch = config.get<string>('defaultBranch', 'main');
    const branch = getCurrentBranch(gitRoot) || defaultBranch;

    // Normalize to forward slashes (important on Windows)
    const relativePath = path.relative(gitRoot, filePath).replace(/\\/g, '/');

    let startLine: number | undefined;
    let endLine: number | undefined;
    if (includeLineNumber) {
        const sel = editor.selection;
        startLine = sel.start.line + 1;
        const useRange = config.get<boolean>('useSelectionRange', true);
        endLine = useRange && !sel.isEmpty ? sel.end.line + 1 : startLine;
    }

    const url = buildUrl(parsed, branch, relativePath, startLine, endLine);
    const target = forceTarget ?? config.get<string>('openTarget', 'browser');

    if (target === 'clipboard') {
        await vscode.env.clipboard.writeText(url);
        vscode.window.showInformationMessage(`Copied: ${url}`);
    } else if (target === 'browser') {
        await vscode.env.openExternal(vscode.Uri.parse(url));
    } else {
        // 'both'
        await vscode.env.clipboard.writeText(url);
        await vscode.env.openExternal(vscode.Uri.parse(url));
    }
}

// ── Status bar management ─────────────────────────────────────────────────────

function createStatusBarItem(config: vscode.WorkspaceConfiguration): vscode.StatusBarItem {
    const alignment = config.get<string>('statusBarAlignment', 'right') === 'left'
        ? vscode.StatusBarAlignment.Left
        : vscode.StatusBarAlignment.Right;
    const priority = config.get<number>('statusBarPriority', 100);
    return vscode.window.createStatusBarItem(alignment, priority);
}

function updateStatusBar(
    item: vscode.StatusBarItem,
    config: vscode.WorkspaceConfiguration
): void {
    if (!config.get<boolean>('showStatusBar', true)) {
        item.hide();
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.isUntitled || editor.document.uri.scheme !== 'file') {
        item.hide();
        return;
    }

    const info = resolveRemoteInfo(editor.document.uri.fsPath, config);
    if (!info) {
        item.hide();
        return;
    }

    const { icon, name } = getPlatformLabel(info.parsed.host);
    const includeLine = config.get<boolean>('includeLineOnClick', true);
    const line = editor.selection.active.line + 1;

    const iconOnly = config.get<boolean>('statusBarIconOnly', false);
    item.text = iconOnly ? icon : `${icon} ${name}`;
    item.tooltip = includeLine
        ? `Open line ${line} on ${name}  [click]`
        : `Open file on ${name}  [click]`;
    item.command = includeLine
        ? 'an-dr-view-online.openFileAtLine'
        : 'an-dr-view-online.openFile';
    item.show();
}

// ── Activate ──────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    const config = () => vscode.workspace.getConfiguration('viewOnline');

    let statusBar = createStatusBarItem(config());
    context.subscriptions.push(statusBar);

    const refresh = () => updateStatusBar(statusBar, config());

    context.subscriptions.push(
        vscode.commands.registerCommand('an-dr-view-online.openFile',
            () => openOrCopy(false, null)),

        vscode.commands.registerCommand('an-dr-view-online.openFileAtLine',
            () => openOrCopy(true, null)),

        vscode.commands.registerCommand('an-dr-view-online.copyUrl',
            () => openOrCopy(false, 'clipboard')),

        vscode.commands.registerCommand('an-dr-view-online.copyUrlAtLine',
            () => openOrCopy(true, 'clipboard')),

        vscode.window.onDidChangeActiveTextEditor(refresh),
        vscode.window.onDidChangeTextEditorSelection(refresh),

        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('viewOnline')) {
                // Re-create the item if alignment/priority changed (VSCode doesn't allow changing these)
                const needsRecreate =
                    e.affectsConfiguration('viewOnline.statusBarAlignment') ||
                    e.affectsConfiguration('viewOnline.statusBarPriority');

                if (needsRecreate) {
                    statusBar.dispose();
                    statusBar = createStatusBarItem(config());
                    context.subscriptions.push(statusBar);
                }
                refresh();
            }
        })
    );

    refresh();
}

export function deactivate(): void { /* nothing to clean up */ }
