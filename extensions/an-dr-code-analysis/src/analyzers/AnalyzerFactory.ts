import { IAnalyzer, AnalysisRequest } from './IAnalyzer';
import { LspAnalyzer } from './language-agnostic/LspAnalyzer';
import { CtagsAnalyzer } from './language-agnostic/CtagsAnalyzer';
import { FileDepsAnalyzer } from './language-agnostic/FileDepsAnalyzer';
import { TsFileDepsAnalyzer } from './typescript/TsFileDepsAnalyzer';
import { TsComponentDepsAnalyzer } from './typescript/TsComponentDepsAnalyzer';
import { Pyan3Analyzer } from './python/Pyan3Analyzer';
import { CargoAnalyzer } from './rust/CargoAnalyzer';
import { AstWalkAnalyzer } from './python/AstWalkAnalyzer';
import { RustModAnalyzer } from './rust/RustModAnalyzer';
import { ContextTracker } from '../context/ContextTracker';

export class AnalyzerFactory {
    private readonly _lspCCpp: LspAnalyzer;
    private readonly _lspTsJs: LspAnalyzer;
    private readonly _lspRust: LspAnalyzer;
    private readonly _ctagsAnalyzer: CtagsAnalyzer;
    private readonly _fileDepsAnalyzer: FileDepsAnalyzer;
    private readonly _tsFileDepsAnalyzer: TsFileDepsAnalyzer;
    private readonly _tsComponentDepsAnalyzer: TsComponentDepsAnalyzer;
    private readonly _pyan3Analyzer: Pyan3Analyzer;
    private readonly _astWalkAnalyzer: AstWalkAnalyzer;
    private readonly _rustModAnalyzer: RustModAnalyzer;
    private readonly _cargoAnalyzer: CargoAnalyzer;

    constructor(contextTracker: ContextTracker) {
        this._lspCCpp                 = LspAnalyzer.forCCpp(contextTracker);
        this._lspTsJs                 = LspAnalyzer.forTsJs(contextTracker);
        this._lspRust                 = LspAnalyzer.forRust(contextTracker);
        this._ctagsAnalyzer           = new CtagsAnalyzer();
        this._fileDepsAnalyzer        = new FileDepsAnalyzer();
        this._tsFileDepsAnalyzer      = new TsFileDepsAnalyzer();
        this._tsComponentDepsAnalyzer = new TsComponentDepsAnalyzer();
        this._pyan3Analyzer           = new Pyan3Analyzer();
        this._astWalkAnalyzer         = new AstWalkAnalyzer();
        this._rustModAnalyzer         = new RustModAnalyzer();
        this._cargoAnalyzer           = new CargoAnalyzer();
    }

    getChain(request: AnalysisRequest): IAnalyzer[] {
        const all: IAnalyzer[] = [
            this._lspCCpp,
            this._lspTsJs,
            this._lspRust,         // rust callGraph (primary via rust-analyzer)
            this._pyan3Analyzer,   // python callGraph (primary)
            this._ctagsAnalyzer,   // python/rust callGraph fallback + C/C++ fallback
            this._fileDepsAnalyzer,
            this._tsFileDepsAnalyzer,
            this._tsComponentDepsAnalyzer,
            this._astWalkAnalyzer, // python fileDeps
            this._rustModAnalyzer, // rust fileDeps
            this._cargoAnalyzer,   // rust componentDeps
        ];
        return all.filter(a => a.canHandle(request));
    }
}
