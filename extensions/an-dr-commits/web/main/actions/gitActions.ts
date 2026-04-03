/* Git action helpers extracted from CommitsView */

function commitsGetCleanupLocalBranches(view: any) {
	return view.gitGoneUpstreamBranches.filter((branch: string) => branch !== view.gitBranchHead);
}

function commitsAddRemoteAction(view: any) {
	if (view.currentRepo === null) return;
	const pushUrlPlaceholder = 'Leave blank to use the Fetch URL';
	dialog.showForm('Add a new remote to this repository:', [
		{ type: DialogInputType.Text, name: 'Name', default: '', placeholder: null },
		{ type: DialogInputType.Text, name: 'Fetch URL', default: '', placeholder: null },
		{ type: DialogInputType.Text, name: 'Push URL', default: '', placeholder: pushUrlPlaceholder },
		{ type: DialogInputType.Checkbox, name: 'Fetch Immediately', value: true }
	], 'Add Remote', (values: any[]) => {
		runAction({
			command: 'addRemote',
			repo: view.currentRepo,
			name: <string>values[0],
			url: <string>values[1],
			pushUrl: <string>values[2] !== '' ? <string>values[2] : null,
			fetch: <boolean>values[3]
		}, 'Adding Remote');
	}, { type: TargetType.Repo });
}

function commitsHandleAddTagFormSubmit(view: any, hash: string, target: any, values: any[]) {
	const tagName = <string>values[0];
	const type = <string>values[1] === 'annotated' ? GG.TagType.Annotated : GG.TagType.Lightweight;
	const message = <string>values[2];
	const pushToRemote = view.gitRemotes.length > 1 && <string>values[3] !== '-1'
		? view.gitRemotes[parseInt(<string>values[3])]
		: view.gitRemotes.length === 1 && <boolean>values[3] ? view.gitRemotes[0] : null;
	const runAddTagAction = (force: boolean) => {
		runAction({
			command: 'addTag', repo: view.currentRepo, tagName: tagName, commitHash: hash, type: type,
			message: message, pushToRemote: pushToRemote, pushSkipRemoteCheck: globalState.pushTagSkipRemoteCheck, force: force
		}, 'Adding Tag');
	};
	if (view.gitTags.includes(tagName)) {
		dialog.showTwoButtons('A tag named <b><i>' + escapeHtml(tagName) + '</i></b> already exists, do you want to replace it with this new tag?', 'Yes, replace the existing tag', () => {
			runAddTagAction(true);
		}, 'No, choose another tag name', () => {
			view.addTagAction(hash, tagName, type, message, pushToRemote, target, false);
		}, target);
	} else {
		runAddTagAction(false);
	}
}

