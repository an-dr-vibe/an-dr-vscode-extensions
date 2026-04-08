import * as vscode from 'vscode';
import { activateCommentController } from './commentController';
import { activate as activateTreeCompare } from './gitTreeCompare/extension';

export function activate(context: vscode.ExtensionContext): void {
    activateCommentController(context);
    activateTreeCompare(context);
}

export function deactivate(): void {
    // nothing to clean up
}
