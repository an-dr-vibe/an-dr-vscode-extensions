import { getConfig } from '../config';
import { DataSource } from '../dataSource';
import { CommitOrdering, GitCommit, GraphUncommittedChangesStyle } from '../types';
import { GitCommitData } from '../data-source/models';
import { UNCOMMITTED } from '../utils';
import { getHeadInfo } from './gitUtils';
import { esc, renderTagOverflowPill, renderTagPill } from './ui';

export const MINI_GRAPH_LIMIT = 10;
// Vertex radii are a fixed design constant in the tab too (GRAPH_VERTEX_RADIUS /
// GRAPH_CURRENT_VERTEX_RADIUS in web/aGraphModels.ts, not read from config there either) -
// kept as literals here for the same reason, deliberately matching those exact values.
const MINI_R = 4.4;
const MINI_R_HEAD = 4.9;
const COL_UNCOMMITTED = '#808080';

export interface MiniGraphData {
	commits: ReadonlyArray<GitCommit>;
	localBranch: string;
	upstreamRef: string | null;
	localSet: Set<string>;
	remoteSet: Set<string>;
	localHeadHash: string | null;
	remoteHeadHash: string | null;
	moreAvailable: boolean;
}

export async function fetchMiniGraph(api: any, dataSource: DataSource, repoPath: string, limit: number): Promise<MiniGraphData | null> {
	const head = getHeadInfo(api, repoPath);
	if (!head) return null;

	const localBranch = head.branchName;
	const upstreamRef = head.upstreamRef;
	const remote = head.upstreamRemote ?? 'origin';

	const branches = upstreamRef ? [localBranch, upstreamRef] : [localBranch];
	const data: GitCommitData | null = await dataSource.getCommits(
		repoPath, branches, limit,
		false, !!upstreamRef, false, true,
		CommitOrdering.Date, [remote], [], []
	).catch((): null => null);
	if (data === null || data.error !== null || data.commits.length === 0) return null;

	const commits = data.commits;
	const localHeadHash = commits.find((c: GitCommit) => c.heads.includes(localBranch))?.hash ?? null;
	const remoteHeadHash = upstreamRef
		? commits.find((c: GitCommit) => c.remotes.some((r) => r.name === upstreamRef))?.hash ?? null
		: null;

	const lookup = new Map<string, GitCommit>();
	for (const c of commits) lookup.set(c.hash, c);
	const buildSet = (startHash: string | null): Set<string> => {
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
	};
	return {
		commits, localBranch, upstreamRef,
		localSet: buildSet(localHeadHash), remoteSet: buildSet(remoteHeadHash),
		localHeadHash, remoteHeadHash, moreAvailable: data.moreCommitsAvailable
	};
}

export function renderMiniGraphInner(data: MiniGraphData): string {
	const { commits, localSet, remoteSet, localHeadHash, remoteHeadHash } = data;
	const config = getConfig();
	const showTags = config.graph.showTagsInActivityBar;
	// Same grid the tab's graph reads live from config (web/graph.ts's config.grid) -
	// sourced here instead of hardcoded, so a grid setting change is reflected identically
	// in both surfaces rather than only the tab honoring it.
	const grid = config.graph.grid;
	const n = commits.length;
	const colours = config.graph.colours;
	const COL_LOCAL = colours[0] ?? '#6ba2f2';
	const COL_REMOTE = colours[1] ?? '#ca3a7d';
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
	const laneColour = (l: Lane) => l === 'remote' ? COL_REMOTE : COL_LOCAL;

	// dataSource.getCommits() unshifts a synthetic UNCOMMITTED entry (hash '*') as commits[0]
	// whenever there are working tree changes - the exact same mechanism the tab's graph
	// consumes (web/graph.ts checks commits[0].hash === UNCOMMITTED). It flows through the
	// same lane/colour logic above unless special-cased, which rendered it as an ordinary
	// (wrongly) coloured commit dot with a garbled hash. Mirror the tab's Vertex/Branch
	// handling instead: grey, and whichever of the uncommitted row / real HEAD row gets the
	// "current" ring depends on the same GraphUncommittedChangesStyle setting the tab reads.
	const hasUncommittedRow = n > 0 && commits[0].hash === UNCOMMITTED;
	const uncommittedGetsCurrent = hasUncommittedRow && config.graph.uncommittedChanges === GraphUncommittedChangesStyle.OpenCircleAtTheUncommittedChanges;
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
		const colour = isUncommitted ? COL_UNCOMMITTED : laneColour(lanes[i]);
		// Dashed only in the "current ring stays on HEAD" style - matches Branch.drawPath's
		// stroke-dasharray rule for the non-committed line in that same style.
		const dashed = isUncommitted && !uncommittedGetsCurrent;
		const x1 = laneX(lanes[i]);
		const y1 = rowCY(i) + MINI_R;
		let d: string;
		if (parentIdx === undefined) {
			d = `M${x1},${y1.toFixed(1)}L${x1},${(y1 + grid.y * 0.6).toFixed(1)}`;
		} else {
			const x2 = laneX(lanes[parentIdx]);
			const y2 = rowCY(parentIdx) - MINI_R;
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
		const r = isCurrent ? MINI_R_HEAD : MINI_R;
		const colour = isUncommitted ? COL_UNCOMMITTED : laneColour(lanes[i]);
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
		const msg = esc(c.message.split('\n')[0].substring(0, 72));
		const abbrev = isUncommitted ? '' : c.hash.substring(0, 7);
		const isCurrent = isCurrentRow(i);
		const laneColor = isUncommitted ? COL_UNCOMMITTED : laneColour(lanes[i]);
		let tags = '';
		if (showTags && c.tags.length > 0) {
			const tagNames = c.tags.map((tag) => tag.name);
			tags = '<span class="miniCommitTags" style="--an-dr-commits-color:' + esc(laneColor) + '">' +
				renderTagPill(tagNames[0]) +
				(tagNames.length > 1 ? renderTagOverflowPill(tagNames.length - 1, 'Tags: ' + tagNames.join(', ')) : '') +
				'</span>';
		}
		const title = isUncommitted ? esc(c.message.split('\n')[0]) : esc(c.author + ': ' + c.message.split('\n')[0]);
		return `<div class="miniCommit${isCurrent ? ' miniCommitHead' : ''}" data-hash="${esc(c.hash)}" title="${title}">` +
			tags +
			`<span class="miniCommitMsg">${msg}</span>` +
			`<span class="miniCommitHash">${abbrev}</span></div>`;
	}).join('');

	return `<div id="miniGraph">${svg}<div id="miniGraphRows">${rows}</div></div>`;
}

export function renderMiniGraph(data: MiniGraphData | null): string {
	if (data === null || data.commits.length === 0) return '';
	return `<div id="activityGraph" data-more="${data.moreAvailable}">${renderMiniGraphInner(data)}</div>`;
}

