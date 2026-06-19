// Tests for the file-system helpers inside selectCompileCommands.
// The command itself is not exported; we test the discoverable behaviour by
// calling the exported command function with a mocked vscode.window / workspace.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { workspace, window, Uri } from '../__mocks__/vscode';

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'select-cc-'));
    workspace.__setWorkspaceFolders([{ uri: Uri.file(tmpDir), name: 'test', index: 0 }]);
    jest.clearAllMocks();
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    workspace.__setWorkspaceFolders(undefined);
});

// Helper: create nested compile_commands.json with real content
function makeCompileCommands(relDir: string, empty = false): string {
    const dir = path.join(tmpDir, relDir);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'compile_commands.json');
    const content = empty ? '[]' : JSON.stringify([{ directory: dir, command: 'gcc foo.c', file: 'foo.c' }]);
    fs.writeFileSync(filePath, content);
    return filePath;
}

describe('selectCompileCommandsCommand — discovery', () => {
    it('shows QuickPick when called with workspace folder open', async () => {
        makeCompileCommands('build');
        (window.showQuickPick as jest.Mock).mockResolvedValue(undefined); // user cancelled

        const { selectCompileCommandsCommand } = await import('../commands/selectCompileCommands');
        await selectCompileCommandsCommand();

        expect(window.showQuickPick).toHaveBeenCalled();
        const items: any[] = (window.showQuickPick as jest.Mock).mock.calls[0][0];
        // Found file + Browse + None
        expect(items.some((i: any) => i.label?.includes('browse') || i.label?.includes('Browse'))).toBe(true);
        expect(items.some((i: any) => i.label?.includes('No compile_commands'))).toBe(true);
    });

    it('lists found compile_commands.json files as items', async () => {
        makeCompileCommands('build');
        (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

        const { selectCompileCommandsCommand } = await import('../commands/selectCompileCommands');
        await selectCompileCommandsCommand();

        const items: any[] = (window.showQuickPick as jest.Mock).mock.calls[0][0];
        const foundItems = items.filter((i: any) => !i.label.startsWith('$('));
        expect(foundItems.length).toBeGreaterThanOrEqual(1);
        expect(foundItems[0].label).toMatch(/build\/compile_commands\.json/);
    });

    it('does not list empty compile_commands.json', async () => {
        makeCompileCommands('build', true /* empty */);
        (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

        const { selectCompileCommandsCommand } = await import('../commands/selectCompileCommands');
        await selectCompileCommandsCommand();

        const items: any[] = (window.showQuickPick as jest.Mock).mock.calls[0][0];
        const foundItems = items.filter((i: any) => !i.label.startsWith('$('));
        expect(foundItems).toHaveLength(0);
    });

    it('warns and returns early when no workspace folder is open', async () => {
        workspace.__setWorkspaceFolders(undefined);
        const { selectCompileCommandsCommand } = await import('../commands/selectCompileCommands');
        await selectCompileCommandsCommand();
        expect(window.showWarningMessage).toHaveBeenCalled();
        expect(window.showQuickPick).not.toHaveBeenCalled();
    });
});

describe('selectCompileCommandsCommand — "No compile_commands" selection', () => {
    it('removes .clangd and clears config entry when user picks None', async () => {
        // Create a .clangd file that should be removed
        const clangdPath = path.join(tmpDir, '.clangd');
        fs.writeFileSync(clangdPath, 'CompileFlags:\n  CompilationDatabase: build\n');

        // Pre-populate a config.json so clearConfigKey has something to clear
        const configDir = path.join(tmpDir, '.vscode', 'code-analyser');
        fs.mkdirSync(configDir, { recursive: true });
        const configPath = path.join(configDir, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify({ compileCommandsPath: '/old/path' }));

        const NONE_LABEL = '$(circle-slash) No compile_commands (use ctags fallback)';
        (window.showQuickPick as jest.Mock).mockResolvedValue({ label: NONE_LABEL });

        const { selectCompileCommandsCommand } = await import('../commands/selectCompileCommands');
        await selectCompileCommandsCommand();

        expect(fs.existsSync(clangdPath)).toBe(false);
        // Config file should be gone (all keys removed)
        expect(fs.existsSync(configPath)).toBe(false);
    });
});

describe('selectCompileCommandsCommand — file selected', () => {
    it('writes .clangd with relative CompilationDatabase path', async () => {
        const ccPath = makeCompileCommands('build');
        const relLabel = 'build/compile_commands.json';
        (window.showQuickPick as jest.Mock).mockResolvedValue({
            label: relLabel,
            detail: ccPath,
        });
        const mockUpdate = jest.fn();
        (workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((k: string, d: unknown) => d),
            update: mockUpdate,
        });
        (window.showInformationMessage as jest.Mock).mockResolvedValue(undefined); // don't click Restart

        const { selectCompileCommandsCommand } = await import('../commands/selectCompileCommands');
        await selectCompileCommandsCommand();

        const clangdPath = path.join(tmpDir, '.clangd');
        expect(fs.existsSync(clangdPath)).toBe(true);
        const content = fs.readFileSync(clangdPath, 'utf8');
        expect(content).toMatch(/CompilationDatabase:\s+build/);
    });

    it('saves compileCommandsPath to config.json when file is selected', async () => {
        const ccPath = makeCompileCommands('build');
        (window.showQuickPick as jest.Mock).mockResolvedValue({
            label: 'build/compile_commands.json',
            detail: ccPath,
        });
        (window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

        const { selectCompileCommandsCommand } = await import('../commands/selectCompileCommands');
        await selectCompileCommandsCommand();

        const configPath = path.join(tmpDir, '.vscode', 'code-analyser', 'config.json');
        expect(fs.existsSync(configPath)).toBe(true);
        const stored = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        expect(stored.compileCommandsPath).toBe(ccPath);
    });
});

// ── Edge cases and fixed bugs ─────────────────────────────────────────────────

// The bugs tests use inline imports — pull in the command here for the fixture-based tests below.
import { selectCompileCommandsCommand } from '../commands/selectCompileCommands';

function setupMocksLocal() {
    jest.clearAllMocks();
    (window.withProgress as jest.Mock).mockImplementation(async (_o: unknown, task: () => Promise<void>) => task());
    (workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((_k: string, d: unknown) => d),
        update: jest.fn(),
    });
}

describe('S1 fix: scan depth — MAX_SCAN_DEPTH=5', () => {
    it('compile_commands.json exactly 4 subdirectories deep IS found', () => {
        setupMocksLocal();
        let dir = tmpDir;
        for (let i = 0; i < 4; i++) { dir = path.join(dir, `d${i}`); fs.mkdirSync(dir); }
        fs.writeFileSync(path.join(dir, 'compile_commands.json'),
            JSON.stringify([{ directory: dir, command: 'gcc', file: 'f.c' }]));
        (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
        return selectCompileCommandsCommand().then(() => {
            const items: any[] = (window.showQuickPick as jest.Mock).mock.calls[0]?.[0] ?? [];
            expect(items.filter((i: any) => !i.label.startsWith('$('))).toHaveLength(1);
        });
    });

    it('compile_commands.json exactly 5 subdirectories deep is NOT found', () => {
        setupMocksLocal();
        let dir = tmpDir;
        for (let i = 0; i < 5; i++) { dir = path.join(dir, `d${i}`); fs.mkdirSync(dir); }
        fs.writeFileSync(path.join(dir, 'compile_commands.json'),
            JSON.stringify([{ directory: dir, command: 'gcc', file: 'f.c' }]));
        (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
        return selectCompileCommandsCommand().then(() => {
            const items: any[] = (window.showQuickPick as jest.Mock).mock.calls[0]?.[0] ?? [];
            expect(items.filter((i: any) => !i.label.startsWith('$('))).toHaveLength(0);
        });
    });
});

describe('hidden directories (.) are skipped', () => {
    it('compile_commands.json inside .build is not discovered', () => {
        setupMocksLocal();
        const hiddenBuild = path.join(tmpDir, '.build');
        fs.mkdirSync(hiddenBuild);
        fs.writeFileSync(path.join(hiddenBuild, 'compile_commands.json'),
            JSON.stringify([{ directory: hiddenBuild, command: 'gcc', file: 'f.c' }]));
        (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
        return selectCompileCommandsCommand().then(() => {
            const items: any[] = (window.showQuickPick as jest.Mock).mock.calls[0]?.[0] ?? [];
            expect(items.filter((i: any) => !i.label.startsWith('$('))).toHaveLength(0);
        });
    });
});

describe('S3 fix: writeClangdConfig prompts before overwriting', () => {
    it('user cancels overwrite — existing .clangd is preserved', () => {
        setupMocksLocal();
        const clangdPath = path.join(tmpDir, '.clangd');
        fs.writeFileSync(clangdPath, '# User config\nCompileFlags:\n  Add: [-std=c++17]\n');
        const buildDir = path.join(tmpDir, 'build');
        fs.mkdirSync(buildDir);
        const ccPath = path.join(buildDir, 'compile_commands.json');
        fs.writeFileSync(ccPath, JSON.stringify([{ directory: buildDir, command: 'gcc', file: 'f.c' }]));
        (window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'build/compile_commands.json', detail: ccPath });
        (window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');
        return selectCompileCommandsCommand().then(() => {
            expect(fs.readFileSync(clangdPath, 'utf8')).toContain('-std=c++17');
        });
    });

    it('user confirms overwrite — .clangd is updated', () => {
        setupMocksLocal();
        const clangdPath = path.join(tmpDir, '.clangd');
        fs.writeFileSync(clangdPath, '# User config\nCompileFlags:\n  Add: [-std=c++17]\n');
        const buildDir = path.join(tmpDir, 'build');
        fs.mkdirSync(buildDir);
        const ccPath = path.join(buildDir, 'compile_commands.json');
        fs.writeFileSync(ccPath, JSON.stringify([{ directory: buildDir, command: 'gcc', file: 'f.c' }]));
        (window.showQuickPick as jest.Mock).mockResolvedValue({ label: 'build/compile_commands.json', detail: ccPath });
        (window.showWarningMessage as jest.Mock).mockResolvedValue('Overwrite');
        (window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);
        return selectCompileCommandsCommand().then(() => {
            expect(fs.readFileSync(clangdPath, 'utf8')).toMatch(/CompilationDatabase/);
        });
    });
});

describe('S4 fix: "None" selection does NOT call showInformationMessage', () => {
    it('showInformationMessage is not called when None is selected', () => {
        setupMocksLocal();
        (window.showQuickPick as jest.Mock).mockResolvedValue({
            label: '$(circle-slash) No compile_commands (use ctags fallback)',
        });
        return selectCompileCommandsCommand().then(() => {
            expect((window.showInformationMessage as jest.Mock).mock.calls).toHaveLength(0);
        });
    });
});

describe('S5 fix: undefined picked.detail is handled gracefully', () => {
    it('returns without throwing when picked.detail is undefined', () => {
        setupMocksLocal();
        (window.showQuickPick as jest.Mock).mockResolvedValue({
            label: 'some/path/compile_commands.json',
            detail: undefined,
        });
        return expect(selectCompileCommandsCommand()).resolves.toBeUndefined();
    });
});

describe('subprojects directory is scanned (known limitation)', () => {
    it('compile_commands.json inside subprojects/ IS found and offered', () => {
        setupMocksLocal();
        const subDir = path.join(tmpDir, 'subprojects', 'libfoo');
        fs.mkdirSync(subDir, { recursive: true });
        fs.writeFileSync(path.join(subDir, 'compile_commands.json'),
            JSON.stringify([{ directory: subDir, command: 'gcc', file: 'f.c' }]));
        (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
        return selectCompileCommandsCommand().then(() => {
            const items: any[] = (window.showQuickPick as jest.Mock).mock.calls[0]?.[0] ?? [];
            const found = items.filter((i: any) => !i.label.startsWith('$('));
            expect(found.length).toBeGreaterThan(0);
            expect(found.some((i: any) => i.label.includes('subprojects'))).toBe(true);
        });
    });
});
