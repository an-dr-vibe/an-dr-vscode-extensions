function commitsSetCdvRowSplit(view: any) {
	const topRowElem = document.getElementById('cdvTopRow');
	if (!topRowElem) return;

	if (!view.diffPaneVisible) {
		topRowElem.style.height = '100%';
		return;
	}

	const contentElem = document.getElementById('cdvContent');
	const rowDividerElem = document.getElementById('cdvRowDivider');
	const diffPreviewElem = document.getElementById('cdvDiffPreview');
	if (!contentElem || !rowDividerElem || !diffPreviewElem) return;

	const ratio = view.gitRepos[view.currentRepo].cdvTopRowRatio;
	const totalH = contentElem.clientHeight;
	const topH = Math.round(totalH * ratio);
	topRowElem.style.height = topH + 'px';
	rowDividerElem.style.top = topH + 'px';
	diffPreviewElem.style.top = (topH + 6) + 'px';
}

function commitsShowDiffPane(view: any) {
	view.diffPaneVisible = true;
	const rowDividerElem = document.getElementById('cdvRowDivider');
	const diffPreviewElem = document.getElementById('cdvDiffPreview');
	if (rowDividerElem) rowDividerElem.style.display = 'block';
	if (diffPreviewElem) diffPreviewElem.style.display = 'block';
	view.setCdvRowSplit();
}

function commitsHideDiffPane(view: any) {
	view.diffPaneVisible = false;
	const topRowElem = document.getElementById('cdvTopRow');
	const rowDividerElem = document.getElementById('cdvRowDivider');
	const diffPreviewElem = document.getElementById('cdvDiffPreview');
	if (topRowElem) topRowElem.style.height = '100%';
	if (rowDividerElem) rowDividerElem.style.display = 'none';
	if (diffPreviewElem) diffPreviewElem.style.display = 'none';
}

function commitsRenderCdvDiffViewBtns(view: any) {
	const unifiedBtn = document.getElementById('cdvDiffViewUnified');
	const sbsBtn = document.getElementById('cdvDiffViewSideBySide');
	if (!unifiedBtn || !sbsBtn) return;
	if (view.fullDiffMode) {
		alterClass(unifiedBtn, CLASS_ACTIVE, false);
		alterClass(sbsBtn, CLASS_ACTIVE, false);
		alterClass(unifiedBtn, 'hidden', true);
		alterClass(sbsBtn, 'hidden', true);
		return;
	}
	alterClass(unifiedBtn, 'hidden', false);
	alterClass(sbsBtn, 'hidden', false);
	const isSbs = view.quickDiffViewMode === 'sideBySide';
	alterClass(unifiedBtn, CLASS_ACTIVE, !isSbs);
	alterClass(sbsBtn, CLASS_ACTIVE, isSbs);
}

function commitsChangeDiffViewMode(view: any, mode: 'unified' | 'sideBySide') {
	view.quickDiffViewMode = mode;
	view.renderCdvDiffViewBtns();
	if (view.currentDiffText !== null) {
		view.renderDiffPreview(view.currentDiffText);
	} else if (view.currentDiffRequest !== null) {
		sendMessage({
			command: 'getFileDiff',
			repo: view.currentRepo,
			fromHash: view.currentDiffRequest.fromHash,
			toHash: view.currentDiffRequest.toHash,
			oldFilePath: view.currentDiffRequest.oldFilePath,
			newFilePath: view.currentDiffRequest.newFilePath
		});
	}
}

