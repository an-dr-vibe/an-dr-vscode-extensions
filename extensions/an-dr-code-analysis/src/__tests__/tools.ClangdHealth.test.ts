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
        expect(status.detail).toMatch(/compile_commands\.json missing/i);
    });

    it('returns ok when compile_commands.json is present and up-to-date', () => {
        fs.writeFileSync(path.join(tmpDir, 'compile_commands.json'), '[]');
        const status = ClangdHealth.check();
        expect(status.state).toBe('ok');
        expect(status.name).toBe('clangd');
    });

    it('warns when CMakeLists.txt is newer than compile_commands.json', async () => {
        const ccPath = path.join(tmpDir, 'compile_commands.json');
        const cmakePath = path.join(tmpDir, 'CMakeLists.txt');
        fs.writeFileSync(ccPath, '[]');
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
        fs.writeFileSync(ccPath, '[]');
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
        fs.writeFileSync(ccPath, '[]');

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
