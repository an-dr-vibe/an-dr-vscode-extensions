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
import { C_CPP_LANG_IDS, LSP_LANG_IDS } from './config/languageGroups';
import { flattenSymbols } from './utils/symbolUtils';

export class SidepanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    static readonly viewType = 'an-dr-code-analysis.panel';

    private _view?: vscode.WebviewView;
    private readonly _toolRegistry = new ToolRegistry();
    private readonly _contextTracker: ContextTracker;
    private readonly _analyzerFactory: AnalyzerFactory;
    private readonly _cache = new AnalysisCache();
    private readonly _disposables: vscode.Disposable[] = [];
    private _analysisAbortController: AbortController | null = null;

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
                    this._cancelRunningAnalysis();
                    void this._runAnalysis(msg.graphType, msg.depth);
                    break;
                case 'depthChange':
                    this._cancelRunningAnalysis();
                    void this._runAnalysis(msg.graphType, msg.depth);
                    break;
                case 'cancelAnalysis':
                    this._cancelRunningAnalysis();
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
                    this._cancelRunningAnalysis();
                    void this._reanalyzeTo(msg.filePath, msg.line, msg.graphType, msg.depth, msg.fullName);
                    break;
                case 'runCommand':
                    void vscode.commands.executeCommand(msg.command, ...(msg.args ?? []));
                    break;
                default:
                    log.appendLine(`[webview] unexpected message type: ${(msg as {type: string}).type}`);
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
        if (!ctx || !C_CPP_LANG_IDS.has(ctx.langId)) {
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

    private async _reanalyzeTo(filePath: string, line: number, graphType: import('./graph/GraphModel').GraphType, depth: number, fullName?: string): Promise<void> {
        try {
            const doc = await vscode.workspace.openTextDocument(filePath);
            const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false });

            // Navigate to the stored line first, then try to find the exact symbol position.
            let pos = new vscode.Position(line, 0);

            // If the stored line is 0 or we have a fullName, scan document symbols to find
            // the correct selectionRange position for the named symbol.
            if (fullName) {
                // Extract bare function name from clangd fullName format:
                //   "NS::Class - file.hpp (path)::funcName(params...)"
                // Strip everything up to and including the last "):: " (container suffix),
                // then take the identifier before the opening "(" of the params.
                const afterLastParen = fullName.replace(/^.*\)::/, '');
                const bareName = afterLastParen.replace(/\s*\(.*$/, '').trim();
                log.appendLine(`[reanalyzeTo] fullName="${fullName}" bareName="${bareName}"`);
                try {
                    const docSyms = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                        'vscode.executeDocumentSymbolProvider', doc.uri
                    );
                    const flat = docSyms ? flattenSymbols(docSyms) : [];
                    log.appendLine(`[reanalyzeTo] doc symbols: ${flat.map(s => s.name).join(', ')}`);
                    const match = flat.find(s => s.name === bareName || s.name.startsWith(bareName + '('));
                    log.appendLine(`[reanalyzeTo] match: ${match?.name ?? 'none'} → pos ${match?.selectionRange.start.line}:${match?.selectionRange.start.character}`);
                    if (match) { pos = match.selectionRange.start; }
                } catch (e) { log.appendLine(`[reanalyzeTo] doc symbol scan threw: ${e}`); }
            }
            log.appendLine(`[reanalyzeTo] navigating to ${filePath}:${pos.line}:${pos.character}`);

            editor.selection = new vscode.Selection(pos, pos);
            editor.revealRange(new vscode.Range(pos, pos));

            // Force context tracker to resolve at the exact position — bypasses debounce
            // and same-position guard, awaits the actual LSP response.
            const ctx = await this._contextTracker.forceUpdateAt(doc, pos);
            log.appendLine(`[reanalyzeTo] resolved ctx: symbol=${ctx?.symbol} source=${ctx?.symbolSource}`);

            if (!ctx?.symbol || ctx.symbolSource === 'word') {
                log.appendLine(`[reanalyzeTo] weak context — aborting (symbol=${ctx?.symbol} source=${ctx?.symbolSource})`);
                this._view?.webview.postMessage({
                    type: 'analysisError', graphType,
                    message: `Could not resolve symbol at this position. Place cursor directly on the function name and try again.`,
                });
                return;
            }

            void this._runAnalysis(graphType, depth);
        } catch (err) {
            log.appendLine(`[reanalyzeTo] failed: ${err}`);
        }
    }

    private _cancelRunningAnalysis(): void {
        if (this._analysisAbortController) {
            this._analysisAbortController.abort();
            this._analysisAbortController = null;
        }
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

        const cached = this._cache.get({ filePath: ctx.filePath, graphType, depth: clampedDepth, symbol: ctx.symbol });
        if (cached) {
            this._view.webview.postMessage({ type: 'analysisResult', graph: cached.graph });
            return;
        }

        const controller = new AbortController();
        this._analysisAbortController = controller;
        const request = { context: ctx, graphType, depth: clampedDepth, callHierarchyItem, signal: controller.signal };

        const waitingForLsp = !callHierarchyItem && LSP_LANG_IDS.has(ctx.langId);
        this._view.webview.postMessage({
            type: 'analysisBusy',
            graphType,
            message: waitingForLsp ? 'Waiting for IntelliSense…' : undefined,
        });

        const chain = this._analyzerFactory.getChain(request);
        log.appendLine(`[analysis] graphType=${graphType} symbol=${ctx.symbol} lang=${ctx.langId} chain=[${chain.map(a => a.name).join(', ')}]`);

        for (const analyzer of chain) {
            if (controller.signal.aborted) { break; }
            try {
                const result = await analyzer.analyze(request);
                if (controller.signal.aborted) { break; }
                log.appendLine(`[analysis] ${analyzer.name}: ${result ? `${result.graph.nodes.length} nodes` : 'null (trying next)'}`);
                if (result) {
                    this._cache.set(
                        { filePath: ctx.filePath, graphType, depth: clampedDepth, symbol: ctx.symbol },
                        result
                    );
                    this._analysisAbortController = null;
                    this._view?.webview.postMessage({ type: 'analysisResult', graph: result.graph });
                    return;
                }
            } catch (err) {
                if (controller.signal.aborted) { break; }
                log.appendLine(`[analysis] ${analyzer.name} threw: ${err}`);
            }
        }

        this._analysisAbortController = null;

        if (controller.signal.aborted) {
            // User cancelled — return to idle without showing an error.
            this._view?.webview.postMessage({ type: 'analysisCancelled', graphType });
            return;
        }

        this._view?.webview.postMessage({
            type: 'analysisError',
            graphType,
            message: 'No results found.',
        });
    }
}
