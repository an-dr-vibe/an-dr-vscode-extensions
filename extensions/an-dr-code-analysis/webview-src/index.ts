declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

// ── Types ────────────────────────────────────────────────────────────────────

type ToolState = 'ok' | 'warn' | 'missing';
type ToolGroup = 'universal' | 'c-cpp' | 'rust' | 'python' | 'typescript';

interface ToolStatus {
    name: string;
    state: ToolState;
    group: ToolGroup;
    detail?: string;
}

interface EditorContext {
    symbol?: string;
    file: string;
    filePath: string;
    lang: string;
    langId: string;
    isPinned: boolean;
}

interface ToolsStatusMessage  { type: 'toolsStatus';   tools: ToolStatus[]; }
interface ContextUpdateMessage { type: 'contextUpdate'; context: EditorContext | null; }
type IncomingMessage = ToolsStatusMessage | ContextUpdateMessage;

// ── State ────────────────────────────────────────────────────────────────────

interface AppState {
    tools: ToolStatus[] | null;
    context: EditorContext | null;
}
const state: AppState = { tools: null, context: null };

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── CONTEXT section ──────────────────────────────────────────────────────────

function renderContext(ctx: EditorContext | null): string {
    const pinLabel = ctx?.isPinned ? '📌 Pinned' : '📌 Pin';
    const pinClass = ctx?.isPinned ? 'pin-btn pinned' : 'pin-btn';

    const rows = ctx
        ? `<div class="ctx-row"><span class="ctx-key">Symbol</span><span class="ctx-val ctx-symbol">${esc(ctx.symbol ?? '—')}</span></div>
           <div class="ctx-row"><span class="ctx-key">File</span><span class="ctx-val">${esc(ctx.file)}</span></div>
           <div class="ctx-row"><span class="ctx-key">Lang</span><span class="ctx-val">${esc(ctx.lang)}</span></div>`
        : `<div class="ctx-empty">No file open</div>`;

    return `<details class="section" open>
  <summary class="section-header">CONTEXT <button class="${pinClass}" id="pin-btn">${pinLabel}</button></summary>
  <div class="section-body ctx-body">${rows}</div>
</details>`;
}

// ── TOOLS STATUS section ─────────────────────────────────────────────────────

const GROUP_LABELS: Record<ToolGroup, string> = {
    'typescript': 'TypeScript / JavaScript',
    'c-cpp':      'C / C++',
    'rust':       'Rust',
    'python':     'Python',
    'universal':  'Universal',
};
const GROUP_ORDER: ToolGroup[] = ['typescript', 'c-cpp', 'rust', 'python', 'universal'];
const ICONS: Record<ToolState, string> = { ok: '✅', warn: '⚠️', missing: '❌' };

function renderToolRow(t: ToolStatus): string {
    const detail = t.detail ? ` <span class="tool-detail">${esc(t.detail)}</span>` : '';
    const clickable = t.state === 'warn' || t.state === 'missing';
    const icon = clickable
        ? `<button class="tool-action" data-tool="${esc(t.name)}" title="Show install instructions">${ICONS[t.state]}</button>`
        : `<span class="tool-icon">${ICONS[t.state]}</span>`;
    return `<div class="tool-row">${icon}<span class="tool-name">${esc(t.name)}</span>${detail}</div>`;
}

function renderToolsStatus(tools: ToolStatus[]): string {
    const byGroup = new Map<ToolGroup, ToolStatus[]>();
    for (const g of GROUP_ORDER) { byGroup.set(g, []); }
    for (const t of tools) { byGroup.get(t.group)?.push(t); }

    const sections = GROUP_ORDER
        .filter(g => (byGroup.get(g)?.length ?? 0) > 0)
        .map(g => {
            const rows = (byGroup.get(g) ?? []).map(renderToolRow).join('');
            return `<div class="subsection">
  <div class="subsection-header">${esc(GROUP_LABELS[g])}</div>
  <div class="subsection-body">${rows}</div>
</div>`;
        }).join('');

    return `<details class="section">
  <summary class="section-header">TOOLS STATUS</summary>
  <div class="section-body">${sections}</div>
</details>`;
}

// ── Render ───────────────────────────────────────────────────────────────────

const vscode = acquireVsCodeApi();
const root = document.getElementById('root')!;

function render(): void {
    let html = renderContext(state.context);
    if (state.tools !== null) {
        html += renderToolsStatus(state.tools);
    }
    root.innerHTML = html;
}

render();

// ── Events ───────────────────────────────────────────────────────────────────

root.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as Element;

    if (target.id === 'pin-btn' || target.closest('#pin-btn')) {
        vscode.postMessage({ type: 'togglePin' });
        return;
    }

    const toolBtn = target.closest<HTMLButtonElement>('.tool-action');
    if (toolBtn) {
        vscode.postMessage({ type: 'showToolHelp', toolName: toolBtn.dataset['tool'] });
    }
});

window.addEventListener('message', (event: MessageEvent<IncomingMessage>) => {
    const msg = event.data;
    if (msg.type === 'toolsStatus') {
        state.tools = msg.tools;
        render();
    } else if (msg.type === 'contextUpdate') {
        state.context = msg.context;
        render();
    }
});

vscode.postMessage({ type: 'ready' });
