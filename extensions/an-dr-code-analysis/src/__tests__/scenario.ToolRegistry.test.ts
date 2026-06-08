// Scenario tests for ToolRegistry.
// Models: user opens the Code Analysis panel for the first time,
// sees tool status, refreshes, gets stale results from .statuses before refresh.

import { workspace, Uri } from '../__mocks__/vscode';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('child_process', () => ({ execFile: jest.fn() }));
import * as cp from 'child_process';
const mockExecFile = cp.execFile as unknown as jest.Mock;

import { ToolRegistry } from '../tools/ToolRegistry';

let tmpDir: string;

function stubAllMissing() {
    mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => cb(new Error('not found'))
    );
}

function stubAllPresent() {
    mockExecFile.mockImplementation(
        (_cmd: string, _args: string[], _opts: unknown, cb: Function) => cb(null, { stdout: '/usr/bin/tool\n' })
    );
}

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toolreg-'));
    workspace.__setWorkspaceFolders([{ uri: Uri.file(tmpDir), name: 'test', index: 0 }]);
    jest.clearAllMocks();
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    workspace.__setWorkspaceFolders(undefined);
});

// ── Scenario: user opens panel before refresh() is called ────────────────────

describe('Scenario: .statuses before refresh()', () => {
    it('BUG: statuses returns empty array before first refresh — panel would show nothing', () => {
        const registry = new ToolRegistry();
        // User opens panel; SidepanelProvider reads statuses before refresh() completes.
        expect(registry.statuses).toEqual([]);
    });
});

// ── Scenario: tsserver is always listed first as "ok" ────────────────────────

describe('Scenario: tsserver always present', () => {
    it('tsserver is always the first entry with state=ok regardless of tool availability', async () => {
        stubAllMissing();
        const registry = new ToolRegistry();
        const statuses = await registry.refresh();
        expect(statuses[0].name).toBe('tsserver');
        expect(statuses[0].state).toBe('ok');
        expect(statuses[0].group).toBe('typescript');
    });

    it('tsserver detail is "bundled with VS Code"', async () => {
        stubAllMissing();
        const registry = new ToolRegistry();
        const statuses = await registry.refresh();
        expect(statuses[0].detail).toBe('bundled with VS Code');
    });
});

// ── Scenario: clangd is second in the list ───────────────────────────────────

describe('Scenario: clangd status ordering', () => {
    it('BUG: clangd is always second — but its health check calls ClangdHealth.check() which checks workspace root', async () => {
        // clangd binary found → ClangdHealth.check() called → no compile_commands.json → warn
        stubAllPresent();
        // No compile_commands.json in tmpDir
        const registry = new ToolRegistry();
        const statuses = await registry.refresh();
        const clangd = statuses.find(s => s.name === 'clangd')!;
        expect(clangd).toBeDefined();
        expect(clangd.state).toBe('warn'); // binary ok but no compile_commands.json
    });

    it('clangd is missing when binary not found', async () => {
        stubAllMissing();
        const registry = new ToolRegistry();
        const statuses = await registry.refresh();
        const clangd = statuses.find(s => s.name === 'clangd')!;
        expect(clangd.state).toBe('missing');
    });

    it('BUG: clangd appears in TOOLS list but is ALSO checked via ClangdHealth separately — duplicate logic', async () => {
        // TOOLS contains clangd with cmd='clangd', but refresh() filters it out with
        // `TOOLS.filter(t => t.name !== 'clangd')` and handles clangd specially.
        // This means the TOOLS array has a clangd entry that is never used — dead data.
        stubAllMissing();
        const registry = new ToolRegistry();
        const statuses = await registry.refresh();
        // clangd IS in statuses (from the special path), not from TOOLS processing
        const clangdEntries = statuses.filter(s => s.name === 'clangd');
        expect(clangdEntries).toHaveLength(1); // exactly one, not duplicated
    });
});

// ── Scenario: all tools present ──────────────────────────────────────────────

