import * as vscode from 'vscode';
import { generateWebviewHtml } from './webview/webviewHtml';
import { ToolRegistry } from './tools/ToolRegistry';
import { ToolHelpPanel } from './tools/ToolHelpPanel';
import { ContextTracker } from './context/ContextTracker';
import { AnalyzerFactory } from './analyzers/AnalyzerFactory';
import { AnalysisCache } from './cache/AnalysisCache';
import { Settings } from './config/Settings';
import { WebviewToExtensionMessage } from './webview/messages';
import { GraphType } from './graph/GraphModel';

export class SidepanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    static readonly viewType = 'an-dr-code-analysis.panel';

    private _view?: vscode.WebviewView;
    private readonly _toolRegistry = new ToolRegistry();
    private readonly _contextTracker: ContextTracker;
    private readonly _analyzerFactory: AnalyzerFactory;
    private readonly _cache = new AnalysisCache();
    private readonly _disposables: vscode.Disposable[] = [];

    constructor(private readonly _extensionUri: vscode.Uri) {
        this._contextTracker = new ContextTracker();
        this._contextTracker.onContextChange(ctx => this._postContext(ctx));
        this._analyzerFactory = new AnalyzerFactory(this._contextTracker);
        this._disposables.push(this._cache);
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
                case 'requestAnalysis':
                    void this._runAnalysis(msg.graphType, msg.depth);
                    break;
                case 'depthChange':
                    void this._runAnalysis(msg.graphType, msg.depth);
                    break;
                case 'nodeDoubleClick':
                    if (msg.filePath) {
                        void vscode.workspace.openTextDocument(msg.filePath).then(doc =>
                            vscode.window.showTextDocument(doc, {
                                selection: msg.line !== undefined
                                    ? new vscode.Range(msg.line, 0, msg.line, 0)
                                    : undefined,
                            })
                        );
                    }
                    break;
            }
        });
    }

    dispose(): void {
        this._contextTracker.dispose();
        this._disposables.forEach(d => d.dispose());
    }

    private async _sendToolsStatus(): Promise<void> {
        if (!this._view) { return; }
        const tools = await this._toolRegistry.refresh();
        this._view.webview.postMessage({ type: 'toolsStatus', tools });
    }

    private _postContext(ctx: import('./context/ContextTracker').EditorContext | null): void {
        this._view?.webview.postMessage({ type: 'contextUpdate', context: ctx });
    }

    private async _runAnalysis(graphType: GraphType, depth: number): Promise<void> {
        if (!this._view) { return; }

        const ctx = this._contextTracker.current;
        if (!ctx) {
            this._view.webview.postMessage({
                type: 'analysisError',
                graphType,
                message: 'No file open. Open a file and place the cursor on a symbol.',
            });
            return;
        }

        const clampedDepth = Math.min(depth, Settings.maxDepth());
        const request = { context: ctx, graphType, depth: clampedDepth };

        const cached = this._cache.get({ filePath: ctx.filePath, graphType, depth: clampedDepth, symbol: ctx.symbol });
        if (cached) {
            this._view.webview.postMessage({ type: 'analysisResult', graph: cached.graph });
            return;
        }

        this._view.webview.postMessage({ type: 'analysisBusy', graphType });

        const chain = this._analyzerFactory.getChain(request);

        for (const analyzer of chain) {
            try {
                const result = await analyzer.analyze(request);
                if (result && result.graph.nodes.length > 0) {
                    this._cache.set(
                        { filePath: ctx.filePath, graphType, depth: clampedDepth, symbol: ctx.symbol },
                        result
                    );
                    this._view?.webview.postMessage({ type: 'analysisResult', graph: result.graph });
                    return;
                }
            } catch (err) {
                // try next analyzer in chain
            }
        }

        this._view?.webview.postMessage({
            type: 'analysisError',
            graphType,
            message: 'No results found',
        });
    }
}
