function commitsRender(view: any) {
	view.renderTable();
	view.renderGraph();
}

function commitsRenderGraph(view: any) {
	if (typeof view.currentRepo === 'undefined') return;

	const colHeadersElem = document.getElementById('tableColHeaders');
	const cdvHeight = view.gitRepos[view.currentRepo].cdvHeight;
	const headerHeight = colHeadersElem !== null ? colHeadersElem.clientHeight + 1 : 0;
	const expandedCommit = view.isCdvDocked() ? null : view.expandedCommit;
	const expandedCommitElem = expandedCommit !== null ? document.getElementById('cdv') : null;

	view.config.graph.grid.expandY = expandedCommitElem !== null
		? expandedCommitElem.getBoundingClientRect().height
		: cdvHeight;
	view.config.graph.grid.y = view.commits.length > 0 && view.tableElem.children.length > 0
		? (view.tableElem.children[0].clientHeight - headerHeight - (expandedCommit !== null ? cdvHeight : 0)) / view.commits.length
		: view.config.graph.grid.y;
	view.config.graph.grid.offsetY = headerHeight + view.config.graph.grid.y / 2;

	view.graph.setRemoteHeadTargets(view.gitRemoteHeadTargets);
	view.graph.setRepoInProgressState(view.gitRepoInProgressState);
	view.graph.render(expandedCommit);
}

function commitsGetRemoteDefaultCloudHtml(_view: any, title: string) {
	return '<span class="gitRefCloud" title="' + escapeHtml(title) + '">' + SVG_ICONS.target + '</span>';
}

function commitsGetHeadRemoteSuffixHtml(view: any, remoteName: string, remoteRefName: string, isRemoteDefault: boolean, isGoneUpstream: boolean) {
	const cloud = isRemoteDefault ? commitsGetRemoteDefaultCloudHtml(view, remoteName + '/HEAD -> ' + remoteRefName) : '';
	return '<span class="gitRefHeadRemote' + (isRemoteDefault ? ' default' : '') + (isGoneUpstream ? ' gone' : '') + '" data-remote="' + escapeHtml(remoteName) + '" data-fullref="' + escapeHtml(remoteRefName) + '">' + cloud + '<span class="gitRefHeadRemoteName">' + escapeHtml(remoteName) + '</span></span>';
}

function commitsRenderRefBadgeGroup(_view: any, badges: CommitRefBadge[]) {
	return badges.map((badge) => badge.html).join('');
}

function commitsGetElemOuterWidth(_view: any, elem: HTMLElement) {
	const style = getComputedStyle(elem);
	return elem.getBoundingClientRect().width
		+ (parseFloat(style.marginLeft) || 0)
		+ (parseFloat(style.marginRight) || 0);
}

function commitsGetBadgesTotalWidth(view: any, badges: ReadonlyArray<HTMLElement>) {
	let width = 0;
	for (let i = 0; i < badges.length; i++) {
		width += commitsGetElemOuterWidth(view, badges[i]);
	}
	return width;
}

function commitsGetAvailableRefBadgeWidth(view: any, commitElem: HTMLElement) {
	if (view.config.referenceLabels.branchLabelsAlignedToGraph) {
		const refCell = commitElem.children.length > 0 ? <HTMLElement>commitElem.children[0] : null;
		return refCell !== null ? Math.max(0, refCell.clientWidth - 4) : 0;
	}
	const descriptionElem = commitElem.querySelector('.description') as HTMLElement | null;
	if (descriptionElem === null) return 0;
	return Math.max(0, descriptionElem.clientWidth - 72);
}

function commitsCollapseReferenceBadgesToFit(view: any) {
	const commitElems = getCommitElems();
	for (let i = 0; i < commitElems.length; i++) {
		const badges = <HTMLElement[]>Array.from(commitElems[i].querySelectorAll('.gitRef'));
		if (badges.length < 2) continue;
		for (let j = 0; j < badges.length; j++) badges[j].classList.remove('compact');
		const maxWidth = commitsGetAvailableRefBadgeWidth(view, commitElems[i]);
		if (maxWidth <= 0) {
			for (let j = 0; j < badges.length; j++) badges[j].classList.add('compact');
			continue;
		}
		let width = commitsGetBadgesTotalWidth(view, badges);
		for (let j = badges.length - 1; j >= 0 && width > maxWidth; j--) {
			badges[j].classList.add('compact');
			width = commitsGetBadgesTotalWidth(view, badges);
		}
	}
}

function commitsRenderTableHeader(view: any): string {
	const colVisibility = view.getColumnVisibility();
	return '<tr id="tableColHeaders"><th id="tableHeaderGraphCol" class="tableColHeader" data-col="0">Graph</th><th class="tableColHeader" data-col="1">Description</th>' +
		(colVisibility.committed ? '<th class="tableColHeader committedCol" data-col="2">Committed</th>' : '') +
		(colVisibility.id ? '<th class="tableColHeader" data-col="3">ID</th>' : '') +
		'</tr>';
}

