import * as vscode from 'vscode';
import * as path from 'path';

// ── Status bar items ──────────────────────────────────────────────────────────

let selectionItem: vscode.StatusBarItem;
let goToLineItem: vscode.StatusBarItem;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRelativePath(editor: vscode.TextEditor): string {
    const uri = editor.document.uri;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
        return path.relative(workspaceFolder.uri.fsPath, uri.fsPath);
    }
    return uri.fsPath;
}

function applyFormat(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}

function buildSelectionText(editor: vscode.TextEditor): string {
    const cfg = vscode.workspace.getConfiguration('editorSelection');
    const selection = editor.selection;
    const line = selection.active.line + 1;       // 1-based
    const col = selection.active.character + 1;   // 1-based

    if (selection.isEmpty) {
        return applyFormat(cfg.get<string>('cursorFormat', 'Ln {line}, Col {col}'), { line, col });
    }

    const selLines = selection.end.line - selection.start.line + 1;
    const chars = editor.document.getText(selection).length;

    if (selLines === 1) {
        return applyFormat(
            cfg.get<string>('selectionFormat', 'Ln {line}, Col {col}  ({chars} selected)'),
            { line, col, chars }
        );
    }
    return applyFormat(
        cfg.get<string>('multilineFormat', 'Ln {line}, Col {col}  ({selLines} lines, {chars} chars)'),
        { line, col, chars, selLines }
    );
}

// ── Update ────────────────────────────────────────────────────────────────────

function update(): void {
    const editor = vscode.window.activeTextEditor;

    // No text editor at all (e.g. focus on Explorer, Terminal, webview panel) —
    // keep last state visible as long as any text editor is open.
    if (!editor) {
        if (vscode.window.visibleTextEditors.length === 0) {
            selectionItem.hide();
            goToLineItem.hide();
        }
        return;
    }

    const isFileScheme = editor.document.uri.scheme === 'file';

    selectionItem.text = buildSelectionText(editor);
    if (isFileScheme) {
        selectionItem.tooltip = new vscode.MarkdownString(
            `**Click** to copy relative path + line\n\n` +
            `\`${getRelativePath(editor)}:${editor.selection.active.line + 1}\``
        );
        selectionItem.command = 'an-dr-editor-selection.copyPathAndLine';
    } else {
        selectionItem.tooltip = undefined;
        selectionItem.command = undefined;
    }
    selectionItem.show();

    const showBtn = vscode.workspace.getConfiguration('editorSelection').get<boolean>('showGoToLineButton', true);
    if (showBtn) { goToLineItem.show(); } else { goToLineItem.hide(); }
}

// ── Activate ──────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    // Main info item — left side, high priority so it sits near the built-in one
    selectionItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right, 101
    );
    selectionItem.name = 'an-dr: Editor Selection';

    // Small go-to-line button right next to the info item
    goToLineItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right, 100
    );
    goToLineItem.name = 'an-dr: Go to Line';
    goToLineItem.text = '$(go-to-file)';
    goToLineItem.tooltip = 'Go to Line…';
    goToLineItem.command = 'an-dr-editor-selection.goToLine';

    context.subscriptions.push(selectionItem, goToLineItem);

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'an-dr-editor-selection.copyPathAndLine',
            async () => {
                const editor = vscode.window.activeTextEditor;
                if (!editor) { return; }
                const line = editor.selection.active.line + 1;
                const text = `${getRelativePath(editor)}:${line}`;
                await vscode.env.clipboard.writeText(text);
                vscode.window.setStatusBarMessage(`Copied: ${text}`, 3000);
            }
        ),

        vscode.commands.registerCommand(
            'an-dr-editor-selection.goToLine',
            async () => {
                await vscode.commands.executeCommand('workbench.action.gotoLine');
            }
        ),

        vscode.window.onDidChangeActiveTextEditor(update),
        vscode.window.onDidChangeTextEditorSelection(update),
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('editorSelection')) { update(); }
        }),
    );

    update();
}

export function deactivate(): void { /* nothing to clean up */ }
