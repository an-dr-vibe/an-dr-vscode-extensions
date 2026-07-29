/* URL observer helpers extracted from CommitsView */

function commitsResolveUrlTarget(view: any, eventTarget: Element): { target: any, isInDialog: boolean } {
	let eventElem: HTMLElement | null;
	if (view.expandedCommit !== null && eventTarget.closest('#commitDetailsView') !== null) {
		const target = {
			type: TargetType.CommitDetailsView,
			hash: view.expandedCommit.commitHash,
			index: view.commitLookup[view.expandedCommit.commitHash],
			elem: <HTMLElement>eventTarget
		};
		CommitsView.closeCommitDetailsViewContextMenuIfOpen(view.expandedCommit);
		view.expandedCommit.contextMenuOpen.summary = true;
		return { target, isInDialog: false };
	} else if ((eventElem = eventTarget.closest('.commit')) !== null) {
		const commit = view.getCommitOfElem(eventElem);
		if (commit === null) return { target: { type: TargetType.Repo }, isInDialog: true };
		return {
			target: { type: TargetType.Commit, hash: commit.hash, index: parseInt(eventElem.dataset.id!), elem: <HTMLElement>eventTarget },
			isInDialog: false
		};
	}
	return { target: { type: TargetType.Repo }, isInDialog: true };
}

function commitsHandleUrlContextMenu(view: any, e: MouseEvent, followInternalLink: (e: MouseEvent) => void) {
	if (e.target === null) return;
	const eventTarget = <Element>e.target;
	const isExternalUrl = isExternalUrlElem(eventTarget), isInternalUrl = isInternalUrlElem(eventTarget);
	if (!isExternalUrl && !isInternalUrl) return;
	const viewElem: HTMLElement | null = eventTarget.closest('#view');
	const { target, isInDialog } = commitsResolveUrlTarget(view, eventTarget);
	handledEvent(e);
	contextMenu.show([[
		{ title: 'Open URL', visible: isExternalUrl, onClick: () => { sendMessage({ command: 'openExternalUrl', url: (<HTMLAnchorElement>eventTarget).href }); } },
		{ title: 'Follow Internal Link', visible: isInternalUrl, onClick: () => followInternalLink(e) },
		{ title: 'Copy URL to Clipboard', visible: isExternalUrl, onClick: () => { sendMessage({ command: 'copyToClipboard', type: 'External URL', data: (<HTMLAnchorElement>eventTarget).href }); } }
	]], false, target, e, viewElem || document.body, () => {
		if (target.type === TargetType.CommitDetailsView && view.expandedCommit !== null) {
			view.expandedCommit.contextMenuOpen.summary = false;
		}
	}, isInDialog ? 'dialogContextMenu' : null);
}

function commitsObserveUrls(view: any) {
	const followInternalLink = (e: MouseEvent) => {
		if (e.target !== null && isInternalUrlElem(<Element>e.target)) {
			const value = unescapeHtml((<HTMLElement>e.target).dataset.value!);
			switch ((<HTMLElement>e.target).dataset.type!) {
				case 'commit':
					if (typeof view.commitLookup[value] === 'number' && (view.expandedCommit === null || view.expandedCommit.commitHash !== value || view.expandedCommit.compareWithHash !== null)) {
						const elem = findCommitElemWithId(getCommitElems(), view.commitLookup[value]);
						if (elem !== null) view.loadCommitDetails(elem);
					}
					break;
			}
		}
	};
	document.body.addEventListener('click', followInternalLink);
	document.body.addEventListener('contextmenu', (e: MouseEvent) => commitsHandleUrlContextMenu(view, e, followInternalLink));
}
