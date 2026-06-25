import { GraphType } from '../graph/GraphModel';

export type DblClickAction =
    | { kind: 'reanalyzeTo'; filePath: string; line: number; fullName?: string; graphType: GraphType; depth: number }
    | { kind: 'openFile';    nodeId: string;   filePath?: string; line?: number };

export function resolveNodeDblClick(
    nodeId: string,
    filePath: string | undefined,
    line: number | undefined,
    fullName: string | undefined,
    graphTargetId: string | undefined,
    graphType: GraphType | undefined,
    depth: number,
): DblClickAction {
    const isTarget = graphTargetId === nodeId;
    if (filePath && graphType && !isTarget) {
        return { kind: 'reanalyzeTo', filePath, line: line ?? 0, fullName, graphType, depth };
    }
    return { kind: 'openFile', nodeId, filePath, line };
}
