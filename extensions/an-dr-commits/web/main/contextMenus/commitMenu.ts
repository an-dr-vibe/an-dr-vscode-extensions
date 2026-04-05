/* Commit context menu helpers extracted from CommitsView */

function commitsCommitCherryPickAction(view: any, hash: string, commit: GG.GitCommit, target: any): ContextMenuAction {
	const visibility = view.config.contextMenuActionsVisibility.commit;
	return {
		title: 'Cherry Pick' + ELLIPSIS,
		visible: visibility.cherrypick,
		onClick: () => {
			const isMerge = commit.parents.length > 1;
			let inputs: DialogInput[] = [];
			if (isMerge) {
				let options = commit.parents.map((hash: string, index: number) => ({
					name: abbrevCommit(hash) + (typeof view.commitLookup[hash] === 'number' ? ': ' + view.commits[view.commitLookup[hash]].message : ''),
					value: (index + 1).toString()
				}));
				inputs.push({
					type: DialogInputType.Select,
					name: 'Parent Hash',
					options: options,
					default: '1',
					info: 'Choose the parent hash on the main branch, to cherry pick the commit relative to.'
				});
			}
			inputs.push({
				type: DialogInputType.Checkbox,
				name: 'Record Origin',
				value: view.config.dialogDefaults.cherryPick.recordOrigin,
				info: 'Record that this commit was the origin of the cherry pick by appending a line to the original commit message that states "(cherry picked from commit ...​)".'
			}, {
				type: DialogInputType.Checkbox,
				name: 'No Commit',
				value: view.config.dialogDefaults.cherryPick.noCommit,
				info: 'Cherry picked changes will be staged but not committed, so that you can select and commit specific parts of this commit.'
			});

			dialog.showForm('Are you sure you want to cherry pick commit <b><i>' + abbrevCommit(hash) + '</i></b>?', inputs, 'Yes, cherry pick', (values: any[]) => {
				let parentIndex = isMerge ? parseInt(<string>values.shift()) : 0;
				runAction({
					command: 'cherrypickCommit',
					repo: view.currentRepo,
					commitHash: hash,
					parentIndex: parentIndex,
					recordOrigin: <boolean>values[0],
					noCommit: <boolean>values[1]
				}, 'Cherry picking Commit');
			}, target);
		}
	};
}

function commitsCommitRevertAction(view: any, hash: string, commit: GG.GitCommit, target: any): ContextMenuAction {
	const visibility = view.config.contextMenuActionsVisibility.commit;
	return {
		title: 'Revert' + ELLIPSIS,
		visible: visibility.revert,
		onClick: () => {
			if (commit.parents.length > 1) {
				let options = commit.parents.map((hash: string, index: number) => ({
					name: abbrevCommit(hash) + (typeof view.commitLookup[hash] === 'number' ? ': ' + view.commits[view.commitLookup[hash]].message : ''),
					value: (index + 1).toString()
				}));
				dialog.showSelect('Are you sure you want to revert merge commit <b><i>' + abbrevCommit(hash) + '</i></b>? Choose the parent hash on the main branch, to revert the commit relative to:', '1', options, 'Yes, revert', (parentIndex: string) => {
					runAction({ command: 'revertCommit', repo: view.currentRepo, commitHash: hash, parentIndex: parseInt(parentIndex) }, 'Reverting Commit');
				}, target);
			} else {
				dialog.showConfirmation('Are you sure you want to revert commit <b><i>' + abbrevCommit(hash) + '</i></b>?', 'Yes, revert', () => {
					runAction({ command: 'revertCommit', repo: view.currentRepo, commitHash: hash, parentIndex: 0 }, 'Reverting Commit');
				}, target);
			}
		}
	};
}

