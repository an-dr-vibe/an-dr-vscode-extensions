import * as vscode from 'vscode';
import * as crypto from 'crypto';

export function generateWebviewHtml(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    webviewScriptUri: vscode.Uri
): string {
    const nonce = crypto.randomBytes(16).toString('hex');

    const csp = [
        `default-src 'none'`,
        `script-src 'nonce-${nonce}'`,
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `img-src ${webview.cspSource} data:`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Code Analysis</title>
    <style>
        body {
            padding: 0;
            margin: 0;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
        }
        #root {
            padding: 8px;
        }
        .placeholder {
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 16px 8px;
        }
        .section {
            margin-bottom: 8px;
        }
        .section-header {
            cursor: pointer;
            user-select: none;
            font-weight: 600;
            font-size: 0.85em;
            letter-spacing: 0.05em;
            padding: 4px 2px;
            color: var(--vscode-sideBarSectionHeader-foreground);
            list-style: none;
        }
        .section-header::-webkit-details-marker { display: none; }
        .section-header::before {
            content: '▶ ';
            font-size: 0.7em;
            opacity: 0.7;
        }
        details[open] > .section-header::before {
            content: '▼ ';
        }
        .section-body {
            padding: 4px 0 4px 8px;
        }
        .tool-row {
            display: flex;
            align-items: baseline;
            gap: 6px;
            padding: 2px 0;
            font-size: 0.92em;
        }
        .tool-name {
            font-family: var(--vscode-editor-font-family, monospace);
        }
        .tool-detail {
            color: var(--vscode-descriptionForeground);
            font-size: 0.88em;
        }
        .subsection { margin: 4px 0 8px; }
        .subsection-header {
            font-size: 0.78em;
            font-weight: 600;
            letter-spacing: 0.04em;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            padding: 4px 0 2px;
            border-bottom: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
            margin-bottom: 2px;
        }
        .subsection-body { padding-left: 4px; }
        .tool-icon { font-size: 0.85em; }
        .tool-action {
            background: none;
            border: none;
            padding: 0;
            cursor: pointer;
            font-size: 0.85em;
            line-height: 1;
            opacity: 0.9;
        }
        .tool-action:hover { opacity: 1; text-decoration: underline; }
    </style>
</head>
<body>
    <div id="root">
        <div class="placeholder">Code Analysis — loading…</div>
    </div>
    <script nonce="${nonce}" src="${webviewScriptUri}"></script>
</body>
</html>`;
}
