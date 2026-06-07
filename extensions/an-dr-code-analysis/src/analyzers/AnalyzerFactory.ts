import { IAnalyzer, AnalysisRequest } from './IAnalyzer';

export class AnalyzerFactory {
    getChain(_request: AnalysisRequest): IAnalyzer[] {
        return [];
    }
}
