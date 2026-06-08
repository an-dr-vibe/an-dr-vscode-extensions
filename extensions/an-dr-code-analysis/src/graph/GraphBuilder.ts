import * as vscode from 'vscode';
import * as path from 'path';
import { GraphModel, GraphNode, GraphEdge, GraphType, NodeRole } from './GraphModel';

function itemId(item: vscode.CallHierarchyItem): string {
    const line = item.selectionRange?.start?.line ?? item.range?.start?.line ?? 0;
    return `${item.uri.fsPath}:${line}:${item.name}`;
}

function itemLabel(item: vscode.CallHierarchyItem): string {
    return item.name;
}

function itemFullName(item: vscode.CallHierarchyItem): string {
    return item.detail ? `${item.detail}::${item.name}` : item.name;
}

function itemLangId(fsPath: string | undefined): string {
    if (!fsPath) { return ''; }
    const ext = path.extname(fsPath).slice(1);
    if (ext) { return ext; }
    // Extension-less files: use the bare filename as the language identifier.
    return path.basename(fsPath).toLowerCase();
}

function toolConfidence(tool: string): 'high' | 'medium' | 'low' {
    if (tool === 'clangd' || tool === 'tsserver') { return 'high'; }
    if (tool === 'ctags' || tool === 'cscope')    { return 'medium'; }
    return 'low';
}

export function buildCallGraph(
    target: vscode.CallHierarchyItem,
    incoming: vscode.CallHierarchyIncomingCall[],
    outgoing: vscode.CallHierarchyOutgoingCall[],
    graphType: GraphType,
    depth: number,
    tool: string,
): GraphModel {
    const nodesMap = new Map<string, GraphNode>();
    const edgeSet  = new Set<string>();
    const edges: GraphEdge[] = [];

    function addNode(item: vscode.CallHierarchyItem, role: NodeRole): string {
        const id = itemId(item);
        if (!nodesMap.has(id)) {
            nodesMap.set(id, {
                id,
                label: itemLabel(item),
                fullName: itemFullName(item),
                filePath: item.uri?.fsPath,
                line: item.selectionRange?.start?.line ?? item.range?.start?.line,
                role,
                langId: itemLangId(item.uri?.fsPath),
            });
        } else {
            // G1: a node that appears as both caller and callee keeps its first role
            // but we must still emit the edge — the role field stays as-is because
            // there is only one role slot; callers of this function handle the edge.
        }
        return id;
    }

    function addEdge(sourceId: string, targetId: string): void {
        const key = `${sourceId}->${targetId}`;
        if (!edgeSet.has(key)) {
            edgeSet.add(key);
            edges.push({ sourceId, targetId });
        }
    }

    const targetId = addNode(target, 'target');

    for (const call of incoming) {
        const callerId = addNode(call.from, 'caller');
        addEdge(callerId, targetId);
    }

    for (const call of outgoing) {
        const calleeId = addNode(call.to, 'callee');
        addEdge(targetId, calleeId);
    }

    return {
        graphType,
        targetId,
        nodes: [...nodesMap.values()],
        edges,
        depth,
        tool,
        confidence: toolConfidence(tool),
    };
}