function commitsAddTagAction(view: any, hash: string, initialName: string, initialType: GG.TagType, initialMessage: string, initialPushToRemote: string | null, target: any, isInitialLoad: boolean = true) {
	let mostRecentTagsIndex = -1;
	for (let i = 0; i < view.commits.length; i++) {
		if (view.commits[i].tags.length > 0 && (mostRecentTagsIndex === -1 || view.commits[i].date > view.commits[mostRecentTagsIndex].date)) {
			mostRecentTagsIndex = i;
		}
	}
	const mostRecentTags = mostRecentTagsIndex > -1 ? view.commits[mostRecentTagsIndex].tags.map((tag: any) => '"' + tag.name + '"') : [];
	const inputs: DialogInput[] = [
		{ type: DialogInputType.TextRef, name: 'Name', default: initialName, info: mostRecentTags.length > 0 ? 'The most recent tag' + (mostRecentTags.length > 1 ? 's' : '') + ' in the loaded commits ' + (mostRecentTags.length > 1 ? 'are' : 'is') + ' ' + formatCommaSeparatedList(mostRecentTags) + '.' : undefined },
		{ type: DialogInputType.Select, name: 'Type', default: initialType === GG.TagType.Annotated ? 'annotated' : 'lightweight', options: [{ name: 'Annotated', value: 'annotated' }, { name: 'Lightweight', value: 'lightweight' }] },
		{ type: DialogInputType.Text, name: 'Message', default: initialMessage, placeholder: 'Optional', info: 'A message can only be added to an annotated tag.' }
	];
	if (view.gitRemotes.length > 1) {
		const options = [{ name: 'Don\'t push', value: '-1' }];
		view.gitRemotes.forEach((remote: string, i: number) => options.push({ name: remote, value: i.toString() }));
		const defaultOption = initialPushToRemote !== null ? view.gitRemotes.indexOf(initialPushToRemote) : isInitialLoad && view.config.dialogDefaults.addTag.pushToRemote ? view.gitRemotes.indexOf(view.getPushRemote()) : -1;
		inputs.push({ type: DialogInputType.Select, name: 'Push to remote', options: options, default: defaultOption.toString(), info: 'Once this tag has been added, push it to this remote.' });
	} else if (view.gitRemotes.length === 1) {
		const defaultValue = initialPushToRemote !== null || (isInitialLoad && view.config.dialogDefaults.addTag.pushToRemote);
		inputs.push({ type: DialogInputType.Checkbox, name: 'Push to remote', value: defaultValue, info: 'Once this tag has been added, push it to the repositories remote.' });
	}
	dialog.showForm('Add tag to commit <b><i>' + abbrevCommit(hash) + '</i></b>:', inputs, 'Add Tag', (values: any[]) => {
		commitsHandleAddTagFormSubmit(view, hash, target, values);
	}, target);
}

function commitsCheckoutRemoteBranch(view: any, refName: string, remote: string, prefillName: string | null, target: any, checkoutRequestState: any) {
	const branchName = prefillName !== null ? prefillName : (remote !== '' ? refName.substring(remote.length + 1) : refName);
	dialog.showRefInput('Enter the name of the new branch you would like to create when checking out <b><i>' + escapeHtml(refName) + '</i></b>:', branchName, 'Checkout Branch', (newBranch: string) => {
		if (view.gitBranches.includes(newBranch)) {
			const canPullFromRemote = remote !== '';
			dialog.showTwoButtons('The name <b><i>' + escapeHtml(newBranch) + '</i></b> is already used by another branch:', 'Choose another branch name', () => {
				view.checkoutBranchAction(refName, remote, newBranch, target);
			}, 'Checkout the existing branch' + (canPullFromRemote ? ' & pull changes' : ''), () => {
				runAction({
					command: 'checkoutBranch', repo: view.currentRepo, branchName: newBranch, remoteBranch: null,
					selectedBranches: checkoutRequestState.selectedBranches, selectedTags: checkoutRequestState.selectedTags,
					scrollTop: checkoutRequestState.scrollTop, branchPanelState: checkoutRequestState.branchPanelState,
					pullAfterwards: canPullFromRemote ? { branchName: refName.substring(remote.length + 1), remote: remote, createNewCommit: view.config.dialogDefaults.pullBranch.noFastForward, squash: view.config.dialogDefaults.pullBranch.squash } : null
				}, 'Checking out Branch' + (canPullFromRemote ? ' & Pulling Changes' : ''));
			}, target);
		} else {
			runAction({
				command: 'checkoutBranch', repo: view.currentRepo, branchName: newBranch, remoteBranch: refName,
				selectedBranches: checkoutRequestState.selectedBranches, selectedTags: checkoutRequestState.selectedTags,
				scrollTop: checkoutRequestState.scrollTop, branchPanelState: checkoutRequestState.branchPanelState, pullAfterwards: null
			}, 'Checking out Branch');
		}
	}, target);
}

