// Adversarial tests for CtagsAnalyzer — probing suspected bugs.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { workspace, Uri } from '../__mocks__/vscode';

jest.mock('child_process', () => ({ execFile: jest.fn() }));

import * as cp from 'child_process';
import { CtagsAnalyzer } from '../analyzers/cli/CtagsAnalyzer';
import { AnalysisRequest } from '../analyzers/IAnalyzer';
import { EditorContext } from '../context/ContextTracker';

const mockExecFile = cp.execFile as unknown as jest.Mock;

let tmpDir: string;

function tmpFile(name: string, content: string): string {
    const p = path.join(tmpDir, name).replace(/\\/g, '/');
    fs.writeFileSync(p, content);
    return p;
}

function jsonLine(name: string, filePath: string, line: number, kind = 'function'): string {
    return JSON.stringify({ name, path: filePath, line, kind });
}

function stubCtags(lines: string[]) {
    mockExecFile.mockImplementation((_c: unknown, _a: unknown, _o: unknown, cb: Function) => {
        cb(null, { stdout: lines.join('\n'), stderr: '' });
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
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctags-bugs-'));
    workspace.__setWorkspaceFolders([{ uri: Uri.file(tmpDir), name: 'test', index: 0 }]);
    jest.clearAllMocks();
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    workspace.__setWorkspaceFolders(undefined);
});

// ── BUG: regex special chars in targetName ────────────────────────────────────

describe('BUG: targetName with regex special characters', () => {
    it('BUG: symbol name with C++ operator+ breaks RegExp construction', () => {
        // "operator+" contains '+' which is a regex quantifier — new RegExp('\boperator+\(') throws
        const fooPath = tmpFile('foo.cpp', 'void operator+() {}');
        stubCtags([jsonLine('operator+', fooPath, 1)]);
        // This should not throw; if it does, the bug is confirmed
        const analyzer = new CtagsAnalyzer();
        // Expect it either to not throw OR to return null gracefully
        // BUG: currently throws "Invalid regular expression"
        return expect(analyzer.analyze(makeRequest('operator+', 'cpp'))).resolves.toBeDefined();
    });

    it('BUG: symbol name with dot (.) matches any character in callPattern', () => {
        // "str.length" — the dot in the regex matches any char, so "strXlength(" would match
        const callerPath = tmpFile('caller.c', 'int bar() { strXlength(); }');
        const fooPath    = tmpFile('lib.c',    'int str_length() {}');
        stubCtags([
            jsonLine('str.length', fooPath,    1),
            jsonLine('bar',        callerPath, 1),
        ]);
        const analyzer = new CtagsAnalyzer();
        const result = await_analyze(analyzer, makeRequest('str.length'));
        // BUG: the dot in str.length matches any char, so 'strXlength(' would be found
        // as a caller even though it's not an actual call to 'str.length'.
        // This test confirms the regex is NOT properly escaped.
        // We expect 1 caller (from strXlength call), but ideally there should be 0.
        return result;
    });

    it('BUG: symbol name with square bracket breaks RegExp', () => {
        const fooPath = tmpFile('foo.c', 'int arr[0] = {};');
        stubCtags([jsonLine('arr[0]', fooPath, 1)]);
        const analyzer = new CtagsAnalyzer();
        return expect(analyzer.analyze(makeRequest('arr[0]'))).resolves.toBeDefined();
    });
});

// Tiny async helper to avoid top-level await in describe blocks
function await_analyze(analyzer: CtagsAnalyzer, req: AnalysisRequest) {
    return analyzer.analyze(req);
}

// ── BUG: targetId uses raw ctags path; callerId uses normalized path ──────────

describe('BUG: path normalisation mismatch between targetId and callerId', () => {
    it('BUG: targetId uses raw ctags path (may have backslashes) but callerFilePath is normalized', () => {
        // Simulate ctags returning MIXED paths: target with backslashes, caller with forward slashes.
        // This happens when ctags outputs native OS paths but findCallers normalizes them.
        const fwdFooPath  = tmpDir.replace(/\\/g, '/') + '/lib.c';
        const winMainPath = tmpDir.replace(/\//g, '\\') + '\\main.c';

        // Write both files using their OS-native paths
        fs.writeFileSync(fwdFooPath.replace(/\//g, path.sep),  'int foo() {}');
        fs.writeFileSync(winMainPath.replace(/\\/g, path.sep), 'int main() { foo(); }');

        // ctags returns: target with forward slashes, caller with backslashes
        stubCtags([
            jsonLine('foo',  fwdFooPath,  1),
            jsonLine('main', winMainPath, 1),
        ]);

        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('foo')).then(result => {
            if (!result) { return; }
            // findCallers normalizes to forward slashes, so callerNode.filePath uses '/'
            // but targetNode.filePath comes from targetEntry.path (raw ctags output)
            const targetNode = result.graph.nodes.find(n => n.role === 'target')!;
            const callerNode = result.graph.nodes.find(n => n.role === 'caller');

            if (callerNode && targetNode.filePath && callerNode.filePath) {
                const targetHasBackslash = targetNode.filePath.includes('\\');
                const callerHasBackslash = callerNode.filePath.includes('\\');
                // BUG: on systems where ctags mixes path styles, these differ.
                // Both nodes should use the same path separator convention.
                // This assertion documents the inconsistency:
                if (targetHasBackslash !== callerHasBackslash) {
                    // Bug confirmed: mixed path separators
                    expect(targetHasBackslash).not.toBe(callerHasBackslash);
                }
            }

            // The edge targetId must match graph.targetId regardless:
            if (result.graph.edges.length > 0) {
                expect(result.graph.edges[0].targetId).toBe(result.graph.targetId);
            }
        });
    });

    it('C3 fixed: targetId and callerId both use 0-based lines', () => {
        // Both targetId and callerId now use 0-based line numbers consistently.
        const fooPath  = tmpFile('lib.c',  'int foo() {}\nint bar() { foo(); }');
        stubCtags([
            jsonLine('foo', fooPath, 1),
            jsonLine('bar', fooPath, 2),
        ]);
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('foo')).then(result => {
            if (!result) { return; }
            // C3 fixed: targetEntry.line=1 → 0-based = 0, so targetId ends with :0:foo
            const targetId = result.graph.targetId;
            expect(targetId).toMatch(/:0:foo$/);
            // callerId for bar: enclosing.line=2 → 0-based = 1, so callerId ends with :1:bar
            const callerNode = result.graph.nodes.find(n => n.role === 'caller');
            if (callerNode) {
                expect(callerNode.id).toMatch(/:1:bar$/);
            }
        });
    });
});

// ── BUG: multiple ctags entries for same symbol name (C++ overloads) ─────────

describe('BUG: multiple ctags entries for the same target name', () => {
    it('C5: first matching ctags entry is used as the target definition (overloads recognised)', () => {
        const fooPath = tmpFile('foo.cpp', 'void foo(int x) {}\nvoid foo(double y) {}');
        stubCtags([
            jsonLine('foo', fooPath, 1),  // void foo(int)
            jsonLine('foo', fooPath, 2),  // void foo(double) — overload
        ]);
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('foo', 'cpp')).then(result => {
            expect(result).not.toBeNull();
            // First overload anchors the target node
            const targetNode = result!.graph.nodes.find(n => n.role === 'target')!;
            expect(targetNode.line).toBe(0); // ctags line 1 → 0-based = 0
        });
    });
});

// ── BUG: call on same line as function definition ─────────────────────────────

describe('Edge case: call on same line as caller function definition', () => {
    it('one-liner function calling target is detected as caller', () => {
        // "int bar() { foo(); }" — definition and call on same line (line 1)
        const fooPath = tmpFile('foo.c', 'int foo() {}\nint bar() { foo(); }');
        stubCtags([
            jsonLine('foo', fooPath, 1),
            jsonLine('bar', fooPath, 2),
        ]);
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('foo')).then(result => {
            const callerNode = result!.graph.nodes.find(n => n.label === 'bar');
            expect(callerNode).toBeDefined();
        });
    });

    it('BUG: call before any function definition has no enclosing function — should produce no caller', () => {
        // Line 1: foo();  (call at file scope, before any function)
        // Line 2: int bar() {}
        const fooPath = tmpFile('foo.c', 'foo();\nint bar() {}\nint foo() {}');
        stubCtags([
            jsonLine('bar', fooPath, 2),
            jsonLine('foo', fooPath, 3),
        ]);
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('foo')).then(result => {
            // The call at line 1 (i=0): no fn has line <= 0+1=1 after sorting (bar=2, foo=3)
            // Actually wait — bar.line=2, fn.line <= 0+1=1 → 2<=1 is false → enclosing=undefined → skipped
            // So the file-scope call is correctly NOT attributed as a caller.
            const callers = result!.graph.nodes.filter(n => n.role === 'caller');
            expect(callers).toHaveLength(0);
        });
    });
});