function commitsRenderCommitRow(view: any, commit: GG.GitCommit, i: number, textFormatter: any, currentHash: string | null, mutedCommits: boolean[], vertexColours: string[], widthsAtVertices: number[], selectedTags: Set<string>): string {
	const colVisibility = view.getColumnVisibility();
	let message = view.getRebaseSequenceBadgeHtml(commit.hash) + '<span class="text">' + textFormatter.format(commit.message) + '</span>';
	let branchLabels = getBranchLabels(commit.heads, commit.remotes, view.gitRemoteHeadTargets);
	let branchBadges: CommitRefBadge[] = [], tagBadges: CommitRefBadge[] = [], j, k, refName, refActive, refHtml;

	for (j = 0; j < branchLabels.heads.length; j++) {
		const headName = branchLabels.heads[j].name;
		refName = escapeHtml(headName);
		refActive = headName === view.gitBranchHead;
		const headIcon = refActive ? SVG_ICONS.target : SVG_ICONS.branch;
		refHtml = '<span class="gitRef head' + (refActive ? ' active' : '') + '" data-name="' + refName + '" data-drag-ref-type="branch" data-drag-ref-name="' + refName + '" draggable="true" title="Branch: ' + refName + '">' + headIcon + '<span class="gitRefName" data-fullref="' + refName + '">' + refName + '</span>';
		for (k = 0; k < branchLabels.heads[j].remotes.length; k++) {
			const remoteName = branchLabels.heads[j].remotes[k];
			const remoteRefName = remoteName + '/' + headName;
			refHtml += view.getHeadRemoteSuffixHtml(remoteName, remoteRefName, view.gitRemoteHeadTargets[remoteName] === remoteRefName, view.gitGoneUpstreamBranches.includes(headName));
		}
		refHtml += '</span>';
		if (refActive) branchBadges.unshift({ type: 'head', html: refHtml });
		else branchBadges.push({ type: 'head', html: refHtml });
	}
	for (j = 0; j < branchLabels.remotes.length; j++) {
		const remoteName = branchLabels.remotes[j].name;
		refName = escapeHtml(remoteName);
		const remoteRoot = branchLabels.remotes[j].remote;
		const isRemoteDefault = remoteRoot !== null && view.gitRemoteHeadTargets[remoteRoot] === remoteName;
		branchBadges.push({ type: 'remote', html: '<span class="gitRef remote' + (isRemoteDefault ? ' default' : '') + '" data-name="' + refName + '" data-remote="' + (remoteRoot !== null ? escapeHtml(remoteRoot) : '') + '" title="Remote Branch: ' + refName + '">' + SVG_ICONS.cloud + '<span class="gitRefName" data-fullref="' + refName + '">' + refName + '</span></span>' });
	}
	for (j = 0; j < commit.tags.length; j++) {
		if (selectedTags.size > 0 && !selectedTags.has(commit.tags[j].name)) continue;
		refName = escapeHtml(commit.tags[j].name);
		tagBadges.push({ type: 'tag', html: '<span class="gitRef tag" data-name="' + refName + '" data-tagtype="' + (commit.tags[j].annotated ? 'annotated' : 'lightweight') + '" data-drag-ref-type="tag" data-drag-ref-name="' + refName + '" draggable="true" title="Tag: ' + refName + '">' + SVG_ICONS.tag + '<span class="gitRefName" data-fullref="' + refName + '">' + refName + '</span></span>' });
	}
	if (commit.stash !== null) {
		refName = escapeHtml(commit.stash.selector);
		branchBadges.unshift({ type: 'stash', html: '<span class="gitRef stash" data-name="' + refName + '" title="Stash: ' + escapeHtml(commit.stash.selector.substring(5)) + '">' + SVG_ICONS.stash + '<span class="gitRefName" data-fullref="' + refName + '">' + escapeHtml(commit.stash.selector.substring(5)) + '</span></span>' });
	}
	const refBranches = view.renderRefBadgeGroup(branchBadges);
	const refTags = view.renderRefBadgeGroup(tagBadges);
	return '<tr class="commit' + (commit.hash === currentHash ? ' current' : '') + (mutedCommits[i] ? ' mute' : '') + '"' + (commit.hash !== UNCOMMITTED ? '' : ' id="uncommittedChanges"') + ' data-id="' + i + '" data-color="' + vertexColours[i] + '">' +
		(view.config.referenceLabels.branchLabelsAlignedToGraph ? '<td>' + (refBranches !== '' ? '<span style="margin-left:' + (widthsAtVertices[i] - 4) + 'px"' + refBranches.substring(5) : '') + '</td><td><span class="description">' : '<td></td><td><span class="description">' + refBranches) + (view.config.referenceLabels.tagLabelsOnRight ? message + refTags : refTags + message) + '</span></td>' +
		(colVisibility.committed ? view.getCommittedCellHtml(commit) : '') +
		(colVisibility.id ? '<td class="text" title="' + escapeHtml(commit.hash) + '">' + abbrevCommit(commit.hash) + '</td>' : '') +
		'</tr>';
}

