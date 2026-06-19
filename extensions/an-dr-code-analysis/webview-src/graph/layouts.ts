import cytoscape from 'cytoscape';

export type LayoutName = 'radial' | 'hierarchical' | 'force' | 'rose';

/** Returns Cytoscape layout options for the force layout (the only layout still delegated to Cytoscape). */
export function getLayout(_name: LayoutName, _nodeCount: number): cytoscape.LayoutOptions {
    return {
        name: 'cose',
        animate: false,
        padding: 30,
        nodeRepulsion: (node: cytoscape.NodeSingular) => {
            const bb = node.boundingBox({});
            const size = Math.max(bb.w, bb.h, 40);
            return size * size * 80;
        },
        nodeOverlap: 20,
        idealEdgeLength: (edge: cytoscape.EdgeSingular) => {
            const srcBb = edge.source().boundingBox({});
            const tgtBb = edge.target().boundingBox({});
            return (Math.max(srcBb.w, tgtBb.w, 40) / 2) + 80;
        },
        edgeElasticity: () => 100,
        gravity: 1,
        numIter: 2000,
        randomize: true,
    } as cytoscape.LayoutOptions;
}

export function layoutForGraphType(graphType: string, expanded: boolean): LayoutName {
    if (expanded) { return 'hierarchical'; }
    if (graphType === 'callGraph') { return 'radial'; }
    return 'force';
}
