function commitsGetBranches(view: any): ReadonlyArray<string> {
	return view.gitBranches;
}

function commitsGetBranchOptions(view: any, includeShowAll?: boolean): ReadonlyArray<DialogSelectInputOption> {
	const options: DialogSelectInputOption[] = [];
	if (includeShowAll) {
		options.push({ name: 'Show All', value: SHOW_ALL_BRANCHES });
		options.push({ name: 'HEAD', value: 'HEAD' });
	}
	for (let i = 0; i < view.config.customBranchGlobPatterns.length; i++) {
		options.push({ name: 'Glob: ' + view.config.customBranchGlobPatterns[i].name, value: view.config.customBranchGlobPatterns[i].glob });
	}
	for (let i = 0; i < view.gitBranches.length; i++) {
		const branch = view.gitBranches[i];
		if (branch === 'HEAD') continue;
		let isRemoteDefault = false, remoteDefaultHint: string | undefined;
		if (branch.startsWith('remotes/')) {
			const firstSlash = branch.indexOf('/', 8);
			if (firstSlash > -1) {
				const remoteName = branch.substring(8, firstSlash);
				const remoteRefName = branch.substring(8);
				const remoteHeadRef = 'remotes/' + remoteName + '/HEAD';
				const remoteHeadTarget = view.gitRemoteHeadTargets[remoteName];
				if (branch === remoteHeadRef && typeof remoteHeadTarget === 'string' && remoteHeadTarget !== '') continue;
				if (typeof remoteHeadTarget === 'string' && remoteHeadTarget === remoteRefName) {
					isRemoteDefault = true;
					remoteDefaultHint = remoteName + '/HEAD -> ' + remoteHeadTarget;
				}
			}
		}
		const upstream = view.config.branchPanel.showLocalBranchUpstream && branch.indexOf('remotes/') !== 0 ? view.gitBranchUpstreams[branch] : undefined;
		options.push({
			name: branch.indexOf('remotes/') === 0 ? branch.substring(8) : branch,
			value: branch,
			isCurrent: branch === view.gitBranchHead,
			isRemoteDefault: isRemoteDefault,
			remoteDefaultHint: remoteDefaultHint,
			hint: typeof upstream === 'string' ? (view.gitGoneUpstreamBranches.includes(branch) ? '? ' + upstream : '= ' + upstream) : undefined,
			hintKind: typeof upstream === 'string' ? (view.gitGoneUpstreamBranches.includes(branch) ? 'gone' : 'upstream') : undefined
		});
	}
	return options;
}

function commitsGetRemoteHeadTargets(view: any) {
	return view.gitRemoteHeadTargets;
}

function commitsGetCommitId(view: any, hash: string) {
	return typeof view.commitLookup[hash] === 'number' ? view.commitLookup[hash] : null;
}

function commitsGetCommitOfElem(view: any, elem: HTMLElement) {
	let id = parseInt(elem.dataset.id!);
	return id < view.commits.length ? view.commits[id] : null;
}

function commitsUpdateSelectionClasses(view: any) {
	const elems = getCommitElems();
	for (let i = 0; i < elems.length; i++) {
		const id = parseInt(elems[i].dataset.id!);
		const hash = id < view.commits.length ? view.commits[id].hash : null;
		alterClass(elems[i], 'selected', hash !== null && view.selectedCommits.has(hash));
	}
}

function commitsSelectCommit(view: any, hash: string, index: number) {
	view.selectedCommits = new Set([hash]);
	view.lastSelectedIndex = index;
	view.updateSelectionClasses();
}

function commitsToggleCommitSelection(view: any, hash: string, index: number) {
	if (view.selectedCommits.has(hash)) {
		view.selectedCommits.delete(hash);
	} else {
		view.selectedCommits.add(hash);
	}
	view.lastSelectedIndex = index;
	view.updateSelectionClasses();
}

