declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };

// ── Types ────────────────────────────────────────────────────────────────────

type ToolState = 'ok' | 'warn' | 'missing';
type ToolGroup = 'universal' | 'c-cpp' | 'rust' | 'python' | 'typescript';
type GraphType = 'callGraph' | 'fileDeps' | 'componentDeps';

interface ToolStatus {
    name: string;
    state: ToolState;
    group: ToolGroup;
    detail?: string;
}

type SymbolSource = 'call-hierarchy' | 'document-symbol' | 'word';

interface EditorContext {
    symbol?: string;
    symbolKind?: number;
    symbolSource: SymbolSource;
    file: string;
    filePath: string;
    lang: string;
    langId: string;
    isPinned: boolean;
}

interface GraphNode {
    id: string;
    label: string;
    fullName: string;
    filePath?: string;
    line?: number;
    role: 'target' | 'caller' | 'callee' | 'external';
}

interface GraphEdge { sourceId: string; targetId: string; isExternal?: boolean; }

interface GraphModel {
    graphType: GraphType;
    targetId: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    depth: number;
    tool: string;
    confidence: 'high' | 'medium' | 'low';
}

interface ToolsStatusMessage  { type: 'toolsStatus';   tools: ToolStatus[]; }
interface ContextUpdateMessage { type: 'contextUpdate'; context: EditorContext | null; }
interface AnalysisResultMessage { type: 'analysisResult'; graph: GraphModel; }
interface AnalysisErrorMessage  { type: 'analysisError';  graphType: GraphType; message: string; }
interface AnalysisBusyMessage   { type: 'analysisBusy';   graphType: GraphType; }
type IncomingMessage = ToolsStatusMessage | ContextUpdateMessage | AnalysisResultMessage | AnalysisErrorMessage | AnalysisBusyMessage;

// ── State ────────────────────────────────────────────────────────────────────

interface AnalysisState {
    status: 'idle' | 'busy' | 'result' | 'error';
    graph?: GraphModel;
    errorMessage?: string;
    activeGraphType?: GraphType;
    requestId?: number;
}