function commitsGetCommitEditMenuGroup(view: any, hash: string, commit: GG.GitCommit, target: any): ContextMenuAction[] {
	return [
		{
			title: 'Reword Commit Message' + ELLIPSIS,
			visible: true,
			onClick: () => {
				runAction({
					command: 'rewordCommit', repo: view.currentRepo, commitHash: hash,
					selectedBranches: view.currentBranches, selectedTags: view.currentTags,
					scrollTop: view.scrollTop, branchPanelState: view.branchDropdown.getState()
				}, 'Rewording Commit');
			}
		}, {
			title: 'Edit Author' + ELLIPSIS,
			visible: true,
			onClick: () => {
				dialog.showForm('Edit author of commit <b><i>' + abbrevCommit(hash) + '</i></b>:', [
					{ type: DialogInputType.Text, name: 'Name', default: commit.author, placeholder: null },
					{ type: DialogInputType.Text, name: 'Email', default: commit.email, placeholder: null }
				], 'Update', (values: any[]) => {
					const name = (<string>values[0]).trim(), email = (<string>values[1]).trim();
					if (name !== '' && email !== '') {
						runAction({ command: 'editCommitAuthor', repo: view.currentRepo, commitHash: hash, name: name, email: email }, 'Editing Commit Author');
					}
				}, target);
			}
		}
	];
}

function commitsGetCommitContextMenuActions(view: any, target: any): ContextMenuActions {
	const hash = target.hash, visibility = view.config.contextMenuActionsVisibility.commit;
	const commit = view.commits[view.commitLookup[hash]];
	return [[
		{ title: 'Add Tag' + ELLIPSIS, visible: visibility.addTag, onClick: () => view.addTagAction(hash, '', view.config.dialogDefaults.addTag.type, '', null, target) },
		{ title: 'Create Branch' + ELLIPSIS, visible: visibility.createBranch, onClick: () => view.createBranchAction(hash, '', view.config.dialogDefaults.createBranch.checkout, target) }
	], [
		{
			title: 'Checkout' + (globalState.alwaysAcceptCheckoutCommit ? '' : ELLIPSIS),
			visible: visibility.checkout,
			onClick: () => {
				const checkoutCommit = () => runAction({ command: 'checkoutCommit', repo: view.currentRepo, commitHash: hash }, 'Checking out Commit');
				if (globalState.alwaysAcceptCheckoutCommit) {
					checkoutCommit();
				} else {
					dialog.showCheckbox('Are you sure you want to checkout commit <b><i>' + abbrevCommit(hash) + '</i></b>? This will result in a \'detached HEAD\' state.', 'Always Accept', false, 'Yes, checkout', (alwaysAccept: boolean) => {
						if (alwaysAccept) updateGlobalViewState('alwaysAcceptCheckoutCommit', true);
						checkoutCommit();
					}, target);
				}
			}
		},
		commitsCommitCherryPickAction(view, hash, commit, target),
		commitsCommitRevertAction(view, hash, commit, target),
		{ title: 'Drop' + ELLIPSIS, visible: visibility.drop && view.graph.dropCommitPossible(view.commitLookup[hash]), onClick: () => {
			dialog.showConfirmation('Are you sure you want to permanently drop commit <b><i>' + abbrevCommit(hash) + '</i></b>?' + (view.onlyFollowFirstParent ? '<br/><i>Note: By enabling "Only follow the first parent of commits", some commits may have been hidden from the Commits View that could affect the outcome of performing this action.</i>' : ''), 'Yes, drop', () => {
				runAction({ command: 'dropCommit', repo: view.currentRepo, commitHash: hash }, 'Dropping Commit');
			}, target);
		}}
	], [
		{ title: 'Merge into current branch' + ELLIPSIS, visible: visibility.merge, onClick: () => view.mergeAction(hash, abbrevCommit(hash), GG.MergeActionOn.Commit, target) },
		{ title: 'Rebase current branch on this Commit' + ELLIPSIS, visible: visibility.rebase, onClick: () => view.rebaseAction(hash, abbrevCommit(hash), GG.RebaseActionOn.Commit, target) },
		{ title: 'Reset current branch to this Commit' + ELLIPSIS, visible: visibility.reset, onClick: () => view.resetCurrentBranchToCommitAction(hash, target) }
	], [
		{ title: 'Copy Commit Hash', visible: visibility.copyHash, onClick: () => { sendMessage({ command: 'copyToClipboard', type: 'Commit Hash', data: hash }); } },
		{ title: 'Copy Commit Subject', visible: visibility.copySubject, onClick: () => { sendMessage({ command: 'copyToClipboard', type: 'Commit Subject', data: commit.message }); } }
	], commitsGetCommitEditMenuGroup(view, hash, commit, target)];
}

