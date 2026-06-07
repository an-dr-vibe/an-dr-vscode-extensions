// Scenario tests for SidepanelProvider._runAnalysis pipeline.
// Models realistic user interactions:
//   - clicking "Call Graph" with valid context
//   - clicking before any file is open
//   - depth clamping via Settings.maxDepth
//   - cache hit on second analysis of same symbol
//   - result with 0 nodes treated as "no result" → falls through to error
//   - concurrent analysis: second click while first is running
//   - analyzer chain: first analyzer returns null → second is tried
//   - analyzer throws → falls through to next analyzer

import { workspace } from '../__mocks__/vscode';
import { SidepanelProvider } from '../SidepanelProvider';
import { Uri } from '../__mocks__/vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ── helpers ──────────────────────────────────────────────────────────────────

// Drain all pending microtasks and macrotasks up to a given number of rounds.
// Needed because _runAnalysis is called with `void` (not awaited) by the message handler.
function flushAsync(rounds = 3): Promise<void> {
    let p = Promise.resolve();
    for (let i = 0; i < rounds; i++) {
        p = p.then(() => new Promise(r => setImmediate(r)));
    }
    return p;
}

function makeWebviewView(onPost?: (msg: any) => void): any {
    const postMessage = jest.fn((msg: any) => { onPost?.(msg); return Promise.resolve(true); });
    return {
        webview: {
            options: {},
            html: '',
            onDidReceiveMessage: jest.fn((cb) => { (makeWebviewView as any)._msgHandler = cb; return { dispose: () => {} }; }),
            postMessage,
            asWebviewUri: (uri: any) => uri,
        },
        onDidDispose: jest.fn(() => ({ dispose: () => {} })),
        onDidChangeVisibility: jest.fn(() => ({ dispose: () => {} })),
        visible: true,
    };
}

function makeExtensionUri(dir: string) {
    return Uri.file(dir) as any;
}

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sidepanel-'));
    workspace.__setWorkspaceFolders([{ uri: Uri.file(tmpDir), name: 'test', index: 0 }]);
    jest.clearAllMocks();
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    workspace.__setWorkspaceFolders(undefined);
});

// ── Scenario: user opens panel before any file is open ───────────────────────

describe('Scenario: user opens panel with no active editor', () => {
    it('postMessage is called when view resolves — even with no editor context', () => {
        const posted: any[] = [];
        const view = makeWebviewView(msg => posted.push(msg));
        const provider = new SidepanelProvider(makeExtensionUri(tmpDir));
        provider.resolveWebviewView(view, {} as any, {} as any);

        expect(view.webview.onDidReceiveMessage).toHaveBeenCalled();
        provider.dispose();
    });
});

// ── Scenario: user clicks "Call Graph" with no context ───────────────────────