interface AppState {
    tools: ToolStatus[] | null;
    context: EditorContext | null;
    analysis: AnalysisState;
    depth: number;
}
const state: AppState = {
    tools: null,
    context: null,
    analysis: { status: 'idle' },
    depth: 2,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── CONTEXT section ──────────────────────────────────────────────────────────

function renderContext(ctx: EditorContext | null): string {
    const pinLabel = ctx?.isPinned ? '📌 Pinned' : '📌 Pin';
    const pinClass = ctx?.isPinned ? 'pin-btn pinned' : 'pin-btn';

    let symbolHtml = '—';
    if (ctx?.symbol) {
        if (ctx.symbolSource === 'call-hierarchy') {
            symbolHtml = `<span class="ctx-symbol">${esc(ctx.symbol)}</span>`;
        } else if (ctx.symbolSource === 'document-symbol') {
            symbolHtml = `<span class="ctx-symbol ctx-symbol-doc" title="From file structure — no LSP call hierarchy available">${esc(ctx.symbol)}</span>`;
        } else {
            symbolHtml = `<span class="ctx-symbol ctx-symbol-fallback">${esc(ctx.symbol)}</span>`
                + `<span class="ctx-symbol-warn" title="No symbol provider responded — showing word under cursor only. Analysis may not work correctly.">⚠️</span>`;
        }
    }
    const rows = ctx
        ? `<div class="ctx-row"><span class="ctx-key">Symbol</span><span class="ctx-val">${symbolHtml}</span></div>
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

// ── ANALYSIS section ─────────────────────────────────────────────────────────

const GRAPH_TYPE_LABELS: Record<GraphType, string> = {
    callGraph:      'Call Graph',
    fileDeps:       'File Deps',
    componentDeps:  'Component Deps',
};
const GRAPH_TYPES: GraphType[] = ['callGraph', 'fileDeps', 'componentDeps'];

function renderAnalysis(s: AnalysisState): string {
    const buttons = GRAPH_TYPES.map(gt => {
        const label = GRAPH_TYPE_LABELS[gt];
        const isBusy = s.status === 'busy' && s.activeGraphType === gt;
        const btnLabel = isBusy ? `⏳ ${label}…` : label;
        return `<button class="analysis-btn" data-graph-type="${gt}" ${isBusy ? 'disabled' : ''}>${btnLabel}</button>`;
    }).join('');

    return `<details class="section" open>
  <summary class="section-header">ANALYSIS</summary>
  <div class="section-body">
    <div class="analysis-buttons">${buttons}</div>
  </div>
</details>`;
}

// ── GRAPH section ────────────────────────────────────────────────────────────

const CONFIDENCE_BADGE: Record<string, string> = {
    high:   '🟢',
    medium: '🟡',
    low:    '🔴',
};

function renderGraph(s: AnalysisState, depth: number): string {
    const graphTitle = s.activeGraphType ? ` — ${GRAPH_TYPE_LABELS[s.activeGraphType]}` : '';
    let bodyHtml: string;

    if (s.status === 'idle') {
        bodyHtml = `<div class="graph-placeholder">Select an analysis above.</div>`;
    } else if (s.status === 'busy') {
        bodyHtml = `<div class="graph-placeholder">Analyzing…</div>`;
    } else if (s.status === 'error') {
        const label = s.activeGraphType ? GRAPH_TYPE_LABELS[s.activeGraphType] : '';
        bodyHtml = `<div class="graph-error">${label ? `<strong>${esc(label)}:</strong> ` : ''}${esc(s.errorMessage ?? 'Unknown error')}</div>`;
    } else if (s.status === 'result' && s.graph) {
        const badge = `${CONFIDENCE_BADGE[s.graph.confidence] ?? ''} ${esc(s.graph.tool)}`;
        bodyHtml = `<div id="graph-area" class="graph-area">[graph area — renderer coming in Iteration 5]</div>
          <div class="graph-meta">
            <span class="confidence-badge">${badge}</span>
            <span class="graph-node-count">${s.graph.nodes.length} nodes</span>
          </div>`;
    } else {
        bodyHtml = `<div class="graph-placeholder">No results found.</div>`;
    }

    const depthControls = `<div class="depth-controls">
      <button class="depth-btn" id="depth-minus" ${depth <= 1 ? 'disabled' : ''}>−</button>
      <span class="depth-label">Depth: ${depth}</span>
      <button class="depth-btn" id="depth-plus" ${depth >= 8 ? 'disabled' : ''}>+</button>
      <button class="depth-btn" id="depth-reset">reset</button>
    </div>`;

    return `<details class="section" open>
  <summary class="section-header">GRAPH${esc(graphTitle)}</summary>
  <div class="section-body">
    ${bodyHtml}
    ${depthControls}
  </div>
</details>`;
}

// ── Render ───────────────────────────────────────────────────────────────────

const vscode = acquireVsCodeApi();
const root = document.getElementById('root')!;

function render(): void {
    let html = renderContext(state.context);
    html += renderAnalysis(state.analysis);
    html += renderGraph(state.analysis, state.depth);
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
        return;
    }

    const analysisBtn = target.closest<HTMLButtonElement>('.analysis-btn');
    if (analysisBtn && !analysisBtn.disabled) {
        const gt = analysisBtn.dataset['graphType'] as GraphType;
        state.analysis = { status: 'busy', activeGraphType: gt };
        render();
        vscode.postMessage({ type: 'requestAnalysis', graphType: gt, depth: state.depth });
        return;
    }

    if (target.id === 'depth-minus') {
        if (state.depth > 1) {
            state.depth--;
            if (state.analysis.activeGraphType) {
                vscode.postMessage({ type: 'depthChange', graphType: state.analysis.activeGraphType, depth: state.depth });
            }
            render();
        }
        return;
    }

    if (target.id === 'depth-plus') {
        if (state.depth < 8) {
            state.depth++;
            if (state.analysis.activeGraphType) {
                vscode.postMessage({ type: 'depthChange', graphType: state.analysis.activeGraphType, depth: state.depth });
            }
            render();
        }
        return;
    }

    if (target.id === 'depth-reset') {
        state.depth = 2;
        if (state.analysis.activeGraphType) {
            vscode.postMessage({ type: 'depthChange', graphType: state.analysis.activeGraphType, depth: state.depth });
        }
        render();
        return;
    }
});

window.addEventListener('message', (event: MessageEvent<IncomingMessage>) => {
    const msg = event.data;
    switch (msg.type) {
        case 'toolsStatus':
            state.tools = msg.tools;
            break;
        case 'contextUpdate':
            state.context = msg.context;
            break;
        case 'analysisBusy':
            state.analysis = { status: 'busy', activeGraphType: msg.graphType };
            break;
        case 'analysisResult':
            state.analysis = { status: 'result', graph: msg.graph, activeGraphType: msg.graph.graphType };
            state.depth = msg.graph.depth;
            break;
        case 'analysisError':
            state.analysis = {
                status: 'error',
                errorMessage: msg.message,
                activeGraphType: msg.graphType,
            };
            break;
    }
    render();
});

vscode.postMessage({ type: 'ready' });
