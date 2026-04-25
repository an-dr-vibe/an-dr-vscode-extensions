function commitsLoadRepos(view: any, repos: GG.GitRepoSet, lastActiveRepo: string | null, loadViewTo: GG.LoadCommitsViewTo) {
	view.gitRepos = repos;
	view.saveState();

	let newRepo: string;
	if (loadViewTo !== null && view.currentRepo !== loadViewTo.repo && typeof repos[loadViewTo.repo] !== 'undefined') {
		newRepo = loadViewTo.repo;
	} else if (typeof repos[view.currentRepo] === 'undefined') {
		newRepo = lastActiveRepo !== null && typeof repos[lastActiveRepo] !== 'undefined'
			? lastActiveRepo
			: getSortedRepositoryPaths(repos, view.config.repoDropdownOrder)[0];
	} else {
		newRepo = view.currentRepo;
	}

	const isSingleRepo = Object.keys(repos).length === 1;
	alterClass(view.controlsElem, 'singleRepo', isSingleRepo);
	alterClass(document.body, 'singleRepo', isSingleRepo);
	view.renderRepoDropdownOptions(newRepo);

	if (loadViewTo !== null) {
		if (loadViewTo.repo === newRepo) {
			view.loadViewTo = loadViewTo;
		} else {
			view.loadViewTo = null;
			showErrorMessage('Unable to load the Commits View for the repository "' + loadViewTo.repo + '". It is not currently included in Commits.');
		}
	} else {
		view.loadViewTo = null;
	}

	if (view.currentRepo !== newRepo) {
		view.loadRepo(newRepo);
		return true;
	}
	view.finaliseRepoLoad(false);
	return false;
}

function commitsLoadRepo(view: any, repo: string) {
	view.currentRepo = repo;
	view.currentRepoLoading = true;
	view.maxCommits = view.config.initialLoadCommits;
	view.gitConfig = null;
	view.gitRemotes = [];
	view.gitRemoteUrls = {};
	if (view.branchDropdown) view.branchDropdown.setRemoteUrls({});
	view.gitStashes = [];
	view.gitTags = [];
	view.gitBranchUpstreams = {};
	view.gitGoneUpstreamBranches = [];
	view.gitRemoteHeadTargets = {};
	view.gitRepoInProgressState = null;
	view.currentBranches = null;
	view.renderFetchButton();
	view.closeCommitDetails(false);
	view.settingsWidget.close();
	view.saveState();
	view.refresh(true);
}

function commitsIsSameRepoInProgressState(a: GG.GitRepoInProgressState | null, b: GG.GitRepoInProgressState | null) {
	if (a === null && b === null) return true;
	if (a === null || b === null || a.type !== b.type) return false;
	const aRebaseProgress = typeof a.rebaseProgress === 'undefined' ? null : a.rebaseProgress;
	const bRebaseProgress = typeof b.rebaseProgress === 'undefined' ? null : b.rebaseProgress;
	const aRebaseContext = typeof a.rebaseContext === 'undefined' ? null : a.rebaseContext;
	const bRebaseContext = typeof b.rebaseContext === 'undefined' ? null : b.rebaseContext;
	const aWorkingTreeStatus = typeof a.workingTreeStatus === 'undefined' ? null : a.workingTreeStatus;
	const bWorkingTreeStatus = typeof b.workingTreeStatus === 'undefined' ? null : b.workingTreeStatus;
	const aSubject = typeof a.subject === 'undefined' ? null : a.subject;
	const bSubject = typeof b.subject === 'undefined' ? null : b.subject;
	const rebaseProgressEqual = ((aRebaseProgress === null && bRebaseProgress === null) || (aRebaseProgress !== null && bRebaseProgress !== null && aRebaseProgress.current === bRebaseProgress.current && aRebaseProgress.total === bRebaseProgress.total));
	const workingTreeStatusEqual = ((aWorkingTreeStatus === null && bWorkingTreeStatus === null) || (aWorkingTreeStatus !== null && bWorkingTreeStatus !== null && aWorkingTreeStatus.changed === bWorkingTreeStatus.changed && aWorkingTreeStatus.staged === bWorkingTreeStatus.staged && aWorkingTreeStatus.conflicts === bWorkingTreeStatus.conflicts && aWorkingTreeStatus.untracked === bWorkingTreeStatus.untracked));
	const rebaseCommitStatesEqual = (((typeof a.rebaseCommitStates === 'undefined' ? null : a.rebaseCommitStates) === null && (typeof b.rebaseCommitStates === 'undefined' ? null : b.rebaseCommitStates) === null) || ((typeof a.rebaseCommitStates === 'undefined' ? null : a.rebaseCommitStates) !== null && (typeof b.rebaseCommitStates === 'undefined' ? null : b.rebaseCommitStates) !== null && arraysEqual((typeof a.rebaseCommitStates === 'undefined' ? null : a.rebaseCommitStates)!, (typeof b.rebaseCommitStates === 'undefined' ? null : b.rebaseCommitStates)!, (x, y) => x.hash === y.hash && x.kind === y.kind && x.offset === y.offset)));
	return rebaseProgressEqual && (((aRebaseContext === null && bRebaseContext === null) || (aRebaseContext !== null && bRebaseContext !== null && aRebaseContext.branch === bRebaseContext.branch && aRebaseContext.onto === bRebaseContext.onto))) && rebaseCommitStatesEqual && workingTreeStatusEqual && aSubject === bSubject;
}

