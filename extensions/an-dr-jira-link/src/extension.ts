import * as vscode from 'vscode';
import { execSync } from 'child_process';

// ── Types ─────────────────────────────────────────────────────────────────────

interface JiraTicket {
    key: string;
    source: 'branch' | 'commit' | 'file';
}

// ── Git helpers ────────────────────────────────────────────────────────────────

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

function getGitRoot(cwd: string): string {
    return execGit('rev-parse --show-toplevel', cwd);
}

function getCurrentBranch(gitRoot: string): string {
    return (
        execGit('symbolic-ref --short HEAD', gitRoot) ||
        execGit('rev-parse HEAD', gitRoot)
    );
}

/** Returns the log of commits reachable from HEAD but not from mainBranch. */
function getBranchCommitMessages(gitRoot: string, mainBranch: string): string {
    // Use origin/<main> if available, else local, to avoid false negatives.
    const base =
        execGit(`rev-parse --verify origin/${mainBranch}`, gitRoot) ||
        execGit(`rev-parse --verify ${mainBranch}`, gitRoot);
    if (!base) { return ''; }
    return execGit(`log HEAD --not ${base} --format=%s%n%b`, gitRoot);
}

// ── Ticket detection ───────────────────────────────────────────────────────────

function buildTicketRegex(projects: string[]): RegExp {
    const prefix = projects.length > 0
        ? `(?:${projects.map(p => escapeRegex(p)).join('|')})`
        : '[A-Z][A-Z0-9]+';
    return new RegExp(`\\b(${prefix}-\\d+)\\b`, 'g');
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTickets(text: string, regex: RegExp): string[] {
    const found: string[] = [];
    let m: RegExpExecArray | null;
    regex.lastIndex = 0;
    while ((m = regex.exec(text)) !== null) {
        if (!found.includes(m[1])) { found.push(m[1]); }
    }
    return found;
}

/** Read only comment lines from the active document (lines starting with //, #, --, or /* ... *\/). */
function extractFileCommentText(document: vscode.TextDocument): string {
    const commentLineRe = /^\s*(?:\/\/|#|--|\/\*|\*)/;
    const lines: string[] = [];
    for (let i = 0; i < Math.min(document.lineCount, 500); i++) {
        const line = document.lineAt(i).text;
        if (commentLineRe.test(line)) { lines.push(line); }
    }
    return lines.join('\n');
}

function detectTickets(
    gitRoot: string,
    branch: string,
    mainBranch: string,
    document: vscode.TextDocument | undefined,
    ticketRegex: RegExp,
): JiraTicket[] {
    const tickets: JiraTicket[] = [];
    const seen = new Set<string>();

    function add(key: string, source: JiraTicket['source']): void {
        if (!seen.has(key)) {
            seen.add(key);
            tickets.push({ key, source });
        }
    }

    // 1. Branch name
    for (const key of extractTickets(branch, ticketRegex)) {
        add(key, 'branch');
    }

    // 2. Commits unique to this branch
    const commitLog = getBranchCommitMessages(gitRoot, mainBranch);
    for (const key of extractTickets(commitLog, ticketRegex)) {
        add(key, 'commit');
    }

    // 3. Comments in the active file
    if (document && document.uri.scheme === 'file') {
        const commentText = extractFileCommentText(document);
        for (const key of extractTickets(commentText, ticketRegex)) {
            add(key, 'file');
        }
    }

    return tickets;
}

// ── Jira URL ───────────────────────────────────────────────────────────────────

function jiraUrl(domain: string, key: string): string {
    const base = domain.replace(/\/+$/, '');
    return `${base}/browse/${key}`;
}

// ── Status bar ─────────────────────────────────────────────────────────────────

function sourceIcon(source: JiraTicket['source']): string {
    switch (source) {
        case 'branch': return '$(git-branch)';
        case 'commit': return '$(git-commit)';
        case 'file':   return '$(file-code)';
    }
}

function sourceLabel(source: JiraTicket['source']): string {
    switch (source) {
        case 'branch': return 'branch name';
        case 'commit': return 'branch commit';
        case 'file':   return 'file comment';
    }
}

// ── Extension state ────────────────────────────────────────────────────────────

let statusBar: vscode.StatusBarItem;
let lastTickets: JiraTicket[] = [];
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

function cfg(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('jiraLink');
}

function getGitRootForContext(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return undefined; }

    // Prefer folder containing the active editor
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.uri.scheme === 'file') {
        const editorRoot = getGitRoot(editor.document.uri.fsPath.replace(/[^/\\]+$/, ''));
        if (editorRoot) { return editorRoot; }
    }

    return getGitRoot(folders[0].uri.fsPath);
}

