declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

type ToolState = 'ok' | 'warn' | 'missing';
type ToolGroup = 'universal' | 'c-cpp' | 'rust' | 'python' | 'typescript';

interface ToolStatus {
    name: string;
    state: ToolState;
    group: ToolGroup;
    detail?: string;
}

interface ToolsStatusMessage { type: 'toolsStatus'; tools: ToolStatus[]; }
type IncomingMessage = ToolsStatusMessage;

const GROUP_LABELS: Record<ToolGroup, string> = {
    'typescript': 'TypeScript / JavaScript',
    'c-cpp':      'C / C++',
    'rust':       'Rust',
    'python':     'Python',
    'universal':  'Universal',
};

const GROUP_ORDER: ToolGroup[] = ['typescript', 'c-cpp', 'rust', 'python', 'universal'];

const ICONS: Record<ToolState, string> = { ok: '✅', warn: '⚠️', missing: '❌' };

function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderToolRow(t: ToolStatus): string {
    const detail = t.detail
        ? ` <span class="tool-detail">${escapeHtml(t.detail)}</span>`
        : '';
    const isClickable = t.state === 'warn' || t.state === 'missing';
    const icon = isClickable
        ? `<button class="tool-action" data-tool="${escapeHtml(t.name)}" title="Show install instructions">${ICONS[t.state]}</button>`
        : `<span class="tool-icon">${ICONS[t.state]}</span>`;
    return `<div class="tool-row">${icon}<span class="tool-name">${escapeHtml(t.name)}</span>${detail}</div>`;
}

function renderToolsStatus(tools: ToolStatus[]): string {
    const byGroup = new Map<ToolGroup, ToolStatus[]>();
    for (const g of GROUP_ORDER) { byGroup.set(g, []); }
    for (const t of tools) {
        byGroup.get(t.group)?.push(t);
    }

    const sections = GROUP_ORDER
        .filter(g => (byGroup.get(g)?.length ?? 0) > 0)
        .map(g => {
            const rows = (byGroup.get(g) ?? []).map(renderToolRow).join('');
            return `<div class="subsection">
  <div class="subsection-header">${escapeHtml(GROUP_LABELS[g])}</div>
  <div class="subsection-body">${rows}</div>
</div>`;
        })
        .join('');

    return `<details class="section">
  <summary class="section-header">TOOLS STATUS</summary>
  <div class="section-body">${sections}</div>
</details>`;
}

const vscode = acquireVsCodeApi();
const root = document.getElementById('root')!;
root.innerHTML = '<div class="placeholder">Code Analysis — ready</div>';

root.addEventListener('click', (e: MouseEvent) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('.tool-action');
    if (btn) {
        vscode.postMessage({ type: 'showToolHelp', toolName: btn.dataset['tool'] });
    }
});

window.addEventListener('message', (event: MessageEvent<IncomingMessage>) => {
    const msg = event.data;
    if (msg.type === 'toolsStatus') {
        root.innerHTML = renderToolsStatus(msg.tools);
    }
});

vscode.postMessage({ type: 'ready' });
