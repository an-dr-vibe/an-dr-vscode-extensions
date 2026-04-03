/* Branch context menu helpers extracted from CommitsView */

function commitsBranchPushAction(view: any, refName: string, target: any): ContextMenuAction {
	return {
		title: 'Push Branch' + ELLIPSIS,
		visible: view.config.contextMenuActionsVisibility.branch.push && view.gitRemotes.length > 0,
		onClick: () => {
			const multipleRemotes = view.gitRemotes.length > 1;
			const inputs: DialogInput[] = [
				{ type: DialogInputType.Checkbox, name: 'Set Upstream', value: true },
				{
					type: DialogInputType.Radio,
					name: 'Push Mode',
					options: [
						{ name: 'Normal', value: GG.GitPushBranchMode.Normal },
						{ name: 'Force With Lease', value: GG.GitPushBranchMode.ForceWithLease },
						{ name: 'Force', value: GG.GitPushBranchMode.Force }
					],
					default: GG.GitPushBranchMode.Normal
				}
			];

			if (multipleRemotes) {
				inputs.unshift({
					type: DialogInputType.Select,
					name: 'Push to Remote(s)',
					defaults: [view.getPushRemote(refName)],
					options: view.gitRemotes.map((remote: string) => ({ name: remote, value: remote })),
					multiple: true
				});
			}

			dialog.showForm('Are you sure you want to push the branch <b><i>' + escapeHtml(refName) + '</i></b>' + (multipleRemotes ? '' : ' to the remote <b><i>' + escapeHtml(view.gitRemotes[0]) + '</i></b>') + '?', inputs, 'Yes, push', (values: any[]) => {
				const remotes = multipleRemotes ? <string[]>values.shift() : [view.gitRemotes[0]];
				const setUpstream = <boolean>values[0];
				runAction({
					command: 'pushBranch',
					repo: view.currentRepo,
					branchName: refName,
					remotes: remotes,
					setUpstream: setUpstream,
					mode: <GG.GitPushBranchMode>values[1],
					willUpdateBranchConfig: setUpstream && remotes.length > 0 && (view.gitConfig === null || typeof view.gitConfig.branches[refName] === 'undefined' || view.gitConfig.branches[refName].remote !== remotes[remotes.length - 1])
				}, 'Pushing Branch');
			}, target);
		}
	};
}

function commitsBranchCoreMenuGroup(view: any, refName: string, visibility: any, target: any): ContextMenuAction[] {
	return [
		{
			title: 'Checkout Branch',
			visible: visibility.checkout && view.gitBranchHead !== refName,
			onClick: () => view.checkoutBranchAction(refName, null, null, target)
		}, {
			title: 'Rename Branch' + ELLIPSIS,
			visible: visibility.rename,
			onClick: () => {
				dialog.showRefInput('Enter the new name for branch <b><i>' + escapeHtml(refName) + '</i></b>:', refName, 'Rename Branch', (newName: string) => {
					runAction({ command: 'renameBranch', repo: view.currentRepo, oldName: refName, newName: newName }, 'Renaming Branch');
				}, target);
			}
		}, {
			title: 'Delete Branch' + ELLIPSIS,
			visible: visibility.delete && view.gitBranchHead !== refName,
			onClick: () => {
				let remotesWithBranch = view.gitRemotes.filter((remote: string) => view.gitBranches.includes('remotes/' + remote + '/' + refName));
				let inputs: DialogInput[] = [{ type: DialogInputType.Checkbox, name: 'Force Delete', value: view.config.dialogDefaults.deleteBranch.forceDelete }];
				if (remotesWithBranch.length > 0) {
					inputs.push({ type: DialogInputType.Checkbox, name: 'Delete this branch on the remote' + (view.gitRemotes.length > 1 ? 's' : ''), value: false, info: 'This branch is on the remote' + (remotesWithBranch.length > 1 ? 's: ' : ' ') + formatCommaSeparatedList(remotesWithBranch.map((remote: string) => '"' + remote + '"')) });
				}
				dialog.showForm('Are you sure you want to delete the branch <b><i>' + escapeHtml(refName) + '</i></b>?', inputs, 'Yes, delete', (values: any[]) => {
					runAction({ command: 'deleteBranch', repo: view.currentRepo, branchName: refName, forceDelete: <boolean>values[0], deleteOnRemotes: remotesWithBranch.length > 0 && <boolean>values[1] ? remotesWithBranch : [] }, 'Deleting Branch');
				}, target);
			}
		}, {
			title: 'Merge into current branch' + ELLIPSIS,
			visible: visibility.merge && view.gitBranchHead !== refName,
			onClick: () => view.mergeAction(refName, refName, GG.MergeActionOn.Branch, target)
		}, {
			title: 'Rebase current branch on Branch' + ELLIPSIS,
			visible: visibility.rebase && view.gitBranchHead !== refName,
			onClick: () => view.rebaseAction(refName, refName, GG.RebaseActionOn.Branch, target)
		},
		commitsBranchPushAction(view, refName, target)
	];
}

function commitsBranchExtraMenuGroups(view: any, refName: string, visibility: any, isSelectedInBranchesDropdown: boolean, target: any): ContextMenuAction[][] {
	return [
		[
			view.getViewIssueAction(refName, visibility.viewIssue, target),
			{
				title: 'Create Pull Request' + ELLIPSIS,
				visible: visibility.createPullRequest && view.gitRepos[view.currentRepo].pullRequestConfig !== null,
				onClick: () => {
					const config = view.gitRepos[view.currentRepo].pullRequestConfig;
					if (config === null) return;
					dialog.showCheckbox('Are you sure you want to create a Pull Request for branch <b><i>' + escapeHtml(refName) + '</i></b>?', 'Push branch before creating the Pull Request', true, 'Yes, create Pull Request', (push: boolean) => {
						runAction({ command: 'createPullRequest', repo: view.currentRepo, config: config, sourceRemote: config.sourceRemote, sourceOwner: config.sourceOwner, sourceRepo: config.sourceRepo, sourceBranch: refName, push: push }, 'Creating Pull Request');
					}, target);
				}
			}
		], [
			{ title: 'Create Archive', visible: visibility.createArchive, onClick: () => { runAction({ command: 'createArchive', repo: view.currentRepo, ref: refName }, 'Creating Archive'); } },
			{ title: 'Select in Branches Dropdown', visible: visibility.selectInBranchesDropdown && !isSelectedInBranchesDropdown, onClick: () => view.branchDropdown.selectOption(refName) },
			{ title: 'Unselect in Branches Dropdown', visible: visibility.unselectInBranchesDropdown && isSelectedInBranchesDropdown, onClick: () => view.branchDropdown.unselectOption(refName) }
		], [
			{ title: 'Copy Branch Name to Clipboard', visible: visibility.copyName, onClick: () => { sendMessage({ command: 'copyToClipboard', type: 'Branch Name', data: refName }); } }
		]
	];
}

function commitsGetBranchContextMenuActions(view: any, target: any): ContextMenuActions {
	const refName = target.ref, visibility = view.config.contextMenuActionsVisibility.branch;
	const isSelectedInBranchesDropdown = view.branchDropdown.isSelected(refName);
	return [commitsBranchCoreMenuGroup(view, refName, visibility, target), ...commitsBranchExtraMenuGroups(view, refName, visibility, isSelectedInBranchesDropdown, target)];
}
