import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { addExtensionsToProfile, allCategories, collectExtensions, computeUserDataRoot, CustomGroups, extensionsInstallRoot, groupExtensions, GroupByMode, ProfileDescriptor, readCustomProfiles, SYSTEM_CATEGORY } from './extensionsData';
import { renderGridHtml } from './gridHtml';
import { collectStartupTimings, StartupTiming } from './startupTiming';

const HIDDEN_CATEGORIES_KEY = 'anDrExtensions.hiddenCategories';
const GROUP_BY_KEY = 'anDrExtensions.groupBy';
const CUSTOM_GROUPS_SECTION = 'an-dr-extensions';
const CUSTOM_GROUPS_KEY = 'customGroups';

// Switching profiles restarts the extension host in place (ADR-006) - our own process is
// torn down mid-`switchProfile()`, so nothing after that command's `await` in the OLD host
// ever runs. context.globalState can't carry a signal across the switch either: it's always
// StorageScope.PROFILE, even for application-scoped extensions (confirmed against VS Code's
// own extensionStorage.ts), so a value written in the old profile is invisible in the new
// one. A plain OS-temp-dir marker file, written just before triggering the switch and read
// on the next activate(), sidesteps VS Code's profile-scoped storage entirely. See ADR-006.
const PROFILE_SWITCH_MARKER = path.join(os.tmpdir(), 'an-dr-extensions-pending-profile-switch');

class GridState {
    public readonly installRoot: vscode.Uri;
    // Same default-icon glyph VS Code's own extensions view uses for extensions with no
    // icon (Codicon.extensionsLarge, registered as 'extension-default-icon' in
    // extensionsIcons.ts) - shipped via the @vscode/codicons package rather than an
    // approximated SVG, so it's genuinely the same icon, not just similar-looking.
    public readonly codiconsCssUri: vscode.Uri;
    // Lowercased ids of extensions uninstalled this session: VS Code keeps them in
    // vscode.extensions.all until the window reloads, so the grid marks them instead.
    public readonly pendingUninstalls = new Set<string>();
    // Undefined if the "walk up looking for a User directory" heuristic (see
    // computeUserDataRoot) doesn't find one - "Add to Profile" degrades to reporting an
    // error instead of guessing at a path. See ADR-010.
    public readonly userDataRoot: vscode.Uri | undefined;
    private startupTimings: Map<string, StartupTiming> | undefined;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.installRoot = extensionsInstallRoot(context);
        this.codiconsCssUri = vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css');
        this.userDataRoot = computeUserDataRoot(context.globalStorageUri);
    }

    // Re-read on every request rather than cached: the profile list rarely changes, but the
    // cost of reading a small JSON file on a right-click is negligible either way.
    public customProfiles(): ProfileDescriptor[] {
        return this.userDataRoot ? readCustomProfiles(this.userDataRoot) : [];
    }

    public cachedStartupTimings(): Map<string, StartupTiming> | undefined {
        return this.startupTimings;
    }

    // Fetching opens and closes an editor tab, so it only happens when the user explicitly
    // asks for it (the "Measure Startup" button), never as a side effect of switching the
    // Group by selector. Each call re-measures, since more extensions may have activated
    // lazily (onCommand, onLanguage, etc.) since the last measurement. A failed capture
    // (undefined) keeps the previous measurement instead of degrading to "Not measured".
    public async measureStartupTimings(): Promise<void> {
        const timings = await collectStartupTimings();
        if (timings) {
            this.startupTimings = timings;
        }
    }

    public hiddenCategories(): Set<string> {
        return new Set(this.context.globalState.get<string[]>(HIDDEN_CATEGORIES_KEY, [SYSTEM_CATEGORY]));
    }

    public setCategoryHidden(category: string, hidden: boolean): void {
        const state = this.hiddenCategories();
        if (hidden) {
            state.add(category);
        } else {
            state.delete(category);
        }
        void this.context.globalState.update(HIDDEN_CATEGORIES_KEY, Array.from(state));
    }

    public showAllCategories(): void {
        void this.context.globalState.update(HIDDEN_CATEGORIES_KEY, []);
    }

    public groupBy(): GroupByMode {
        return this.context.globalState.get<GroupByMode>(GROUP_BY_KEY, 'category');
    }

    public setGroupBy(mode: GroupByMode): void {
        void this.context.globalState.update(GROUP_BY_KEY, mode);
    }

    // Group membership is curated content the user builds up, unlike the local-only view
    // state above, so it goes in settings.json (synced) rather than globalState. See ADR-003.
    public customGroups(): CustomGroups {
        return vscode.workspace.getConfiguration(CUSTOM_GROUPS_SECTION).get<CustomGroups>(CUSTOM_GROUPS_KEY, {});
    }

    // Each extension belongs to at most one custom group - "Add to group" is really "move
    // to group". A null group means "remove from whichever group it's currently in" (the
    // grid's "Remove from group" item). Writes settings.json once for the whole batch
    // rather than once per id, so a multi-item move only fires a single
    // onDidChangeConfiguration event (and therefore a single re-render).
    public async moveToGroup(group: string | null, ids: string[]): Promise<void> {
        const groups = this.customGroups();
        const lowerIds = new Set(ids.map((id) => id.toLowerCase()));
        const updated: CustomGroups = {};
        for (const [name, members] of Object.entries(groups)) {
            const remaining = members.filter((member) => !lowerIds.has(member.toLowerCase()));
            if (remaining.length > 0) {
                updated[name] = remaining;
            }
        }
        if (group !== null) {
            const target = new Set((updated[group] ?? []).map((member) => member.toLowerCase()));
            ids.forEach((id) => target.add(id.toLowerCase()));
            updated[group] = Array.from(target);
        }
        await vscode.workspace.getConfiguration(CUSTOM_GROUPS_SECTION)
            .update(CUSTOM_GROUPS_KEY, updated, vscode.ConfigurationTarget.Global);
    }
}

