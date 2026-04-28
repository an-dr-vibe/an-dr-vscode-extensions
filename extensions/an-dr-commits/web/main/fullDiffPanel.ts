function commitsRenderFullDiffContent(view: any, data: { diff: string | null; oldContent: string | null; newContent: string | null; oldExists: boolean; newExists: boolean } | null) {
	view.currentDiffText = data !== null ? data.diff : null;
	view.currentFullDiffData = data;
	const contentElem = document.getElementById('fullDiffContent');
	const filenameElem = document.getElementById('fullDiffFilename');
	if (!contentElem) return;

	// Update filename display
	if (filenameElem && view.currentDiffRequest) {
		const filePath = view.currentDiffRequest.newFilePath || view.currentDiffRequest.oldFilePath;
		filenameElem.textContent = filePath;
	}

	if (data === null || data.diff === null) {
		contentElem.innerHTML = '<div class="commitDetailsViewDiffMessage">Unable to load file contents</div>';
		view.attachFullDiffHunkNav();
		return;
	}

	const oldLines = commitsGetDisplayLines(data.oldExists ? data.oldContent : null);
	const newLines = commitsGetDisplayLines(data.newExists ? data.newContent : null);
	const hunks = commitsParseUnifiedDiffHunks(data.diff);
	const isSbs = view.fullDiffViewMode === 'sideBySide';
	contentElem.innerHTML = isSbs
		? commitsBuildFullSideBySideFileView(view, oldLines, newLines, hunks)
		: commitsBuildFullUnifiedFileView(view, oldLines, newLines, hunks);
	alterClass(contentElem, 'diffSbsMode', isSbs);
	contentElem.scrollTop = 0;
	if (isSbs) {
		const oldPane = contentElem.querySelector('.diffSbsPaneOld') as HTMLElement | null;
		const newPane = contentElem.querySelector('.diffSbsPaneNew') as HTMLElement | null;
		if (oldPane && newPane) {
			let syncing = false;
			oldPane.addEventListener('scroll', () => { if (!syncing) { syncing = true; newPane.scrollTop = oldPane.scrollTop; syncing = false; } });
			newPane.addEventListener('scroll', () => { if (!syncing) { syncing = true; oldPane.scrollTop = newPane.scrollTop; syncing = false; } });
		}
	}
	view.attachFullDiffHunkNav();
}

function commitsGetDisplayLines(content: string | null): string[] {
	if (content === null) return [];
	const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	if (normalized === '') return [];
	const lines = normalized.split('\n');
	if (lines[lines.length - 1] === '') lines.pop();
	return lines;
}

