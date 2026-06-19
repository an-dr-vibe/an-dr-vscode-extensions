import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { workspace, Uri } from '../__mocks__/vscode';
import { FileDepsAnalyzer } from '../analyzers/language-agnostic/FileDepsAnalyzer';
import { AnalysisRequest } from '../analyzers/IAnalyzer';
import { EditorContext } from '../context/ContextTracker';

let tmpDir: string;

function makeFile(relPath: string, content: string): string {
    const abs = path.join(tmpDir, relPath).replace(/\\/g, '/');
    const dir = path.dirname(abs);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(abs, content);
    return abs;
}

function makeRequest(filePath: string, langId = 'c', depth = 2): AnalysisRequest {
    const ctx: EditorContext = {
        symbol: '',
        symbolSource: 'word',
        file: path.basename(filePath),
        filePath,
        lang: 'C',
        langId,
        isPinned: false,
    };
    return { context: ctx, graphType: 'fileDeps', depth };
}

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filedeps-'));
    workspace.__setWorkspaceFolders([{ uri: Uri.file(tmpDir), name: 'test', index: 0 }]);
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    workspace.__setWorkspaceFolders(undefined);
});

describe('FileDepsAnalyzer.canHandle', () => {
    const analyzer = new FileDepsAnalyzer();

    ['c', 'cpp', 'cuda-cpp', 'objective-c', 'objective-cpp'].forEach(lang => {
        it(`returns true for ${lang} + fileDeps`, () => {
            expect(analyzer.canHandle(makeRequest('/src/foo.c', lang))).toBe(true);
        });
    });

    it('returns false for c + callGraph', () => {
        const req = makeRequest('/src/foo.c', 'c');
        (req as any).graphType = 'callGraph';
        expect(analyzer.canHandle(req)).toBe(false);
    });

    it('returns false for python + fileDeps', () => {
        expect(analyzer.canHandle(makeRequest('/src/foo.py', 'python'))).toBe(false);
    });
});

describe('FileDepsAnalyzer.analyze', () => {
    let analyzer: FileDepsAnalyzer;
    beforeEach(() => { analyzer = new FileDepsAnalyzer(); });

    it('returns null when no workspace folders', async () => {
        workspace.__setWorkspaceFolders(undefined);
        const foo = makeFile('foo.c', 'int foo() {}');
        const result = await analyzer.analyze(makeRequest(foo));
        expect(result).toBeNull();
    });

    it('returns null when file has no includes and is not included by anyone', async () => {
        const foo = makeFile('foo.c', 'int foo() {}');
        const result = await analyzer.analyze(makeRequest(foo));
        expect(result).toBeNull();
    });

    it('finds a header included by the target file', async () => {
        makeFile('utils.h', 'void helper();');
        const foo = makeFile('foo.c', '#include "utils.h"\nint foo() {}');
        const result = await analyzer.analyze(makeRequest(foo));
        expect(result).not.toBeNull();
        const targetNode = result!.graph.nodes.find(n => n.role === 'target');
        expect(targetNode).toBeDefined();
        expect(targetNode!.label).toBe('foo.c');
        const calleeNode = result!.graph.nodes.find(n => n.label === 'utils.h');
        expect(calleeNode).toBeDefined();
        expect(calleeNode!.role).toBe('callee');
    });

    it('finds a source file that includes the target header', async () => {
        const header = makeFile('mylib.h', 'void mylib();');
        makeFile('main.c', '#include "mylib.h"\nint main() { return 0; }');
        const result = await analyzer.analyze(makeRequest(header));
        expect(result).not.toBeNull();
        const callerNode = result!.graph.nodes.find(n => n.label === 'main.c');
        expect(callerNode).toBeDefined();
        expect(callerNode!.role).toBe('caller');
        expect(result!.graph.edges.some(e => e.targetId === header)).toBe(true);
    });

    it('graph has correct graphType and tool', async () => {
        makeFile('defs.h', '#define FOO 1');
        const foo = makeFile('foo.c', '#include "defs.h"');
        const result = await analyzer.analyze(makeRequest(foo));
        expect(result!.graph.graphType).toBe('fileDeps');
        expect(result!.graph.tool).toBe('filedeps');
        expect(result!.graph.confidence).toBe('medium');
    });

    it('target node id equals the file path', async () => {
        makeFile('types.h', 'typedef int myint;');
        const foo = makeFile('foo.c', '#include "types.h"');
        const result = await analyzer.analyze(makeRequest(foo));
        expect(result!.graph.targetId).toBe(foo);
        expect(result!.graph.nodes.find(n => n.id === foo)).toBeDefined();
    });

    it('does not create a self-edge when target includes itself (pathological)', async () => {
        const foo = makeFile('foo.c', '#include "foo.c"\nint foo() {}');
        makeFile('bar.c', '#include "foo.c"');
        const result = await analyzer.analyze(makeRequest(foo));
        if (result) {
            const selfEdges = result.graph.edges.filter(e => e.sourceId === foo && e.targetId === foo);
            expect(selfEdges).toHaveLength(0);
        }
    });

    it('respects depth=1 — does not recurse into transitive includes', async () => {
        makeFile('c.h', '// c');
        makeFile('b.h', '#include "c.h"');
        const foo = makeFile('foo.c', '#include "b.h"');
        const result = await analyzer.analyze(makeRequest(foo, 'c', 1));
        if (result) {
            // depth=1: foo.c→b.h found, but b.h→c.h should NOT appear
            expect(result.graph.nodes.find(n => n.label === 'b.h')).toBeDefined();
            expect(result.graph.nodes.find(n => n.label === 'c.h')).toBeUndefined();
        }
    });

    it('returns null when signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();
        makeFile('defs.h', '');
        const foo = makeFile('foo.c', '#include "defs.h"');
        const req = { ...makeRequest(foo), signal: controller.signal };
        const result = await analyzer.analyze(req);
        expect(result).toBeNull();
    });

    it('handles angle-bracket includes (system headers) without crashing', async () => {
        const foo = makeFile('foo.c', '#include <stdio.h>\nint foo() {}');
        // stdio.h is not in the workspace so it won't be resolved — but should not throw
        const result = await analyzer.analyze(makeRequest(foo));
        // No workspace file matches stdio.h → only target node → null
        expect(result).toBeNull();
    });

    it('handles multiple includes — finds all callee nodes', async () => {
        makeFile('a.h', '');
        makeFile('b.h', '');
        const foo = makeFile('foo.c', '#include "a.h"\n#include "b.h"');
        const result = await analyzer.analyze(makeRequest(foo));
        expect(result).not.toBeNull();
        const calleeLabels = result!.graph.nodes.filter(n => n.role === 'callee').map(n => n.label);
        expect(calleeLabels).toContain('a.h');
        expect(calleeLabels).toContain('b.h');
    });
});