type GridMessage =
    | { type: 'openExtension'; id: string }
    | { type: 'setCategoryHidden'; category: string; hidden: boolean }
    | { type: 'showAllCategories' }
    | { type: 'setGroupBy'; groupBy: GroupByMode }
    | { type: 'uninstallExtension'; id: string }
    | { type: 'copyExtensionId'; id: string }
    | { type: 'measureStartup' }
    | { type: 'moveToGroup'; group: string | null; ids: string[] }
    | { type: 'switchProfile' }
    | { type: 'toggleApplyToAllProfiles'; id: string }
    | { type: 'bulkUninstallExtensions'; ids: string[] }
    | { type: 'bulkApplyToAllProfiles'; ids: string[] }
    | { type: 'bulkCopyExtensionId'; ids: string[] }
    | { type: 'addToProfile'; profileLocation: string; ids: string[] };

function renderGrid(webview: vscode.Webview, state: GridState): void {
    const groupBy = state.groupBy();
    const extensions = collectExtensions(state.installRoot);
    const timings = state.cachedStartupTimings();
    const customGroups = state.customGroups();
    const groups = groupExtensions(extensions, groupBy, timings, customGroups);
    webview.html = renderGridHtml(webview, groups, allCategories(extensions), state.hiddenCategories(), groupBy, timings, customGroups, state.pendingUninstalls, state.codiconsCssUri, state.customProfiles());
}

async function measureStartup(webview: vscode.Webview, state: GridState): Promise<void> {
    await state.measureStartupTimings();
    renderGrid(webview, state);
}

