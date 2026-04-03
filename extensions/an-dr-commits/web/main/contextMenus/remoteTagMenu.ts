/* Remote branch, stash, tag, and issue context menu helpers extracted from CommitsView */

function commitsGetRemoteBranchContextMenuActions(view: any, remote: string, target: any): ContextMenuActions {
	const refName = target.ref, visibility = view.config.contextMenuActionsVisibility.remoteBranch;
	const branchName = remote !== '' ? refName.substring(remote.length + 1) : '';
	const prefixedRefName = 'remotes/' + refName;
	const isSelectedInBranchesDropdown = view.branchDropdown.isSelected(prefixedRefName);
	return [[
		{ title: 'Checkout Branch' + ELLIPSIS, visible: visibility.checkout, onClick: () => view.checkoutBranchAction(refName, remote, null, target) },
		{ title: 'Delete Remote Branch' + ELLIPSIS, visible: visibility.delete && remote !== '', onClick: () => {
			dialog.showConfirmation('Are you sure you want to delete the remote branch <b><i>' + escapeHtml(refName) + '</i></b>?', 'Yes, delete', () => {
				runAction({ command: 'deleteRemoteBranch', repo: view.currentRepo, branchName: branchName, remote: remote }, 'Deleting Remote Branch');
			}, target);
		}},
		{ title: 'Fetch into local branch' + ELLIPSIS, visible: visibility.fetch && remote !== '' && view.gitBranches.includes(branchName) && view.gitBranchHead !== branchName, onClick: () => {
			dialog.showForm('Are you sure you want to fetch the remote branch <b><i>' + escapeHtml(refName) + '</i></b> into the local branch <b><i>' + escapeHtml(branchName) + '</i></b>?', [{ type: DialogInputType.Checkbox, name: 'Force Fetch', value: view.config.dialogDefaults.fetchIntoLocalBranch.forceFetch, info: 'Force the local branch to be reset to this remote branch.' }], 'Yes, fetch', (values: any[]) => {
				runAction({ command: 'fetchIntoLocalBranch', repo: view.currentRepo, remote: remote, remoteBranch: branchName, localBranch: branchName, force: <boolean>values[0] }, 'Fetching Branch');
			}, target);
		}},
		{ title: 'Merge into current branch' + ELLIPSIS, visible: visibility.merge, onClick: () => view.mergeAction(refName, refName, GG.MergeActionOn.RemoteTrackingBranch, target) },
		{ title: 'Pull into current branch' + ELLIPSIS, visible: visibility.pull && remote !== '', onClick: () => {
			dialog.showForm('Are you sure you want to pull the remote branch <b><i>' + escapeHtml(refName) + '</i></b> into ' + (view.gitBranchHead !== null ? '<b><i>' + escapeHtml(view.gitBranchHead) + '</i></b> (the current branch)' : 'the current branch') + '? If a merge is required:', [
				{ type: DialogInputType.Checkbox, name: 'Create a new commit even if fast-forward is possible', value: view.config.dialogDefaults.pullBranch.noFastForward },
				{ type: DialogInputType.Checkbox, name: 'Squash Commits', value: view.config.dialogDefaults.pullBranch.squash, info: 'Create a single commit on the current branch whose effect is the same as merging this remote branch.' }
			], 'Yes, pull', (values: any[]) => {
				runAction({ command: 'pullBranch', repo: view.currentRepo, branchName: branchName, remote: remote, createNewCommit: <boolean>values[0], squash: <boolean>values[1] }, 'Pulling Branch');
			}, target);
		}}
	], [
		view.getViewIssueAction(refName, visibility.viewIssue, target),
		{ title: 'Create Pull Request', visible: visibility.createPullRequest && view.gitRepos[view.currentRepo].pullRequestConfig !== null && branchName !== 'HEAD' && (view.gitRepos[view.currentRepo].pullRequestConfig!.sourceRemote === remote || view.gitRepos[view.currentRepo].pullRequestConfig!.destRemote === remote), onClick: () => {
			const config = view.gitRepos[view.currentRepo].pullRequestConfig;
			if (config === null) return;
			const isDestRemote = config.destRemote === remote;
			runAction({ command: 'createPullRequest', repo: view.currentRepo, config: config, sourceRemote: isDestRemote ? config.destRemote! : config.sourceRemote, sourceOwner: isDestRemote ? config.destOwner : config.sourceOwner, sourceRepo: isDestRemote ? config.destRepo : config.sourceRepo, sourceBranch: branchName, push: false }, 'Creating Pull Request');
		}}
	], [
		{ title: 'Create Archive', visible: visibility.createArchive, onClick: () => { runAction({ command: 'createArchive', repo: view.currentRepo, ref: refName }, 'Creating Archive'); } },
		{ title: 'Select in Branches Dropdown', visible: visibility.selectInBranchesDropdown && !isSelectedInBranchesDropdown, onClick: () => view.branchDropdown.selectOption(prefixedRefName) },
		{ title: 'Unselect in Branches Dropdown', visible: visibility.unselectInBranchesDropdown && isSelectedInBranchesDropdown, onClick: () => view.branchDropdown.unselectOption(prefixedRefName) }
	], [
		{ title: 'Copy Branch Name to Clipboard', visible: visibility.copyName, onClick: () => { sendMessage({ command: 'copyToClipboard', type: 'Branch Name', data: refName }); } }
	]];
}

