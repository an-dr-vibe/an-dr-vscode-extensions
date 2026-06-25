import * as vscode from 'vscode';
import { generateWebviewHtml } from './webview/webviewHtml';
import { ContextTracker } from './context/ContextTracker';
import { AnalyzerFactory } from './analyzers/AnalyzerFactory';
import { AnalysisRunner, AnalysisRunnerEvent } from './application/AnalysisRunner';
import { GraphModel, GraphType } from '../shared/graph/GraphModel';
import { WebviewToExtensionMessage } from '../shared/protocol/messages';
import { withWorkspaceRoot } from './webview/graphPayload';
import { log } from './logger';

const GRAPH_TYPE_LABELS: Record<GraphType, string> = {
    callGraph: 'Call Graph',
    fileDeps: 'File Deps',
    componentDeps: 'Component Deps',
};

export class FullTabPanel implements vscode.Disposable {
    private readonly _panel: vscode.WebviewPanel;
    private readonly _analysisRunner: AnalysisRunner;
    private readonly _disposables: vscode.Disposable[] = [];
    private _pendingGraph: GraphModel | null;

    static create(
        extensionUri: vscode.Uri,
        initialGraph: GraphModel,
        depth: number,
        contextTracker: ContextTracker,
        analyzerFactory: AnalyzerFactory,
    ): FullTabPanel {
        const targetLabel = initialGraph.nodes.find(n => n.id === initialGraph.targetId)?.label
            ?? initialGraph.nodes[0]?.label
            ?? 'unknown';
        const title = `Code Analysis — ${GRAPH_TYPE_LABELS[initialGraph.graphType]} — ${targetLabel}`;

        const panel = vscode.window.createWebviewPanel(
            'an-dr-code-analysis.fullTab',
            title,
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out')],
                retainContextWhenHidden: true,
            }
        );
        return new FullTabPanel(panel, extensionUri, initialGraph, depth, contextTracker, analyzerFactory);
    }

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        initialGraph: GraphModel,
        private _depth: number,
        private readonly _contextTracker: ContextTracker,
        private readonly _analyzerFactory: AnalyzerFactory,
    ) {
        this._panel = panel;
        this._pendingGraph = initialGraph;
        this._analysisRunner = new AnalysisRunner(this._analyzerFactory);

        const scriptUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(extensionUri, 'out', 'webview.js')
        );
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'out')],
        };
        panel.webview.html = generateWebviewHtml(panel.webview, extensionUri, scriptUri, { fullTab: true });

        this._disposables.push(
            this._analysisRunner,
            panel.webview.onDidReceiveMessage((msg: WebviewToExtensionMessage) => {
                void this._handleMessage(msg);
            }),
            panel.onDidDispose(() => this.dispose()),
        );
    }

    private async _handleMessage(msg: WebviewToExtensionMessage): Promise<void> {
        switch (msg.type) {
            case 'ready':
                if (this._pendingGraph) {
                    this._panel.webview.postMessage({ type: 'analysisResult', graph: withWorkspaceRoot(this._pendingGraph) });
                    this._pendingGraph = null;
                }
                break;
            case 'depthChange':
                this._depth = msg.depth;
                this._cancelRunning();
                void this._runAnalysis(msg.graphType, msg.depth);
                break;
            case 'requestAnalysis':
                this._cancelRunning();
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
            case 'reanalyzeTo':
                this._cancelRunning();
                void this._reanalyzeTo(msg.filePath, msg.line, msg.graphType, msg.depth);
                break;
            case 'cancelAnalysis':
                this._cancelRunning();
                break;
        }
    }

    private async _reanalyzeTo(filePath: string, line: number, graphType: GraphType, depth: number): Promise<void> {
        try {
            const doc = await vscode.workspace.openTextDocument(filePath);
            const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false });
            const pos = new vscode.Position(line, 0);
            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos));
            const ctx = await this._contextTracker.forceUpdateAt(doc, pos);
            if (!ctx?.symbol || ctx.symbolSource === 'word') {
                this._panel.webview.postMessage({
                    type: 'analysisError', graphType,
                    message: 'Could not resolve symbol. Place cursor directly on the function name.',
                });
                return;
            }
            void this._runAnalysis(graphType, depth);
        } catch (err) {
            log.appendLine(`[fullTab] reanalyzeTo failed: ${err}`);
        }
    }

    private _cancelRunning(): void {
        this._analysisRunner.cancel();
    }

    private async _runAnalysis(graphType: GraphType, depth: number): Promise<void> {
        await this._analysisRunner.run({
            graphType,
            depth,
            context: this._contextTracker.current,
            callHierarchyItem: this._contextTracker.currentCallHierarchyItem,
        }, event => this._postAnalysisEvent(event));
    }

    private _postAnalysisEvent(event: AnalysisRunnerEvent): void {
        switch (event.type) {
            case 'busy':
                this._panel.webview.postMessage({
                    type: 'analysisBusy',
                    graphType: event.graphType,
                    message: event.message,
                });
                break;
            case 'result':
                this._panel.webview.postMessage({
                    type: 'analysisResult',
                    graph: withWorkspaceRoot(event.graph),
                });
                break;
            case 'cancelled':
                this._panel.webview.postMessage({
                    type: 'analysisCancelled',
                    graphType: event.graphType,
                });
                break;
            case 'error':
                this._panel.webview.postMessage({
                    type: 'analysisError',
                    graphType: event.graphType,
                    message: event.message,
                });
                break;
        }
    }

    dispose(): void {
        this._cancelRunning();
        this._disposables.forEach(d => d.dispose());
        try { this._panel.dispose(); } catch { /* already disposed */ }
    }
}