function commitsGetRebaseSequenceBadgeHtml(view: any, commitHash: string) {
	if (view.gitRepoInProgressState === null || view.gitRepoInProgressState.type !== GG.GitRepoInProgressStateType.Rebase) return '';
	const states = typeof view.gitRepoInProgressState.rebaseCommitStates === 'undefined' ? null : view.gitRepoInProgressState.rebaseCommitStates;
	if (states === null) return '';
	const match = states.find((state: any) => commitHash.toLowerCase().startsWith(state.hash.toLowerCase()));
	if (typeof match === 'undefined') return '';
	const label = match.kind === 'in-progress' ? 'in-progress' : match.kind + ' ' + (match.offset > 0 ? '+' + match.offset : match.offset.toString());
	return '<span class="rebaseSeqBadge ' + match.kind + '">' + escapeHtml(label) + '</span>';
}

function commitsLoadRepoInfo(view: any, branchOptions: ReadonlyArray<string>, branchUpstreams: { readonly [branchName: string]: string }, goneUpstreamBranches: ReadonlyArray<string>, remoteHeadTargets: { readonly [remoteName: string]: string }, repoInProgressState: GG.GitRepoInProgressState | null, branchHead: string | null, remotes: ReadonlyArray<string>, remoteUrls: { readonly [remoteName: string]: string | null }, stashes: ReadonlyArray<GG.GitStash>, isRepo: boolean) {
	view.gitStashes = stashes;
	if (!isRepo || (!view.currentRepoRefreshState.hard && arraysStrictlyEqual(view.gitBranches, branchOptions) && shallowStringMapEqual(view.gitBranchUpstreams, branchUpstreams) && arraysStrictlyEqual(view.gitGoneUpstreamBranches, goneUpstreamBranches) && shallowStringMapEqual(view.gitRemoteHeadTargets, remoteHeadTargets) && commitsIsSameRepoInProgressState(view.gitRepoInProgressState, repoInProgressState) && view.gitBranchHead === branchHead && arraysStrictlyEqual(view.gitRemotes, remotes))) {
		view.saveState();
		view.finaliseLoadRepoInfo(false, isRepo);
		return;
	}

	view.gitBranches = branchOptions;
	view.gitBranchUpstreams = branchUpstreams;
	view.gitGoneUpstreamBranches = goneUpstreamBranches;
	view.gitRemoteHeadTargets = remoteHeadTargets;
	view.gitRepoInProgressState = repoInProgressState;
	view.gitBranchHead = branchHead;
	view.gitRemotes = remotes;
	view.gitRemoteUrls = remoteUrls;
	view.renderFetchButton();

	if (view.loadViewTo !== null && view.loadViewTo.repo === view.currentRepo) {
		if (typeof view.loadViewTo.selectedBranches !== 'undefined') view.currentBranches = view.loadViewTo.selectedBranches;
		if (typeof view.loadViewTo.selectedTags !== 'undefined') view.currentTags = view.loadViewTo.selectedTags;
	}

	if (view.currentBranches !== null && !(view.currentBranches.length === 1 && view.currentBranches[0] === SHOW_ALL_BRANCHES)) {
		const globPatterns = view.config.customBranchGlobPatterns.map((pattern: GG.CustomBranchGlobPattern) => pattern.glob);
		view.currentBranches = view.currentBranches.filter((branch: string) => view.gitBranches.includes(branch) || globPatterns.includes(branch));
	}
	if (view.currentBranches === null || view.currentBranches.length === 0) {
		view.currentBranches = getInitialBranchesOnRepoLoad(view);
		if (view.currentBranches.length === 0) view.currentBranches.push(SHOW_ALL_BRANCHES);
	}

	view.saveState();
	view.branchDropdown.setOptions(view.getBranchOptions(true), view.currentBranches);
	view.branchDropdown.setRemoteUrls(view.gitRemoteUrls);
	if (view.pendingBranchPanelState !== null) view.branchDropdown.restoreState(view.pendingBranchPanelState);

	const hiddenRemotes = view.gitRepos[view.currentRepo].hideRemotes;
	const hideRemotes = hiddenRemotes.filter((hiddenRemote: string) => remotes.includes(hiddenRemote));
	if (hiddenRemotes.length !== hideRemotes.length) view.saveRepoStateValue(view.currentRepo, 'hideRemotes', hideRemotes);
	view.finaliseLoadRepoInfo(true, isRepo);
}