function commitsGetStashCoreMenuGroup(view: any, selector: string, target: any, visibility: any): ContextMenuAction[] {
	return [
		{ title: 'Apply Stash' + ELLIPSIS, visible: visibility.apply, onClick: () => { dialog.showForm('Are you sure you want to apply the stash <b><i>' + escapeHtml(selector.substring(5)) + '</i></b>?', [{ type: DialogInputType.Checkbox, name: 'Reinstate Index', value: view.config.dialogDefaults.applyStash.reinstateIndex, info: 'Attempt to reinstate the indexed changes, in addition to the working tree\'s changes.' }], 'Yes, apply stash', (values: any[]) => { runAction({ command: 'applyStash', repo: view.currentRepo, selector: selector, reinstateIndex: <boolean>values[0] }, 'Applying Stash'); }, target); } },
		{ title: 'Create Branch from Stash' + ELLIPSIS, visible: visibility.createBranch, onClick: () => { dialog.showRefInput('Create a branch from stash <b><i>' + escapeHtml(selector.substring(5)) + '</i></b> with the name:', '', 'Create Branch', (branchName: string) => { runAction({ command: 'branchFromStash', repo: view.currentRepo, selector: selector, branchName: branchName }, 'Creating Branch'); }, target); } },
		{ title: 'Pop Stash' + ELLIPSIS, visible: visibility.pop, onClick: () => { dialog.showForm('Are you sure you want to pop the stash <b><i>' + escapeHtml(selector.substring(5)) + '</i></b>?', [{ type: DialogInputType.Checkbox, name: 'Reinstate Index', value: view.config.dialogDefaults.popStash.reinstateIndex, info: 'Attempt to reinstate the indexed changes, in addition to the working tree\'s changes.' }], 'Yes, pop stash', (values: any[]) => { runAction({ command: 'popStash', repo: view.currentRepo, selector: selector, reinstateIndex: <boolean>values[0] }, 'Popping Stash'); }, target); } },
		{ title: 'Drop Stash' + ELLIPSIS, visible: visibility.drop, onClick: () => { dialog.showConfirmation('Are you sure you want to drop the stash <b><i>' + escapeHtml(selector.substring(5)) + '</i></b>?', 'Yes, drop', () => { runAction({ command: 'dropStash', repo: view.currentRepo, selector: selector }, 'Dropping Stash'); }, target); } }
	];
}

function commitsGetStashContextMenuActions(view: any, target: any): ContextMenuActions {
	const hash = target.hash, selector = target.ref, visibility = view.config.contextMenuActionsVisibility.stash;
	return [
		commitsGetStashCoreMenuGroup(view, selector, target, visibility),
		[
			{ title: 'Copy Stash Name to Clipboard', visible: visibility.copyName, onClick: () => { sendMessage({ command: 'copyToClipboard', type: 'Stash Name', data: selector }); } },
			{ title: 'Copy Stash Hash to Clipboard', visible: visibility.copyHash, onClick: () => { sendMessage({ command: 'copyToClipboard', type: 'Stash Hash', data: hash }); } }
		]
	];
}

