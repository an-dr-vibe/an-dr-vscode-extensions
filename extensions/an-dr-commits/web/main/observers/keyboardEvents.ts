/* Keyboard event observer helpers extracted from CommitsView */

function commitsHandleArrowKeyNav(view: any, e: KeyboardEvent, curHashIndex: number) {
	let newHashIndex = -1;
	if (e.ctrlKey || e.metaKey) {
		if (e.shiftKey) {
			if (e.key === 'ArrowUp') newHashIndex = view.graph.getAlternativeChildIndex(curHashIndex);
			else if (e.key === 'ArrowDown') newHashIndex = view.graph.getAlternativeParentIndex(curHashIndex);
		} else {
			if (e.key === 'ArrowUp') newHashIndex = view.graph.getFirstChildIndex(curHashIndex);
			else if (e.key === 'ArrowDown') newHashIndex = view.graph.getFirstParentIndex(curHashIndex);
		}
	} else {
		if (e.key === 'ArrowUp' && curHashIndex > 0) newHashIndex = curHashIndex - 1;
		else if (e.key === 'ArrowDown' && curHashIndex < view.commits.length - 1) newHashIndex = curHashIndex + 1;
	}
	if (newHashIndex > -1) {
		handledEvent(e);
		const elem = findCommitElemWithId(getCommitElems(), newHashIndex);
		if (elem !== null) view.loadCommitDetails(elem);
	}
}

function commitsHandleEscapeKey(view: any, e: KeyboardEvent) {
	if (view.repoDropdown.isOpen()) {
		view.repoDropdown.close();
		handledEvent(e);
	} else if (view.branchDropdown.isOpen()) {
		view.branchDropdown.close();
		handledEvent(e);
	} else if (view.settingsWidget.isVisible()) {
		view.settingsWidget.close();
		handledEvent(e);
	} else if (view.findWidget.isVisible()) {
		view.findWidget.close();
		view.compactFindWidgetPinnedOpen = false;
		view.updateCompactFindWidgetState();
		handledEvent(e);
	} else if (view.filesPanelCommitHash !== null && view.expandedCommit === null) {
		if (view.currentDiffRequest !== null) {
			view.destroyFullDiffPanel();
			view.currentDiffRequest = null;
			view.currentFullDiffData = null;
			view.currentDiffFilePath = null;
			view.updateLayoutBottoms();
		} else {
			view.filesPanel.clear();
			view.filesPanelCommitHash = null;
			view.previewFileChanges = null;
		}
		handledEvent(e);
	} else if (view.expandedCommit !== null) {
		if (view.currentDiffRequest !== null) {
			view.destroyFullDiffPanel();
			view.currentDiffRequest = null;
			view.currentDiffText = null;
			view.currentFullDiffData = null;
			view.currentDiffFilePath = null;
			view.updateLayoutBottoms();
		} else {
			view.closeCommitDetails(true);
		}
		handledEvent(e);
	}
}

function commitsHandleKeyDown(view: any, e: KeyboardEvent) {
	if (contextMenu.isOpen()) {
		if (e.key === 'Escape') {
			contextMenu.close();
			handledEvent(e);
		}
	} else if (dialog.isOpen()) {
		if (e.key === 'Escape') {
			dialog.close();
			handledEvent(e);
		} else if (e.keyCode ? e.keyCode === 13 : e.key === 'Enter') {
			dialog.submit();
			handledEvent(e);
		}
	} else if (view.expandedCommit !== null && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
		commitsHandleArrowKeyNav(view, e, view.commitLookup[view.expandedCommit.commitHash]);
	} else if (e.key && (e.ctrlKey || e.metaKey)) {
		const key = e.key.toLowerCase(), keybindings = view.config.keybindings;
		if (key === keybindings.scrollToStash) {
			view.scrollToStash(!e.shiftKey);
			handledEvent(e);
		} else if (!e.shiftKey) {
			if (key === keybindings.refresh) { view.refresh(true, true); handledEvent(e); }
			else if (key === keybindings.find) { view.showFindWidgetFromToggle(); handledEvent(e); }
			else if (key === keybindings.scrollToHead && view.commitHead !== null) { view.scrollToCommit(view.commitHead, true, true); handledEvent(e); }
		}
	} else if (e.key === 'Escape') {
		commitsHandleEscapeKey(view, e);
	}
}

function commitsObserveKeyboardEvents(view: any) {
	document.addEventListener('keydown', (e) => {
		commitsHandleKeyDown(view, e);
	});
}
