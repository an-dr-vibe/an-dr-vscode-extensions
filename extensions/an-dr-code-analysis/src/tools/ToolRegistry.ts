import { execFile } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import { ToolStatus, ToolState, ToolGroup } from '../webview/messages';
import { ClangdHealth } from './ClangdHealth';

const execFileAsync = promisify(execFile);

interface ToolDef {
    name: string;
    cmd: string;
    group: ToolGroup;
}

const TOOLS: ReadonlyArray<ToolDef> = [
    { name: 'clangd',        cmd: 'clangd',                 group: 'c-cpp' },
    { name: 'cmake',         cmd: 'cmake',                  group: 'c-cpp' },
    { name: 'bear',          cmd: 'bear',                   group: 'c-cpp' },
    { name: 'importlab',     cmd: 'importlab',              group: 'c-cpp' },
    { name: 'iwyu',          cmd: 'iwyu',                   group: 'c-cpp' },
    { name: 'rust-analyzer', cmd: 'rust-analyzer',          group: 'rust' },
    { name: 'cargo',         cmd: 'cargo',                  group: 'rust' },
    { name: 'pyan3',         cmd: 'pyan3',                  group: 'python' },
    { name: 'ctags',         cmd: 'ctags',                  group: 'universal' },
    { name: 'cscope',        cmd: 'cscope',                 group: 'universal' },
];

async function isAvailable(cmd: string): Promise<ToolState> {
    const finder = os.platform() === 'win32' ? 'where' : 'which';
    try {
        await execFileAsync(finder, [cmd], { timeout: 3000 });
        return 'ok';
    } catch {
        return 'missing';
    }
}

export class ToolRegistry {
    private _statuses: ToolStatus[] = [];

    async refresh(): Promise<ToolStatus[]> {
        const nonClangd = TOOLS.filter(t => t.name !== 'clangd');

        const [clangdBinary, ...otherStates] = await Promise.all([
            isAvailable('clangd'),
            ...nonClangd.map(t => isAvailable(t.cmd)),
        ]);

        const clangdStatus: ToolStatus = clangdBinary === 'ok'
            ? ClangdHealth.check()
            : { name: 'clangd', state: 'missing', group: 'c-cpp' };

        const otherStatuses: ToolStatus[] = nonClangd.map((t, i) => ({
            name: t.name,
            state: otherStates[i],
            group: t.group,
        }));

        this._statuses = [
            { name: 'tsserver', state: 'ok', group: 'typescript', detail: 'bundled with VS Code' },
            clangdStatus,
            ...otherStatuses,
        ];
        return this._statuses;
    }

    get statuses(): ToolStatus[] {
        return this._statuses;
    }
}
