// D3 is ESM-only; mock it so the layout engine runs in the CommonJS Jest env.
// tick() assigns a simple grid so position-based assertions still work.
jest.mock('d3', () => ({
    forceSimulation: (nodes: any[]) => {
        const sim = {
            force: function() { return sim; },
            stop:  function() { return sim; },
            tick:  function() {
                nodes.forEach((n: any, i: number) => {
                    if (n.x === undefined) { n.x = (i % 4) * 120; }
                    if (n.y === undefined) { n.y = Math.floor(i / 4) * 50; }
                });
                return sim;
            },
        };
        return sim;
    },
    forceLink:    () => ({ distance: () => ({ strength: () => ({}) }) }),
    forceManyBody: () => ({ strength: () => ({}) }),
    forceCenter:  () => ({}),
    forceCollide: () => ({ radius: () => ({}) }),
}));

import {
    commonPathPrefix,
    displayPathForGroup,
    buildGroupTree,
    buildFrameTree,
    computeGroupedLayout,
    GroupFrame,
} from '../../webview-src/graph-layouts/groupedLayout';
import { GraphModel, GraphNode, GraphEdge } from '../../webview-src/graph-renderers/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function node(id: string, filePath?: string): GraphNode {
    return { id, label: id, fullName: id, filePath, role: 'callee' };
}

function edge(sourceId: string, targetId: string): GraphEdge {
    return { sourceId, targetId };
}

function graph(nodes: GraphNode[], edges: GraphEdge[] = [], workspaceRoot?: string): GraphModel {
    return { graphType: 'callGraph', targetId: nodes[0]?.id ?? '', nodes, edges, workspaceRoot, depth: 2, tool: 'test', confidence: 'high' };
}

function frameById(frames: GroupFrame[], id: string): GroupFrame | undefined {
    return frames.find((f: GroupFrame) => f.id === id);
}

function asFrames(frames: GroupFrame[]): GroupFrame[] { return frames; }

// ── commonPathPrefix ──────────────────────────────────────────────────────────

describe('commonPathPrefix', () => {
    it('returns empty string for empty array', () => {
        expect(commonPathPrefix([])).toBe('');
    });

    it('returns directory of single path', () => {
        expect(commonPathPrefix(['/src/foo.ts'])).toBe('/src/');
    });

    it('returns shared directory prefix', () => {
        expect(commonPathPrefix(['/src/a/foo.ts', '/src/a/bar.ts'])).toBe('/src/a/');
    });

    it('returns empty when no common prefix beyond root', () => {
        expect(commonPathPrefix(['/a/foo.ts', '/b/bar.ts'])).toBe('/');
    });

    it('does not include partial segment matches', () => {
        // /src/foo vs /src2/bar — 'src' and 'src2' differ
        expect(commonPathPrefix(['/src/foo.ts', '/src2/bar.ts'])).toBe('/');
    });
});

// ── displayPathForGroup ─────────────────────────────────────────────────────

describe('displayPathForGroup', () => {
    it('keeps already-relative paths relative', () => {
        expect(displayPathForGroup('src/foo.ts', '/workspace/project')).toBe('src/foo.ts');
        expect(displayPathForGroup('./src/foo.ts', '/workspace/project')).toBe('src/foo.ts');
    });

    it('treats parent-relative paths as external', () => {
        expect(displayPathForGroup('../sdk/foo.ts', '/workspace/project')).toBe('external/parent/sdk/foo.ts');
    });

    it('makes in-workspace POSIX paths relative to workspace root', () => {
        expect(displayPathForGroup('/workspace/project/src/foo.ts', '/workspace/project')).toBe('src/foo.ts');
    });

    it('handles POSIX root workspaces', () => {
        expect(displayPathForGroup('/src/foo.ts', '/')).toBe('src/foo.ts');
    });

    it('does not treat sibling folders as inside the workspace', () => {
        expect(displayPathForGroup('/workspace/project-other/src/foo.ts', '/workspace/project')).toBe('external/workspace/project-other/src/foo.ts');
    });

    it('makes in-workspace Windows paths relative case-insensitively', () => {
        expect(displayPathForGroup('C:\\Repo\\src\\foo.ts', 'c:\\repo')).toBe('src/foo.ts');
    });

    it('handles Windows drive-root workspaces', () => {
        expect(displayPathForGroup('C:\\src\\foo.ts', 'c:\\')).toBe('src/foo.ts');
    });

    it('prefixes outside-workspace Windows paths with external', () => {
        expect(displayPathForGroup('D:\\SDK\\include\\foo.h', 'C:\\Repo')).toBe('external/D/SDK/include/foo.h');
    });
});

