import { resolveNodeDblClick } from '../../shared/protocol/nodeActions';

const GRAPH_TYPE = 'callGraph' as const;

describe('resolveNodeDblClick', () => {
    describe('reanalyzeTo cases', () => {
        it('returns reanalyzeTo for a non-target node with filePath and line', () => {
            const action = resolveNodeDblClick('nodeA', '/src/foo.cpp', 10, undefined, 'nodeTarget', GRAPH_TYPE, 2);
            expect(action.kind).toBe('reanalyzeTo');
            if (action.kind === 'reanalyzeTo') {
                expect(action.filePath).toBe('/src/foo.cpp');
                expect(action.line).toBe(10);
                expect(action.graphType).toBe(GRAPH_TYPE);
                expect(action.depth).toBe(2);
            }
        });

        it('uses line=0 when line is undefined (fileDeps nodes have no line)', () => {
            const action = resolveNodeDblClick('nodeA', '/src/foo.hpp', undefined, undefined, 'nodeTarget', 'fileDeps', 1);
            expect(action.kind).toBe('reanalyzeTo');
            if (action.kind === 'reanalyzeTo') {
                expect(action.line).toBe(0);
            }
        });

        it('uses line=0 when line is 0 (first line)', () => {
            const action = resolveNodeDblClick('nodeA', '/src/foo.cpp', 0, undefined, 'nodeTarget', GRAPH_TYPE, 1);
            expect(action.kind).toBe('reanalyzeTo');
            if (action.kind === 'reanalyzeTo') {
                expect(action.line).toBe(0);
            }
        });
    });

    describe('openFile cases', () => {
        it('returns openFile when node IS the target', () => {
            const action = resolveNodeDblClick('nodeTarget', '/src/foo.cpp', 5, undefined, 'nodeTarget', GRAPH_TYPE, 2);
            expect(action.kind).toBe('openFile');
        });

        it('returns openFile when filePath is undefined', () => {
            const action = resolveNodeDblClick('nodeA', undefined, 5, undefined, 'nodeTarget', GRAPH_TYPE, 2);
            expect(action.kind).toBe('openFile');
        });

        it('returns openFile when graphType is undefined (no graph loaded)', () => {
            const action = resolveNodeDblClick('nodeA', '/src/foo.cpp', 5, undefined, undefined, undefined, 2);
            expect(action.kind).toBe('openFile');
        });

        it('passes through nodeId, filePath, line for openFile', () => {
            const action = resolveNodeDblClick('nodeTarget', '/src/target.cpp', 7, undefined, 'nodeTarget', GRAPH_TYPE, 1);
            expect(action.kind).toBe('openFile');
            if (action.kind === 'openFile') {
                expect(action.nodeId).toBe('nodeTarget');
                expect(action.filePath).toBe('/src/target.cpp');
                expect(action.line).toBe(7);
            }
        });

        it('returns openFile when filePath is undefined even if non-target', () => {
            const action = resolveNodeDblClick('nodeA', undefined, undefined, undefined, 'nodeTarget', GRAPH_TYPE, 1);
            expect(action.kind).toBe('openFile');
            if (action.kind === 'openFile') {
                expect(action.nodeId).toBe('nodeA');
                expect(action.filePath).toBeUndefined();
                expect(action.line).toBeUndefined();
            }
        });
    });

    describe('SidepanelProvider reanalyzeTo handler', () => {
        it('BUG GUARD: reanalyzeTo must not be sent for the target node — would cause infinite re-analysis loop', () => {
            const targetId = '/src/Game.hpp:10:Game';
            const action = resolveNodeDblClick(targetId, '/src/Game.hpp', 10, undefined, targetId, GRAPH_TYPE, 2);
            expect(action.kind).toBe('openFile');
        });

        it('BUG GUARD: reanalyzeTo must not be sent when no graph is loaded', () => {
            const action = resolveNodeDblClick('nodeA', '/src/foo.cpp', 5, undefined, undefined, undefined, 1);
            expect(action.kind).toBe('openFile');
        });
    });
});
