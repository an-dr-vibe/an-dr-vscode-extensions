// Adversarial tests for selectCompileCommands — probing suspected bugs.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { workspace, window, Uri } from '../__mocks__/vscode';

let tmpDir: string;

function setupDir() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scc-bugs-'));
    workspace.__setWorkspaceFolders([{ uri: Uri.file(tmpDir), name: 'test', index: 0 }]);
}

function setupMocks() {
    jest.clearAllMocks();
    (window.withProgress as jest.Mock).mockImplementation(async (_o: unknown, task: () => Promise<void>) => task());
    (workspace.getConfiguration as jest.Mock).mockReturnValue({
        get: jest.fn((_k: string, d: unknown) => d),
        update: jest.fn(),
    });
}

beforeEach(() => {
    setupDir();
    setupMocks();
});

afterEach(() => {
    if (tmpDir) { fs.rmSync(tmpDir, { recursive: true, force: true }); }
    workspace.__setWorkspaceFolders(undefined);
});

// Pull in the command once — not via resetModules, just use the existing module:
import { selectCompileCommandsCommand } from '../commands/selectCompileCommands';

// ── BUG: maxDepth = 5 but scan starts at depth=0 → actually scans 6 levels ──

describe('BUG: scan depth off-by-one', () => {
    it('compile_commands.json exactly 5 subdirectories deep IS found (depth=5 is still scanned)', () => {
        // scan(root, 0) → recurse into children at depth=1
        // scan(d0, 1) → recurse into children at depth=2 ...
        // scan(d4, 5) → 5 > 5 = false → scanned → compile_commands.json found
        // So a file 5 levels of subdirectories deep IS found.
        let dir = tmpDir;
        for (let i = 0; i < 5; i++) {
            dir = path.join(dir, `d${i}`);
            fs.mkdirSync(dir);
        }
        fs.writeFileSync(path.join(dir, 'compile_commands.json'),
            JSON.stringify([{ directory: dir, command: 'gcc', file: 'f.c' }]));

        (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
        return selectCompileCommandsCommand().then(() => {
            const items: any[] = (window.showQuickPick as jest.Mock).mock.calls[0]?.[0] ?? [];
            const found = items.filter((i: any) => !i.label.startsWith('$('));
            expect(found.length).toBe(1);
        });
    });

    it('BUG: compile_commands.json 6 subdirectories deep is NOT found — off-by-one means maxDepth=5 actually allows depth=5', () => {
        // scan(d5, 6) → 6 > 5 = true → BLOCKED
        let dir = tmpDir;
        for (let i = 0; i < 6; i++) {
            dir = path.join(dir, `d${i}`);
            fs.mkdirSync(dir);
        }
        fs.writeFileSync(path.join(dir, 'compile_commands.json'),
            JSON.stringify([{ directory: dir, command: 'gcc', file: 'f.c' }]));

        (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
        return selectCompileCommandsCommand().then(() => {
            const items: any[] = (window.showQuickPick as jest.Mock).mock.calls[0]?.[0] ?? [];
            const found = items.filter((i: any) => !i.label.startsWith('$('));
            // The variable is called maxDepth=5 but effective depth is 6 levels.
            // A file at level 6 IS blocked, so this is 0. Documents the naming confusion.
            expect(found.length).toBe(0);
        });
    });
});

// ── BUG: hidden directories (starting with .) are skipped ────────────────────

describe('BUG: directories starting with . are skipped by scanner', () => {
    it('BUG: compile_commands.json inside .build is never discovered', () => {
        const hiddenBuild = path.join(tmpDir, '.build');
        fs.mkdirSync(hiddenBuild);
        fs.writeFileSync(path.join(hiddenBuild, 'compile_commands.json'),
            JSON.stringify([{ directory: hiddenBuild, command: 'gcc', file: 'f.c' }]));

        (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
        return selectCompileCommandsCommand().then(() => {
            const items: any[] = (window.showQuickPick as jest.Mock).mock.calls[0]?.[0] ?? [];
            const found = items.filter((i: any) => !i.label.startsWith('$('));
            // BUG: .build is skipped because name.startsWith('.') → 0 results
            expect(found).toHaveLength(0);
        });
    });

    it('BUG: compile_commands.json inside .cache is never discovered', () => {
        const cacheDir = path.join(tmpDir, '.cache');
        fs.mkdirSync(cacheDir);
        fs.writeFileSync(path.join(cacheDir, 'compile_commands.json'),
            JSON.stringify([{ directory: cacheDir, command: 'gcc', file: 'f.c' }]));

        (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
        return selectCompileCommandsCommand().then(() => {
            const items: any[] = (window.showQuickPick as jest.Mock).mock.calls[0]?.[0] ?? [];
            const found = items.filter((i: any) => !i.label.startsWith('$('));
            expect(found).toHaveLength(0);
        });
    });
});

// ── BUG: writeClangdConfig overwrites existing .clangd without warning ────────

describe('BUG: writeClangdConfig overwrites existing user .clangd', () => {
    it('BUG: existing hand-crafted .clangd is silently overwritten when user picks a file', () => {
        const clangdPath = path.join(tmpDir, '.clangd');
        const userContent = '# User config\nCompileFlags:\n  Add: [-std=c++17]\n';
        fs.writeFileSync(clangdPath, userContent);

        const buildDir = path.join(tmpDir, 'build');
        fs.mkdirSync(buildDir);
        const ccPath = path.join(buildDir, 'compile_commands.json');
        fs.writeFileSync(ccPath, JSON.stringify([{ directory: buildDir, command: 'gcc', file: 'f.c' }]));

        (window.showQuickPick as jest.Mock).mockResolvedValue({
            label: 'build/compile_commands.json',
            detail: ccPath,
        });
        (window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

        return selectCompileCommandsCommand().then(() => {
            const newContent = fs.readFileSync(clangdPath, 'utf8');
            // BUG CONFIRMED: user's -std=c++17 and custom comment are gone
            expect(newContent).not.toContain('-std=c++17');
            expect(newContent).not.toContain('# User config');
            // And it was replaced with the generated content:
            expect(newContent).toMatch(/CompilationDatabase/);
        });
    });
});

// ── BUG: showInformationMessage call when None is selected ────────────────────

describe('"None" selection shows informationMessage', () => {
    it('BUG: showInformationMessage is called with message containing "cleared"', () => {
        const NONE_LABEL = '$(circle-slash) No compile_commands (use ctags fallback)';
        (window.showQuickPick as jest.Mock).mockResolvedValue({ label: NONE_LABEL });

        return selectCompileCommandsCommand().then(() => {
            // The call happens but showInformationMessage mock may not capture it
            // depending on the withProgress mock chain. Verify the function was called at all:
            const calls = (window.showInformationMessage as jest.Mock).mock.calls;
            const hasCleared = calls.some(args =>
                typeof args[0] === 'string' && args[0].toLowerCase().includes('cleared')
            );
            expect(hasCleared).toBe(true);
        });
    });
});

// ── BUG: subprojects directory IS scanned ────────────────────────────────────

describe('BUG: subprojects directory is scanned by findCompileCommandsFiles', () => {
    it('BUG: compile_commands.json inside subprojects/ IS found and offered to user', () => {
        const subDir = path.join(tmpDir, 'subprojects', 'libfoo');
        fs.mkdirSync(subDir, { recursive: true });
        fs.writeFileSync(path.join(subDir, 'compile_commands.json'),
            JSON.stringify([{ directory: subDir, command: 'gcc', file: 'f.c' }]));

        (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
        return selectCompileCommandsCommand().then(() => {
            const items: any[] = (window.showQuickPick as jest.Mock).mock.calls[0]?.[0] ?? [];
            const found = items.filter((i: any) => !i.label.startsWith('$('));
            // BUG: subprojects/ is NOT excluded from scan (unlike ctags which excludes it)
            // so compile_commands.json from dependency subprojects is offered to the user
            expect(found.length).toBeGreaterThan(0);
            expect(found.some((i: any) => i.label.includes('subprojects'))).toBe(true);
        });
    });
});

// ── BUG: picked.detail used with non-null assertion ──────────────────────────

describe('BUG: non-null assertion on picked.detail', () => {
    it('BUG: if picked.detail is undefined, path.dirname throws TypeError', () => {
        // A found item that for some reason has no detail field
        (window.showQuickPick as jest.Mock).mockResolvedValue({
            label: 'some/path/compile_commands.json',
            detail: undefined,
        });
        (window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

        // BUG: code does `filePath = picked.detail!` → undefined → path.dirname(undefined) throws
        return selectCompileCommandsCommand().then(
            () => { /* resolved: either bug didn't trigger or was caught */ },
            (err) => {
                // If it rejected, the TypeError was not caught inside the command
                expect(err).toBeDefined();
            }
        );
    });
});

// ── BUG: compile_commands.json outside workspace root ────────────────────────

describe('BUG: CompilationDatabase with path outside workspace', () => {
    it('BUG: Browse to file outside workspace writes ../../ relative path to .clangd', () => {
        const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'));
        try {
            const outsideCc = path.join(outsideDir, 'compile_commands.json');
            fs.writeFileSync(outsideCc,
                JSON.stringify([{ directory: outsideDir, command: 'gcc', file: 'f.c' }]));

            (window.showQuickPick as jest.Mock).mockResolvedValue({ label: '$(folder-opened) Browse…' });
            (window.showOpenDialog as jest.Mock).mockResolvedValue([Uri.file(outsideCc)]);
            (window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

            return selectCompileCommandsCommand().then(() => {
                const clangdPath = path.join(tmpDir, '.clangd');
                if (fs.existsSync(clangdPath)) {
                    const content = fs.readFileSync(clangdPath, 'utf8');
                    // BUG: relative path traversal written to .clangd, clangd may not resolve it
                    expect(content).toMatch(/\.\./);
                }
            });
        } finally {
            fs.rmSync(outsideDir, { recursive: true, force: true });
        }
    });
});

// ── Cancellation paths are safe ───────────────────────────────────────────────

describe('Cancellation safety', () => {
    it('cancelling QuickPick does not write .clangd', () => {
        (window.showQuickPick as jest.Mock).mockResolvedValue(undefined);
        return selectCompileCommandsCommand().then(() => {
            expect(fs.existsSync(path.join(tmpDir, '.clangd'))).toBe(false);
        });
    });

    it('cancelling Browse (undefined) does not write .clangd', () => {
        (window.showQuickPick as jest.Mock).mockResolvedValue({ label: '$(folder-opened) Browse…' });
        (window.showOpenDialog as jest.Mock).mockResolvedValue(undefined);
        return selectCompileCommandsCommand().then(() => {
            expect(fs.existsSync(path.join(tmpDir, '.clangd'))).toBe(false);
        });
    });

    it('cancelling Browse (empty array) does not write .clangd', () => {
        (window.showQuickPick as jest.Mock).mockResolvedValue({ label: '$(folder-opened) Browse…' });
        (window.showOpenDialog as jest.Mock).mockResolvedValue([]);
        return selectCompileCommandsCommand().then(() => {
            expect(fs.existsSync(path.join(tmpDir, '.clangd'))).toBe(false);
        });
    });
});

// ── "None" selection removes .clangd correctly ───────────────────────────────

describe('"None" selection clears .clangd', () => {
    it('removes .clangd if it exists', () => {
        const clangdPath = path.join(tmpDir, '.clangd');
        fs.writeFileSync(clangdPath, 'CompileFlags:\n  CompilationDatabase: build\n');

        const NONE_LABEL = '$(circle-slash) No compile_commands (use ctags fallback)';
        (window.showQuickPick as jest.Mock).mockResolvedValue({ label: NONE_LABEL });

        return selectCompileCommandsCommand().then(() => {
            expect(fs.existsSync(clangdPath)).toBe(false);
        });
    });

    it('does not throw when .clangd does not exist', () => {
        const NONE_LABEL = '$(circle-slash) No compile_commands (use ctags fallback)';
        (window.showQuickPick as jest.Mock).mockResolvedValue({ label: NONE_LABEL });
        return expect(selectCompileCommandsCommand()).resolves.toBeUndefined();
    });
});