// There is no public API to enumerate profiles, read the active one, or change profile
// membership (see ADR-004), so this only opens VS Code's own native picker. The marker
// file is written before the switch, since actually switching restarts our extension host
// and this same function's continuation may never resume in that case - see the
// PROFILE_SWITCH_MARKER comment above and checkPendingProfileSwitch below.
async function switchProfile(): Promise<void> {
    try {
        fs.writeFileSync(PROFILE_SWITCH_MARKER, '');
        await vscode.commands.executeCommand('workbench.profiles.actions.switchProfile');
        // Only reached if no restart happened (same profile re-picked, or cancelled) -
        // clear the marker so an unrelated later activation doesn't get a stale prompt.
        clearProfileSwitchMarker();
    } catch (error) {
        // Deliberately does NOT clear the marker here. The first version of this fix did,
        // on the assumption that a host-killing restart would leave this await hanging
        // forever rather than throwing - but the extension-host RPC layer almost certainly
        // rejects in-flight calls when the host it was talking to is torn down, which lands
        // right here. Clearing the marker in that case wiped it before the new host ever
        // got a chance to see it, which is exactly the bug a user report caught: no reload
        // prompt ever appeared. Leaving the marker in the error path means a genuinely
        // unrelated failure could cause one unnecessary prompt on the next activation -
        // an acceptable tradeoff against silently losing the signal on every real restart.
        void vscode.window.showErrorMessage(`Failed to open profile switcher: ${String(error)}`);
    }
}

function clearProfileSwitchMarker(): void {
    try {
        fs.unlinkSync(PROFILE_SWITCH_MARKER);
    } catch {
        // Already gone or never created - nothing to clean up.
    }
}

// Unlike a WebviewView (no API lists which ones are currently open), editor-area webview
// panels ARE independently enumerable via tabGroups even when orphaned - so instead of
// asking for a window reload, close each stale grid tab and immediately recreate it in the
// same spot with fresh data. Returns how many tabs it fixed this way.
function reopenStaleGridTabs(state: GridState, activeWebviews: Set<vscode.Webview>): number {
    let reopened = 0;
    for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
            if (!(tab.input instanceof vscode.TabInputWebview) || !tab.input.viewType.includes(GRID_PANEL_VIEW_TYPE)) {
                continue;
            }
            const viewColumn = group.viewColumn;
            void vscode.window.tabGroups.close(tab).then(() => {
                const panel = vscode.window.createWebviewPanel(
                    GRID_PANEL_VIEW_TYPE,
                    'Extensions Grid',
                    viewColumn,
                    { enableScripts: true, localResourceRoots: [state.installRoot] }
                );
                setupGridPanel(panel, state, activeWebviews);
            });
            reopened++;
        }
    }
    return reopened;
}

