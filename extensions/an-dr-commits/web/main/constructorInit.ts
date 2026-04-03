function commitsInitDomElements(view: any) {
	view.controlsElem = document.getElementById('controls')!;
	view.controlsLeftElem = document.getElementById('controlsLeft')!;
	view.controlsBtnsElem = document.getElementById('controlsBtns')!;
	view.commitGraphElem = document.getElementById('commitGraph')!;
	view.repoInProgressBannerElem = document.getElementById('repoInProgressBanner')!;
	view.repoInProgressBannerPrimaryElem = document.getElementById('repoInProgressBannerPrimary')!;
	view.repoInProgressBannerSecondaryElem = document.getElementById('repoInProgressBannerSecondary')!;
	view.tableElem = document.getElementById('commitTable')!;
	view.footerElem = document.getElementById('footer')!;
	view.scrollShadowElem = document.getElementById('scrollShadow')!;
	view.findWidgetToggleBtnElem = document.getElementById('findWidgetToggleBtn')!;
	view.topFullDiffBtnElem = document.getElementById('topFullDiffBtn')!;
	view.settingsBtnElem = document.getElementById('settingsBtn')!;
	view.pullBtnElem = document.getElementById('pullBtn')!;
	view.pushBtnElem = document.getElementById('pushBtn')!;
	view.moreBtnElem = document.getElementById('moreBtn')!;
}

function commitsInitDropdowns(view: any) {
	view.repoDropdown = new Dropdown('repoDropdown', true, false, 'Repos', (values: string[]) => {
		view.loadRepo(values[0]);
	});
	view.branchDropdown = new BranchPanel('branchPanel', (values: string[]) => {
		view.currentBranches = values;
		view.maxCommits = view.config.initialLoadCommits;
		view.saveState();
		view.clearCommits();
		view.requestLoadRepoInfoAndCommits(true, true);
	}, (values: string[]) => {
		view.currentTags = values;
		view.saveState();
		view.renderTable();
	}, (type: any, name: string, event: MouseEvent) => {
		void view.openSidebarContextMenu(type, name, event);
	}, view.config.branchPanel.flattenSingleChildGroups, view.config.branchPanel.groupsFirst);
}

function commitsRestoreFromPrevState(view: any, prevState: any) {
	view.currentRepo = prevState.currentRepo;
	view.currentBranches = prevState.currentBranches;
	view.currentTags = prevState.currentTags || [];
	view.maxCommits = prevState.maxCommits;
	view.expandedCommit = prevState.expandedCommit;
	view.fullDiffMode = !!prevState.fullDiffMode;
	view.avatars = prevState.avatars;
	view.gitConfig = prevState.gitConfig;
	view.loadRepoInfo(prevState.gitBranches, prevState.gitBranchUpstreams || {}, prevState.gitGoneUpstreamBranches || [], prevState.gitRemoteHeadTargets || {}, prevState.gitRepoInProgressState || null, prevState.gitBranchHead, prevState.gitRemotes, prevState.gitStashes, true);
	view.loadCommits(prevState.commits, prevState.commitHead, prevState.gitTags, prevState.moreCommitsAvailable, prevState.onlyFollowFirstParent);
	view.branchDropdown.restoreState(prevState.branchPanel);
	view.findWidget.restoreState(prevState.findWidget);
	view.settingsWidget.restoreState(prevState.settingsWidget);
}

function commitsResolveLoadViewTo(view: any, prevState: any, canRestoreFromPrevState: boolean): GG.LoadCommitsViewTo {
	let loadViewTo = initialState.loadViewTo;
	if (loadViewTo === null && prevState && typeof prevState.currentRepo !== 'undefined' && typeof view.gitRepos[prevState.currentRepo] !== 'undefined' && !canRestoreFromPrevState) {
		loadViewTo = {
			repo: prevState.currentRepo,
			selectedBranches: prevState.currentBranches,
			selectedTags: prevState.currentTags || [],
			scrollTop: prevState.scrollTop,
			branchPanelState: prevState.branchPanel
		};
	}
	if (loadViewTo !== null) {
		view.pendingBranchPanelState = typeof loadViewTo.branchPanelState !== 'undefined' ? loadViewTo.branchPanelState! : null;
	}
	return loadViewTo;
}

function commitsBootstrapLoad(view: any, prevState: any, loadViewTo: GG.LoadCommitsViewTo) {
	if (!view.loadRepos(view.gitRepos, initialState.lastActiveRepo, loadViewTo)) {
		if (prevState) {
			view.scrollTop = prevState.scrollTop;
			view.viewElem.scroll(0, view.scrollTop);
		}
		view.requestLoadRepoInfoAndCommits(false, false);
	}
	if (prevState !== null) {
		// After VS Code restores a webview, the first load sequence can occasionally stall.
		// Re-request repos shortly after startup to guarantee the view fully bootstraps.
		setTimeout(() => {
			sendMessage({ command: 'loadRepos', check: false });
		}, 350);
	}
}

function commitsInitButtonHandlers(view: any) {
	view.findWidgetToggleBtnElem.innerHTML = SVG_ICONS.search;
	view.findWidgetToggleBtnElem.addEventListener('click', () => view.showFindWidgetFromToggle());
	view.findWidgetToggleBtnElem.addEventListener('contextmenu', (e: Event) => handledEvent(e));
	view.topFullDiffBtnElem.innerHTML = SVG_ICONS.fullDiff;
	view.topFullDiffBtnElem.addEventListener('click', () => view.toggleFullDiffMode(!view.fullDiffMode));
	view.topFullDiffBtnElem.addEventListener('contextmenu', (e: Event) => handledEvent(e));
	view.pullBtnElem.title = 'Pull Current Branch (Right-Click for More Actions)';
	view.pullBtnElem.innerHTML = SVG_ICONS.arrowDown;
	view.pullBtnElem.addEventListener('click', () => view.pullCurrentBranchAction());
	view.pullBtnElem.addEventListener('contextmenu', (e: MouseEvent) => {
		handledEvent(e);
		view.showPullButtonContextMenu(e);
	});
	view.pushBtnElem.title = 'Push Current Branch (Right-Click for More Actions)';
	view.pushBtnElem.innerHTML = SVG_ICONS.arrowUp;
	view.pushBtnElem.addEventListener('click', () => view.pushCurrentBranchAction());
	view.pushBtnElem.addEventListener('contextmenu', (e: MouseEvent) => {
		handledEvent(e);
		view.showPushButtonContextMenu(e);
	});
	view.settingsBtnElem.innerHTML = SVG_ICONS.gear;
	view.settingsBtnElem.addEventListener('click', () => view.settingsWidget.show(view.currentRepo));
	view.settingsBtnElem.addEventListener('contextmenu', (e: MouseEvent) => {
		handledEvent(e);
		view.showSettingsButtonContextMenu(e);
	});
	view.moreBtnElem.innerHTML = '&hellip;';
	view.moreBtnElem.addEventListener('click', (e: MouseEvent) => view.showOverflowActions(e));
	view.moreBtnElem.addEventListener('contextmenu', (e: Event) => handledEvent(e));
}
