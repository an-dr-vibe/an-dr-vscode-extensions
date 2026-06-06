import { execSync, spawn } from 'child_process';

export type CliName = 'claude' | 'codex' | 'gh-copilot';

interface CliDef {
    name: CliName;
    binary: string;
    promptArgs(prompt: string): string[];
    detect(): boolean;
}

const CLI_DEFS: CliDef[] = [
    {
        name: 'claude',
        binary: 'claude',
        promptArgs: (prompt) => ['--print', prompt],
        detect: () => binaryExists('claude'),
    },
    {
        name: 'codex',
        binary: 'codex',
        promptArgs: (prompt) => ['--quiet', prompt],
        detect: () => binaryExists('codex'),
    },
    {
        name: 'gh-copilot',
        binary: 'gh',
        promptArgs: (prompt) => ['copilot', 'suggest', '-t', 'shell', prompt],
        detect: () => binaryExists('gh') && ghCopilotAvailable(),
    },
];

function binaryExists(bin: string): boolean {
    try {
        const cmd = process.platform === 'win32' ? `where "${bin}"` : `which "${bin}"`;
        execSync(cmd, { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

function ghCopilotAvailable(): boolean {
    try {
        execSync('gh copilot --version', { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

export function detectClis(): CliName[] {
    return CLI_DEFS.filter(d => d.detect()).map(d => d.name);
}

export function runCli(cli: CliName, prompt: string, stdin?: string): Promise<string> {
    const def = CLI_DEFS.find(d => d.name === cli);
    if (!def) { return Promise.reject(new Error(`Unknown CLI: ${cli}`)); }

    return new Promise((resolve, reject) => {
        const child = spawn(def.binary, def.promptArgs(prompt), {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: false,
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`${def.binary} exited ${code}:\n${stderr.trim()}`));
            } else {
                resolve(stdout.trim());
            }
        });

        child.on('error', reject);

        if (stdin) { child.stdin.write(stdin); }
        child.stdin.end();
    });
}
