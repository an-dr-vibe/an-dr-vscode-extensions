import { IAnalyzer, AnalysisRequest } from './IAnalyzer';
import { LspAnalyzer } from './lsp/LspAnalyzer';
import { CtagsAnalyzer } from './cli/CtagsAnalyzer';
import { FileDepsAnalyzer } from './cli/FileDepsAnalyzer';
import { ContextTracker } from '../context/ContextTracker';

export class AnalyzerFactory {
    private readonly _lspAnalyzer: LspAnalyzer;
    private readonly _ctagsAnalyzer: CtagsAnalyzer;
    private readonly _fileDepsAnalyzer: FileDepsAnalyzer;

    constructor(contextTracker: ContextTracker) {
        this._lspAnalyzer      = new LspAnalyzer(contextTracker);
        this._ctagsAnalyzer    = new CtagsAnalyzer();
        this._fileDepsAnalyzer = new FileDepsAnalyzer();
    }

    getChain(request: AnalysisRequest): IAnalyzer[] {
        const chain: IAnalyzer[] = [];
        if (this._lspAnalyzer.canHandle(request))      { chain.push(this._lspAnalyzer); }
        if (this._ctagsAnalyzer.canHandle(request))    { chain.push(this._ctagsAnalyzer); }
        if (this._fileDepsAnalyzer.canHandle(request)) { chain.push(this._fileDepsAnalyzer); }
        return chain;
    }
}
