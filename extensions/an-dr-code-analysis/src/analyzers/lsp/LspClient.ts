import * as vscode from 'vscode';
import { log } from '../../logger';

export async function prepareCallHierarchy(
    uri: vscode.Uri,
    position: vscode.Position,
    signal?: AbortSignal
): Promise<vscode.CallHierarchyItem[] | undefined> {
    if (signal?.aborted) { return undefined; }
    try {
        const result = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
            'vscode.prepareCallHierarchy', uri, position
        );
        return result?.length ? result : undefined;
    } catch (e) {
        log.appendLine(`[LspClient] prepareCallHierarchy threw: ${e}`);
        return undefined;
    }
}

export async function getIncomingCalls(
    item: vscode.CallHierarchyItem,
    signal?: AbortSignal
): Promise<vscode.CallHierarchyIncomingCall[]> {
    if (signal?.aborted) { return []; }
    try {
        const result = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
            '_executeProvideIncomingCalls', item
        );
        return result ?? [];
    } catch (e) {
        log.appendLine(`[LspClient] getIncomingCalls threw: ${e}`);
        return [];
    }
}

export async function getOutgoingCalls(
    item: vscode.CallHierarchyItem,
    signal?: AbortSignal
): Promise<vscode.CallHierarchyOutgoingCall[]> {
    if (signal?.aborted) { return []; }
    try {
        const result = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
            '_executeProvideOutgoingCalls', item
        );
        return result ?? [];
    } catch (e) {
        log.appendLine(`[LspClient] getOutgoingCalls threw: ${e}`);
        return [];
    }
}
