/* CDV code review helpers extracted from CommitsView */

function commitsCloseCdvContextMenuIfOpen(expandedCommit: ExpandedCommit) {
	if (expandedCommit.contextMenuOpen.summary || expandedCommit.contextMenuOpen.fileView > -1) {
		expandedCommit.contextMenuOpen.summary = false;
		expandedCommit.contextMenuOpen.fileView = -1;
		contextMenu.close();
	}
}

function commitsStartCodeReview(view: any, commitHash: string, compareWithHash: string | null, codeReview: GG.CodeReview) {
	if (view.expandedCommit === null || view.expandedCommit.commitHash !== commitHash || view.expandedCommit.compareWithHash !== compareWithHash) return;
	view.saveAndRenderCodeReview(codeReview);
}

function commitsEndCodeReview(view: any) {
	if (view.expandedCommit === null || view.expandedCommit.codeReview === null) return;
	view.saveAndRenderCodeReview(null);
}

function commitsSaveAndRenderCodeReview(view: any, codeReview: GG.CodeReview | null) {
	let filesElem = document.getElementById('cdvFiles');
	if (view.expandedCommit === null || view.expandedCommit.fileTree === null || filesElem === null) return;

	view.expandedCommit.codeReview = codeReview;
	setFileTreeReviewed(view.expandedCommit.fileTree, codeReview === null);
	view.saveState();
	view.renderCodeReviewBtn();
	updateFileTreeHtml(filesElem, view.expandedCommit.fileTree);
}

function commitsRenderCodeReviewBtn(view: any) {
	if (view.expandedCommit === null) return;
	let btnElem = document.getElementById('cdvCodeReview');
	if (btnElem === null) return;

	let active = view.expandedCommit.codeReview !== null;
	alterClass(btnElem, CLASS_ACTIVE, active);
	btnElem.title = (active ? 'End' : 'Start') + ' Code Review';
}
