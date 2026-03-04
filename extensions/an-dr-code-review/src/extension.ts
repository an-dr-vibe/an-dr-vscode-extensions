import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

// ── Data model ─────────────────────────────────────────────────────────────────

interface StoredComment {
    id: string;
    author?: string;
    body: string;
    timestamp: string;
}

interface StoredThread {
    id: string;
    file: string;
    line: number;
    endLine: number;
    resolved: boolean;
    comments: StoredComment[];
}

interface ReviewData {
    version: number;
    threads: StoredThread[];
}

// ── ReviewComment ──────────────────────────────────────────────────────────────

class ReviewComment implements vscode.Comment {
    id: string;
    body: vscode.MarkdownString;
    mode = vscode.CommentMode.Preview;
    author: vscode.CommentAuthorInformation;
    timestamp: Date;
    contextValue = 'reviewComment';

    constructor(stored: StoredComment) {
        this.id = stored.id;
        this.body = new vscode.MarkdownString(stored.body);
        this.author = { name: stored.author ?? '' };
        this.timestamp = new Date(stored.timestamp);
    }
}

// ── Storage — vscode.workspace.fs works for both local and remote workspaces ───

function getDataFileUri(): vscode.Uri | null {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) return null;
    const cfg = vscode.workspace.getConfiguration('codeReview');
    return vscode.Uri.joinPath(root, cfg.get<string>('dataFile', '.code-review.json'));
}

async function loadData(): Promise<ReviewData> {
    const uri = getDataFileUri();
    if (!uri) return { version: 1, threads: [] };
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        return JSON.parse(Buffer.from(bytes).toString('utf8')) as ReviewData;
    } catch {
        return { version: 1, threads: [] };
    }
}

async function saveData(data: ReviewData): Promise<void> {
    const uri = getDataFileUri();
    if (!uri) return;
    await vscode.workspace.fs.writeFile(
        uri, Buffer.from(JSON.stringify(data, null, 2), 'utf8'),
    );
}

// ── Git helpers ────────────────────────────────────────────────────────────────

/** Returns a local filesystem path for running git commands.
 *  - Dev Containers: uses LOCAL_WORKSPACE_FOLDER (host-side path).
 *  - Local workspaces: uses uri.fsPath.
 *  - True remote (SSH etc.): returns null; git features degrade gracefully. */
function getGitCwd(): string | null {
    const local = process.env.LOCAL_WORKSPACE_FOLDER;
    if (local) return local;
    const uri = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (uri?.scheme === 'file') return uri.fsPath;
    return null;
}

