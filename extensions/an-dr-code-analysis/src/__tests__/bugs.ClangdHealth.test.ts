// Adversarial tests for ClangdHealth — probing suspected bugs.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { workspace, Uri } from '../__mocks__/vscode';
import { ClangdHealth } from '../tools/ClangdHealth';

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clangd-bugs-'));
    workspace.__setWorkspaceFolders([{ uri: Uri.file(tmpDir), name: 'test', index: 0 }]);
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    workspace.__setWorkspaceFolders(undefined);
});

// ── BUG: compile_commands.json only checked at workspace ROOT ────────────────

describe('BUG: compile_commands.json only checked at workspace root', () => {
    it('BUG: compile_commands.json in a subdirectory is not found — always warns', () => {
        // If the user has compile_commands.json at build/compile_commands.json
        // and a .clangd config points clangd to it, ClangdHealth still warns
        // because it only checks path.join(root, 'compile_commands.json').
        const buildDir = path.join(tmpDir, 'build');
        fs.mkdirSync(buildDir);
        fs.writeFileSync(path.join(buildDir, 'compile_commands.json'), '[]');
        // Also write .clangd pointing to build/ to simulate real user setup
        fs.writeFileSync(path.join(tmpDir, '.clangd'), 'CompileFlags:\n  CompilationDatabase: build\n');

        const status = ClangdHealth.check();
        // BUG: status is 'warn' with 'compile_commands.json missing' even though
        // clangd will actually find it via .clangd config.
        expect(status.state).toBe('warn');
        expect(status.detail).toMatch(/missing/i);
    });

    it('BUG: .clangd config is ignored entirely — no attempt to read CompilationDatabase path', () => {
        // Write compile_commands.json in a custom dir and .clangd pointing to it
        const customDir = path.join(tmpDir, 'custom_build');
        fs.mkdirSync(customDir);
        fs.writeFileSync(path.join(customDir, 'compile_commands.json'),
            JSON.stringify([{ directory: customDir, command: 'gcc foo.c', file: 'foo.c' }]));
        fs.writeFileSync(path.join(tmpDir, '.clangd'),
            `CompileFlags:\n  CompilationDatabase: custom_build\n`);

        const status = ClangdHealth.check();
        // BUG: ClangdHealth doesn't read .clangd, so it still says 'warn'
        expect(status.state).not.toBe('ok');
    });
});

// ── BUG: race between existsSync and statSync ─────────────────────────────────

describe('race condition: existsSync then statSync', () => {
    it('statSync does not throw when file exists at existsSync time', () => {
        // Normal case — no race, just verify it works
        fs.writeFileSync(path.join(tmpDir, 'compile_commands.json'), '[]');
        expect(() => ClangdHealth.check()).not.toThrow();
    });
});

// ── BUG: both CMakeLists.txt AND meson.build exist — meson is never checked ──

describe('BUG: only CMakeLists.txt and Makefile are checked for staleness', () => {
    it('BUG: meson.build newer than compile_commands.json is NOT detected as stale', () => {
        const ccPath     = path.join(tmpDir, 'compile_commands.json');
        const mesonPath  = path.join(tmpDir, 'meson.build');
        fs.writeFileSync(ccPath, '[]');
        const now = Date.now();
        fs.utimesSync(ccPath, new Date(now - 5000), new Date(now - 5000));
        fs.writeFileSync(mesonPath, 'project("test")'); // newer

        const status = ClangdHealth.check();
        // BUG: meson.build is not in the checked list → status is ok even though stale
        expect(status.state).toBe('ok'); // documents the bug
    });

    it('BUG: build.ninja newer than compile_commands.json is NOT detected as stale', () => {
        const ccPath    = path.join(tmpDir, 'compile_commands.json');
        const ninjaPath = path.join(tmpDir, 'build.ninja');
        fs.writeFileSync(ccPath, '[]');
        const now = Date.now();
        fs.utimesSync(ccPath, new Date(now - 5000), new Date(now - 5000));
        fs.writeFileSync(ninjaPath, '# ninja build');

        const status = ClangdHealth.check();
        expect(status.state).toBe('ok'); // documents the missing coverage
    });
});

// ── BUG: empty compile_commands.json treated as present and fresh ────────────

