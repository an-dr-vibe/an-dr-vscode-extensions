// Adversarial tests for AnalysisCache — probing suspected bugs.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { workspace, Uri } from '../__mocks__/vscode';
import { AnalysisCache } from '../cache/AnalysisCache';
import { AnalysisResult } from '../analyzers/IAnalyzer';
import { GraphModel } from '../graph/GraphModel';

function makeResult(tool = 'clangd'): AnalysisResult {
    const graph: GraphModel = {
        graphType: 'callGraph', targetId: 'id',
        nodes: [{ id: 'id', label: 'foo', fullName: 'foo', role: 'target' }],
        edges: [], depth: 2, tool, confidence: 'high',
    };
    return { graph };
}

let tmpDir: string;
let tmpFile: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-bugs-'));
    tmpFile = path.join(tmpDir, 'test.c');
    fs.writeFileSync(tmpFile, 'int foo() {}');
    jest.clearAllMocks();
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── BUG: symbol=undefined and symbol="" produce the same key ─────────────────

describe('BUG: key collision between symbol=undefined and symbol=""', () => {
    it('BUG: undefined symbol and empty-string symbol map to the same cache entry', () => {
        const cache = new AnalysisCache();
        const r1 = makeResult('clangd');
        const r2 = makeResult('ctags');

        cache.set({ filePath: tmpFile, graphType: 'callGraph', depth: 2, symbol: undefined }, r1);
        cache.set({ filePath: tmpFile, graphType: 'callGraph', depth: 2, symbol: '' },        r2);

        // BUG: keyString uses `symbol ?? ''` so both produce the same key.
        // r2 should overwrite r1. get() with undefined should return r2.
        const result = cache.get({ filePath: tmpFile, graphType: 'callGraph', depth: 2, symbol: undefined });
        // This passes only because both map to the same entry — a collision:
        expect(result).toBe(r2);

        // And getting with '' also returns r2:
        const result2 = cache.get({ filePath: tmpFile, graphType: 'callGraph', depth: 2, symbol: '' });
        expect(result2).toBe(r2);

        cache.dispose();
    });

    it('BUG: separate results for no-symbol vs empty-string cannot both be stored', () => {
        const cache = new AnalysisCache();
        const r1 = makeResult('clangd');
        const r2 = makeResult('ctags');

        // Store with no symbol, then with empty string
        cache.set({ filePath: tmpFile, graphType: 'callGraph', depth: 2 }, r1);
        cache.set({ filePath: tmpFile, graphType: 'callGraph', depth: 2, symbol: '' }, r2);

        // They should be separate entries but are not:
        const withUndefined = cache.get({ filePath: tmpFile, graphType: 'callGraph', depth: 2 });
        const withEmpty     = cache.get({ filePath: tmpFile, graphType: 'callGraph', depth: 2, symbol: '' });

        // BUG: both return the SAME result (r2 overwrote r1)
        expect(withUndefined).toBe(withEmpty); // confirms collision
        cache.dispose();
    });
});

// ── BUG: _invalidateFile uses fsPath prefix matching ─────────────────────────

