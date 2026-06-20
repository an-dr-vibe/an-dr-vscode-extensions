import * as vscode from 'vscode';
import * as path from 'path';
import { GraphModel, GraphNode, GraphEdge, GraphType, NodeRole } from './GraphModel';

/** A directed call edge with both endpoints resolved to concrete items. */
export interface CallEdge {
    from: vscode.CallHierarchyItem;
    to:   vscode.CallHierarchyItem;
}

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

/**
 * Builds a GraphModel from a set of resolved call edges.
 *
 * Each `CallEdge` carries both endpoints, so depth-2+ edges correctly connect
 * intermediate nodes rather than collapsing onto the target.
 * Node role is assigned on first insertion; the target always wins 'target'.
 */
export function buildCallGraph(
    target:    vscode.CallHierarchyItem,
    callEdges: CallEdge[],
    graphType: GraphType,
    depth:     number,
    tool:      string,
): GraphModel {
    const nodesMap = new Map<string, GraphNode>();
    const edgeSet  = new Set<string>();
    const edges: GraphEdge[] = [];

    function addNode(item: vscode.CallHierarchyItem, role: NodeRole): string {
        const id = itemId(item);
        if (!nodesMap.has(id)) {
            nodesMap.set(id, {
                id,
                label:    itemLabel(item),
                fullName: itemFullName(item),
                filePath: item.uri?.fsPath,
                line:     item.selectionRange?.start?.line ?? item.range?.start?.line,
                role,
                langId:   itemLangId(item.uri?.fsPath),
            });
        }
        // G1: first role wins — a node that appears as both caller and callee keeps its
        // initial role; but the edge is still emitted by the caller of this function.
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

    for (const { from, to } of callEdges) {
        const fromId = addNode(from, 'caller');
        const toId   = addNode(to,   'callee');
        addEdge(fromId, toId);
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
