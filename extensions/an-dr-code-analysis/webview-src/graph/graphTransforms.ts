import { GraphEdge, GraphModel, GraphNode } from '../graph-renderers/types';

function normalizePath(path: string): string {
    return path.replace(/\\/g, '/');
}

export function isNodeFiltered(node: GraphNode, uncheckedPaths: ReadonlySet<string>): boolean {
    if (!node.filePath || node.role === 'target') { return false; }
    const norm = normalizePath(node.filePath);
    for (const p of uncheckedPaths) {
        const np = normalizePath(p);
        if (norm === np || norm.startsWith(np + '/')) { return true; }
    }
    return false;
}

export function applyFilter(graph: GraphModel, uncheckedPaths: ReadonlySet<string>): GraphModel {
    if (uncheckedPaths.size === 0) { return graph; }
    const visibleNodes = graph.nodes.filter(n => !isNodeFiltered(n, uncheckedPaths));
    const visibleIds = new Set(visibleNodes.map(n => n.id));
    const visibleEdges = graph.edges.filter(e => visibleIds.has(e.sourceId) && visibleIds.has(e.targetId));

    const connectedIds = new Set<string>();
    connectedIds.add(graph.targetId);
    for (const e of visibleEdges) {
        connectedIds.add(e.sourceId);
        connectedIds.add(e.targetId);
    }
    const finalNodes = visibleNodes.filter(n => connectedIds.has(n.id));
    return { ...graph, nodes: finalNodes, edges: visibleEdges };
}

export function foldCollapsedDirs(graph: GraphModel, collapsedDirs: ReadonlySet<string>): GraphModel {
    if (collapsedDirs.size === 0) { return graph; }

    const nodeToFolder = new Map<string, string>();
    for (const node of graph.nodes) {
        if (!node.filePath || node.role === 'target') { continue; }
        const fp = normalizePath(node.filePath);
        for (const dir of collapsedDirs) {
            const nd = normalizePath(dir);
            if (fp.startsWith(nd + '/') || fp === nd) {
                nodeToFolder.set(node.id, nd);
                break;
            }
        }
    }

    if (nodeToFolder.size === 0) { return graph; }

    const folderIds = new Set(nodeToFolder.values());
    const folderNodes = new Map<string, GraphNode>();
    for (const dirPath of folderIds) {
        const parts = dirPath.split('/');
        const label = parts[parts.length - 1] + '/';
        folderNodes.set(dirPath, {
            id: dirPath,
            label,
            fullName: dirPath,
            filePath: dirPath,
            role: 'folder',
        });
    }

    const keptNodes = graph.nodes.filter(node => !nodeToFolder.has(node.id));
    const edgeSet = new Set<string>();
    const newEdges: GraphEdge[] = [];
    const resolve = (id: string) => nodeToFolder.get(id) ?? id;

    for (const edge of graph.edges) {
        const src = resolve(edge.sourceId);
        const tgt = resolve(edge.targetId);
        if (src === tgt) { continue; }
        const key = `${src}->${tgt}`;
        if (!edgeSet.has(key)) {
            edgeSet.add(key);
            newEdges.push({ sourceId: src, targetId: tgt, isExternal: edge.isExternal });
        }
    }

    return {
        ...graph,
        nodes: [...keptNodes, ...folderNodes.values()],
        edges: newEdges,
    };
}

export function mergeCircularEdges(graph: GraphModel): GraphModel {
    const forward = new Set<string>();
    for (const e of graph.edges) { forward.add(`${e.sourceId}->${e.targetId}`); }

    const kept: GraphEdge[] = [];
    const seen = new Set<string>();
    for (const e of graph.edges) {
        const key  = `${e.sourceId}->${e.targetId}`;
        const back = `${e.targetId}->${e.sourceId}`;
        if (seen.has(key)) { continue; }
        if (forward.has(back)) {
            const [a, b] = e.sourceId < e.targetId
                ? [e.sourceId, e.targetId]
                : [e.targetId, e.sourceId];
            const mergedKey = `${a}->${b}`;
            if (!seen.has(mergedKey)) {
                seen.add(mergedKey);
                kept.push({ sourceId: a, targetId: b, isBidirectional: true });
            }
            seen.add(key);
            seen.add(back);
        } else {
            seen.add(key);
            kept.push(e);
        }
    }
    return { ...graph, edges: kept };
}