// Extension-host restarts (profile switches included) silently orphan any already-resolved
// WebviewView: VS Code only calls resolveWebviewView again for a *new* provider registration
// if the view doesn't already have a live one, which it still appears to from the old host's
// perspective (confirmed against microsoft/vscode#109625) - so the sidebar goes stale and
// unresponsive rather than refreshing, and there's no API to detect/fix that automatically
// the way reopenStaleGridTabs does for the editor-tab case. If no stale tab was found and
// silently fixed, a full window reload is the only remaining reliable option, offered rather
// than forced.
function checkPendingProfileSwitch(state: GridState, activeWebviews: Set<vscode.Webview>): void {
    if (!fs.existsSync(PROFILE_SWITCH_MARKER)) {
        return;
    }
    clearProfileSwitchMarker();
    if (reopenStaleGridTabs(state, activeWebviews) > 0) {
        return;
    }
    void vscode.window.showInformationMessage(
        'Profile switched. The Extensions Grid may be showing stale data until the window is reloaded.',
        'Reload Window'
    ).then((choice) => {
        if (choice === 'Reload Window') {
            void vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    });
}

// Toggles the same "Apply Extension to all Profiles" state VS Code's own extensions view
// context menu exposes (see ADR-005). The command's real handler (confirmed against VS
// Code's own source, not just the command id) is
// `run(accessor, id: string, extensionArg: { id, version, location, galleryLink })` and
// matches purely on `extensionArg.location` - passing only the id (as the native command id
// alone would suggest) leaves that third argument undefined and throws
// "Cannot read properties of undefined (reading 'location')" for every extension. The
// location must be a vscode.Uri equal to the extension's actual install folder, which is
// only resolvable through the public API for extensions vscode.extensions.all exposes -
// i.e. enabled ones.
async function toggleApplyToAllProfiles(id: string, webview: vscode.Webview, state: GridState): Promise<void> {
    const extension = vscode.extensions.getExtension(id);
    if (!extension) {
        void vscode.window.showErrorMessage(
            `Cannot toggle "Apply to All Profiles" for "${id}": the extension is disabled, so its install location can't be resolved.`);
        return;
    }
    const extensionArg = { id, version: String(extension.packageJSON?.version ?? ''), location: extension.extensionUri, galleryLink: undefined };
    try {
        await vscode.commands.executeCommand('workbench.extensions.action.toggleApplyToAllProfiles', id, extensionArg);
    } catch (error) {
        void vscode.window.showErrorMessage(`Failed to toggle "Apply to All Profiles" for "${id}": ${String(error)}`);
        return;
    }
    renderGrid(webview, state);
}

async function uninstallExtension(id: string, webview: vscode.Webview, state: GridState): Promise<void> {
    const confirmed = await vscode.window.showWarningMessage(
        `Uninstall extension "${id}"?`, { modal: true }, 'Uninstall');
    if (confirmed !== 'Uninstall') {
        return;
    }
    try {
        await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', id);
        state.pendingUninstalls.add(id.toLowerCase());
        renderGrid(webview, state);
        const reload = await vscode.window.showInformationMessage(
            `Uninstalled "${id}". Reload the window to apply.`, 'Reload Window');
        if (reload === 'Reload Window') {
            void vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    } catch (error) {
        void vscode.window.showErrorMessage(`Failed to uninstall "${id}": ${String(error)}`);
    }
}

// Bulk counterpart of uninstallExtension: one confirmation, then each id is uninstalled
// individually (the underlying command has no batch form), with failures collected into a
// single summary instead of a separate error message per id.
async function bulkUninstallExtensions(ids: string[], webview: vscode.Webview, state: GridState): Promise<void> {
    if (ids.length === 0) {
        return;
    }
    const confirmed = await vscode.window.showWarningMessage(
        `Uninstall ${ids.length} extension(s)?`, { modal: true }, 'Uninstall');
    if (confirmed !== 'Uninstall') {
        return;
    }
    const failed: string[] = [];
    for (const id of ids) {
        try {
            await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', id);
            state.pendingUninstalls.add(id.toLowerCase());
        } catch {
            failed.push(id);
        }
    }
    renderGrid(webview, state);
    const succeeded = ids.length - failed.length;
    const summary = failed.length > 0
        ? `Uninstalled ${succeeded} of ${ids.length} extension(s). Failed: ${failed.join(', ')}.`
        : `Uninstalled ${succeeded} extension(s).`;
    const reload = await vscode.window.showInformationMessage(`${summary} Reload the window to apply.`, 'Reload Window');
    if (reload === 'Reload Window') {
        void vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
}

// Bulk counterpart of toggleApplyToAllProfiles. The client already filters out ids that are
// System, disabled, or already all-profiles (see gridHtml.ts's contextMenuBulkApplyAllIds),
// so every id here is expected to genuinely need turning on - this only reports failures.
async function bulkApplyToAllProfiles(ids: string[], webview: vscode.Webview, state: GridState): Promise<void> {
    if (ids.length === 0) {
        return;
    }
    const failed: string[] = [];
    for (const id of ids) {
        const extension = vscode.extensions.getExtension(id);
        if (!extension) {
            failed.push(id);
            continue;
        }
        const extensionArg = { id, version: String(extension.packageJSON?.version ?? ''), location: extension.extensionUri, galleryLink: undefined };
        try {
            await vscode.commands.executeCommand('workbench.extensions.action.toggleApplyToAllProfiles', id, extensionArg);
        } catch {
            failed.push(id);
        }
    }
    renderGrid(webview, state);
    if (failed.length > 0) {
        void vscode.window.showErrorMessage(`Failed to apply "All Profiles" for: ${failed.join(', ')}`);
    }
}

// Writes directly into another profile's own extensions.json (see ADR-010) - there's no
// command for this (confirmed against the real workbench.extensions.installExtension
// handler, which always installs into the current window's profile). Doesn't touch the
// current profile or vscode.extensions.all at all, so there's nothing to re-render here;
// the added extension(s) show up next time the target profile itself is loaded or reloaded.
function addToProfile(profileLocation: string, ids: string[], state: GridState): void {
    if (!state.userDataRoot) {
        void vscode.window.showErrorMessage('Could not determine the VS Code user data directory.');
        return;
    }
    const result = addExtensionsToProfile(state.installRoot, state.userDataRoot, profileLocation, ids);
    const parts: string[] = [];
    if (result.added.length > 0) {
        parts.push(`added ${result.added.length}`);
    }
    if (result.alreadyPresent.length > 0) {
        parts.push(`${result.alreadyPresent.length} already there`);
    }
    if (result.notFound.length > 0) {
        parts.push(`${result.notFound.length} not found`);
    }
    void vscode.window.showInformationMessage(
        `Profile update: ${parts.join(', ')}. Takes effect next time that profile is loaded.`);
}

// Focus commands for the first 8 editor groups by fixed position - the only stable way to
// target a specific existing group, since neither `extension.open` nor `tabGroups` expose a
// "make this group active" API by ViewColumn.
const FOCUS_GROUP_COMMANDS = [
    'workbench.action.focusFirstEditorGroup',
    'workbench.action.focusSecondEditorGroup',
    'workbench.action.focusThirdEditorGroup',
    'workbench.action.focusFourthEditorGroup',
    'workbench.action.focusFifthEditorGroup',
    'workbench.action.focusSixthEditorGroup',
    'workbench.action.focusSeventhEditorGroup',
    'workbench.action.focusEighthEditorGroup'
];

async function openExtensionDetails(id: string, gridPanel: vscode.WebviewPanel | undefined): Promise<void> {
    if (gridPanel) {
        const currentColumn = gridPanel.viewColumn ?? vscode.ViewColumn.One;
        const targetColumn = currentColumn + 1;
        const neighborExists = vscode.window.tabGroups.all.some((group) => group.viewColumn === targetColumn);
        if (neighborExists) {
            const focusCommand = FOCUS_GROUP_COMMANDS[targetColumn - 1];
            if (focusCommand) {
                await vscode.commands.executeCommand(focusCommand);
            }
        } else {
            await vscode.commands.executeCommand('workbench.action.splitEditor');
        }
    }
    await vscode.commands.executeCommand('extension.open', id);
}

function handleGridMessage(message: GridMessage, webview: vscode.Webview, state: GridState, gridPanel: vscode.WebviewPanel | undefined): void {
    switch (message.type) {
        case 'openExtension':
            if (message.id) {
                void openExtensionDetails(message.id, gridPanel);
            }
            return;
        case 'setCategoryHidden':
            state.setCategoryHidden(message.category, message.hidden);
            return;
        case 'showAllCategories':
            state.showAllCategories();
            return;
        case 'setGroupBy':
            state.setGroupBy(message.groupBy);
            renderGrid(webview, state);
            return;
        case 'uninstallExtension':
            void uninstallExtension(message.id, webview, state);
            return;
        case 'copyExtensionId':
            void vscode.env.clipboard.writeText(message.id);
            return;
        case 'measureStartup':
            void measureStartup(webview, state);
            return;
        case 'moveToGroup':
            // No explicit re-render: the settings write fires onDidChangeConfiguration,
            // which already re-renders every active webview exactly once.
            void state.moveToGroup(message.group, message.ids);
            return;
        case 'switchProfile':
            void switchProfile();
            return;
        case 'toggleApplyToAllProfiles':
            void toggleApplyToAllProfiles(message.id, webview, state);
            return;
        case 'bulkUninstallExtensions':
            void bulkUninstallExtensions(message.ids, webview, state);
            return;
        case 'bulkApplyToAllProfiles':
            void bulkApplyToAllProfiles(message.ids, webview, state);
            return;
        case 'bulkCopyExtensionId':
            void vscode.env.clipboard.writeText(message.ids.join('\n'));
            return;
        case 'addToProfile':
            addToProfile(message.profileLocation, message.ids, state);
            return;
    }
}

class ExtensionsGridViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewId = 'anDrExtensionsGrid';

    constructor(private readonly state: GridState, private readonly activeWebviews: Set<vscode.Webview>) { }

    public resolveWebviewView(webviewView: vscode.WebviewView): void {
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this.state.installRoot] };
        this.activeWebviews.add(webviewView.webview);
        webviewView.onDidDispose(() => this.activeWebviews.delete(webviewView.webview));
        renderGrid(webviewView.webview, this.state);
        webviewView.webview.onDidReceiveMessage((message: GridMessage) =>
            handleGridMessage(message, webviewView.webview, this.state, undefined));
    }
}

