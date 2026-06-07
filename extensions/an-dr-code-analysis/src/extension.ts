import * as vscode from 'vscode';
import { SidepanelProvider } from './SidepanelProvider';
import { selectCompileCommandsCommand } from './commands/selectCompileCommands';

export function activate(context: vscode.ExtensionContext): void {
    const provider = new SidepanelProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidepanelProvider.viewType, provider),
        vscode.commands.registerCommand(
            'an-dr-code-analysis.selectCompileCommands',
            selectCompileCommandsCommand
        ),
    );
}

export function deactivate(): void {}