describe('Scenario: all tools installed', () => {
    it('refresh returns one entry per tool when all are present', async () => {
        stubAllPresent();
        fs.writeFileSync(path.join(tmpDir, 'compile_commands.json'), '[]');

        const registry = new ToolRegistry();
        const statuses = await registry.refresh();

        // Expected tools: tsserver + clangd + cmake + bear + importlab + iwyu +
        //                 rust-analyzer + cargo + pyan3 + ctags + cscope = 11
        expect(statuses).toHaveLength(11);
    });

    it('BUG: refresh() always runs all tool checks even if called repeatedly — no short-circuit', async () => {
        stubAllPresent();
        const registry = new ToolRegistry();
        await registry.refresh();
        const callsBefore = mockExecFile.mock.calls.length;
        await registry.refresh(); // second call
        const callsAfter = mockExecFile.mock.calls.length;
        // Second refresh makes just as many execFile calls — no caching of tool presence
        expect(callsAfter - callsBefore).toBeGreaterThan(0);
    });
});

// ── Scenario: group assignments ───────────────────────────────────────────────

describe('Scenario: tool group assignments', () => {
    it('all C/C++ tools have group=c-cpp', async () => {
        stubAllMissing();
        const registry = new ToolRegistry();
        const statuses = await registry.refresh();
        const cppTools = ['cmake', 'bear', 'importlab', 'iwyu'];
        cppTools.forEach(name => {
            const tool = statuses.find(s => s.name === name);
            expect(tool?.group).toBe('c-cpp');
        });
    });

    it('rust tools have group=rust', async () => {
        stubAllMissing();
        const registry = new ToolRegistry();
        const statuses = await registry.refresh();
        ['rust-analyzer', 'cargo'].forEach(name => {
            expect(statuses.find(s => s.name === name)?.group).toBe('rust');
        });
    });

    it('pyan3 has group=python', async () => {
        stubAllMissing();
        const registry = new ToolRegistry();
        const statuses = await registry.refresh();
        expect(statuses.find(s => s.name === 'pyan3')?.group).toBe('python');
    });

    it('ctags and cscope have group=universal', async () => {
        stubAllMissing();
        const registry = new ToolRegistry();
        const statuses = await registry.refresh();
        ['ctags', 'cscope'].forEach(name => {
            expect(statuses.find(s => s.name === name)?.group).toBe('universal');
        });
    });
});

// ── Scenario: ToolRegistry never returns 'warn' for non-clangd tools ─────────

describe('Scenario: warn state only for clangd', () => {
    it('BUG: non-clangd tools only return ok or missing — never warn — even if misconfigured', () => {
        // ToolState for non-clangd tools is purely binary: ok (found in PATH) or missing.
        // There is no intermediate 'warn' state for e.g. ctags being an old version,
        // or cargo pointing to an incompatible toolchain.
        // This is a design limitation — document it.
        stubAllMissing();
        const registry = new ToolRegistry();
        return registry.refresh().then(statuses => {
            const nonClangd = statuses.filter(s => s.name !== 'clangd' && s.name !== 'tsserver');
            nonClangd.forEach(s => {
                expect(['ok', 'missing']).toContain(s.state);
                expect(s.state).not.toBe('warn');
            });
        });
    });
});

// ── Scenario: .statuses reflects last refresh result ─────────────────────────

describe('Scenario: .statuses property', () => {
    it('statuses reflects the result of the most recent refresh()', async () => {
        stubAllMissing();
        const registry = new ToolRegistry();
        const result = await registry.refresh();
        expect(registry.statuses).toEqual(result); // same content (copies, not same reference)
    });

    it('T1 fixed: statuses getter returns a copy — caller mutation does not affect registry', () => {
        const registry = new ToolRegistry();
        const statuses = registry.statuses;
        statuses.push({ name: 'hacked', state: 'ok', group: 'universal' });
        // T1 fixed: internal state is not polluted — a fresh copy is returned each time
        expect(registry.statuses).toHaveLength(0); // still empty (no refresh yet)
    });
});
