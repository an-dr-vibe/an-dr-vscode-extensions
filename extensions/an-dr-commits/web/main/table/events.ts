/* Table event observer helpers extracted from CommitsView */

function commitsHandleCommitClick(view: any, e: MouseEvent) {
	if (e.target === null) return;
	const eventTarget = <Element>e.target;
	if (isUrlElem(eventTarget)) return;
	let eventElem: HTMLElement | null;

	if ((eventElem = eventTarget.closest('.gitRef')) !== null) {
		e.stopPropagation();
		if (contextMenu.isOpen()) {
			contextMenu.close();
		}
	} else if ((eventElem = eventTarget.closest('.commit')) !== null) {
		const commit = view.getCommitOfElem(eventElem);
		if (commit === null) return;
		const index = parseInt(eventElem.dataset.id!);
		if ((<MouseEvent>e).shiftKey) {
			view.rangeSelectCommits(index);
			view.updateSelectionPreview();
		} else if ((<MouseEvent>e).ctrlKey || (<MouseEvent>e).metaKey) {
			view.toggleCommitSelection(commit.hash, index);
			view.updateSelectionPreview();
		} else {
			view.selectCommit(commit.hash, index);
			closeDialogAndContextMenu();
			view.previewCommitFiles(commit.hash);
		}
	}
}

function commitsHandleCommitDragEvents(view: any, tableElem: HTMLElement) {
	view.viewElem.addEventListener('dragstart', (e: DragEvent) => {
		if (e.target === null) return;
		const ref = view.getDraggedRef(<Element>e.target);
		if (ref === null || e.dataTransfer === null) return;

		e.dataTransfer.effectAllowed = 'move';
		e.dataTransfer.setData('application/vnd.an-dr-commits-ref', JSON.stringify(ref));
		e.dataTransfer.setData('text/plain', ref.name);
	});

	view.viewElem.addEventListener('dragend', () => {
		view.clearCommitDropTarget();
	});

	tableElem.addEventListener('dragover', (e: DragEvent) => {
		if (e.target === null || view.getDraggedRefFromEvent(e) === null) return;
		const commitElem = (<Element>e.target).closest('.commit') as HTMLElement | null;
		if (commitElem === null || commitElem.dataset.id === '0') return;

		e.preventDefault();
		if (e.dataTransfer !== null) e.dataTransfer.dropEffect = 'move';
		view.setCommitDropTarget(commitElem);
	});

	tableElem.addEventListener('dragleave', (e: DragEvent) => {
		if (e.target === null) return;
		const commitElem = (<Element>e.target).closest('.commit') as HTMLElement | null;
		if (commitElem !== null && commitElem === view.commitDropTarget && !commitElem.contains(<Node>e.relatedTarget)) {
			view.clearCommitDropTarget();
		}
	});

	tableElem.addEventListener('drop', (e: DragEvent) => {
		if (e.target === null) return;
		const draggedRef = view.getDraggedRefFromEvent(e);
		const commitElem = (<Element>e.target).closest('.commit') as HTMLElement | null;
		view.clearCommitDropTarget();
		if (draggedRef === null || commitElem === null || commitElem.dataset.id === '0') return;

		e.preventDefault();
		e.stopPropagation();
		const commit = view.getCommitOfElem(commitElem);
		if (commit === null || commit.hash === UNCOMMITTED) return;

		const target: ContextMenuTarget & DialogTarget & CommitTarget = {
			type: TargetType.Commit,
			hash: commit.hash,
			index: parseInt(commitElem.dataset.id!),
			elem: commitElem
		};
		const actions = view.getDroppedRefContextMenuActions(draggedRef, target);
		if (actions.some((group: ContextMenuAction[]) => group.some((action: ContextMenuAction) => action.visible))) {
			contextMenu.show(actions, false, target, <MouseEvent><unknown>e, view.viewElem);
		}
	});
}

