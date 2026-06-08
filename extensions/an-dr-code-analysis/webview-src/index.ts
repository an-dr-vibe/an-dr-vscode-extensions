import { CytoscapeRenderer } from './graph/CytoscapeRenderer';

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

// ── Stub graph (verification / Iteration 5) ──────────────────────────────────

const STUB_GRAPH: GraphModel = {
    graphType: 'callGraph',
    targetId: 'main',
    depth: 2,
    tool: 'stub',
    confidence: 'low',
    nodes: [
        { id: 'main',        label: 'main',        fullName: 'int main()',            filePath: 'main.c',    line: 10,  role: 'target'   },
        { id: 'foo',         label: 'foo',          fullName: 'void foo(int x)',       filePath: 'foo.c',     line: 5,   role: 'callee'   },
        { id: 'bar',         label: 'bar',          fullName: 'int bar()',             filePath: 'bar.c',     line: 1,   role: 'callee'   },
        { id: 'caller_a',    label: 'caller_a',     fullName: 'void caller_a()',       filePath: 'app.c',     line: 20,  role: 'caller'   },
        { id: 'ext_printf',  label: 'printf',       fullName: 'int printf(const char*,...)', filePath: undefined, line: undefined, role: 'external' },
    ],
    edges: [
        { sourceId: 'caller_a',   targetId: 'main'       },
        { sourceId: 'main',       targetId: 'foo'        },
        { sourceId: 'main',       targetId: 'bar'        },
        { sourceId: 'foo',        targetId: 'ext_printf', isExternal: true },
    ],
};

// ── State ────────────────────────────────────────────────────────────────────

interface AnalysisState {
    status: 'idle' | 'busy' | 'result' | 'error';
    graph?: GraphModel;
    errorMessage?: string;
    activeGraphType?: GraphType;
}

// ── File filter tree ─────────────────────────────────────────────────────────

interface TreeNode {
    name: string;
    fullPath: string;       // for files: the filePath; for dirs: the dir prefix
    isDir: boolean;
    children: TreeNode[];
}

function buildFileTree(graph: GraphModel): TreeNode {
    const root: TreeNode = { name: '', fullPath: '', isDir: true, children: [] };
    const filePaths = [...new Set(graph.nodes.map(n => n.filePath).filter(Boolean) as string[])];

    // Find common prefix to make paths relative in display
    const sep = /[\\/]/;
    const splitAll = filePaths.map(p => p.replace(/\\/g, '/').split('/'));
    let prefixLen = splitAll[0]?.length ?? 0;
    for (const parts of splitAll) {
        while (prefixLen > 0 && parts.slice(0, prefixLen).join('/') !== splitAll[0].slice(0, prefixLen).join('/')) {
            prefixLen--;
        }
    }
    const prefixParts = splitAll[0]?.slice(0, prefixLen) ?? [];

    for (const filePath of filePaths) {
        const parts = filePath.replace(/\\/g, '/').split('/').slice(prefixLen);
        let node = root;
        let cumPath = prefixParts.join('/');
        for (let i = 0; i < parts.length; i++) {
            cumPath = cumPath ? `${cumPath}/${parts[i]}` : parts[i];
            const isLast = i === parts.length - 1;
            let child = node.children.find(c => c.name === parts[i]);
            if (!child) {
                child = { name: parts[i], fullPath: isLast ? filePath : cumPath, isDir: !isLast, children: [] };
                node.children.push(child);
            }
            node = child;
        }
    }
    return root;
}

