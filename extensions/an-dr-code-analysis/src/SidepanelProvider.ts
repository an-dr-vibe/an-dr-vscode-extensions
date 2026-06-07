import * as vscode from 'vscode';
import { generateWebviewHtml } from './webview/webviewHtml';
import { ToolRegistry } from './tools/ToolRegistry';
import { ToolHelpPanel } from './tools/ToolHelpPanel';
import { ContextTracker } from './context/ContextTracker';
import { WebviewToExtensionMessage } from './webview/messages';

export class SidepanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    static readonly viewType = 'an-dr-code-analysis.panel';

    private _view?: vscode.WebviewView;
    private readonly _toolRegistry = new ToolRegistry();
    private readonly _contextTracker: ContextTracker;

    constructor(private readonly _extensionUri: vscode.Uri) {
        this._contextTracker = new ContextTracker();
        this._contextTracker.onContextChange(ctx => this._postContext(ctx));
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this._extensionUri, 'out')],
        };

        const scriptUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'out', 'webview.js')
        );

        webviewView.webview.html = generateWebviewHtml(
            webviewView.webview,
            this._extensionUri,
            scriptUri
        );

        webviewView.webview.onDidReceiveMessage((msg: WebviewToExtensionMessage) => {
            switch (msg.type) {
                case 'ready':
                    void this._sendToolsStatus();
                    this._postContext(this._contextTracker.current);
                    break;
                case 'refreshTools':
                    void this._sendToolsStatus();
                    break;
                case 'togglePin':
                    this._contextTracker.toggle();
                    break;
                case 'showToolHelp':
                    ToolHelpPanel.showByName(msg.toolName);
                    break;
            }
        });
    }

    dispose(): void {
        this._contextTracker.dispose();
    }

    private async _sendToolsStatus(): Promise<void> {
        if (!this._view) { return; }
        const tools = await this._toolRegistry.refresh();
        this._view.webview.postMessage({ type: 'toolsStatus', tools });
    }

    private _postContext(ctx: import('./context/ContextTracker').EditorContext | null): void {
        this._view?.webview.postMessage({ type: 'contextUpdate', context: ctx });
    }
}
