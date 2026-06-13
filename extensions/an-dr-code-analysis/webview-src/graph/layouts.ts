import cytoscape from 'cytoscape';

export type LayoutName = 'radial' | 'hierarchical' | 'force';

export function getLayout(name: LayoutName, nodeCount: number): cytoscape.LayoutOptions {
    switch (name) {
        case 'radial':
            return {
                name: 'concentric',
                concentric: (node: cytoscape.NodeSingular) => {
                    const role = node.data('role');
                    if (role === 'target')   { return 30; }
                    if (role === 'caller')   { return 20; }
                    if (role === 'callee')   { return 10; }
                    return 5; // external / folder
                },
                // Group all nodes of the same role onto one ring (width covers full range per role)
                levelWidth: () => 5,
                minNodeSpacing: 40,
                equidistant: false,
                animate: false,
                padding: 24,
                startAngle: 3 * Math.PI / 2,  // start from top
            } as cytoscape.LayoutOptions;

        case 'hierarchical':
            return {
                name: 'breadthfirst',
                directed: true,
                padding: 20,
                spacingFactor: nodeCount > 10 ? 1.2 : 1.6,
                animate: false,
            } as cytoscape.LayoutOptions;

        case 'force':
        default:
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
}

export function layoutForGraphType(graphType: string, expanded: boolean): LayoutName {
    if (expanded) { return 'hierarchical'; }
    if (graphType === 'callGraph') { return 'radial'; }
    return 'force';
}
