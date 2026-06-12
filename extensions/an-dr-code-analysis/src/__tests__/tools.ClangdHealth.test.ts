import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { workspace, Uri } from '../__mocks__/vscode';
import { ClangdHealth } from '../tools/ClangdHealth';

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clangd-health-'));
    workspace.__setWorkspaceFolders([{ uri: Uri.file(tmpDir), name: 'test', index: 0 }]);
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    workspace.__setWorkspaceFolders(undefined);
});

describe('ClangdHealth.check', () => {
    it('warns when no workspace folder is open', () => {
        workspace.__setWorkspaceFolders(undefined);
        const status = ClangdHealth.check();
        expect(status.state).toBe('warn');
        expect(status.detail).toMatch(/no workspace/i);
    });

    it('warns when compile_commands.json is missing', () => {
        const status = ClangdHealth.check();
        expect(status.state).toBe('warn');
        expect(status.detail).toMatch(/compile_commands\.json not found/i);
    });

    it('returns ok when compile_commands.json is present and up-to-date', () => {
        fs.writeFileSync(path.join(tmpDir, 'compile_commands.json'),
            JSON.stringify([{ directory: tmpDir, command: 'gcc foo.c', file: 'foo.c' }]));
        const status = ClangdHealth.check();
        expect(status.state).toBe('ok');
        expect(status.name).toBe('clangd');
    });

    it('warns when CMakeLists.txt is newer than compile_commands.json', async () => {
        const ccPath = path.join(tmpDir, 'compile_commands.json');
        const cmakePath = path.join(tmpDir, 'CMakeLists.txt');
        fs.writeFileSync(ccPath,
            JSON.stringify([{ directory: tmpDir, command: 'gcc foo.c', file: 'foo.c' }]));
        // Wait a tick so timestamps differ reliably
        await new Promise(r => setTimeout(r, 10));
        fs.writeFileSync(cmakePath, 'cmake_minimum_required(VERSION 3.0)');
        // Explicitly backdate compile_commands.json to be older
        const now = Date.now();
        fs.utimesSync(ccPath, new Date(now - 5000), new Date(now - 5000));

        const status = ClangdHealth.check();
        expect(status.state).toBe('warn');
        expect(status.detail).toMatch(/stale/i);
    });

    it('warns when Makefile is newer than compile_commands.json', async () => {
        const ccPath = path.join(tmpDir, 'compile_commands.json');
        const makePath = path.join(tmpDir, 'Makefile');
        fs.writeFileSync(ccPath,
            JSON.stringify([{ directory: tmpDir, command: 'gcc foo.c', file: 'foo.c' }]));
        await new Promise(r => setTimeout(r, 10));
        fs.writeFileSync(makePath, 'all:');
        const now = Date.now();
        fs.utimesSync(ccPath, new Date(now - 5000), new Date(now - 5000));

        const status = ClangdHealth.check();
        expect(status.state).toBe('warn');
        expect(status.detail).toMatch(/stale/i);
    });

    it('returns ok when compile_commands.json is newer than CMakeLists.txt', async () => {
        const cmakePath = path.join(tmpDir, 'CMakeLists.txt');
        const ccPath = path.join(tmpDir, 'compile_commands.json');
        fs.writeFileSync(cmakePath, 'cmake_minimum_required(VERSION 3.0)');
        await new Promise(r => setTimeout(r, 10));
        fs.writeFileSync(ccPath,
            JSON.stringify([{ directory: tmpDir, command: 'gcc foo.c', file: 'foo.c' }]));

        const status = ClangdHealth.check();
        expect(status.state).toBe('ok');
    });

    it('always reports group as c-cpp', () => {
        const status = ClangdHealth.check();
        expect(status.group).toBe('c-cpp');
    });

    it('always reports name as clangd', () => {
        const status = ClangdHealth.check();
        expect(status.name).toBe('clangd');
    });
});

// ── Edge cases and fixed bugs ─────────────────────────────────────────────────

describe('compile_commands.json via .clangd CompilationDatabase directive', () => {
    it('empty compile_commands.json found via .clangd directive — warns about empty', () => {
        const buildDir = path.join(tmpDir, 'build');
        fs.mkdirSync(buildDir);
        fs.writeFileSync(path.join(buildDir, 'compile_commands.json'), '[]');
        fs.writeFileSync(path.join(tmpDir, '.clangd'), 'CompileFlags:\n  CompilationDatabase: build\n');
        const status = ClangdHealth.check();
        expect(status.state).toBe('warn');
        expect(status.detail).toMatch(/empty/i);
    });
});

