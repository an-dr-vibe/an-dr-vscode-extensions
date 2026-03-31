import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawnSync } from 'child_process';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Entry { id: string; label: string; visible: boolean; }
interface StoredEntry { id: string; visible: boolean; }

// Shape of one item in VS Code's internal Activity Bar state array.
interface DbViewlet { id: string; pinned: boolean; visible: boolean; order?: number; }

// ── Constants ─────────────────────────────────────────────────────────────────

const CFG = 'uiControl';

// The key in VS Code's state.vscdb that controls Activity Bar visibility + order.
// pinned:true  → icon shown in Activity Bar
// pinned:false → icon hidden from Activity Bar
const DB_KEY = 'workbench.activity.pinnedViewlets2';

// Well-known built-in view containers (not contributed by extension packages).
const BUILTINS: Omit<Entry, 'visible'>[] = [
    { id: 'workbench.view.explorer',   label: 'Explorer'        },
    { id: 'workbench.view.search',     label: 'Search'          },
    { id: 'workbench.view.scm',        label: 'Source Control'  },
    { id: 'workbench.view.debug',      label: 'Run and Debug'   },
    { id: 'workbench.view.extensions', label: 'Extensions'      },
    { id: 'workbench.view.testing',    label: 'Testing'         },
    { id: 'workbench.view.remote',     label: 'Remote Explorer' },
];

// ── Discovery ─────────────────────────────────────────────────────────────────

function discoverExtensionContainers(): Entry[] {
    const result: Entry[] = [];
    for (const ext of vscode.extensions.all) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const containers: any[] =
            ext.packageJSON?.contributes?.viewsContainers?.activitybar ?? [];
        for (const c of containers) {
            if (typeof c?.id !== 'string') { continue; }
            result.push({ id: c.id, label: typeof c.title === 'string' ? c.title : c.id, visible: true });
        }
    }
    return result;
}

function discoverAll(): Entry[] {
    const ext = discoverExtensionContainers();
    const extIds = new Set(ext.map(e => e.id));
    const builtins = BUILTINS.filter(b => !extIds.has(b.id)).map(b => ({ ...b, visible: true }));
    return [...builtins, ...ext];
}

// ── Config (settings.json) ────────────────────────────────────────────────────

function readStored(): StoredEntry[] {
    return vscode.workspace.getConfiguration(CFG).get<StoredEntry[]>('activityBar', []);
}

async function writeStored(entries: Entry[]): Promise<void> {
    await vscode.workspace.getConfiguration(CFG)
        .update('activityBar', entries.map(({ id, visible }) => ({ id, visible })), vscode.ConfigurationTarget.Global);
}

function merge(stored: StoredEntry[], discovered: Entry[]): { entries: Entry[]; newCount: number } {
    const labelMap = new Map(discovered.map(d => [d.id, d.label]));
    const storedIds = new Set(stored.map(s => s.id));
    const entries: Entry[] = stored.map(s => ({ id: s.id, label: labelMap.get(s.id) ?? s.id, visible: s.visible }));
    let newCount = 0;
    for (const d of discovered) {
        if (!storedIds.has(d.id)) {
            entries.push({ id: d.id, label: d.label, visible: true });
            newCount++;
        }
    }
    return { entries, newCount };
}

// ── Database (VS Code's state.vscdb) ─────────────────────────────────────────
//
// VS Code stores Activity Bar visibility in state.vscdb (SQLite).
// Key: workbench.activity.pinnedViewlets2
// Each item: { id, pinned: bool, visible: bool, order?: number }
//   pinned:true  → icon shown in Activity Bar
//   pinned:false → icon hidden from Activity Bar
//
// We use Python's built-in sqlite3 to read/write this database, since
// native Node.js SQLite modules require compilation that may not be
// available on all machines/architectures.

let dbPath = '';

function initDbPath(context: vscode.ExtensionContext): void {
    // Extension's globalStorage is inside .../globalStorage/<publisher.name>/
    // state.vscdb sits one directory above it.
    dbPath = path.join(path.dirname(context.globalStorageUri.fsPath), 'state.vscdb');
}

const PY_READ = `
import os, sqlite3
conn = sqlite3.connect(os.environ['DB'])
row = conn.execute("SELECT value FROM ItemTable WHERE key=?", [os.environ['KEY']]).fetchone()
print(row[0] if row else '', end='')
conn.close()
`.trim();

