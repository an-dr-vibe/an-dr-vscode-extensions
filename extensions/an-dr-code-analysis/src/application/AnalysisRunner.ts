import { AnalysisRequest, AnalysisResult, IAnalyzer } from '../analyzers/IAnalyzer';
import { AnalysisCache } from '../cache/AnalysisCache';
import { Settings } from '../config/Settings';
import { LSP_LANG_IDS } from '../config/languageGroups';
import { EditorContext } from '../context/ContextTracker';
import { GraphModel, GraphType } from '../../shared/graph/GraphModel';
import { log } from '../logger';

/** Stable cache key for one graph analysis result. */
export interface AnalysisCacheKey {
    filePath: string;
    graphType: GraphType;
    depth: number;
    symbol?: string;
}

/** Cache boundary used by AnalysisRunner so tests can provide an in-memory cache. */
export interface AnalysisCachePort {
    get(key: AnalysisCacheKey): AnalysisResult | undefined;
    set(key: AnalysisCacheKey, result: AnalysisResult): void;
    dispose(): void;
}

/** Minimal analyzer-chain boundary required by the analysis use case. */
export interface AnalyzerChainProvider {
    getChain(request: AnalysisRequest): IAnalyzer[];
}

/** Input required to run one graph analysis request. */
export interface AnalysisRunnerRequest {
    graphType: GraphType;
    depth: number;
    context: EditorContext | null;
    callHierarchyItem?: AnalysisRequest['callHierarchyItem'];
}

/** UI-neutral events emitted while one analysis request is processed. */
export type AnalysisRunnerEvent =
    | { type: 'busy'; graphType: GraphType; message?: string }
    | { type: 'result'; graph: GraphModel; fromCache: boolean }
    | { type: 'cancelled'; graphType: GraphType }
    | { type: 'error'; graphType: GraphType; message: string };

/** Receiver used by adapters to translate runner events into webview messages. */
export type AnalysisRunnerEventSink = (event: AnalysisRunnerEvent) => void;

/** Optional runtime dependencies for tests and future adapter replacement. */
export interface AnalysisRunnerDependencies {
    cache?: AnalysisCachePort;
    maxDepth?: () => number;
    logger?: Pick<typeof log, 'appendLine'>;
}

/** Coordinates cache, cancellation, fallback analyzers, and analysis result events. */
export class AnalysisRunner {
    private readonly _cache: AnalysisCachePort;
    private readonly _ownsCache: boolean;
    private readonly _maxDepth: () => number;
    private readonly _logger: Pick<typeof log, 'appendLine'>;
    private _abortController: AbortController | null = null;
    private _generation = 0;

    constructor(
        private readonly _analyzerChain: AnalyzerChainProvider,
        dependencies: AnalysisRunnerDependencies = {},
    ) {
        this._cache = dependencies.cache ?? new AnalysisCache();
        this._ownsCache = dependencies.cache === undefined;
        this._maxDepth = dependencies.maxDepth ?? (() => Settings.maxDepth());
        this._logger = dependencies.logger ?? log;
    }

    /** Cancel the current request while preserving the event for explicit user cancels. */
    cancel(): void {
        this._abortController?.abort();
        this._abortController = null;
    }

    /** Run one analysis request and emit UI-neutral progress/result events. */
    async run(request: AnalysisRunnerRequest, emit: AnalysisRunnerEventSink): Promise<void> {
        this.cancel();
        const generation = ++this._generation;

        const ctx = request.context;
        if (!ctx) {
            emit({
                type: 'error',
                graphType: request.graphType,
                message: 'No file open. Open a file and place the cursor on a symbol.',
            });
            return;
        }

        const depth = Math.min(Math.max(request.depth, 1), this._maxDepth());
        const cacheKey = {
            filePath: ctx.filePath,
            graphType: request.graphType,
            depth,
            symbol: ctx.symbol,
        };

        const cached = this._cache.get(cacheKey);
        if (cached) {
            emit({ type: 'result', graph: cached.graph, fromCache: true });
            return;
        }

        const controller = new AbortController();
        this._abortController = controller;
        const analyzerRequest: AnalysisRequest = {
            context: ctx,
            graphType: request.graphType,
            depth,
            callHierarchyItem: request.callHierarchyItem,
            signal: controller.signal,
        };

        const waitingForLsp = !request.callHierarchyItem && LSP_LANG_IDS.has(ctx.langId);
        emit({
            type: 'busy',
            graphType: request.graphType,
            message: waitingForLsp ? 'Waiting for IntelliSense...' : undefined,
        });

        const chain = this._analyzerChain.getChain(analyzerRequest);
        this._logger.appendLine(
            `[analysis] graphType=${request.graphType} symbol=${ctx.symbol} lang=${ctx.langId} chain=[${chain.map(a => a.name).join(', ')}]`
        );

        for (const analyzer of chain) {
            if (controller.signal.aborted) { break; }
            const result = await this._tryAnalyze(analyzer, analyzerRequest, controller);
            if (controller.signal.aborted) { break; }
            if (!this._isCurrentGeneration(generation)) { return; }
            if (!result) { continue; }

            this._cache.set(cacheKey, result);
            this._clearIfActive(controller);
            emit({ type: 'result', graph: result.graph, fromCache: false });
            return;
        }

        this._clearIfActive(controller);

        if (!this._isCurrentGeneration(generation)) { return; }
        if (controller.signal.aborted) {
            emit({ type: 'cancelled', graphType: request.graphType });
            return;
        }

        emit({
            type: 'error',
            graphType: request.graphType,
            message: 'No results found.',
        });
    }

    /** Dispose owned runtime resources. */
    dispose(): void {
        this.cancel();
        if (this._ownsCache) {
            this._cache.dispose();
        }
    }

    private async _tryAnalyze(
        analyzer: IAnalyzer,
        request: AnalysisRequest,
        controller: AbortController,
    ): Promise<AnalysisResult | null> {
        try {
            const result = await analyzer.analyze(request);
            if (!controller.signal.aborted) {
                this._logger.appendLine(
                    `[analysis] ${analyzer.name}: ${result ? `${result.graph.nodes.length} nodes` : 'null (trying next)'}`
                );
            }
            return result;
        } catch (err) {
            if (!controller.signal.aborted) {
                this._logger.appendLine(`[analysis] ${analyzer.name} threw: ${err}`);
            }
            return null;
        }
    }

    private _isCurrentGeneration(generation: number): boolean {
        return this._generation === generation;
    }

    private _clearIfActive(controller: AbortController): void {
        if (this._abortController === controller) {
            this._abortController = null;
        }
    }
}
