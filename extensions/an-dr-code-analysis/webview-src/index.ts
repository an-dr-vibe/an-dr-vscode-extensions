import { createRenderer } from './graph-renderers/CytoscapeRenderer';
import { GraphRenderer } from './graph-renderers/IGraphRenderer';
import { LayoutName, LAYOUT_META } from './graph-renderers/types';
import { resolveNodeDblClick } from '../src/webview/nodeActions';

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
    role: 'target' | 'caller' | 'callee' | 'external' | 'folder';
}

interface GraphEdge { sourceId: string; targetId: string; isExternal?: boolean; isBidirectional?: boolean; }

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
interface AnalysisErrorMessage  { type: 'analysisError';  graphType: GraphType; message: string; recoveryActions?: RecoveryAction[]; }
interface AnalysisBusyMessage      { type: 'analysisBusy';      graphType: GraphType; message?: string; }
interface AnalysisCancelledMessage { type: 'analysisCancelled'; graphType: GraphType; }
interface ClangdHealthMessage   { type: 'clangdHealth'; issue: ClangdHealth['issue']; message: string; recoveryActions?: RecoveryAction[]; }
interface ConfigPathsMessage    { type: 'configPaths'; compileCommandsPath?: string; tsconfigPath?: string; }
type IncomingMessage = ToolsStatusMessage | ContextUpdateMessage | AnalysisResultMessage | AnalysisErrorMessage | AnalysisBusyMessage | AnalysisCancelledMessage | ClangdHealthMessage | ConfigPathsMessage;

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

interface RecoveryAction { label: string; command: string; args?: unknown[]; }

