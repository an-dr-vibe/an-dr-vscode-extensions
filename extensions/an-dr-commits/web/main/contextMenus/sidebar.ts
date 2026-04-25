/* Sidebar context menu helpers extracted from CommitsView */

async function commitsOpenSidebarContextMenu(view: any, type: 'branch' | 'tag' | 'remote' | 'remoteSection' | 'localSection', name: string, event: MouseEvent) {
	try {
		const actions = await commitsGetSidebarContextMenuActions(view, type, name);
		contextMenu.show(actions, false, null, event, view.viewElem);
	} catch {
		contextMenu.show([[
			{
				title: 'Reveal',
				visible: view.findRenderedRefElem(name) !== null,
				onClick: () => view.revealReference(name)
			},
			{
				title: 'Copy Name',
				visible: true,
				onClick: () => sendMessage({ command: 'copyToClipboard', type: 'Reference Name', data: name })
			}
		]], false, null, event, view.viewElem);
	}
}

function commitsSidebarSectionActions(view: any, type: string, name: string): ContextMenuActions | null {
	if (type === 'localSection') {
		return [[{
			title: 'Clean Up Gone Branches' + ELLIPSIS,
			visible: true,
			onClick: () => view.cleanupLocalBranchesAction()
		}]];
	}

	if (type === 'remoteSection') {
		return [[{
			title: 'Add Remote' + ELLIPSIS,
			visible: true,
			onClick: () => view.addRemoteAction()
		}]];
	}

	if (type === 'remote') {
		const remoteUrl: string | null = view.gitRemoteUrls[name] ?? null;
		return [[
			{
				title: 'Edit Remote' + ELLIPSIS,
				visible: true,
				onClick: () => view.editRemoteAction(name)
			},
			{
				title: 'Delete Remote' + ELLIPSIS,
				visible: true,
				onClick: () => view.deleteRemoteAction(name)
			}
		], [
			{
				title: 'Copy Name',
				visible: true,
				onClick: () => sendMessage({ command: 'copyToClipboard', type: 'Remote Name', data: name })
			},
			{
				title: 'Copy URL',
				visible: remoteUrl !== null,
				onClick: () => sendMessage({ command: 'copyToClipboard', type: 'Remote URL', data: remoteUrl! })
			}
		]];
	}

	return null;
}

async function commitsSidebarBranchActions(view: any, name: string): Promise<ContextMenuActions> {
	const resolvedBranch = view.resolveSidebarBranch(name);
	if (resolvedBranch === null) {
		return [[
			{
				title: 'Reveal',
				visible: view.findRenderedRefElem(name) !== null,
				onClick: () => view.revealReference(name)
			},
			{
				title: 'Copy Name',
				visible: true,
				onClick: () => sendMessage({ command: 'copyToClipboard', type: 'Branch Name', data: name })
			}
		]];
	}

	const target = view.createSidebarRefTarget(resolvedBranch.name);
	const actions = resolvedBranch.kind === 'remoteBranch'
		? view.getRemoteBranchContextMenuActions(resolvedBranch.remote, target)
		: view.getBranchContextMenuActions(target);
	return view.appendSidebarRevealAction(actions, resolvedBranch.name);
}

async function commitsSidebarTagActions(view: any, name: string): Promise<ContextMenuActions> {
	const tagContext = await view.resolveSidebarTagContext(name);
	if (tagContext === null) {
		return [[
			{
				title: 'Reveal',
				visible: view.findRenderedRefElem(name) !== null,
				onClick: () => view.revealReference(name)
			},
			{
				title: 'Copy Tag Name to Clipboard',
				visible: true,
				onClick: () => sendMessage({ command: 'copyToClipboard', type: 'Tag Name', data: name })
			}
		]];
	}
	const target = view.createSidebarRefTarget(name, tagContext.hash);
	const actions = view.getTagContextMenuActions(tagContext.annotated, target);
	return view.appendSidebarRevealAction(actions, name);
}

async function commitsGetSidebarContextMenuActions(view: any, type: string, name: string): Promise<ContextMenuActions> {
	const sectionResult = commitsSidebarSectionActions(view, type, name);
	if (sectionResult !== null) return sectionResult;

	const selection = view.branchDropdown.getActionSelection();
	if ((type === 'branch' || type === 'tag') && selection.length > 1) {
		const resolvedSelection = await view.resolveSidebarSelection(selection);
		return view.getSidebarBatchContextMenuActions(resolvedSelection);
	}

	if (type === 'branch') {
		return commitsSidebarBranchActions(view, name);
	}

	if (type === 'tag') {
		return commitsSidebarTagActions(view, name);
	}

	return [[
		{
			title: 'Reveal',
			visible: view.findRenderedRefElem(name) !== null,
			onClick: () => view.revealReference(name)
		},
		{
			title: 'Copy Name',
			visible: true,
			onClick: () => sendMessage({ command: 'copyToClipboard', type: 'Reference Name', data: name })
		}
	]];
}

