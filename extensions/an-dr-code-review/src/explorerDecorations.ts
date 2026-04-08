import * as path from 'path';
import * as vscode from 'vscode';
import { getCommentCountByFile, loadReviewData, onDidChangeReviewData, relativeFilePath } from './reviewStore';

export class CodeReviewFileDecorationProvider implements vscode.FileDecorationProvider, vscode.Disposable {
    private readonly onDidChangeFileDecorationsEmitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
    readonly onDidChangeFileDecorations = this.onDidChangeFileDecorationsEmitter.event;

    private countsByFile = new Map<string, number>();

    constructor() {
        onDidChangeReviewData(() => {
            void this.refresh();
        });
        void this.refresh();
    }

    async refresh(): Promise<void> {
        const data = await loadReviewData();
        this.countsByFile = getCommentCountByFile(data);
        this.onDidChangeFileDecorationsEmitter.fire(undefined);
    }

    provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
        if (uri.scheme !== 'file') {
            return undefined;
        }

        const count = this.getCountForUri(uri);
        if (count <= 0) {
            return undefined;
        }

        const badge = count >= 10 ? '+' : String(count);
        const label = count === 1 ? '1 code review comment' : `${count} code review comments`;
        const decoration = new vscode.FileDecoration(badge, label, new vscode.ThemeColor('charts.yellow'));
        decoration.propagate = true;
        return decoration;
    }

    private getCountForUri(uri: vscode.Uri): number {
        const root = vscode.workspace.workspaceFolders?.find((folder) => {
            const base = folder.uri.fsPath;
            return uri.fsPath === base || uri.fsPath.startsWith(base + path.sep);
        })?.uri;

        if (!root) {
            return 0;
        }

        const rel = relativeFilePath(root, uri).replace(/\\/g, '/');
        const exact = this.countsByFile.get(rel) ?? 0;
        if (exact > 0) {
            return exact;
        }

        const prefix = rel.endsWith('/') ? rel : `${rel}/`;
        let total = 0;
        for (const [file, count] of this.countsByFile) {
            if (file.startsWith(prefix)) {
                total += count;
            }
        }
        return total;
    }

    dispose(): void {
        this.onDidChangeFileDecorationsEmitter.dispose();
    }
}
