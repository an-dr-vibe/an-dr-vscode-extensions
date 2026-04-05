/* CDV resizable helpers extracted from CommitsView */

function commitsSetCdvDivider(view: any) {
	let percent = (view.gitRepos[view.currentRepo].cdvDivider * 100).toFixed(2) + '%';
	let summaryElem = document.getElementById('cdvSummary'), dividerElem = document.getElementById('cdvDivider'), filesElem = document.getElementById('cdvFiles');
	if (summaryElem !== null) summaryElem.style.width = percent;
	if (dividerElem !== null) dividerElem.style.left = percent;
	if (filesElem !== null) filesElem.style.left = percent;
}

function commitsMakeCdvResizable(view: any) {
	let prevY = -1;

	const processResizingCdvHeight: EventListener = (e) => {
		if (prevY < 0) return;
		let delta = (<MouseEvent>e).pageY - prevY, isDocked = view.isCdvDocked(), windowHeight = window.innerHeight;
		prevY = (<MouseEvent>e).pageY;
		let height = view.gitRepos[view.currentRepo].cdvHeight + (isDocked ? -delta : delta);
		if (height < 100) height = 100;
		else if (height > 600) height = 600;
		if (height > windowHeight - 40) height = Math.max(windowHeight - 40, 100);

		if (view.gitRepos[view.currentRepo].cdvHeight !== height) {
			view.gitRepos[view.currentRepo].cdvHeight = height;
			let elem = document.getElementById('cdv');
			if (elem !== null) view.setCdvHeight(elem, isDocked);
			if (!isDocked) view.renderGraph();
		}
	};
	const stopResizingCdvHeight: EventListener = (e) => {
		if (prevY < 0) return;
		processResizingCdvHeight(e);
		view.saveRepoState();
		prevY = -1;
		eventOverlay.remove();
	};

	addListenerToClass('cdvHeightResize', 'mousedown', (e) => {
		prevY = (<MouseEvent>e).pageY;
		eventOverlay.create('rowResize', processResizingCdvHeight, stopResizingCdvHeight);
	});
}

function commitsMakeCdvDividerDraggable(view: any) {
	let minX = -1, width = -1;

	const processDraggingCdvDivider: EventListener = (e) => {
		if (minX < 0) return;
		let percent = ((<MouseEvent>e).clientX - minX) / width;
		if (percent < 0.2) percent = 0.2;
		else if (percent > 0.8) percent = 0.8;

		if (view.gitRepos[view.currentRepo].cdvDivider !== percent) {
			view.gitRepos[view.currentRepo].cdvDivider = percent;
			view.setCdvDivider();
		}
	};
	const stopDraggingCdvDivider: EventListener = (e) => {
		if (minX < 0) return;
		processDraggingCdvDivider(e);
		view.saveRepoState();
		minX = -1;
		eventOverlay.remove();
	};

	document.getElementById('cdvDivider')!.addEventListener('mousedown', () => {
		const contentElem = document.getElementById('cdvContent');
		if (contentElem === null) return;

		const bounds = contentElem.getBoundingClientRect();
		minX = bounds.left;
		width = bounds.width;
		eventOverlay.create('colResize', processDraggingCdvDivider, stopDraggingCdvDivider);
	});
}
