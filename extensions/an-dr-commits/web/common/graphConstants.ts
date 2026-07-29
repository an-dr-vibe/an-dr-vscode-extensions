/**
 * Shared commit-graph constants. See ADR-003. Global scope, no imports/exports - same
 * concatenated-script model as the rest of web/.
 */

/**
 * Hash of the synthetic "uncommitted changes" row dataSource.getCommits() unshifts as commits[0]
 * whenever there are working tree changes - consumed identically by the tab's graph
 * (web/graph.ts) and the sidebar's mini graph (web/sidebar/miniGraph.ts).
 */
const UNCOMMITTED = '*';
