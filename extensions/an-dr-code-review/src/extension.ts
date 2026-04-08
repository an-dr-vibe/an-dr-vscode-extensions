import * as vscode from 'vscode';
import { activateCommentController } from './commentController';
import { activate as activateTreeCompare } from './gitTreeCompare/extension';
import { CodeReviewCommentsProvider, registerCommentsView } from './commentsView';
import { CodeReviewFileDecorationProvider } from './explorerDecorations';

export function activate(context: vscode.ExtensionContext): void {
    activateCommentController(context);
    const commentsProvider = new CodeReviewCommentsProvider();
    const explorerDecorationProvider = new CodeReviewFileDecorationProvider();
    context.subscriptions.push(
        explorerDecorationProvider,
        vscode.window.registerFileDecorationProvider(explorerDecorationProvider),
    );
    registerCommentsView(context, commentsProvider);
    activateTreeCompare(context, (file) => commentsProvider.setSelectedFile(file));
}

export function deactivate(): void {
    // nothing to clean up
}