function commitsHandleTableDblClick(view: any, e: MouseEvent) {
	if (e.target === null) return;
	const eventTarget = <Element>e.target;
	if (isUrlElem(eventTarget)) return;
	let eventElem: HTMLElement | null;
	if ((eventElem = eventTarget.closest('.gitRef')) !== null) {
		e.stopPropagation();
		closeDialogAndContextMenu();
		const commitElem = <HTMLElement>eventElem.closest('.commit')!;
		const commit = view.getCommitOfElem(commitElem);
		if (commit === null) return;
		const headRemoteElem = eventTarget.closest('.gitRefHeadRemote') as HTMLElement | null;
		if (eventElem.classList.contains(CLASS_REF_HEAD) || eventElem.classList.contains(CLASS_REF_REMOTE)) {
			let sourceElem = <HTMLElement>eventElem.children[1];
			let remoteRefElem = eventElem;
			let refName = unescapeHtml(eventElem.dataset.name!), isHead = eventElem.classList.contains(CLASS_REF_HEAD);
			if (isHead && headRemoteElem !== null) {
				refName = unescapeHtml(headRemoteElem.dataset.fullref!);
				sourceElem = headRemoteElem;
				remoteRefElem = headRemoteElem;
				isHead = false;
			}
			const target: ContextMenuTarget & DialogTarget & RefTarget = {
				type: TargetType.Ref, hash: commit.hash, index: parseInt(commitElem.dataset.id!),
				ref: refName, elem: sourceElem
			};
			view.checkoutBranchAction(refName, isHead ? null : unescapeHtml(remoteRefElem.dataset.remote!), null, target);
		}
	} else if ((eventElem = eventTarget.closest('.commit')) !== null) {
		e.stopPropagation();
		closeDialogAndContextMenu();
		const dblCommit = view.getCommitOfElem(eventElem);
		if (dblCommit === null) return;
		if (dblCommit.hash === UNCOMMITTED) {
			sendMessage({ command: 'viewScm' });
			return;
		}
		if (view.expandedCommit !== null && view.expandedCommit.commitHash === dblCommit.hash) {
			view.closeCommitDetails(true);
		} else {
			view.loadCommitDetails(eventElem);
		}
	}
}

function commitsHandleRefContextMenu(view: any, e: Event, eventElem: HTMLElement, eventTarget: Element) {
	handledEvent(e);
	const commitElem = <HTMLElement>eventElem.closest('.commit')!;
	const commit = view.getCommitOfElem(commitElem);
	if (commit === null) return;
	const headRemoteElem = eventTarget.closest('.gitRefHeadRemote') as HTMLElement | null;
	const target: ContextMenuTarget & DialogTarget & RefTarget = {
		type: TargetType.Ref, hash: commit.hash, index: parseInt(commitElem.dataset.id!),
		ref: unescapeHtml(eventElem.dataset.name!), elem: <HTMLElement>eventElem.children[1]
	};
	let actions: ContextMenuActions;
	if (eventElem.classList.contains(CLASS_REF_STASH)) {
		actions = view.getStashContextMenuActions(target);
	} else if (eventElem.classList.contains(CLASS_REF_TAG)) {
		actions = view.getTagContextMenuActions(eventElem.dataset.tagtype === 'annotated', target);
	} else {
		let remoteRefElem = eventElem;
		let isHead = eventElem.classList.contains(CLASS_REF_HEAD);
		if (isHead && headRemoteElem !== null) {
			target.ref = unescapeHtml(headRemoteElem.dataset.fullref!);
			target.elem = headRemoteElem;
			remoteRefElem = headRemoteElem;
			isHead = false;
		}
		actions = isHead ? view.getBranchContextMenuActions(target) : view.getRemoteBranchContextMenuActions(unescapeHtml(remoteRefElem.dataset.remote!), target);
	}
	contextMenu.show(actions, false, target, <MouseEvent>e, view.viewElem);
}

function commitsHandleCommitContextMenu(view: any, e: Event, eventElem: HTMLElement) {
	handledEvent(e);
	const commit = view.getCommitOfElem(eventElem);
	if (commit === null) return;
	if (!view.selectedCommits.has(commit.hash)) {
		const index = parseInt(eventElem.dataset.id!);
		view.selectCommit(commit.hash, index);
	}
	const target: ContextMenuTarget & DialogTarget & CommitTarget = {
		type: TargetType.Commit, hash: commit.hash, index: parseInt(eventElem.dataset.id!), elem: eventElem
	};
	let actions: ContextMenuActions;
	if (commit.hash === UNCOMMITTED) {
		actions = view.getUncommittedChangesContextMenuActions(target);
	} else if (commit.stash !== null) {
		target.ref = commit.stash.selector;
		actions = view.getStashContextMenuActions(<RefTarget>target);
	} else if (view.selectedCommits.size > 1) {
		actions = view.getMultiSelectContextMenuActions(target);
	} else {
		actions = view.getCommitContextMenuActions(target);
	}
	contextMenu.show(actions, false, target, <MouseEvent>e, view.viewElem);
}

function commitsObserveTableEvents(view: any) {
	const tableElem = view.tableElem;
	tableElem.addEventListener('click', (e: MouseEvent) => commitsHandleCommitClick(view, e));
	tableElem.addEventListener('dblclick', (e: MouseEvent) => commitsHandleTableDblClick(view, e));
	commitsHandleCommitDragEvents(view, tableElem);
	tableElem.addEventListener('contextmenu', (e: Event) => {
		if (e.target === null) return;
		const eventTarget = <Element>e.target;
		if (isUrlElem(eventTarget)) return;
		let eventElem: HTMLElement | null;
		if ((eventElem = eventTarget.closest('.gitRef')) !== null) {
			commitsHandleRefContextMenu(view, e, eventElem, eventTarget);
		} else if ((eventElem = eventTarget.closest('.commit')) !== null) {
			commitsHandleCommitContextMenu(view, e, eventElem);
		}
	});
}
