function graphBuildRebaseKindsMap(view: any): { [hash: string]: string } {
	const map: { [hash: string]: string } = {};
	if (view.repoInProgressState === null || view.repoInProgressState.type !== GG.GitRepoInProgressStateType.Rebase) return map;
	const states = typeof view.repoInProgressState.rebaseCommitStates === 'undefined' ? null : view.repoInProgressState.rebaseCommitStates;
	if (states === null) return map;
	for (let i = 0; i < states.length; i++) map[states[i].hash.toLowerCase()] = states[i].kind;
	return map;
}

function graphGetRebaseKindForCommit(hash: string, map: { [hash: string]: string }): string | null {
	if (hash === '' || hash === UNCOMMITTED) return null;
	const lower = hash.toLowerCase();
	if (typeof map[lower] !== 'undefined') return map[lower];
	for (const key in map) {
		if (lower.startsWith(key) || key.startsWith(lower)) return map[key];
	}
	return null;
}

function graphDrawRebaseGuide(view: any, group: SVGGElement) {
	const state = view.repoInProgressState;
	if (state === null || state.type !== GG.GitRepoInProgressStateType.Rebase) return;

	const context = typeof state.rebaseContext !== 'undefined' ? state.rebaseContext : null;
	if (context === null || context.onto === null) return;

	const commitStates = typeof state.rebaseCommitStates !== 'undefined' ? state.rebaseCommitStates : null;
	if (commitStates === null || commitStates.length === 0) return;

	const ontoIndex = graphFindCommitIndex(view, context.onto);
	if (ontoIndex < 0) return;

	const targetIndex = (view.commits.length > 0 && view.commits[0].hash === UNCOMMITTED) ? 0 : ontoIndex;
	let sourceIndex = -1;
	for (let i = 0; i < commitStates.length; i++) {
		if (commitStates[i].kind === 'in-progress') {
			sourceIndex = graphFindCommitIndexByHash(view, commitStates[i].hash);
			break;
		}
	}
	if (sourceIndex < 0) {
		for (let i = 0; i < commitStates.length; i++) {
			if (commitStates[i].kind === 'todo') {
				const idx = graphFindCommitIndexByHash(view, commitStates[i].hash);
				if (idx >= 0) {
					sourceIndex = idx;
					break;
				}
			}
		}
	}
	if (sourceIndex < 0 || sourceIndex === targetIndex) return;

	const source = graphGetVertexPixel(view, sourceIndex);
	const target = graphGetVertexPixel(view, targetIndex);
	if (source.x === target.x) return;

	const guideLaneX = graphFindFreeGuideLaneX(view, sourceIndex, targetIndex);
	const colour = view.config.colours[view.vertices[sourceIndex].getColour() % view.config.colours.length];
	const pathD = graphBuildRebaseGuidePath(view, source, target, guideLaneX);
	const path = group.appendChild(document.createElementNS(SVG_NAMESPACE, 'path'));
	path.setAttribute('class', 'rebaseGuide');
	path.setAttribute('d', pathD);
	path.setAttribute('stroke', colour);

	if (context.branch !== null) {
		const title = document.createElementNS(SVG_NAMESPACE, 'title');
		title.textContent = 'Rebasing ' + context.branch + ' onto ' + context.onto;
		path.appendChild(title);
	}
}

function graphFindCommitIndex(view: any, ref: string): number {
	for (let i = 0; i < view.commits.length; i++) {
		if (view.commits[i].heads.includes(ref) || view.commits[i].remotes.some((r: GG.GitCommitRemote) => r.name === ref || r.name.endsWith('/' + ref))) {
			return i;
		}
	}
	return /^[0-9a-f]{4,40}$/i.test(ref) ? graphFindCommitIndexByHash(view, ref) : -1;
}

function graphFindCommitIndexByHash(view: any, hash: string): number {
	const lower = hash.toLowerCase();
	for (let i = 0; i < view.commits.length; i++) {
		const h = view.commits[i].hash.toLowerCase();
		if (h === lower || h.startsWith(lower) || lower.startsWith(h)) return i;
	}
	return -1;
}

