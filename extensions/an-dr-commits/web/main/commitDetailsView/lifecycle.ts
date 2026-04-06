/* Commit Details View lifecycle helpers extracted from CommitsView */

function commitsCloseCommitDetailsViewContextMenuIfOpen(expandedCommit: ExpandedCommit) {
	if (expandedCommit.contextMenuOpen.summary || expandedCommit.contextMenuOpen.fileView > -1) {
		expandedCommit.contextMenuOpen.summary = false;
		expandedCommit.contextMenuOpen.fileView = -1;
		contextMenu.close();
	}
}

function commitsLoadCommitDetails(view: any, commitElem: HTMLElement) {
	const commit = view.getCommitOfElem(commitElem);
	if (commit === null) return;
	if (commit.hash === UNCOMMITTED) return;
	if (view.expandedCommit !== null && view.expandedCommit.commitHash === commit.hash && !view.expandedCommit.loading) return;

	view.previewCommitHash = null;
	view.closeCommitDetails(false);
	view.saveExpandedCommitLoading(parseInt(commitElem.dataset.id!), commit.hash, commitElem, null, null);
	commitElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
	view.renderCommitDetailsView(false);
	view.requestCommitDetails(commit.hash, false);
}


function commitsLoadCommitComparison(view: any, commitElem: HTMLElement, compareWithElem: HTMLElement) {
	const commit = view.getCommitOfElem(commitElem);
	const compareWithCommit = view.getCommitOfElem(compareWithElem);

	if (commit !== null && compareWithCommit !== null) {
		if (view.expandedCommit !== null) {
			if (view.expandedCommit.commitHash !== commit.hash) {
				view.closeCommitDetails(false);
			} else if (view.expandedCommit.compareWithHash !== compareWithCommit.hash) {
				view.closeCommitComparison(false);
			}
		}

		view.saveExpandedCommitLoading(parseInt(commitElem.dataset.id!), commit.hash, commitElem, compareWithCommit.hash, compareWithElem);
		commitElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
		compareWithElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
		view.renderCommitDetailsView(false);
		view.requestCommitComparison(commit.hash, compareWithCommit.hash, false);
	}
}

function commitsPopulateFilesPanelHeader(view: any, externalDiffPossible: boolean) {
	view.filesPanel.getHeaderElem().innerHTML =
		'<div id="commitDetailsViewFileViewTypeTree" class="commitDetailsViewControlBtn commitDetailsViewFileViewTypeBtn" title="File Tree View">' + SVG_ICONS.fileTree + '</div>' +
		'<div id="commitDetailsViewFileViewTypeList" class="commitDetailsViewControlBtn commitDetailsViewFileViewTypeBtn" title="File List View">' + SVG_ICONS.fileList + '</div>' +
		(externalDiffPossible ? '<div id="commitDetailsViewExternalDiff" class="commitDetailsViewControlBtn">' + SVG_ICONS.linkExternal + '</div>' : '');
	document.getElementById('commitDetailsViewFileViewTypeTree')!.addEventListener('click', () => view.changeFileViewType(GG.FileViewType.Tree));
	document.getElementById('commitDetailsViewFileViewTypeList')!.addEventListener('click', () => view.changeFileViewType(GG.FileViewType.List));
	commitsSetupCommitDetailsViewExternalDiffBtn(view, externalDiffPossible);
	view.renderCommitDetailsViewFileViewTypeBtns();
}

function commitsPopulateFilesPanelHeaderForPreview(view: any, commitDetails: GG.GitCommitDetails) {
	const commit = view.commits[view.commitLookup[commitDetails.hash]];
	const externalDiffPossible = commit !== undefined && commit.parents.length > 0;
	commitsPopulateFilesPanelHeader(view, externalDiffPossible);
}

