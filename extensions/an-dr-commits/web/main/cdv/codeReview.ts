/* CDV code review helpers extracted from CommitsView */

function commitsCloseCdvContextMenuIfOpen(expandedCommit: ExpandedCommit) {
	if (expandedCommit.contextMenuOpen.summary || expandedCommit.contextMenuOpen.fileView > -1) {
		expandedCommit.contextMenuOpen.summary = false;
		expandedCommit.contextMenuOpen.fileView = -1;
		contextMenu.close();
	}
}

function commitsStartCodeReview(view: any, commitHash: string, compareWithHash: string | null, codeReview: GG.CodeReview) {
	if (view.filesPanelCommitHash !== commitHash) return;
	if (view.expandedCommit !== null && (view.expandedCommit.commitHash !== commitHash || view.expandedCommit.compareWithHash !== compareWithHash)) return;
	view.saveAndRenderCodeReview(codeReview);
}

function commitsEndCodeReview(view: any) {
	const codeReview = view.expandedCommit !== null ? view.expandedCommit.codeReview : view.filesPanelCodeReview;
	if (codeReview === null) return;
	view.saveAndRenderCodeReview(null);
}

function commitsSaveAndRenderCodeReview(view: any, codeReview: GG.CodeReview | null) {
	const fileTree = view.expandedCommit !== null ? view.expandedCommit.fileTree : view.filesPanelFileTree;
	if (fileTree === null) return;

	if (view.expandedCommit !== null) view.expandedCommit.codeReview = codeReview;
	view.filesPanelCodeReview = codeReview;
	setFileTreeReviewed(fileTree, codeReview === null);
	view.saveState();
	view.renderCodeReviewBtn();
	updateFileTreeHtml(view.filesPanel.getContentElem(), fileTree);
}

function commitsRenderCodeReviewBtn(view: any) {
	let btnElem = document.getElementById('cdvCodeReview');
	if (btnElem === null) return;

	const codeReview = view.expandedCommit !== null ? view.expandedCommit.codeReview : view.filesPanelCodeReview;
	let active = codeReview !== null;
	alterClass(btnElem, CLASS_ACTIVE, active);
	btnElem.title = (active ? 'End' : 'Start') + ' Code Review';
}
