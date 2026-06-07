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
