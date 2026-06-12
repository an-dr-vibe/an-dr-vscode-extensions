import cytoscape from 'cytoscape';

export type LayoutName = 'radial' | 'hierarchical' | 'force';

export function getLayout(name: LayoutName, nodeCount: number): cytoscape.LayoutOptions {
    switch (name) {
        case 'radial':
            return {
                name: 'concentric',
                concentric: (node: cytoscape.NodeSingular) => node.data('role') === 'target' ? 10 : 1,
                levelWidth: () => 1,
                minNodeSpacing: 16,
                animate: false,
                padding: 16,
                spacingFactor: nodeCount > 8 ? 0.8 : 0.65,
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
                nodeRepulsion: () => 400000,
                nodeOverlap: 40,
                idealEdgeLength: () => 160,
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
