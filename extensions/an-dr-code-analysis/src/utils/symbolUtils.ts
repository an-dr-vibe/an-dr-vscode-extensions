import * as vscode from 'vscode';

export function flattenSymbols(syms: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
    const out: vscode.DocumentSymbol[] = [];
    (function walk(arr: vscode.DocumentSymbol[]) {
        for (const s of arr) { out.push(s); walk(s.children); }
    })(syms);
    return out;
}