interface AnalysisState {
    status: 'idle' | 'busy' | 'result' | 'error';
    graph?: GraphModel;
    errorMessage?: string;
    busyMessage?: string;
    recoveryActions?: RecoveryAction[];
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
interface ClangdHealth {
    issue: 'NO_COMPILE_COMMANDS' | 'STALE_COMPILE_COMMANDS' | 'CROSS_COMPILE' | null;
    message: string;
}

interface ConfigPaths { compileCommandsPath?: string; tsconfigPath?: string; }

interface AppState {
    tools: ToolStatus[] | null;
    context: EditorContext | null;
    analysis: AnalysisState;
    depth: number;
    uncheckedPaths: Set<string>;
    collapsedDirs: Set<string>;
    clangdHealth: ClangdHealth | null;
    configPaths: ConfigPaths;
    mergeCircular: boolean;
    selectedFilePath: string | null;
    layout: LayoutName | null;
}
const state: AppState = {
    tools: null,
    context: null,
    analysis: { status: 'idle' },
    depth: 1,
    uncheckedPaths: new Set(),
    collapsedDirs: new Set(),
    clangdHealth: null,
    configPaths: {},
    mergeCircular: true,
    selectedFilePath: null,
    layout: null,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function esc(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Section fold persistence ─────────────────────────────────────────────────

const FOLD_KEY = 'an-dr-code-analysis.sectionFold';

function loadFoldState(): Record<string, boolean> {
    try { return JSON.parse(localStorage.getItem(FOLD_KEY) ?? '{}'); } catch { return {}; }
}

function saveFoldState(id: string, open: boolean): void {
    const s = loadFoldState();
    s[id] = open;
    localStorage.setItem(FOLD_KEY, JSON.stringify(s));
}

// Apply saved open/closed state to all <details data-section-id="..."> elements.
function applyFoldState(): void {
    const s = loadFoldState();
    document.querySelectorAll<HTMLDetailsElement>('details[data-section-id]').forEach(el => {
        const id = el.dataset['sectionId']!;
        if (id in s) { el.open = s[id]; }
    });
}

// ── Full-tab mode ────────────────────────────────────────────────────────────

const IS_FULL_TAB = !!(window as unknown as { __CA_FULL_TAB?: boolean }).__CA_FULL_TAB;

// ── Renderer instance ────────────────────────────────────────────────────────

const vscode = acquireVsCodeApi();

let renderer: GraphRenderer | null = null;

function getOrCreateRenderer(): GraphRenderer {
    const container = document.getElementById('cy-container') as HTMLElement;
    const tooltip   = document.getElementById('cy-tooltip')   as HTMLElement;
    if (!renderer) {
        renderer = createRenderer(
            container,
            tooltip,
            (nodeId, filePath, line) => {
                vscode.postMessage({ type: 'nodeClick', nodeId, filePath, line });
                // Track selected file for tree highlighting
                if (filePath !== state.selectedFilePath) {
                    state.selectedFilePath = filePath ?? null;
                    rebuildFilterBody();
                }
            },
            (nodeId, filePath, line, fullName) => {
                const g = state.analysis.graph;
                const action = resolveNodeDblClick(nodeId, filePath, line, fullName, g?.targetId, g?.graphType, state.depth);
                if (action.kind === 'reanalyzeTo') {
                    vscode.postMessage({ type: 'reanalyzeTo', filePath: action.filePath, line: action.line, fullName: action.fullName, graphType: action.graphType, depth: action.depth });
                } else {
                    vscode.postMessage({ type: 'nodeDoubleClick', nodeId: action.nodeId, filePath: action.filePath, line: action.line });
                }
            },
        );
    }
    return renderer;
}

// ── CONTEXT section ──────────────────────────────────────────────────────────

function renderContext(ctx: EditorContext | null): string {
    const pinLabel = ctx?.isPinned ? '# Pinned' : '# Pin';
    const pinClass = ctx?.isPinned ? 'pin-btn pinned' : 'pin-btn';
    const pinTitle = ctx?.isPinned
        ? 'Click to unpin — resume auto-tracking as you navigate'
        : 'Pin — freeze the current symbol/file so navigation does not change it';

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

    return `<details class="section ctx-section" data-section-id="context" open>
  <summary class="section-header">CONTEXT <button class="${pinClass}" id="pin-btn" title="${pinTitle}">${pinLabel}</button></summary>
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
    const hoverDetail = (t.state === 'ok' && t.detail)
        ? ` <span class="tool-detail tool-detail-hover">${esc(t.detail)}</span>`
        : detail;
    const clickable = t.state === 'warn' || t.state === 'missing';
    const icon = clickable
        ? `<button class="tool-action" data-tool="${esc(t.name)}" title="Show install instructions">${ICONS[t.state]}</button>`
        : `<span class="tool-icon">${ICONS[t.state]}</span>`;
    return `<div class="tool-row">${icon}<span class="tool-name">${esc(t.name)}</span>${hoverDetail}</div>`;
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
    return `<details class="section" data-section-id="tools"${hasIssues ? ' open' : ''}>
  <summary class="section-header">TOOLS STATUS <button class="pin-btn" id="refresh-tools-btn" title="Re-check installed tools">↻</button></summary>
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
        const isOtherBusy = s.status === 'busy' && s.activeGraphType !== gt;
        const btnLabel = isBusy ? `⏹ ${label}…` : label;
        const cls = isBusy ? 'analysis-btn analysis-btn-cancel' : 'analysis-btn';
        return `<button class="${cls}" data-graph-type="${gt}" ${isOtherBusy ? 'disabled' : ''}>${btnLabel}</button>`;
    }).join('');

    let configHtml = '';
    const setupBtn = findSetupButton(state.context?.langId);
    if (setupBtn) {
        const warning = setupBtn.getWarning?.();
        if (warning) {
            configHtml = `<div class="analysis-config"><div class="health-warning">${warning}</div></div>`;
        } else {
            configHtml = renderSetupButton(setupBtn);
        }
    }

    return `<details class="section analysis-section" data-section-id="analysis" open>
  <summary class="section-header">ANALYSIS</summary>
  <div class="section-body">
    <div class="analysis-buttons">${buttons}</div>
    ${configHtml}
  </div>
</details>`;
}

function renderAnalysisSection(): void {
    const section = document.querySelector<HTMLElement>('.analysis-section');
    if (!section) { render(); return; }
    const tmpl = document.createElement('template');
    tmpl.innerHTML = renderAnalysis(state.analysis);
    section.replaceWith(tmpl.content.firstElementChild!);
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
        const graph = state.analysis.graph;
        const norm = (s: string) => s.replace(/\\/g, '/');
        const isTarget = graph ? norm(graph.nodes.find(n => n.id === graph.targetId)?.filePath ?? '') === norm(node.fullPath) : false;
        const isSelected = state.selectedFilePath ? norm(state.selectedFilePath) === norm(node.fullPath) : false;
        const cls = ['ft-label', isTarget ? 'ft-hl-target' : '', isSelected ? 'ft-hl-selected' : ''].filter(Boolean).join(' ');
        return `<div class="ft-row" style="padding-left:${pad}px">
  <span class="ft-toggle-spacer"></span>
  <input type="checkbox" class="ft-check" data-path="${esc(node.fullPath)}" ${checked ? 'checked' : ''}>
  <span class="${cls}" data-filepath="${esc(node.fullPath)}">${esc(node.name)}</span>
</div>`;
    }
}

