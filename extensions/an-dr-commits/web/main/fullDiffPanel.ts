function commitsRenderFullDiffContent(view: any, data: { diff: string | null; oldContent: string | null; newContent: string | null; oldExists: boolean; newExists: boolean } | null) {
	view.currentDiffText = data !== null ? data.diff : null;
	view.currentFullDiffData = data;
	const contentElem = document.getElementById('fullDiffContent');
	if (!contentElem) return;
	if (data === null || data.diff === null) {
		contentElem.innerHTML = '<div class="cdvDiffMessage">Unable to load file contents</div>';
		view.attachFullDiffHunkNav();
		return;
	}

	const oldLines = commitsGetDisplayLines(data.oldExists ? data.oldContent : null);
	const newLines = commitsGetDisplayLines(data.newExists ? data.newContent : null);
	const hunks = commitsParseUnifiedDiffHunks(data.diff);
	contentElem.innerHTML = view.fullDiffViewMode === 'sideBySide'
		? commitsBuildFullSideBySideFileView(view, oldLines, newLines, hunks)
		: commitsBuildFullUnifiedFileView(view, oldLines, newLines, hunks);
	contentElem.scrollTop = 0;
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

function commitsParseUnifiedDiffChangedLines(hunks: { oldStart: number; newStart: number; lines: string[] }[]) {
	const oldChanged = new Set<number>();
	const newChanged = new Set<number>();
	for (const hunk of hunks) {
		let oldLine = hunk.oldStart;
		let newLine = hunk.newStart;
		for (const line of hunk.lines) {
			if (line === '\\ No newline at end of file') continue;
			if (line.startsWith(' ')) {
				oldLine++;
				newLine++;
			} else if (line.startsWith('-')) {
				oldChanged.add(oldLine++);
			} else if (line.startsWith('+')) {
				newChanged.add(newLine++);
			}
		}
	}
	return { oldChanged, newChanged };
}

function commitsBuildFullFileRows(view: any, lines: string[], changedLines: Set<number>): ({ num: string; content: string; changed: boolean } | { spacer: string })[] {
	const output: ({ num: string; content: string; changed: boolean } | { spacer: string })[] = [];
	const lineCount = lines.length;
	if (!view.gitRepos[view.currentRepo].fullDiffCompact || changedLines.size === 0) {
		for (let i = 0; i < lineCount; i++) {
			output.push({ num: String(i + 1), content: lines[i], changed: changedLines.has(i + 1) });
		}
		return output;
	}

	const context = 2;
	const changed = Array.from(changedLines).sort((a, b) => a - b);
	const ranges: { start: number; end: number }[] = [];
	for (const line of changed) {
		const start = Math.max(1, line - context);
		const end = Math.min(lineCount, line + context);
		const last = ranges[ranges.length - 1];
		if (!last || start > last.end + 1) ranges.push({ start, end });
		else last.end = Math.max(last.end, end);
	}

	let nextLine = 1;
	for (const range of ranges) {
		if (range.start > nextLine) {
			output.push({ spacer: '… ' + (range.start - nextLine) + ' unchanged lines …' });
		}
		for (let line = range.start; line <= range.end; line++) {
			output.push({ num: String(line), content: lines[line - 1], changed: changedLines.has(line) });
		}
		nextLine = range.end + 1;
	}
	if (nextLine <= lineCount) {
		output.push({ spacer: '… ' + (lineCount - nextLine + 1) + ' unchanged lines …' });
	}
	return output;
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
	const changedLines = commitsParseUnifiedDiffChangedLines(hunks);
	const leftRows = commitsBuildFullFileRows(view, oldLines, changedLines.oldChanged);
	const rightRows = commitsBuildFullFileRows(view, newLines, changedLines.newChanged);
	const rowCount = Math.max(leftRows.length, rightRows.length);

	let html = '<table class="diffSideBySide diffSideBySideFull"><tbody>';
	for (let i = 0; i < rowCount; i++) {
		const leftRow = i < leftRows.length ? leftRows[i] : null;
		const rightRow = i < rightRows.length ? rightRows[i] : null;
		const left = leftRow === null ? '<td class="diffSbsLeft"></td>' : 'spacer' in leftRow
			? '<td class="diffSbsLeft diffCompactSpacer">' + escapeHtml(leftRow.spacer) + '</td>'
			: '<td class="diffSbsLeft diffContext' + (leftRow.changed ? ' diffSbsRemoved fullDiffChanged' : '') + '"><div class="diffSbsCell"><span class="diffLnOld">' + leftRow.num + '</span><span class="diffSbsContent">' + escapeHtml(leftRow.content) + '</span></div></td>';
		const right = rightRow === null ? '<td class="diffSbsRight"></td>' : 'spacer' in rightRow
			? '<td class="diffSbsRight diffCompactSpacer">' + escapeHtml(rightRow.spacer) + '</td>'
			: '<td class="diffSbsRight diffContext' + (rightRow.changed ? ' diffSbsAdded fullDiffChanged' : '') + '"><div class="diffSbsCell"><span class="diffLnNew">' + rightRow.num + '</span><span class="diffSbsContent">' + escapeHtml(rightRow.content) + '</span></div></td>';
		html += '<tr' + ((leftRow !== null && !('spacer' in leftRow) && leftRow.changed) || (rightRow !== null && !('spacer' in rightRow) && rightRow.changed) ? ' class="fullDiffChangedNav"' : '') + '>' + left + right + '</tr>';
	}
	return html + '</tbody></table>';
}

function commitsToggleFullDiffMode(view: any, on: boolean) {
	view.fullDiffMode = on;
	view.renderCdvDiffViewBtns();
	if (on) {
		view.createFullDiffPanel();
		view.hideDiffPane();
		if (view.currentFullDiffData !== null) {
			view.renderFullDiffContent(view.currentFullDiffData);
		} else if (view.currentDiffRequest !== null) {
			sendMessage({ command: 'getFullDiffContent', repo: view.currentRepo, ...view.currentDiffRequest });
		}
	} else {
		view.destroyFullDiffPanel();
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
	view.renderTopFullDiffButton();
	view.saveState();
}

function commitsCreateFullDiffPanel(view: any) {
	if (document.getElementById('fullDiffPanel')) return;
	const panel = document.createElement('div');
	panel.id = 'fullDiffPanel';
	panel.innerHTML =
		'<div id="fullDiffResizeHandle"></div>' +
		'<div id="fullDiffHeader"><span id="fullDiffFilename">Select a file to view its contents</span>' +
			'<div id="fullDiffHeaderRight">' +
				'<button id="fullDiffViewUnified" title="Unified full file view">Unified</button>' +
				'<button id="fullDiffViewSideBySide" title="Side by side full file view">Split</button>' +
				'<button id="fullDiffCompact" title="Toggle compact mode">Compact</button>' +
				'<button id="fullDiffPrevHunk" title="Previous change">▲</button>' +
				'<span id="fullDiffChangeCounter">0 / 0</span>' +
				'<button id="fullDiffNextHunk" title="Next change">▼</button>' +
				'<button id="fullDiffClose" title="Close">&#215;</button>' +
			'</div></div><div id="fullDiffContent"></div>';
	document.body.appendChild(panel);
	view.setFullDiffPanelHeight(view.gitRepos[view.currentRepo].fullDiffPanelHeight);
	view.makeFullDiffPanelResizable();
	view.renderFullDiffViewBtns();
	view.renderFullDiffCompactBtn();
	document.getElementById('fullDiffViewUnified')!.addEventListener('click', () => view.changeFullDiffViewMode('unified'));
	document.getElementById('fullDiffViewSideBySide')!.addEventListener('click', () => view.changeFullDiffViewMode('sideBySide'));
	document.getElementById('fullDiffCompact')!.addEventListener('click', () => {
		view.gitRepos[view.currentRepo].fullDiffCompact = !view.gitRepos[view.currentRepo].fullDiffCompact;
		view.renderFullDiffCompactBtn();
		if (view.fullDiffMode) {
			view.saveRepoState();
			view.renderFullDiffContent(view.currentFullDiffData);
		}
	});
	document.getElementById('fullDiffClose')!.addEventListener('click', () => view.toggleFullDiffMode(false));
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
	if (view.fullDiffMode) view.renderFullDiffContent(view.currentFullDiffData);
}

function commitsDestroyFullDiffPanel(view: any) {
	const panel = document.getElementById('fullDiffPanel');
	if (panel) panel.remove();
	view.updateLayoutBottoms();
}

function commitsSetFullDiffPanelHeight(view: any, height: number) {
	view.gitRepos[view.currentRepo].fullDiffPanelHeight = height;
	const panel = document.getElementById('fullDiffPanel');
	if (panel) panel.style.height = height + 'px';
	view.updateLayoutBottoms();
}

function commitsUpdateLayoutBottoms(view: any) {
	const panel = document.getElementById('fullDiffPanel');
	const cdv = document.getElementById('cdv') as HTMLElement | null;
	const isDocked = view.isCdvDocked();
	const panelH = panel ? view.gitRepos[view.currentRepo].fullDiffPanelHeight : 0;
	const cdvH = (cdv && isDocked) ? view.gitRepos[view.currentRepo].cdvHeight : 0;
	if (cdv && isDocked) cdv.style.bottom = panelH + 'px';
	view.viewElem.style.bottom = (cdvH + panelH) + 'px';
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

	const hunks = Array.from(contentElem.querySelectorAll('.fullDiffChangedNav')) as HTMLElement[];
	let idx = 0;
	const updateCounter = () => {
		if (hunks.length === 0) {
			counterElem.textContent = '0 / 0';
			return;
		}
		let current = 0;
		const scrollTop = contentElem.scrollTop + 4;
		for (let i = 0; i < hunks.length; i++) {
			if (hunks[i].offsetTop <= scrollTop) current = i;
			else break;
		}
		idx = current;
		counterElem.textContent = (idx + 1) + ' / ' + hunks.length;
	};
	const scrollTo = (i: number) => {
		idx = Math.max(0, Math.min(i, hunks.length - 1));
		contentElem.scrollTop = hunks[idx].offsetTop - 4;
		updateCounter();
	};

	const newPrev = prevBtn.cloneNode(true) as HTMLElement;
	const newNext = nextBtn.cloneNode(true) as HTMLElement;
	prevBtn.replaceWith(newPrev);
	nextBtn.replaceWith(newNext);
	contentElem.onscroll = updateCounter;
	updateCounter();
	if (hunks.length === 0) return;
	newNext.addEventListener('click', () => scrollTo(idx + 1));
	newPrev.addEventListener('click', () => scrollTo(idx - 1));
}