// ── buildGroupTree ────────────────────────────────────────────────────────────

describe('buildGroupTree', () => {
    it('returns empty root for graph with no file paths', () => {
        const { root } = buildGroupTree(graph([node('a'), node('b')]));
        expect(root.children.size).toBe(0);
    });

    it('groups two nodes in the same file under one tree entry', () => {
        const g = graph([node('f1', '/src/foo.ts'), node('f2', '/src/foo.ts')]);
        const { root } = buildGroupTree(g);
        // relative path after stripping /src/ → foo.ts
        expect(root.children.has('foo.ts')).toBe(true);
        const fileNode = root.children.get('foo.ts')!;
        expect(fileNode.type).toBe('file');
        if (fileNode.type === 'file') {
            expect(fileNode.nodeIds).toHaveLength(2);
            expect(fileNode.nodeIds).toContain('f1');
            expect(fileNode.nodeIds).toContain('f2');
        }
    });

    it('builds nested structure for nodes in different subdirs', () => {
        const g = graph([
            node('a', '/src/core/a.ts'),
            node('b', '/src/utils/b.ts'),
        ]);
        const { root } = buildGroupTree(g);
        // Common root: /src/ → root has 'core' and 'utils'
        expect(root.children.has('core')).toBe(true);
        expect(root.children.has('utils')).toBe(true);
    });

    it('normalises Windows backslash paths', () => {
        const g = graph([node('a', 'C:\\src\\foo.ts'), node('b', 'C:\\src\\bar.ts')]);
        const { root } = buildGroupTree(g);
        expect(root.children.size).toBe(2); // foo.ts and bar.ts
    });

    it('uses workspace root instead of stripping the first absolute segment', () => {
        const g = graph([
            node('a', '/workspace/project/src/core/a.ts'),
            node('b', '/workspace/project/tests/b.ts'),
        ], [], '/workspace/project');
        const { root } = buildGroupTree(g);
        expect(root.children.has('src')).toBe(true);
        expect(root.children.has('tests')).toBe(true);
        expect(root.children.has('workspace')).toBe(false);
        expect(root.children.has('project')).toBe(false);
    });

    it('groups outside-workspace files under external', () => {
        const g = graph([
            node('a', '/workspace/project/src/a.ts'),
            node('b', '/opt/sdk/lib/b.ts'),
        ], [], '/workspace/project');
        const { root } = buildGroupTree(g);
        expect(root.children.has('src')).toBe(true);
        expect(root.children.has('external')).toBe(true);
    });
});

// ── buildFrameTree (path compression) ────────────────────────────────────────