// uncheckedPaths: set of fullPath strings that are hidden
// collapsedDirs: set of dir fullPath strings that are collapsed
interface AppState {
    tools: ToolStatus[] | null;
    context: EditorContext | null;
    analysis: AnalysisState;
    depth: number;
    uncheckedPaths: Set<string>;
    collapsedDirs: Set<string>;
}
const state: AppState = {
    tools: null,
    context: null,
    analysis: { status: 'idle' },
    depth: 2,
    uncheckedPaths: new Set(),
    collapsedDirs: new Set(),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Renderer instance ────────────────────────────────────────────────────────

const vscode = acquireVsCodeApi();

let renderer: CytoscapeRenderer | null = null;

function getOrCreateRenderer(): CytoscapeRenderer {
    const container = document.getElementById('cy-container') as HTMLElement;
    const tooltip   = document.getElementById('cy-tooltip')   as HTMLElement;
    if (!renderer) {
        renderer = new CytoscapeRenderer(
            container,
            tooltip,
            (nodeId, filePath, line) => vscode.postMessage({ type: 'nodeClick',      nodeId, filePath, line }),
            (nodeId, filePath, line) => vscode.postMessage({ type: 'nodeDoubleClick', nodeId, filePath, line }),
        );
    }
    return renderer;
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

    const hasIssues = tools.some(t => t.state !== 'ok');
    return `<details class="section"${hasIssues ? ' open' : ''}>
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

    let ccppBtn = '';
    if (isCCppContext()) {
        const clangdTool = state.tools?.find(t => t.name === 'clangd');
        const ccPath = clangdTool?.state === 'ok' && clangdTool.detail
            ? `<div class="cc-path">${esc(clangdTool.detail)}</div>`
            : '';
        ccppBtn = `<div class="analysis-config"><button class="analysis-btn" id="setup-compile-commands">Setup compile_commands.json</button>${ccPath}</div>`;
    }

    return `<details class="section" open>
  <summary class="section-header">ANALYSIS</summary>
  <div class="section-body">
    <div class="analysis-buttons">${buttons}</div>
    ${ccppBtn}
  </div>
</details>`;
}

// ── File filter tree ─────────────────────────────────────────────────────────

function allDescendantFilesUnchecked(node: TreeNode): boolean {
    if (!node.isDir) { return isNodeFiltered({ filePath: node.fullPath, role: 'caller' } as GraphNode); }
    return node.children.length > 0 && node.children.every(c => allDescendantFilesUnchecked(c));
}

function renderTreeNode(node: TreeNode, indent: number): string {
    const pad = indent * 16;
    if (node.isDir) {
        const collapsed = state.collapsedDirs.has(node.fullPath);
        const checked = !allDescendantFilesUnchecked(node);
        const arrow = collapsed ? '▶' : '▼';
        const childrenHtml = collapsed ? '' : node.children.map(c => renderTreeNode(c, indent + 1)).join('');
        return `<div class="ft-row" style="padding-left:${pad}px">
  <span class="ft-toggle" data-dir="${esc(node.fullPath)}">${arrow}</span>
  <input type="checkbox" class="ft-check" data-path="${esc(node.fullPath)}" data-is-dir="1" ${checked ? 'checked' : ''}>
  <span class="ft-label ft-dir" data-dir="${esc(node.fullPath)}">${esc(node.name)}/</span>
</div>${childrenHtml}`;
    } else {
        const checked = !isNodeFiltered({ filePath: node.fullPath, role: 'caller' } as GraphNode);
        return `<div class="ft-row" style="padding-left:${pad}px">
  <span class="ft-toggle-spacer"></span>
  <input type="checkbox" class="ft-check" data-path="${esc(node.fullPath)}" ${checked ? 'checked' : ''}>
  <span class="ft-label">${esc(node.name)}</span>
</div>`;
    }
}

function renderFileFilter(graph: GraphModel): string {
    const tree = buildFileTree(graph);
    if (tree.children.length === 0) { return ''; }
    const childrenHtml = tree.children.map(c => renderTreeNode(c, 0)).join('');
    return `<details class="section ft-section" open>
  <summary class="section-header">FILTER</summary>
  <div class="section-body ft-body">${childrenHtml}</div>
</details>`;
}

function isNodeFiltered(node: GraphNode): boolean {
    if (!node.filePath || node.role === 'target') { return false; }
    const norm = node.filePath.replace(/\\/g, '/');
    for (const p of state.uncheckedPaths) {
        const np = p.replace(/\\/g, '/');
        if (norm === np || norm.startsWith(np + '/')) { return true; }
    }
    return false;
}

function applyFilter(graph: GraphModel): GraphModel {
    if (state.uncheckedPaths.size === 0) { return graph; }
    const visibleNodes = graph.nodes.filter(n => !isNodeFiltered(n));
    const visibleIds = new Set(visibleNodes.map(n => n.id));
    const visibleEdges = graph.edges.filter(e => visibleIds.has(e.sourceId) && visibleIds.has(e.targetId));
    return { ...graph, nodes: visibleNodes, edges: visibleEdges };
}

// ── GRAPH section ────────────────────────────────────────────────────────────

const CONFIDENCE_BADGE: Record<string, string> = {
    high:   '🟢',
    medium: '🟡',
    low:    '🔴',
};

function isCCppContext(): boolean {
    const id = state.context?.langId;
    return id === 'c' || id === 'cpp' || id === 'cuda-cpp' || id === 'objective-c' || id === 'objective-cpp';
}

function renderGraph(s: AnalysisState, depth: number): string {
    const graphTitle = s.activeGraphType ? ` — ${GRAPH_TYPE_LABELS[s.activeGraphType]}` : '';
    // Show which tool produced the result directly in the header
    const toolBadge = (s.status === 'result' && s.graph)
        ? ` <span class="header-tool-badge">${CONFIDENCE_BADGE[s.graph.confidence] ?? ''} ${esc(s.graph.tool)}</span>`
        : '';

    let bodyHtml: string;
    if (s.status === 'idle') {
        bodyHtml = `<div class="graph-placeholder">Select an analysis above.</div>`;
    } else if (s.status === 'busy') {
        bodyHtml = `<div class="graph-area" id="cy-container"></div><div class="graph-placeholder">Analyzing…</div>`;
    } else if (s.status === 'error') {
        const label = s.activeGraphType ? GRAPH_TYPE_LABELS[s.activeGraphType] : '';
        bodyHtml = `<div class="graph-area" id="cy-container"></div>`
            + `<div class="graph-error">${label ? `<strong>${esc(label)}:</strong> ` : ''}${esc(s.errorMessage ?? 'Unknown error')}</div>`;
    } else if (s.status === 'result' && s.graph) {
        const fallbackNote = s.graph.confidence !== 'high'
            ? `<div class="graph-fallback-note">Fallback tool — callers only, no callees</div>`
            : '';
        bodyHtml = `<div class="graph-area" id="cy-container"></div>
          <div class="graph-meta">
            <span class="graph-node-count">${s.graph.nodes.length} nodes, ${s.graph.edges.length} edges</span>
          </div>${fallbackNote}`;
    } else {
        bodyHtml = `<div class="graph-area" id="cy-container"></div><div class="graph-placeholder">No results found.</div>`;
    }

    const depthControls = `<div class="depth-controls">
      <button class="depth-btn" id="depth-minus" ${depth <= 1 ? 'disabled' : ''}>−</button>
      <span class="depth-label">Depth: ${depth}</span>
      <button class="depth-btn" id="depth-plus" ${depth >= 8 ? 'disabled' : ''}>+</button>
      <button class="depth-btn" id="depth-reset">reset</button>
    </div>`;

    return `<details class="section" open>
  <summary class="section-header">GRAPH${esc(graphTitle)}${toolBadge}</summary>
  <div class="section-body">
    ${bodyHtml}
    ${depthControls}
  </div>
</details>`;
}

// ── Render ───────────────────────────────────────────────────────────────────

const root = document.getElementById('root')!;

let _depthDebounce: ReturnType<typeof setTimeout> | undefined;

function render(): void {
    // always destroy before wiping the DOM — cy holds references to old nodes
    renderer?.destroy();
    renderer = null;

    let html = renderContext(state.context);
    html += renderAnalysis(state.analysis);
    html += renderGraph(state.analysis, state.depth);
    if (state.analysis.status === 'result' && state.analysis.graph) {
        html += renderFileFilter(state.analysis.graph);
    }
    if (state.tools !== null) {
        html += renderToolsStatus(state.tools);
    }
    root.innerHTML = html;

    // mount cytoscape into the freshly created #cy-container
    if (state.analysis.status === 'result' && state.analysis.graph) {
        const filtered = applyFilter(state.analysis.graph);
        getOrCreateRenderer().render(filtered);
    }
}

// Rebuilds only the filter tree body (for collapse/expand) without touching the rest of the DOM.
function rebuildFilterBody(): void {
    if (!state.analysis.graph) { return; }
    const body = document.querySelector<HTMLElement>('.ft-body');
    if (!body) { render(); return; } // section not in DOM yet — fall back to full render
    const tree = buildFileTree(state.analysis.graph);
    body.innerHTML = tree.children.map(c => renderTreeNode(c, 0)).join('');
}

// Re-renders only the cytoscape graph without touching the DOM — used when
// only the filter changes so <details> open/collapsed state is preserved.
function renderGraphOnly(): void {
    if (state.analysis.status !== 'result' || !state.analysis.graph) { return; }
    const filtered = applyFilter(state.analysis.graph);
    // Re-use existing renderer if container still exists, else recreate
    const container = document.getElementById('cy-container');
    if (!container) { render(); return; }
    if (!renderer) {
        renderer = new CytoscapeRenderer(
            container,
            document.getElementById('cy-tooltip') as HTMLElement,
            (nodeId, filePath, line) => vscode.postMessage({ type: 'nodeClick',       nodeId, filePath, line }),
            (nodeId, filePath, line) => vscode.postMessage({ type: 'nodeDoubleClick', nodeId, filePath, line }),
        );
    }
    renderer.render(filtered);
}

render();

// ── Events ───────────────────────────────────────────────────────────────────

function triggerDepthChange(): void {
    if (!state.analysis.activeGraphType) { return; }
    clearTimeout(_depthDebounce);
    _depthDebounce = setTimeout(() => {
        vscode.postMessage({ type: 'depthChange', graphType: state.analysis.activeGraphType!, depth: state.depth });
    }, 500);
}

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

    if (target.id === 'setup-compile-commands') {
        vscode.postMessage({ type: 'runCommand', command: 'an-dr-code-analysis.selectCompileCommands' });
        return;
    }

    const analysisBtn = target.closest<HTMLButtonElement>('.analysis-btn[data-graph-type]');
    if (analysisBtn && !analysisBtn.disabled) {
        const gt = analysisBtn.dataset['graphType'] as GraphType;
        state.analysis = { status: 'busy', activeGraphType: gt };
        render();
        vscode.postMessage({ type: 'requestAnalysis', graphType: gt, depth: state.depth });
        return;
    }

    if (target.id === 'depth-minus') {
        if (state.depth > 1) { state.depth--; render(); triggerDepthChange(); }
        return;
    }
    if (target.id === 'depth-plus') {
        if (state.depth < 8) { state.depth++; render(); triggerDepthChange(); }
        return;
    }
    if (target.id === 'depth-reset') {
        state.depth = 2;
        render();
        triggerDepthChange();
        return;
    }

    // File filter tree: collapse/expand toggle — rebuild only the filter body, not the whole page
    const toggle = target.closest<HTMLElement>('.ft-toggle');
    if (toggle) {
        const dir = toggle.dataset['dir']!;
        if (state.collapsedDirs.has(dir)) { state.collapsedDirs.delete(dir); }
        else { state.collapsedDirs.add(dir); }
        rebuildFilterBody();
        return;
    }
    const dirLabel = target.closest<HTMLElement>('.ft-dir');
    if (dirLabel) {
        const dir = dirLabel.dataset['dir']!;
        if (state.collapsedDirs.has(dir)) { state.collapsedDirs.delete(dir); }
        else { state.collapsedDirs.add(dir); }
        rebuildFilterBody();
        return;
    }
});

// File filter checkboxes — use 'change' so the checkbox value is correct
root.addEventListener('change', (e: Event) => {
    const target = e.target as HTMLElement;
    const cb = target.closest<HTMLInputElement>('.ft-check');
    if (!cb || !state.analysis.graph) { return; }

    const p = cb.dataset['path']!;
    const isDir = cb.dataset['isDir'] === '1';
    const checked = cb.checked;
    const norm = (s: string) => s.replace(/\\/g, '/');

    if (isDir) {
        const graph = state.analysis.graph;
        const prefix = norm(p);
        // Toggle all descendant file paths
        const descendantFiles = graph.nodes
            .map(n => n.filePath)
            .filter((f): f is string => !!f && norm(f).startsWith(prefix + '/'));
        for (const f of descendantFiles) {
            if (checked) { state.uncheckedPaths.delete(f); }
            else { state.uncheckedPaths.add(f); }
        }
        if (checked) { state.uncheckedPaths.delete(p); }
        else { state.uncheckedPaths.add(p); }
        // Update child checkbox visuals in-place (no DOM rebuild)
        document.querySelectorAll<HTMLInputElement>('.ft-check').forEach(c => {
            const cp = c.dataset['path']!;
            if (norm(cp).startsWith(prefix + '/') || cp === p) { c.checked = checked; }
        });
    } else {
        if (checked) { state.uncheckedPaths.delete(p); }
        else { state.uncheckedPaths.add(p); }
    }
    renderGraphOnly();
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
            state.uncheckedPaths = new Set();
            state.collapsedDirs = new Set();
            break;
        case 'analysisError':
            state.analysis = { status: 'error', errorMessage: msg.message, activeGraphType: msg.graphType };
            break;
    }
    render();
});

vscode.postMessage({ type: 'ready' });
