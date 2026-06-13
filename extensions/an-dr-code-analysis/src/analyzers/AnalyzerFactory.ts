import { IAnalyzer, AnalysisRequest } from './IAnalyzer';
import { LspAnalyzer } from './lsp/LspAnalyzer';
import { CtagsAnalyzer } from './cli/CtagsAnalyzer';
import { FileDepsAnalyzer } from './cli/FileDepsAnalyzer';
import { TsFileDepsAnalyzer } from './cli/TsFileDepsAnalyzer';
import { TsComponentDepsAnalyzer } from './cli/TsComponentDepsAnalyzer';
import { Pyan3Analyzer } from './cli/Pyan3Analyzer';
import { AstWalkAnalyzer } from './heuristic/AstWalkAnalyzer';
import { ContextTracker } from '../context/ContextTracker';

export class AnalyzerFactory {
    private readonly _lspCCpp: LspAnalyzer;
    private readonly _lspTsJs: LspAnalyzer;
    private readonly _ctagsAnalyzer: CtagsAnalyzer;
    private readonly _fileDepsAnalyzer: FileDepsAnalyzer;
    private readonly _tsFileDepsAnalyzer: TsFileDepsAnalyzer;
    private readonly _tsComponentDepsAnalyzer: TsComponentDepsAnalyzer;
    private readonly _pyan3Analyzer: Pyan3Analyzer;
    private readonly _astWalkAnalyzer: AstWalkAnalyzer;

    constructor(contextTracker: ContextTracker) {
        this._lspCCpp                 = LspAnalyzer.forCCpp(contextTracker);
        this._lspTsJs                 = LspAnalyzer.forTsJs(contextTracker);
        this._ctagsAnalyzer           = new CtagsAnalyzer();
        this._fileDepsAnalyzer        = new FileDepsAnalyzer();
        this._tsFileDepsAnalyzer      = new TsFileDepsAnalyzer();
        this._tsComponentDepsAnalyzer = new TsComponentDepsAnalyzer();
        this._pyan3Analyzer           = new Pyan3Analyzer();
        this._astWalkAnalyzer         = new AstWalkAnalyzer();
    }

    getChain(request: AnalysisRequest): IAnalyzer[] {
        const all: IAnalyzer[] = [
            this._lspCCpp,
            this._lspTsJs,
            this._pyan3Analyzer,   // python callGraph (primary)
            this._ctagsAnalyzer,   // python callGraph fallback + C/C++ fallback
            this._fileDepsAnalyzer,
            this._tsFileDepsAnalyzer,
            this._tsComponentDepsAnalyzer,
            this._astWalkAnalyzer, // python fileDeps
        ];
        return all.filter(a => a.canHandle(request));
    }
}
