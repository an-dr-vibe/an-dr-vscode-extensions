/**
 * Mini commit graph rendering - the client-side port of src/views/sidebar/miniGraph.ts's
 * renderMiniGraphInner/renderMiniGraph, plus the reachability-set computation that used to run
 * server-side inside fetchMiniGraph (buildSet) - moved here since Set<string> isn't
 * JSON-serializable and the computation itself is cheap pure data work (see ADR-003).
 */

const SIDEBAR_MINI_R = 4.4;
const SIDEBAR_MINI_R_HEAD = 4.9;
const SIDEBAR_COL_UNCOMMITTED = '#808080';

/**
 * Commits reachable from `startHash` by following every parent (not just first-parent) -
 * ported verbatim from miniGraph.ts's buildSet.
 * @param lookup Commits by hash.
 * @param startHash The commit to start from, or null for an empty set.
 * @returns The set of reachable commit hashes (including startHash itself).
 */
function sidebarBuildReachableSet(lookup: ReadonlyMap<string, GG.GitCommit>, startHash: string | null): Set<string> {
	const set = new Set<string>();
	if (!startHash) return set;
	const queue: string[] = [startHash];
	while (queue.length > 0) {
		const h = queue.shift() as string;
		if (set.has(h)) continue;
		set.add(h);
		const c = lookup.get(h);
		if (c) for (const p of c.parents) queue.push(p);
	}
	return set;
}

/**
 * Renders the SVG graph + commit rows for #miniGraph.
 * @param data The mini graph's raw ingredients (commits + local/remote head hashes).
 * @param graphConfig The subset of graph config the rendering needs.
 * @returns The #miniGraph inner HTML.
 */
