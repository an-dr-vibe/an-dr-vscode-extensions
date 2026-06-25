import * as vscode from 'vscode';
import { GraphModel } from '../../shared/graph/GraphModel';

/** Return the primary workspace root path used for webview graph display. */
export function currentWorkspaceRoot(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/**
 * Attach the workspace root used by webview-only layout code.
 *
 * Analyzers stay focused on graph discovery. The UI boundary enriches the graph
 * so grouped layout can distinguish workspace-relative paths from external ones.
 */
export function withWorkspaceRoot(graph: GraphModel): GraphModel {
    const workspaceRoot = graph.workspaceRoot ?? currentWorkspaceRoot();
    return workspaceRoot ? { ...graph, workspaceRoot } : graph;
}