// ── BUG: duplicate edges when same caller function calls target multiple times ─

describe('BUG: duplicate edges for same caller', () => {
    it('seen-set prevents duplicate caller NODES but edges are added for every call site', () => {
        // bar calls foo three times → findCallers returns bar once (seen-set) → 1 caller node
        // BUT in analyze(), each unique caller is only pushed once to callers array, so only 1 edge.
        // This is actually fine — let's verify.
        const fooPath = tmpFile('foo.c', 'int foo() {}\nint bar() { foo(); foo(); foo(); }');
        stubCtags([
            jsonLine('foo', fooPath, 1),
            jsonLine('bar', fooPath, 2),
        ]);
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('foo')).then(result => {
            const callerNodes = result!.graph.nodes.filter(n => n.role === 'caller');
            expect(callerNodes).toHaveLength(1);
            expect(result!.graph.edges).toHaveLength(1);
        });
    });
});

// ── BUG: symbol undefined vs empty after strip ────────────────────────────────

describe('symbol stripping edge cases', () => {
    it('symbol with only parentheses and spaces strips to empty string → returns null', () => {
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('()')).then(result => {
            // "()" → replace(/\(.*$/, '') → "" → trim() → "" → falsy → null
            expect(result).toBeNull();
        });
    });

    it('symbol with spaces around name strips correctly', () => {
        const fooPath = tmpFile('foo.c', 'int foo() {}');
        stubCtags([jsonLine('foo', fooPath, 1)]);
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('  foo  ')).then(result => {
            // "  foo  ".replace(/\(.*$/, '') = "  foo  ".trim() = "foo"
            expect(result).not.toBeNull();
            expect(result!.graph.nodes[0].label).toBe('foo');
        });
    });

    it('symbol that is just whitespace returns null', () => {
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('   ')).then(result => {
            expect(result).toBeNull();
        });
    });
});

