/*
 * changesPanel.ts — Uncommitted Changes mode for the Files Panel.
 *
 * When the uncommitted-changes row is selected, instead of showing a static
 * file diff list the Files Panel shows a Source-Control-style panel with:
 *   - Footer: commit message textarea + Commit button
 *   - Content: "Staged Changes" and "Changes" sections with per-file
 *              stage / unstage / discard action buttons.
 *
 * All files are concatenated (module: none), so `commits`, `sendMessage`,
 * `escapeHtml`, `dialog`, `UNCOMMITTED`, `runAction` etc. are in scope.
 */

/* ── state ─────────────────────────────────────────────────────────────── */

let _cpChanges: GG.GitWorkingTreeChangeMsg[] = [];
let _cpActive = false;   // true while uncommitted row is expanded
let _cpCloseMenuListener: (() => void) | null = null;
let _cpPendingCommit: { msg: string; amend: boolean } | null = null;

type CpTreeFolder = {
	folders: { [name: string]: CpTreeFolder };
	files: GG.GitWorkingTreeChangeMsg[];
};

/* ── helpers ────────────────────────────────────────────────────────────── */

function _cpBasename(p: string) {
	return p.replace(/\\/g, '/').split('/').pop() || p;
}
function _cpStatusTitle(status: GG.GitWorkingTreeChangeMsg['status']) {
	return status === 'U' ? 'Untracked' : status === 'A' ? 'Added' : status === 'D' ? 'Deleted' : status === 'R' ? 'Renamed' : 'Modified';
}
function _cpCanStage(f: GG.GitWorkingTreeChangeMsg) {
	return f.submodule === null || f.submodule.oldSha !== f.submodule.newSha;
}
function _cpRenderAddDel(f: GG.GitWorkingTreeChangeMsg): string {
	if (f.additions === null || f.deletions === null) return '';
	return '<span class="fileTreeFileAddDel cpFileAddDel">(<span class="fileTreeFileAdd" title="' + f.additions + ' addition' + (f.additions !== 1 ? 's' : '') + '">+' + f.additions + '</span>|<span class="fileTreeFileDel" title="' + f.deletions + ' deletion' + (f.deletions !== 1 ? 's' : '') + '">-' + f.deletions + '</span>)</span>';
}

/* ── render ─────────────────────────────────────────────────────────────── */

function _cpRenderFileRow(f: GG.GitWorkingTreeChangeMsg, isStaged: boolean): string {
	const name = escapeHtml(_cpBasename(f.path));
	const encodedPath = escapeHtml(f.path);
	const stageTitle = isStaged ? 'Unstage file' : 'Stage file';
	const stageAction = isStaged ? 'unstage' : 'stage';
	const stageIcon = isStaged ? ICONS.minus : ICONS.plus;
	const discardTitle = f.submodule === null ? 'Discard changes' : 'Reset submodule';
	const changeTypeMessage = (f.submodule === null ? '' : 'Submodule • ') + _cpStatusTitle(f.status) + (f.oldPath ? ' (' + escapeHtml(f.oldPath) + ' → ' + encodedPath + ')' : '');
	return `<div class="cpFile fileTreeFileRecord" data-path="${encodedPath}" data-staged="${isStaged}">` +
		`<span class="fileTreeFile gitDiffPossible" title="Click to View Diff • ${changeTypeMessage}">` +
		`<span class="fileTreeFileIcon">${f.submodule === null ? getFileIcon(f.path) : ICONS.closedFolder}</span>` +
		`<span class="gitFileName ${f.status}" title="${encodedPath + (f.oldPath ? ' ← ' + escapeHtml(f.oldPath) : '')}">${name}</span>` +
		`</span>` +
		(initialState.config.enhancedAccessibility ? `<span class="fileTreeFileType" title="${changeTypeMessage}">${f.status}</span>` : '') +
		_cpRenderAddDel(f) +
		`<span class="cpFileActions">` +
		(_cpCanStage(f) && (isStaged
			? `<button class="cpFileBtn" data-action="${stageAction}" data-path="${encodedPath}" title="${stageTitle}">${stageIcon}</button>`
			: `<button class="cpFileBtn" data-action="${stageAction}" data-path="${encodedPath}" title="${stageTitle}">${stageIcon}</button>`)) +
		(!isStaged ? `<button class="cpFileBtn" data-action="discard" data-path="${encodedPath}" title="${discardTitle}">${ICONS.discard}</button>` : '') +
		`</span>` +
		`</div>`;
}