function commitsRenderDiffPreview(view: any, diff: string | null) {
	view.currentDiffText = diff;

	if (view.fullDiffMode) {
		const filenameElem = document.getElementById('fullDiffFilename');
		if (filenameElem && view.currentDiffFilePath) {
			filenameElem.textContent = 'Contents of ' + view.currentDiffFilePath;
		}
		const contentElem = document.getElementById('fullDiffContent');
		if (!contentElem) return;
		if (diff === null) {
			contentElem.innerHTML = '<div class="cdvDiffMessage">Unable to load diff</div>';
		} else if (view.currentFullDiffData !== null) {
			view.renderFullDiffContent(view.currentFullDiffData);
			return;
		} else if (diff === '') {
			contentElem.innerHTML = '<div class="cdvDiffMessage">No changes</div>';
		} else {
			contentElem.innerHTML = '<div class="cdvDiffMessage">Select a file to view its contents</div>';
		}
		contentElem.scrollTop = 0;
		view.attachFullDiffHunkNav();
		return;
	}

	const previewElem = document.getElementById('cdvDiffPreview');
	if (!previewElem) return;
	if (diff === null) {
		previewElem.innerHTML = '<div class="cdvDiffMessage">Unable to load diff</div>';
	} else if (diff === '') {
		previewElem.innerHTML = '<div class="cdvDiffMessage">No changes</div>';
	} else if (view.quickDiffViewMode === 'sideBySide') {
		previewElem.innerHTML = commitsBuildSideBySideDiff(diff);
	} else {
		previewElem.innerHTML = commitsBuildUnifiedDiff(diff);
	}
	view.showDiffPane();
	previewElem.scrollTop = 0;
}

function commitsBuildUnifiedDiff(diff: string): string {
	const lines = diff.split('\n');
	let html = '<div class="diffUnifiedView">';
	for (const line of lines) {
		if (line.startsWith('+++ ') || line.startsWith('--- ')) {
			html += '<div class="diffFileHeader">' + escapeHtml(line) + '</div>';
		} else if (line.startsWith('@@')) {
			html += '<div class="diffHunk">' + escapeHtml(line) + '</div>';
		} else if (line.startsWith('+')) {
			html += '<div class="diffAdded">' + escapeHtml(line) + '</div>';
		} else if (line.startsWith('-')) {
			html += '<div class="diffRemoved">' + escapeHtml(line) + '</div>';
		} else if (line === '\\ No newline at end of file') {
			html += '<div class="diffNoNewline">' + escapeHtml(line) + '</div>';
		} else {
			html += '<div class="diffContext">' + escapeHtml(line) + '</div>';
		}
	}
	return html + '</div>';
}

function commitsBuildSideBySideDiff(diff: string): string {
	const lines = diff.split('\n');
	let html = '<table class="diffSideBySide"><tbody>';
	let removed: string[] = [], added: string[] = [];

	const flushPair = () => {
		const len = Math.max(removed.length, added.length);
		for (let i = 0; i < len; i++) {
			const l = i < removed.length ? '<td class="diffSbsLeft diffSbsRemoved"><span>' + escapeHtml(removed[i].slice(1)) + '</span></td>' : '<td class="diffSbsLeft"></td>';
			const r = i < added.length ? '<td class="diffSbsRight diffSbsAdded"><span>' + escapeHtml(added[i].slice(1)) + '</span></td>' : '<td class="diffSbsRight"></td>';
			html += '<tr>' + l + r + '</tr>';
		}
		removed = [];
		added = [];
	};

	for (const line of lines) {
		if (line.startsWith('--- ') || line.startsWith('+++ ')) {
			flushPair();
			html += '<tr><td colspan="2" class="diffFileHeader">' + escapeHtml(line) + '</td></tr>';
		} else if (line.startsWith('@@')) {
			flushPair();
			html += '<tr><td colspan="2" class="diffHunk">' + escapeHtml(line) + '</td></tr>';
		} else if (line.startsWith('+')) {
			added.push(line);
		} else if (line.startsWith('-')) {
			removed.push(line);
		} else {
			flushPair();
			const content = escapeHtml(line.startsWith(' ') ? line.slice(1) : line);
			html += '<tr><td class="diffSbsLeft diffContext"><span>' + content + '</span></td><td class="diffSbsRight diffContext"><span>' + content + '</span></td></tr>';
		}
	}
	flushPair();
	return html + '</tbody></table>';
}
