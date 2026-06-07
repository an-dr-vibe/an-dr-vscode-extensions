import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AnalysisCache } from '../cache/AnalysisCache';
import { workspace, Uri } from '../__mocks__/vscode';
import { AnalysisResult } from '../analyzers/IAnalyzer';
import { GraphModel } from '../graph/GraphModel';

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