function _cpBuildTree(files: GG.GitWorkingTreeChangeMsg[]): CpTreeFolder {
	const root: CpTreeFolder = { folders: {}, files: [] };
	files.forEach((file) => {
		const parts = file.path.replace(/\\/g, '/').split('/');
		const fileName = parts.pop();
		if (!fileName) return;
		let cur = root;
		parts.forEach((part) => {
			if (!cur.folders[part]) cur.folders[part] = { folders: {}, files: [] };
			cur = cur.folders[part];
		});
		cur.files.push(file);
	});
	return root;
}

function _cpRenderTree(folder: CpTreeFolder, isStaged: boolean, topLevel: boolean = true): string {
	const folderNames = Object.keys(folder.folders).sort((a, b) => a.localeCompare(b));
	const files = folder.files.slice().sort((a, b) => _cpBasename(a.path).localeCompare(_cpBasename(b.path)));
	const children = folderNames.map((name) =>
		`<li data-pathseg="${encodeURIComponent(name)}"><span class="fileTreeFolder cpTreeFolder">` +
		`<span class="fileTreeFolderIcon">${ICONS.openFolder}</span><span class="gitFolderName">${escapeHtml(name)}</span></span>` +
		_cpRenderTree(folder.folders[name], isStaged, false) +
		`</li>`
	).concat(files.map((file) => `<li data-pathseg="${encodeURIComponent(_cpBasename(file.path))}">${_cpRenderFileRow(file, isStaged)}</li>`));
	return `<ul class="fileTreeFolderContents${topLevel ? ' cpSectionFiles' : ''}">${children.join('')}</ul>`;
}

function _cpRenderSection(title: string, files: GG.GitWorkingTreeChangeMsg[], isStaged: boolean): string {
	if (files.length === 0) return '';
	const stageAllAction = isStaged ? 'unstageAll' : 'stageAll';
	const stageAllTitle = isStaged ? 'Unstage all' : 'Stage all';
	const stageAllIcon = isStaged ? ICONS.minus : ICONS.plus;
	return `<div class="cpSection" data-staged="${isStaged}">` +
		`<div class="cpSectionHeader fileTreeFolder">` +
		`<span class="cpSectionArrow fileTreeFolderIcon">${ICONS.openFolder}</span>` +
		`<span class="cpSectionTitle gitFolderName">${escapeHtml(title)}</span>` +
		`<span class="cpSectionCount">${files.length}</span>` +
		`<button class="cpFileBtn cpSectionBtn" data-action="${stageAllAction}" title="${stageAllTitle}">${stageAllIcon}</button>` +
		`</div>` +
		_cpRenderTree(_cpBuildTree(files), isStaged) +
		`</div>`;
}

/* ── public API called by filesPanel ────────────────────────────────────── */

/** Render footer HTML (commit message area). Attached to filesPanel.footerElem. */
function changesPanelGetFooterHtml(): string {
	return `<div id="cpFooter">` +
		`<textarea id="cpMessage" placeholder="Message (Ctrl+Enter to commit)" rows="3"></textarea>` +
		`<div id="cpCommitRow">` +
		`<button id="cpCommitBtn" disabled>&#10003;&nbsp;Commit</button>` +
		`<button id="cpCommitArrow" disabled title="More commit options">&#9660;</button>` +
		`<div id="cpCommitMenu" class="hidden">` +
		`<button id="cpAmendBtn">Amend Previous Commit</button>` +
		`</div>` +
		`</div>` +
		`</div>`;
}

/** Render content HTML. Attached to filesPanel.contentElem. */
function changesPanelGetContentHtml(changes: GG.GitWorkingTreeChangeMsg[]): string {
	const staged = changes.filter((c) => c.staged);
	const unstaged = changes.filter((c) => !c.staged && c.status !== 'U');
	const untracked = changes.filter((c) => c.status === 'U');
	const allUnstaged = [...unstaged, ...untracked];

	if (changes.length === 0) {
		return '<div class="cpPlaceholder">No changes — working tree is clean.</div>';
	}
	return _cpRenderSection('Staged Changes', staged, true) +
		_cpRenderSection('Changes', allUnstaged, false);
}

