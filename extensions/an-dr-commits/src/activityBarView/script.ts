export function activityScript() {
	return `
const vscode = acquireVsCodeApi();
const root = document.body;
const message = document.getElementById('cpMessage');
const commitBtn = document.getElementById('cpCommitBtn');
const commitArrow = document.getElementById('cpCommitArrow');
const commitMenu = document.getElementById('cpCommitMenu');
function post(command, extra = {}) { vscode.postMessage(Object.assign({ command }, extra)); }
function updateCommitButton() {
	const hasChanges = document.querySelector('.cpFile') !== null;
	const hasMessage = !!(message && message.value.trim());
	const enabled = hasChanges && hasMessage;
	if (commitBtn) commitBtn.disabled = !enabled && !hasChanges;
	if (commitArrow) commitArrow.disabled = !hasChanges;
}
document.getElementById('activityOpenCommits')?.addEventListener('click', () => post('openCommits'));
const activityGraph = document.getElementById('activityGraph');
activityGraph?.addEventListener('click', (e) => {
	const row = e.target.closest?.('.miniCommit');
	if (row) post('openCommits');
});
let graphLoading = false;
let hideScrollbarTimer = null;
let thumbEl = null;
if (activityGraph) {
	const track = document.createElement('div');
	track.id = 'activityScrollbar';
	thumbEl = document.createElement('div');
	thumbEl.className = 'thumb';
	track.appendChild(thumbEl);
	activityGraph.appendChild(track);
}
const updateThumb = () => {
	if (!activityGraph || !thumbEl) return;
	const sh = activityGraph.scrollHeight, ch = activityGraph.clientHeight;
	if (sh <= ch) { thumbEl.classList.remove('visible'); return; }
	const trackH = ch - 4;
	const thumbH = Math.max(20, (ch / sh) * trackH);
	const maxTop = trackH - thumbH;
	thumbEl.style.height = thumbH + 'px';
	thumbEl.style.top = (activityGraph.scrollTop / (sh - ch) * maxTop) + 'px';
	thumbEl.classList.add('visible');
	if (hideScrollbarTimer) clearTimeout(hideScrollbarTimer);
	hideScrollbarTimer = setTimeout(() => { if (thumbEl) thumbEl.classList.remove('visible'); }, 1000);
};
activityGraph?.addEventListener('scroll', () => {
	updateThumb();
	if (!activityGraph || graphLoading || activityGraph.dataset.more !== 'true') return;
	if (activityGraph.scrollTop + activityGraph.clientHeight >= activityGraph.scrollHeight - 8) {
		graphLoading = true;
		post('loadMoreGraph');
	}
});
window.addEventListener('message', (e) => {
	if (!e.data || e.data.command !== 'updateGraph' || !activityGraph) return;
	const top = activityGraph.scrollTop;
	const existing = activityGraph.querySelector('#miniGraph');
	if (existing) {
		const tmp = document.createElement('div');
		tmp.innerHTML = e.data.html;
		const updated = tmp.firstElementChild;
		if (updated) existing.replaceWith(updated);
	}
	activityGraph.dataset.more = e.data.more ? 'true' : 'false';
	requestAnimationFrame(() => {
		activityGraph.scrollTop = top;
		updateThumb();
		graphLoading = false;
	});
});
(function() {
	const handle = document.getElementById('activityGraphResizeHandle');
	if (!handle || !activityGraph) return;
	let startY = 0;
	let startHeight = 0;
	const onMove = (e) => {
		// The handle sits above the graph (the graph is the last, bottom-most element in
		// the stack), so dragging up grows it and dragging down shrinks it.
		const height = Math.max(60, Math.min(400, startHeight + (startY - e.clientY)));
		document.body.style.setProperty('--activity-graph-height', height + 'px');
		updateThumb();
	};
	const onUp = () => {
		document.removeEventListener('mousemove', onMove);
		document.removeEventListener('mouseup', onUp);
		handle.classList.remove('resizing');
		const height = parseInt(getComputedStyle(document.body).getPropertyValue('--activity-graph-height'), 10);
		if (!isNaN(height)) post('setGraphHeight', { height });
	};
	handle.addEventListener('mousedown', (e) => {
		e.preventDefault();
		startY = e.clientY;
		startHeight = activityGraph.clientHeight;
		handle.classList.add('resizing');
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
	});
})();
document.getElementById('activityRefresh')?.addEventListener('click', () => post('refresh'));
(function() {
	const dd = document.getElementById('activityRepoDropdown');
	if (!dd) return;
	const currentValueElem = dd.querySelector('.dropdownCurrentValue');
	const menuElem = dd.querySelector('.dropdownMenu');
	const filterInput = dd.querySelector('.dropdownFilterInput');
	const optionsElem = dd.querySelector('.dropdownOptions');
	const noResults = dd.querySelector('.dropdownNoResults');
	function closeDropdown() { dd.classList.remove('dropdownOpen'); }
	function applyFilter() {
		if (!filterInput || !optionsElem) return;
		const val = filterInput.value.toLowerCase();
		let any = false;
		for (const opt of optionsElem.children) {
			const match = opt.textContent.toLowerCase().indexOf(val) > -1;
			opt.style.display = match ? 'block' : 'none';
			if (match) any = true;
		}
		if (noResults) noResults.style.display = any ? 'none' : 'block';
	}
	if (filterInput) filterInput.addEventListener('keyup', applyFilter);
	document.addEventListener('click', (e) => {
		if (!dd.contains(e.target)) { closeDropdown(); return; }
		if (e.target === currentValueElem || currentValueElem?.contains(e.target)) {
			const opening = !dd.classList.contains('dropdownOpen');
			dd.classList.toggle('dropdownOpen');
			if (opening && filterInput) {
				filterInput.style.display = 'block';
				filterInput.value = '';
				applyFilter();
				filterInput.focus();
			}
			return;
		}
		const opt = e.target.closest?.('.dropdownOption');
		if (opt && optionsElem?.contains(opt)) {
			const value = opt.dataset.value;
			if (value) {
				closeDropdown();
				post('selectRepo', { filePath: value });
			}
		}
	}, true);
})();
message?.addEventListener('input', updateCommitButton);
message?.addEventListener('keydown', (e) => {
	if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && commitBtn && !commitBtn.disabled) {
		post('commit', { message: message.value, amend: false });
	}
});
commitBtn?.addEventListener('click', () => post('commit', { message: message ? message.value : '', amend: false }));
commitArrow?.addEventListener('click', (e) => { e.stopPropagation(); commitMenu?.classList.toggle('hidden'); });
document.getElementById('cpAmendBtn')?.addEventListener('click', () => post('commit', { message: message ? message.value : '', amend: true }));
document.addEventListener('click', () => commitMenu?.classList.add('hidden'));
root.addEventListener('click', (e) => {
	const target = e.target;
	const sectionHeader = target.closest?.('.cpSectionHeader');
	if (sectionHeader && !target.closest('.cpFileBtn')) {
		const section = sectionHeader.closest('.cpSection');
		section?.classList.toggle('cpCollapsed');
		const arrow = sectionHeader.querySelector('.cpSectionArrow .codicon');
		if (arrow) {
			const closed = section?.classList.contains('cpCollapsed');
			arrow.classList.toggle('codicon-folder', !!closed);
			arrow.classList.toggle('codicon-folder-opened', !closed);
		}
		return;
	}
	const folderElem = target.closest?.('.cpTreeFolder');
	if (folderElem) {
		const parent = folderElem.parentElement;
		const childList = parent?.querySelector(':scope > .fileTreeFolderContents');
		const icon = folderElem.querySelector('.fileTreeFolderIcon .codicon');
		const closed = !childList?.classList.contains('hidden');
		childList?.classList.toggle('hidden', closed);
		icon?.classList.toggle('codicon-folder', closed);
		icon?.classList.toggle('codicon-folder-opened', !closed);
		return;
	}
	const fileButton = target.closest?.('.cpFileBtn');
	if (fileButton) {
		e.stopPropagation();
		const action = fileButton.dataset.action;
		const path = fileButton.dataset.path;
		if (action === 'discard' && path && !confirm('Discard changes in ' + path + '?')) return;
		post(action, { filePath: path, isUntracked: fileButton.dataset.untracked === 'true' });
		return;
	}
	const fileRow = target.closest?.('.cpFile');
	if (fileRow && fileRow.dataset.status !== 'U') {
		post('openChanges', { filePath: fileRow.dataset.path });
	}
});
updateCommitButton();
`;
}
