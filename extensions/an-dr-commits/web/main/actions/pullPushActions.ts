/* Pull/push action helpers extracted from CommitsView */

function commitsGetCurrentPullRemote(view: any) {
	if (view.gitBranchHead === null || view.gitBranchHead === 'HEAD' || view.gitConfig === null) return null;
	const branchConfig = view.gitConfig.branches[view.gitBranchHead];
	if (typeof branchConfig === 'undefined' || branchConfig.remote === null) return null;
	return view.gitRemotes.includes(branchConfig.remote) ? branchConfig.remote : null;
}

function commitsRunPullCurrentBranchAction(view: any, remote: string, createNewCommit: boolean, squash: boolean) {
	runAction({
		command: 'pullBranch',
		repo: view.currentRepo,
		branchName: view.gitBranchHead!,
		remote: remote,
		createNewCommit: createNewCommit,
		squash: squash
	}, 'Pulling Branch');
}

function commitsPullCurrentBranchAction(view: any) {
	if (view.gitRepoInProgressState !== null) {
		view.executeRepoInProgressAction(GG.GitRepoInProgressAction.Continue);
		return;
	}
	if (view.gitBranchHead === null || view.gitBranchHead === 'HEAD') {
		showErrorMessage('Unable to pull because there is no checked out local branch.');
		return;
	}
	const remote = view.getCurrentPullRemote();
	if (remote === null) {
		showErrorMessage('Unable to pull because the current branch has no configured remote.');
		return;
	}
	view.runPullCurrentBranchAction(remote, false, false);
}

function commitsShowPullCurrentBranchDialog(view: any) {
	if (view.gitRepoInProgressState !== null) {
		view.executeRepoInProgressAction(GG.GitRepoInProgressAction.Continue);
		return;
	}
	if (view.gitBranchHead === null || view.gitBranchHead === 'HEAD') {
		showErrorMessage('Unable to pull because there is no checked out local branch.');
		return;
	}
	const remote = view.getCurrentPullRemote();
	if (remote === null) {
		showErrorMessage('Unable to pull because the current branch has no configured remote.');
		return;
	}
	dialog.showForm('Are you sure you want to pull the remote branch <b><i>' + escapeHtml(remote + '/' + view.gitBranchHead) + '</i></b> into <b><i>' + escapeHtml(view.gitBranchHead) + '</i></b>? If a merge is required:', [
		{ type: DialogInputType.Checkbox, name: 'Create a new commit even if fast-forward is possible', value: view.config.dialogDefaults.pullBranch.noFastForward },
		{ type: DialogInputType.Checkbox, name: 'Squash Commits', value: view.config.dialogDefaults.pullBranch.squash, info: 'Create a single commit on the current branch whose effect is the same as merging this remote branch.' }
	], 'Yes, pull', (values: any[]) => {
		view.runPullCurrentBranchAction(remote, <boolean>values[0], <boolean>values[1]);
	}, null);
}

function commitsGetDefaultPushRemotes(view: any, branchName: string) {
	return [view.getPushRemote(branchName)];
}

function commitsShouldSetUpstreamForPush(view: any, branchName: string) {
	if (view.gitConfig === null || typeof view.gitConfig.branches[branchName] === 'undefined') return true;
	const branchConfig = view.gitConfig.branches[branchName];
	return branchConfig.remote === null;
}

function commitsWillPushUpdateBranchConfig(view: any, branchName: string, remotes: string[], setUpstream: boolean) {
	return setUpstream && remotes.length > 0 && (view.gitConfig === null || typeof view.gitConfig.branches[branchName] === 'undefined' || view.gitConfig.branches[branchName].remote !== remotes[remotes.length - 1]);
}

function commitsRunPushCurrentBranchAction(view: any, branchName: string, remotes: string[], setUpstream: boolean, mode: GG.GitPushBranchMode) {
	runAction({
		command: 'pushBranch',
		repo: view.currentRepo,
		branchName: branchName,
		remotes: remotes,
		setUpstream: setUpstream,
		mode: mode,
		willUpdateBranchConfig: view.willPushUpdateBranchConfig(branchName, remotes, setUpstream)
	}, 'Pushing Branch');
}

function commitsPushCurrentBranchAction(view: any) {
	if (view.gitRepoInProgressState !== null) {
		view.executeRepoInProgressAction(GG.GitRepoInProgressAction.Abort);
		return;
	}
	if (view.gitBranchHead === null || view.gitBranchHead === 'HEAD') {
		showErrorMessage('Unable to push because there is no checked out local branch.');
		return;
	}
	if (view.gitRemotes.length === 0) {
		showErrorMessage('Unable to push because this repository has no remotes.');
		return;
	}
	const branchName = view.gitBranchHead;
	const remotes = view.getDefaultPushRemotes(branchName);
	const setUpstream = view.shouldSetUpstreamForPush(branchName);
	view.runPushCurrentBranchAction(branchName, remotes, setUpstream, GG.GitPushBranchMode.Normal);
}