/** Called after footer + content HTML are injected into the DOM. Attaches listeners and syncs layout. */
function changesPanelAttachListeners(footerElem: HTMLElement, contentElem: HTMLElement) {
	// Let the browser lay out the footer so offsetHeight is accurate, then fix content bounds
	setTimeout(() => commits.filesPanel.syncContentTop(), 0);
	const msgEl = footerElem.querySelector<HTMLTextAreaElement>('#cpMessage');
	const commitBtn = footerElem.querySelector<HTMLButtonElement>('#cpCommitBtn');

	function updateCommitBtn() {
		if (!commitBtn) return;
		const hasMessage = !!(msgEl && msgEl.value.trim());
		const hasDefault = !!(initialState.config.defaultCommitMessage);
		const canCommit = _cpChanges.some((c) => c.staged || _cpCanStage(c)) && (hasMessage || hasDefault);
		commitBtn.disabled = !canCommit;
		const arrow = footerElem.querySelector<HTMLButtonElement>('#cpCommitArrow');
		if (arrow) arrow.disabled = !canCommit;
	}

	if (msgEl) {
		msgEl.addEventListener('input', updateCommitBtn);
		msgEl.addEventListener('keydown', (e) => {
			if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
				if (commitBtn && !commitBtn.disabled) commitBtn.click();
			}
		});
	}

	const arrowBtn = footerElem.querySelector<HTMLButtonElement>('#cpCommitArrow');
	const commitMenu = footerElem.querySelector<HTMLElement>('#cpCommitMenu');
	const amendBtn = footerElem.querySelector<HTMLButtonElement>('#cpAmendBtn');

	function closeMenu() {
		commitMenu?.classList.add('hidden');
	}

	if (commitBtn) {
		updateCommitBtn();
		commitBtn.addEventListener('click', () => {
			let msg = msgEl ? msgEl.value.trim() : '';
			if (!msg && initialState.config.defaultCommitMessage) {
				const now = new Date();
				const pad = (n: number) => String(n).padStart(2, '0');
				const ts = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
					' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
				msg = initialState.config.defaultCommitMessage + ' (' + ts + ')';
			}
			const repo = commits.getCurrentRepo();
			if (!msg || !repo || commitBtn.disabled) return;
			const hasStagedChanges = _cpChanges.some((c) => c.staged);
			if (!hasStagedChanges) {
				const files = _cpChanges.filter(_cpCanStage).map((c) => c.path);
				if (!files.length) return;
				_cpPendingCommit = { msg, amend: false };
				sendMessage({ command: 'stageFiles', repo, files });
				return;
			}
			runAction({ command: 'commitChanges', repo, message: msg, amend: false }, 'Committing Changes');
		});
	}

	if (arrowBtn && commitMenu) {
		arrowBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			commitMenu.classList.toggle('hidden');
		});
	}

	if (amendBtn) {
		amendBtn.addEventListener('click', () => {
			const msg = msgEl ? msgEl.value.trim() : '';
			const repo = commits.getCurrentRepo();
			if (!repo) return;
			closeMenu();
			runAction({ command: 'commitChanges', repo, message: msg, amend: true }, 'Amending Previous Commit');
		});
	}

	// Close menu when clicking outside — remove the previous listener first
	if (_cpCloseMenuListener) {
		document.removeEventListener('click', _cpCloseMenuListener);
	}
	_cpCloseMenuListener = () => closeMenu();
	document.addEventListener('click', _cpCloseMenuListener);

	// Section collapse toggle
	contentElem.querySelectorAll('.cpSectionHeader').forEach((hdr) => {
		hdr.addEventListener('click', (e) => {
			e.stopPropagation();
			if ((e.target as HTMLElement).closest('.cpFileBtn')) return;
			const section = hdr.closest('.cpSection') as HTMLElement;
			section.classList.toggle('cpCollapsed');
			const arrow = hdr.querySelector('.cpSectionArrow') as HTMLElement;
			if (arrow) arrow.innerHTML = section.classList.contains('cpCollapsed') ? ICONS.closedFolder : ICONS.openFolder;
		});
	});

	contentElem.querySelectorAll('.cpTreeFolder').forEach((folderElem) => {
		folderElem.addEventListener('click', (e) => {
			e.stopPropagation();
			const parent = (folderElem as HTMLElement).parentElement;
			if (parent === null) return;
			parent.classList.toggle('closed');
			const isOpen = !parent.classList.contains('closed');
			const icon = folderElem.querySelector('.fileTreeFolderIcon');
			if (icon !== null) icon.innerHTML = isOpen ? ICONS.openFolder : ICONS.closedFolder;
			const childList = parent.querySelector(':scope > .fileTreeFolderContents');
			if (childList !== null) childList.classList.toggle('hidden', !isOpen);
		});
	});

	// File right-click context menu (mirrors native VS Code Changes panel)
	contentElem.querySelectorAll<HTMLElement>('.cpFile').forEach((fileRow) => {
		fileRow.addEventListener('contextmenu', (e) => {
			handledEvent(e);
			const repo = commits.getCurrentRepo();
			if (!repo) return;
			const filePath = fileRow.dataset['path'];
			if (!filePath) return;
			const isStaged = fileRow.dataset['staged'] === 'true';
			const fileEntry = _cpChanges.find((c) => c.path === filePath);
			if (!fileEntry) return;
			const isUntracked = fileEntry.status === 'U';
			const isDeleted = fileEntry.status === 'D';
			const isSubmodule = fileEntry.submodule !== null;

			contextMenu.show([
				[
					{
						title: 'Open Changes',
						visible: !isUntracked,
						onClick: () => sendMessage({
							command: 'viewDiff',
							repo,
							fromHash: UNCOMMITTED,
							toHash: UNCOMMITTED,
							oldFilePath: fileEntry.oldPath || filePath,
							newFilePath: filePath,
							type: fileEntry.status as GG.GitFileStatus,
							submodule: fileEntry.submodule
						})
					},
					{
						title: 'Open File',
						visible: !isDeleted,
						onClick: () => sendMessage({ command: 'openFile', repo, hash: UNCOMMITTED, filePath })
					}
				],
				[
					{
						title: 'Stage Changes',
						visible: !isStaged && _cpCanStage(fileEntry),
						onClick: () => sendMessage({ command: 'stageFiles', repo, files: [filePath] })
					},
					{
						title: 'Unstage Changes',
						visible: isStaged && _cpCanStage(fileEntry),
						onClick: () => sendMessage({ command: 'unstageFiles', repo, files: [filePath] })
					},
					{
						title: isSubmodule ? 'Reset Submodule' + ELLIPSIS : 'Discard Changes',
						visible: !isStaged && !isUntracked,
						onClick: () => isSubmodule ? _cpShowDiscardSubmoduleDialog(repo, filePath) : _cpShowDiscardDialog(repo, filePath)
					},
					{
						title: 'Delete Untracked File',
						visible: !isStaged && isUntracked,
						onClick: () => dialog.showConfirmation(
							'Are you sure you want to delete the untracked file <b><i>' + escapeHtml(filePath) + '</i></b>?',
							'Delete File',
							() => sendMessage({ command: 'discardFileChanges', repo, files: [filePath], isUntracked: true }),
							null
						)
					},
					{
						title: 'Ignore File',
						visible: !isStaged,
						onClick: () => _cpShowIgnoreDialog(repo, filePath)
					}
				],
				[
					{
						title: 'Copy Relative Path to Clipboard',
						visible: true,
						onClick: () => sendMessage({ command: 'copyFilePath', repo, filePath, absolute: false })
					},
					{
						title: 'Copy Absolute Path to Clipboard',
						visible: true,
						onClick: () => sendMessage({ command: 'copyFilePath', repo, filePath, absolute: true })
					}
				]
			], false, null, e as MouseEvent, document.body);
		});
	});

	// File action buttons
	contentElem.querySelectorAll<HTMLButtonElement>('.cpFileBtn').forEach((btn) => {
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			const repo = commits.getCurrentRepo();
			if (!repo) return;
			const action = btn.dataset['action'];
			const filePath = btn.dataset['path'];
			const section = btn.closest('.cpSection') as HTMLElement | null;
			const isStaged = section ? section.dataset['staged'] === 'true' : false;

			if (action === 'stage' && filePath) {
				sendMessage({ command: 'stageFiles', repo, files: [filePath] });
			} else if (action === 'unstage' && filePath) {
				sendMessage({ command: 'unstageFiles', repo, files: [filePath] });
			} else if (action === 'stageAll') {
				const files = _cpChanges.filter((c) => !c.staged && _cpCanStage(c)).map((c) => c.path);
				if (files.length) sendMessage({ command: 'stageFiles', repo, files });
			} else if (action === 'unstageAll') {
				const files = _cpChanges.filter((c) => c.staged && _cpCanStage(c)).map((c) => c.path);
				if (files.length) sendMessage({ command: 'unstageFiles', repo, files });
			} else if (action === 'discard' && filePath) {
				const fileEntry = _cpChanges.find((c) => c.path === filePath);
				const isUntracked = fileEntry ? fileEntry.status === 'U' : false;
				if (isUntracked) {
					dialog.showConfirmation(
						'Are you sure you want to delete the untracked file <b><i>' + escapeHtml(filePath) + '</i></b>?',
						'Delete File',
						() => sendMessage({ command: 'discardFileChanges', repo, files: [filePath], isUntracked: true }),
						null
					);
				} else {
					fileEntry !== undefined && fileEntry.submodule !== null ? _cpShowDiscardSubmoduleDialog(repo, filePath) : _cpShowDiscardDialog(repo, filePath);
				}
			}
			void isStaged;
		});
	});
}

