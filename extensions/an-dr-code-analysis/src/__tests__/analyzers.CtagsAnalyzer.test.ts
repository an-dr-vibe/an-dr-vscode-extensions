// Tests for CtagsAnalyzer.
// Strategy: mock child_process.spawn so runCtags() returns controlled JSON via a fake stream,
// and use real temp files so findCallers() can actually read call sites.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';
import { workspace, Uri } from '../__mocks__/vscode';

// Mock spawn before importing CtagsAnalyzer.
jest.mock('child_process', () => ({
    spawn: jest.fn(),
}));

import * as cp from 'child_process';
import { CtagsAnalyzer } from '../analyzers/language-agnostic/CtagsAnalyzer';
import { AnalysisRequest } from '../analyzers/IAnalyzer';
import { EditorContext } from '../context/ContextTracker';

const mockSpawn = cp.spawn as unknown as jest.Mock;

let tmpDir: string;

function makeTmpFile(name: string, content: string): string {
    const p = path.join(tmpDir, name).replace(/\\/g, '/');
    fs.writeFileSync(p, content);
    return p;
}

function ctagsJsonLines(entries: { name: string; path: string; line: number; kind?: string }[]): string {
    return entries.map(e => JSON.stringify({ name: e.name, path: e.path, line: e.line, kind: e.kind ?? 'function' })).join('\n');
}

// Create a fake ChildProcess that emits stdout data then fires 'close'.
function makeFakeProc(stdoutData: string) {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.kill = jest.fn();
    process.nextTick(() => {
        if (stdoutData) { proc.stdout.emit('data', Buffer.from(stdoutData)); }
        proc.emit('close', 0);
    });
    return proc;
}

function setupSpawn(stdout: string) {
    mockSpawn.mockImplementation(() => makeFakeProc(stdout));
}

// Alias helpers named after the old execFile helper for minimal test body changes.
function stubCtags(lines: string[]) {
    setupSpawn(lines.join('\n'));
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
        setupSpawn('');
        const result = await analyzer.analyze(makeRequest('foo'));
        expect(result).toBeNull();
    });

    it('returns null when target symbol is not in ctags output', async () => {
        const filePath = makeTmpFile('foo.c', 'int bar() {}');
        const stdout = ctagsJsonLines([{ name: 'bar', path: filePath, line: 1 }]);
        setupSpawn(stdout);
        const result = await analyzer.analyze(makeRequest('foo'));
        expect(result).toBeNull();
    });

    it('returns graph with target node when symbol found but no callers', async () => {
        const filePath = makeTmpFile('foo.c', 'int foo() {}');
        const stdout = ctagsJsonLines([{ name: 'foo', path: filePath, line: 1 }]);
        setupSpawn(stdout);
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
        setupSpawn(stdout);
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
        setupSpawn(stdout);
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
        setupSpawn(stdout);
        const result = await analyzer.analyze(makeRequest('foo'));
        const callerNodes = result!.graph.nodes.filter(n => n.role === 'caller');
        expect(callerNodes).toHaveLength(1);
        expect(result!.graph.edges).toHaveLength(1);
    });

    it('strips parameters from symbol name before matching', async () => {
        // symbol might come in as "foo(int, char)" from clangd context
        const fooPath = makeTmpFile('foo.c', 'int foo() {}');
        const stdout = ctagsJsonLines([{ name: 'foo', path: fooPath, line: 1 }]);
        setupSpawn(stdout);
        const result = await analyzer.analyze(makeRequest('foo(int, char)'));
        expect(result).not.toBeNull();
        expect(result!.graph.nodes[0].label).toBe('foo');
    });

    it('sets confidence=medium and tool=ctags on result', async () => {
        const fooPath = makeTmpFile('foo.c', 'int foo() {}');
        const stdout = ctagsJsonLines([{ name: 'foo', path: fooPath, line: 1 }]);
        setupSpawn(stdout);
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
        setupSpawn(stdout);
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

// ── Edge cases and fixed bugs ─────────────────────────────────────────────────

function jsonLine(name: string, filePath: string, line: number, kind = 'function'): string {
    return JSON.stringify({ name, path: filePath, line, kind });
}

describe('C1 fix: targetName with regex special characters', () => {
    it('symbol with C++ operator+ does not throw', () => {
        const fooPath = makeTmpFile('foo.cpp', 'void operator+() {}');
        stubCtags([jsonLine('operator+', fooPath, 1)]);
        const analyzer = new CtagsAnalyzer();
        return expect(analyzer.analyze(makeRequest('operator+', 'cpp'))).resolves.toBeDefined();
    });

    it('symbol with square bracket does not throw', () => {
        const fooPath = makeTmpFile('foo.c', 'int arr[0] = {};');
        stubCtags([jsonLine('arr[0]', fooPath, 1)]);
        const analyzer = new CtagsAnalyzer();
        return expect(analyzer.analyze(makeRequest('arr[0]'))).resolves.toBeDefined();
    });
});

describe('C3/C4 fix: 0-based line numbers', () => {
    it('targetId and callerId both use 0-based lines', () => {
        const fooPath = makeTmpFile('lib.c', 'int foo() {}\nint bar() { foo(); }');
        stubCtags([jsonLine('foo', fooPath, 1), jsonLine('bar', fooPath, 2)]);
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('foo')).then(result => {
            if (!result) { return; }
            expect(result.graph.targetId).toMatch(/:0:foo$/);
            const callerNode = result.graph.nodes.find(n => n.role === 'caller');
            if (callerNode) { expect(callerNode.id).toMatch(/:1:bar$/); }
        });
    });

    it('C4 fix: ctags entry with line=0 produces target node with line=0', () => {
        const fooPath = makeTmpFile('foo.c', 'int foo() {}');
        stubCtags([jsonLine('foo', fooPath, 0)]);
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('foo')).then(result => {
            if (result) { expect(result.graph.nodes[0].line).toBe(0); }
        });
    });
});