function commitsCheckoutBranchAction(view: any, refName: string, remote: string | null, prefillName: string | null, target: any) {
	const checkoutRequestState = {
		selectedBranches: view.currentBranches,
		selectedTags: view.currentTags,
		scrollTop: view.scrollTop,
		branchPanelState: view.branchDropdown.getState()
	};
	if (remote !== null) {
		commitsCheckoutRemoteBranch(view, refName, remote, prefillName, target, checkoutRequestState);
	} else {
		runAction({
			command: 'checkoutBranch', repo: view.currentRepo, branchName: refName, remoteBranch: null,
			selectedBranches: checkoutRequestState.selectedBranches, selectedTags: checkoutRequestState.selectedTags,
			scrollTop: checkoutRequestState.scrollTop, branchPanelState: checkoutRequestState.branchPanelState, pullAfterwards: null
		}, 'Checking out Branch');
	}
}

function commitsCreateBranchAction(view: any, hash: string, initialName: string, initialCheckOut: boolean, target: any) {
	dialog.showForm('Create branch at commit <b><i>' + abbrevCommit(hash) + '</i></b>:', [
		{ type: DialogInputType.TextRef, name: 'Name', default: initialName },
		{ type: DialogInputType.Checkbox, name: 'Check out', value: initialCheckOut }
	], 'Create Branch', (values: any[]) => {
		const branchName = <string>values[0], checkOut = <boolean>values[1];
		if (view.gitBranches.includes(branchName)) {
			dialog.showTwoButtons('A branch named <b><i>' + escapeHtml(branchName) + '</i></b> already exists, do you want to replace it with this new branch?', 'Yes, replace the existing branch', () => {
				runAction({ command: 'createBranch', repo: view.currentRepo, branchName: branchName, commitHash: hash, checkout: checkOut, force: true }, 'Creating Branch');
			}, 'No, choose another branch name', () => {
				view.createBranchAction(hash, branchName, checkOut, target);
			}, target);
		} else {
			runAction({ command: 'createBranch', repo: view.currentRepo, branchName: branchName, commitHash: hash, checkout: checkOut, force: false }, 'Creating Branch');
		}
	}, target);
}

function commitsDeleteTagAction(view: any, refName: string, deleteOnRemote: string | null) {
	runAction({ command: 'deleteTag', repo: view.currentRepo, tagName: refName, deleteOnRemote: deleteOnRemote }, 'Deleting Tag');
}

function commitsCleanupLocalBranchesAction(view: any) {
	if (view.currentRepo === null) return;
	const branches = view.getCleanupLocalBranches();
	const skippedCurrentBranch = view.gitBranchHead !== null && view.gitGoneUpstreamBranches.includes(view.gitBranchHead);
	if (branches.length === 0) {
		dialog.showMessage(skippedCurrentBranch
			? 'The current branch <b><i>' + escapeHtml(view.gitBranchHead!) + '</i></b> has a deleted tracked upstream branch, but it cannot be cleaned up while it is checked out.'
			: 'There are no local branches with deleted tracked upstream branches to clean up.');
		return;
	}

	const branchList = '<ul style="margin:6px 0 0 18px;padding:0;">' + branches.map((branch: string) => '<li><b><i>' + escapeHtml(branch) + '</i></b></li>').join('') + '</ul>';
	const message = 'Delete the local branch' + (branches.length > 1 ? 'es' : '') + ' whose tracked remote branch no longer exists?' +
		branchList +
		(skippedCurrentBranch ? '<p style="margin:8px 0 0 0;"><i>The current branch <b>' + escapeHtml(view.gitBranchHead!) + '</b> is also marked as gone and will be skipped.</i></p>' : '');

	dialog.showForm(message, [
		{ type: DialogInputType.Checkbox, name: 'Force Delete', value: view.config.dialogDefaults.deleteBranch.forceDelete }
	], 'Delete Branch' + (branches.length > 1 ? 'es' : ''), (values: any[]) => {
		runAction({
			command: 'cleanupLocalBranches',
			repo: view.currentRepo,
			branchNames: branches,
			forceDelete: <boolean>values[0]
		}, 'Cleaning Up Branches');
	}, { type: TargetType.Repo });
}

function commitsDeleteRemoteAction(view: any, name: string) {
	if (view.currentRepo === null) return;
	dialog.showConfirmation('Are you sure you want to delete the remote <b><i>' + escapeHtml(name) + '</i></b>?', 'Yes, delete', () => {
		runAction({ command: 'deleteRemote', repo: view.currentRepo, name: name }, 'Deleting Remote');
	}, { type: TargetType.Repo });
}

