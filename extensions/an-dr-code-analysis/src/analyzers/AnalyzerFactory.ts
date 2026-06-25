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

interface AnalyzerDescriptor {
    readonly id: string;
    readonly priority: number;
    readonly analyzer: IAnalyzer;
}

export class AnalyzerFactory {
    private readonly _registry: AnalyzerDescriptor[];

    constructor(contextTracker: ContextTracker) {
        this._registry = [
            { id: 'lsp-c-cpp',       priority: 10, analyzer: LspAnalyzer.forCCpp(contextTracker) },
            { id: 'lsp-ts-js',       priority: 20, analyzer: LspAnalyzer.forTsJs(contextTracker) },
            { id: 'lsp-rust',        priority: 30, analyzer: LspAnalyzer.forRust(contextTracker) },
            { id: 'pyan3',           priority: 40, analyzer: new Pyan3Analyzer() },
            { id: 'ctags',           priority: 50, analyzer: new CtagsAnalyzer() },
            { id: 'file-deps',       priority: 60, analyzer: new FileDepsAnalyzer() },
            { id: 'ts-file-deps',    priority: 70, analyzer: new TsFileDepsAnalyzer() },
            { id: 'ts-component',    priority: 80, analyzer: new TsComponentDepsAnalyzer() },
            { id: 'python-ast-walk', priority: 90, analyzer: new AstWalkAnalyzer() },
            { id: 'rust-mod',        priority: 100, analyzer: new RustModAnalyzer() },
            { id: 'cargo',           priority: 110, analyzer: new CargoAnalyzer() },
        ].sort((a, b) => a.priority - b.priority);
    }

    getChain(request: AnalysisRequest): IAnalyzer[] {
        return this._registry
            .map(entry => entry.analyzer)
            .filter(analyzer => analyzer.canHandle(request));
    }
}
