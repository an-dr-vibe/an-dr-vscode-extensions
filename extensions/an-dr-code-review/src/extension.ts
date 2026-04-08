import * as vscode from 'vscode';
import { activateCommentController } from './commentController';
import { activate as activateTreeCompare } from './gitTreeCompare/extension';
import { CodeReviewCommentsProvider, registerCommentsView } from './commentsView';

export function activate(context: vscode.ExtensionContext): void {
    activateCommentController(context);
    const commentsProvider = new CodeReviewCommentsProvider();
    registerCommentsView(context, commentsProvider);
    activateTreeCompare(context, (file) => commentsProvider.setSelectedFile(file));
}

export function deactivate(): void {
    // nothing to clean up
}