/** Request a fresh working tree status from the backend. */
function changesPanelRequestRefresh() {
	const repo = commits.getCurrentRepo();
	if (repo) sendMessage({ command: 'loadWorkingTreeChanges', repo });
}

/** Called when the uncommitted row is expanded — activate changes panel mode. */
function changesPanelActivate() {
	_cpActive = true;
	_cpChanges = [];
	changesPanelRequestRefresh();
}

/** Called when the uncommitted row is collapsed / another commit selected. */
function changesPanelDeactivate() {
	_cpActive = false;
	_cpChanges = [];
}

/* ── response handlers (called from bootstrap.ts) ───────────────────────── */

function filesPanelHandleWorkingTreeChanges(changes: GG.GitWorkingTreeChangeMsg[], error: GG.ErrorInfo) {
	if (!_cpActive) return;
	if (error !== null) {
		const contentElem = commits.filesPanel.getContentElem();
		contentElem.innerHTML = '<div class="cpError">' + escapeHtml(error) + '</div>';
		return;
	}
	_cpChanges = changes;
	const headerElem = commits.filesPanel.getHeaderElem();
	const footerElem = commits.filesPanel.getFooterElem();
	const contentElem = commits.filesPanel.getContentElem();

	// Preserve commit message across refreshes
	const existingMsg = footerElem.querySelector<HTMLTextAreaElement>('#cpMessage');
	const savedMsg = existingMsg ? existingMsg.value : '';

	headerElem.innerHTML = '';
	footerElem.innerHTML = changesPanelGetFooterHtml();
	contentElem.innerHTML = changesPanelGetContentHtml(changes);
	changesPanelAttachListeners(footerElem, contentElem);

	if (savedMsg) {
		const newMsg = footerElem.querySelector<HTMLTextAreaElement>('#cpMessage');
		if (newMsg) newMsg.value = savedMsg;
	}

	// Re-evaluate commit button state after restoring message
	const commitBtn2 = footerElem.querySelector<HTMLButtonElement>('#cpCommitBtn');
	const arrowBtn2 = footerElem.querySelector<HTMLButtonElement>('#cpCommitArrow');
	if (commitBtn2) {
		const msgEl2 = footerElem.querySelector<HTMLTextAreaElement>('#cpMessage');
		const hasMessage2 = !!(msgEl2 && msgEl2.value.trim());
		const hasDefault2 = !!(initialState.config.defaultCommitMessage);
		const canCommit = _cpChanges.some((c) => c.staged || _cpCanStage(c)) && (hasMessage2 || hasDefault2);
		commitBtn2.disabled = !canCommit;
		if (arrowBtn2) arrowBtn2.disabled = !canCommit;
	}

	if (_cpPendingCommit !== null) {
		const pending = _cpPendingCommit;
		_cpPendingCommit = null;
		const repo = commits.getCurrentRepo();
		if (repo) {
			runAction({ command: 'commitChanges', repo, message: pending.msg, amend: pending.amend }, 'Committing Changes');
		}
	}
}