function commitsShowPushCurrentBranchDialog(view: any, defaultMode: GG.GitPushBranchMode = GG.GitPushBranchMode.Normal) {
	if (view.gitRepoInProgressState !== null) {
		view.executeRepoInProgressAction(GG.GitRepoInProgressAction.Abort);
		return;
	}
	if (view.gitBranchHead === null || view.gitBranchHead === 'HEAD') {
		showErrorMessage('Unable to push because there is no checked out local branch.');
		return;
	}
	if (view.gitRemotes.length === 0) {
		showErrorMessage('Unable to push because this repository has no remotes.');
		return;
	}
	const branchName = view.gitBranchHead;
	const multipleRemotes = view.gitRemotes.length > 1;
	const defaultRemotes = view.getDefaultPushRemotes(branchName);
	const inputs: DialogInput[] = [
		{ type: DialogInputType.Checkbox, name: 'Set Upstream', value: view.shouldSetUpstreamForPush(branchName) },
		{
			type: DialogInputType.Radio,
			name: 'Push Mode',
			options: [
				{ name: 'Normal', value: GG.GitPushBranchMode.Normal },
				{ name: 'Force With Lease', value: GG.GitPushBranchMode.ForceWithLease },
				{ name: 'Force', value: GG.GitPushBranchMode.Force }
			],
			default: defaultMode
		}
	];

	if (multipleRemotes) {
		inputs.unshift({
			type: DialogInputType.Select,
			name: 'Push to Remote(s)',
			defaults: defaultRemotes,
			options: view.gitRemotes.map((remote: string) => ({ name: remote, value: remote })),
			multiple: true
		});
	}

	dialog.showForm('Are you sure you want to push the branch <b><i>' + escapeHtml(branchName) + '</i></b>' + (multipleRemotes ? '' : ' to the remote <b><i>' + escapeHtml(view.gitRemotes[0]) + '</i></b>') + '?', inputs, 'Yes, push', (values: any[]) => {
		const remotes = multipleRemotes ? <string[]>values.shift() : defaultRemotes;
		const setUpstream = <boolean>values[0];
		view.runPushCurrentBranchAction(branchName, remotes, setUpstream, <GG.GitPushBranchMode>values[1]);
	}, null);
}

function commitsShowPushButtonContextMenu(view: any, event: MouseEvent) {
	if (view.gitRepoInProgressState !== null) {
		contextMenu.show([[
			{
				title: view.getRepoInProgressActionTitle(GG.GitRepoInProgressAction.Abort),
				visible: true,
				onClick: () => view.executeRepoInProgressAction(GG.GitRepoInProgressAction.Abort)
			}
		]], false, null, event, view.viewElem);
		return;
	}
	contextMenu.show([[
		{
			title: 'Push Advanced...',
			visible: true,
			onClick: () => view.showPushCurrentBranchDialog()
		}
	]], false, null, event, view.viewElem);
}

function commitsShowPullButtonContextMenu(view: any, event: MouseEvent) {
	if (view.gitRepoInProgressState !== null) {
		contextMenu.show([[
			{
				title: view.getRepoInProgressActionTitle(GG.GitRepoInProgressAction.Continue),
				visible: true,
				onClick: () => view.executeRepoInProgressAction(GG.GitRepoInProgressAction.Continue)
			}
		]], false, null, event, view.viewElem);
		return;
	}
	const fetchTitle = 'Fetch' + (view.config.fetchAndPrune ? ' & Prune' : '') + ' from Remote(s)';
	contextMenu.show([[
		{
			title: fetchTitle,
			visible: true,
			onClick: () => view.fetchFromRemotesAction()
		},
		{
			title: 'Pull Advanced...',
			visible: true,
			onClick: () => view.showPullCurrentBranchDialog()
		}
	]], false, null, event, view.viewElem);
}

function commitsShowSettingsButtonContextMenu(view: any, event: MouseEvent) {
	contextMenu.show([[
		{
			title: 'Repository Settings',
			visible: true,
			onClick: () => view.settingsWidget.show(view.currentRepo)
		},
		{
			title: 'Refresh',
			visible: true,
			onClick: () => view.refresh(true, true)
		}
	]], false, null, event, view.viewElem);
}