function commitsRangeSelectCommits(view: any, toIndex: number) {
	const from = view.lastSelectedIndex >= 0 ? view.lastSelectedIndex : toIndex;
	const lo = Math.min(from, toIndex), hi = Math.max(from, toIndex);
	for (let i = lo; i <= hi; i++) {
		if (i < view.commits.length) view.selectedCommits.add(view.commits[i].hash);
	}
	view.lastSelectedIndex = toIndex;
	view.updateSelectionClasses();
}

function commitsPreviewCommitComparison(view: any, hash1: string, hash2: string) {
	const order = view.getCommitOrder(hash1, hash2);
	if (view.previewCompareHashes !== null &&
		view.previewCompareHashes[0] === order.from &&
		view.previewCompareHashes[1] === order.to) return;
	view.previewCommitHash = null;         // cancel any pending single-commit preview
	view.previewCompareHashes = [order.from, order.to];
	view.filesPanelCommitHash = null;
	view.filesPanelFileChanges = null;
	view.filesPanelFileTree = null;
	view.filesPanelCompareWithHash = null;
	view.resetDiffState();
	view.filesPanel.setContentLoading();
	view.requestCommitComparison(order.from, order.to, false);
}

function commitsApplyComparisonPreviewResponse(view: any, commitHash: string, compareWithHash: string, fileChanges: ReadonlyArray<GG.GitFileChange>, fileTree: FileTreeFolder) {
	if (view.previewCompareHashes === null) return;
	const [h1, h2] = view.previewCompareHashes;
	if (!((commitHash === h1 && compareWithHash === h2) || (commitHash === h2 && compareWithHash === h1))) return;
	if (view.expandedCommit !== null) return;
	view.filesPanelFileChanges = fileChanges;
	view.filesPanelFileTree = fileTree;
	view.filesPanelCompareWithHash = compareWithHash;
	view.filesPanelCommitHash = commitHash;
	const isUncommitted = compareWithHash === UNCOMMITTED || commitHash === UNCOMMITTED;
	view.filesPanel.update(fileTree, fileChanges, -1, commitsGetFileViewType(view), isUncommitted);
	commitsPopulateFilesPanelHeader(view, false);
	view.makeCommitDetailsViewFileViewInteractive();
}

function commitsUpdateSelectionPreview(view: any) {
	if (view.expandedCommit !== null) return;
	const hashes: string[] = [];
	view.selectedCommits.forEach((h: string) => hashes.push(h));
	if (hashes.length === 2) {
		view.previewCommitComparison(hashes[0], hashes[1]);
	} else if (hashes.length === 1) {
		view.previewCommitFiles(hashes[0]);
	} else {
		view.previewCommitHash = null;     // cancel any pending single-commit preview
		view.resetDiffState();
		view.filesPanel.clear();
		view.filesPanelCommitHash = null;
		view.filesPanelFileChanges = null;
		view.filesPanelFileTree = null;
		view.filesPanelCompareWithHash = null;
		view.previewCompareHashes = null;
	}
}

function commitsGetCommits(view: any): ReadonlyArray<GG.GitCommit> {
	return view.commits;
}

function commitsGetPushRemote(view: any, branch: string | null = null) {
	const possibleRemotes = [];
	if (view.gitConfig !== null) {
		if (branch !== null && typeof view.gitConfig.branches[branch] !== 'undefined') {
			possibleRemotes.push(view.gitConfig.branches[branch].pushRemote, view.gitConfig.branches[branch].remote);
		}
		possibleRemotes.push(view.gitConfig.pushDefault);
	}
	possibleRemotes.push('origin');
	return possibleRemotes.find((remote) => remote !== null && view.gitRemotes.includes(remote)) || view.gitRemotes[0];
}

function commitsGetRepoConfig(view: any): Readonly<GG.GitRepoConfig> | null {
	return view.gitConfig;
}