describe('buildFrameTree — path compression', () => {
    it('single file in a single directory → one file frame with compressed label', () => {
        const g = graph([node('fn', '/project/src/utils/helper.ts')]);
        const frames = buildFrameTree(g);
        expect(frames).toHaveLength(1);
        expect(frames[0].isFile).toBe(true);
        expect(frames[0].label).toContain('helper.ts');
        expect(frames[0].nodeIds).toContain('fn');
    });

    it('deep single-child chain is compressed into one frame', () => {
        // a/ → b/ → c/ → file.ts  (each dir has exactly one child)
        const g = graph([node('fn', '/root/a/b/c/file.ts')]);
        const frames = buildFrameTree(g);
        expect(frames).toHaveLength(1);
        expect(frames[0].label).toContain('a/b/c/file.ts');
    });

    it('compresses in-workspace absolute paths relative to workspace root', () => {
        const g = graph([node('fn', '/root/project/src/deep/file.ts')], [], '/root/project');
        const frames = buildFrameTree(g);
        expect(frames).toHaveLength(1);
        expect(frames[0].label).toBe('src/deep/file.ts');
    });

    it('two files in the same directory → dir frame + two file frames', () => {
        const g = graph([
            node('f1', '/root/src/foo.ts'),
            node('f2', '/root/src/bar.ts'),
        ]);
        const frames: GroupFrame[] = buildFrameTree(g);
        const dirFrame = frames.find((f: GroupFrame) => !f.isFile);
        expect(dirFrame).toBeDefined();
        const fileFrames = frames.filter((f: GroupFrame) => f.isFile);
        expect(fileFrames).toHaveLength(2);
        expect(dirFrame!.childFrameIds).toHaveLength(2);
    });

    it('single-child dir chain above a multi-child dir is compressed', () => {
        const g = graph([
            node('a', '/root/outer/inner/a.ts'),
            node('b', '/root/outer/inner/b.ts'),
        ]);
        const frames: GroupFrame[] = buildFrameTree(g);
        const dirFrame = frames.find((f: GroupFrame) => !f.isFile);
        expect(dirFrame).toBeDefined();
        expect(dirFrame!.label).toBe('outer/inner');
        expect(frames.filter((f: GroupFrame) => f.isFile)).toHaveLength(2);
    });

    it('partial compression: one branch compressed, other not', () => {
        const g = graph([
            node('fn',  '/src/deep/chain/file.ts'),
            node('ma',  '/src/multi/a.ts'),
            node('mb',  '/src/multi/b.ts'),
        ]);
        const frames: GroupFrame[] = buildFrameTree(g);
        const fileFrames = frames.filter((f: GroupFrame) => f.isFile);
        expect(fileFrames).toHaveLength(3);
        const compressed = fileFrames.find((f: GroupFrame) => f.label.includes('deep'));
        expect(compressed).toBeDefined();
        const multiDir = frames.find((f: GroupFrame) => !f.isFile && f.label.includes('multi'));
        expect(multiDir).toBeDefined();
        expect(multiDir!.childFrameIds).toHaveLength(2);
    });

    it('nodes without filePath are not included in any frame', () => {
        const g = graph([node('a', '/src/foo.ts'), node('b')]);
        const frames: GroupFrame[] = buildFrameTree(g);
        const allNodeIds = frames.flatMap((f: GroupFrame) => f.nodeIds);
        expect(allNodeIds).toContain('a');
        expect(allNodeIds).not.toContain('b');
    });

    it('parentId linkage is consistent', () => {
        const g = graph([node('a', '/root/dir/a.ts'), node('b', '/root/dir/b.ts')]);
        const frames: GroupFrame[] = buildFrameTree(g);
        const dir = frames.find((f: GroupFrame) => !f.isFile)!;
        const fileFrames = frames.filter((f: GroupFrame) => f.isFile);
        for (const ff of fileFrames) {
            expect(ff.parentId).toBe(dir.id);
        }
        expect(dir.parentId).toBeNull();
    });
});

// ── computeGroupedLayout ──────────────────────────────────────────────────────

describe('computeGroupedLayout', () => {
    it('returns a position for every node', () => {
        const g = graph([
            node('a', '/src/a.ts'),
            node('b', '/src/b.ts'),
            node('c'),   // no filePath
        ]);
        const layout = computeGroupedLayout(g);
        for (const n of g.nodes) {
            expect(layout.positions.has(n.id)).toBe(true);
        }
    });

    it('returns frameBounds for every frame', () => {
        const g = graph([node('a', '/root/src/foo.ts'), node('b', '/root/src/bar.ts')]);
        const layout = computeGroupedLayout(g);
        for (const f of layout.frames) {
            const bounds = layout.frameBounds.get(f.id);
            expect(bounds).toBeDefined();
            expect(bounds!.w).toBeGreaterThan(0);
            expect(bounds!.h).toBeGreaterThan(0);
        }
    });

    it('copies computed bounds onto each frame', () => {
        const g = graph([node('a', '/root/src/foo.ts'), node('b', '/root/src/bar.ts')]);
        const layout = computeGroupedLayout(g);
        for (const f of layout.frames) {
            expect(f.bounds).toEqual(layout.frameBounds.get(f.id));
        }
    });

    it('two nodes in same file are positioned close together (within frame)', () => {
        const g = graph([node('a', '/src/foo.ts'), node('b', '/src/foo.ts')]);
        const layout = computeGroupedLayout(g);
        const pa = layout.positions.get('a')!;
        const pb = layout.positions.get('b')!;
        const dist = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        // They share a frame so should be within a reasonable distance
        expect(dist).toBeLessThan(400);
    });
});