function getInitialBranchesOnRepoLoad(view: any): string[] {
	const mode = view.config.onRepoLoad.mode;
	if (mode === 'showAll') {
		return [];
	}
	if (mode === 'currentBranch') {
		return view.gitBranchHead !== null ? [view.gitBranchHead] : [];
	}
	if (mode === 'currentBranchAndMainMaster') {
		const branches: string[] = [];
		if (view.gitBranchHead !== null) {
			branches.push(view.gitBranchHead);
		}
		const mainlineBranch = findMainlineBranch(view);
		if (mainlineBranch !== null && !branches.includes(mainlineBranch)) {
			branches.push(mainlineBranch);
		}
		return branches;
	}

	const onRepoLoadShowCheckedOutBranch = getOnRepoLoadShowCheckedOutBranch(view.gitRepos[view.currentRepo].onRepoLoadShowCheckedOutBranch);
	const onRepoLoadShowSpecificBranches = getOnRepoLoadShowSpecificBranches(view.gitRepos[view.currentRepo].onRepoLoadShowSpecificBranches);
	const branches: string[] = [];
	if (onRepoLoadShowSpecificBranches.length > 0) {
		const globPatterns = view.config.customBranchGlobPatterns.map((pattern: GG.CustomBranchGlobPattern) => pattern.glob);
		branches.push(...onRepoLoadShowSpecificBranches.filter((branch: string) => view.gitBranches.includes(branch) || globPatterns.includes(branch)));
	}
	if (onRepoLoadShowCheckedOutBranch && view.gitBranchHead !== null && !branches.includes(view.gitBranchHead)) {
		branches.push(view.gitBranchHead);
	}
	return branches;
}

function findMainlineBranch(view: any): string | null {
	const preferredBranches = ['main', 'master'];
	for (const branch of preferredBranches) {
		if (view.gitBranches.includes(branch)) {
			return branch;
		}
	}
	for (const branch of view.gitBranches) {
		if (branch.startsWith('remotes/') && (branch.endsWith('/main') || branch.endsWith('/master'))) {
			return branch;
		}
	}
	return null;
}

function commitsFinaliseLoadRepoInfo(view: any, repoInfoChanges: boolean, isRepo: boolean) {
	const refreshState = view.currentRepoRefreshState;
	if (!refreshState.inProgress) return;
	if (isRepo) {
		refreshState.repoInfoChanges = refreshState.repoInfoChanges || repoInfoChanges;
		refreshState.requestingRepoInfo = false;
		view.requestLoadCommits();
		return;
	}
	dialog.closeActionRunning();
	refreshState.inProgress = false;
	view.loadViewTo = null;
	view.renderRefreshButton();
	sendMessage({ command: 'loadRepos', check: true });
}

function commitsHandleUnchangedCommits(view: any, commits: GG.GitCommit[], tagsChanged: boolean) {
	if (view.commits[0].hash === UNCOMMITTED) {
		view.commits[0] = commits[0];
		view.saveState();
		view.renderUncommittedChanges();
		if (view.expandedCommit !== null && view.expandedCommit.commitElem !== null) {
			if (view.expandedCommit.compareWithHash === null) {
				if (view.expandedCommit.commitHash === UNCOMMITTED) view.requestCommitDetails(view.expandedCommit.commitHash, true);
			} else if (view.expandedCommit.compareWithElem !== null && (view.expandedCommit.commitHash === UNCOMMITTED || view.expandedCommit.compareWithHash === UNCOMMITTED)) {
				view.requestCommitComparison(view.expandedCommit.commitHash, view.expandedCommit.compareWithHash, true);
			}
		}
	} else if (tagsChanged) {
		view.saveState();
	}
	view.finaliseLoadCommits();
}