describe('BUG: _invalidateFile prefix collision', () => {
    it('BUG: path containing | separator char causes false invalidation', () => {
        // The key format is: `${filePath}|${graphType}|...`
        // _invalidateFile(fsPath) checks k.startsWith(fsPath + '|')
        // If the filePath itself contains '|' (on Linux), the key for /a|b/test.c is:
        //   "/a|b/test.c|callGraph|2|"
        // Triggering _invalidateFile('/a') checks startsWith('/a|') → TRUE — false match!
        // Windows does not allow '|' in paths, so we simulate the bug with a constructed key.

        const cache = new AnalysisCache();
        // Directly insert a key with '|' in the path portion using a real file for mtime
        const realFile = path.join(tmpDir, 'real.c');
        fs.writeFileSync(realFile, 'int foo(){}');

        // Manually insert an entry where the filePath contains '|'
        // We can't do this via the public API on Windows, but we can test the logic
        // by observing what startsWith does:
        const pathWithPipe = tmpDir + '/a';
        const keyStr = `${pathWithPipe}|b/test.c|callGraph|2|`;
        (cache as any)._map.set(keyStr, {
            result: makeResult(),
            mtime: fs.statSync(realFile).mtimeMs,
        });

        // Trigger invalidation for a path that is a prefix of the pathWithPipe key
        workspace.__triggerFileChange(Uri.file(pathWithPipe));
        // _invalidateFile checks k.startsWith('/tmp/.../a|') → YES matches '/tmp/.../a|b/...'
        // BUG: the entry for a completely different conceptual path is invalidated
        const entryStillExists = (cache as any)._map.has(keyStr);
        expect(entryStillExists).toBe(false); // confirms the false-invalidation bug
        cache.dispose();
    });

    it('invalidating a short path does not invalidate entries for longer paths with same prefix', () => {
        // /tmp/foo.c should NOT invalidate /tmp/foo.cpp
        const fileC   = path.join(tmpDir, 'foo.c');
        const fileCpp = path.join(tmpDir, 'foo.cpp');
        fs.writeFileSync(fileC,   'int foo(){}');
        fs.writeFileSync(fileCpp, 'int foo(){}');

        const cache = new AnalysisCache();
        const keyC   = { filePath: fileC,   graphType: 'callGraph' as const, depth: 2 };
        const keyCpp = { filePath: fileCpp, graphType: 'callGraph' as const, depth: 2 };
        const r1 = makeResult('clangd');
        const r2 = makeResult('ctags');
        cache.set(keyC,   r1);
        cache.set(keyCpp, r2);

        workspace.__triggerFileChange(Uri.file(fileC));

        // foo.c entry should be gone
        expect(cache.get(keyC)).toBeUndefined();
        // foo.cpp entry should NOT be affected
        expect(cache.get(keyCpp)).toBe(r2);
        cache.dispose();
    });
});

// ── BUG: set() silently fails for non-existent file ──────────────────────────

describe('BUG: set() silently ignores non-existent files', () => {
    it('set() on non-existent file silently does nothing — no error thrown', () => {
        const cache = new AnalysisCache();
        const key = { filePath: '/nonexistent/path/file.c', graphType: 'callGraph' as const, depth: 2 };
        expect(() => cache.set(key, makeResult())).not.toThrow();
        expect(cache.get(key)).toBeUndefined();
        cache.dispose();
    });
});

// ── BUG: get() calls statSync twice (once in get, once conceptually) ──────────

describe('mtime check consistency in get()', () => {
    it('get() uses mtime equality (===) not inequality — truncated mtime could cause false hits', () => {
        // statSync.mtimeMs is a float on some systems. If mtime was stored with full precision
        // but statSync returns a slightly different float, === fails and entry is invalidated.
        // This is hard to trigger in test but we document the behaviour:
        const cache = new AnalysisCache();
        const key = { filePath: tmpFile, graphType: 'callGraph' as const, depth: 2 };
        const result = makeResult();
        cache.set(key, result);
        // Without touching the file, should hit:
        expect(cache.get(key)).toBe(result);
        cache.dispose();
    });
});

// ── Multiple depths are stored as independent entries ─────────────────────────

describe('cache isolation', () => {
    it('different depths for the same file/symbol are independent entries', () => {
        const cache = new AnalysisCache();
        const r1 = makeResult('clangd');
        const r2 = makeResult('ctags');
        cache.set({ filePath: tmpFile, graphType: 'callGraph', depth: 1 }, r1);
        cache.set({ filePath: tmpFile, graphType: 'callGraph', depth: 2 }, r2);
        expect(cache.get({ filePath: tmpFile, graphType: 'callGraph', depth: 1 })).toBe(r1);
        expect(cache.get({ filePath: tmpFile, graphType: 'callGraph', depth: 2 })).toBe(r2);
        cache.dispose();
    });

    it('different graphTypes for the same file are independent entries', () => {
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

// ── BUG: statuses() returns empty array before first refresh ──────────────────
// (This is on ToolRegistry, but cache also has a related issue with initial state)

describe('initial state of cache', () => {
    it('get() on fresh cache returns undefined for any key', () => {
        const cache = new AnalysisCache();
        const key = { filePath: tmpFile, graphType: 'callGraph' as const, depth: 2, symbol: 'foo' };
        expect(cache.get(key)).toBeUndefined();
        cache.dispose();
    });
});

// ── BUG: watcher fires for every file change, including unrelated ones ─────────

describe('watcher scope', () => {
    it('watcher glob is ** which means ALL files trigger invalidation checks', () => {
        // The watcher uses '**/*' — this means every file change in the workspace
        // triggers _invalidateFile. For large workspaces this could be expensive.
        // We document this by verifying the watcher was created with '**/*':
        const cache = new AnalysisCache();
        expect(workspace.createFileSystemWatcher).toHaveBeenCalledWith('**/*');
        cache.dispose();
    });
});
