declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

const vscode = acquireVsCodeApi();

const root = document.getElementById('root');
if (root) {
    root.innerHTML = '<div class="placeholder">Code Analysis — ready</div>';
}

vscode.postMessage({ type: 'ready' });
