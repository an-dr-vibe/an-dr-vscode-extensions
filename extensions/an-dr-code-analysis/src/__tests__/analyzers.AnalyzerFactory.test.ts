import { AnalyzerFactory } from '../analyzers/AnalyzerFactory';
import { AnalysisRequest } from '../analyzers/IAnalyzer';
import { EditorContext } from '../context/ContextTracker';

// LspAnalyzer.canHandle gates on ClangdHealth.checkDetail() — mock it to return
// a clean result so the factory tests aren't affected by the local filesystem.
jest.mock('../tools/ClangdHealth', () => ({
    ClangdHealth: {
        check: jest.fn(() => ({ name: 'clangd', state: 'ok', group: 'c-cpp' })),
        checkDetail: jest.fn(() => ({ issue: null, message: '', compileCommandsPath: '/fake/compile_commands.json' })),
    },
}));

function makeRequest(langId: string, graphType: 'callGraph' | 'fileDeps' | 'componentDeps'): AnalysisRequest {
    const ctx: EditorContext = {
        symbol: 'foo',
        symbolSource: 'word',
        file: 'foo.c',
        filePath: '/src/foo.c',
        lang: 'C',
        langId,
        isPinned: false,
    };
    return { context: ctx, graphType, depth: 2 };
}

// AnalyzerFactory requires a ContextTracker but only uses it inside LspAnalyzer.analyze(),
// which is never called in these tests (we only call canHandle/getChain).
const fakeTracker = {} as any;

describe('AnalyzerFactory.getChain', () => {
    let factory: AnalyzerFactory;
    beforeEach(() => { factory = new AnalyzerFactory(fakeTracker); });

    it('returns two analyzers (LspAnalyzer + CtagsAnalyzer) for C callGraph', () => {
        const chain = factory.getChain(makeRequest('c', 'callGraph'));
        expect(chain).toHaveLength(2);
        expect(chain[0].name).toBe('clangd');
        expect(chain[1].name).toBe('ctags');
    });

    it('returns two analyzers for C++ callGraph', () => {
        const chain = factory.getChain(makeRequest('cpp', 'callGraph'));
        expect(chain).toHaveLength(2);
    });

    it('returns two analyzers for cuda-cpp callGraph', () => {
        const chain = factory.getChain(makeRequest('cuda-cpp', 'callGraph'));
        expect(chain).toHaveLength(2);
    });

    it('returns one analyzer (tsserver) for TypeScript callGraph', () => {
        const chain = factory.getChain(makeRequest('typescript', 'callGraph'));
        expect(chain).toHaveLength(1);
        expect(chain[0].name).toBe('tsserver');
    });

    it('returns one analyzer (tsserver) for TypeScript fileDeps', () => {
        const chain = factory.getChain(makeRequest('typescript', 'fileDeps'));
        expect(chain).toHaveLength(1);
        expect(chain[0].name).toBe('tsserver');
    });

    it('returns one analyzer (tsconfig) for TypeScript componentDeps', () => {
        const chain = factory.getChain(makeRequest('typescript', 'componentDeps'));
        expect(chain).toHaveLength(1);
        expect(chain[0].name).toBe('tsconfig');
    });

    it('returns one analyzer (tsserver) for JavaScript callGraph', () => {
        const chain = factory.getChain(makeRequest('javascript', 'callGraph'));
        expect(chain).toHaveLength(1);
        expect(chain[0].name).toBe('tsserver');
    });

    it('returns one analyzer (FileDepsAnalyzer) for C fileDeps', () => {
        const chain = factory.getChain(makeRequest('c', 'fileDeps'));
        expect(chain).toHaveLength(1);
        expect(chain[0].name).toBe('filedeps');
    });

    it('returns empty chain for C componentDeps (not yet implemented)', () => {
        const chain = factory.getChain(makeRequest('c', 'componentDeps'));
        expect(chain).toHaveLength(0);
    });

    it('LspAnalyzer is always first in chain (priority order)', () => {
        const chain = factory.getChain(makeRequest('c', 'callGraph'));
        expect(chain[0].name).toBe('clangd');
    });

    it('all returned analyzers can handle the request', () => {
        const req = makeRequest('cpp', 'callGraph');
        const chain = factory.getChain(req);
        chain.forEach(a => expect(a.canHandle(req)).toBe(true));
    });
});

describe('LspAnalyzer.canHandle', () => {
    let factory: AnalyzerFactory;
    beforeEach(() => { factory = new AnalyzerFactory(fakeTracker); });

    const supported = ['c', 'cpp', 'cuda-cpp', 'objective-c', 'objective-cpp'];
    supported.forEach(lang => {
        it(`handles ${lang} + callGraph`, () => {
            const chain = factory.getChain(makeRequest(lang, 'callGraph'));
            expect(chain.some(a => a.name === 'clangd')).toBe(true);
        });
    });

    it('does not handle python + callGraph', () => {
        const chain = factory.getChain(makeRequest('python', 'callGraph'));
        expect(chain.some(a => a.name === 'clangd')).toBe(false);
    });
});

describe('CtagsAnalyzer.canHandle', () => {
    let factory: AnalyzerFactory;
    beforeEach(() => { factory = new AnalyzerFactory(fakeTracker); });

    const supported = ['c', 'cpp', 'cuda-cpp', 'objective-c', 'objective-cpp'];
    supported.forEach(lang => {
        it(`handles ${lang} + callGraph`, () => {
            const chain = factory.getChain(makeRequest(lang, 'callGraph'));
            expect(chain.some(a => a.name === 'ctags')).toBe(true);
        });
    });

    it('does not handle rust + callGraph', () => {
        const chain = factory.getChain(makeRequest('rust', 'callGraph'));
        expect(chain.some(a => a.name === 'ctags')).toBe(false);
    });

    it('does not handle c + fileDeps', () => {
        const chain = factory.getChain(makeRequest('c', 'fileDeps'));
        expect(chain.some(a => a.name === 'ctags')).toBe(false);
    });
});

describe('FileDepsAnalyzer.canHandle', () => {
    let factory: AnalyzerFactory;
    beforeEach(() => { factory = new AnalyzerFactory(fakeTracker); });

    const supported = ['c', 'cpp', 'cuda-cpp', 'objective-c', 'objective-cpp'];
    supported.forEach(lang => {
        it(`handles ${lang} + fileDeps`, () => {
            const chain = factory.getChain(makeRequest(lang, 'fileDeps'));
            expect(chain.some(a => a.name === 'filedeps')).toBe(true);
        });
    });

    it('does not handle rust + fileDeps', () => {
        const chain = factory.getChain(makeRequest('rust', 'fileDeps'));
        expect(chain.some(a => a.name === 'filedeps')).toBe(false);
    });

    it('does not handle c + callGraph', () => {
        const chain = factory.getChain(makeRequest('c', 'callGraph'));
        expect(chain.some(a => a.name === 'filedeps')).toBe(false);
    });
});
