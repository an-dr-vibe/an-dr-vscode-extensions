function commitsGetRepoInProgressStateLabel(view: any) {
	if (view.gitRepoInProgressState === null) return 'Repository Action';
	switch (view.gitRepoInProgressState.type) {
		case GG.GitRepoInProgressStateType.Rebase: return 'Rebase';
		case GG.GitRepoInProgressStateType.Merge: return 'Merge';
		case GG.GitRepoInProgressStateType.CherryPick: return 'Cherry-pick';
		case GG.GitRepoInProgressStateType.Revert: return 'Revert';
	}
	return 'Repository Action';
}

function commitsGetRepoInProgressStateStatusVerb(view: any) {
	if (view.gitRepoInProgressState === null) return 'processing';
	switch (view.gitRepoInProgressState.type) {
		case GG.GitRepoInProgressStateType.Rebase: return 'rebasing';
		case GG.GitRepoInProgressStateType.Merge: return 'merging';
		case GG.GitRepoInProgressStateType.CherryPick: return 'cherry-pick';
		case GG.GitRepoInProgressStateType.Revert: return 'reverting';
	}
	return 'processing';
}

function commitsFormatRepoInProgressWorkingTreeStatus(view: any) {
	const state = view.gitRepoInProgressState;
	const workingTreeStatus = state !== null && typeof state.workingTreeStatus !== 'undefined' ? state.workingTreeStatus : null;
	if (state === null || workingTreeStatus === null) return 'Working Tree/Index';

	const parts: string[] = [];
	if (workingTreeStatus.changed > 0) parts.push(workingTreeStatus.changed + ' changed');
	if (workingTreeStatus.staged > 0) parts.push(workingTreeStatus.staged + ' staged');
	if (workingTreeStatus.conflicts > 0) parts.push(workingTreeStatus.conflicts + ' conflicts');
	if (workingTreeStatus.untracked > 0) parts.push(workingTreeStatus.untracked + ' untracked');
	return 'Working Tree/Index (' + (parts.length > 0 ? parts.join(', ') : 'clean') + ')';
}

function commitsUpdateRepoInProgressBannerOffset(view: any) {
	const offset = view.repoInProgressBannerElem.classList.contains('active') ? view.repoInProgressBannerElem.offsetHeight : 0;
	view.commitGraphElem.style.top = offset.toString() + 'px';
}

function commitsRenderRepoInProgressBanner(view: any) {
	if (view.gitRepoInProgressState === null) {
		alterClass(view.repoInProgressBannerElem, 'active', false);
		alterClass(view.repoInProgressBannerElem, 'conflicted', false);
		view.repoInProgressBannerPrimaryElem.textContent = '';
		view.repoInProgressBannerSecondaryElem.textContent = '';
		commitsUpdateRepoInProgressBannerOffset(view);
		return;
	}

	const stateVerb = commitsGetRepoInProgressStateStatusVerb(view);
	const rebaseProgress = typeof view.gitRepoInProgressState.rebaseProgress === 'undefined' ? null : view.gitRepoInProgressState.rebaseProgress;
	const progressText = rebaseProgress !== null ? ' (' + rebaseProgress.current + '/' + rebaseProgress.total + ')' : '';
	view.repoInProgressBannerPrimaryElem.innerHTML = 'The working tree is in <b>' + escapeHtml(stateVerb) + '-state' + escapeHtml(progressText) + '</b>.';

	let secondary = commitsFormatRepoInProgressWorkingTreeStatus(view);
	const rebaseContext = typeof view.gitRepoInProgressState.rebaseContext === 'undefined' ? null : view.gitRepoInProgressState.rebaseContext;
	if (rebaseContext !== null) {
		const branch = rebaseContext.branch, onto = rebaseContext.onto;
		if (branch !== null && onto !== null) secondary += ', rebasing ' + branch + ' onto ' + onto;
		else if (branch !== null) secondary += ', rebasing ' + branch;
		else if (onto !== null) secondary += ', rebasing onto ' + onto;
	}
	const subject = typeof view.gitRepoInProgressState.subject === 'undefined' ? null : view.gitRepoInProgressState.subject;
	if (subject !== null) secondary += ', ' + stateVerb + ': ' + subject;
	view.repoInProgressBannerSecondaryElem.textContent = secondary;
	const workingTreeStatus = typeof view.gitRepoInProgressState.workingTreeStatus === 'undefined' ? null : view.gitRepoInProgressState.workingTreeStatus;
	alterClass(view.repoInProgressBannerElem, 'conflicted', workingTreeStatus !== null && workingTreeStatus.conflicts > 0);
	alterClass(view.repoInProgressBannerElem, 'active', true);
	requestAnimationFrame(() => commitsUpdateRepoInProgressBannerOffset(view));
}

function commitsGetRepoInProgressActionTitle(view: any, action: GG.GitRepoInProgressAction) {
	const stateLabel = commitsGetRepoInProgressStateLabel(view);
	if (action === GG.GitRepoInProgressAction.Continue) {
		if (view.gitRepoInProgressState !== null && view.gitRepoInProgressState.type === GG.GitRepoInProgressStateType.Rebase && view.gitRepoInProgressState.rebaseProgress !== null) {
			return 'Continue ' + stateLabel + ' (' + view.gitRepoInProgressState.rebaseProgress.current + '/' + view.gitRepoInProgressState.rebaseProgress.total + ')';
		}
		return 'Continue ' + stateLabel;
	}
	return 'Abort ' + stateLabel;
}

function commitsExecuteRepoInProgressAction(view: any, action: GG.GitRepoInProgressAction) {
	if (view.gitRepoInProgressState === null) {
		showErrorMessage('No repository in-progress action is currently available.');
		return;
	}
	const run = () => {
		runAction({
			command: 'repoInProgressAction',
			repo: view.currentRepo,
			state: view.gitRepoInProgressState!.type,
			action: action,
			selectedBranches: view.currentBranches,
			selectedTags: view.currentTags,
			scrollTop: view.scrollTop,
			branchPanelState: view.branchDropdown.getState()
		}, view.getRepoInProgressActionTitle(action));
	};
	if (action === GG.GitRepoInProgressAction.Abort && view.config.dialogDefaults.repoInProgress.confirmAbort) {
		dialog.showConfirmation(
			'Are you sure you want to abort the current <b><i>' + escapeHtml(view.getRepoInProgressStateLabel()) + '</i></b> operation?',
			'Yes, abort', run, { type: TargetType.Repo }
		);
	} else {
		run();
	}
}
