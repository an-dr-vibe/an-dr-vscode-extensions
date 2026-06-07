import * as vscode from 'vscode';

export interface LspCallHierarchyResult {
    item: vscode.CallHierarchyItem;
    incoming: vscode.CallHierarchyIncomingCall[];
    outgoing: vscode.CallHierarchyOutgoingCall[];
}

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
    } catch {
        return undefined;
    }
}

export async function getIncomingCalls(
    item: vscode.CallHierarchyItem,
    signal?: AbortSignal
): Promise<vscode.CallHierarchyIncomingCall[]> {
    if (signal?.aborted) { return []; }
    try {
        return await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
            'vscode.provideIncomingCalls', item
        ) ?? [];
    } catch {
        return [];
    }
}

export async function getOutgoingCalls(
    item: vscode.CallHierarchyItem,
    signal?: AbortSignal
): Promise<vscode.CallHierarchyOutgoingCall[]> {
    if (signal?.aborted) { return []; }
    try {
        return await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
            'vscode.provideOutgoingCalls', item
        ) ?? [];
    } catch {
        return [];
    }
}