function commitsLoadCommits(view: any, commits: GG.GitCommit[], commitHead: string | null, tags: ReadonlyArray<string>, moreAvailable: boolean, onlyFollowFirstParent: boolean) {
	const tagsChanged = !arraysStrictlyEqual(view.gitTags, tags);
	view.gitTags = tags;
	if (tagsChanged) {
		view.currentTags = view.currentTags.filter((tagName: string) => view.gitTags.includes(tagName));
		view.branchDropdown.setTags(tags);
		view.branchDropdown.setSelectedTags(view.currentTags);
	}
	if (!view.currentRepoLoading && !view.currentRepoRefreshState.hard && view.moreCommitsAvailable === moreAvailable && view.onlyFollowFirstParent === onlyFollowFirstParent && view.commitHead === commitHead && commits.length > 0 && arraysEqual(view.commits, commits, (a, b) => a.hash === b.hash && arraysStrictlyEqual(a.heads, b.heads) && arraysEqual(a.tags, b.tags, (x, y) => x.name === y.name && x.annotated === y.annotated) && arraysEqual(a.remotes, b.remotes, (x, y) => x.name === y.name && x.remote === y.remote) && arraysStrictlyEqual(a.parents, b.parents) && ((a.stash === null && b.stash === null) || (a.stash !== null && b.stash !== null && a.stash.selector === b.stash.selector))) && view.renderedGitBranchHead === view.gitBranchHead) {
		commitsHandleUnchangedCommits(view, commits, tagsChanged);
		return;
	}
	const currentRepoLoading = view.currentRepoLoading;
	view.currentRepoLoading = false;
	view.moreCommitsAvailable = moreAvailable;
	view.onlyFollowFirstParent = onlyFollowFirstParent;
	view.commits = commits;
	view.commitHead = commitHead;
	view.commitLookup = {};
	let expandedCommitVisible = false, expandedCompareWithCommitVisible = false;
	const avatarsNeeded: { [email: string]: string[] } = {};
	for (let i = 0; i < view.commits.length; i++) {
		const commit = view.commits[i];
		view.commitLookup[commit.hash] = i;
		if (view.expandedCommit !== null) {
			if (view.expandedCommit.commitHash === commit.hash) expandedCommitVisible = true;
			else if (view.expandedCommit.compareWithHash === commit.hash) expandedCompareWithCommitVisible = true;
		}
		if (view.shouldFetchAuthorAvatars() && typeof view.avatars[commit.email] !== 'string' && commit.email !== '') {
			if (typeof avatarsNeeded[commit.email] === 'undefined') avatarsNeeded[commit.email] = [commit.hash];
			else avatarsNeeded[commit.email].push(commit.hash);
		}
	}
	if (view.expandedCommit !== null && (!expandedCommitVisible || (view.expandedCommit.compareWithHash !== null && !expandedCompareWithCommitVisible))) {
		view.closeCommitDetails(false);
	}
	view.saveState();
	view.graph.loadCommits(view.commits, view.commitHead, view.commitLookup, view.onlyFollowFirstParent);
	view.render();
	if (currentRepoLoading && view.config.onRepoLoad.scrollToHead && view.commitHead !== null) view.scrollToCommit(view.commitHead, true);
	view.finaliseLoadCommits();
	view.requestAvatars(avatarsNeeded);
}

function commitsFinaliseLoadCommits(view: any) {
	const refreshState = view.currentRepoRefreshState;
	if (refreshState.inProgress) {
		dialog.closeActionRunning();
		if (dialog.isTargetDynamicSource()) {
			if (refreshState.repoInfoChanges) dialog.close();
			else dialog.refresh(view.getCommits());
		}
		if (contextMenu.isTargetDynamicSource()) {
			if (refreshState.repoInfoChanges) contextMenu.close();
			else contextMenu.refresh(view.getCommits());
		}
		refreshState.inProgress = false;
		view.renderRefreshButton();
	}
	view.finaliseRepoLoad(true);
}

