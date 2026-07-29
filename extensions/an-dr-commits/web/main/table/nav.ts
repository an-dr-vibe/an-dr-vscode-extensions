/* Table navigation helpers extracted from CommitsView */

function commitsGetNumColumns(view: any) {
	let colVisibility = view.getColumnVisibility();
	return 2 + (colVisibility.committed ? 1 : 0) + (colVisibility.id ? 1 : 0);
}

function commitsScrollToStash(view: any, next: boolean) {
	const stashCommits = view.commits.filter((commit: GG.GitCommit) => commit.stash !== null);
	if (stashCommits.length > 0) {
		const curTime = (new Date()).getTime();
		if (view.lastScrollToStash.time < curTime - 5000) {
			view.lastScrollToStash.hash = null;
		}

		const lastScrollToStashCommitIndex = view.lastScrollToStash.hash !== null
			? stashCommits.findIndex((commit: GG.GitCommit) => commit.hash === view.lastScrollToStash.hash)
			: -1;
		let scrollToStashCommitIndex = lastScrollToStashCommitIndex + (next ? 1 : -1);
		if (scrollToStashCommitIndex >= stashCommits.length) {
			scrollToStashCommitIndex = 0;
		} else if (scrollToStashCommitIndex < 0) {
			scrollToStashCommitIndex = stashCommits.length - 1;
		}
		view.scrollToCommit(stashCommits[scrollToStashCommitIndex].hash, true, true);
		view.lastScrollToStash.time = curTime;
		view.lastScrollToStash.hash = stashCommits[scrollToStashCommitIndex].hash;
	}
}

function commitsScrollToCommit(view: any, hash: string, alwaysCenterCommit: boolean, flash: boolean = false) {
	const elem = findCommitElemWithId(getCommitElems(), view.getCommitId(hash));
	if (elem === null) return;

	let elemTop = view.controlsElem.clientHeight + elem.offsetTop;
	if (alwaysCenterCommit || elemTop - 8 < view.viewElem.scrollTop || elemTop + 32 - view.viewElem.clientHeight > view.viewElem.scrollTop) {
		view.viewElem.scroll(0, view.controlsElem.clientHeight + elem.offsetTop + 12 - view.viewElem.clientHeight / 2);
	}

	if (flash && !elem.classList.contains('flash')) {
		elem.classList.add('flash');
		setTimeout(() => {
			elem.classList.remove('flash');
		}, 850);
	}
}

function commitsFindRenderedRefElem(view: any, refName: string) {
	const elems = <NodeListOf<HTMLElement>>view.tableElem.querySelectorAll('[data-fullref]');
	for (let i = 0; i < elems.length; i++) {
		if (elems[i].dataset.fullref === refName) return elems[i];
	}
	return null;
}

function commitsRevealReference(view: any, refName: string) {
	const refElem = view.findRenderedRefElem(refName);
	if (refElem === null) return;
	const commitElem = <HTMLElement | null>refElem.closest('.commit');
	if (commitElem === null) return;
	const commit = view.getCommitOfElem(commitElem);
	if (commit === null) return;
	view.scrollToCommit(commit.hash, true, true);
}

function commitsLoadMoreCommits(view: any) {
	view.footerElem.innerHTML = '<h2 id="loadingHeader">' + ICONS.loading + 'Loading ...</h2>';
	view.maxCommits += view.config.loadMoreCommits;
	view.saveState();
	view.requestLoadRepoInfoAndCommits(false, true);
}
