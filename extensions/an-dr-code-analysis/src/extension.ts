import * as vscode from 'vscode';
import { SidepanelProvider } from './SidepanelProvider';

export function activate(context: vscode.ExtensionContext): void {
    const provider = new SidepanelProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SidepanelProvider.viewType, provider)
    );
}

export function deactivate(): void {}