function commitsAppendSidebarRevealAction(view: any, actions: ContextMenuActions, refName: string): ContextMenuActions {
	return [
		...actions,
		[{
			title: 'Reveal',
			visible: view.findRenderedRefElem(refName) !== null,
			onClick: () => view.revealReference(refName)
		}]
	];
}

function commitsCreateSidebarRefTarget(view: any, refName: string, hash: string = ''): any {
	const elem = view.findRenderedRefElem(refName);
	return {
		type: TargetType.Ref,
		hash: hash,
		ref: refName,
		elem: elem !== null ? elem : view.viewElem
	};
}

function commitsResolveSidebarBranch(view: any, value: string): SidebarResolvedRef | null {
	if (value.startsWith('remotes/')) {
		const refName = value.substring(8);
		const slash = refName.indexOf('/');
		if (slash === -1) return null;
		const remote = refName.substring(0, slash);
		const branchName = refName.substring(slash + 1);
		return {
			kind: 'remoteBranch',
			name: refName,
			displayName: refName,
			remote: remote,
			branchName: branchName
		};
	}
	return {
		kind: 'localBranch',
		name: value,
		displayName: value
	};
}

async function commitsResolveSidebarSelection(view: any, selection: ReadonlyArray<BranchPanelActionSelectionItem>): Promise<ReadonlyArray<SidebarResolvedRef>> {
	const resolved: SidebarResolvedRef[] = [];
	for (let i = 0; i < selection.length; i++) {
		const item = selection[i];
		if (item.type === 'branch') {
			const branch = view.resolveSidebarBranch(item.name);
			if (branch !== null) resolved.push(branch);
		} else if (item.type === 'tag') {
			const tagContext = await view.resolveSidebarTagContext(item.name);
			resolved.push({
				kind: 'tag',
				name: item.name,
				displayName: item.name,
				hash: tagContext !== null ? tagContext.hash : null,
				annotated: tagContext !== null ? tagContext.annotated : null
			});
		}
	}
	return resolved;
}

function commitsBuildBatchDeleteAction(view: any, selection: ReadonlyArray<SidebarResolvedRef>, selectionSize: number): ContextMenuAction {
	const canDelete = selection.every((item) => item.kind === 'localBranch' || item.kind === 'remoteBranch' || item.kind === 'tag');
	return {
		title: 'Delete Selected' + ELLIPSIS,
		visible: canDelete,
		onClick: () => {
			dialog.showConfirmation('Are you sure you want to delete <b>' + selectionSize + '</b> selected reference' + (selectionSize === 1 ? '' : 's') + '?', 'Yes, delete', () => {
				runAction({
					command: 'sidebarBatchRefAction',
					repo: view.currentRepo,
					action: GG.SidebarBatchRefActionType.Delete,
					refs: view.getSidebarBatchRequestRefs(selection),
					remotes: [],
					setUpstream: false,
					pushMode: GG.GitPushBranchMode.Normal,
					skipRemoteCheck: globalState.pushTagSkipRemoteCheck
				}, 'Deleting Selected References');
			}, { type: TargetType.Repo });
		}
	};
}

function commitsBuildBatchPushAction(view: any, selection: ReadonlyArray<SidebarResolvedRef>, selectionSize: number, canPushBranches: boolean, canPushTags: boolean): ContextMenuAction {
	const canPush = canPushBranches || canPushTags;
	return {
		title: 'Push Selected' + ELLIPSIS,
		visible: canPush,
		onClick: () => {
			if (view.gitRemotes.length === 1) {
				dialog.showForm('Push <b>' + selectionSize + '</b> selected reference' + (selectionSize === 1 ? '' : 's') + ' to remote <b><i>' + escapeHtml(view.gitRemotes[0]) + '</i></b>?', canPushBranches
					? [
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
					] : [], 'Yes, push', (values: any[]) => {
					runAction({
						command: 'sidebarBatchRefAction',
						repo: view.currentRepo,
						action: GG.SidebarBatchRefActionType.Push,
						refs: view.getSidebarBatchRequestRefs(selection),
						remotes: [view.gitRemotes[0]],
						setUpstream: canPushBranches ? <boolean>values[0] : false,
						pushMode: canPushBranches ? <GG.GitPushBranchMode>values[1] : GG.GitPushBranchMode.Normal,
						skipRemoteCheck: globalState.pushTagSkipRemoteCheck
					}, 'Pushing Selected References');
				}, { type: TargetType.Repo });
			} else {
				const inputs: DialogInput[] = [
					{
						type: DialogInputType.Select,
						name: 'Push to Remote(s)',
						defaults: [view.getPushRemote()],
						options: view.gitRemotes.map((remote: string) => ({ name: remote, value: remote })),
						multiple: true
					}
				];
				if (canPushBranches) {
					inputs.push(
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
					);
				}
				dialog.showForm('Push <b>' + selectionSize + '</b> selected reference' + (selectionSize === 1 ? '' : 's') + '?', inputs, 'Yes, push', (values: any[]) => {
					runAction({
						command: 'sidebarBatchRefAction',
						repo: view.currentRepo,
						action: GG.SidebarBatchRefActionType.Push,
						refs: view.getSidebarBatchRequestRefs(selection),
						remotes: <string[]>values[0],
						setUpstream: canPushBranches ? <boolean>values[1] : false,
						pushMode: canPushBranches ? <GG.GitPushBranchMode>values[2] : GG.GitPushBranchMode.Normal,
						skipRemoteCheck: globalState.pushTagSkipRemoteCheck
					}, 'Pushing Selected References');
				}, { type: TargetType.Repo });
			}
		}
	};
}

