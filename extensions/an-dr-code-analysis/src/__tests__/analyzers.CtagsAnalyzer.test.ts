// Tests for CtagsAnalyzer.
// Strategy: mock child_process.execFile so runCtags() returns controlled JSON,
// and use real temp files so findCallers() can actually read call sites.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { workspace, Uri } from '../__mocks__/vscode';

// Must mock before importing CtagsAnalyzer so the module-level promisify picks it up.
jest.mock('child_process', () => ({
    execFile: jest.fn(),
}));

import * as cp from 'child_process';
import { CtagsAnalyzer } from '../analyzers/cli/CtagsAnalyzer';
import { AnalysisRequest } from '../analyzers/IAnalyzer';
import { EditorContext } from '../context/ContextTracker';

const mockExecFile = cp.execFile as unknown as jest.Mock;

let tmpDir: string;

function makeTmpFile(name: string, content: string): string {
    const p = path.join(tmpDir, name).replace(/\\/g, '/');
    fs.writeFileSync(p, content);
    return p;
}

function ctagsJsonLines(entries: { name: string; path: string; line: number; kind?: string }[]): string {
    return entries.map(e => JSON.stringify({ name: e.name, path: e.path, line: e.line, kind: e.kind ?? 'function' })).join('\n');
}

function setupExecFile(stdout: string) {
    mockExecFile.mockImplementation((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
        cb(null, { stdout, stderr: '' });
    });
}

function makeRequest(symbol: string, langId = 'c'): AnalysisRequest {
    const ctx: EditorContext = {
        symbol,
        symbolSource: 'word',
        file: 'foo.c',
        filePath: path.join(tmpDir, 'foo.c').replace(/\\/g, '/'),
        lang: 'C',
        langId,
        isPinned: false,
    };
    return { context: ctx, graphType: 'callGraph', depth: 2 };
}

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctags-test-'));
    workspace.__setWorkspaceFolders([{ uri: Uri.file(tmpDir), name: 'test', index: 0 }]);
    jest.clearAllMocks();
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    workspace.__setWorkspaceFolders(undefined);
});

describe('CtagsAnalyzer.canHandle', () => {
    const analyzer = new CtagsAnalyzer();

    ['c', 'cpp', 'cuda-cpp', 'objective-c', 'objective-cpp'].forEach(lang => {
        it(`returns true for ${lang} + callGraph`, () => {
            expect(analyzer.canHandle(makeRequest('foo', lang))).toBe(true);
        });
    });

    ['python', 'typescript', 'rust', 'go'].forEach(lang => {
        it(`returns false for ${lang} + callGraph`, () => {
            expect(analyzer.canHandle(makeRequest('foo', lang))).toBe(false);
        });
    });

    it('returns false for c + fileDeps', () => {
        const req = makeRequest('foo', 'c');
        (req as any).graphType = 'fileDeps';
        expect(analyzer.canHandle(req)).toBe(false);
    });
});

