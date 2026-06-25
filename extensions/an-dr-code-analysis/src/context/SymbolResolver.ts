import * as vscode from 'vscode';
import { log } from '../logger';
import type { SymbolSource } from '../../shared/protocol/messages';

/** Result of resolving the editor position to the best available symbol. */
export interface SymbolResolveResult {
    symbol: string | undefined;
    symbolKind: number | undefined;
    symbolSource: SymbolSource;
    callHierarchyItem: vscode.CallHierarchyItem | undefined;
    callHierarchyMissed: boolean;
    resolvedPos: vscode.Position;
}

/** Cancellation guard used by ContextTracker to drop superseded async results. */
export type SymbolResolveLiveness = () => boolean;

function findDeepestContaining(
    symbols: vscode.DocumentSymbol[],
    pos: vscode.Position
): vscode.DocumentSymbol | undefined {
    for (const sym of symbols) {
        if (sym.range.contains(pos)) {
            return findDeepestContaining(sym.children, pos) ?? sym;
        }
    }
    return undefined;
}

/** Resolves a text position through call hierarchy, document symbols, then word fallback. */
export class SymbolResolver {
    constructor(private readonly _logger: Pick<typeof log, 'appendLine'> = log) {}

    /** Resolve the best symbol for a position, returning null when superseded. */
    async resolveAt(
        doc: vscode.TextDocument,
        pos: vscode.Position,
        isCurrent: SymbolResolveLiveness,
    ): Promise<SymbolResolveResult | null> {
        const fsPath = doc.uri.fsPath;
        const tag = `[resolveAt ${fsPath.split(/[\\/]/).pop()}:${pos.line}:${pos.character}]`;
        let callHierarchyMissed = false;

        const direct = await this._tryCallHierarchy(doc, pos, tag, isCurrent);
        if (direct === null) { return null; }
        if (direct) {
            return {
                symbol: direct.name,
                symbolKind: direct.kind,
                symbolSource: 'call-hierarchy',
                callHierarchyItem: direct,
                callHierarchyMissed,
                resolvedPos: pos,
            };
        }
        callHierarchyMissed = true;

        const documentSymbol = await this._tryDocumentSymbol(doc, pos, tag, isCurrent);
        if (documentSymbol === null) { return null; }
        if (documentSymbol) {
            const upgraded = await this._tryCallHierarchy(doc, documentSymbol.selectionRange.start, `${tag} tier2 upgrade`, isCurrent);
            if (upgraded === null) { return null; }
            if (upgraded) {
                return {
                    symbol: upgraded.name,
                    symbolKind: upgraded.kind,
                    symbolSource: 'call-hierarchy',
                    callHierarchyItem: upgraded,
                    callHierarchyMissed,
                    resolvedPos: documentSymbol.selectionRange.start,
                };
            }

            this._logger.appendLine(`${tag} tier2 emitting document-symbol: ${documentSymbol.name}`);
            return {
                symbol: documentSymbol.name,
                symbolKind: documentSymbol.kind,
                symbolSource: 'document-symbol',
                callHierarchyItem: undefined,
                callHierarchyMissed,
                resolvedPos: pos,
            };
        }

        return this._resolveWord(doc, pos, tag, callHierarchyMissed);
    }

    private async _tryCallHierarchy(
        doc: vscode.TextDocument,
        pos: vscode.Position,
        tag: string,
        isCurrent: SymbolResolveLiveness,
    ): Promise<vscode.CallHierarchyItem | undefined | null> {
        try {
            this._logger.appendLine(`${tag} prepareCallHierarchy...`);
            const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
                'vscode.prepareCallHierarchy', doc.uri, pos
            );
            if (!isCurrent()) { this._logger.appendLine(`${tag} call hierarchy cancelled`); return null; }
            this._logger.appendLine(`${tag} call hierarchy result: ${items?.length ?? 0} items`);
            return items?.[0];
        } catch (e) {
            this._logger.appendLine(`${tag} call hierarchy threw: ${e}`);
            return isCurrent() ? undefined : null;
        }
    }

    private async _tryDocumentSymbol(
        doc: vscode.TextDocument,
        pos: vscode.Position,
        tag: string,
        isCurrent: SymbolResolveLiveness,
    ): Promise<vscode.DocumentSymbol | undefined | null> {
        try {
            this._logger.appendLine(`${tag} tier2 executeDocumentSymbolProvider...`);
            const allSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider', doc.uri
            );
            if (!isCurrent()) { this._logger.appendLine(`${tag} tier2 cancelled`); return null; }
            this._logger.appendLine(`${tag} tier2 symbols: ${allSymbols?.length ?? 0} top-level`);
            const symbol = allSymbols?.length ? findDeepestContaining(allSymbols, pos) : undefined;
            this._logger.appendLine(`${tag} tier2 deepest: ${symbol?.name ?? 'none'}`);
            return symbol;
        } catch (e) {
            this._logger.appendLine(`${tag} tier2 threw: ${e}`);
            return isCurrent() ? undefined : null;
        }
    }

    private _resolveWord(
        doc: vscode.TextDocument,
        pos: vscode.Position,
        tag: string,
        callHierarchyMissed: boolean,
    ): SymbolResolveResult {
        const wordDoc = doc as vscode.TextDocument & {
            getWordRangeAtPosition?: (position: vscode.Position) => vscode.Range | undefined;
        };
        const wordRange = wordDoc.getWordRangeAtPosition?.(pos);
        const symbol = wordRange ? doc.getText(wordRange) : undefined;
        this._logger.appendLine(`${tag} fell through to word: ${symbol ?? 'none'}`);
        return {
            symbol,
            symbolKind: undefined,
            symbolSource: 'word',
            callHierarchyItem: undefined,
            callHierarchyMissed,
            resolvedPos: pos,
        };
    }
}