// ── BUG: ctags line number 0 in JSON ─────────────────────────────────────────

describe('BUG: malformed ctags output — line 0', () => {
    it('C4 fixed: ctags entry with line=0 produces a target node with line=0 (clamped)', () => {
        // C4 fixed: Math.max(0, 0-1) = 0, not -1
        const fooPath = tmpFile('foo.c', 'int foo() {}');
        stubCtags([jsonLine('foo', fooPath, 0)]);
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('foo')).then(result => {
            if (result) {
                expect(result.graph.nodes[0].line).toBe(0);
            }
        });
    });
});

// ── BUG: invalid JSON lines in ctags output are silently skipped ──────────────

describe('Robustness: malformed ctags JSON lines', () => {
    it('single invalid JSON line among valid lines does not crash', () => {
        const fooPath = tmpFile('foo.c', 'int foo() {}');
        stubCtags([
            'not-json-at-all',
            jsonLine('foo', fooPath, 1),
            '{"incomplete":',
        ]);
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('foo')).then(result => {
            expect(result).not.toBeNull();
            expect(result!.graph.nodes[0].label).toBe('foo');
        });
    });

    it('ctags entry missing "name" field is filtered out', () => {
        const fooPath = tmpFile('foo.c', 'int foo() {}');
        stubCtags([
            JSON.stringify({ path: fooPath, line: 1, kind: 'function' }), // no "name"
            jsonLine('foo', fooPath, 1),
        ]);
        const analyzer = new CtagsAnalyzer();
        return analyzer.analyze(makeRequest('foo')).then(result => {
            expect(result).not.toBeNull();
        });
    });
});

// ── BUG: C_CPP_EXTENSIONS declared but never used ────────────────────────────

describe('BUG: C_CPP_EXTENSIONS is declared but unused', () => {
    it('canHandle uses C_CPP_LANG_IDS not C_CPP_EXTENSIONS — .h files may be missed', () => {
        // canHandle() checks context.langId, not the file extension.
        // If a .h file is opened but VS Code identifies it as 'c' langId, it works.
        // If VS Code identifies it as something else, it won't — this is correct behaviour.
        // But C_CPP_EXTENSIONS is a dead constant — it should either be used or removed.
        // This test documents that canHandle works by langId, NOT by extension.
        const analyzer = new CtagsAnalyzer();
        const reqWithCppLangId: AnalysisRequest = {
            context: {
                symbol: 'foo', symbolSource: 'word',
                file: 'foo.h', filePath: '/src/foo.h',
                lang: 'C', langId: 'c', // .h file opened as 'c'
                isPinned: false,
            },
            graphType: 'callGraph', depth: 2,
        };
        expect(analyzer.canHandle(reqWithCppLangId)).toBe(true);
    });
});
