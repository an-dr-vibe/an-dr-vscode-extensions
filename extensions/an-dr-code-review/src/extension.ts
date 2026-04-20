import * as vscode from 'vscode';
import { activateCommentController } from './commentController';
import { activate as activateTreeCompare } from './gitTreeCompare/extension';
import { CodeReviewCommentsProvider, registerCommentsView } from './commentsView';
import { CodeReviewFileDecorationProvider } from './explorerDecorations';

export function activate(context: vscode.ExtensionContext): void {
    const updateSubmitKeyContext = async () => {
        const submitKey = vscode.workspace.getConfiguration('codeReview').get<string>('submitKey', 'ctrl+enter');
        const contextValue = submitKey === 'alt+enter' ? 'altEnter' : 'ctrlEnter';
        await vscode.commands.executeCommand('setContext', 'anDrCodeReview.submitKey', contextValue);
    };

    void updateSubmitKeyContext();
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('codeReview.submitKey')) {
                void updateSubmitKeyContext();
            }
        })
    );

    activateCommentController(context);
    const commentsProvider = new CodeReviewCommentsProvider();
    const explorerDecorationProvider = new CodeReviewFileDecorationProvider();
    context.subscriptions.push(
        explorerDecorationProvider,
        vscode.window.registerFileDecorationProvider(explorerDecorationProvider),
    );
    registerCommentsView(context, commentsProvider);
    activateTreeCompare(context, (selection) => commentsProvider.setSelection(selection));
}

export function deactivate(): void {
    // nothing to clean up
}
