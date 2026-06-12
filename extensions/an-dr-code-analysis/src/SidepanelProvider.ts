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
import { log } from './logger';
import { ClangdHealth } from './tools/ClangdHealth';

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

        // Refresh tool status whenever .clangd is created/deleted/changed so the
        // panel updates immediately after "Setup compile_commands.json" completes.
        const clangdWatcher = vscode.workspace.createFileSystemWatcher('**/.clangd');
        clangdWatcher.onDidCreate(() => void this._sendToolsStatus());
        clangdWatcher.onDidDelete(() => void this._sendToolsStatus());
        clangdWatcher.onDidChange(() => void this._sendToolsStatus());
        this._disposables.push(clangdWatcher);

        // Refresh when tools.compileCommandsPath setting changes.
        const cfgWatcher = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('an-dr-code-analysis.tools.compileCommandsPath')) {
                void this._sendToolsStatus();
            }
        });
        this._disposables.push(cfgWatcher);
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
                case 'runCommand':
                    void vscode.commands.executeCommand(msg.command, ...(msg.args ?? []));
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
        // Re-evaluate health now that tool statuses are fresh (ctags availability may have changed).
        this._postClangdHealth(this._contextTracker.current);
    }

    private _postContext(ctx: import('./context/ContextTracker').EditorContext | null): void {
        this._view?.webview.postMessage({ type: 'contextUpdate', context: ctx });
        this._postClangdHealth(ctx);
    }

    private _postClangdHealth(ctx: import('./context/ContextTracker').EditorContext | null): void {
        if (!this._view) { return; }
        const C_CPP = new Set(['c', 'cpp', 'cuda-cpp', 'objective-c', 'objective-cpp']);
        if (!ctx || !C_CPP.has(ctx.langId)) {
            this._view.webview.postMessage({ type: 'clangdHealth', issue: null, message: '' });
            return;
        }
        const health = ClangdHealth.checkDetail();
        if (!health.issue) {
            this._view.webview.postMessage({ type: 'clangdHealth', issue: null, message: '' });
            return;
        }
        // Only surface the clangd warning if ctags is not available as a fallback.
        // When ctags can handle the request, clangd's config issues are not actionable here
        // (they are already shown in the Tools Status section).
        const ctagsOk = this._toolRegistry.statuses.some(t => t.name === 'ctags' && t.state === 'ok');
        if (ctagsOk) {
            this._view.webview.postMessage({ type: 'clangdHealth', issue: null, message: '' });
            return;
        }
        this._view.webview.postMessage({
            type: 'clangdHealth',
            issue: health.issue,
            message: health.message,
        });
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

        // P1/P2: clamp depth to [1, maxDepth] — reject depth ≤ 0
        const clampedDepth = Math.min(Math.max(depth, 1), Settings.maxDepth());
        // Snapshot the CallHierarchyItem NOW before the webview steals focus and
        // onDidChangeActiveTextEditor fires and potentially clears it.
        const callHierarchyItem = this._contextTracker.currentCallHierarchyItem;
        const request = { context: ctx, graphType, depth: clampedDepth, callHierarchyItem };

        const cached = this._cache.get({ filePath: ctx.filePath, graphType, depth: clampedDepth, symbol: ctx.symbol });
        if (cached) {
            this._view.webview.postMessage({ type: 'analysisResult', graph: cached.graph });
            return;
        }

        this._view.webview.postMessage({ type: 'analysisBusy', graphType });

        const chain = this._analyzerFactory.getChain(request);
        log.appendLine(`[analysis] graphType=${graphType} symbol=${ctx.symbol} lang=${ctx.langId} chain=[${chain.map(a => a.name).join(', ')}]`);

        for (const analyzer of chain) {
            try {
                log.appendLine(`[analysis] running ${analyzer.name}...`);
                const result = await analyzer.analyze(request);
                log.appendLine(`[analysis] ${analyzer.name} result: ${result ? `${result.graph.nodes.length} nodes` : 'null'}`);
                if (result) {
                    this._cache.set(
                        { filePath: ctx.filePath, graphType, depth: clampedDepth, symbol: ctx.symbol },
                        result
                    );
                    this._view?.webview.postMessage({ type: 'analysisResult', graph: result.graph });
                    return;
                }
            } catch (err) {
                log.appendLine(`[analysis] ${analyzer.name} threw: ${err}`);
            }
        }

        this._view?.webview.postMessage({
            type: 'analysisError',
            graphType,
            message: 'No results found.',
        });
    }
}