function commitsGetRepoState(view: any, repo: string): Readonly<GG.GitRepoState> | null {
	return typeof view.gitRepos[repo] !== 'undefined' ? view.gitRepos[repo] : null;
}

function commitsIsConfigLoading(view: any) {
	return view.currentRepoRefreshState.requestingConfig;
}

function commitsRefresh(view: any, hard: boolean, configChanges: boolean = false) {
	if (hard) view.clearCommits();
	view.requestLoadRepoInfoAndCommits(hard, false, configChanges);
}

function commitsRequestLoadRepoInfo(view: any) {
	const repoState = view.gitRepos[view.currentRepo];
	sendMessage({
		command: 'loadRepoInfo',
		repo: view.currentRepo,
		refreshId: ++view.currentRepoRefreshState.loadRepoInfoRefreshId,
		showRemoteBranches: true,
		showStashes: getShowStashes(repoState.showStashes),
		hideRemotes: repoState.hideRemotes
	});
}

function commitsRequestLoadCommits(view: any) {
	const repoState = view.gitRepos[view.currentRepo];
	sendMessage({
		command: 'loadCommits',
		repo: view.currentRepo,
		refreshId: ++view.currentRepoRefreshState.loadCommitsRefreshId,
		branches: view.currentBranches === null || (view.currentBranches.length === 1 && view.currentBranches[0] === SHOW_ALL_BRANCHES) ? null : view.currentBranches,
		maxCommits: view.maxCommits,
		showTags: true,
		showRemoteBranches: true,
		includeCommitsMentionedByReflogs: getIncludeCommitsMentionedByReflogs(repoState.includeCommitsMentionedByReflogs),
		onlyFollowFirstParent: getOnlyFollowFirstParent(repoState.onlyFollowFirstParent),
		commitOrdering: getCommitOrdering(repoState.commitOrdering),
		remotes: view.gitRemotes,
		hideRemotes: repoState.hideRemotes,
		stashes: view.gitStashes
	});
}

function commitsRequestLoadRepoInfoAndCommits(view: any, hard: boolean, skipRepoInfo: boolean, configChanges: boolean = false) {
	const refreshState = view.currentRepoRefreshState;
	if (refreshState.inProgress) {
		refreshState.hard = refreshState.hard || hard;
		refreshState.configChanges = refreshState.configChanges || configChanges;
		if (!skipRepoInfo) refreshState.loadCommitsRefreshId++;
	} else {
		refreshState.hard = hard;
		refreshState.inProgress = true;
		refreshState.repoInfoChanges = false;
		refreshState.configChanges = configChanges;
		refreshState.requestingRepoInfo = false;
	}

	view.renderRefreshButton();
	if (view.commits.length === 0) view.tableElem.innerHTML = '<h2 id="loadingHeader">' + SVG_ICONS.loading + 'Loading ...</h2>';
	if (skipRepoInfo) {
		if (!refreshState.requestingRepoInfo) view.requestLoadCommits();
	} else {
		refreshState.requestingRepoInfo = true;
		view.requestLoadRepoInfo();
	}
}

function commitsRequestLoadConfig(view: any) {
	view.currentRepoRefreshState.requestingConfig = true;
	sendMessage({ command: 'loadConfig', repo: view.currentRepo, remotes: view.gitRemotes });
	view.settingsWidget.refresh();
}

function commitsRequestCommitDetails(view: any, hash: string, refresh: boolean) {
	let commit = view.commits[view.commitLookup[hash]];
	const requestAvatar = view.shouldFetchAuthorAvatars() && hash !== UNCOMMITTED && commit.email !== '';
	sendMessage({ command: 'commitDetails', repo: view.currentRepo, commitHash: hash, hasParents: commit.parents.length > 0, stash: commit.stash, avatarEmail: requestAvatar ? commit.email : null, refresh: refresh });
}