describe('H2 fix: meson.build and build.ninja staleness detection', () => {
    it('meson.build newer than compile_commands.json is detected as stale', () => {
        const ccPath    = path.join(tmpDir, 'compile_commands.json');
        const mesonPath = path.join(tmpDir, 'meson.build');
        fs.writeFileSync(ccPath, JSON.stringify([{ directory: tmpDir, command: 'gcc foo.c', file: 'foo.c' }]));
        const now = Date.now();
        fs.utimesSync(ccPath, new Date(now - 5000), new Date(now - 5000));
        fs.writeFileSync(mesonPath, 'project("test")');
        const status = ClangdHealth.check();
        expect(status.state).toBe('warn');
        expect(status.detail).toMatch(/stale/i);
    });

    it('build.ninja newer than compile_commands.json is detected as stale', () => {
        const ccPath    = path.join(tmpDir, 'compile_commands.json');
        const ninjaPath = path.join(tmpDir, 'build.ninja');
        fs.writeFileSync(ccPath, JSON.stringify([{ directory: tmpDir, command: 'gcc foo.c', file: 'foo.c' }]));
        const now = Date.now();
        fs.utimesSync(ccPath, new Date(now - 5000), new Date(now - 5000));
        fs.writeFileSync(ninjaPath, '# ninja');
        const status = ClangdHealth.check();
        expect(status.state).toBe('warn');
        expect(status.detail).toMatch(/stale/i);
    });
});

describe('H3 fix: empty or malformed compile_commands.json is invalid', () => {
    it('empty array returns warn', () => {
        fs.writeFileSync(path.join(tmpDir, 'compile_commands.json'), '[]');
        const status = ClangdHealth.check();
        expect(status.state).toBe('warn');
        expect(status.detail).toMatch(/empty/i);
    });

    it('completely empty file returns warn', () => {
        fs.writeFileSync(path.join(tmpDir, 'compile_commands.json'), '');
        expect(ClangdHealth.check().state).toBe('warn');
    });

    it('malformed JSON returns warn', () => {
        fs.writeFileSync(path.join(tmpDir, 'compile_commands.json'), '{not valid json}');
        const status = ClangdHealth.check();
        expect(status.state).toBe('warn');
        expect(status.detail).toMatch(/malformed/i);
    });
});

describe('H5 fix: lowercase makefile staleness (case-sensitive FS only)', () => {
    it('lowercase makefile newer than compile_commands.json is detected as stale', () => {
        if (process.platform === 'win32') { return; }
        const ccPath      = path.join(tmpDir, 'compile_commands.json');
        const makefileLow = path.join(tmpDir, 'makefile');
        fs.writeFileSync(ccPath, JSON.stringify([{ directory: tmpDir, command: 'gcc foo.c', file: 'foo.c' }]));
        const now = Date.now();
        fs.utimesSync(ccPath, new Date(now - 5000), new Date(now - 5000));
        fs.writeFileSync(makefileLow, 'all:');
        const status = ClangdHealth.check();
        expect(status.state).toBe('warn');
        expect(status.detail).toMatch(/stale/i);
    });
});

describe('staleness: first stale build file match wins', () => {
    it('CMakeLists.txt older but Makefile newer → stale', async () => {
        const ccPath    = path.join(tmpDir, 'compile_commands.json');
        const cmakePath = path.join(tmpDir, 'CMakeLists.txt');
        const makePath  = path.join(tmpDir, 'Makefile');
        fs.writeFileSync(cmakePath, 'cmake_minimum_required(VERSION 3.0)');
        await new Promise(r => setTimeout(r, 20));
        fs.writeFileSync(ccPath, JSON.stringify([{ directory: tmpDir, command: 'gcc foo.c', file: 'foo.c' }]));
        await new Promise(r => setTimeout(r, 20));
        fs.writeFileSync(makePath, 'all:');
        const status = ClangdHealth.check();
        expect(status.state).toBe('warn');
        expect(status.detail).toMatch(/stale/i);
    });
});
