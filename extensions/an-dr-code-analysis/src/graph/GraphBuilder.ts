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

export function buildCallGraph(
    target: vscode.CallHierarchyItem,
    incoming: vscode.CallHierarchyIncomingCall[],
    outgoing: vscode.CallHierarchyOutgoingCall[],
    graphType: GraphType,
    depth: number,
    tool: string,
): GraphModel {
    const nodesMap = new Map<string, GraphNode>();
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
                langId: path.extname(item.uri?.fsPath ?? '').slice(1),
            });
        }
        return id;
    }

    const targetId = addNode(target, 'target');

    for (const call of incoming) {
        const callerId = addNode(call.from, 'caller');
        edges.push({ sourceId: callerId, targetId });
    }

    for (const call of outgoing) {
        const calleeId = addNode(call.to, 'callee');
        edges.push({ sourceId: targetId, targetId: calleeId });
    }

    return {
        graphType,
        targetId,
        nodes: [...nodesMap.values()],
        edges,
        depth,
        tool,
        confidence: 'high',
    };
}