const PY_WRITE = `
import os, sqlite3
conn = sqlite3.connect(os.environ['DB'])
conn.execute("INSERT OR REPLACE INTO ItemTable (key,value) VALUES (?,?)", [os.environ['KEY'], os.environ['VAL']])
conn.commit()
conn.close()
`.trim();

function findPython(): string {
    const custom = vscode.workspace.getConfiguration(CFG).get<string>('pythonPath', '').trim();
    if (custom) { return custom; }
    // On Windows the Store Python registers 'python' but not always 'python3'
    for (const candidate of ['python3', 'python']) {
        const r = spawnSync(candidate, ['--version'], { encoding: 'utf8', timeout: 3000 });
        if (r.status === 0) { return candidate; }
    }
    return 'python3'; // best-effort fallback
}

function pyExec(script: string, env: Record<string, string>): { ok: boolean; stdout: string; err: string } {
    const python = findPython();
    const r = spawnSync(python, ['-c', script], {
        env: { ...process.env, ...env },
        encoding: 'utf8',
        timeout: 10_000,
    });
    return { ok: r.status === 0, stdout: r.stdout ?? '', err: r.stderr ?? (r.error?.message ?? '') };
}

function readDbViewlets(): DbViewlet[] | undefined {
    if (!fs.existsSync(dbPath)) { return undefined; }
    const r = pyExec(PY_READ, { DB: dbPath, KEY: DB_KEY });
    if (!r.ok || !r.stdout) { return undefined; }
    try { return JSON.parse(r.stdout) as DbViewlet[]; } catch { return undefined; }
}

/**
 * Merge our Entry[] config into the DB viewlets array and write it back.
 * - entry.visible=true  → pinned:true  (icon shown in Activity Bar)
 * - entry.visible=false → pinned:false (icon hidden)
 * - position in our array → DB order field
 */
function writeToDb(entries: Entry[], out: vscode.OutputChannel): boolean {
    if (!fs.existsSync(dbPath)) {
        out.appendLine(`[db] state.vscdb not found: ${dbPath}`);
        return false;
    }

    // Read current DB state
    const readResult = pyExec(PY_READ, { DB: dbPath, KEY: DB_KEY });
    if (!readResult.ok) {
        out.appendLine(`[db] read failed: ${readResult.err}`);
        return false;
    }

    const dbViewlets: DbViewlet[] = readResult.stdout
        ? (() => { try { return JSON.parse(readResult.stdout) as DbViewlet[]; } catch { return []; } })()
        : [];

    const dbMap = new Map(dbViewlets.map(v => [v.id, v]));

    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const dv = dbMap.get(e.id);
        if (dv) {
            dv.pinned = e.visible;
            dv.order  = i;
        } else {
            dbViewlets.push({ id: e.id, pinned: e.visible, visible: false, order: i });
            dbMap.set(e.id, dbViewlets[dbViewlets.length - 1]);
        }
    }

    const json = JSON.stringify(dbViewlets);
    const writeResult = pyExec(PY_WRITE, { DB: dbPath, KEY: DB_KEY, VAL: json });
    if (!writeResult.ok) {
        out.appendLine(`[db] write failed: ${writeResult.err}`);
        return false;
    }

    out.appendLine(`[db] wrote ${dbViewlets.length} viewlets to ${DB_KEY}`);
    return true;
}

/**
 * Check whether the DB state already matches our config.
 * Used on startup to avoid a spurious reload prompt when nothing changed.
 */
function dbMatchesConfig(entries: Entry[]): boolean {
    const dbViewlets = readDbViewlets();
    if (!dbViewlets) { return true; } // can't read → assume ok, don't disturb

    const dbMap = new Map(dbViewlets.map(v => [v.id, v]));
    for (const e of entries) {
        const dv = dbMap.get(e.id);
        if (!dv) {
            if (!e.visible) { return false; } // hidden item missing from DB
            continue;
        }
        if (dv.pinned !== e.visible) { return false; }
    }
    return true;
}

// ── Webview ───────────────────────────────────────────────────────────────────

let panel: vscode.WebviewPanel | undefined;
let out: vscode.OutputChannel;