function commitsHandleDeleteTag(view: any, tagName: string, target: any): void {
	const message = 'Are you sure you want to delete the tag <b><i>' + escapeHtml(tagName) + '</i></b>?';
	if (view.gitRemotes.length > 1) {
		const options = [{ name: 'Don\'t delete on any remote', value: '-1' }];
		view.gitRemotes.forEach((remote: string, i: number) => options.push({ name: remote, value: i.toString() }));
		dialog.showSelect(message + '<br>Do you also want to delete the tag on a remote:', '-1', options, 'Yes, delete', (remoteIndex: string) => {
			view.deleteTagAction(tagName, remoteIndex !== '-1' ? view.gitRemotes[parseInt(remoteIndex)] : null);
		}, target);
	} else if (view.gitRemotes.length === 1) {
		dialog.showCheckbox(message, 'Also delete on remote', false, 'Yes, delete', (deleteOnRemote: boolean) => {
			view.deleteTagAction(tagName, deleteOnRemote ? view.gitRemotes[0] : null);
		}, target);
	} else {
		dialog.showConfirmation(message, 'Yes, delete', () => {
			view.deleteTagAction(tagName, null);
		}, target);
	}
}

function commitsHandlePushTag(view: any, tagName: string, hash: string, target: any): void {
	const runPushTagAction = (remotes: string[]) => {
		runAction({ command: 'pushTag', repo: view.currentRepo, tagName: tagName, remotes: remotes, commitHash: hash, skipRemoteCheck: globalState.pushTagSkipRemoteCheck }, 'Pushing Tag');
	};
	if (view.gitRemotes.length === 1) {
		dialog.showConfirmation('Are you sure you want to push the tag <b><i>' + escapeHtml(tagName) + '</i></b> to the remote <b><i>' + escapeHtml(view.gitRemotes[0]) + '</i></b>?', 'Yes, push', () => {
			runPushTagAction([view.gitRemotes[0]]);
		}, target);
	} else if (view.gitRemotes.length > 1) {
		const defaults = [view.getPushRemote()];
		const options = view.gitRemotes.map((remote: string) => ({ name: remote, value: remote }));
		dialog.showMultiSelect('Are you sure you want to push the tag <b><i>' + escapeHtml(tagName) + '</i></b>? Select the remote(s) to push the tag to:', defaults, options, 'Yes, push', (remotes: string[]) => {
			runPushTagAction(remotes);
		}, target);
	}
}

function commitsGetTagContextMenuActions(view: any, isAnnotated: boolean, target: any): ContextMenuActions {
	const hash = target.hash, tagName = target.ref, visibility = view.config.contextMenuActionsVisibility.tag;
	return [[
		{ title: 'View Details', visible: visibility.viewDetails && isAnnotated, onClick: () => { runAction({ command: 'tagDetails', repo: view.currentRepo, tagName: tagName, commitHash: hash }, 'Retrieving Tag Details'); } },
		{ title: 'Delete Tag' + ELLIPSIS, visible: visibility.delete, onClick: () => { commitsHandleDeleteTag(view, tagName, target); } },
		{ title: 'Push Tag' + ELLIPSIS, visible: visibility.push && view.gitRemotes.length > 0, onClick: () => { commitsHandlePushTag(view, tagName, hash, target); } }
	], [
		{ title: 'Create Archive', visible: visibility.createArchive, onClick: () => { runAction({ command: 'createArchive', repo: view.currentRepo, ref: tagName }, 'Creating Archive'); } },
		{ title: 'Copy Tag Name to Clipboard', visible: visibility.copyName, onClick: () => { sendMessage({ command: 'copyToClipboard', type: 'Tag Name', data: tagName }); } }
	]];
}

function commitsGetViewIssueAction(view: any, refName: string, visible: boolean, target: any): ContextMenuAction {
	const issueLinks: { url: string, displayText: string }[] = [];

	let issueLinking: IssueLinking | null, match: RegExpExecArray | null;
	if (visible && (issueLinking = parseIssueLinkingConfig(view.gitRepos[view.currentRepo].issueLinkingConfig)) !== null) {
		issueLinking.regexp.lastIndex = 0;
		while (match = issueLinking.regexp.exec(refName)) {
			if (match[0].length === 0) break;
			issueLinks.push({
				url: generateIssueLinkFromMatch(match, issueLinking),
				displayText: match[0]
			});
		}
	}

	return {
		title: 'View Issue' + (issueLinks.length > 1 ? ELLIPSIS : ''),
		visible: issueLinks.length > 0,
		onClick: () => {
			if (issueLinks.length > 1) {
				dialog.showSelect('Select which issue you want to view for this branch:', '0', issueLinks.map((issueLink, i) => ({ name: issueLink.displayText, value: i.toString() })), 'View Issue', (value: string) => {
					sendMessage({ command: 'openExternalUrl', url: issueLinks[parseInt(value)].url });
				}, target);
			} else if (issueLinks.length === 1) {
				sendMessage({ command: 'openExternalUrl', url: issueLinks[0].url });
			}
		}
	};
}