function sidebarRenderMiniGraphInner(data: GG.SidebarMiniGraphInitialState, graphConfig: GG.SidebarGraphConfig): string {
	const { commits, localHeadHash, remoteHeadHash } = data;
	const lookup = new Map<string, GG.GitCommit>();
	for (const c of commits) lookup.set(c.hash, c);
	const localSet = sidebarBuildReachableSet(lookup, localHeadHash);
	const remoteSet = sidebarBuildReachableSet(lookup, remoteHeadHash);

	const showTags = graphConfig.showTags;
	const grid = graphConfig.grid;
	const n = commits.length;
	const colLocal = graphConfig.colours[0] ?? '#6ba2f2';
	const colRemote = graphConfig.colours[1] ?? '#ca3a7d';
	const curveD = grid.y * 0.8;

	type Lane = 'local' | 'remote' | 'shared';
	const lanes: Lane[] = commits.map((c) => {
		const inL = localSet.has(c.hash), inR = remoteSet.has(c.hash);
		return inL && inR ? 'shared' : inL ? 'local' : inR ? 'remote' : 'shared';
	});
	const hasRemote = lanes.some((l) => l === 'remote');
	const svgW = grid.offsetX * 2 + (hasRemote ? grid.x : 0);

	const laneX = (l: Lane) => l === 'remote' ? grid.offsetX + grid.x : grid.offsetX;
	const rowCY = (i: number) => i * grid.y + grid.offsetY;
	const laneColour = (l: Lane) => l === 'remote' ? colRemote : colLocal;

	// See ADR-002 / miniGraph.ts: the synthetic UNCOMMITTED row is mirrored to match the tab's
	// Vertex/Branch handling - grey, dashed unless the "current ring stays on the uncommitted
	// row" style is active.
	const hasUncommittedRow = n > 0 && commits[0].hash === UNCOMMITTED;
	const uncommittedGetsCurrent = hasUncommittedRow && graphConfig.uncommittedChangesStyle === GG.GraphUncommittedChangesStyle.OpenCircleAtTheUncommittedChanges;
	const isCurrentRow = (i: number): boolean => {
		if (commits[i].hash === UNCOMMITTED) return uncommittedGetsCurrent;
		if (uncommittedGetsCurrent) return false;
		return commits[i].hash === localHeadHash || commits[i].hash === remoteHeadHash;
	};

	const hashToIdx = new Map<string, number>();
	for (let i = 0; i < n; i++) hashToIdx.set(commits[i].hash, i);

	const shadows: string[] = [], lines: string[] = [];
	for (let i = 0; i < n; i++) {
		const parentHash = commits[i].parents[0];
		if (!parentHash) continue;
		const parentIdx = hashToIdx.get(parentHash);
		const isUncommitted = commits[i].hash === UNCOMMITTED;
		const colour = isUncommitted ? SIDEBAR_COL_UNCOMMITTED : laneColour(lanes[i]);
		const dashed = isUncommitted && !uncommittedGetsCurrent;
		const x1 = laneX(lanes[i]);
		const y1 = rowCY(i) + SIDEBAR_MINI_R;
		let d: string;
		if (parentIdx === undefined) {
			d = `M${x1},${y1.toFixed(1)}L${x1},${(y1 + grid.y * 0.6).toFixed(1)}`;
		} else {
			const x2 = laneX(lanes[parentIdx]);
			const y2 = rowCY(parentIdx) - SIDEBAR_MINI_R;
			d = x1 === x2
				? `M${x1},${y1.toFixed(1)}L${x2},${y2.toFixed(1)}`
				: `M${x1},${y1.toFixed(1)}C${x1},${(y1 + curveD).toFixed(1)} ${x2},${(y2 - curveD).toFixed(1)} ${x2},${y2.toFixed(1)}`;
		}
		shadows.push(`<path class="shadow" d="${d}"/>`);
		lines.push(`<path class="line" d="${d}" stroke="${colour}"${dashed ? ' stroke-dasharray="2"' : ''}/>`);
	}

	const circles: string[] = [];
	for (let i = 0; i < n; i++) {
		const isUncommitted = commits[i].hash === UNCOMMITTED;
		const isCurrent = isCurrentRow(i);
		const r = isCurrent ? SIDEBAR_MINI_R_HEAD : SIDEBAR_MINI_R;
		const colour = isUncommitted ? SIDEBAR_COL_UNCOMMITTED : laneColour(lanes[i]);
		const cx = laneX(lanes[i]);
		const cy = rowCY(i);
		circles.push(isCurrent
			? `<circle class="current" cx="${cx}" cy="${cy}" r="${r}" stroke="${colour}"/>`
			: `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colour}"/>`
		);
	}

	const svgH = n * grid.y;
	const svg = `<svg id="miniCommitGraph" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" style="flex:0 0 ${svgW}px;display:block;overflow:visible">` +
		shadows.join('') + lines.join('') + circles.join('') + `</svg>`;

	const rows = commits.map((c, i) => {
		const isUncommitted = c.hash === UNCOMMITTED;
		const msg = escapeHtml(c.message.split('\n')[0].substring(0, 72));
		const abbrev = isUncommitted ? '' : c.hash.substring(0, 7);
		const isCurrent = isCurrentRow(i);
		const laneColor = isUncommitted ? SIDEBAR_COL_UNCOMMITTED : laneColour(lanes[i]);
		let tags = '';
		if (showTags && c.tags.length > 0) {
			const tagNames = c.tags.map((tag) => tag.name);
			tags = '<span class="miniCommitTags" style="--an-dr-commits-color:' + escapeHtml(laneColor) + '">' +
				renderTagPill(tagNames[0]) +
				(tagNames.length > 1 ? renderTagOverflowPill(tagNames.length - 1, 'Tags: ' + tagNames.join(', ')) : '') +
				'</span>';
		}
		const title = isUncommitted ? escapeHtml(c.message.split('\n')[0]) : escapeHtml(c.author + ': ' + c.message.split('\n')[0]);
		return `<div class="miniCommit${isCurrent ? ' miniCommitHead' : ''}" data-hash="${escapeHtml(c.hash)}" title="${title}">` +
			tags +
			`<span class="miniCommitMsg">${msg}</span>` +
			`<span class="miniCommitHash">${abbrev}</span></div>`;
	}).join('');

	return `<div id="miniGraph">${svg}<div id="miniGraphRows">${rows}</div></div>`;
}