function commitsCloseCommitDetails(view: any, saveAndRender: boolean) {
	const expandedCommit = view.expandedCommit;
	if (expandedCommit === null) {
		view.filesPanel.clear();
		view.filesPanelCommitHash = null;
		view.filesPanelFileChanges = null;
		view.filesPanelFileTree = null;
		view.filesPanelCompareWithHash = null;
		return;
	}

	const elem = document.getElementById('commitDetailsView'), isDocked = view.isCommitDetailsViewDocked();
	if (elem !== null) {
		elem.remove();
	}
	view.resetDiffState();
	// Files panel stays showing current commit — filesPanelCommitHash etc. are preserved
	view.updateLayoutBottoms();
	if (expandedCommit.commitElem !== null) {
		expandedCommit.commitElem.classList.remove(CLASS_COMMIT_DETAILS_OPEN);
	}
	if (expandedCommit.compareWithElem !== null) {
		expandedCommit.compareWithElem.classList.remove(CLASS_COMMIT_DETAILS_OPEN);
	}
	CommitsView.closeCommitDetailsViewContextMenuIfOpen(expandedCommit);
	view.expandedCommit = null;
	if (saveAndRender) {
		view.saveState();
		if (!isDocked) {
			view.renderGraph();
		}
	}
	view.renderTopFullDiffButton();
}

function commitsShowCommitDetails(view: any, commitDetails: GG.GitCommitDetails, fileTree: FileTreeFolder, avatar: string | null, refresh: boolean) {
	const expandedCommit = view.expandedCommit;
	if (expandedCommit === null || expandedCommit.commitElem === null || expandedCommit.commitHash !== commitDetails.hash || expandedCommit.compareWithHash !== null) return;

	if (!view.isCommitDetailsViewDocked()) {
		const elem = document.getElementById('commitDetailsView');
		if (elem !== null) elem.remove();
	}

	expandedCommit.commitDetails = commitDetails;
	if (haveFilesChanged(expandedCommit.fileChanges, commitDetails.fileChanges)) {
		expandedCommit.fileChanges = commitDetails.fileChanges;
		expandedCommit.fileTree = fileTree;
		CommitsView.closeCommitDetailsViewContextMenuIfOpen(expandedCommit);
	}
	expandedCommit.avatar = avatar;
	expandedCommit.commitElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
	expandedCommit.loading = false;
	view.saveState();

	view.renderCommitDetailsView(refresh);
}

function commitsCreateFileTree(view: any, gitFiles: ReadonlyArray<GG.GitFileChange>) {
	let contents: FileTreeFolderContents = {}, i, j, path, absPath, cur: FileTreeFolder;
	let files: FileTreeFolder = { type: 'folder', name: '', folderPath: '', contents: contents, open: true, reviewed: true };

	for (i = 0; i < gitFiles.length; i++) {
		cur = files;
		path = gitFiles[i].newFilePath.split('/');
		absPath = view.currentRepo;
		for (j = 0; j < path.length; j++) {
			absPath += '/' + path[j];
			if (typeof view.gitRepos[absPath] !== 'undefined') {
				if (typeof cur.contents[path[j]] === 'undefined') {
					cur.contents[path[j]] = { type: 'repo', name: path[j], path: absPath };
				}
				break;
			} else if (j < path.length - 1) {
				if (typeof cur.contents[path[j]] === 'undefined') {
					contents = {};
					cur.contents[path[j]] = { type: 'folder', name: path[j], folderPath: absPath.substring(view.currentRepo.length + 1), contents: contents, open: true, reviewed: true };
				}
				cur = <FileTreeFolder>cur.contents[path[j]];
			} else if (path[j] !== '') {
				cur.contents[path[j]] = { type: 'file', name: path[j], index: i, reviewed: true };
			}
		}
	}
	return files;
}