function openConfigure(context: vscode.ExtensionContext, entries: Entry[]): void {
    if (panel) { panel.reveal(); panel.webview.postMessage({ type: 'update', entries }); return; }

    panel = vscode.window.createWebviewPanel(
        'an-dr-ui-control',
        'UI Control: Activity Bar',
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.onDidDispose(() => { panel = undefined; }, null, context.subscriptions);
    panel.webview.html = buildWebview(entries);

    panel.webview.onDidReceiveMessage(
        async (msg: { type: string; entries?: Entry[] }) => {
            if (msg.type === 'save' && msg.entries) {
                await writeStored(msg.entries);
                const ok = writeToDb(msg.entries, out);
                if (ok) {
                    promptReload('UI Control: Layout saved.');
                } else {
                    vscode.window.showWarningMessage(
                        'UI Control: Settings saved, but could not write to VS Code state (better-sqlite3 unavailable). Changes will apply after a manual restart.',
                        'Show Log',
                    ).then(c => { if (c === 'Show Log') { out.show(); } });
                }
            } else if (msg.type === 'scan') {
                const discovered = discoverAll();
                const stored = readStored();
                const { entries: merged, newCount } = merge(stored, discovered);
                if (newCount > 0) { await writeStored(merged); }
                panel?.webview.postMessage({ type: 'update', entries: merged });
            }
        },
        undefined,
        context.subscriptions,
    );
}

function promptReload(msg: string): void {
    vscode.window.showInformationMessage(msg + ' Reload window to apply.', 'Reload Now', 'Later')
        .then(c => { if (c === 'Reload Now') { vscode.commands.executeCommand('workbench.action.reloadWindow'); } });
}

function buildWebview(entries: Entry[]): string {
    const data = JSON.stringify(entries);
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>UI Control</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px 24px; margin: 0; }
    h1 { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 4px; }
    .subtitle { font-size: 12px; color: var(--vscode-descriptionForeground); margin: 0 0 20px; line-height: 1.5; }
    .list { list-style: none; margin: 0; padding: 0; max-width: 520px; }
    .item { display: flex; align-items: center; gap: 8px; padding: 5px 8px; margin-bottom: 2px; border-radius: 3px; background: var(--vscode-list-inactiveSelectionBackground); user-select: none; }
    .item.dim { opacity: 0.55; }
    .item.drag-over { outline: 1px solid var(--vscode-focusBorder); }
    .item.dragging  { opacity: 0.25; }
    .handle { color: var(--vscode-descriptionForeground); cursor: grab; font-size: 14px; line-height: 1; flex-shrink: 0; width: 16px; text-align: center; }
    .handle:active { cursor: grabbing; }
    .toggle { background: none; border: none; cursor: pointer; padding: 0; font-size: 14px; line-height: 1; flex-shrink: 0; width: 18px; text-align: center; }
    .toggle.on  { color: var(--vscode-foreground); }
    .toggle.off { color: var(--vscode-disabledForeground); }
    .info { flex: 1; min-width: 0; }
    .lbl { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .id  { font-size: 11px; color: var(--vscode-descriptionForeground); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .actions { margin-top: 16px; display: flex; gap: 8px; max-width: 520px; }
    .btn { padding: 5px 14px; font-size: 12px; font-family: inherit; border: none; border-radius: 2px; cursor: pointer; }
    .primary   { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .primary:hover   { background: var(--vscode-button-hoverBackground); }
    .secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  </style>
</head>
<body>
  <h1>Activity Bar Layout</h1>
  <p class="subtitle">
    Drag ⠿ to reorder &nbsp;·&nbsp; Click ● / ○ to toggle visibility<br>
    Saved to <code>settings.json</code> (syncs via Settings Sync) and written directly to VS Code's state.
    A window reload is required to apply changes.
  </p>
  <ul class="list" id="list"></ul>
  <div class="actions">
    <button class="btn primary"   onclick="save()">Save &amp; Apply</button>
    <button class="btn secondary" onclick="scan()">Scan for New Extensions</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    let items = ${data};
    let dragIdx = null;
    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function render() {
      const list = document.getElementById('list');
      list.innerHTML = '';
      items.forEach((item, i) => {
        const li = document.createElement('li');
        li.className = 'item' + (item.visible ? '' : ' dim');
        li.draggable = true;
        const handle = document.createElement('span');
        handle.className = 'handle'; handle.title = 'Drag to reorder'; handle.textContent = '⠿';
        const tog = document.createElement('button');
        tog.className = 'toggle ' + (item.visible ? 'on' : 'off');
        tog.title = item.visible ? 'Visible — click to hide' : 'Hidden — click to show';
        tog.textContent = item.visible ? '●' : '○';
        tog.onclick = () => { items[i].visible = !items[i].visible; render(); };
        const info = document.createElement('div');
        info.className = 'info';
        info.innerHTML = '<div class="lbl">' + esc(item.label) + '</div><div class="id">' + esc(item.id) + '</div>';
        li.append(handle, tog, info);
        li.addEventListener('dragstart', e => { dragIdx = i; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
        li.addEventListener('dragend', () => { dragIdx = null; document.querySelectorAll('.drag-over,.dragging').forEach(el => el.classList.remove('drag-over','dragging')); });
        li.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over')); li.classList.add('drag-over'); });
        li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
        li.addEventListener('drop', e => { e.preventDefault(); li.classList.remove('drag-over'); if (dragIdx === null || dragIdx === i) { return; } const moved = items.splice(dragIdx,1)[0]; items.splice(i,0,moved); render(); });
        list.appendChild(li);
      });
    }
    function save() { vscode.postMessage({ type: 'save', entries: items }); }
    function scan() { vscode.postMessage({ type: 'scan' }); }
    window.addEventListener('message', e => { if (e.data.type === 'update') { items = e.data.entries; render(); } });
    render();
  </script>
</body>
</html>`;
}

// ── Activate ──────────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
    initDbPath(context);
    const cfg = () => vscode.workspace.getConfiguration(CFG);

    out = vscode.window.createOutputChannel('an-dr: UI Control');
    context.subscriptions.push(out);

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
    statusBar.name    = 'an-dr: UI Control';
    statusBar.command = 'an-dr-ui-control.configure';
    context.subscriptions.push(statusBar);

    function refreshStatusBar(): void {
        const iconOnly = cfg().get<boolean>('statusBarIconOnly', true);
        statusBar.text    = iconOnly ? '$(layout-activitybar-left)' : '$(layout-activitybar-left) UI';
        statusBar.tooltip = 'an-dr: UI Control — Configure Activity Bar layout';
        statusBar.show();
    }

    async function scanAndMerge(): Promise<Entry[]> {
        const discovered = discoverAll();
        const stored     = readStored();
        const { entries, newCount } = merge(stored, discovered);
        if (newCount > 0 || stored.length === 0) { await writeStored(entries); }
        return entries;
    }

    // ── Commands ──────────────────────────────────────────────────────────────

    context.subscriptions.push(

        vscode.commands.registerCommand('an-dr-ui-control.configure', async () => {
            openConfigure(context, await scanAndMerge());
        }),

        vscode.commands.registerCommand('an-dr-ui-control.applyLayout', async () => {
            const entries = await scanAndMerge();
            out.appendLine('[apply] writing to DB...');
            const ok = writeToDb(entries, out);
            if (ok) {
                promptReload('UI Control: Layout applied.');
            } else {
                vscode.window.showWarningMessage(
                    'UI Control: Could not write to VS Code state (better-sqlite3 unavailable).',
                    'Show Log',
                ).then(c => { if (c === 'Show Log') { out.show(); } });
            }
        }),

        vscode.commands.registerCommand('an-dr-ui-control.scanExtensions', async () => {
            const before = readStored().length;
            const entries = await scanAndMerge();
            if (panel) { panel.webview.postMessage({ type: 'update', entries }); }
            const added = entries.length - before;
            vscode.window.showInformationMessage(
                added > 0 ? `UI Control: ${added} new container(s) added.` : 'UI Control: No new containers found.',
            );
        }),

    );

    // ── Config change ─────────────────────────────────────────────────────────

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(CFG + '.statusBarIconOnly')) { refreshStatusBar(); }
        }),
    );

    // ── Startup ───────────────────────────────────────────────────────────────

    refreshStatusBar();

    if (cfg().get<boolean>('applyOnStartup', true)) {
        // Run async, never block activation
        (async () => {
            const entries = await scanAndMerge();
            if (dbMatchesConfig(entries)) {
                out.appendLine('[startup] DB already matches config — nothing to do');
                return;
            }
            out.appendLine('[startup] DB differs from config — writing...');
            const ok = writeToDb(entries, out);
            if (ok) {
                promptReload('UI Control: Activity Bar layout updated.');
            }
        })().catch(() => { /* startup must never throw */ });
    }
}

export function deactivate(): void {}