function commitsBuildBatchArchiveAction(view: any, selection: ReadonlyArray<SidebarResolvedRef>, selectionSize: number): ContextMenuAction {
	return {
		title: 'Create Archive for Selected' + ELLIPSIS,
		visible: true,
		onClick: () => {
			dialog.showConfirmation('Create archives for <b>' + selectionSize + '</b> selected reference' + (selectionSize === 1 ? '' : 's') + '?', 'Yes, create archives', () => {
				runAction({
					command: 'sidebarBatchRefAction',
					repo: view.currentRepo,
					action: GG.SidebarBatchRefActionType.Archive,
					refs: view.getSidebarBatchRequestRefs(selection),
					remotes: [],
					setUpstream: false,
					pushMode: GG.GitPushBranchMode.Normal,
					skipRemoteCheck: globalState.pushTagSkipRemoteCheck
				}, 'Creating Archives');
			}, { type: TargetType.Repo });
		}
	};
}

function commitsGetSidebarBatchContextMenuActions(view: any, selection: ReadonlyArray<SidebarResolvedRef>): ContextMenuActions {
	const selectionSize = selection.length;
	const canPushBranches = view.gitRemotes.length > 0 && selection.every((item: SidebarResolvedRef) => item.kind === 'localBranch');
	const canPushTags = view.gitRemotes.length > 0 && selection.every((item: SidebarResolvedRef) => item.kind === 'tag' && item.hash !== null);
	const revealRefName = selection.map((item: SidebarResolvedRef) => item.name).find((refName: string) => view.findRenderedRefElem(refName) !== null) || null;

	const actions: ContextMenuActions = [[
		commitsBuildBatchDeleteAction(view, selection, selectionSize),
		commitsBuildBatchPushAction(view, selection, selectionSize, canPushBranches, canPushTags),
		commitsBuildBatchArchiveAction(view, selection, selectionSize)
	], [
		{
			title: 'Copy Selected Names to Clipboard',
			visible: selectionSize > 0,
			onClick: () => sendMessage({
				command: 'copyToClipboard',
				type: 'Reference Names',
				data: selection.map((item: SidebarResolvedRef) => item.displayName).join('\n')
			})
		},
		{
			title: 'Reveal',
			visible: revealRefName !== null,
			onClick: () => {
				if (revealRefName !== null) view.revealReference(revealRefName);
			}
		}
	]];

	return actions;
}

function commitsGetSidebarBatchRequestRefs(view: any, selection: ReadonlyArray<SidebarResolvedRef>): GG.SidebarBatchRefActionTarget[] {
	void view;
	return selection.map((item) => {
		switch (item.kind) {
			case 'localBranch':
				return { type: GG.SidebarBatchRefType.LocalBranch, name: item.name, remote: null, hash: null };
			case 'remoteBranch':
				return { type: GG.SidebarBatchRefType.RemoteBranch, name: item.branchName, remote: item.remote, hash: null };
			case 'tag':
				return { type: GG.SidebarBatchRefType.Tag, name: item.name, remote: null, hash: item.hash };
		}
	});
}

async function commitsResolveSidebarTagContext(view: any, tagName: string): Promise<{ hash: string; annotated: boolean } | null> {
	const repo = view.currentRepo;
	if (typeof repo !== 'string' || repo === '') return null;
	const requestId = ++view.sidebarTagContextRequestId;
	return new Promise((resolve) => {
		view.sidebarTagContextResolvers[requestId] = resolve;
		sendMessage({
			command: 'resolveSidebarTagContext',
			repo: repo,
			tagName: tagName,
			requestId: requestId
		});
	});
}

function commitsProcessResolveSidebarTagContext(view: any, msg: GG.ResponseResolveSidebarTagContext) {
	const resolver = view.sidebarTagContextResolvers[msg.requestId];
	if (typeof resolver === 'undefined') return;
	delete view.sidebarTagContextResolvers[msg.requestId];
	resolver(msg.error === null && msg.context !== null ? msg.context : null);
}