function commitsCloseCommitComparison(view: any, saveAndRequestCommitDetails: boolean) {
	const expandedCommit = view.expandedCommit;
	if (expandedCommit === null || expandedCommit.compareWithHash === null) return;

	if (expandedCommit.compareWithElem !== null) {
		expandedCommit.compareWithElem.classList.remove(CLASS_COMMIT_DETAILS_OPEN);
	}
	CommitsView.closeCommitDetailsViewContextMenuIfOpen(expandedCommit);
	if (saveAndRequestCommitDetails) {
		if (expandedCommit.commitElem !== null) {
			view.saveExpandedCommitLoading(expandedCommit.index, expandedCommit.commitHash, expandedCommit.commitElem, null, null);
			view.renderCommitDetailsView(false);
			view.requestCommitDetails(expandedCommit.commitHash, false);
		} else {
			view.closeCommitDetails(true);
		}
	}
}

function commitsShowCommitComparison(view: any, commitHash: string, compareWithHash: string, fileChanges: ReadonlyArray<GG.GitFileChange>, fileTree: FileTreeFolder, refresh: boolean) {
	const expandedCommit = view.expandedCommit;
	if (expandedCommit === null || expandedCommit.commitElem === null || expandedCommit.compareWithElem === null || expandedCommit.commitHash !== commitHash || expandedCommit.compareWithHash !== compareWithHash) return;

	if (haveFilesChanged(expandedCommit.fileChanges, fileChanges)) {
		expandedCommit.fileChanges = fileChanges;
		expandedCommit.fileTree = fileTree;
		CommitsView.closeCommitDetailsViewContextMenuIfOpen(expandedCommit);
	}
	expandedCommit.commitElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
	expandedCommit.compareWithElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
	expandedCommit.loading = false;
	view.saveState();

	view.renderCommitDetailsView(refresh);
}

function commitsRenderCommitDetailsViewSummary(view: any, expandedCommit: ExpandedCommit): string {
	let html = '';
	if (expandedCommit.compareWithHash === null) {
		if (expandedCommit.commitHash !== UNCOMMITTED) {
			const textFormatter = new TextFormatter(view.commits, view.gitRepos[view.currentRepo].issueLinkingConfig, {
				commits: true,
				emoji: true,
				issueLinking: true,
				markdown: view.config.markdown,
				multiline: true,
				urls: true
			});
			const commitDetails = expandedCommit.commitDetails!;
			const commitDetailsAvatar = view.getCommitDetailsAvatarHtml(commitDetails.author, commitDetails.authorEmail, expandedCommit.avatar);
			const parents = commitDetails.parents.length > 0
				? commitDetails.parents.map((parent: string) => {
					const escapedParent = escapeHtml(parent);
					return typeof view.commitLookup[parent] === 'number'
						? '<span class="' + CLASS_INTERNAL_URL + '" data-type="commit" data-value="' + escapedParent + '" tabindex="-1">' + escapedParent + '</span>'
						: escapedParent;
				}).join(', ')
				: 'None';
			html += '<span class="commitDetailsViewSummaryTop' + (commitDetailsAvatar !== '' ? ' withAvatar' : '') + '"><span class="commitDetailsViewSummaryTopRow"><span class="commitDetailsViewSummaryKeyValues">'
				+ '<b>Commit: </b>' + escapeHtml(commitDetails.hash) + '<br>'
				+ '<b>Parents: </b>' + parents + '<br>'
				+ '<b>Author: </b>' + escapeHtml(commitDetails.author) + (commitDetails.authorEmail !== '' ? ' &lt;<a class="' + CLASS_EXTERNAL_URL + '" href="mailto:' + escapeHtml(commitDetails.authorEmail) + '" tabindex="-1">' + escapeHtml(commitDetails.authorEmail) + '</a>&gt;' : '') + '<br>'
				+ (commitDetails.authorDate !== commitDetails.committerDate ? '<b>Author Date: </b>' + formatLongDate(commitDetails.authorDate) + '<br>' : '')
				+ '<b>Committer: </b>' + escapeHtml(commitDetails.committer) + (commitDetails.committerEmail !== '' ? ' &lt;<a class="' + CLASS_EXTERNAL_URL + '" href="mailto:' + escapeHtml(commitDetails.committerEmail) + '" tabindex="-1">' + escapeHtml(commitDetails.committerEmail) + '</a>&gt;' : '') + (commitDetails.signature !== null ? generateSignatureHtml(commitDetails.signature) : '') + '<br>'
				+ '<b>' + (commitDetails.authorDate !== commitDetails.committerDate ? 'Committer ' : '') + 'Date: </b>' + formatLongDate(commitDetails.committerDate)
				+ '</span>'
				+ commitDetailsAvatar
				+ '</span></span><br><br>' + textFormatter.format(commitDetails.body);
		} else {
			html += 'Displaying all uncommitted changes.';
		}
	} else {
		const commitOrder = view.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash);
		html += 'Displaying all changes from <b>' + commitOrder.from + '</b> to <b>' + (commitOrder.to !== UNCOMMITTED ? commitOrder.to : 'Uncommitted Changes') + '</b>.';
	}
	return html;
}

