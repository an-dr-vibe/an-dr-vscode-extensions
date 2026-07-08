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
			id: 'repoRefreshBtn',
			elem: view.repoRefreshBtnElem,
			visible: true,
			title: 'Refresh',
			onClick: () => view.refresh(true, true)
		},
		{
			id: 'resetBtn',
			elem: view.resetBtnElem,
			visible: true,
			title: 'Reset to HEAD',
			onClick: () => view.resetToHeadAction()
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
		{ id: 'settingsBtn', elem: view.settingsBtnElem, visible: true, title: 'Repository Settings', onClick: () => view.settingsBtnElem.click() }
	];
}

function commitsGetOverflowActionForButton(view: any, button: CommitsTopBarButton): ContextMenuAction[] {
	if (button.id === 'repoRefreshBtn') {
		return [{ title: 'Refresh', visible: true, onClick: () => view.refresh(true, true) }];
	} else if (button.id === 'resetBtn') {
		return [{ title: 'Reset to HEAD', visible: true, onClick: () => view.resetToHeadAction() }];
	} else if (button.id === 'pullBtn') {
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
		return [{ title: 'Repository Settings', visible: true, onClick: () => view.settingsWidget.show(view.currentRepo) }];
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
		return widthOverflow || touching;
	};
	if (view.controlsElem.clientWidth <= 0) {
		requestAnimationFrame(() => view.updateControlsLayout());
		return;
	}

	buttons.forEach((button) => alterClass(button.elem, 'overflowHidden', !button.visible));
	alterClass(view.moreBtnElem, 'overflowHidden', true);

	const applyLayout = () => {
		let overflow = isOverflowing();
		// repoRefreshBtn collapses first - it's the most redundant of the five (Settings'
		// own double-click already refreshes), so it's the first to give up its spot.
		const hideOrder = ['repoRefreshBtn', 'settingsBtn', 'pushBtn', 'pullBtn', 'resetBtn'];
		for (let i = 0; i < hideOrder.length && overflow; i++) {
			const button = buttons.find((item) => item.id === hideOrder[i]);
			if (!button || !button.visible || button.elem.classList.contains('overflowHidden')) continue;
			alterClass(button.elem, 'overflowHidden', true);
			alterClass(view.moreBtnElem, 'overflowHidden', false);
			overflow = isOverflowing();
		}
	};

	requestAnimationFrame(applyLayout);
}

/**
 * Toggle the search panel. If already open (e.g. via Ctrl+F), re-focus the input
 * rather than closing — closing is reserved for the button click and Escape key.
 * The button click uses the outer `toggleSearchPanel()` path which calls this only
 * when the button is clicked directly, so we distinguish by caller intent via
 * `fromButton`. Direct button click toggles; keyboard shortcut always opens.
 */
function commitsShowFindWidgetFromToggle(view: any, fromButton: boolean = false) {
	const isOpen = document.body.classList.contains('searchPanelOpen');
	if (isOpen) {
		if (fromButton) {
			commitsCloseSearchPanel(view);
		} else {
			view.findWidget.show(true);
		}
	} else {
		commitsOpenSearchPanel(view);
	}
}

/** Open the search panel row and focus the find input. */
function commitsOpenSearchPanel(view: any) {
	alterClass(document.body, 'searchPanelOpen', true);
	alterClass(view.findWidgetToggleBtnElem, CLASS_ACTIVE, true);
	view.findWidget.show(true);
	view.requestControlsLayoutUpdate();
}

/** Close the search panel row and clear the find widget. */
function commitsCloseSearchPanel(view: any) {
	view.findWidget.close();
	alterClass(document.body, 'searchPanelOpen', false);
	alterClass(view.findWidgetToggleBtnElem, CLASS_ACTIVE, false);
	view.requestControlsLayoutUpdate();
}

function commitsUpdateCompactFindWidgetState(_view: any) {
	// No-op: compact floating mode removed; search always lives in #searchPanel.
}

const MIN_CONTENT_WIDTH = 300;

/**
 * Temporarily hide the branch panel via CSS only (no state change) when
 * the files panel is open and the content area is too narrow to read.
 * The branch panel's own hidden/visible state is never touched.
 */
function commitsAutoHideBranchPanel(view: any) {
	const filesPanelOpen = !view.filesPanel.isHidden();
	const branchPanelUserHidden = view.branchDropdown.isHidden();

	if (!filesPanelOpen || branchPanelUserHidden) {
		alterClass(document.body, 'branchPanelAutoHidden', false);
		return;
	}

	// Read branch panel's natural width from its CSS variable — this is stable regardless
	// of whether the panel is currently auto-hidden (the CSS override doesn't change the
	// variable, only the visual width), so there is no oscillation risk.
	const filesPanel = document.getElementById('filesPanel');
	const filesPanelWidth = filesPanel ? filesPanel.offsetWidth : 0;
	const branchPanelWidth = parseInt(document.body.style.getPropertyValue('--branch-panel-width') || '200', 10) || 200;
	const availableWidth = document.documentElement.clientWidth - filesPanelWidth - branchPanelWidth;
	const tooNarrow = availableWidth < MIN_CONTENT_WIDTH;

	alterClass(document.body, 'branchPanelAutoHidden', tooNarrow);
}
