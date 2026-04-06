/* Commit Details View resizable helpers extracted from CommitsView */

function commitsSetCommitDetailsViewDivider(view: any) {
	let percent = (view.gitRepos[view.currentRepo].commitDetailsViewDivider * 100).toFixed(2) + '%';
	let summaryElem = document.getElementById('commitDetailsViewSummary'), dividerElem = document.getElementById('commitDetailsViewDivider'), filesElem = document.getElementById('commitDetailsViewFiles');
	if (summaryElem !== null) summaryElem.style.width = percent;
	if (dividerElem !== null) dividerElem.style.left = percent;
	if (filesElem !== null) filesElem.style.left = percent;
}

function commitsMakeCommitDetailsViewResizable(view: any) {
	let prevY = -1;

	const processResizingCommitDetailsViewHeight: EventListener = (e) => {
		if (prevY < 0) return;
		let delta = (<MouseEvent>e).pageY - prevY, isDocked = view.isCommitDetailsViewDocked(), windowHeight = window.innerHeight;
		prevY = (<MouseEvent>e).pageY;
		let height = view.gitRepos[view.currentRepo].commitDetailsViewHeight + (isDocked ? -delta : delta);
		if (height < 100) height = 100;
		else if (height > 600) height = 600;
		if (height > windowHeight - 40) height = Math.max(windowHeight - 40, 100);

		if (view.gitRepos[view.currentRepo].commitDetailsViewHeight !== height) {
			view.gitRepos[view.currentRepo].commitDetailsViewHeight = height;
			let elem = document.getElementById('commitDetailsView');
			if (elem !== null) view.setCommitDetailsViewHeight(elem, isDocked);
			if (!isDocked) view.renderGraph();
		}
	};
	const stopResizingCommitDetailsViewHeight: EventListener = (e) => {
		if (prevY < 0) return;
		processResizingCommitDetailsViewHeight(e);
		view.saveRepoState();
		prevY = -1;
		eventOverlay.remove();
	};

	addListenerToClass('commitDetailsViewHeightResize', 'mousedown', (e) => {
		prevY = (<MouseEvent>e).pageY;
		eventOverlay.create('rowResize', processResizingCommitDetailsViewHeight, stopResizingCommitDetailsViewHeight);
	});
}

function commitsMakeCommitDetailsViewDividerDraggable(view: any) {
	let minX = -1, width = -1;

	const processDraggingCommitDetailsViewDivider: EventListener = (e) => {
		if (minX < 0) return;
		let percent = ((<MouseEvent>e).clientX - minX) / width;
		if (percent < 0.2) percent = 0.2;
		else if (percent > 0.8) percent = 0.8;

		if (view.gitRepos[view.currentRepo].commitDetailsViewDivider !== percent) {
			view.gitRepos[view.currentRepo].commitDetailsViewDivider = percent;
			view.setCommitDetailsViewDivider();
		}
	};
	const stopDraggingCommitDetailsViewDivider: EventListener = (e) => {
		if (minX < 0) return;
		processDraggingCommitDetailsViewDivider(e);
		view.saveRepoState();
		minX = -1;
		eventOverlay.remove();
	};

	document.getElementById('commitDetailsViewDivider')!.addEventListener('mousedown', () => {
		const contentElem = document.getElementById('commitDetailsViewContent');
		if (contentElem === null) return;

		const bounds = contentElem.getBoundingClientRect();
		minX = bounds.left;
		width = bounds.width;
		eventOverlay.create('colResize', processDraggingCommitDetailsViewDivider, stopDraggingCommitDetailsViewDivider);
	});
}
