import * as vscode from 'vscode';
import { detectClis, runCli, CliName } from './cli';
import { execSync } from 'child_process';

export interface AnDrAiApi {
    runPrompt(prompt: string, stdin?: string): Promise<string>;
    isAvailable(): boolean;
    getActiveCli(): CliName | null;
}

let outputChannel: vscode.OutputChannel;
let activeCli: CliName | null = null;

function cfg<T>(key: string): T | undefined {
    return vscode.workspace.getConfiguration('an-dr-ai').get<T>(key);
}

function resolveActiveCli(available: CliName[]): CliName | null {
    if (available.length === 0) { return null; }
    const preferred = cfg<string>('preferredCli') ?? 'auto';
    if (preferred !== 'auto' && available.includes(preferred as CliName)) {
        return preferred as CliName;
    }
    return available[0];
}

function getOrCreateChannel(): vscode.OutputChannel {
    const name = cfg<string>('outputChannel') || 'an-dr-ai';
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel(name);
    }
    return outputChannel;
}

function showOutput(text: string): void {
    const ch = getOrCreateChannel();
    ch.clear();
    ch.appendLine(text);
    ch.show(true);
}

function getStagedDiff(): string {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!root) { throw new Error('No workspace folder open.'); }
    const diff = execSync('git diff --staged', { cwd: root, encoding: 'utf8' });
    if (!diff.trim()) { throw new Error('Nothing staged.'); }
    return diff;
}

async function setSCMInputBox(message: string): Promise<void> {
    const gitExt = vscode.extensions.getExtension<GitExtension>('vscode.git');
    if (!gitExt) {
        vscode.window.showErrorMessage('an-dr-ai: vscode.git extension not available.');
        return;
    }
    const git = gitExt.isActive ? gitExt.exports : await gitExt.activate();
    const repo = git.getAPI(1).repositories[0];
    if (repo) { repo.inputBox.value = message; }
}

function requireCli(): CliName {
    if (!activeCli) { throw new Error('No AI CLI available. Install claude, codex, or gh copilot.'); }
    return activeCli;
}

export function activate(context: vscode.ExtensionContext): AnDrAiApi {
    outputChannel = vscode.window.createOutputChannel(cfg<string>('outputChannel') || 'an-dr-ai');
    context.subscriptions.push(outputChannel);

    activeCli = resolveActiveCli(detectClis());
    if (!activeCli) {
        void vscode.window.showErrorMessage(
            'an-dr-ai: No AI CLI detected. Install claude, codex, or gh copilot CLI and ensure it is in PATH.'
        );
    }

    const cmds: [string, () => Promise<void>][] = [
        ['an-dr-ai.explainSelection', async () => {
            const cli = requireCli();
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.selection.isEmpty) {
                void vscode.window.showWarningMessage('an-dr-ai: No text selected.');
                return;
            }
            const selection = editor.document.getText(editor.selection);
            showOutput(await runCli(cli, 'Explain this code briefly and clearly:', selection));
        }],

        ['an-dr-ai.generateCommitMessage', async () => {
            const cli = requireCli();
            let diff: string;
            try { diff = getStagedDiff(); } catch (e) {
                const msg = String(e instanceof Error ? e.message : e);
                void vscode.window.showWarningMessage(
                    msg === 'Nothing staged.' ? 'an-dr-ai: Nothing staged.' : `an-dr-ai: ${msg}`
                );
                return;
            }
            const message = await runCli(
                cli,
                'Write a conventional commit message for this diff. One line only. No explanation.',
                diff
            );
            await setSCMInputBox(message);
        }],

        ['an-dr-ai.askSelection', async () => {
            const cli = requireCli();
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.selection.isEmpty) {
                void vscode.window.showWarningMessage('an-dr-ai: No text selected.');
                return;
            }
            const selection = editor.document.getText(editor.selection);
            const question = await vscode.window.showInputBox({ prompt: 'Ask a question about the selection' });
            if (!question) {
                void vscode.window.showWarningMessage('an-dr-ai: No question entered.');
                return;
            }
            showOutput(await runCli(cli, `Answer this question: ${question}`, selection));
        }],
    ];

    for (const [id, fn] of cmds) {
        context.subscriptions.push(
            vscode.commands.registerCommand(id, async () => {
                try { await fn(); } catch (e) {
                    void vscode.window.showErrorMessage(`an-dr-ai: ${String(e instanceof Error ? e.message : e)}`);
                }
            })
        );
    }

    context.subscriptions.push(
        vscode.commands.registerCommand('an-dr-ai.explainCommit', async () => {
            try {
                const cli = requireCli();
                const diff = getStagedDiff();
                showOutput(await runCli(cli, 'Explain what this diff does, why it matters, and what the intended behavior change is.', diff));
            } catch (e) {
                const msg = String(e instanceof Error ? e.message : e);
                if (msg === 'Nothing staged.') {
                    void vscode.window.showWarningMessage('an-dr-ai: Nothing staged.');
                } else {
                    void vscode.window.showErrorMessage(`an-dr-ai: ${msg}`);
                }
            }
        }),
        vscode.commands.registerCommand('an-dr-ai.findFlaws', async () => {
            try {
                const cli = requireCli();
                const diff = getStagedDiff();
                showOutput(await runCli(cli, cfg<string>('prompts.findFlaws') ?? DEFAULT_FIND_FLAWS, diff));
            } catch (e) {
                const msg = String(e instanceof Error ? e.message : e);
                if (msg === 'Nothing staged.') {
                    void vscode.window.showWarningMessage('an-dr-ai: Nothing staged.');
                } else {
                    void vscode.window.showErrorMessage(`an-dr-ai: ${msg}`);
                }
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('an-dr-ai.reviewFile', async () => {
            try {
                const cli = requireCli();
                const editor = vscode.window.activeTextEditor;
                if (!editor) {
                    void vscode.window.showWarningMessage('an-dr-ai: No active editor.');
                    return;
                }
                const prompt = cfg<string>('prompts.reviewFile') ?? DEFAULT_REVIEW_FILE;
                showOutput(await runCli(cli, prompt, editor.document.getText()));
            } catch (e) {
                void vscode.window.showErrorMessage(`an-dr-ai: ${String(e instanceof Error ? e.message : e)}`);
            }
        })
    );

    return {
        runPrompt: (prompt, stdin) => runCli(requireCli(), prompt, stdin),
        isAvailable: () => activeCli !== null,
        getActiveCli: () => activeCli,
    };
}

export function deactivate(): void {
    // nothing to clean up
}

// --- Type shim for vscode.git extension API ---
interface GitExtension {
    getAPI(version: 1): { repositories: Array<{ inputBox: { value: string } }> };
}

// --- Default prompts ---
const DEFAULT_FIND_FLAWS = `You are a senior code reviewer. Review this diff for:
- Logic errors and edge cases
- Security issues (injection, auth, data exposure)
- Breaking changes not obvious from the diff
- Missing error handling
- Test coverage gaps
- Anything that will cause pain in 3 months

Be blunt. No praise. Flag unknowns explicitly.`;

const DEFAULT_REVIEW_FILE = `You are a senior code reviewer. Review this file for:
- Architecture and structural issues
- Security vulnerabilities
- Dead code or unnecessary complexity
- Missing error handling
- Anything that should be refactored before this goes to production

Be blunt. No praise. Flag unknowns explicitly.`;