describe('CtagsAnalyzer.analyze', () => {
    let analyzer: CtagsAnalyzer;
    beforeEach(() => { analyzer = new CtagsAnalyzer(); });

    it('returns null when ctags output is empty', async () => {
        setupExecFile('');
        const result = await analyzer.analyze(makeRequest('foo'));
        expect(result).toBeNull();
    });

    it('returns null when target symbol is not in ctags output', async () => {
        const filePath = makeTmpFile('foo.c', 'int bar() {}');
        const stdout = ctagsJsonLines([{ name: 'bar', path: filePath, line: 1 }]);
        setupExecFile(stdout);
        const result = await analyzer.analyze(makeRequest('foo'));
        expect(result).toBeNull();
    });

    it('returns graph with target node when symbol found but no callers', async () => {
        const filePath = makeTmpFile('foo.c', 'int foo() {}');
        const stdout = ctagsJsonLines([{ name: 'foo', path: filePath, line: 1 }]);
        setupExecFile(stdout);
        const result = await analyzer.analyze(makeRequest('foo'));
        expect(result).not.toBeNull();
        expect(result!.graph.nodes).toHaveLength(1);
        expect(result!.graph.nodes[0].role).toBe('target');
        expect(result!.graph.nodes[0].label).toBe('foo');
    });

    it('returns graph with caller node when a caller is found', async () => {
        const fooPath = makeTmpFile('foo.c', 'int foo() {}\nint bar() { foo(); }');
        const stdout = ctagsJsonLines([
            { name: 'foo', path: fooPath, line: 1 },
            { name: 'bar', path: fooPath, line: 2 },
        ]);
        setupExecFile(stdout);
        const result = await analyzer.analyze(makeRequest('foo'));
        expect(result).not.toBeNull();
        const callerNode = result!.graph.nodes.find(n => n.label === 'bar');
        expect(callerNode).toBeDefined();
        expect(callerNode!.role).toBe('caller');
        expect(result!.graph.edges).toHaveLength(1);
        expect(result!.graph.edges[0].targetId).toBe(result!.graph.targetId);
    });

    it('does not include the target as its own caller', async () => {
        // foo() calls itself (recursion) — should not produce a self-edge
        const fooPath = makeTmpFile('foo.c', 'int foo() { foo(); }');
        const stdout = ctagsJsonLines([{ name: 'foo', path: fooPath, line: 1 }]);
        setupExecFile(stdout);
        const result = await analyzer.analyze(makeRequest('foo'));
        expect(result!.graph.edges).toHaveLength(0);
    });

    it('deduplicates callers from multiple call sites in same function', async () => {
        const content = 'int bar() { foo(); foo(); foo(); }\nint foo() {}';
        const fooPath = makeTmpFile('foo.c', content);
        const stdout = ctagsJsonLines([
            { name: 'bar', path: fooPath, line: 1 },
            { name: 'foo', path: fooPath, line: 2 },
        ]);
        setupExecFile(stdout);
        const result = await analyzer.analyze(makeRequest('foo'));
        const callerNodes = result!.graph.nodes.filter(n => n.role === 'caller');
        expect(callerNodes).toHaveLength(1);
        expect(result!.graph.edges).toHaveLength(1);
    });

    it('strips parameters from symbol name before matching', async () => {
        // symbol might come in as "foo(int, char)" from clangd context
        const fooPath = makeTmpFile('foo.c', 'int foo() {}');
        const stdout = ctagsJsonLines([{ name: 'foo', path: fooPath, line: 1 }]);
        setupExecFile(stdout);
        const result = await analyzer.analyze(makeRequest('foo(int, char)'));
        expect(result).not.toBeNull();
        expect(result!.graph.nodes[0].label).toBe('foo');
    });

    it('sets confidence=medium and tool=ctags on result', async () => {
        const fooPath = makeTmpFile('foo.c', 'int foo() {}');
        const stdout = ctagsJsonLines([{ name: 'foo', path: fooPath, line: 1 }]);
        setupExecFile(stdout);
        const result = await analyzer.analyze(makeRequest('foo'));
        expect(result!.graph.confidence).toBe('medium');
        expect(result!.graph.tool).toBe('ctags');
    });

    it('finds callers from a different file', async () => {
        const fooPath = makeTmpFile('lib.c', 'int foo() {}');
        const mainPath = makeTmpFile('main.c', 'int main() { foo(); return 0; }');
        const stdout = ctagsJsonLines([
            { name: 'foo',  path: fooPath,  line: 1 },
            { name: 'main', path: mainPath, line: 1 },
        ]);
        setupExecFile(stdout);
        const result = await analyzer.analyze(makeRequest('foo'));
        expect(result!.graph.nodes.find(n => n.label === 'main')).toBeDefined();
    });

    it('returns null when signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        const req = { ...makeRequest('foo'), signal: controller.signal };
        const result = await analyzer.analyze(req);
        expect(result).toBeNull();
    });

    it('returns null when no workspace folders', async () => {
        workspace.__setWorkspaceFolders(undefined);
        const result = await analyzer.analyze(makeRequest('foo'));
        expect(result).toBeNull();
    });

    it('returns null when symbol is empty string', async () => {
        const result = await analyzer.analyze(makeRequest(''));
        expect(result).toBeNull();
    });
});