function commitsRequestCommitComparison(view: any, hash: string, compareWithHash: string, refresh: boolean) {
	let commitOrder = view.getCommitOrder(hash, compareWithHash);
	sendMessage({ command: 'compareCommits', repo: view.currentRepo, commitHash: hash, compareWithHash: compareWithHash, fromHash: commitOrder.from, toHash: commitOrder.to, refresh: refresh });
}

function commitsRequestAvatars(view: any, avatars: { [email: string]: string[] }) {
	if (!view.shouldFetchAuthorAvatars()) return;
	let emails = Object.keys(avatars), remote = view.gitRemotes.length > 0 ? (view.gitRemotes.includes('origin') ? 'origin' : view.gitRemotes[0]) : null;
	for (let i = 0; i < emails.length; i++) sendMessage({ command: 'fetchAvatar', repo: view.currentRepo, remote: remote, email: emails[i], commits: avatars[emails[i]] });
}

function commitsSaveState(view: any) {
	let expandedCommit;
	if (view.expandedCommit !== null) {
		expandedCommit = Object.assign({}, view.expandedCommit);
		expandedCommit.commitElem = null;
		expandedCommit.compareWithElem = null;
		expandedCommit.contextMenuOpen = { summary: false, fileView: -1 };
	} else {
		expandedCommit = null;
	}
	VSCODE_API.setState({
		currentRepo: view.currentRepo,
		currentRepoLoading: view.currentRepoLoading,
		gitRepos: view.gitRepos,
		gitBranches: view.gitBranches,
		gitBranchUpstreams: view.gitBranchUpstreams,
		gitGoneUpstreamBranches: view.gitGoneUpstreamBranches,
		gitRemoteHeadTargets: view.gitRemoteHeadTargets,
		gitRepoInProgressState: view.gitRepoInProgressState,
		gitBranchHead: view.gitBranchHead,
		gitConfig: view.gitConfig,
		gitRemotes: view.gitRemotes,
		gitStashes: view.gitStashes,
		gitTags: view.gitTags,
		commits: view.commits,
		commitHead: view.commitHead,
		avatars: view.avatars,
		currentBranches: view.currentBranches,
		currentTags: view.currentTags,
		moreCommitsAvailable: view.moreCommitsAvailable,
		maxCommits: view.maxCommits,
		onlyFollowFirstParent: view.onlyFollowFirstParent,
		expandedCommit: expandedCommit,
		fullDiffMode: view.fullDiffMode,
		scrollTop: view.scrollTop,
		branchPanel: view.branchDropdown.getState(),
		findWidget: view.findWidget.getState(),
		settingsWidget: view.settingsWidget.getState()
	});
}

function commitsSaveRepoState(view: any) {
	sendMessage({ command: 'setRepoState', repo: view.currentRepo, state: view.gitRepos[view.currentRepo] });
}

function commitsSaveColumnWidths(view: any, columnWidths: GG.ColumnWidth[]) {
	view.gitRepos[view.currentRepo].columnWidths = [columnWidths[0], columnWidths[2], columnWidths[3]];
	view.saveRepoState();
}

function commitsSaveExpandedCommitLoading(view: any, index: number, commitHash: string, commitElem: HTMLElement, compareWithHash: string | null, compareWithElem: HTMLElement | null) {
	view.expandedCommit = {
		index: index,
		commitHash: commitHash,
		commitElem: commitElem,
		compareWithHash: compareWithHash,
		compareWithElem: compareWithElem,
		commitDetails: null,
		fileChanges: null,
		fileTree: null,
		avatar: null,
		loading: true,
		scrollTop: { summary: 0, fileView: 0 },
		contextMenuOpen: { summary: false, fileView: -1 }
	};
	view.saveState();
}

function commitsSaveRepoStateValue(view: any, repo: string, key: keyof GG.GitRepoState, value: any) {
	if (repo === view.currentRepo) {
		view.gitRepos[view.currentRepo][key] = value;
		view.saveRepoState();
	}
}