function graphGetVertexPixel(view: any, index: number): Pixel {
	const p = view.vertices[index].getPoint();
	return {
		x: p.x * view.config.grid.x + view.config.grid.offsetX,
		y: p.y * view.config.grid.y + view.config.grid.offsetY + (view.expandedCommitIndex > -1 && index > view.expandedCommitIndex ? view.config.grid.expandY : 0)
	};
}

function graphFindFreeGuideLaneX(view: any, sourceIndex: number, targetIndex: number): number {
	const minIdx = Math.min(sourceIndex, targetIndex);
	const maxIdx = Math.max(sourceIndex, targetIndex);
	let maxNextX = 0;
	for (let i = minIdx; i <= maxIdx; i++) {
		const nx = view.vertices[i].getNextX();
		if (nx > maxNextX) maxNextX = nx;
	}
	return maxNextX * view.config.grid.x + view.config.grid.offsetX;
}

function graphBuildRebaseGuidePath(view: any, source: Pixel, target: Pixel, guideLaneX: number): string {
	const gridY = view.config.grid.y;
	const d = gridY * (view.config.style === GG.GraphStyle.Angular ? 0.38 : 0.8);
	const dir = target.y > source.y ? 1 : -1;
	const absDist = Math.abs(target.y - source.y);
	let path = 'M' + source.x.toFixed(1) + ',' + source.y.toFixed(1);

	if (absDist < gridY * 2.5) {
		if (view.config.style === GG.GraphStyle.Angular) {
			const bendY = target.y - dir * d;
			if ((dir > 0 && bendY > source.y) || (dir < 0 && bendY < source.y)) path += 'L' + source.x.toFixed(1) + ',' + bendY.toFixed(1);
			path += 'L' + target.x.toFixed(1) + ',' + target.y.toFixed(1);
		} else {
			let transY = target.y - dir * gridY;
			if ((dir > 0 && transY < source.y) || (dir < 0 && transY > source.y)) transY = source.y;
			if (Math.abs(transY - source.y) > 0.5) path += 'L' + source.x.toFixed(1) + ',' + transY.toFixed(1);
			path += 'C' + source.x.toFixed(1) + ',' + (transY + dir * d).toFixed(1) + ' ' + target.x.toFixed(1) + ',' + (target.y - dir * d).toFixed(1) + ' ' + target.x.toFixed(1) + ',' + target.y.toFixed(1);
		}
		return path;
	}

	const seg1EndY = source.y + dir * gridY;
	const seg3StartY = target.y - dir * gridY;
	if (source.x === guideLaneX) {
		path += 'L' + guideLaneX.toFixed(1) + ',' + seg1EndY.toFixed(1);
	} else if (view.config.style === GG.GraphStyle.Angular) {
		path += 'L' + source.x.toFixed(1) + ',' + (source.y + dir * d).toFixed(1) + 'L' + guideLaneX.toFixed(1) + ',' + seg1EndY.toFixed(1);
	} else {
		path += 'C' + source.x.toFixed(1) + ',' + (source.y + dir * d).toFixed(1) + ' ' + guideLaneX.toFixed(1) + ',' + (seg1EndY - dir * d).toFixed(1) + ' ' + guideLaneX.toFixed(1) + ',' + seg1EndY.toFixed(1);
	}

	if (Math.abs(seg3StartY - seg1EndY) > 0.5) path += 'L' + guideLaneX.toFixed(1) + ',' + seg3StartY.toFixed(1);

	if (guideLaneX === target.x) {
		path += 'L' + target.x.toFixed(1) + ',' + target.y.toFixed(1);
	} else if (view.config.style === GG.GraphStyle.Angular) {
		path += 'L' + target.x.toFixed(1) + ',' + (target.y - dir * d).toFixed(1) + 'L' + target.x.toFixed(1) + ',' + target.y.toFixed(1);
	} else {
		path += 'C' + guideLaneX.toFixed(1) + ',' + (seg3StartY + dir * d).toFixed(1) + ' ' + target.x.toFixed(1) + ',' + (target.y - dir * d).toFixed(1) + ' ' + target.x.toFixed(1) + ',' + target.y.toFixed(1);
	}
	return path;
}
