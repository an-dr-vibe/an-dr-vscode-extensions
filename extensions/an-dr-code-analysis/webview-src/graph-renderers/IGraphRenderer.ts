import { GraphModel, LayoutName } from './types';

/**
 * Renderer-agnostic contract for graph visualisation.
 * Implementations may use Cytoscape, D3, Canvas, SVG, etc.
 * Layout computation is resolved by webview graph layout strategies;
 * concrete renderers draw and handle user interaction.
 */
export interface GraphRenderer {
    /** Full or incremental render. First call initialises; subsequent calls patch in-place. */
    update(graph: GraphModel): void;

    /** Tear down all DOM state. Must be called before wiping the container from the DOM. */
    destroy(): void;

    /** Switch to the named layout and immediately re-render the current graph. */
    applyLayout(name: LayoutName): void;

    /** Centre the viewport on the given node and select it. */
    selectNode(nodeId: string): void;

    /** Highlight all nodes whose filePath matches and dim the rest. */
    selectNodesForFile(filePath: string): void;
}
