import * as vscode from 'vscode';

export interface StoredComment {
    id: string;
    author?: string;
    body: string;
    timestamp: string;
}

export interface StoredThread {
    id: string;
    file: string;
    line: number;
    endLine: number;
    resolved: boolean;
    comments: StoredComment[];
}

export interface ReviewData {
    version: number;
    threads: StoredThread[];
}

export interface FileCommentEntry {
    file: string;
    line: number;
    endLine: number;
    resolved: boolean;
    comment: StoredComment;
}

const CODE_REVIEW_DIR = 'code-review';
const GITIGNORE_CONTENT = '*\n';

const reviewDataChangedEmitter = new vscode.EventEmitter<void>();
export const onDidChangeReviewData = reviewDataChangedEmitter.event;

export function fireReviewDataChanged(): void {
    reviewDataChangedEmitter.fire();
}

function getCodeReviewDirUri(): vscode.Uri | null {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) {
        return null;
    }
    return vscode.Uri.joinPath(root, CODE_REVIEW_DIR);
}

function getDataFileUri(): vscode.Uri | null {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) {
        return null;
    }
    const cfg = vscode.workspace.getConfiguration('codeReview');
    return vscode.Uri.joinPath(root, cfg.get<string>('dataFile', `${CODE_REVIEW_DIR}/.code-review.json`));
}

export async function ensureCodeReviewDir(): Promise<void> {
    const dirUri = getCodeReviewDirUri();
    if (!dirUri) {
        return;
    }
    await vscode.workspace.fs.createDirectory(dirUri);
    const gitignoreUri = vscode.Uri.joinPath(dirUri, '.gitignore');
    try {
        await vscode.workspace.fs.stat(gitignoreUri);
    } catch {
        await vscode.workspace.fs.writeFile(gitignoreUri, Buffer.from(GITIGNORE_CONTENT, 'utf8'));
    }
}

export async function loadReviewData(): Promise<ReviewData> {
    const uri = getDataFileUri();
    if (!uri) {
        return { version: 1, threads: [] };
    }
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        return JSON.parse(Buffer.from(bytes).toString('utf8')) as ReviewData;
    } catch {
        return { version: 1, threads: [] };
    }
}

export async function saveReviewData(data: ReviewData): Promise<void> {
    const uri = getDataFileUri();
    if (!uri) {
        return;
    }
    await ensureCodeReviewDir();
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
    fireReviewDataChanged();
}

export function relativeFilePath(rootUri: vscode.Uri, fileUri: vscode.Uri): string {
    const rootPrefix = rootUri.path.endsWith('/') ? rootUri.path : `${rootUri.path}/`;
    if (fileUri.path.startsWith(rootPrefix)) {
        return fileUri.path.slice(rootPrefix.length);
    }
    const segments = fileUri.path.split('/');
    return segments[segments.length - 1];
}

export function getCommentCountByFile(data: ReviewData): Map<string, number> {
    const counts = new Map<string, number>();
    for (const thread of data.threads) {
        const current = counts.get(thread.file) ?? 0;
        counts.set(thread.file, current + thread.comments.length);
    }
    return counts;
}

export function getCommentsForFile(data: ReviewData, file: string): FileCommentEntry[] {
    const entries: FileCommentEntry[] = [];
    for (const thread of data.threads) {
        if (thread.file !== file) {
            continue;
        }
        for (const comment of thread.comments) {
            entries.push({
                file: thread.file,
                line: thread.line,
                endLine: thread.endLine,
                resolved: thread.resolved,
                comment,
            });
        }
    }
    entries.sort((a, b) => {
        if (a.line !== b.line) {
            return a.line - b.line;
        }
        return a.comment.timestamp.localeCompare(b.comment.timestamp);
    });
    return entries;
}