function gitExec(cmd: string): string {
    const cwd = getGitCwd();
    if (!cwd) return '';
    try {
        return execSync(cmd, {
            cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    } catch { return ''; }
}

function getAuthor(): string {
    const cfg = vscode.workspace.getConfiguration('codeReview');
    const val = cfg.get<string>('author', '').trim();
    if (val) return val;
    const name = gitExec('git config user.name');
    if (name) return name;
    return process.env.USER ?? process.env.USERNAME ?? 'unknown';
}

/** Resolve symlinks in a workspace-relative path so the URL points to the real
 *  file rather than the symlink.  Falls back to the original path if the real
 *  path escapes the workspace root or cannot be resolved. */
function resolveSymlink(relFile: string): string {
    const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!wsRoot) return relFile;
    try {
        const realAbs = fs.realpathSync(path.join(wsRoot, relFile));
        const resolved = path.relative(wsRoot, realAbs).replace(/\\/g, '/');
        return resolved.startsWith('..') ? relFile : resolved;
    } catch {
        return relFile;
    }
}

function buildFileUrl(file: string, startLine: number, endLine: number): string | null {
    const remote = gitExec('git remote get-url origin');
    if (!remote) return null;

    let base: string;
    const ssh = remote.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
    if (ssh) {
        base = `https://${ssh[1]}/${ssh[2]}`;
    } else {
        const https = remote.match(/^https?:\/\/(?:[^@]+@)?(.+?)(?:\.git)?$/);
        if (!https) return null;
        base = `https://${https[1]}`;
    }

    const branch = gitExec('git rev-parse --abbrev-ref HEAD') || 'main';
    // GitLab uses #L1-5, GitHub uses #L1-L5
    const isGitLab = base.includes('gitlab');
    const anchor = isGitLab
        ? `#L${startLine + 1}-${endLine + 1}`
        : `#L${startLine + 1}-L${endLine + 1}`;
    return `${base}/blob/${branch}/${resolveSymlink(file)}${anchor}`;
}

// ── Relative file path from workspace URI ──────────────────────────────────────

function relativeFilePath(rootUri: vscode.Uri, fileUri: vscode.Uri): string {
    const rootPrefix = rootUri.path.endsWith('/') ? rootUri.path : rootUri.path + '/';
    if (fileUri.path.startsWith(rootPrefix)) {
        return fileUri.path.slice(rootPrefix.length);
    }
    return path.basename(fileUri.path);
}

// ── Markdown export ────────────────────────────────────────────────────────────

async function exportMarkdown(data: ReviewData): Promise<void> {
    if (data.threads.length === 0) {
        vscode.window.showInformationMessage('Code Review: no comments to export.');
        return;
    }

    const byFile = new Map<string, StoredThread[]>();
    for (const t of data.threads) {
        if (!byFile.has(t.file)) byFile.set(t.file, []);
        byFile.get(t.file)!.push(t);
    }

    const lines: string[] = [
        '# Code Review', '',
        `*Exported: ${new Date().toISOString().split('T')[0]}*`, '',
    ];

    for (const [file, threads] of byFile) {
        lines.push(`## \`${file}\``, '');
        for (const t of threads.sort((a, b) => a.line - b.line)) {
            const s = t.line + 1;
            const e = t.endLine + 1;
            const lineLabel = s === e ? `Line ${s}` : `Lines ${s}–${e}`;
            const url = buildFileUrl(t.file, t.line, t.endLine);
            const linkPart = url ? ` · [View online](${url})` : '';
            const resolvedPart = t.resolved ? ' ✅' : '';
            lines.push(`### ${lineLabel}${resolvedPart}${linkPart}`, '');
            for (const c of t.comments) {
                const date = new Date(c.timestamp).toLocaleString();
                const meta = c.author ? `**${c.author}** · *${date}*` : `*${date}*`;
                lines.push(meta, '', c.body, '');
            }
            lines.push('---', '');
        }
    }

    const rootUri = vscode.workspace.workspaceFolders![0].uri;
    const outUri = vscode.Uri.joinPath(rootUri, 'code-review.md');
    await vscode.workspace.fs.writeFile(outUri, Buffer.from(lines.join('\n'), 'utf8'));
    const doc = await vscode.workspace.openTextDocument(outUri);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage('Code review exported to code-review.md');
}

// ── Jira export ────────────────────────────────────────────────────────────────

async function exportJira(data: ReviewData): Promise<void> {
    if (data.threads.length === 0) {
        vscode.window.showInformationMessage('Code Review: no comments to export.');
        return;
    }

    const byFile = new Map<string, StoredThread[]>();
    for (const t of data.threads) {
        if (!byFile.has(t.file)) byFile.set(t.file, []);
        byFile.get(t.file)!.push(t);
    }

    const lines: string[] = [
        'h1. Code Review',
        `_Exported: ${new Date().toISOString().split('T')[0]}_`, '',
    ];

    for (const [file, threads] of byFile) {
        lines.push(`h2. {{${file}}}`, '');
        for (const t of threads.sort((a, b) => a.line - b.line)) {
            const s = t.line + 1;
            const e = t.endLine + 1;
            const lineLabel = s === e ? `Line ${s}` : `Lines ${s}-${e}`;
            const url = buildFileUrl(t.file, t.line, t.endLine);
            const linkPart = url ? ` | [View online|${url}]` : '';
            const resolvedPart = t.resolved ? ' (resolved)' : '';
            lines.push(`h3. ${lineLabel}${resolvedPart}${linkPart}`, '');
            for (const c of t.comments) {
                const date = new Date(c.timestamp).toLocaleString();
                const meta = c.author ? `*${c.author}* | _${date}_` : `_${date}_`;
                lines.push(meta, '', c.body, '');
            }
            lines.push('----', '');
        }
    }

    const rootUri = vscode.workspace.workspaceFolders![0].uri;
    const outUri = vscode.Uri.joinPath(rootUri, 'code-review.jira');
    await vscode.workspace.fs.writeFile(outUri, Buffer.from(lines.join('\n'), 'utf8'));
    const doc = await vscode.workspace.openTextDocument(outUri);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage('Code review exported to code-review.jira');
}

// ── Activate ───────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    const ctrl = vscode.comments.createCommentController('an-dr-code-review', 'Code Review');
    context.subscriptions.push(ctrl);

    ctrl.commentingRangeProvider = {
        provideCommentingRanges(doc) {
            return [new vscode.Range(0, 0, doc.lineCount - 1, 0)];
        },
    };

    const threadToId = new WeakMap<vscode.CommentThread, string>();
    const idToThread = new Map<string, vscode.CommentThread>();

    // ── Restore threads from JSON on startup ───────────────────────────────────

    async function restoreThreads(): Promise<void> {
        for (const t of idToThread.values()) t.dispose();
        idToThread.clear();

        const data = await loadData();
        const root = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!root) return;

        for (const stored of data.threads) {
            const uri = vscode.Uri.joinPath(root, stored.file);
            const range = new vscode.Range(stored.line, 0, stored.endLine, 0);
            const comments = stored.comments.map(c => new ReviewComment(c));
            const thread = ctrl.createCommentThread(uri, range, comments);
            thread.label = 'Code Review';
            thread.canReply = true;
            thread.contextValue = stored.resolved ? 'resolved' : 'unresolved';
            thread.collapsibleState = stored.resolved
                ? vscode.CommentThreadCollapsibleState.Collapsed
                : vscode.CommentThreadCollapsibleState.Expanded;

            threadToId.set(thread, stored.id);
            idToThread.set(stored.id, thread);
        }
    }

    restoreThreads();

    // ── Submit new comment or reply ────────────────────────────────────────────

    async function handleSubmit(reply: vscode.CommentReply): Promise<void> {
        const root = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!root) return;
        const body = reply.text.trim();
        if (!body) return;
        const range = reply.thread.range;
        if (!range) return;

        const data = await loadData();
        const relFile = relativeFilePath(root, reply.thread.uri);

        let threadId = threadToId.get(reply.thread);
        let stored = threadId ? data.threads.find(t => t.id === threadId) : undefined;

        if (!stored) {
            threadId = randomUUID();
            stored = {
                id: threadId,
                file: relFile,
                line: range.start.line,
                endLine: range.end.line,
                resolved: false,
                comments: [],
            };
            data.threads.push(stored);
            threadToId.set(reply.thread, threadId);
            idToThread.set(threadId, reply.thread);
            reply.thread.label = 'Code Review';
            reply.thread.canReply = true;
            reply.thread.contextValue = 'unresolved';
        }

        const cfg = vscode.workspace.getConfiguration('codeReview');
        const newComment: StoredComment = {
            id: randomUUID(),
            ...(cfg.get<boolean>('showAuthor', false) && { author: getAuthor() }),
            body,
            timestamp: new Date().toISOString(),
        };
        stored.comments.push(newComment);
        await saveData(data);

        reply.thread.comments = [...reply.thread.comments, new ReviewComment(newComment)];
        reply.thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    }

    // ── Delete a single comment ────────────────────────────────────────────────

    async function handleDeleteComment(comment: ReviewComment): Promise<void> {
        const data = await loadData();
        for (const stored of data.threads) {
            const idx = stored.comments.findIndex(c => c.id === comment.id);
            if (idx === -1) continue;

            stored.comments.splice(idx, 1);
            const thread = idToThread.get(stored.id);
            if (thread) {
                thread.comments = thread.comments.filter(
                    c => (c as ReviewComment).id !== comment.id,
                );
                if (thread.comments.length === 0) {
                    data.threads.splice(data.threads.indexOf(stored), 1);
                    idToThread.delete(stored.id);
                    thread.dispose();
                }
            }
            await saveData(data);
            return;
        }
    }

    // ── Resolve / Unresolve thread ─────────────────────────────────────────────

    async function setResolved(thread: vscode.CommentThread, resolved: boolean): Promise<void> {
        const threadId = threadToId.get(thread);
        if (!threadId) return;
        const data = await loadData();
        const stored = data.threads.find(t => t.id === threadId);
        if (!stored) return;
        stored.resolved = resolved;
        await saveData(data);
        thread.contextValue = resolved ? 'resolved' : 'unresolved';
        thread.collapsibleState = resolved
            ? vscode.CommentThreadCollapsibleState.Collapsed
            : vscode.CommentThreadCollapsibleState.Expanded;
    }

    // ── Delete entire thread ───────────────────────────────────────────────────

    async function handleDeleteThread(thread: vscode.CommentThread): Promise<void> {
        const threadId = threadToId.get(thread);
        if (threadId) {
            const data = await loadData();
            const idx = data.threads.findIndex(t => t.id === threadId);
            if (idx !== -1) data.threads.splice(idx, 1);
            await saveData(data);
            idToThread.delete(threadId);
        }
        thread.dispose();
    }

    // ── Register commands ──────────────────────────────────────────────────────

    context.subscriptions.push(
        vscode.commands.registerCommand('an-dr-code-review.submitComment',
            (reply: vscode.CommentReply) => handleSubmit(reply)),
        vscode.commands.registerCommand('an-dr-code-review.deleteComment',
            (comment: ReviewComment) => handleDeleteComment(comment)),
        vscode.commands.registerCommand('an-dr-code-review.resolveThread',
            (thread: vscode.CommentThread) => setResolved(thread, true)),
        vscode.commands.registerCommand('an-dr-code-review.unresolveThread',
            (thread: vscode.CommentThread) => setResolved(thread, false)),
        vscode.commands.registerCommand('an-dr-code-review.deleteThread',
            (thread: vscode.CommentThread) => handleDeleteThread(thread)),
        vscode.commands.registerCommand('an-dr-code-review.exportMarkdown',
            async () => exportMarkdown(await loadData())),
        vscode.commands.registerCommand('an-dr-code-review.exportJira',
            async () => exportJira(await loadData())),
    );
}

export function deactivate(): void { /* nothing to clean up */ }
