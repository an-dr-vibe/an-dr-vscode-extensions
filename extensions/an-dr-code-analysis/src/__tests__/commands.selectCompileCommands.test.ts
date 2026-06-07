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
    it('removes .clangd and clears setting when user picks None', async () => {
        // Create a .clangd file that should be removed
        const clangdPath = path.join(tmpDir, '.clangd');
        fs.writeFileSync(clangdPath, 'CompileFlags:\n  CompilationDatabase: build\n');

        const NONE_LABEL = '$(circle-slash) No compile_commands (use ctags fallback)';
        (window.showQuickPick as jest.Mock).mockResolvedValue({ label: NONE_LABEL });
        const mockUpdate = jest.fn();
        (workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((k: string, d: unknown) => d),
            update: mockUpdate,
        });

        const { selectCompileCommandsCommand } = await import('../commands/selectCompileCommands');
        await selectCompileCommandsCommand();

        expect(fs.existsSync(clangdPath)).toBe(false);
        expect(mockUpdate).toHaveBeenCalledWith('tools.compileCommandsPath', '', expect.anything());
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

    it('saves compileCommandsPath to settings when file is selected', async () => {
        const ccPath = makeCompileCommands('build');
        (window.showQuickPick as jest.Mock).mockResolvedValue({
            label: 'build/compile_commands.json',
            detail: ccPath,
        });
        const mockUpdate = jest.fn();
        (workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((k: string, d: unknown) => d),
            update: mockUpdate,
        });
        (window.showInformationMessage as jest.Mock).mockResolvedValue(undefined);

        const { selectCompileCommandsCommand } = await import('../commands/selectCompileCommands');
        await selectCompileCommandsCommand();

        expect(mockUpdate).toHaveBeenCalledWith('tools.compileCommandsPath', ccPath, expect.anything());
    });
});