function commitsScrollCommitDetailsViewIntoView(view: any, elem: HTMLElement, isDocked: boolean, expandedCommit: any) {
	if (isDocked) {
		const elemTop = view.controlsElem.clientHeight + expandedCommit.commitElem.offsetTop;
		if (elemTop - 8 < view.viewElem.scrollTop) {
			view.viewElem.scroll(0, elemTop - 8);
		} else if (elemTop - view.viewElem.clientHeight + 32 > view.viewElem.scrollTop) {
			view.viewElem.scroll(0, elemTop - view.viewElem.clientHeight + 32);
		}
	} else {
		const elemTop = view.controlsElem.clientHeight + elem.offsetTop;
		const commitDetailsViewHeight = view.gitRepos[view.currentRepo].commitDetailsViewHeight;
		if (view.config.commitDetailsView.autoCenter) {
			view.viewElem.scroll(0, elemTop - 12 + (commitDetailsViewHeight - view.viewElem.clientHeight) / 2);
		} else if (elemTop - 32 < view.viewElem.scrollTop) {
			view.viewElem.scroll(0, elemTop - 32);
		} else if (elemTop + commitDetailsViewHeight - view.viewElem.clientHeight + 8 > view.viewElem.scrollTop) {
			view.viewElem.scroll(0, elemTop + commitDetailsViewHeight - view.viewElem.clientHeight + 8);
		}
	}
}

function commitsSetupCommitDetailsViewScrollObservers(view: any, expandedCommit: any) {
	observeElemScroll('commitDetailsViewSummary', expandedCommit.scrollTop.summary, (scrollTop: number) => {
		if (view.expandedCommit === null) return;
		view.expandedCommit.scrollTop.summary = scrollTop;
		if (view.expandedCommit.contextMenuOpen.summary) {
			view.expandedCommit.contextMenuOpen.summary = false;
			contextMenu.close();
		}
	}, () => view.saveState());

	// File scroll state is tracked by FilesPanel; sync back to expandedCommit on scroll
	view.filesPanel.setScrollTop(expandedCommit.scrollTop.fileView);
	view.filesPanel.setOnScrollCallback(() => {
		if (view.expandedCommit === null) return;
		view.expandedCommit.scrollTop.fileView = view.filesPanel.getScrollTop();
		if (view.expandedCommit.contextMenuOpen.fileView > -1) {
			view.expandedCommit.contextMenuOpen.fileView = -1;
			contextMenu.close();
		}
		view.saveState();
	});
}

function commitsSetupCommitDetailsViewViewButtons(view: any) {
	document.getElementById('commitDetailsViewFileViewTypeTree')!.addEventListener('click', () => {
		view.changeFileViewType(GG.FileViewType.Tree);
	});
	document.getElementById('commitDetailsViewFileViewTypeList')!.addEventListener('click', () => {
		view.changeFileViewType(GG.FileViewType.List);
	});
	document.getElementById('commitDetailsViewDiffViewRaw')!.addEventListener('click', () => {
		view.changeDiffViewMode('raw');
	});
	document.getElementById('commitDetailsViewDiffViewUnified')!.addEventListener('click', () => {
		view.changeDiffViewMode('unified');
	});
	document.getElementById('commitDetailsViewDiffViewSideBySide')!.addEventListener('click', () => {
		view.changeDiffViewMode('sideBySide');
	});
}

