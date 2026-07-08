import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { StartupTiming } from './startupTiming';

export interface ExtensionCardData {
    id: string;
    displayName: string;
    description: string;
    version: string;
    iconPath: vscode.Uri | undefined;
    categories: string[];
    enabled: boolean;
    appliesToAllProfiles: boolean;
}

export interface Group {
    label: string;
    extensions: ExtensionCardData[];
}

export type GroupByMode = 'category' | 'alphabetical' | 'enabled' | 'startup' | 'custom' | 'none';

export type CustomGroups = Record<string, string[]>;

interface ExtensionPackageJson {
    displayName?: string;
    description?: string;
    version?: string;
    icon?: string;
    categories?: string[];
}

export function extensionsInstallRoot(context: vscode.ExtensionContext): vscode.Uri {
    return vscode.Uri.joinPath(context.extensionUri, '..');
}

// Extensions bundled with VS Code itself (git, markdown-language-features, theme-defaults,
// etc.) live under the VS Code install directory, not the user's extensions install
// directory, and cannot be uninstalled. They're tagged with a synthetic "System" category,
// hidden by default (see GROUP_BY defaults in extension.ts), so hundreds of user-installed
// extensions aren't buried under dozens of built-ins the user can't act on anyway.
export const SYSTEM_CATEGORY = 'System';