function refresh(): void {
    const config = cfg();
    const domain = config.get<string>('domain', '').trim();
    const projects = config.get<string[]>('projects', []).filter(Boolean);
    const mainBranch = config.get<string>('mainBranch', 'main');

    if (!domain) {
        statusBar.text = '$(link) Jira';
        statusBar.tooltip = 'Jira Link: set jiraLink.domain in settings to enable.';
        statusBar.command = undefined;
        statusBar.show();
        return;
    }

    const gitRoot = getGitRootForContext();
    if (!gitRoot) {
        statusBar.hide();
        return;
    }

    const branch = getCurrentBranch(gitRoot);
    if (!branch) {
        statusBar.hide();
        return;
    }

    const ticketRegex = buildTicketRegex(projects);
    const editor = vscode.window.activeTextEditor;
    const document = editor?.document;

    lastTickets = detectTickets(gitRoot, branch, mainBranch, document, ticketRegex);

    if (lastTickets.length === 0) {
        statusBar.hide();
        return;
    }

    if (lastTickets.length === 1) {
        const t = lastTickets[0];
        statusBar.text = `${sourceIcon(t.source)} ${t.key}`;
        statusBar.tooltip = `Open ${t.key} in Jira  (found in ${sourceLabel(t.source)})`;
    } else {
        const keys = lastTickets.map(t => t.key).join(', ');
        statusBar.text = `$(link) ${lastTickets.length} Jira tickets`;
        statusBar.tooltip = `Jira tickets detected: ${keys}\nClick to choose one.`;
    }

    statusBar.command = 'an-dr-jira-link.open';
    statusBar.show();
}

/** Debounce refreshes triggered by rapid editor/selection events. */
function scheduleRefresh(delayMs = 300): void {
    if (refreshTimer !== undefined) { clearTimeout(refreshTimer); }
    refreshTimer = setTimeout(() => { refresh(); refreshTimer = undefined; }, delayMs);
}

// ── Command: open ──────────────────────────────────────────────────────────────

async function openTicket(): Promise<void> {
    const config = cfg();
    const domain = config.get<string>('domain', '').trim();

    if (!domain) {
        const choice = await vscode.window.showWarningMessage(
            'Jira Link: jiraLink.domain is not set.',
            'Open Settings'
        );
        if (choice === 'Open Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'jiraLink.domain');
        }
        return;
    }

    if (lastTickets.length === 0) {
        vscode.window.showInformationMessage('Jira Link: no Jira tickets detected in branch, commits, or file comments.');
        return;
    }

    let ticket: JiraTicket;

    if (lastTickets.length === 1) {
        ticket = lastTickets[0];
    } else {
        const items: vscode.QuickPickItem[] = lastTickets.map(t => ({
            label: `${sourceIcon(t.source)} ${t.key}`,
            description: `found in ${sourceLabel(t.source)}`,
        }));

        const picked = await vscode.window.showQuickPick(items, {
            title: 'Open Jira Ticket',
            placeHolder: 'Select a ticket to open…',
        });
        if (!picked) { return; }

        const key = picked.label.split(' ').pop()!;
        ticket = lastTickets.find(t => t.key === key)!;
    }

    const url = jiraUrl(domain, ticket.key);
    await vscode.env.openExternal(vscode.Uri.parse(url));
}

// ── Activate ───────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    const config = cfg();
    const alignment = config.get<string>('statusBarAlignment', 'left') === 'right'
        ? vscode.StatusBarAlignment.Right
        : vscode.StatusBarAlignment.Left;
    const priority = config.get<number>('statusBarPriority', 10);

    statusBar = vscode.window.createStatusBarItem(alignment, priority);
    context.subscriptions.push(statusBar);

    context.subscriptions.push(
        vscode.commands.registerCommand('an-dr-jira-link.open', () =>
            openTicket().catch((e: unknown) => {
                const msg = e instanceof Error ? e.message : String(e);
                vscode.window.showErrorMessage(`Jira Link: ${msg}`);
            })
        ),
        vscode.commands.registerCommand('an-dr-jira-link.refresh', () => refresh()),

        vscode.window.onDidChangeActiveTextEditor(() => scheduleRefresh()),
        vscode.window.onDidChangeTextEditorSelection(() => scheduleRefresh(600)),

        vscode.workspace.onDidSaveTextDocument(() => scheduleRefresh()),

        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('jiraLink')) { refresh(); }
        }),
    );

    refresh();
}

export function deactivate(): void {
    if (refreshTimer !== undefined) { clearTimeout(refreshTimer); }
}