describe('BUG: empty compile_commands.json is treated as valid', () => {
    it('BUG: empty array compile_commands.json returns ok — clangd gets no compile commands', () => {
        fs.writeFileSync(path.join(tmpDir, 'compile_commands.json'), '[]');
        const status = ClangdHealth.check();
        // BUG: ClangdHealth returns 'ok' for an empty array — but clangd would have no commands
        expect(status.state).toBe('ok');
    });

    it('BUG: completely empty file (zero bytes) returns ok — would likely crash clangd', () => {
        fs.writeFileSync(path.join(tmpDir, 'compile_commands.json'), '');
        const status = ClangdHealth.check();
        // ClangdHealth only checks existence and mtime, not content validity
        expect(status.state).toBe('ok'); // documents the gap
    });

    it('BUG: malformed JSON in compile_commands.json returns ok', () => {
        fs.writeFileSync(path.join(tmpDir, 'compile_commands.json'), '{not valid json}');
        const status = ClangdHealth.check();
        // No parsing — always ok if file exists and is not stale
        expect(status.state).toBe('ok');
    });
});

// ── BUG: only the FIRST workspace folder is checked ──────────────────────────

describe('BUG: only the first workspace folder is checked', () => {
    it('BUG: compile_commands.json in second workspace folder is ignored', () => {
        const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ws2-'));
        try {
            // First folder: no compile_commands.json
            // Second folder: has compile_commands.json
            fs.writeFileSync(path.join(dir2, 'compile_commands.json'), '[]');
            workspace.__setWorkspaceFolders([
                { uri: Uri.file(tmpDir), name: 'ws1', index: 0 },
                { uri: Uri.file(dir2),   name: 'ws2', index: 1 },
            ]);

            const status = ClangdHealth.check();
            // BUG: only tmpDir (ws1) is checked — ws2's compile_commands.json is ignored
            expect(status.state).toBe('warn');
            expect(status.detail).toMatch(/missing/i);
        } finally {
            fs.rmSync(dir2, { recursive: true, force: true });
        }
    });
});

// ── BUG: Makefile check does not differentiate Makefile from makefile (case) ──

describe('BUG: case sensitivity of build file names (Linux only)', () => {
    it('BUG: lowercase "makefile" is not checked for staleness on case-sensitive filesystems', async () => {
        if (process.platform === 'win32') {
            // Windows FS is case-insensitive: 'Makefile' stat will match 'makefile'
            // so this bug doesn't manifest on Windows. Skip.
            return;
        }
        const ccPath      = path.join(tmpDir, 'compile_commands.json');
        const makefileLow = path.join(tmpDir, 'makefile'); // lowercase
        fs.writeFileSync(ccPath, '[]');
        await new Promise(r => setTimeout(r, 10));
        fs.writeFileSync(makefileLow, 'all:'); // newer, but lowercase
        const now = Date.now();
        fs.utimesSync(ccPath, new Date(now - 5000), new Date(now - 5000));

        const status = ClangdHealth.check();
        // BUG: only 'Makefile' (capital M) is in the checked list.
        // On Linux, 'makefile' is a different file → staleness not detected → ok
        expect(status.state).toBe('ok'); // confirms the gap on case-sensitive Linux
    });
});

// ── Staleness check logic order ───────────────────────────────────────────────

describe('staleness check: first stale match wins', () => {
    it('if CMakeLists.txt is older but Makefile is newer — still detects stale', async () => {
        const ccPath    = path.join(tmpDir, 'compile_commands.json');
        const cmakePath = path.join(tmpDir, 'CMakeLists.txt');
        const makePath  = path.join(tmpDir, 'Makefile');

        // cmake is older than cc
        fs.writeFileSync(cmakePath, 'cmake_minimum_required(VERSION 3.0)');
        await new Promise(r => setTimeout(r, 20));
        fs.writeFileSync(ccPath, '[]');
        await new Promise(r => setTimeout(r, 20));
        // Makefile is newer than cc
        fs.writeFileSync(makePath, 'all:');

        const status = ClangdHealth.check();
        // CMakeLists.txt is older (ok), then Makefile is newer (stale)
        expect(status.state).toBe('warn');
        expect(status.detail).toMatch(/stale/i);
    });
});
