import * as vscode from 'vscode';
import { COMMAND_NAMESPACE, COMMENTS_VIEW_ID } from './gitTreeCompare/constants';
import { FileCommentEntry, loadReviewData, getCommentsForFile, onDidChangeReviewData } from './reviewStore';

class EmptyStateItem extends vscode.TreeItem {
    constructor(label: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'empty';
    }
}

class CommentItem extends vscode.TreeItem {
    constructor(entry: FileCommentEntry) {
        const startLine = entry.line + 1;
        const endLine = entry.endLine + 1;
        const rangeLabel = startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`;
        const stateLabel = entry.resolved ? 'resolved' : 'open';
        const preview = entry.comment.body.replace(/\s+/g, ' ').trim();
        super(`${rangeLabel} ${preview}`, vscode.TreeItemCollapsibleState.None);
        this.description = stateLabel;
        this.tooltip = [
            entry.file,
            `${rangeLabel} • ${stateLabel}`,
            entry.comment.author ? `${entry.comment.author} • ${new Date(entry.comment.timestamp).toLocaleString()}` : new Date(entry.comment.timestamp).toLocaleString(),
            '',
            entry.comment.body,
        ].join('\n');
        this.contextValue = 'comment';
        this.command = {
            command: `${COMMAND_NAMESPACE}.openCommentLocation`,
            title: 'Open Comment Location',
            arguments: [entry],
        };
    }
}

export class CodeReviewCommentsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<vscode.TreeItem | void>();
    readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

    private selectedFile: string | undefined;

    constructor() {
        onDidChangeReviewData(() => {
            this.refresh();
        });
    }

    setSelectedFile(file: string | undefined): void {
        if (this.selectedFile === file) {
            return;
        }
        this.selectedFile = file;
        this.refresh();
    }

    refresh(): void {
        this.onDidChangeTreeDataEmitter.fire();
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element) {
            return [];
        }

        if (!vscode.workspace.workspaceFolders?.[0]?.uri) {
            return [new EmptyStateItem('Open a workspace to view comments')];
        }
        if (!this.selectedFile) {
            return [new EmptyStateItem('Select a file to view comments')];
        }

        const data = await loadReviewData();
        const entries = getCommentsForFile(data, this.selectedFile);
        if (entries.length === 0) {
            return [new EmptyStateItem('No comments for this file')];
        }

        return entries.map((entry) => new CommentItem(entry));
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }
}

export function registerCommentsView(context: vscode.ExtensionContext, provider: CodeReviewCommentsProvider): void {
    const treeView = vscode.window.createTreeView(COMMENTS_VIEW_ID, {
        treeDataProvider: provider,
        canSelectMany: false,
    });

    context.subscriptions.push(treeView);
}
