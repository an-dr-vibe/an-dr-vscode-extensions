import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AnalysisCache } from '../cache/AnalysisCache';
import { workspace, Uri } from '../__mocks__/vscode';
import { AnalysisResult } from '../analyzers/IAnalyzer';
import { GraphModel } from '../../shared/graph/GraphModel';

function makeResult(tool = 'clangd'): AnalysisResult {
    const graph: GraphModel = {
        graphType: 'callGraph',
        targetId: 'id',
        nodes: [{ id: 'id', label: 'foo', fullName: 'foo', role: 'target' }],
        edges: [],
        depth: 2,
        tool,
        confidence: 'high',
    };
    return { graph };
}

let tmpFile: string;

beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `cache-test-${Date.now()}.c`);
    fs.writeFileSync(tmpFile, 'int foo() {}');
    jest.clearAllMocks();
});

afterEach(() => {
    if (fs.existsSync(tmpFile)) { fs.unlinkSync(tmpFile); }
});

describe('AnalysisCache', () => {
    it('returns undefined for an unknown key', () => {
        const cache = new AnalysisCache();
        const result = cache.get({ filePath: tmpFile, graphType: 'callGraph', depth: 2 });
        expect(result).toBeUndefined();
        cache.dispose();
    });

    it('returns stored result immediately after set', () => {
        const cache = new AnalysisCache();
        const key = { filePath: tmpFile, graphType: 'callGraph' as const, depth: 2 };
        const result = makeResult();
        cache.set(key, result);
        expect(cache.get(key)).toBe(result);
        cache.dispose();
    });

    it('distinguishes keys by graphType', () => {
        const cache = new AnalysisCache();
        const r1 = makeResult('clangd');
        const r2 = makeResult('ctags');
        cache.set({ filePath: tmpFile, graphType: 'callGraph', depth: 2 }, r1);
        cache.set({ filePath: tmpFile, graphType: 'fileDeps', depth: 2 }, r2);
        expect(cache.get({ filePath: tmpFile, graphType: 'callGraph', depth: 2 })).toBe(r1);
        expect(cache.get({ filePath: tmpFile, graphType: 'fileDeps', depth: 2 })).toBe(r2);
        cache.dispose();
    });

    it('distinguishes keys by depth', () => {
        const cache = new AnalysisCache();
        const r1 = makeResult();
        const r2 = makeResult();
        cache.set({ filePath: tmpFile, graphType: 'callGraph', depth: 2 }, r1);
        cache.set({ filePath: tmpFile, graphType: 'callGraph', depth: 3 }, r2);
        expect(cache.get({ filePath: tmpFile, graphType: 'callGraph', depth: 2 })).toBe(r1);
        expect(cache.get({ filePath: tmpFile, graphType: 'callGraph', depth: 3 })).toBe(r2);
        cache.dispose();
    });

    it('distinguishes keys by symbol', () => {
        const cache = new AnalysisCache();
        const r1 = makeResult();
        const r2 = makeResult();
        cache.set({ filePath: tmpFile, graphType: 'callGraph', depth: 2, symbol: 'foo' }, r1);
        cache.set({ filePath: tmpFile, graphType: 'callGraph', depth: 2, symbol: 'bar' }, r2);
        expect(cache.get({ filePath: tmpFile, graphType: 'callGraph', depth: 2, symbol: 'foo' })).toBe(r1);
        expect(cache.get({ filePath: tmpFile, graphType: 'callGraph', depth: 2, symbol: 'bar' })).toBe(r2);
        cache.dispose();
    });

    it('invalidates entry when file mtime changes', () => {
        const cache = new AnalysisCache();
        const key = { filePath: tmpFile, graphType: 'callGraph' as const, depth: 2 };
        cache.set(key, makeResult());
        // Modify the file mtime explicitly to guarantee a detectable change
        const past = new Date(Date.now() - 5000);
        fs.utimesSync(tmpFile, past, past);
        expect(cache.get(key)).toBeUndefined();
        cache.dispose();
    });

    it('returns undefined when file does not exist', () => {
        const cache = new AnalysisCache();
        const key = { filePath: '/nonexistent/file.c', graphType: 'callGraph' as const, depth: 2 };
        // set would silently fail since stat throws
        cache.set(key, makeResult());
        expect(cache.get(key)).toBeUndefined();
        cache.dispose();
    });

    it('invalidates via watcher onDidChange', () => {
        const cache = new AnalysisCache();
        const key = { filePath: tmpFile, graphType: 'callGraph' as const, depth: 2 };
        cache.set(key, makeResult());
        // Simulate watcher firing before mtime changes
        workspace.__triggerFileChange(Uri.file(tmpFile));
        // After watcher fires the entry is gone regardless of mtime
        expect(cache.get(key)).toBeUndefined();
        cache.dispose();
    });

    it('invalidates via watcher onDidDelete', () => {
        const cache = new AnalysisCache();
        const key = { filePath: tmpFile, graphType: 'callGraph' as const, depth: 2 };
        cache.set(key, makeResult());
        workspace.__triggerFileDelete(Uri.file(tmpFile));
        expect(cache.get(key)).toBeUndefined();
        cache.dispose();
    });

    it('does not invalidate a different file', () => {
        const cache = new AnalysisCache();
        const key = { filePath: tmpFile, graphType: 'callGraph' as const, depth: 2 };
        const result = makeResult();
        cache.set(key, result);
        workspace.__triggerFileChange(Uri.file('/other/file.c'));
        expect(cache.get(key)).toBe(result);
        cache.dispose();
    });
});