export function collectExtensions(installRoot: vscode.Uri): ExtensionCardData[] {
    const enabled = vscode.extensions.all.map((ext) => toCardData(ext, installRoot));
    const enabledIds = new Set(enabled.map((ext) => ext.id.toLowerCase()));
    const disabled = collectDisabledExtensions(installRoot, enabledIds);
    const applicationScoped = readApplicationScopedIds(installRoot);
    return [...enabled, ...disabled]
        .map((ext) => ({ ...ext, appliesToAllProfiles: applicationScoped.has(ext.id.toLowerCase()) }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

interface ExtensionsJsonEntry {
    identifier?: { id?: string };
    metadata?: { isApplicationScoped?: boolean };
}

// "Apply Extension to all Profiles" state lives in the same install-state manifest already
// implicated in disabled-extension detection (ADR-002) - there is no public API to read or
// write it. Confirmed against a real capture of this machine's extensions.json (VS Code
// 1.127.0): each entry has identifier.id and metadata.isApplicationScoped. See ADR-004.
function readApplicationScopedIds(installRoot: vscode.Uri): Set<string> {
    try {
        const manifestPath = vscode.Uri.joinPath(installRoot, 'extensions.json').fsPath;
        const entries = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as ExtensionsJsonEntry[];
        return new Set(
            entries
                .filter((entry) => entry.metadata?.isApplicationScoped)
                .map((entry) => entry.identifier?.id?.toLowerCase())
                .filter((id): id is string => Boolean(id))
        );
    } catch {
        return new Set();
    }
}

// vscode.ExtensionContext exposes no direct API for the VS Code userData root, only
// per-extension storage URIs under it. globalStorageUri is `<userData>/User/globalStorage/
// <ext-id>` in the Default profile, or `<userData>/User/profiles/<id>/globalStorage/<ext-id>`
// in any other - the depth varies, so this walks up looking for the ancestor literally named
// "User" and returns its parent, rather than assuming a fixed number of "..".
export function computeUserDataRoot(globalStorageUri: vscode.Uri): vscode.Uri | undefined {
    let dir = globalStorageUri;
    for (let i = 0; i < 6; i++) {
        const parent = vscode.Uri.joinPath(dir, '..');
        if (path.basename(parent.fsPath) === 'User') {
            return vscode.Uri.joinPath(parent, '..');
        }
        if (parent.fsPath === dir.fsPath) {
            break;
        }
        dir = parent;
    }
    return undefined;
}

export interface ProfileDescriptor {
    // Relative path segment(s) under User/profiles/ - e.g. "78a27072" or, as seen on this
    // machine, the nested "builtin/agents". Not necessarily a single flat id.
    location: string;
    name: string;
}

// Custom (non-default) profiles are listed by VS Code itself in User/globalStorage/
// storage.json under a "userDataProfiles" key - {location, name} per profile. There is no
// public API for this (see ADR-008); confirmed against a real capture of this machine's own
// storage.json (VS Code 1.127.0, two real profiles) before writing this parser, rather than
// guessing the shape blind.
export function readCustomProfiles(userDataRoot: vscode.Uri): ProfileDescriptor[] {
    try {
        const storagePath = vscode.Uri.joinPath(userDataRoot, 'User', 'globalStorage', 'storage.json').fsPath;
        const data = JSON.parse(fs.readFileSync(storagePath, 'utf8')) as { userDataProfiles?: { location?: unknown; name?: unknown }[] };
        return (data.userDataProfiles ?? [])
            .filter((entry): entry is { location: string; name: string } =>
                typeof entry.location === 'string' && typeof entry.name === 'string' && !entry.location.includes('..'));
    } catch {
        return [];
    }
}

interface SharedManifestEntry {
    identifier: { id: string; uuid?: string };
    version: string;
    location?: unknown;
    relativeLocation?: string;
    metadata?: unknown;
}

export interface AddToProfileResult {
    added: string[];
    alreadyPresent: string[];
    // Ids not found in the shared install-state manifest at all - shouldn't normally happen
    // for enabled extensions, but the manifest read can fail or an id can be mistyped.
    notFound: string[];
}

// Adds already-installed extensions to another profile's own extension list (a separate
// per-profile extensions.json, distinct from the shared install-state manifest read above -
// see ADR-008) so they load the next time that profile is used, without needing "Apply to
// All Profiles". Confirmed via VS Code's own extensionsProfileScannerService.ts that a
// profile's list is read on trust (no cross-check against the shared manifest) and resolves
// relativeLocation against the same shared extensions install directory, so copying an
// entry's identifier/version/location/relativeLocation/metadata verbatim from the shared
// manifest is exactly what a real install would have written there.
export function addExtensionsToProfile(installRoot: vscode.Uri, userDataRoot: vscode.Uri, profileLocation: string, ids: string[]): AddToProfileResult {
    const result: AddToProfileResult = { added: [], alreadyPresent: [], notFound: [] };

    let sharedEntries: SharedManifestEntry[] = [];
    try {
        const sharedManifestPath = vscode.Uri.joinPath(installRoot, 'extensions.json').fsPath;
        sharedEntries = JSON.parse(fs.readFileSync(sharedManifestPath, 'utf8')) as SharedManifestEntry[];
    } catch {
        // Leave empty - every id will report as notFound below, which is accurate: nothing
        // could be located to copy from.
    }
    const sharedById = new Map(sharedEntries.map((entry) => [entry.identifier.id.toLowerCase(), entry]));

    const targetDir = vscode.Uri.joinPath(userDataRoot, 'User', 'profiles', profileLocation).fsPath;
    const targetPath = path.join(targetDir, 'extensions.json');
    let targetEntries: SharedManifestEntry[] = [];
    try {
        targetEntries = JSON.parse(fs.readFileSync(targetPath, 'utf8')) as SharedManifestEntry[];
    } catch {
        // Missing file means this profile has no extensions of its own yet - starts empty.
    }
    const targetIds = new Set(targetEntries.map((entry) => entry.identifier.id.toLowerCase()));

    for (const id of ids) {
        const lowerId = id.toLowerCase();
        if (targetIds.has(lowerId)) {
            result.alreadyPresent.push(id);
            continue;
        }
        const source = sharedById.get(lowerId);
        if (!source) {
            result.notFound.push(id);
            continue;
        }
        targetEntries.push({
            identifier: source.identifier,
            version: source.version,
            location: source.location,
            relativeLocation: source.relativeLocation,
            metadata: source.metadata
        });
        targetIds.add(lowerId);
        result.added.push(id);
    }

    if (result.added.length > 0) {
        fs.mkdirSync(targetDir, { recursive: true });
        fs.writeFileSync(targetPath, JSON.stringify(targetEntries), 'utf8');
    }
    return result;
}

// path.relative handles separators and, on Windows, compares case-insensitively —
// a plain startsWith would tag every user extension as System on a drive-letter
// casing mismatch (c:\ vs C:\), hiding the whole grid since System is hidden by default.
function isPathInside(child: string, parent: string): boolean {
    const relative = path.relative(parent, child);
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function toCardData(ext: vscode.Extension<unknown>, installRoot: vscode.Uri): ExtensionCardData {
    const pkg = ext.packageJSON as ExtensionPackageJson;
    const nls = loadNlsBundle(ext.extensionUri);
    const isSystem = !isPathInside(ext.extensionUri.fsPath, installRoot.fsPath);
    const categories = pkg.categories && pkg.categories.length > 0 ? pkg.categories : ['Other'];
    return {
        id: ext.id,
        displayName: resolveNlsString(pkg.displayName, nls, ext.id),
        description: resolveNlsString(pkg.description, nls, ''),
        version: pkg.version ?? '',
        iconPath: pkg.icon ? vscode.Uri.joinPath(ext.extensionUri, pkg.icon) : undefined,
        categories: isSystem ? [...categories, SYSTEM_CATEGORY] : categories,
        enabled: true,
        appliesToAllProfiles: false
    };
}

// package.json displayName/description may be NLS placeholders like "%extension.displayName%"
// resolved at runtime from package.nls.json; the raw packageJSON we read (from the API or disk)
// does not have these substituted, so we resolve them ourselves.
function loadNlsBundle(extensionUri: vscode.Uri): Record<string, string> | undefined {
    try {
        const nlsPath = vscode.Uri.joinPath(extensionUri, 'package.nls.json').fsPath;
        return JSON.parse(fs.readFileSync(nlsPath, 'utf8')) as Record<string, string>;
    } catch {
        return undefined;
    }
}

function resolveNlsString(value: string | undefined, nls: Record<string, string> | undefined, fallback: string): string {
    if (!value) {
        return fallback;
    }
    const match = /^%(.+)%$/.exec(value);
    if (!match) {
        return value;
    }
    return nls?.[match[1]] ?? fallback;
}

// VS Code marks uninstalled-but-not-yet-deleted extension folders in a ".obsolete" JSON
// file (folder name -> true) and skips loading them; actual removal happens on next
// restart. We must skip these too, or an uninstalled extension looks "disabled" until
// VS Code actually deletes the folder.
function loadObsoleteFolders(installRoot: vscode.Uri): Set<string> {
    try {
        const obsoletePath = vscode.Uri.joinPath(installRoot, '.obsolete').fsPath;
        const obsolete = JSON.parse(fs.readFileSync(obsoletePath, 'utf8')) as Record<string, boolean>;
        return new Set(Object.entries(obsolete).filter(([, isObsolete]) => isObsolete).map(([folder]) => folder));
    } catch {
        return new Set();
    }
}

// VS Code exposes no public API to enumerate disabled extensions, so we diff the
// extensions install directory on disk against vscode.extensions.all. See ADR-003.
function collectDisabledExtensions(installRoot: vscode.Uri, enabledIds: Set<string>): ExtensionCardData[] {
    let entries: fs.Dirent[];
    try {
        entries = fs.readdirSync(installRoot.fsPath, { withFileTypes: true });
    } catch {
        return [];
    }

    const obsoleteFolders = loadObsoleteFolders(installRoot);
    const latestByExtensionId = new Map<string, { folder: string; version: string }>();
    for (const entry of entries) {
        if (!entry.isDirectory() || obsoleteFolders.has(entry.name)) {
            continue;
        }
        const parsed = parseFolderName(entry.name);
        if (!parsed) {
            continue;
        }
        const id = parsed.id.toLowerCase();
        const existing = latestByExtensionId.get(id);
        if (!existing || compareVersions(parsed.version, existing.version) > 0) {
            latestByExtensionId.set(id, { folder: entry.name, version: parsed.version });
        }
    }

    const disabled: ExtensionCardData[] = [];
    for (const [id, entry] of latestByExtensionId) {
        if (enabledIds.has(id)) {
            continue;
        }
        const card = readExtensionCardFromDisk(installRoot, entry.folder, id);
        if (card) {
            disabled.push(card);
        }
    }
    return disabled;
}

function parseFolderName(folder: string): { id: string; version: string } | undefined {
    const matches = Array.from(folder.matchAll(/-(\d+\.\d+\.\d+)/g));
    if (matches.length === 0) {
        return undefined;
    }
    const last = matches[matches.length - 1];
    return { id: folder.slice(0, last.index ?? 0), version: last[1] };
}

function compareVersions(a: string, b: string): number {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
}

function readExtensionCardFromDisk(installRoot: vscode.Uri, folder: string, id: string): ExtensionCardData | undefined {
    const extensionUri = vscode.Uri.joinPath(installRoot, folder);
    try {
        const packageJsonPath = vscode.Uri.joinPath(extensionUri, 'package.json').fsPath;
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as ExtensionPackageJson;
        const nls = loadNlsBundle(extensionUri);
        return {
            id,
            displayName: resolveNlsString(pkg.displayName, nls, id),
            description: resolveNlsString(pkg.description, nls, ''),
            version: pkg.version ?? '',
            iconPath: pkg.icon ? vscode.Uri.joinPath(extensionUri, pkg.icon) : undefined,
            categories: pkg.categories && pkg.categories.length > 0 ? pkg.categories : ['Other'],
            enabled: false,
            appliesToAllProfiles: false
        };
    } catch {
        return undefined;
    }
}

export function groupExtensions(
    extensions: ExtensionCardData[],
    mode: GroupByMode,
    startupTimings: Map<string, StartupTiming> | undefined,
    customGroups: CustomGroups
): Group[] {
    switch (mode) {
        case 'category':
            return groupByCategory(extensions);
        case 'alphabetical':
            return groupAlphabetically(extensions);
        case 'enabled':
            return groupByEnabled(extensions);
        case 'startup':
            return groupByStartupTime(extensions, startupTimings);
        case 'custom':
            return groupByCustom(extensions, customGroups);
        case 'none':
            return [{ label: '', extensions }];
    }
}

const UNGROUPED = 'Ungrouped';

function groupByCustom(extensions: ExtensionCardData[], customGroups: CustomGroups): Group[] {
    const byId = new Map(extensions.map((ext) => [ext.id.toLowerCase(), ext]));
    const groupNames = Object.keys(customGroups).sort((a, b) => a.localeCompare(b));
    const groupedIds = new Set<string>();
    const groups: Group[] = groupNames.map((name) => {
        const members = (customGroups[name] ?? [])
            .map((id) => byId.get(id.toLowerCase()))
            .filter((ext): ext is ExtensionCardData => ext !== undefined);
        members.forEach((ext) => groupedIds.add(ext.id.toLowerCase()));
        return { label: name, extensions: members };
    });
    const ungrouped = extensions.filter((ext) => !groupedIds.has(ext.id.toLowerCase()));
    if (ungrouped.length > 0) {
        groups.push({ label: UNGROUPED, extensions: ungrouped });
    }
    return groups;
}

// Listed slowest-first, matching the order they're displayed in - the point of this
// grouping is spotting the extensions worth investigating first.
const STARTUP_BUCKETS: [string, (ms: number) => boolean][] = [
    ['200ms+', (ms) => ms >= 200],
    ['50-200ms', (ms) => ms >= 50 && ms < 200],
    ['10-50ms', (ms) => ms >= 10 && ms < 50],
    ['0-10ms', (ms) => ms < 10]
];
const NOT_MEASURED = 'Not measured';

function groupByStartupTime(extensions: ExtensionCardData[], timings: Map<string, StartupTiming> | undefined): Group[] {
    const groups = new Map<string, ExtensionCardData[]>();
    for (const ext of extensions) {
        const timing = timings?.get(ext.id.toLowerCase());
        const label = timing
            ? (STARTUP_BUCKETS.find(([, matches]) => matches(timing.totalMs))?.[0] ?? '200ms+')
            : NOT_MEASURED;
        const list = groups.get(label) ?? [];
        list.push(ext);
        groups.set(label, list);
    }
    for (const list of groups.values()) {
        list.sort((a, b) => (timings?.get(b.id.toLowerCase())?.totalMs ?? -1) - (timings?.get(a.id.toLowerCase())?.totalMs ?? -1));
    }
    const order = [...STARTUP_BUCKETS.map(([label]) => label), NOT_MEASURED];
    return order
        .filter((label) => groups.has(label))
        .map((label) => ({ label, extensions: groups.get(label) as ExtensionCardData[] }));
}

function groupByCategory(extensions: ExtensionCardData[]): Group[] {
    const groups = new Map<string, ExtensionCardData[]>();
    for (const ext of extensions) {
        for (const category of ext.categories) {
            const list = groups.get(category) ?? [];
            list.push(ext);
            groups.set(category, list);
        }
    }
    return Array.from(groups.entries())
        .map(([label, groupExtensions]) => ({ label, extensions: groupExtensions }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

function groupAlphabetically(extensions: ExtensionCardData[]): Group[] {
    const groups = new Map<string, ExtensionCardData[]>();
    for (const ext of extensions) {
        const first = ext.displayName.trim().charAt(0).toUpperCase();
        const label = /[A-Z]/.test(first) ? first : '#';
        const list = groups.get(label) ?? [];
        list.push(ext);
        groups.set(label, list);
    }
    return Array.from(groups.entries())
        .map(([label, groupExtensions]) => ({ label, extensions: groupExtensions }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

function groupByEnabled(extensions: ExtensionCardData[]): Group[] {
    const groups = new Map<string, ExtensionCardData[]>();
    for (const ext of extensions) {
        const label = ext.enabled ? 'Enabled' : 'Disabled';
        const list = groups.get(label) ?? [];
        list.push(ext);
        groups.set(label, list);
    }
    return ['Enabled', 'Disabled']
        .filter((label) => groups.has(label))
        .map((label) => ({ label, extensions: groups.get(label) as ExtensionCardData[] }));
}

export function allCategories(extensions: ExtensionCardData[]): string[] {
    const categories = new Set<string>();
    for (const ext of extensions) {
        for (const category of ext.categories) {
            categories.add(category);
        }
    }
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
}