function renderFileFilter(graph: GraphModel): string {
    const tree = buildFileTree(graph);
    if (tree.children.length === 0) { return ''; }
    const childrenHtml = tree.children.map(c => renderTreeNode(c, 0)).join('');
    return `<details class="section ft-section" data-section-id="tree" open>
  <summary class="section-header">TREE</summary>
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
    // Drop nodes that became orphans after edge filtering (keep target always).
    const connectedIds = new Set<string>();
    connectedIds.add(graph.targetId);
    for (const e of visibleEdges) { connectedIds.add(e.sourceId); connectedIds.add(e.targetId); }
    const finalNodes = visibleNodes.filter(n => connectedIds.has(n.id));
    return { ...graph, nodes: finalNodes, edges: visibleEdges };
}

// Replace all nodes whose filePath falls under a collapsed dir with a single
// folder node. Edges are redirected; intra-folder edges are dropped.
function foldCollapsedDirs(graph: GraphModel): GraphModel {
    if (state.collapsedDirs.size === 0) { return graph; }
    const norm = (s: string) => s.replace(/\\/g, '/');

    // Map each node id → the folder id it collapses into (if any).
    const nodeToFolder = new Map<string, string>();
    for (const node of graph.nodes) {
        if (!node.filePath || node.role === 'target') { continue; }
        const fp = norm(node.filePath);
        for (const dir of state.collapsedDirs) {
            const nd = norm(dir);
            if (fp.startsWith(nd + '/') || fp === nd) {
                nodeToFolder.set(node.id, nd);
                break;
            }
        }
    }

    if (nodeToFolder.size === 0) { return graph; }

    // Build folder nodes for every dir that actually absorbed something.
    const folderIds = new Set(nodeToFolder.values());
    const folderNodes = new Map<string, GraphNode>();
    for (const dirPath of folderIds) {
        const parts = dirPath.split('/');
        const label = parts[parts.length - 1] + '/';
        folderNodes.set(dirPath, {
            id: dirPath,
            label,
            fullName: dirPath,
            filePath: dirPath,
            role: 'folder',
        });
    }

    // Keep nodes that are not collapsed.
    const keptNodes: GraphNode[] = [];
    for (const node of graph.nodes) {
        if (!nodeToFolder.has(node.id)) { keptNodes.push(node); }
    }

    // Redirect edges; drop intra-folder edges; dedup.
    const edgeSet = new Set<string>();
    const newEdges: GraphEdge[] = [];
    const resolve = (id: string) => nodeToFolder.get(id) ?? id;

    for (const edge of graph.edges) {
        const src = resolve(edge.sourceId);
        const tgt = resolve(edge.targetId);
        if (src === tgt) { continue; } // intra-folder
        const key = `${src}->${tgt}`;
        if (!edgeSet.has(key)) {
            edgeSet.add(key);
            newEdges.push({ sourceId: src, targetId: tgt, isExternal: edge.isExternal });
        }
    }

    return {
        ...graph,
        nodes: [...keptNodes, ...folderNodes.values()],
        edges: newEdges,
    };
}

// Merge A→B + B→A pairs into a single bidirectional edge.
function mergeCircularEdges(graph: GraphModel): GraphModel {
    const forward = new Set<string>();
    for (const e of graph.edges) { forward.add(`${e.sourceId}->${e.targetId}`); }

    const kept: GraphEdge[] = [];
    const seen = new Set<string>();
    for (const e of graph.edges) {
        const key  = `${e.sourceId}->${e.targetId}`;
        const back = `${e.targetId}->${e.sourceId}`;
        if (seen.has(key)) { continue; }
        if (forward.has(back)) {
            // Circular pair — emit one merged edge (sourceId < targetId for stability)
            const [a, b] = e.sourceId < e.targetId
                ? [e.sourceId, e.targetId]
                : [e.targetId, e.sourceId];
            const mergedKey = `${a}->${b}`;
            if (!seen.has(mergedKey)) {
                seen.add(mergedKey);
                kept.push({ sourceId: a, targetId: b, isBidirectional: true });
            }
            seen.add(key);
            seen.add(back);
        } else {
            seen.add(key);
            kept.push(e);
        }
    }
    return { ...graph, edges: kept };
}

// ── GRAPH section ────────────────────────────────────────────────────────────

const CONFIDENCE_BADGE: Record<string, string> = {
    high:   '🟢',
    medium: '🟡',
    low:    '🔴',
};

// ── Config-setup button table ────────────────────────────────────────────────
// Add one entry per language group. No other code needs to change.

interface ConfigButtonDef {
    langIds: readonly string[];
    label: string;
    command: string;
    getDetail: () => string | undefined;
    getWarning?: () => string | undefined;
}

const SETUP_BUTTONS: ConfigButtonDef[] = [
    {
        langIds: ['c', 'cpp', 'cuda-cpp', 'objective-c', 'objective-cpp'],
        label: 'Setup compile_commands.json',
        command: 'an-dr-code-analysis.selectCompileCommands',
        getDetail: () => state.configPaths.compileCommandsPath,
        getWarning: () => {
            const h = state.clangdHealth;
            if (!h?.issue) { return undefined; }
            const icon = h.issue === 'STALE_COMPILE_COMMANDS' ? '⚠' : '✗';
            return `<span class="health-icon">${icon}</span> ${esc(h.message)}`;
        },
    },
    {
        langIds: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
        label: 'Setup tsconfig.json',
        command: 'an-dr-code-analysis.selectTsconfig',
        getDetail: () => state.configPaths.tsconfigPath,
    },
];

function findSetupButton(langId: string | undefined): ConfigButtonDef | undefined {
    return SETUP_BUTTONS.find(b => b.langIds.includes(langId ?? ''));
}

function renderSetupButton(def: ConfigButtonDef): string {
    const detail = def.getDetail();
    const indicator = detail ? `<span class="cc-indicator" title="${esc(detail)}">●</span>` : '';
    const pathEl   = detail ? `<div class="cc-path">${esc(detail)}</div>` : '';
    return `<div class="analysis-config"><button class="analysis-btn" data-command="${def.command}">${indicator}${def.label}</button>${pathEl}</div>`;
}

function renderGraph(s: AnalysisState, depth: number): string {
    const graphTitle = s.activeGraphType ? ` — ${GRAPH_TYPE_LABELS[s.activeGraphType]}` : '';
    // Show which tool produced the result directly in the header
    const toolBadge = (s.status === 'result' && s.graph)
        ? ` <span class="header-tool-badge">${CONFIDENCE_BADGE[s.graph.confidence] ?? ''} ${esc(s.graph.tool)}</span>`
        : '';

    let overlayHtml = '';
    let metaHtml = '';

    if (s.status === 'idle') {
        overlayHtml = `<div class="graph-overlay">Select an analysis above.</div>`;
    } else if (s.status === 'busy') {
        const detail = s.busyMessage ? `<div class="graph-overlay-detail">${esc(s.busyMessage)}</div>` : '';
        overlayHtml = `<div class="graph-overlay">Analyzing…${detail}</div>`;
    } else if (s.status === 'error') {
        const label = s.activeGraphType ? GRAPH_TYPE_LABELS[s.activeGraphType] : '';
        overlayHtml = `<div class="graph-overlay graph-overlay-error">${label ? `<strong>${esc(label)}:</strong> ` : ''}${esc(s.errorMessage ?? 'Unknown error')}</div>`;
    } else if (s.status === 'result' && s.graph) {
        const fallbackNote = s.graph.tool === 'ctags'
            ? `<div class="graph-fallback-note">Fallback tool — callers only, no callees</div>`
            : '';
        const targetNode = s.graph.nodes.find(n => n.id === s.graph!.targetId);
        const originBtn = (targetNode?.filePath)
            ? `<button class="depth-btn" id="go-to-origin" title="${esc(targetNode.filePath)}">⌖ origin</button>`
            : '';
        const mergeChk = `<label class="graph-meta-check" title="Show circular dependencies as a single double-headed red arrow">
            <input type="checkbox" id="merge-circular-chk" ${state.mergeCircular ? 'checked' : ''}> circular
          </label>`;
        metaHtml = `<div class="graph-meta">
            <span class="graph-node-count">${s.graph.nodes.length} nodes, ${s.graph.edges.length} edges</span>
            ${originBtn}
            ${mergeChk}
          </div>${fallbackNote}`;
    } else {
        overlayHtml = `<div class="graph-overlay">No results found.</div>`;
    }

    const bodyHtml = `<div class="graph-area" id="cy-container">${overlayHtml}</div>${metaHtml}`;

    const depthControls = `<div class="depth-controls">
      <button class="depth-btn" id="depth-minus" ${depth <= 1 ? 'disabled' : ''}>−</button>
      <span class="depth-label">Depth: ${depth}</span>
      <button class="depth-btn" id="depth-plus" ${depth >= 8 ? 'disabled' : ''}>+</button>
      <button class="depth-btn" id="depth-reset">reset</button>
    </div>`;

    const layoutBtns = (['force', 'radial', 'hierarchical', 'rose'] as LayoutName[])
        .map(n => {
            const [label, hint] = LAYOUT_META[n];
            return `<button class="depth-btn${state.layout === n ? ' active' : ''}" data-layout="${n}" title="${hint}">${label}</button>`;
        })
        .join('');
    const layoutControls = `<div class="layout-controls">${layoutBtns}</div>`;

    const expandBtn = (!IS_FULL_TAB && s.status === 'result')
        ? `<button class="pin-btn" id="expand-to-tab-btn" title="Open in full editor tab">↗</button>`
        : '';

    return `<details class="section" data-section-id="graph" open>
  <summary class="section-header">GRAPH${esc(graphTitle)}${toolBadge}${expandBtn}</summary>
  <div class="section-body">
    ${bodyHtml}
    ${depthControls}
    ${layoutControls}
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

    if (state.tools === null && !IS_FULL_TAB) {
        root.innerHTML = '<div class="loading">Loading…</div>';
        return;
    }

    let html = '';
    if (!IS_FULL_TAB) {
        html += renderContext(state.context);
        html += renderAnalysis(state.analysis);
    }
    html += renderGraph(state.analysis, state.depth);
    if (state.analysis.status === 'result' && state.analysis.graph) {
        html += renderFileFilter(state.analysis.graph);
    }
    if (!IS_FULL_TAB && state.tools !== null) {
        html += renderToolsStatus(state.tools);
    }
    root.innerHTML = html;
    applyFoldState();

    // mount cytoscape into the freshly created #cy-container
    if (state.analysis.status === 'result' && state.analysis.graph) {
        let g = foldCollapsedDirs(applyFilter(state.analysis.graph));
        if (state.mergeCircular) { g = mergeCircularEdges(g); }
        const r = getOrCreateRenderer();
        r.update(g);
        if (state.layout) { r.applyLayout(state.layout); }
    }
}

