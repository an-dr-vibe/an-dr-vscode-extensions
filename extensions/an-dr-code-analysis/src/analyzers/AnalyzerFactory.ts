import { IAnalyzer, AnalysisRequest } from './IAnalyzer';
import { LspAnalyzer } from './lsp/LspAnalyzer';
import { CtagsAnalyzer } from './cli/CtagsAnalyzer';
import { FileDepsAnalyzer } from './cli/FileDepsAnalyzer';
import { TsFileDepsAnalyzer } from './cli/TsFileDepsAnalyzer';
import { TsComponentDepsAnalyzer } from './cli/TsComponentDepsAnalyzer';
import { ContextTracker } from '../context/ContextTracker';

export class AnalyzerFactory {
    private readonly _lspCCpp: LspAnalyzer;
    private readonly _lspTsJs: LspAnalyzer;
    private readonly _ctagsAnalyzer: CtagsAnalyzer;
    private readonly _fileDepsAnalyzer: FileDepsAnalyzer;
    private readonly _tsFileDepsAnalyzer: TsFileDepsAnalyzer;
    private readonly _tsComponentDepsAnalyzer: TsComponentDepsAnalyzer;

    constructor(contextTracker: ContextTracker) {
        this._lspCCpp                 = LspAnalyzer.forCCpp(contextTracker);
        this._lspTsJs                 = LspAnalyzer.forTsJs(contextTracker);
        this._ctagsAnalyzer           = new CtagsAnalyzer();
        this._fileDepsAnalyzer        = new FileDepsAnalyzer();
        this._tsFileDepsAnalyzer      = new TsFileDepsAnalyzer();
        this._tsComponentDepsAnalyzer = new TsComponentDepsAnalyzer();
    }

    getChain(request: AnalysisRequest): IAnalyzer[] {
        const all: IAnalyzer[] = [
            this._lspCCpp,
            this._lspTsJs,
            this._ctagsAnalyzer,
            this._fileDepsAnalyzer,
            this._tsFileDepsAnalyzer,
            this._tsComponentDepsAnalyzer,
        ];
        return all.filter(a => a.canHandle(request));
    }
}
