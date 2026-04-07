type CommitsTopBarButton = {
	id: string;
	elem: HTMLElement;
	visible: boolean;
	title: string;
	onClick: () => void;
};

function commitsGetTopBarButtons(view: any): CommitsTopBarButton[] {
	const repoInProgress = view.gitRepoInProgressState !== null;
	const pullPushVisible = view.gitBranchHead !== null && view.gitBranchHead !== 'HEAD' && view.gitRemotes.length > 0;
	return [
		{
			id: 'topFullDiffBtn',
			elem: view.topFullDiffBtnElem,
			visible: true,
			title: view.fullDiffMode ? 'Hide Full Diff Panel' : 'Show Full Diff Panel',
			onClick: () => view.toggleFullDiffMode(!view.fullDiffMode)
		},
		{
			id: 'pullBtn',
			elem: view.pullBtnElem,
			visible: repoInProgress || pullPushVisible,
			title: repoInProgress ? view.getRepoInProgressActionTitle(GG.GitRepoInProgressAction.Continue) : 'Fetch · Double-click to Pull (Right-Click for More Actions)',
			onClick: () => view.pullCurrentBranchAction()
		},
		{
			id: 'pushBtn',
			elem: view.pushBtnElem,
			visible: repoInProgress || pullPushVisible,
			title: repoInProgress ? view.getRepoInProgressActionTitle(GG.GitRepoInProgressAction.Abort) : 'Push · Double-click to Force Push (Right-Click for More Actions)',
			onClick: () => view.pushCurrentBranchAction()
		},
		{ id: 'settingsBtn', elem: view.settingsBtnElem, visible: true, title: 'Repository Settings · Double-click to Refresh', onClick: () => view.settingsBtnElem.click() }
	];
}

function commitsGetOverflowActionForButton(view: any, button: CommitsTopBarButton): ContextMenuAction[] {
	if (button.id === 'pullBtn') {
		if (view.gitRepoInProgressState !== null) {
			return [{ title: view.getRepoInProgressActionTitle(GG.GitRepoInProgressAction.Continue), visible: true, onClick: () => view.pullCurrentBranchAction() }];
		} else {
			return [
				{ title: 'Fetch' + (view.config.fetchAndPrune ? ' & Prune' : '') + ' from Remote(s)', visible: true, onClick: () => view.fetchFromRemotesAction() },
				{ title: 'Pull Advanced...', visible: true, onClick: () => view.showPullCurrentBranchDialog() }
			];
		}
	} else if (button.id === 'pushBtn') {
		if (view.gitRepoInProgressState !== null) {
			return [{ title: view.getRepoInProgressActionTitle(GG.GitRepoInProgressAction.Abort), visible: true, onClick: () => view.pushCurrentBranchAction() }];
		} else {
			return [
				{ title: 'Force Push (With Lease)', visible: true, onClick: () => view.forcePushCurrentBranchAction() },
				{ title: 'Push Advanced...', visible: true, onClick: () => view.showPushCurrentBranchDialog() }
			];
		}
	} else if (button.id === 'settingsBtn') {
		return [
			{ title: 'Repository Settings', visible: true, onClick: () => view.settingsWidget.show(view.currentRepo) },
			{ title: 'Refresh', visible: true, onClick: () => view.refresh(true, true) }
		];
	} else {
		return [{ title: button.title, visible: true, onClick: button.onClick }];
	}
}

function commitsShowOverflowActions(view: any, event: MouseEvent) {
	handledEvent(event);
	const hiddenButtons = commitsGetTopBarButtons(view).filter((button) => button.visible && button.elem.classList.contains('overflowHidden'));
	if (hiddenButtons.length === 0) return;
	const actions: ContextMenuAction[][] = hiddenButtons.map((button) => commitsGetOverflowActionForButton(view, button));
	contextMenu.show(actions, false, null, event, view.viewElem);
}