function commitsFetchFromRemotesAction(view: any) {
	runAction({ command: 'fetch', repo: view.currentRepo, name: null, prune: view.config.fetchAndPrune, pruneTags: view.config.fetchAndPruneTags }, 'Fetching from Remote(s)');
}

function commitsMergeAction(view: any, obj: string, name: string, actionOn: GG.MergeActionOn, target: any) {
	dialog.showForm('Are you sure you want to merge ' + actionOn.toLowerCase() + ' <b><i>' + escapeHtml(name) + '</i></b> into ' + (view.gitBranchHead !== null ? '<b><i>' + escapeHtml(view.gitBranchHead) + '</i></b> (the current branch)' : 'the current branch') + '?', [
		{ type: DialogInputType.Checkbox, name: 'Create a new commit even if fast-forward is possible', value: view.config.dialogDefaults.merge.noFastForward },
		{ type: DialogInputType.Checkbox, name: 'Squash Commits', value: view.config.dialogDefaults.merge.squash, info: 'Create a single commit on the current branch whose effect is the same as merging this ' + actionOn.toLowerCase() + '.' },
		{ type: DialogInputType.Checkbox, name: 'No Commit', value: view.config.dialogDefaults.merge.noCommit, info: 'The changes of the merge will be staged but not committed, so that you can review and/or modify the merge result before committing.' }
	], 'Yes, merge', (values: any[]) => {
		runAction({ command: 'merge', repo: view.currentRepo, obj: obj, actionOn: actionOn, createNewCommit: <boolean>values[0], squash: <boolean>values[1], noCommit: <boolean>values[2] }, 'Merging ' + actionOn);
	}, target);
}

function commitsRebaseAction(view: any, obj: string, name: string, actionOn: GG.RebaseActionOn, target: any) {
	dialog.showForm('Are you sure you want to rebase ' + (view.gitBranchHead !== null ? '<b><i>' + escapeHtml(view.gitBranchHead) + '</i></b> (the current branch)' : 'the current branch') + ' on ' + actionOn.toLowerCase() + ' <b><i>' + escapeHtml(name) + '</i></b>?', [
		{ type: DialogInputType.Checkbox, name: 'Launch Interactive Rebase in new Terminal', value: view.config.dialogDefaults.rebase.interactive },
		{ type: DialogInputType.Checkbox, name: 'Ignore Date', value: view.config.dialogDefaults.rebase.ignoreDate, info: 'Only applicable to a non-interactive rebase.' }
	], 'Yes, rebase', (values: any[]) => {
		let interactive = <boolean>values[0];
		runAction({ command: 'rebase', repo: view.currentRepo, obj: obj, actionOn: actionOn, ignoreDate: <boolean>values[1], interactive: interactive }, interactive ? 'Launching Interactive Rebase' : 'Rebasing on ' + actionOn);
	}, target);
}

function commitsResetCurrentBranchToCommitAction(view: any, hash: string, target: any) {
	dialog.showSelect('Are you sure you want to reset ' + (view.gitBranchHead !== null ? '<b><i>' + escapeHtml(view.gitBranchHead) + '</i></b> (the current branch)' : 'the current branch') + ' to commit <b><i>' + abbrevCommit(hash) + '</i></b>?', view.config.dialogDefaults.resetCommit.mode, [
		{ name: 'Soft - Keep all changes, but reset head', value: GG.GitResetMode.Soft },
		{ name: 'Mixed - Keep working tree, but reset index', value: GG.GitResetMode.Mixed },
		{ name: 'Hard - Discard all changes', value: GG.GitResetMode.Hard }
	], 'Yes, reset', (mode: string) => {
		runAction({ command: 'resetToCommit', repo: view.currentRepo, commit: hash, resetMode: <GG.GitResetMode>mode }, 'Resetting to Commit');
	}, target);
}