function commitsFinaliseRepoLoad(view: any, didLoadRepoData: boolean) {
	if (view.loadViewTo !== null && view.currentRepo === view.loadViewTo.repo) {
		if (view.loadViewTo.commitDetails && (view.expandedCommit === null || view.expandedCommit.commitHash !== view.loadViewTo.commitDetails.commitHash || view.expandedCommit.compareWithHash !== view.loadViewTo.commitDetails.compareWithHash)) {
			const commitIndex = view.getCommitId(view.loadViewTo.commitDetails.commitHash);
			const compareWithIndex = view.loadViewTo.commitDetails.compareWithHash !== null ? view.getCommitId(view.loadViewTo.commitDetails.compareWithHash) : null;
			const commitElems = getCommitElems();
			const commitElem = findCommitElemWithId(commitElems, commitIndex);
			const compareWithElem = findCommitElemWithId(commitElems, compareWithIndex);
			if (commitElem !== null && (view.loadViewTo.commitDetails.compareWithHash === null || compareWithElem !== null)) {
				if (compareWithElem !== null) view.loadCommitComparison(commitElem, compareWithElem);
				else view.loadCommitDetails(commitElem);
			} else {
				showErrorMessage('Unable to resume Code Review, it could not be found in the latest ' + view.maxCommits + ' commits that were loaded in this repository.');
			}
		} else if (view.loadViewTo.runCommandOnLoad) {
			if (view.loadViewTo.runCommandOnLoad === 'fetch') view.fetchFromRemotesAction();
			else if (view.loadViewTo.runCommandOnLoad === 'pull') view.pullCurrentBranchAction();
			else if (view.loadViewTo.runCommandOnLoad === 'push') view.pushCurrentBranchAction();
		}
		if (typeof view.loadViewTo.scrollTop === 'number') {
			view.scrollTop = view.loadViewTo.scrollTop;
			view.viewElem.scroll(0, view.scrollTop);
		}
	}
	if (view.pendingBranchPanelState !== null) {
		view.branchDropdown.restoreState(view.pendingBranchPanelState);
		view.pendingBranchPanelState = null;
	}
	view.loadViewTo = null;
	if (view.gitConfig === null || (didLoadRepoData && view.currentRepoRefreshState.configChanges)) view.requestLoadConfig();
}

function commitsClearCommits(view: any) {
	closeDialogAndContextMenu();
	view.moreCommitsAvailable = false;
	view.commits = [];
	view.commitHead = null;
	view.commitLookup = {};
	view.renderedGitBranchHead = null;
	view.closeCommitDetails(false);
	view.saveState();
	view.graph.loadCommits(view.commits, view.commitHead, view.commitLookup, view.onlyFollowFirstParent);
	view.tableElem.innerHTML = '';
	view.footerElem.innerHTML = '';
	view.renderGraph();
	view.findWidget.refresh();
}

function commitsProcessLoadRepoInfoResponse(view: any, msg: GG.ResponseLoadRepoInfo) {
	if (msg.error === null) {
		const refreshState = view.currentRepoRefreshState;
		if (refreshState.inProgress && refreshState.loadRepoInfoRefreshId === msg.refreshId) {
			view.loadRepoInfo(msg.branches, msg.branchUpstreams, msg.goneUpstreamBranches, msg.remoteHeadTargets, msg.repoInProgressState, msg.head, msg.remotes, msg.remoteUrls ?? {}, msg.stashes, msg.isRepo);
		}
	} else {
		view.displayLoadDataError('Unable to load Repository Info', msg.error);
	}
}

function commitsProcessLoadCommitsResponse(view: any, msg: GG.ResponseLoadCommits) {
	if (msg.error === null) {
		const refreshState = view.currentRepoRefreshState;
		if (refreshState.inProgress && refreshState.loadCommitsRefreshId === msg.refreshId) {
			view.loadCommits(msg.commits, msg.head, msg.tags, msg.moreCommitsAvailable, msg.onlyFollowFirstParent);
		}
	} else {
		const error = view.gitBranches.length === 0 && msg.error.indexOf('bad revision \'HEAD\'') > -1 ? 'There are no commits in this repository.' : msg.error;
		view.displayLoadDataError('Unable to load Commits', error);
	}
}

function commitsProcessLoadConfig(view: any, msg: GG.ResponseLoadConfig) {
	view.currentRepoRefreshState.requestingConfig = false;
	if (msg.config !== null && view.currentRepo === msg.repo) {
		view.gitConfig = msg.config;
		view.saveState();
		view.renderCommitDetailsViewExternalDiffBtn();
	}
	view.settingsWidget.refresh();
}

function commitsDisplayLoadDataError(view: any, message: string, reason: string) {
	view.clearCommits();
	view.currentRepoRefreshState.inProgress = false;
	view.loadViewTo = null;
	view.renderRefreshButton();
	dialog.showError(message, reason, 'Retry', () => {
		view.refresh(true);
	});
}
