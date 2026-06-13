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

// A1: use \0 (null byte) as separator — cannot appear in file paths or symbol names.
// A1: represent undefined symbol distinctly from empty string.
const SEP = '\0';
function keyString(k: CacheKey): string {
    const sym = k.symbol === undefined ? SEP + 'undef' : SEP + k.symbol;
    return `${k.filePath}${SEP}${k.graphType}${SEP}${k.depth}${sym}`;
}

export class AnalysisCache implements vscode.Disposable {
    private readonly _map = new Map<string, CacheEntry>();
    private readonly _watcher: vscode.FileSystemWatcher;

    constructor() {
        this._watcher = vscode.workspace.createFileSystemWatcher(
            '**/*.{c,cpp,cc,cxx,h,hpp,hxx,inl,ts,tsx,js,jsx,mts,cts,mjs,cjs,rs,py,go}'
        );
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
        // A2: use SEP (\0) so a path that happens to share a prefix with another
        // path cannot cause false invalidation.
        const prefix = fsPath + SEP;
        for (const k of this._map.keys()) {
            if (k.startsWith(prefix)) {
                this._map.delete(k);
            }
        }
    }

    dispose(): void {
        this._watcher.dispose();
    }
}
