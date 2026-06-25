import { AnalysisRunner, AnalysisRunnerEvent, AnalysisCacheKey, AnalysisCachePort } from '../application/AnalysisRunner';
import { AnalysisRequest, AnalysisResult, IAnalyzer } from '../analyzers/IAnalyzer';
import { EditorContext } from '../context/ContextTracker';
import { GraphModel } from '../../shared/graph/GraphModel';

class FakeCache implements AnalysisCachePort {
    result?: AnalysisResult;
    setKey?: AnalysisCacheKey;
    setResult?: AnalysisResult;
    disposed = false;

    get(_key: AnalysisCacheKey): AnalysisResult | undefined {
        return this.result;
    }

    set(key: AnalysisCacheKey, result: AnalysisResult): void {
        this.setKey = key;
        this.setResult = result;
        this.result = result;
    }

    dispose(): void {
        this.disposed = true;
    }
}

function makeContext(langId = 'python'): EditorContext {
    return {
        symbol: 'target',
        symbolSource: 'document-symbol',
        file: 'sample.py',
        filePath: '/workspace/sample.py',
        lang: langId,
        langId,
        isPinned: false,
    };
}

function makeGraph(tool = 'test-tool'): GraphModel {
    return {
        graphType: 'callGraph',
        targetId: 'target',
        nodes: [{ id: 'target', label: 'target', fullName: 'target', role: 'target' }],
        edges: [],
        depth: 2,
        tool,
        confidence: 'high',
    };
}

function makeAnalyzer(
    name: string,
    analyze: (request: AnalysisRequest) => Promise<AnalysisResult | null>,
): IAnalyzer {
    return {
        name,
        canHandle: jest.fn(() => true),
        analyze: jest.fn(analyze),
    };
}

describe('AnalysisRunner', () => {
    it('emits an error without editor context', async () => {
        const chain = { getChain: jest.fn(() => []) };
        const runner = new AnalysisRunner(chain, { cache: new FakeCache(), maxDepth: () => 3, logger: { appendLine: jest.fn() } });
        const events: AnalysisRunnerEvent[] = [];

        await runner.run({ graphType: 'callGraph', depth: 2, context: null }, e => events.push(e));

        expect(events).toEqual([{
            type: 'error',
            graphType: 'callGraph',
            message: 'No file open. Open a file and place the cursor on a symbol.',
        }]);
        expect(chain.getChain).not.toHaveBeenCalled();
    });

    it('emits cached results without invoking analyzers', async () => {
        const cache = new FakeCache();
        const result = { graph: makeGraph('cache') };
        cache.result = result;
        const chain = { getChain: jest.fn(() => []) };
        const runner = new AnalysisRunner(chain, { cache, maxDepth: () => 3, logger: { appendLine: jest.fn() } });
        const events: AnalysisRunnerEvent[] = [];

        await runner.run({ graphType: 'callGraph', depth: 2, context: makeContext() }, e => events.push(e));

        expect(events).toEqual([{ type: 'result', graph: result.graph, fromCache: true }]);
        expect(chain.getChain).not.toHaveBeenCalled();
    });

    it('falls through analyzer chain, clamps depth, and caches the first result', async () => {
        const cache = new FakeCache();
        const first = makeAnalyzer('first', async () => null);
        const secondResult = { graph: makeGraph('second') };
        const second = makeAnalyzer('second', async () => secondResult);
        const chain = { getChain: jest.fn(() => [first, second]) };
        const runner = new AnalysisRunner(chain, { cache, maxDepth: () => 3, logger: { appendLine: jest.fn() } });
        const events: AnalysisRunnerEvent[] = [];

        await runner.run({ graphType: 'callGraph', depth: 99, context: makeContext() }, e => events.push(e));

        expect(events).toEqual([
            { type: 'busy', graphType: 'callGraph', message: undefined },
            { type: 'result', graph: secondResult.graph, fromCache: false },
        ]);
        expect(first.analyze).toHaveBeenCalledWith(expect.objectContaining({ depth: 3 }));
        expect(second.analyze).toHaveBeenCalledWith(expect.objectContaining({ depth: 3 }));
        expect(cache.setKey).toEqual({
            filePath: '/workspace/sample.py',
            graphType: 'callGraph',
            depth: 3,
            symbol: 'target',
        });
        expect(cache.setResult).toBe(secondResult);
    });

    it('emits cancellation when the current run is cancelled', async () => {
        let resolveAnalysis: (value: AnalysisResult | null) => void = () => {};
        const analyzer = makeAnalyzer('slow', () => new Promise(resolve => { resolveAnalysis = resolve; }));
        const chain = { getChain: jest.fn(() => [analyzer]) };
        const runner = new AnalysisRunner(chain, { cache: new FakeCache(), maxDepth: () => 3, logger: { appendLine: jest.fn() } });
        const events: AnalysisRunnerEvent[] = [];

        const running = runner.run({ graphType: 'callGraph', depth: 2, context: makeContext() }, e => events.push(e));
        await Promise.resolve();
        runner.cancel();
        resolveAnalysis(null);
        await running;

        expect(events).toEqual([
            { type: 'busy', graphType: 'callGraph', message: undefined },
            { type: 'cancelled', graphType: 'callGraph' },
        ]);
    });
});