function commitsGetMultiSelectContextMenuActions(view: any, _target: any): ContextMenuActions {
	const hashes = Array.from(view.selectedCommits);
	const sortedIndices = (hashes as string[])
		.map((h: string) => ({ hash: h, idx: typeof view.commitLookup[h] === 'number' ? view.commitLookup[h] as number : -1 }))
		.filter((x: any) => x.idx >= 0)
		.sort((a: any, b: any) => a.idx - b.idx);
	const sortedHashes = sortedIndices.map((x: any) => x.hash);

	let consecutive = sortedIndices.length === hashes.length;
	for (let i = 1; i < sortedIndices.length && consecutive; i++) {
		if (sortedIndices[i].idx !== sortedIndices[i - 1].idx + 1) consecutive = false;
	}

	return [[
		{
			title: 'Squash ' + hashes.length + ' Commits' + ELLIPSIS,
			visible: consecutive,
			onClick: () => {
				runAction({
					command: 'squashCommits',
					repo: view.currentRepo,
					commitHashes: sortedHashes,
					selectedBranches: view.currentBranches,
					selectedTags: view.currentTags,
					scrollTop: view.scrollTop,
					branchPanelState: view.branchDropdown.getState()
				}, 'Squashing Commits');
			}
		}
	], [
		{
			title: 'Copy Commit Hashes',
			visible: true,
			onClick: () => {
				sendMessage({ command: 'copyToClipboard', type: 'Commit Hashes', data: sortedHashes.join('\n') });
			}
		}
	]];
}

function commitsGetUncommittedChangesContextMenuActions(view: any, target: any): ContextMenuActions {
	let visibility = view.config.contextMenuActionsVisibility.uncommittedChanges;
	return [[
		{
			title: 'Stash uncommitted changes' + ELLIPSIS,
			visible: visibility.stash,
			onClick: () => {
				dialog.showForm('Are you sure you want to stash the <b>uncommitted changes</b>?', [
					{ type: DialogInputType.Text, name: 'Message', default: '', placeholder: 'Optional' },
					{ type: DialogInputType.Checkbox, name: 'Include Untracked', value: view.config.dialogDefaults.stashUncommittedChanges.includeUntracked, info: 'Include all untracked files in the stash, and then clean them from the working directory.' }
				], 'Yes, stash', (values: any[]) => {
					runAction({ command: 'pushStash', repo: view.currentRepo, message: <string>values[0], includeUntracked: <boolean>values[1] }, 'Stashing uncommitted changes');
				}, target);
			}
		}
	], [
		{
			title: 'Reset uncommitted changes' + ELLIPSIS,
			visible: visibility.reset,
			onClick: () => {
				dialog.showSelect('Are you sure you want to reset the <b>uncommitted changes</b> to <b>HEAD</b>?', view.config.dialogDefaults.resetUncommitted.mode, [
					{ name: 'Mixed - Keep working tree, but reset index', value: GG.GitResetMode.Mixed },
					{ name: 'Hard - Discard all changes', value: GG.GitResetMode.Hard }
				], 'Yes, reset', (mode: string) => {
					runAction({ command: 'resetToCommit', repo: view.currentRepo, commit: 'HEAD', resetMode: <GG.GitResetMode>mode }, 'Resetting uncommitted changes');
				}, target);
			}
		}, {
			title: 'Clean untracked files' + ELLIPSIS,
			visible: visibility.clean,
			onClick: () => {
				dialog.showCheckbox('Are you sure you want to clean all untracked files?', 'Clean untracked directories', true, 'Yes, clean', (directories: boolean) => {
					runAction({ command: 'cleanUntrackedFiles', repo: view.currentRepo, directories: directories }, 'Cleaning untracked files');
				}, target);
			}
		}
	], [
		{
			title: 'Open Source Control View',
			visible: visibility.openSourceControlView,
			onClick: () => {
				sendMessage({ command: 'viewScm' });
			}
		}
	]];
}