function commitsUpdateControlsLayout(view: any) {
	const buttons = commitsGetTopBarButtons(view);
	const isOverflowing = () => {
		const widthOverflow = view.controlsElem.scrollWidth > view.controlsElem.clientWidth;
		const leftRect = view.controlsLeftElem.getBoundingClientRect();
		const rightRect = view.controlsBtnsElem.getBoundingClientRect();
		const touching = leftRect.right >= rightRect.left - 1;
		const leftInternalOverflow = view.controlsLeftElem.scrollWidth > view.controlsLeftElem.clientWidth + 1;
		return widthOverflow || touching || leftInternalOverflow;
	};
	if (view.controlsElem.clientWidth <= 0) {
		requestAnimationFrame(() => view.updateControlsLayout());
		return;
	}

	alterClass(document.body, 'compactSearch', false);
	buttons.forEach((button) => alterClass(button.elem, 'overflowHidden', !button.visible));
	alterClass(view.moreBtnElem, 'overflowHidden', true);

	const applyLayout = () => {
		let overflow = isOverflowing();
		if (overflow) {
			alterClass(document.body, 'compactSearch', true);
			overflow = isOverflowing();
		}

		const hideOrder = ['settingsBtn', 'pushBtn', 'pullBtn', 'topFullDiffBtn'];
		for (let i = 0; i < hideOrder.length && overflow; i++) {
			const button = buttons.find((item) => item.id === hideOrder[i]);
			if (!button || !button.visible || button.elem.classList.contains('overflowHidden')) continue;
			alterClass(button.elem, 'overflowHidden', true);
			alterClass(view.moreBtnElem, 'overflowHidden', false);
			overflow = isOverflowing();
		}
		view.updateCompactFindWidgetState();
	};

	requestAnimationFrame(applyLayout);
}

function commitsShowFindWidgetFromToggle(view: any) {
	const compact = document.body.classList.contains('compactSearch');
	if (!compact) {
		view.findWidget.show(true);
		return;
	}

	const currentlyOpen = document.body.classList.contains('compactSearchWidgetOpen');
	if (currentlyOpen) {
		view.compactFindWidgetPinnedOpen = false;
		view.findWidget.close();
		view.updateCompactFindWidgetState();
		return;
	}

	view.compactFindWidgetPinnedOpen = true;
	view.findWidget.show(true);
	view.updateCompactFindWidgetState();
}

function commitsUpdateCompactFindWidgetState(view: any) {
	const compact = document.body.classList.contains('compactSearch');
	if (!compact) {
		view.compactFindWidgetPinnedOpen = false;
		alterClass(document.body, 'compactSearchWidgetOpen', false);
		alterClass(view.findWidgetToggleBtnElem, CLASS_ACTIVE, false);
		const host = document.getElementById('findWidgetHost');
		if (host !== null) {
			host.style.removeProperty('left');
			host.style.removeProperty('top');
		}
		return;
	}

	const shouldShowWidget = view.compactFindWidgetPinnedOpen || view.findWidget.isVisible();
	alterClass(document.body, 'compactSearchWidgetOpen', shouldShowWidget);
	alterClass(view.findWidgetToggleBtnElem, CLASS_ACTIVE, shouldShowWidget);
	if (shouldShowWidget) {
		commitsPositionCompactFindWidget(view);
	}
}

function commitsPositionCompactFindWidget(view: any) {
	const host = document.getElementById('findWidgetHost');
	if (host === null) return;

	requestAnimationFrame(() => {
		const btnRect = view.findWidgetToggleBtnElem.getBoundingClientRect();
		const hostRect = host.getBoundingClientRect();
		const margin = 8;
		let left = btnRect.left;
		const maxLeft = window.innerWidth - hostRect.width - margin;
		if (left > maxLeft) left = Math.max(margin, maxLeft);
		if (left < margin) left = margin;
		const top = btnRect.bottom + 6;
		host.style.left = Math.round(left) + 'px';
		host.style.top = Math.round(top) + 'px';
	});
}