function filesPanelHandleStageUnstageResponse(error: GG.ErrorInfo) {
	if (error !== null) {
		dialog.showError('Unable to Stage/Unstage File', error, null, null);
	}
	if (_cpActive) changesPanelRequestRefresh();
}

function filesPanelHandleAddToGitignoreResponse(error: GG.ErrorInfo) {
	if (error !== null) {
		dialog.showError('Unable to Add to .gitignore', error, null, null);
	}
	if (_cpActive) changesPanelRequestRefresh();
}

function _cpShowDiscardDialog(repo: string, filePath: string) {
	const isAlsoStaged = _cpChanges.some((c) => c.path === filePath && c.staged);
	const options: DialogRadioInputOption[] = [
		{ name: 'Restore to HEAD', value: 'head', description: 'Revert all changes, matching the last committed version' }
	];
	if (isAlsoStaged) {
		options.push({ name: 'Restore to index', value: 'index', description: 'Revert unstaged edits only; keep staged snapshot' });
	}
	dialog.showForm(
		'Reset <b><i>' + escapeHtml(filePath) + '</i></b>:',
		[{ type: DialogInputType.Radio, name: '', options, default: 'head' }],
		'Reset',
		(values) => sendMessage({ command: 'discardFileChanges', repo, files: [filePath], isUntracked: false, restoreToIndex: values[0] === 'index' }),
		null
	);
}