// Updates only the CONTEXT section in-place — cursor moves should not touch the graph.
function renderContextOnly(): void {
    const section = document.querySelector<HTMLDetailsElement>('.ctx-section');
    if (!section) { render(); return; }
    const wasOpen = section.open;
    const next = document.createElement('template');
    next.innerHTML = renderContext(state.context);
    const el = next.content.firstElementChild as HTMLDetailsElement;
    el.open = wasOpen;
    section.replaceWith(el);
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
    let filtered = foldCollapsedDirs(applyFilter(state.analysis.graph));
    if (state.mergeCircular) { filtered = mergeCircularEdges(filtered); }
    const container = document.getElementById('cy-container');
    if (!container) { render(); return; }
    getOrCreateRenderer().update(filtered);
}

render();

// Persist section fold state via event delegation — fired whenever any <details> toggles.
root.addEventListener('toggle', (e: Event) => {
    const el = e.target as HTMLDetailsElement;
    if (el.dataset['sectionId']) { saveFoldState(el.dataset['sectionId']!, el.open); }
}, true);

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

    if (target.id === 'refresh-tools-btn') {
        vscode.postMessage({ type: 'refreshTools' });
        return;
    }

    if (target.id === 'expand-to-tab-btn') {
        if (state.analysis.graph) {
            vscode.postMessage({ type: 'expandToTab', graph: state.analysis.graph, depth: state.depth });
        }
        return;
    }

    const toolBtn = target.closest<HTMLButtonElement>('.tool-action');
    if (toolBtn) {
        vscode.postMessage({ type: 'showToolHelp', toolName: toolBtn.dataset['tool'] });
        return;
    }

    const configBtn = target.closest<HTMLButtonElement>('.analysis-btn[data-command]');
    if (configBtn?.dataset['command']) {
        vscode.postMessage({ type: 'runCommand', command: configBtn.dataset['command'] });
        return;
    }

    const analysisBtn = target.closest<HTMLButtonElement>('.analysis-btn[data-graph-type]');
    if (analysisBtn && !analysisBtn.disabled) {
        const gt = analysisBtn.dataset['graphType'] as GraphType;
        if (state.analysis.status === 'busy' && state.analysis.activeGraphType === gt) {
            // Second click on the active busy button — cancel
            vscode.postMessage({ type: 'cancelAnalysis' });
        } else {
            state.analysis = { status: 'busy', activeGraphType: gt, busyMessage: undefined };
            render();
            vscode.postMessage({ type: 'requestAnalysis', graphType: gt, depth: state.depth });
        }
        return;
    }

    const layoutBtn = target.closest<HTMLButtonElement>('[data-layout]');
    if (layoutBtn) {
        const name = layoutBtn.dataset['layout'] as LayoutName;
        state.layout = name;
        renderer?.applyLayout(name);
        document.querySelectorAll<HTMLButtonElement>('[data-layout]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset['layout'] === name);
        });
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
        state.depth = 1;
        render();
        triggerDepthChange();
        return;
    }

    if (target.id === 'go-to-origin') {
        const graph = state.analysis.graph;
        if (graph && renderer) { renderer.selectNode(graph.targetId); }
        return;
    }

    // Tree file label: single click selects in tree + highlights related nodes in graph
    const fileLabel = target.closest<HTMLElement>('[data-filepath]');
    if (fileLabel && !fileLabel.classList.contains('ft-dir')) {
        const fp = fileLabel.dataset['filepath']!;
        state.selectedFilePath = fp;
        rebuildFilterBody();
        renderer?.selectNodesForFile(fp);
        return;
    }

    // File filter tree: collapse/expand toggle — rebuild filter UI and re-render graph
    const toggle = target.closest<HTMLElement>('.ft-toggle');
    if (toggle) {
        const dir = toggle.dataset['dir']!;
        if (state.collapsedDirs.has(dir)) { state.collapsedDirs.delete(dir); } else { state.collapsedDirs.add(dir); }
        rebuildFilterBody();
        renderGraphOnly();
        return;
    }
    const dirLabel = target.closest<HTMLElement>('.ft-dir');
    if (dirLabel) {
        const dir = dirLabel.dataset['dir']!;
        if (state.collapsedDirs.has(dir)) { state.collapsedDirs.delete(dir); } else { state.collapsedDirs.add(dir); }
        rebuildFilterBody();
        renderGraphOnly();
        return;
    }
});