function commitsSetupCommitDetailsViewExternalDiffBtn(view: any, externalDiffPossible: boolean) {
	if (!externalDiffPossible) return;
	document.getElementById('commitDetailsViewExternalDiff')!.addEventListener('click', () => {
		const expandedCommit = view.expandedCommit;
		const commitHash = expandedCommit !== null ? expandedCommit.commitHash : view.filesPanelCommitHash;
		const compareWithHash = expandedCommit !== null ? expandedCommit.compareWithHash : view.filesPanelCompareWithHash;
		if (commitHash === null || view.gitConfig === null || (view.gitConfig.diffTool === null && view.gitConfig.guiDiffTool === null)) return;
		const order = view.getCommitOrder(commitHash, compareWithHash === null ? commitHash : compareWithHash);
		runAction({
			command: 'openExternalDirDiff', repo: view.currentRepo,
			fromHash: order.from, toHash: order.to, isGui: view.gitConfig.guiDiffTool !== null
		}, 'Opening External Directory Diff');
	});
}

function commitsSetupCommitDetailsViewInteractivity(view: any, expandedCommit: any, externalDiffPossible: boolean) {
	if (expandedCommit.loading) return;
	view.makeCommitDetailsViewFileViewInteractive();
	view.renderCommitDetailsViewExternalDiffBtn();
	if (view.fullDiffMode) view.createFullDiffPanel();
	commitsSetupCommitDetailsViewScrollObservers(view, expandedCommit);
}

function commitsRenderCommitDetailsView(view: any, refresh: boolean) {
	const expandedCommit = view.expandedCommit;
	if (expandedCommit === null || expandedCommit.commitElem === null) return;

	if (!refresh) {
		view.currentDiffText = null;
		view.currentFullDiffData = null;
		view.diffPaneVisible = false;
		view.currentDiffFilePath = null;
	}

	const isDocked = view.isCommitDetailsViewDocked();
	const commitOrder = view.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash === null ? expandedCommit.commitHash : expandedCommit.compareWithHash);
	const externalDiffPossible = !expandedCommit.loading && (expandedCommit.compareWithHash !== null || view.commits[view.commitLookup[expandedCommit.commitHash]].parents.length > 0);

	let elem = document.getElementById('commitDetailsView');
	if (elem === null) {
		elem = document.createElement(isDocked ? 'div' : 'tr');
		elem.id = 'commitDetailsView';
		elem.className = isDocked ? 'docked' : 'inline';
		view.setCommitDetailsViewHeight(elem, isDocked);
		if (isDocked) document.body.appendChild(elem);
		else insertAfter(elem, expandedCommit.commitElem);
	}

	let html = '<div id="commitDetailsViewContent"><div id="commitDetailsViewTopRow">';
	if (expandedCommit.loading) {
		html += '<div id="commitDetailsViewLoading">' + SVG_ICONS.loading + ' Loading ' + (expandedCommit.compareWithHash === null ? expandedCommit.commitHash !== UNCOMMITTED ? 'Commit Details' : 'Uncommitted Changes' : 'Commit Comparison') + ' ...</div>';
	} else {
		html += '<div id="commitDetailsViewSummary">' + commitsRenderCommitDetailsViewSummary(view, expandedCommit) + '</div>';
		const alreadyShowingThisCommit = view.filesPanelCommitHash === expandedCommit.commitHash && view.filesPanelCompareWithHash === expandedCommit.compareWithHash;
		if (!alreadyShowingThisCommit || refresh) {
			view.filesPanel.update(expandedCommit.fileTree!, expandedCommit.fileChanges!, expandedCommit.contextMenuOpen.fileView, view.getFileViewType(), commitOrder.to === UNCOMMITTED);
		}
		view.filesPanelCommitHash = expandedCommit.commitHash;
		view.filesPanelCompareWithHash = expandedCommit.compareWithHash;
		view.filesPanelFileChanges = expandedCommit.fileChanges;
		view.filesPanelFileTree = expandedCommit.fileTree;
	}
	html += '</div></div><div class="commitDetailsViewHeightResize"></div>';

	if (expandedCommit.loading) {
		view.filesPanel.getHeaderElem().innerHTML = '';
	} else {
		commitsPopulateFilesPanelHeader(view, externalDiffPossible);
	}

	elem.innerHTML = isDocked ? html : '<td><div class="commitDetailsViewHeightResize"></div></td><td colspan="' + (view.getNumColumns() - 1) + '">' + html + '</td>';
	if (!isDocked) view.renderGraph();

	if (!refresh) commitsScrollCommitDetailsViewIntoView(view, elem, isDocked, expandedCommit);

	view.makeCommitDetailsViewResizable();
	commitsSetupCommitDetailsViewInteractivity(view, expandedCommit, externalDiffPossible);
	view.renderTopFullDiffButton();
}