const GRID_PANEL_VIEW_TYPE = 'anDrExtensionsGridPanel';

function setupGridPanel(panel: vscode.WebviewPanel, state: GridState, activeWebviews: Set<vscode.Webview>): void {
    panel.webview.options = { enableScripts: true, localResourceRoots: [state.installRoot] };
    activeWebviews.add(panel.webview);
    panel.onDidDispose(() => activeWebviews.delete(panel.webview));
    renderGrid(panel.webview, state);
    panel.webview.onDidReceiveMessage((message: GridMessage) => handleGridMessage(message, panel.webview, state, panel));
}

export function activate(context: vscode.ExtensionContext): void {
    const state = new GridState(context);
    const activeWebviews = new Set<vscode.Webview>();
    checkPendingProfileSwitch(state, activeWebviews);
    const provider = new ExtensionsGridViewProvider(state, activeWebviews);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ExtensionsGridViewProvider.viewId, provider),
        vscode.extensions.onDidChange(() => {
            activeWebviews.forEach((webview) => renderGrid(webview, state));
        }),
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration(`${CUSTOM_GROUPS_SECTION}.${CUSTOM_GROUPS_KEY}`)) {
                activeWebviews.forEach((webview) => renderGrid(webview, state));
            }
        }),
        // Switching profiles restarts the extension host in place on local windows (no full
        // window reload - see ADR-006), which tears down any open editor-tab grid panel.
        // Without a serializer, VS Code doesn't recreate it; with one, it does, and
        // setupGridPanel reads fresh enabled/disabled state for the new profile.
        vscode.window.registerWebviewPanelSerializer(GRID_PANEL_VIEW_TYPE, {
            async deserializeWebviewPanel(panel: vscode.WebviewPanel): Promise<void> {
                setupGridPanel(panel, state, activeWebviews);
            }
        }),
        vscode.commands.registerCommand('an-dr-extensions.openGrid', () => {
            const panel = vscode.window.createWebviewPanel(
                GRID_PANEL_VIEW_TYPE,
                'Extensions Grid',
                vscode.ViewColumn.Active,
                { enableScripts: true, localResourceRoots: [state.installRoot] }
            );
            setupGridPanel(panel, state, activeWebviews);
        })
    );
}

export function deactivate(): void {
    // nothing to clean up
}
