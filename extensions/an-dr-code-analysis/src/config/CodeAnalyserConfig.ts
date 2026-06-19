import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/** Shape of `.vscode/code-analyser/config.json`. All fields are optional overrides. */
export interface CodeAnalyserConfigData {
    /** Absolute or workspace-relative path to compile_commands.json. Overrides auto-detection. */
    compileCommandsPath?: string;
    /** Absolute or workspace-relative path to a tsconfig*.json. Overrides auto-detection. */
    tsconfigPath?: string;
}

const CONFIG_DIR  = path.join('.vscode', 'code-analyser');
const CONFIG_FILE = 'config.json';
const GITIGNORE   = '.gitignore';

function configDir(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    return folders?.length ? path.join(folders[0].uri.fsPath, CONFIG_DIR) : null;
}

/** Returns the absolute path to config.json, or null if no workspace is open. */
export function configFilePath(): string | null {
    const dir = configDir();
    return dir ? path.join(dir, CONFIG_FILE) : null;
}

/** Read and parse the config file. Returns an empty object if the file does not exist. */
export function readConfig(): CodeAnalyserConfigData {
    const p = configFilePath();
    if (!p || !fs.existsSync(p)) { return {}; }
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8')) as CodeAnalyserConfigData;
    } catch {
        return {};
    }
}

/**
 * Merge `patch` into the existing config and write it back.
 * Creates `.vscode/code-analyser/` and a sibling `.gitignore` that ignores
 * everything in the directory on first write — keeping user overrides out of VCS.
 */
export function writeConfig(patch: Partial<CodeAnalyserConfigData>): void {
    const dir = configDir();
    if (!dir) { throw new Error('No workspace folder open.'); }

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, GITIGNORE), '*\n', 'utf8');
    }

    const current = readConfig();
    const updated  = { ...current, ...patch };
    fs.writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify(updated, null, 4) + '\n', 'utf8');
}

/**
 * Remove one key from the config. If the file becomes empty after removal, deletes it.
 * Does nothing if the file does not exist.
 */
export function clearConfigKey(key: keyof CodeAnalyserConfigData): void {
    const p = configFilePath();
    if (!p || !fs.existsSync(p)) { return; }
    const current = readConfig();
    delete current[key];
    if (Object.keys(current).length === 0) {
        fs.unlinkSync(p);
    } else {
        fs.writeFileSync(p, JSON.stringify(current, null, 4) + '\n', 'utf8');
    }
}
