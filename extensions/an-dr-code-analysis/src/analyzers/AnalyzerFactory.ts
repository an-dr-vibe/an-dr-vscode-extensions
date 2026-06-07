import { IAnalyzer, AnalysisRequest } from './IAnalyzer';
import { LspAnalyzer } from './lsp/LspAnalyzer';
import { ContextTracker } from '../context/ContextTracker';

export class AnalyzerFactory {
    private readonly _lspAnalyzer: LspAnalyzer;

    constructor(contextTracker: ContextTracker) {
        this._lspAnalyzer = new LspAnalyzer(contextTracker);
    }

    getChain(request: AnalysisRequest): IAnalyzer[] {
        const chain: IAnalyzer[] = [];
        if (this._lspAnalyzer.canHandle(request)) {
            chain.push(this._lspAnalyzer);
        }
        return chain;
    }
}
