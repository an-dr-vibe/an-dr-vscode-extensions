// BaseGraphRenderer imports grouped layout types through webview layout modules;
// mock D3 so the CommonJS Jest environment does not load D3's ESM bundle.
jest.mock('d3', () => ({
    forceSimulation: () => {
        const sim = {
            force: function() { return sim; },
            stop:  function() { return sim; },
            tick:  function() { return sim; },
        };
        return sim;
    },
    forceLink:     () => ({ distance: () => ({ strength: () => ({}) }) }),
    forceManyBody: () => ({ strength: () => ({}) }),
    forceCenter:   () => ({}),
    forceCollide:  () => ({ radius: () => ({}) }),
}));

import { BaseGraphRenderer, GroupedRenderState } from '../../webview-src/graph-renderers/BaseGraphRenderer';
import { GraphModel } from '../../webview-src/graph-renderers/types';
import { GroupFrame, GroupedLayout } from '../../webview-src/graph-layouts/groupedLayout';

class TestRenderer extends BaseGraphRenderer {
    public update(_graph: GraphModel): void {}
    public destroy(): void {}
    public selectNode(_nodeId: string): void {}
    public selectNodesForFile(_filePath: string): void {}
    protected _rerenderLastGraph(): void {}

    public setPositions(entries: [string, { x: number; y: number }][]): void {
        this._positions = new Map(entries);
    }

    public buildState(layout: GroupedLayout, dims: Map<string, { w: number; h: number }>): GroupedRenderState {
        return this._buildGroupedRenderState(layout, dims);
    }

    public refresh(dims: Map<string, { w: number; h: number }>, state: GroupedRenderState): string[] {
        return this._refreshDynamicFrameBounds(dims, state);
    }
}

function frame(id: string, nodeIds: string[], childFrameIds: string[] = []): GroupFrame {
    return {
        id,
        label: id,
        nodeIds,
        childFrameIds,
        parentId: null,
        isFile: childFrameIds.length === 0,
        bounds: { x: 0, y: 0, w: 300, h: 200 },
    };
}

describe('BaseGraphRenderer dynamic grouped frame bounds', () => {
    it('fits a file frame around its node with small margins', () => {
        const renderer = new TestRenderer();
        renderer.setPositions([['a', { x: 50, y: 40 }]]);
        const dims = new Map([['a', { w: 80, h: 28 }]]);
        const f = frame('src/a.ts', ['a']);
        const state = renderer.buildState({ positions: new Map(), frames: [f], frameBounds: new Map([[f.id, f.bounds]]) }, dims);

        expect(state.frameBounds.get(f.id)).toEqual({ x: 0, y: -4, w: 100, h: 66 });
    });

    it('refits a frame after a contained node moves', () => {
        const renderer = new TestRenderer();
        renderer.setPositions([['a', { x: 50, y: 40 }]]);
        const dims = new Map([['a', { w: 80, h: 28 }]]);
        const f = frame('src/a.ts', ['a']);
        const state = renderer.buildState({ positions: new Map(), frames: [f], frameBounds: new Map([[f.id, f.bounds]]) }, dims);

        renderer.setPositions([['a', { x: 120, y: 90 }]]);
        const changed = renderer.refresh(dims, state);

        expect(changed).toContain(f.id);
        expect(state.frameBounds.get(f.id)).toEqual({ x: 70, y: 46, w: 100, h: 66 });
    });
});