// Tree file label double-click: open the file in the editor
root.addEventListener('dblclick', (e: MouseEvent) => {
    const fileLabel = (e.target as Element).closest<HTMLElement>('[data-filepath]');
    if (fileLabel && !fileLabel.classList.contains('ft-dir')) {
        const fp = fileLabel.dataset['filepath']!;
        vscode.postMessage({ type: 'nodeDoubleClick', nodeId: fp, filePath: fp });
    }
});

// File filter checkboxes — use 'change' so the checkbox value is correct
root.addEventListener('change', (e: Event) => {
    const target = e.target as HTMLElement;

    if ((target as HTMLInputElement).id === 'merge-circular-chk') {
        state.mergeCircular = (target as HTMLInputElement).checked;
        renderGraphOnly();
        return;
    }

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
            render();
            break;
        case 'contextUpdate':
            state.context = msg.context;
            renderContextOnly();
            break;
        case 'clangdHealth':
            state.clangdHealth = { issue: msg.issue, message: msg.message };
            renderAnalysisSection();
            break;
        case 'configPaths':
            state.configPaths = { compileCommandsPath: msg.compileCommandsPath, tsconfigPath: msg.tsconfigPath };
            renderAnalysisSection();
            break;
        case 'analysisBusy':
            state.analysis = { status: 'busy', activeGraphType: msg.graphType, busyMessage: msg.message };
            render();
            break;
        case 'analysisResult': {
            const prevGraphType = state.analysis.activeGraphType;
            state.analysis = { status: 'result', graph: msg.graph, activeGraphType: msg.graph.graphType };
            state.depth = msg.graph.depth;
            state.uncheckedPaths = new Set();
            state.collapsedDirs = new Set();
            state.selectedFilePath = null;
            // If the graph type is the same and the container is already in the DOM,
            // patch the graph in-place (preserves viewport/positions) rather than full render.
            const container = document.getElementById('cy-container');
            if (container && prevGraphType === msg.graph.graphType && renderer) {
                // Update meta row and analysis buttons in-place
                renderAnalysisSection();
                // Patch graph section header (tool badge, node count) without destroying cy
                const graphSection = document.querySelector<HTMLElement>('[data-section-id="graph"]');
                if (graphSection) {
                    const tmpl = document.createElement('template');
                    tmpl.innerHTML = renderGraph(state.analysis, state.depth);
                    const newSection = tmpl.content.firstElementChild as HTMLElement;
                    // Preserve open state
                    if (graphSection instanceof HTMLDetailsElement) {
                        (newSection as HTMLDetailsElement).open = graphSection.open;
                    }
                    // Swap only the meta row content — keep #cy-container intact
                    const oldMeta = graphSection.querySelector('.graph-meta');
                    const newMeta = newSection.querySelector('.graph-meta');
                    if (oldMeta && newMeta) { oldMeta.replaceWith(newMeta); }
                    const oldFallback = graphSection.querySelector('.graph-fallback-note');
                    const newFallback = newSection.querySelector('.graph-fallback-note');
                    if (newFallback) {
                        if (oldFallback) { oldFallback.replaceWith(newFallback); }
                        else { graphSection.querySelector('.graph-area')?.after(newFallback); }
                    } else { oldFallback?.remove(); }
                    // Update header badge
                    const oldHeader = graphSection.querySelector('.section-header');
                    const newHeader = newSection.querySelector('.section-header');
                    if (oldHeader && newHeader) { oldHeader.innerHTML = newHeader.innerHTML; }
                }
                // Rebuild file tree
                if (state.analysis.graph) {
                    const ftSection = document.querySelector('[data-section-id="tree"]');
                    const tmpl2 = document.createElement('template');
                    tmpl2.innerHTML = renderFileFilter(state.analysis.graph);
                    if (ftSection) { ftSection.replaceWith(tmpl2.content.firstElementChild!); }
                    else { document.querySelector('[data-section-id="graph"]')?.after(tmpl2.content.firstElementChild!); }
                }
                let g = foldCollapsedDirs(applyFilter(msg.graph));
                if (state.mergeCircular) { g = mergeCircularEdges(g); }
                renderer.update(g);
            } else {
                render();
            }
            break;
        }
        case 'analysisCancelled':
            state.analysis = { status: 'idle' };
            render();
            break;
        case 'analysisError':
            state.analysis = { status: 'error', errorMessage: msg.message, recoveryActions: msg.recoveryActions, activeGraphType: msg.graphType };
            render();
            break;
    }
});

vscode.postMessage({ type: 'ready' });