describe('C5 fix: multiple ctags entries for same symbol (overloads)', () => {
    it('first matching ctags entry is used as target definition', () => {
        const fooPath = makeTmpFile('foo.cpp', 'void foo(int x) {}\nvoid foo(double y) {}');
        stubCtags([jsonLine('foo', fooPath, 1), jsonLine('foo', fooPath, 2)]);
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('foo', 'cpp')).then(result => {
            expect(result).not.toBeNull();
            expect(result!.graph.nodes.find(n => n.role === 'target')!.line).toBe(0);
        });
    });
});

describe('symbol stripping edge cases', () => {
    it('symbol with only parentheses strips to empty string → returns null', () => {
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('()')).then(result => expect(result).toBeNull());
    });

    it('symbol with surrounding spaces strips correctly', () => {
        const fooPath = makeTmpFile('foo.c', 'int foo() {}');
        stubCtags([jsonLine('foo', fooPath, 1)]);
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('  foo  ')).then(result => {
            expect(result).not.toBeNull();
            expect(result!.graph.nodes[0].label).toBe('foo');
        });
    });

    it('symbol that is only whitespace returns null', () => {
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('   ')).then(result => expect(result).toBeNull());
    });
});

describe('robustness: malformed ctags JSON', () => {
    it('single invalid JSON line among valid lines does not crash', () => {
        const fooPath = makeTmpFile('foo.c', 'int foo() {}');
        stubCtags(['not-json-at-all', jsonLine('foo', fooPath, 1), '{"incomplete":']);
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('foo')).then(result => {
            expect(result).not.toBeNull();
            expect(result!.graph.nodes[0].label).toBe('foo');
        });
    });

    it('ctags entry missing "name" field is filtered out', () => {
        const fooPath = makeTmpFile('foo.c', 'int foo() {}');
        stubCtags([
            JSON.stringify({ path: fooPath, line: 1, kind: 'function' }),
            jsonLine('foo', fooPath, 1),
        ]);
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('foo')).then(result => expect(result).not.toBeNull());
    });
});

describe('edge: call before any function definition', () => {
    it('file-scope call has no enclosing function — not attributed as caller', () => {
        const fooPath = makeTmpFile('foo.c', 'foo();\nint bar() {}\nint foo() {}');
        stubCtags([jsonLine('bar', fooPath, 2), jsonLine('foo', fooPath, 3)]);
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('foo')).then(result => {
            expect(result!.graph.nodes.filter(n => n.role === 'caller')).toHaveLength(0);
        });
    });
});

describe('canHandle uses langId not file extension', () => {
    it('.h file opened as langId=c is handled', () => {
        const analyzer = new CtagsAnalyzer();
        const req: AnalysisRequest = {
            context: { symbol: 'foo', symbolSource: 'word', file: 'foo.h', filePath: '/src/foo.h', lang: 'C', langId: 'c', isPinned: false },
            graphType: 'callGraph', depth: 2,
        };
        expect(analyzer.canHandle(req)).toBe(true);
    });
});
