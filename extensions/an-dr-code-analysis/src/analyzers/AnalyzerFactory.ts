import { IAnalyzer, AnalysisRequest } from './IAnalyzer';
import { LspAnalyzer } from './lsp/LspAnalyzer';
import { CtagsAnalyzer } from './cli/CtagsAnalyzer';
import { ContextTracker } from '../context/ContextTracker';

export class AnalyzerFactory {
    private readonly _lspAnalyzer: LspAnalyzer;
    private readonly _ctagsAnalyzer: CtagsAnalyzer;

    constructor(contextTracker: ContextTracker) {
        this._lspAnalyzer  = new LspAnalyzer(contextTracker);
        this._ctagsAnalyzer = new CtagsAnalyzer();
    }

    getChain(request: AnalysisRequest): IAnalyzer[] {
        const chain: IAnalyzer[] = [];
        if (this._lspAnalyzer.canHandle(request))  { chain.push(this._lspAnalyzer); }
        if (this._ctagsAnalyzer.canHandle(request)) { chain.push(this._ctagsAnalyzer); }
        return chain;
    }
}