function _cpShowDiscardSubmoduleDialog(repo: string, filePath: string) {
	dialog.showForm(
		'Reset submodule <b><i>' + escapeHtml(filePath) + '</i></b>:',
		[{ type: DialogInputType.Radio, name: '', options: [
			{ name: 'Reset checkout', value: 'safe', description: 'Restore the recorded commit and preserve nested untracked files' },
			{ name: 'Reset and delete untracked files', value: 'clean', description: 'Restore the recorded commit and delete untracked files inside the submodule' }
		], default: 'safe' }],
		'Reset Submodule',
		(values) => sendMessage({ command: 'discardSubmoduleChanges', repo, filePath, cleanUntracked: values[0] === 'clean' }),
		null
	);
}

function _cpShowIgnoreDialog(repo: string, filePath: string) {
	const normalized = filePath.replace(/\\/g, '/');
	const basename = normalized.split('/').pop() || filePath;
	const ext = basename.includes('.') ? basename.split('.').pop() : null;
	const options: DialogRadioInputOption[] = [
		{ name: 'Add to root .gitignore', value: 'root', description: 'Append "/' + normalized + '" to the project root .gitignore' },
		{ name: 'Add to local .gitignore', value: 'local', description: 'Append "/' + basename + '" to the .gitignore next to this file' }
	];
	if (ext) {
		options.push({ name: 'Ignore by extension', value: 'extension', description: 'Append "*.' + ext + '" to the project root .gitignore' });
	}
	dialog.showForm(
		'Ignore <b><i>' + escapeHtml(filePath) + '</i></b>:',
		[{ type: DialogInputType.Radio, name: '', options, default: 'root' }],
		'Add to .gitignore',
		(values) => sendMessage({ command: 'addToGitignore', repo, filePath, type: values[0] as 'root' | 'local' | 'extension' }),
		null
	);
}

function filesPanelHandleCommitResponse(error: GG.ErrorInfo) {
	if (error !== null) {
		dialog.showError('Unable to Commit', error, null, null);
		return;
	}
	// Clear message and refresh — the commit graph refresh is triggered by backend
	const footerElem = commits.filesPanel.getFooterElem();
	const msgEl = footerElem.querySelector<HTMLTextAreaElement>('#cpMessage');
	if (msgEl) msgEl.value = '';
	if (_cpActive) changesPanelRequestRefresh();
}