function commitsParseUnifiedDiffHunks(diff: string): { oldStart: number; newStart: number; lines: string[] }[] {
	const lines = diff.split('\n');
	const hunks: { oldStart: number; newStart: number; lines: string[] }[] = [];
	let current: { oldStart: number; newStart: number; lines: string[] } | null = null;
	for (const line of lines) {
		const match = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
		if (match) {
			current = { oldStart: parseInt(match[1]), newStart: parseInt(match[2]), lines: [] };
			hunks.push(current);
			continue;
		}
		if (current !== null && (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-') || line === '\\ No newline at end of file')) {
			current.lines.push(line);
		}
	}
	return hunks;
}


function commitsBuildFullUnifiedFileView(view: any, oldLines: string[], newLines: string[], hunks: { oldStart: number; newStart: number; lines: string[] }[]): string {
	type FullUnifiedRow = { kind: 'context' | 'removed' | 'added'; oldNum: string; newNum: string; content: string; changed: boolean };
	const rows: FullUnifiedRow[] = [];
	let oldIndex = 1, newIndex = 1;
	let oldPos = 0, newPos = 0;
	const pushContextUntil = (targetOld: number, targetNew: number) => {
		while (oldIndex < targetOld && newIndex < targetNew && oldPos < oldLines.length && newPos < newLines.length) {
			rows.push({ kind: 'context', oldNum: String(oldIndex++), newNum: String(newIndex++), content: newLines[newPos++], changed: false });
			oldPos++;
		}
	};

	for (const hunk of hunks) {
		pushContextUntil(hunk.oldStart, hunk.newStart);
		for (const line of hunk.lines) {
			if (line === '\\ No newline at end of file') continue;
			if (line.startsWith(' ')) {
				rows.push({ kind: 'context', oldNum: String(oldIndex++), newNum: String(newIndex++), content: newLines[newPos++], changed: false });
				oldPos++;
			} else if (line.startsWith('-')) {
				rows.push({ kind: 'removed', oldNum: String(oldIndex++), newNum: '', content: oldLines[oldPos++] ?? line.slice(1), changed: true });
			} else if (line.startsWith('+')) {
				rows.push({ kind: 'added', oldNum: '', newNum: String(newIndex++), content: newLines[newPos++] ?? line.slice(1), changed: true });
			}
		}
	}
	while (oldPos < oldLines.length && newPos < newLines.length) {
		rows.push({ kind: 'context', oldNum: String(oldIndex++), newNum: String(newIndex++), content: newLines[newPos++], changed: false });
		oldPos++;
	}
	while (oldPos < oldLines.length) rows.push({ kind: 'removed', oldNum: String(oldIndex++), newNum: '', content: oldLines[oldPos++], changed: true });
	while (newPos < newLines.length) rows.push({ kind: 'added', oldNum: '', newNum: String(newIndex++), content: newLines[newPos++], changed: true });

	let html = '<div class="diffFullView">';
	for (const row of commitsCompactFullDiffUnifiedRows(view, rows)) {
		if ('spacer' in row) {
			html += '<div class="diffRow diffCompactSpacer"><span class="diffLnOld"></span><span class="diffLnNew"></span><span class="diffLnSep"></span><span class="diffRowContent">' + escapeHtml(row.spacer) + '</span></div>';
			continue;
		}
		const classes = row.changed ? 'diffRow fullDiffChanged fullDiffChangedNav diff' + row.kind.charAt(0).toUpperCase() + row.kind.slice(1) : 'diffRow diffContext';
		html += '<div class="' + classes + '"><span class="diffLnOld">' + row.oldNum + '</span><span class="diffLnNew">' + row.newNum + '</span><span class="diffLnSep">│</span><span class="diffRowContent">' + escapeHtml(row.content) + '</span></div>';
	}
	return html + '</div>';
}

function commitsCompactFullDiffUnifiedRows<T extends { changed: boolean }>(view: any, rows: T[]): (T | { spacer: string })[] {
	if (!view.gitRepos[view.currentRepo].fullDiffCompact) return rows;

	const contextLines = 2;
	const output: (T | { spacer: string })[] = [];
	let runStart = -1;
	const flushRun = (endExclusive: number) => {
		if (runStart < 0) return;
		const count = endExclusive - runStart;
		if (count <= contextLines * 2) {
			for (let i = runStart; i < endExclusive; i++) output.push(rows[i]);
		} else {
			for (let i = runStart; i < runStart + contextLines; i++) output.push(rows[i]);
			output.push({ spacer: '… ' + (count - contextLines * 2) + ' unchanged lines …' });
			for (let i = endExclusive - contextLines; i < endExclusive; i++) output.push(rows[i]);
		}
		runStart = -1;
	};

	for (let i = 0; i < rows.length; i++) {
		if (rows[i].changed) {
			flushRun(i);
			output.push(rows[i]);
		} else if (runStart < 0) {
			runStart = i;
		}
	}
	flushRun(rows.length);
	return output;
}

function commitsBuildFullSideBySideFileView(view: any, oldLines: string[], newLines: string[], hunks: { oldStart: number; newStart: number; lines: string[] }[]): string {
	type SbsPairedRow = { leftNum: string; leftContent: string | null; rightNum: string; rightContent: string | null; changed: boolean };

	const rows: SbsPairedRow[] = [];
	let oldIdx = 1;
	let newIdx = 1;

	for (const hunk of hunks) {
		while (oldIdx < hunk.oldStart) {
			rows.push({ leftNum: String(oldIdx), leftContent: oldLines[oldIdx - 1], rightNum: String(newIdx), rightContent: newLines[newIdx - 1], changed: false });
			oldIdx++; newIdx++;
		}
		let i = 0;
		while (i < hunk.lines.length) {
			if (hunk.lines[i] === '\\ No newline at end of file') { i++; continue; }
			if (hunk.lines[i].startsWith(' ')) {
				rows.push({ leftNum: String(oldIdx), leftContent: oldLines[oldIdx - 1], rightNum: String(newIdx), rightContent: newLines[newIdx - 1], changed: false });
				oldIdx++; newIdx++; i++;
			} else {
				const removed: number[] = [];
				const added: number[] = [];
				while (i < hunk.lines.length && (hunk.lines[i].startsWith('-') || hunk.lines[i].startsWith('+'))) {
					if (hunk.lines[i].startsWith('-')) removed.push(oldIdx++);
					else added.push(newIdx++);
					i++;
				}
				const maxLen = Math.max(removed.length, added.length);
				for (let j = 0; j < maxLen; j++) {
					const o = j < removed.length ? removed[j] : null;
					const n = j < added.length ? added[j] : null;
					rows.push({ leftNum: o !== null ? String(o) : '', leftContent: o !== null ? (oldLines[o - 1] ?? '') : null, rightNum: n !== null ? String(n) : '', rightContent: n !== null ? (newLines[n - 1] ?? '') : null, changed: true });
				}
			}
		}
	}
	while (oldIdx <= oldLines.length && newIdx <= newLines.length) {
		rows.push({ leftNum: String(oldIdx), leftContent: oldLines[oldIdx - 1], rightNum: String(newIdx), rightContent: newLines[newIdx - 1], changed: false });
		oldIdx++; newIdx++;
	}

	let leftHtml = '<div class="diffSbsPane diffSbsPaneOld"><div class="diffSbsPaneInner">';
	let rightHtml = '<div class="diffSbsPane diffSbsPaneNew"><div class="diffSbsPaneInner">';
	for (const row of commitsCompactSbsPairedRows(view, rows)) {
		if ('spacer' in row) {
			leftHtml += '<div class="diffSbsFullRow diffCompactSpacer">' + escapeHtml(row.spacer) + '</div>';
			rightHtml += '<div class="diffSbsFullRow diffCompactSpacer">' + escapeHtml(row.spacer) + '</div>';
			continue;
		}
		const navClass = row.changed ? ' fullDiffChangedNav' : '';
		if (row.leftContent === null) {
			leftHtml += '<div class="diffSbsFullRow diffSbsPlaceholder' + navClass + '"></div>';
		} else {
			leftHtml += '<div class="diffSbsFullRow' + (row.changed && row.leftNum !== '' ? ' diffSbsRemoved fullDiffChanged' : ' diffContext') + navClass + '"><span class="diffLnOld">' + row.leftNum + '</span><span class="diffSbsContent">' + escapeHtml(row.leftContent) + '</span></div>';
		}
		if (row.rightContent === null) {
			rightHtml += '<div class="diffSbsFullRow diffSbsPlaceholder"></div>';
		} else {
			rightHtml += '<div class="diffSbsFullRow' + (row.changed && row.rightNum !== '' ? ' diffSbsAdded fullDiffChanged' : ' diffContext') + '"><span class="diffLnNew">' + row.rightNum + '</span><span class="diffSbsContent">' + escapeHtml(row.rightContent) + '</span></div>';
		}
	}
	leftHtml += '</div></div>';
	rightHtml += '</div></div>';
	return '<div class="diffSbsContainer">' + leftHtml + rightHtml + '</div>';
}

function commitsCompactSbsPairedRows<T extends { changed: boolean }>(view: any, rows: T[]): (T | { spacer: string })[] {
	if (!view.gitRepos[view.currentRepo].fullDiffCompact) return rows;

	const contextLines = 2;
	const output: (T | { spacer: string })[] = [];
	let runStart = -1;
	const flushRun = (endExclusive: number) => {
		if (runStart < 0) return;
		const count = endExclusive - runStart;
		if (count <= contextLines * 2) {
			for (let i = runStart; i < endExclusive; i++) output.push(rows[i]);
		} else {
			for (let i = runStart; i < runStart + contextLines; i++) output.push(rows[i]);
			output.push({ spacer: '… ' + (count - contextLines * 2) + ' unchanged lines …' });
			for (let i = endExclusive - contextLines; i < endExclusive; i++) output.push(rows[i]);
		}
		runStart = -1;
	};
	for (let i = 0; i < rows.length; i++) {
		if (rows[i].changed) { flushRun(i); output.push(rows[i]); }
		else if (runStart < 0) { runStart = i; }
	}
	flushRun(rows.length);
	return output;
}


function commitsCreateFullDiffPanel(view: any) {
	if (document.getElementById('fullDiffPanel')) return;
	const panel = document.createElement('div');
	panel.id = 'fullDiffPanel';
	const initialFilename = (view.currentDiffRequest ? (view.currentDiffRequest.newFilePath || view.currentDiffRequest.oldFilePath) : 'Select a file to view its contents');
	panel.innerHTML =
		'<div id="fullDiffResizeHandle"></div>' +
		'<div id="fullDiffHeader"><span id="fullDiffFilename">' + escapeHtml(initialFilename) + '</span>' +
			'<div id="fullDiffHeaderRight">' +
				'<button id="fullDiffViewUnified" title="Unified full file view">Unified</button>' +
				'<button id="fullDiffViewSideBySide" title="Side by side full file view">Split</button>' +
				'<button id="fullDiffCompact" title="Toggle compact mode">Compact</button>' +
				'<button id="fullDiffPrevHunk" title="Previous change">▲</button>' +
				'<span id="fullDiffChangeCounter">0 / 0</span>' +
				'<button id="fullDiffNextHunk" title="Next change">▼</button>' +
			'</div></div><div id="fullDiffContent"></div>';
	document.body.appendChild(panel);
	if (view.currentDiffRequest === null) {
		document.getElementById('fullDiffContent')!.innerHTML = '<div class="commitDetailsViewDiffMessage">Select a file to view the diff</div>';
	}
	view.setFullDiffPanelHeight(view.gitRepos[view.currentRepo].fullDiffPanelHeight);
	view.makeFullDiffPanelResizable();
	view.renderFullDiffViewBtns();
	view.renderFullDiffCompactBtn();
	document.getElementById('fullDiffViewUnified')!.addEventListener('click', () => view.changeFullDiffViewMode('unified'));
	document.getElementById('fullDiffViewSideBySide')!.addEventListener('click', () => view.changeFullDiffViewMode('sideBySide'));
	document.getElementById('fullDiffCompact')!.addEventListener('click', () => {
		view.gitRepos[view.currentRepo].fullDiffCompact = !view.gitRepos[view.currentRepo].fullDiffCompact;
		view.renderFullDiffCompactBtn();
		view.saveRepoState();
		view.renderFullDiffContent(view.currentFullDiffData);
	});
}

function commitsRenderFullDiffCompactBtn(view: any) {
	const btn = document.getElementById('fullDiffCompact');
	if (!btn) return;
	alterClass(btn, CLASS_ACTIVE, view.gitRepos[view.currentRepo].fullDiffCompact);
}

function commitsRenderFullDiffViewBtns(view: any) {
	const unifiedBtn = document.getElementById('fullDiffViewUnified');
	const sbsBtn = document.getElementById('fullDiffViewSideBySide');
	if (!unifiedBtn || !sbsBtn) return;
	const isSbs = view.fullDiffViewMode === 'sideBySide';
	alterClass(unifiedBtn, CLASS_ACTIVE, !isSbs);
	alterClass(sbsBtn, CLASS_ACTIVE, isSbs);
}

function commitsChangeFullDiffViewMode(view: any, mode: 'unified' | 'sideBySide') {
	view.fullDiffViewMode = mode;
	updateGlobalViewState('fullDiffViewMode', mode);
	view.renderFullDiffViewBtns();
	view.renderFullDiffContent(view.currentFullDiffData);
}

function commitsDestroyFullDiffPanel(view: any) {
	const panel = document.getElementById('fullDiffPanel');
	if (panel) panel.remove();
	view.updateLayoutBottoms();
}

function commitsResetDiffState(view: any) {
	view.currentDiffRequest = null;
	view.currentDiffText = null;
	view.currentFullDiffData = null;
	view.currentDiffFilePath = null;
	view.destroyFullDiffPanel();
}

function commitsSetFullDiffPanelHeight(view: any, height: number) {
	view.gitRepos[view.currentRepo].fullDiffPanelHeight = height;
	const panel = document.getElementById('fullDiffPanel');
	if (panel) panel.style.height = height + 'px';
	view.updateLayoutBottoms();
}

function commitsUpdateLayoutBottoms(view: any) {
	const panel = document.getElementById('fullDiffPanel');
	const commitDetailsViewElem = document.getElementById('commitDetailsView') as HTMLElement | null;
	const isDocked = view.isCommitDetailsViewDocked();
	const panelH = panel ? view.gitRepos[view.currentRepo].fullDiffPanelHeight : 0;
	const commitDetailsViewH = (commitDetailsViewElem && isDocked) ? view.gitRepos[view.currentRepo].commitDetailsViewHeight : 0;
	if (commitDetailsViewElem && isDocked) commitDetailsViewElem.style.bottom = panelH + 'px';
	view.viewElem.style.bottom = (commitDetailsViewH + panelH) + 'px';
	const filesPanel = document.getElementById('filesPanel');
	if (filesPanel) filesPanel.style.bottom = panelH + 'px';
	const sidebar = document.getElementById('sidebar');
	if (sidebar) sidebar.style.bottom = panelH + 'px';
	const sidebarResizeHandle = document.getElementById('sidebarResizeHandle');
	if (sidebarResizeHandle) sidebarResizeHandle.style.bottom = panelH + 'px';
}

function commitsMakeFullDiffPanelResizable(view: any) {
	const handle = document.getElementById('fullDiffResizeHandle');
	if (!handle) return;
	let prevY = -1;

	const onMove: EventListener = (e) => {
		if (prevY < 0) return;
		const delta = prevY - (<MouseEvent>e).pageY;
		prevY = (<MouseEvent>e).pageY;
		let h = view.gitRepos[view.currentRepo].fullDiffPanelHeight + delta;
		h = Math.max(80, Math.min(window.innerHeight - 100, h));
		view.setFullDiffPanelHeight(h);
	};
	const onUp: EventListener = (e) => {
		if (prevY < 0) return;
		onMove(e);
		view.saveRepoState();
		prevY = -1;
		eventOverlay.remove();
	};

	handle.addEventListener('mousedown', (e) => {
		prevY = (<MouseEvent>e).pageY;
		eventOverlay.create('rowResize', onMove, onUp);
	});
}

function commitsAttachFullDiffHunkNav(_view: any) {
	const contentElem = document.getElementById('fullDiffContent');
	const prevBtn = document.getElementById('fullDiffPrevHunk');
	const nextBtn = document.getElementById('fullDiffNextHunk');
	const counterElem = document.getElementById('fullDiffChangeCounter');
	if (!contentElem || !prevBtn || !nextBtn || !counterElem) return;

	const isSbs = contentElem.classList.contains('diffSbsMode');
	const scrollElem: HTMLElement = isSbs ? (contentElem.querySelector('.diffSbsPaneOld') as HTMLElement ?? contentElem) : contentElem;
	const hunks = Array.from(scrollElem.querySelectorAll('.fullDiffChangedNav')) as HTMLElement[];
	let idx = 0;
	const updateCounter = () => {
		if (hunks.length === 0) {
			counterElem.textContent = '0 / 0';
			return;
		}
		let current = 0;
		const scrollTop = scrollElem.scrollTop + 4;
		for (let i = 0; i < hunks.length; i++) {
			if (hunks[i].offsetTop <= scrollTop) current = i;
			else break;
		}
		idx = current;
		counterElem.textContent = (idx + 1) + ' / ' + hunks.length;
	};
	const scrollTo = (i: number) => {
		idx = Math.max(0, Math.min(i, hunks.length - 1));
		scrollElem.scrollTop = hunks[idx].offsetTop - 4;
		updateCounter();
	};

	const newPrev = prevBtn.cloneNode(true) as HTMLElement;
	const newNext = nextBtn.cloneNode(true) as HTMLElement;
	prevBtn.replaceWith(newPrev);
	nextBtn.replaceWith(newNext);
	scrollElem.onscroll = updateCounter;
	updateCounter();
	if (hunks.length === 0) return;
	newNext.addEventListener('click', () => scrollTo(idx + 1));
	newPrev.addEventListener('click', () => scrollTo(idx - 1));
}
