import * as vscode from 'vscode';
import * as fs from 'fs';
import { AnalysisResult } from '../analyzers/IAnalyzer';
import { GraphType } from '../graph/GraphModel';

interface CacheKey {
    filePath: string;
    graphType: GraphType;
    depth: number;
    symbol?: string;
}

interface CacheEntry {
    result: AnalysisResult;
    mtime: number;
}

function keyString(k: CacheKey): string {
    return `${k.filePath}|${k.graphType}|${k.depth}|${k.symbol ?? ''}`;
}

export class AnalysisCache implements vscode.Disposable {
    private readonly _map = new Map<string, CacheEntry>();
    private readonly _watcher: vscode.FileSystemWatcher;

    constructor() {
        this._watcher = vscode.workspace.createFileSystemWatcher('**/*');
        this._watcher.onDidChange(uri => this._invalidateFile(uri.fsPath));
        this._watcher.onDidCreate(uri => this._invalidateFile(uri.fsPath));
        this._watcher.onDidDelete(uri => this._invalidateFile(uri.fsPath));
    }

    get(key: CacheKey): AnalysisResult | undefined {
        const entry = this._map.get(keyString(key));
        if (!entry) { return undefined; }

        let mtime: number;
        try {
            mtime = fs.statSync(key.filePath).mtimeMs;
        } catch {
            this._map.delete(keyString(key));
            return undefined;
        }

        if (mtime !== entry.mtime) {
            this._map.delete(keyString(key));
            return undefined;
        }
        return entry.result;
    }

    set(key: CacheKey, result: AnalysisResult): void {
        let mtime: number;
        try {
            mtime = fs.statSync(key.filePath).mtimeMs;
        } catch {
            return;
        }
        this._map.set(keyString(key), { result, mtime });
    }

    private _invalidateFile(fsPath: string): void {
        for (const k of this._map.keys()) {
            if (k.startsWith(fsPath + '|')) {
                this._map.delete(k);
            }
        }
    }

    dispose(): void {
        this._watcher.dispose();
    }
}