// ── Edge cases and fixed bugs ─────────────────────────────────────────────────

describe('A1 fix: symbol=undefined and symbol="" produce distinct cache entries', () => {
    it('undefined symbol and empty-string symbol map to different entries', () => {
        const cache = new AnalysisCache();
        const r1 = makeResult('clangd');
        const r2 = makeResult('ctags');
        cache.set({ filePath: tmpFile, graphType: 'callGraph', depth: 2, symbol: undefined }, r1);
        cache.set({ filePath: tmpFile, graphType: 'callGraph', depth: 2, symbol: '' },        r2);
        expect(cache.get({ filePath: tmpFile, graphType: 'callGraph', depth: 2, symbol: undefined })).toBe(r1);
        expect(cache.get({ filePath: tmpFile, graphType: 'callGraph', depth: 2, symbol: '' })).toBe(r2);
        cache.dispose();
    });

    it('undefined (omitted) symbol and empty-string symbol are stored independently', () => {
        const cache = new AnalysisCache();
        const r1 = makeResult('clangd');
        const r2 = makeResult('ctags');
        cache.set({ filePath: tmpFile, graphType: 'callGraph', depth: 2 }, r1);
        cache.set({ filePath: tmpFile, graphType: 'callGraph', depth: 2, symbol: '' }, r2);
        expect(cache.get({ filePath: tmpFile, graphType: 'callGraph', depth: 2 })).toBe(r1);
        expect(cache.get({ filePath: tmpFile, graphType: 'callGraph', depth: 2, symbol: '' })).toBe(r2);
        cache.dispose();
    });
});

describe('A2 fix: _invalidateFile uses \\0 separator — no false prefix collisions', () => {
    it('path containing | does not cause false invalidation of unrelated key', () => {
        const cache = new AnalysisCache();
        const realFile = path.join(os.tmpdir(), `cache-test-pipe-${Date.now()}.c`);
        fs.writeFileSync(realFile, 'int foo(){}');
        try {
            const pathWithPipe = os.tmpdir().replace(/\\/g, '/') + '/a';
            const keyStr = `${pathWithPipe}|b/test.c|callGraph|2|`;
            (cache as any)._map.set(keyStr, { result: makeResult(), mtime: fs.statSync(realFile).mtimeMs });
            workspace.__triggerFileChange(Uri.file(pathWithPipe));
            // A2 fix: \0 separator means pathWithPipe+'\0' does NOT match keyStr which uses '|'
            expect((cache as any)._map.has(keyStr)).toBe(true);
        } finally {
            fs.unlinkSync(realFile);
            cache.dispose();
        }
    });

    it('invalidating foo.c does not invalidate foo.cpp', () => {
        const fileC   = path.join(os.tmpdir(), `cache-sep-c-${Date.now()}.c`);
        const fileCpp = path.join(os.tmpdir(), `cache-sep-cpp-${Date.now()}.cpp`);
        fs.writeFileSync(fileC,   'int foo(){}');
        fs.writeFileSync(fileCpp, 'int foo(){}');
        const cache = new AnalysisCache();
        const r1 = makeResult('clangd');
        const r2 = makeResult('ctags');
        cache.set({ filePath: fileC,   graphType: 'callGraph', depth: 2 }, r1);
        cache.set({ filePath: fileCpp, graphType: 'callGraph', depth: 2 }, r2);
        workspace.__triggerFileChange(Uri.file(fileC));
        expect(cache.get({ filePath: fileC,   graphType: 'callGraph', depth: 2 })).toBeUndefined();
        expect(cache.get({ filePath: fileCpp, graphType: 'callGraph', depth: 2 })).toBe(r2);
        cache.dispose();
        fs.unlinkSync(fileC);
        fs.unlinkSync(fileCpp);
    });
});

describe('set() on non-existent file silently does nothing', () => {
    it('does not throw and returns undefined on get', () => {
        const cache = new AnalysisCache();
        const key = { filePath: '/nonexistent/path/ghost.c', graphType: 'callGraph' as const, depth: 2 };
        expect(() => cache.set(key, makeResult())).not.toThrow();
        expect(cache.get(key)).toBeUndefined();
        cache.dispose();
    });
});

describe('different graphTypes are independent entries', () => {
    it('callGraph and fileDeps entries for same file do not collide', () => {
        const cache = new AnalysisCache();
        const r1 = makeResult();
        const r2 = makeResult();
        cache.set({ filePath: tmpFile, graphType: 'callGraph', depth: 2 }, r1);
        cache.set({ filePath: tmpFile, graphType: 'fileDeps',  depth: 2 }, r2);
        expect(cache.get({ filePath: tmpFile, graphType: 'callGraph', depth: 2 })).toBe(r1);
        expect(cache.get({ filePath: tmpFile, graphType: 'fileDeps',  depth: 2 })).toBe(r2);
        cache.dispose();
    });
});

describe('watcher glob covers all files', () => {
    it('watcher is created with **/*', () => {
        const cache = new AnalysisCache();
        expect(workspace.createFileSystemWatcher).toHaveBeenCalledWith('**/*');
        cache.dispose();
    });
});