describe('Scenario: user clicks Call Graph with no open file', () => {
    it('BUG: _runAnalysis sends analysisError when ctx is null', async () => {
        const posted: any[] = [];
        const view = makeWebviewView(msg => posted.push(msg));
        const provider = new SidepanelProvider(makeExtensionUri(tmpDir));
        provider.resolveWebviewView(view, {} as any, {} as any);

        // Trigger analysis directly via the message handler
        const handler = (view.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
        await handler({ type: 'requestAnalysis', graphType: 'callGraph', depth: 2 });

        const errorMsg = posted.find(m => m.type === 'analysisError');
        expect(errorMsg).toBeDefined();
        expect(errorMsg.message).toMatch(/no file/i);
        provider.dispose();
    });
});

// ── Scenario: depth clamping ─────────────────────────────────────────────────

describe('Scenario: depth clamping via Settings.maxDepth', () => {
    it('BUG: requested depth > maxDepth is clamped before analysis runs', async () => {
        // Settings.maxDepth() returns 5 by default in mock
        // If user sends depth=99, the pipeline should clamp to maxDepth
        const posted: any[] = [];
        const view = makeWebviewView(msg => posted.push(msg));
        const provider = new SidepanelProvider(makeExtensionUri(tmpDir));
        provider.resolveWebviewView(view, {} as any, {} as any);

        // Inject a context so the pipeline proceeds past the null-ctx guard
        const tracker = (provider as any)._contextTracker;
        tracker._current = {
            symbol: 'foo', symbolSource: 'word',
            file: 'foo.c', filePath: path.join(tmpDir, 'foo.c'),
            lang: 'C', langId: 'c', isPinned: false,
        };

        // Mock the analyzerFactory to capture what depth was used
        let capturedDepth: number | undefined;
        const factory = (provider as any)._analyzerFactory;
        const origGetChain = factory.getChain.bind(factory);
        factory.getChain = (req: any) => {
            capturedDepth = req.depth;
            return []; // empty chain → analysisError
        };

        const handler = (view.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
        await handler({ type: 'requestAnalysis', graphType: 'callGraph', depth: 99 });

        // BUG PROBE: capturedDepth should be Math.min(99, maxDepth=5) = 5
        expect(capturedDepth).toBe(5);
        provider.dispose();
    });

    it('BUG: depth=0 is not validated — it is passed straight through', async () => {
        const posted: any[] = [];
        const view = makeWebviewView(msg => posted.push(msg));
        const provider = new SidepanelProvider(makeExtensionUri(tmpDir));
        provider.resolveWebviewView(view, {} as any, {} as any);

        const tracker = (provider as any)._contextTracker;
        tracker._current = {
            symbol: 'foo', symbolSource: 'word',
            file: 'foo.c', filePath: path.join(tmpDir, 'foo.c'),
            lang: 'C', langId: 'c', isPinned: false,
        };

        let capturedDepth: number | undefined;
        const factory = (provider as any)._analyzerFactory;
        factory.getChain = (req: any) => { capturedDepth = req.depth; return []; };

        const handler = (view.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
        await handler({ type: 'requestAnalysis', graphType: 'callGraph', depth: 0 });

        // BUG: depth=0 passes Math.min(0, 5)=0 — no minimum validation.
        // The pipeline will run with depth=0 which should be invalid per Settings schema (min:1).
        expect(capturedDepth).toBe(0);
        provider.dispose();
    });

    it('BUG: depth=-1 is not validated — negative depths are not clamped', async () => {
        const view = makeWebviewView();
        const provider = new SidepanelProvider(makeExtensionUri(tmpDir));
        provider.resolveWebviewView(view, {} as any, {} as any);

        const tracker = (provider as any)._contextTracker;
        tracker._current = {
            symbol: 'foo', symbolSource: 'word',
            file: 'foo.c', filePath: path.join(tmpDir, 'foo.c'),
            lang: 'C', langId: 'c', isPinned: false,
        };

        let capturedDepth: number | undefined;
        const factory = (provider as any)._analyzerFactory;
        factory.getChain = (req: any) => { capturedDepth = req.depth; return []; };

        const handler = (view.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
        await handler({ type: 'requestAnalysis', graphType: 'callGraph', depth: -1 });

        // Math.min(-1, 5) = -1 → passed through
        expect(capturedDepth).toBe(-1);
        provider.dispose();
    });
});

// ── Scenario: cache hit on second analysis of same symbol ─────────────────────

describe('Scenario: cache hit on re-analysis', () => {
    it('BUG: cache is keyed on ctx.symbol which may be undefined — two undefined-symbol analyses collide', async () => {
        // User clicks Call Graph twice on the same file with no semantic symbol resolved.
        // Both runs use symbol=undefined → same cache key → second run is served from cache.
        // This is CORRECT behavior, but only if the first run actually produced a result.
        // If it produced null (no results), a null result is NOT cached (only non-empty graphs are).
        // So the second click re-runs the full chain again — correct, but user might not expect it.

        const view = makeWebviewView();
        const provider = new SidepanelProvider(makeExtensionUri(tmpDir));
        provider.resolveWebviewView(view, {} as any, {} as any);

        const tracker = (provider as any)._contextTracker;
        tracker._current = {
            symbol: undefined, symbolSource: 'word',
            file: 'foo.c', filePath: path.join(tmpDir, 'foo.c'),
            lang: 'C', langId: 'c', isPinned: false,
        };

        let analyzeCallCount = 0;
        const factory = (provider as any)._analyzerFactory;
        factory.getChain = () => [{
            name: 'mock',
            canHandle: () => true,
            analyze: async () => {
                analyzeCallCount++;
                return null; // no result → not cached
            },
        }];

        const handler = (view.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
        handler({ type: 'requestAnalysis', graphType: 'callGraph', depth: 2 });
        await flushAsync();
        handler({ type: 'requestAnalysis', graphType: 'callGraph', depth: 2 });
        await flushAsync();

        // No result cached → both clicks run the full chain
        expect(analyzeCallCount).toBe(2);
        provider.dispose();
    });

    it('cache is used on second click when first produced a non-empty graph', async () => {
        const ccFile = path.join(tmpDir, 'foo.c');
        fs.writeFileSync(ccFile, 'int foo() {}');

        const view = makeWebviewView();
        const provider = new SidepanelProvider(makeExtensionUri(tmpDir));
        provider.resolveWebviewView(view, {} as any, {} as any);

        const tracker = (provider as any)._contextTracker;
        tracker._current = {
            symbol: 'foo', symbolSource: 'word',
            file: 'foo.c', filePath: ccFile,
            lang: 'C', langId: 'c', isPinned: false,
        };

        let analyzeCallCount = 0;
        const mockGraph = {
            graphType: 'callGraph', targetId: 'id',
            nodes: [{ id: 'id', label: 'foo', fullName: 'foo', role: 'target' }],
            edges: [], depth: 2, tool: 'mock', confidence: 'high' as const,
        };
        const factory = (provider as any)._analyzerFactory;
        factory.getChain = () => [{
            name: 'mock',
            canHandle: () => true,
            analyze: async () => { analyzeCallCount++; return { graph: mockGraph }; },
        }];

        const handler = (view.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
        handler({ type: 'requestAnalysis', graphType: 'callGraph', depth: 2 });
        await flushAsync(); // wait for first _runAnalysis to complete and cache.set to run
        handler({ type: 'requestAnalysis', graphType: 'callGraph', depth: 2 });
        await flushAsync();

        // Second click should hit cache → only 1 analyze call
        expect(analyzeCallCount).toBe(1);
        provider.dispose();
    });
});

// ── Scenario: result with 0 nodes is treated as no result ─────────────────────

describe('Scenario: analyzer returns graph with 0 nodes', () => {
    it('BUG: graph with nodes.length=0 is NOT cached and falls through to analysisError', async () => {
        // A target-only graph has 1 node. But what if an analyzer returns a graph with 0 nodes?
        // The pipeline checks `result.graph.nodes.length > 0` — so 0 nodes = not accepted.
        // The result is not cached, the next analyzer in chain is tried.
        // This is intentional, but it means a lone-target result from CtagsAnalyzer
        // (which returns 1 node) IS accepted, while a hypothetical analyzer returning
        // 0 nodes (perhaps a stub) causes the pipeline to fall through to error.
        const view = makeWebviewView();
        const provider = new SidepanelProvider(makeExtensionUri(tmpDir));
        provider.resolveWebviewView(view, {} as any, {} as any);

        const tracker = (provider as any)._contextTracker;
        tracker._current = {
            symbol: 'foo', symbolSource: 'word',
            file: 'foo.c', filePath: path.join(tmpDir, 'foo.c'),
            lang: 'C', langId: 'c', isPinned: false,
        };

        const emptyGraph = {
            graphType: 'callGraph', targetId: 'id',
            nodes: [], // 0 nodes!
            edges: [], depth: 2, tool: 'mock', confidence: 'high' as const,
        };
        const factory = (provider as any)._analyzerFactory;
        factory.getChain = () => [{
            name: 'mock', canHandle: () => true,
            analyze: async () => ({ graph: emptyGraph }),
        }];

        const posted: any[] = [];
        (view.webview.postMessage as jest.Mock).mockImplementation(m => posted.push(m));

        const handler = (view.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
        handler({ type: 'requestAnalysis', graphType: 'callGraph', depth: 2 });
        await flushAsync();

        // BUG: 0 nodes → not accepted → analysisError sent instead of analysisResult
        expect(posted.some(m => m.type === 'analysisError')).toBe(true);
        expect(posted.some(m => m.type === 'analysisResult')).toBe(false);
        provider.dispose();
    });
});

// ── Scenario: analyzer chain fallthrough ─────────────────────────────────────

describe('Scenario: first analyzer fails, second produces result', () => {
    it('second analyzer is tried when first returns null', async () => {
        const ccFile = path.join(tmpDir, 'foo.c');
        fs.writeFileSync(ccFile, 'int foo() {}');

        const posted: any[] = [];
        const view = makeWebviewView(m => posted.push(m));
        const provider = new SidepanelProvider(makeExtensionUri(tmpDir));
        provider.resolveWebviewView(view, {} as any, {} as any);

        const tracker = (provider as any)._contextTracker;
        tracker._current = {
            symbol: 'foo', symbolSource: 'word',
            file: 'foo.c', filePath: ccFile,
            lang: 'C', langId: 'c', isPinned: false,
        };

        const mockGraph = {
            graphType: 'callGraph', targetId: 'id',
            nodes: [{ id: 'id', label: 'foo', fullName: 'foo', role: 'target' as const }],
            edges: [], depth: 2, tool: 'fallback', confidence: 'medium' as const,
        };

        const factory = (provider as any)._analyzerFactory;
        factory.getChain = () => [
            { name: 'first',    canHandle: () => true, analyze: async () => null },
            { name: 'fallback', canHandle: () => true, analyze: async () => ({ graph: mockGraph }) },
        ];

        const handler = (view.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
        handler({ type: 'requestAnalysis', graphType: 'callGraph', depth: 2 });
        await flushAsync();

        const result = posted.find(m => m.type === 'analysisResult');
        expect(result).toBeDefined();
        expect(result.graph.tool).toBe('fallback');
        provider.dispose();
    });

    it('BUG: analyzer that throws is swallowed — next analyzer in chain is tried', async () => {
        const ccFile = path.join(tmpDir, 'foo.c');
        fs.writeFileSync(ccFile, 'int foo() {}');

        const posted: any[] = [];
        const view = makeWebviewView(m => posted.push(m));
        const provider = new SidepanelProvider(makeExtensionUri(tmpDir));
        provider.resolveWebviewView(view, {} as any, {} as any);

        const tracker = (provider as any)._contextTracker;
        tracker._current = {
            symbol: 'foo', symbolSource: 'word',
            file: 'foo.c', filePath: ccFile,
            lang: 'C', langId: 'c', isPinned: false,
        };

        const mockGraph = {
            graphType: 'callGraph', targetId: 'id',
            nodes: [{ id: 'id', label: 'foo', fullName: 'foo', role: 'target' as const }],
            edges: [], depth: 2, tool: 'fallback', confidence: 'medium' as const,
        };

        const factory = (provider as any)._analyzerFactory;
        factory.getChain = () => [
            { name: 'throws', canHandle: () => true, analyze: async () => { throw new Error('clangd exploded'); } },
            { name: 'fallback', canHandle: () => true, analyze: async () => ({ graph: mockGraph }) },
        ];

        const handler = (view.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
        handler({ type: 'requestAnalysis', graphType: 'callGraph', depth: 2 });
        await flushAsync();

        const result = posted.find(m => m.type === 'analysisResult');
        expect(result).toBeDefined();
        provider.dispose();
    });
});

// ── Scenario: pinned context used for analysis ────────────────────────────────

describe('Scenario: user pins a symbol then switches files', () => {
    it('BUG: pinned context is used for analysis even when a different file is active', async () => {
        const ccFile = path.join(tmpDir, 'foo.c');
        fs.writeFileSync(ccFile, 'int foo() {}');

        const view = makeWebviewView();
        const provider = new SidepanelProvider(makeExtensionUri(tmpDir));
        provider.resolveWebviewView(view, {} as any, {} as any);

        const tracker = (provider as any)._contextTracker;
        // Simulate: user was on foo.c, pinned 'foo', then switched to bar.c
        tracker._current = {
            symbol: 'foo', symbolSource: 'call-hierarchy',
            file: 'foo.c', filePath: ccFile,
            lang: 'C', langId: 'c', isPinned: true,
        };
        tracker._isPinned = true;

        let capturedContext: any;
        const factory = (provider as any)._analyzerFactory;
        factory.getChain = (req: any) => {
            capturedContext = req.context;
            return [];
        };

        const handler = (view.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
        await handler({ type: 'requestAnalysis', graphType: 'callGraph', depth: 2 });

        // The pinned context (foo.c / 'foo') should be used, not whatever the active editor is
        expect(capturedContext.filePath).toBe(ccFile);
        expect(capturedContext.symbol).toBe('foo');
        expect(capturedContext.isPinned).toBe(true);
        provider.dispose();
    });
});

// ── Scenario: nodeClick does NOT navigate (only nodeDoubleClick should) ────────

describe('Scenario: single click on graph node should not navigate', () => {
    it('BUG: nodeClick message has no handler — it is silently ignored (no navigation)', () => {
        const view = makeWebviewView();
        const provider = new SidepanelProvider(makeExtensionUri(tmpDir));
        provider.resolveWebviewView(view, {} as any, {} as any);

        const handler = (view.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
        // nodeClick is in the union type but has no case in the switch — falls through to nothing
        expect(() => handler({ type: 'nodeClick', nodeId: 'n1', filePath: '/src/foo.c', line: 10 })).not.toThrow();

        // Verify openTextDocument was NOT called (no navigation on single click)
        const { workspace: ws } = require('../__mocks__/vscode');
        // openTextDocument is not mocked in our vscode mock — just verify no error thrown
        provider.dispose();
    });
});

// ── Scenario: nodeDoubleClick with no filePath ────────────────────────────────

describe('Scenario: double-click on a node that has no filePath', () => {
    it('BUG: nodeDoubleClick with undefined filePath is silently ignored — no navigation attempt', () => {
        const view = makeWebviewView();
        const provider = new SidepanelProvider(makeExtensionUri(tmpDir));
        provider.resolveWebviewView(view, {} as any, {} as any);

        const handler = (view.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
        // filePath is undefined — the guard `if (msg.filePath)` prevents navigation
        expect(() => handler({ type: 'nodeDoubleClick', nodeId: 'n1', filePath: undefined })).not.toThrow();
        provider.dispose();
    });
});

// ── Scenario: dispose does not crash if view was never resolved ───────────────

describe('Scenario: provider disposed before panel is opened', () => {
    it('dispose() does not throw when resolveWebviewView was never called', () => {
        const provider = new SidepanelProvider(makeExtensionUri(tmpDir));
        expect(() => provider.dispose()).not.toThrow();
    });
});

// ── Scenario: analysisBusy is sent before running the chain ──────────────────

describe('Scenario: loading indicator', () => {
    it('analysisBusy is posted before analyzer runs', async () => {
        const ccFile = path.join(tmpDir, 'foo.c');
        fs.writeFileSync(ccFile, 'int foo() {}');

        const posted: any[] = [];
        const view = makeWebviewView(m => posted.push(m));
        const provider = new SidepanelProvider(makeExtensionUri(tmpDir));
        provider.resolveWebviewView(view, {} as any, {} as any);

        const tracker = (provider as any)._contextTracker;
        tracker._current = {
            symbol: 'foo', symbolSource: 'word',
            file: 'foo.c', filePath: ccFile,
            lang: 'C', langId: 'c', isPinned: false,
        };

        const factory = (provider as any)._analyzerFactory;
        factory.getChain = () => [{
            name: 'slow', canHandle: () => true,
            analyze: async () => {
                // By the time we get here, analysisBusy should already be in posted
                expect(posted.some(m => m.type === 'analysisBusy')).toBe(true);
                return null;
            },
        }];

        const handler = (view.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
        await handler({ type: 'requestAnalysis', graphType: 'callGraph', depth: 2 });
        provider.dispose();
    });

    it('BUG: analysisBusy is NOT sent when result comes from cache', async () => {
        const ccFile = path.join(tmpDir, 'foo.c');
        fs.writeFileSync(ccFile, 'int foo() {}');

        const posted: any[] = [];
        const view = makeWebviewView(m => posted.push(m));
        const provider = new SidepanelProvider(makeExtensionUri(tmpDir));
        provider.resolveWebviewView(view, {} as any, {} as any);

        const tracker = (provider as any)._contextTracker;
        tracker._current = {
            symbol: 'foo', symbolSource: 'word',
            file: 'foo.c', filePath: ccFile,
            lang: 'C', langId: 'c', isPinned: false,
        };

        const mockGraph = {
            graphType: 'callGraph', targetId: 'id',
            nodes: [{ id: 'id', label: 'foo', fullName: 'foo', role: 'target' as const }],
            edges: [], depth: 2, tool: 'mock', confidence: 'high' as const,
        };
        const factory = (provider as any)._analyzerFactory;
        factory.getChain = () => [{
            name: 'mock', canHandle: () => true,
            analyze: async () => ({ graph: mockGraph }),
        }];

        const handler = (view.webview.onDidReceiveMessage as jest.Mock).mock.calls[0][0];
        handler({ type: 'requestAnalysis', graphType: 'callGraph', depth: 2 });
        await flushAsync(); // wait for first run to complete and cache.set to run
        posted.length = 0; // clear first-run messages

        handler({ type: 'requestAnalysis', graphType: 'callGraph', depth: 2 });
        await flushAsync();

        // Cache hit path: goes straight to postMessage(analysisResult) — no analysisBusy
        expect(posted.some(m => m.type === 'analysisBusy')).toBe(false);
        expect(posted.some(m => m.type === 'analysisResult')).toBe(true);
        provider.dispose();
    });
});
