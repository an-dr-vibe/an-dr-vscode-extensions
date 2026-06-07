import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { TOOL_HELP, ToolHelp, InstallCommand } from './toolHelp';

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderInstallCommands(commands: InstallCommand[]): string {
    if (commands.length === 0) {
        return '<p class="no-install">No installation required.</p>';
    }
    return commands.map(c => `
        <div class="install-block">
            <div class="platform-label">${escapeHtml(c.platform)}</div>
            <pre class="install-cmd"><code>${escapeHtml(c.command)}</code></pre>
        </div>`).join('');
}

function renderLinks(help: ToolHelp): string {
    const links: string[] = [];
    if (help.downloadUrl) {
        links.push(`<a href="${escapeHtml(help.downloadUrl)}">Download</a>`);
    }
    if (help.docsUrl) {
        links.push(`<a href="${escapeHtml(help.docsUrl)}">Documentation</a>`);
    }
    if (links.length === 0) { return ''; }
    return `<div class="links">${links.join(' · ')}</div>`;
}

function generateHelpHtml(webview: vscode.Webview, help: ToolHelp): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    const csp = [
        `default-src 'none'`,
        `style-src 'unsafe-inline'`,
        `img-src data:`,
    ].join('; ');

    const capabilities = help.affectsCapabilities
        .map(c => `<li>${escapeHtml(c)}</li>`)
        .join('');

    const notesHtml = help.notes
        ? `<div class="notes"><strong>Note:</strong> ${escapeHtml(help.notes)}</div>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Install: ${escapeHtml(help.name)}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 13px;
            line-height: 1.6;
            color: var(--vscode-foreground, #cccccc);
            background: var(--vscode-editor-background, #1e1e1e);
            padding: 24px 32px;
            max-width: 700px;
        }
        h1 {
            font-size: 1.4em;
            margin: 0 0 8px;
            color: var(--vscode-titleBar-activeForeground, #ffffff);
        }
        h2 {
            font-size: 1em;
            font-weight: 600;
            margin: 20px 0 8px;
            color: var(--vscode-titleBar-activeForeground, #d4d4d4);
            border-bottom: 1px solid var(--vscode-panel-border, #333);
            padding-bottom: 4px;
        }
        .description {
            color: var(--vscode-descriptionForeground, #9d9d9d);
            margin-bottom: 16px;
        }
        ul {
            margin: 0;
            padding-left: 20px;
        }
        li { margin: 2px 0; }
        .install-block { margin-bottom: 12px; }
        .platform-label {
            font-size: 0.85em;
            font-weight: 600;
            color: var(--vscode-descriptionForeground, #9d9d9d);
            margin-bottom: 2px;
        }
        pre {
            margin: 0;
            background: var(--vscode-textCodeBlock-background, #2d2d2d);
            border: 1px solid var(--vscode-panel-border, #444);
            border-radius: 4px;
            padding: 8px 12px;
            overflow-x: auto;
        }
        code {
            font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
            font-size: 0.95em;
            color: var(--vscode-textPreformat-foreground, #d7ba7d);
        }
        .notes {
            background: var(--vscode-inputValidation-warningBackground, #352a05);
            border: 1px solid var(--vscode-inputValidation-warningBorder, #b89500);
            border-radius: 4px;
            padding: 8px 12px;
            margin-top: 16px;
            font-size: 0.92em;
        }
        .links {
            margin-top: 16px;
            font-size: 0.92em;
        }
        a {
            color: var(--vscode-textLink-foreground, #4daafc);
            text-decoration: none;
        }
        a:hover { text-decoration: underline; }
        .no-install {
            color: var(--vscode-descriptionForeground, #9d9d9d);
            font-style: italic;
        }
    </style>
</head>
<body>
    <h1>${escapeHtml(help.name)}</h1>
    <p class="description">${escapeHtml(help.description)}</p>

    <h2>Enables</h2>
    <ul>${capabilities}</ul>

    <h2>Installation</h2>
    ${renderInstallCommands(help.installCommands)}

    ${renderLinks(help)}
    ${notesHtml}
</body>
</html>`;
}

export class ToolHelpPanel {
    static show(help: ToolHelp): void {
        const panel = vscode.window.createWebviewPanel(
            'an-dr-code-analysis.toolHelp',
            `Install: ${help.name}`,
            vscode.ViewColumn.One,
            { enableScripts: false }
        );
        panel.webview.html = generateHelpHtml(panel.webview, help);
    }

    static showByName(toolName: string): void {
        const help = TOOL_HELP[toolName];
        if (!help) { return; }
        ToolHelpPanel.show(help);
    }
}