function commitsSetCommitDetailsViewHeight(view: any, elem: HTMLElement, isDocked: boolean) {
	let height = view.gitRepos[view.currentRepo].commitDetailsViewHeight, windowHeight = window.innerHeight;
	if (height > windowHeight - 40) {
		height = Math.max(windowHeight - 40, 100);
		if (height !== view.gitRepos[view.currentRepo].commitDetailsViewHeight) {
			view.gitRepos[view.currentRepo].commitDetailsViewHeight = height;
			view.saveRepoState();
		}
	}

	elem.style.height = height + 'px';
	if (isDocked) view.updateLayoutBottoms();
}

function commitsIsCommitDetailsViewOpen(view: any, commitHash: string, compareWithHash: string | null) {
	return view.expandedCommit !== null && view.expandedCommit.commitHash === commitHash && view.expandedCommit.compareWithHash === compareWithHash;
}

function commitsGetCommitOrder(view: any, hash1: string, hash2: string) {
	if (view.commitLookup[hash1] > view.commitLookup[hash2]) {
		return { from: hash1, to: hash2 };
	} else {
		return { from: hash2, to: hash1 };
	}
}

function commitsGetFileViewType(view: any) {
	return view.gitRepos[view.currentRepo].fileViewType === GG.FileViewType.Default
		? view.config.commitDetailsView.fileViewType
		: view.gitRepos[view.currentRepo].fileViewType;
}

function commitsSetFileViewType(view: any, type: GG.FileViewType) {
	view.gitRepos[view.currentRepo].fileViewType = type;
	view.saveRepoState();
}

function commitsChangeFileViewType(view: any, type: GG.FileViewType) {
	const expandedCommit = view.expandedCommit;
	if (expandedCommit === null) {
		if (view.filesPanelFileChanges === null || view.filesPanelFileTree === null) return;
		view.setFileViewType(type);
		const isUncommitted = view.filesPanelCompareWithHash !== null
			? (view.filesPanelCompareWithHash === UNCOMMITTED || view.filesPanelCommitHash === UNCOMMITTED)
			: view.filesPanelCommitHash === UNCOMMITTED;
		view.filesPanel.update(view.filesPanelFileTree, view.filesPanelFileChanges, -1, type, isUncommitted);
		view.renderCommitDetailsViewFileViewTypeBtns();
		return;
	}
	if (expandedCommit.fileTree === null || expandedCommit.fileChanges === null) return;
	CommitsView.closeCommitDetailsViewContextMenuIfOpen(expandedCommit);
	view.setFileViewType(type);
	const commitOrder = view.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash === null ? expandedCommit.commitHash : expandedCommit.compareWithHash);
	view.filesPanel.update(expandedCommit.fileTree, expandedCommit.fileChanges, expandedCommit.contextMenuOpen.fileView, type, commitOrder.to === UNCOMMITTED);
	view.makeCommitDetailsViewFileViewInteractive();
	view.renderCommitDetailsViewFileViewTypeBtns();
}