function commitsRenderTable(view: any) {
	const currentHash = view.commits.length > 0 && view.commits[0].hash === UNCOMMITTED ? UNCOMMITTED : view.commitHead;
	const vertexColours = view.graph.getVertexColours();
	const widthsAtVertices = view.config.referenceLabels.branchLabelsAlignedToGraph ? view.graph.getWidthsAtVertices() : [];
	const mutedCommits = view.graph.getMutedCommits(currentHash);
	const textFormatter = new TextFormatter(view.commits, view.gitRepos[view.currentRepo].issueLinkingConfig, { emoji: true, issueLinking: true, markdown: view.config.markdown });
	const selectedTags = new Set<string>(view.currentTags);

	let html = commitsRenderTableHeader(view);
	for (let i = 0; i < view.commits.length; i++) {
		html += commitsRenderCommitRow(view, view.commits[i], i, textFormatter, currentHash, mutedCommits, vertexColours, widthsAtVertices, selectedTags);
	}
	view.tableElem.innerHTML = '<table>' + html + '</table>';
	if (view.commits.length > 0 && view.commits[0].hash === UNCOMMITTED) view.renderUncommittedChanges();
	view.footerElem.innerHTML = view.moreCommitsAvailable ? '<div id="loadMoreCommitsBtn" class="roundedBtn">Load More Commits</div>' : '';
	view.makeTableResizable();
	view.updateCommittedColumnDisplayMode();
	view.collapseReferenceBadgesToFit();
	view.findWidget.refresh();
	view.renderedGitBranchHead = view.gitBranchHead;

	if (view.moreCommitsAvailable) {
		document.getElementById('loadMoreCommitsBtn')!.addEventListener('click', () => view.loadMoreCommits());
	}
	if (view.expandedCommit !== null) {
		commitsRenderTableRestoreExpandedCommit(view);
	}
}

function commitsRenderTableRestoreExpandedCommit(view: any) {
	const expandedCommit = view.expandedCommit, elems = getCommitElems();
	const commitElem = findCommitElemWithId(elems, view.getCommitId(expandedCommit.commitHash));
	const compareWithElem = expandedCommit.compareWithHash !== null ? findCommitElemWithId(elems, view.getCommitId(expandedCommit.compareWithHash)) : null;

	if (commitElem === null || (expandedCommit.compareWithHash !== null && compareWithElem === null)) {
		view.closeCommitDetails(false);
		view.saveState();
		return;
	}

	expandedCommit.index = parseInt(commitElem.dataset.id!);
	expandedCommit.commitElem = commitElem;
	expandedCommit.compareWithElem = compareWithElem;
	view.saveState();

	if (expandedCommit.compareWithHash === null) {
		if (!expandedCommit.loading && expandedCommit.commitDetails !== null && expandedCommit.fileTree !== null) {
			view.showCommitDetails(expandedCommit.commitDetails, expandedCommit.fileTree, expandedCommit.avatar, expandedCommit.lastViewedFile, true);
			if (expandedCommit.commitHash === UNCOMMITTED) view.requestCommitDetails(expandedCommit.commitHash, true);
		} else {
			view.loadCommitDetails(commitElem);
		}
	} else {
		if (!expandedCommit.loading && expandedCommit.fileChanges !== null && expandedCommit.fileTree !== null) {
			view.showCommitComparison(expandedCommit.commitHash, expandedCommit.compareWithHash, expandedCommit.fileChanges, expandedCommit.fileTree, expandedCommit.lastViewedFile, true);
			if (expandedCommit.commitHash === UNCOMMITTED || expandedCommit.compareWithHash === UNCOMMITTED) {
				view.requestCommitComparison(expandedCommit.commitHash, expandedCommit.compareWithHash, true);
			}
		} else {
			view.loadCommitComparison(commitElem, compareWithElem!);
		}
	}
}

function commitsRenderUncommittedChanges(view: any) {
	const colVisibility = view.getColumnVisibility(), date = formatShortDate(view.commits[0].date);
	const dateParts = view.getCommittedDateParts(date.formatted);
	document.getElementById('uncommittedChanges')!.innerHTML = '<td></td><td><b>' + escapeHtml(view.commits[0].message) + '</b><span class="uncommittedHint"> · Double-click to commit</span></td>' +
		(colVisibility.committed ? '<td class="committedCol text" title="' + escapeHtml(date.title) + '"><span class="committedMeta"><span class="committedDate">' + escapeHtml(dateParts.date) + '</span>' + (dateParts.time !== null ? '<span class="committedTime">' + escapeHtml(dateParts.time) + '</span>' : '') + '</span></td>' : '') +
		(colVisibility.id ? '<td class="text" title="*">*</td>' : '');
}
