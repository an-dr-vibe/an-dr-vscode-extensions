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
        /* CONTEXT section */
        .ctx-body { padding: 4px 0 4px 4px; }
        .ctx-row {
            display: flex;
            align-items: baseline;
            gap: 8px;
            padding: 2px 0;
            font-size: 0.92em;
        }
        .ctx-key {
            min-width: 46px;
            color: var(--vscode-descriptionForeground);
            font-size: 0.88em;
        }
        .ctx-val {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .ctx-symbol {
            font-family: var(--vscode-editor-font-family, monospace);
            font-weight: 600;
        }
        .ctx-symbol-doc {
            font-weight: normal;
        }
        .ctx-symbol-fallback {
            font-weight: normal;
            opacity: 0.55;
        }
        .ctx-symbol-warn {
            font-size: 0.8em;
            margin-left: 4px;
            cursor: help;
        }
        .ctx-empty {
            font-style: italic;
            color: var(--vscode-descriptionForeground);
            padding: 4px 0;
            font-size: 0.92em;
        }
        /* Pin button — inline in summary */
        .section-header { display: flex; align-items: center; justify-content: space-between; }
        .pin-btn {
            background: none;
            border: 1px solid transparent;
            border-radius: 3px;
            padding: 0 4px;
            cursor: pointer;
            font-size: 0.8em;
            color: var(--vscode-descriptionForeground);
            line-height: 1.4;
        }
        .pin-btn:hover {
            border-color: var(--vscode-button-border, rgba(128,128,128,0.4));
            color: var(--vscode-foreground);
        }
        .pin-btn.pinned {
            color: var(--vscode-foreground);
            border-color: var(--vscode-button-border, rgba(128,128,128,0.4));
            background: var(--vscode-badge-background, rgba(128,128,128,0.2));
        }
        /* ANALYSIS section */
        .analysis-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            padding: 2px 0;
        }
        .analysis-btn {
            background: var(--vscode-button-secondaryBackground, rgba(128,128,128,0.15));
            color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
            border: 1px solid var(--vscode-button-border, rgba(128,128,128,0.3));
            border-radius: 3px;
            padding: 3px 8px;
            cursor: pointer;
            font-size: 0.88em;
        }
        .analysis-btn:hover:not(:disabled) {
            background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,0.25));
        }
        .analysis-btn:disabled { opacity: 0.5; cursor: default; }
        /* GRAPH section */
        .graph-area {
            position: relative;
            width: 100%;
            height: 260px;
            background: var(--vscode-editor-background, #1e1e1e);
            border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
            border-radius: 3px;
            overflow: hidden;
        }
        .graph-placeholder, .graph-error {
            padding: 12px 4px;
            font-size: 0.88em;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
        }
        .graph-error { color: var(--vscode-errorForeground, #f48771); font-style: normal; }
        .ft-section .section-body { padding: 4px 0; }
        .ft-row {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 1px 4px;
            font-size: 0.82em;
            line-height: 1.5;
            white-space: nowrap;
            overflow: hidden;
        }
        .ft-toggle {
            cursor: pointer;
            font-size: 0.7em;
            width: 12px;
            flex-shrink: 0;
            user-select: none;
            color: var(--vscode-descriptionForeground);
        }
        .ft-toggle-spacer { width: 12px; flex-shrink: 0; }
        .ft-check { flex-shrink: 0; cursor: pointer; margin: 0; }
        .ft-label {
            overflow: hidden;
            text-overflow: ellipsis;
            cursor: default;
        }
        .ft-dir { cursor: pointer; font-weight: 500; }
        .graph-fallback-note {
            font-size: 0.8em;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
            padding: 2px 4px;
        }
        .analysis-config { margin-top: 6px; }
        .graph-action-btn {
            display: inline-block;
            margin-top: 6px;
            padding: 3px 8px;
            font-size: 0.82em;
            background: var(--vscode-button-secondaryBackground, #3a3d41);
            color: var(--vscode-button-secondaryForeground, #ccc);
            border: none;
            border-radius: 3px;
            cursor: pointer;
        }
        .graph-action-btn:hover { background: var(--vscode-button-secondaryHoverBackground, #4a4d51); }
        .graph-meta {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 4px 0 2px;
            font-size: 0.82em;
            color: var(--vscode-descriptionForeground);
        }
        .depth-controls {
            display: flex;
            align-items: center;
            gap: 4px;
            padding: 4px 0;
        }
        .depth-btn {
            background: var(--vscode-button-secondaryBackground, rgba(128,128,128,0.15));
            color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
            border: 1px solid var(--vscode-button-border, rgba(128,128,128,0.3));
            border-radius: 3px;
            padding: 1px 7px;
            cursor: pointer;
            font-size: 0.9em;
            min-width: 24px;
        }
        .depth-btn:hover:not(:disabled) {
            background: var(--vscode-button-secondaryHoverBackground, rgba(128,128,128,0.25));
        }
        .depth-btn:disabled { opacity: 0.4; cursor: default; }
        .depth-label { font-size: 0.88em; color: var(--vscode-foreground); min-width: 54px; }
        /* Tooltip */
        #cy-tooltip {
            position: fixed;
            display: none;
            background: var(--vscode-editorHoverWidget-background, #252526);
            border: 1px solid var(--vscode-editorHoverWidget-border, #454545);
            color: var(--vscode-editorHoverWidget-foreground, #ccc);
            font-size: 0.82em;
            font-family: var(--vscode-editor-font-family, monospace);
            padding: 4px 8px;
            border-radius: 3px;
            pointer-events: none;
            white-space: pre;
            z-index: 1000;
            max-width: 320px;
            overflow: hidden;
            text-overflow: ellipsis;
        }
    </style>
</head>
<body>
    <div id="root">
        <div class="placeholder">Code Analysis — loading…</div>
    </div>
    <div id="cy-tooltip"></div>
    <script nonce="${nonce}" src="${webviewScriptUri}"></script>
</body>
</html>`;
}
