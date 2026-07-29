/* Drag-and-drop helpers extracted from CommitsView */

function commitsGetDraggedRef(view: any, eventTarget: Element): DraggedRef | null {
	void view;
	if (eventTarget.closest('.gitRefHeadRemote') !== null && eventTarget.closest('[data-drag-ref-type="tag"]') === null) {
		return null;
	}
	const refElem = eventTarget.closest('[data-drag-ref-type][data-drag-ref-name]') as HTMLElement | null;
	if (refElem === null) return null;

	const type = refElem.dataset.dragRefType;
	const name = unescapeHtml(refElem.dataset.dragRefName!);
	if (type === 'branch' || type === 'tag') {
		return {
			type,
			name,
			tagType: refElem.dataset.tagtype === 'annotated' || refElem.dataset.tagtype === 'lightweight'
				? <'annotated' | 'lightweight'>refElem.dataset.tagtype
				: undefined
		};
	}
	return null;
}

function commitsGetDraggedRefFromEvent(view: any, e: DragEvent): DraggedRef | null {
	void view;
	if (e.dataTransfer === null) return null;
	const raw = e.dataTransfer.getData('application/vnd.an-dr-commits-ref');
	if (raw === '') return null;
	try {
		const ref = <DraggedRef>JSON.parse(raw);
		return (ref.type === 'branch' || ref.type === 'tag') && typeof ref.name === 'string'
			? ref
			: null;
	} catch (_) {
		return null;
	}
}

function commitsSetCommitDropTarget(view: any, commitElem: HTMLElement) {
	if (view.commitDropTarget === commitElem) return;
	commitsClearCommitDropTarget(view);
	view.commitDropTarget = commitElem;
	view.commitDropTarget.classList.add('dropTarget');
}

function commitsClearCommitDropTarget(view: any) {
	if (view.commitDropTarget !== null) {
		view.commitDropTarget.classList.remove('dropTarget');
		view.commitDropTarget = null;
	}
}

function commitsInferTagType(view: any, tagName: string): GG.TagType {
	for (let i = 0; i < view.commits.length; i++) {
		for (let j = 0; j < view.commits[i].tags.length; j++) {
			if (view.commits[i].tags[j].name === tagName) {
				return view.commits[i].tags[j].annotated ? GG.TagType.Annotated : GG.TagType.Lightweight;
			}
		}
	}
	return view.config.dialogDefaults.addTag.type;
}

function commitsGetDroppedRefContextMenuActions(view: any, ref: DraggedRef, target: any): ContextMenuActions {
	if (ref.type === 'branch') {
		const isCurrentBranch = ref.name === view.gitBranchHead;
		return [[
			{
				title: 'Move Branch \'' + ref.name + '\' to ' + abbrevCommit(target.hash),
				visible: ref.name !== 'HEAD' && !isCurrentBranch,
				onClick: () => {
					runAction({ command: 'createBranch', repo: view.currentRepo, branchName: ref.name, commitHash: target.hash, checkout: false, force: true }, 'Moving Branch');
				}
			},
			{
				title: 'Reset HEAD to ' + abbrevCommit(target.hash),
				visible: isCurrentBranch,
				onClick: () => view.resetCurrentBranchToCommitAction(target.hash, target)
			},
			{
				title: 'Rebase \'' + ref.name + '\' onto ' + abbrevCommit(target.hash) + ELLIPSIS,
				visible: isCurrentBranch && ref.name !== 'HEAD',
				onClick: () => view.rebaseAction(target.hash, abbrevCommit(target.hash), GG.RebaseActionOn.Commit, target)
			}
		]];
	}

	const tagType = ref.tagType === 'annotated'
		? GG.TagType.Annotated
		: ref.tagType === 'lightweight'
			? GG.TagType.Lightweight
			: view.inferTagType(ref.name);
	return [[
		{
			title: 'Move Tag \'' + ref.name + '\' to ' + abbrevCommit(target.hash) + ELLIPSIS,
			visible: true,
			onClick: () => view.addTagAction(target.hash, ref.name, tagType, '', null, target, false)
		}
	]];
}
