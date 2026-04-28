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
	view.settingsBtnElem = document.getElementById('settingsBtn')!;
	view.pullBtnElem = document.getElementById('pullBtn')!;
	view.pushBtnElem = document.getElementById('pushBtn')!;
	view.moreBtnElem = document.getElementById('moreBtn')!;
}

function commitsInitDropdowns(view: any) {
	view.repoDropdown = new Dropdown('repoDropdown', true, false, 'Repos', (values: string[]) => {
		view.loadRepo(values[0]);
	});
	view.filesPanel = new FilesPanel();
	view.filesPanel.getContentElem().addEventListener('click', (e: MouseEvent) => commitsHandleFilesPanelClick(view, e));
	view.filesPanel.getContentElem().addEventListener('dblclick', (e: MouseEvent) => commitsHandleFilesPanelDblClick(view, e));
	view.branchDropdown = new BranchPanel('branchPanel', (values: string[]) => {
		const prev: string[] = Array.isArray(view.currentBranches) ? view.currentBranches : [];
		const expanded = [...values];
		if (view.config.onRepoLoad.showRemoteBranchesForSelectedLocalBranches) {
			for (const branch of values) {
				if (branch === SHOW_ALL_BRANCHES || branch === 'HEAD' || branch.startsWith('remotes/') || branch.startsWith('--glob=')) continue;
				if (prev.includes(branch)) continue;
				const upstream = view.gitBranchUpstreams[branch];
				if (typeof upstream !== 'string' || upstream === '') continue;
				const remoteBranch = view.gitBranches.includes('remotes/' + upstream) ? 'remotes/' + upstream : upstream;
				if (!expanded.includes(remoteBranch)) expanded.push(remoteBranch);
			}
		}
		view.currentBranches = expanded;
		if (expanded.length > values.length) view.branchDropdown.addToSelection(expanded);
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
	}, (type: 'branch' | 'tag', name: string) => {
		const target: RepoTarget = { type: TargetType.Repo };
		if (type === 'tag') {
			dialog.showConfirmation('Checking out tag <b><i>' + escapeHtml(name) + '</i></b> will result in a \'detached HEAD\' state — you won\'t be on any branch.', 'Yes, checkout', () => {
				runAction({ command: 'checkoutBranch', repo: view.currentRepo, branchName: name, remoteBranch: null, pullAfterwards: null }, 'Checking out Tag');
			}, target);
			return;
		}
		if (name.startsWith('remotes/')) {
			const refName = name.substring(8);
			const slash = refName.indexOf('/');
			if (slash === -1) return;
			view.checkoutBranchAction(refName, refName.substring(0, slash), null, target);
		} else {
			if (view.gitBranchHead === name) return;
			view.checkoutBranchAction(name, null, null, target);
		}
	}, view.config.branchPanel.flattenSingleChildGroups, view.config.branchPanel.groupsFirst);
}

function commitsRestoreFromPrevState(view: any, prevState: any) {
	view.currentRepo = prevState.currentRepo;
	view.currentBranches = prevState.currentBranches;
	view.currentTags = prevState.currentTags || [];
	view.maxCommits = prevState.maxCommits;
	view.expandedCommit = prevState.expandedCommit;
	view.avatars = prevState.avatars;
	view.gitConfig = prevState.gitConfig;
	view.loadRepoInfo(prevState.gitBranches, prevState.gitBranchUpstreams || {}, prevState.gitGoneUpstreamBranches || [], prevState.gitRemoteHeadTargets || {}, prevState.gitRepoInProgressState || null, prevState.gitBranchHead, prevState.gitRemotes, prevState.gitRemoteUrls || {}, prevState.gitStashes, true);
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
		if (prevState && loadViewTo === null) {
			view.scrollTop = prevState.scrollTop;
			view.viewElem.scroll(0, view.scrollTop);
		}
		view.requestLoadRepoInfoAndCommits(false, false);
	}
	if (prevState !== null && loadViewTo === null) {
		// After VS Code restores a webview, the first load sequence can occasionally stall.
		// Re-request repos shortly after startup to guarantee the view fully bootstraps.
		setTimeout(() => {
			sendMessage({ command: 'loadRepos', check: false });
		}, 350);
	}
}

function addSingleDblClick(elem: HTMLElement, onSingle: () => void, onDouble: () => void) {
	let timer: ReturnType<typeof setTimeout> | null = null;
	elem.addEventListener('click', () => {
		if (timer !== null) return;
		timer = setTimeout(() => { timer = null; onSingle(); }, 250);
	});
	elem.addEventListener('dblclick', () => {
		if (timer !== null) { clearTimeout(timer); timer = null; }
		onDouble();
	});
}

function commitsInitButtonHandlers(view: any) {
	view.findWidgetToggleBtnElem.innerHTML = SVG_ICONS.search;
	view.findWidgetToggleBtnElem.addEventListener('click', () => view.showFindWidgetFromToggle());
	view.findWidgetToggleBtnElem.addEventListener('contextmenu', (e: Event) => handledEvent(e));
	view.pullBtnElem.title = 'Fetch from Remote(s) · Double-click to Pull';
	view.pullBtnElem.innerHTML = SVG_ICONS.arrowDown;
	addSingleDblClick(view.pullBtnElem,
		() => view.gitRepoInProgressState !== null ? view.pullCurrentBranchAction() : view.fetchFromRemotesAction(),
		() => view.pullCurrentBranchAction()
	);
	view.pullBtnElem.addEventListener('contextmenu', (e: MouseEvent) => {
		handledEvent(e);
		view.showPullButtonContextMenu(e);
	});
	view.pushBtnElem.title = 'Push Current Branch · Double-click to Force Push';
	view.pushBtnElem.innerHTML = SVG_ICONS.arrowUp;
	addSingleDblClick(view.pushBtnElem,
		() => view.pushCurrentBranchAction(),
		() => view.gitRepoInProgressState !== null ? view.pushCurrentBranchAction() : view.forcePushCurrentBranchAction()
	);
	view.pushBtnElem.addEventListener('contextmenu', (e: MouseEvent) => {
		handledEvent(e);
		view.showPushButtonContextMenu(e);
	});
	view.settingsBtnElem.title = 'Repository Settings · Double-click to Refresh';
	view.settingsBtnElem.innerHTML = SVG_ICONS.gear;
	addSingleDblClick(view.settingsBtnElem,
		() => view.settingsWidget.show(view.currentRepo),
		() => view.refresh(true, true)
	);
	view.settingsBtnElem.addEventListener('contextmenu', (e: MouseEvent) => {
		handledEvent(e);
		view.showSettingsButtonContextMenu(e);
	});
	view.moreBtnElem.innerHTML = '&hellip;';
	view.moreBtnElem.addEventListener('click', (e: MouseEvent) => view.showOverflowActions(e));
	view.moreBtnElem.addEventListener('contextmenu', (e: Event) => handledEvent(e));
}
