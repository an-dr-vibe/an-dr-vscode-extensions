/* Commit Details View lifecycle helpers extracted from CommitsView */

function commitsLoadCommitDetails(view: any, commitElem: HTMLElement) {
	const commit = view.getCommitOfElem(commitElem);
	if (commit === null) return;

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

function commitsCloseCommitDetails(view: any, saveAndRender: boolean) {
	const expandedCommit = view.expandedCommit;
	if (expandedCommit === null) return;

	const elem = document.getElementById('cdv'), isDocked = view.isCdvDocked();
	if (elem !== null) {
		elem.remove();
	}
	view.destroyFullDiffPanel();
	view.hideDiffPane();
	view.currentDiffRequest = null;
	view.currentDiffText = null;
	view.currentFullDiffData = null;
	view.currentDiffFilePath = null;
	view.updateLayoutBottoms();
	if (expandedCommit.commitElem !== null) {
		expandedCommit.commitElem.classList.remove(CLASS_COMMIT_DETAILS_OPEN);
	}
	if (expandedCommit.compareWithElem !== null) {
		expandedCommit.compareWithElem.classList.remove(CLASS_COMMIT_DETAILS_OPEN);
	}
	CommitsView.closeCdvContextMenuIfOpen(expandedCommit);
	view.expandedCommit = null;
	if (saveAndRender) {
		view.saveState();
		if (!isDocked) {
			view.renderGraph();
		}
	}
	view.renderTopFullDiffButton();
}

function commitsShowCommitDetails(view: any, commitDetails: GG.GitCommitDetails, fileTree: FileTreeFolder, avatar: string | null, codeReview: GG.CodeReview | null, lastViewedFile: string | null, refresh: boolean) {
	const expandedCommit = view.expandedCommit;
	if (expandedCommit === null || expandedCommit.commitElem === null || expandedCommit.commitHash !== commitDetails.hash || expandedCommit.compareWithHash !== null) return;

	if (!view.isCdvDocked()) {
		const elem = document.getElementById('cdv');
		if (elem !== null) elem.remove();
	}

	expandedCommit.commitDetails = commitDetails;
	if (haveFilesChanged(expandedCommit.fileChanges, commitDetails.fileChanges)) {
		expandedCommit.fileChanges = commitDetails.fileChanges;
		expandedCommit.fileTree = fileTree;
		CommitsView.closeCdvContextMenuIfOpen(expandedCommit);
	}
	expandedCommit.avatar = avatar;
	expandedCommit.codeReview = codeReview;
	if (!refresh) {
		expandedCommit.lastViewedFile = lastViewedFile;
	}
	expandedCommit.commitElem.classList.add(CLASS_COMMIT_DETAILS_OPEN);
	expandedCommit.loading = false;
	view.saveState();

	view.renderCommitDetailsView(refresh);
}

function commitsCreateFileTree(view: any, gitFiles: ReadonlyArray<GG.GitFileChange>, codeReview: GG.CodeReview | null) {
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
				cur.contents[path[j]] = { type: 'file', name: path[j], index: i, reviewed: codeReview === null || !codeReview.remainingFiles.includes(gitFiles[i].newFilePath) };
			}
		}
	}
	if (codeReview !== null) calcFileTreeFoldersReviewed(files);
	return files;
}

function commitsCloseCommitComparison(view: any, saveAndRequestCommitDetails: boolean) {
	const expandedCommit = view.expandedCommit;
	if (expandedCommit === null || expandedCommit.compareWithHash === null) return;

	if (expandedCommit.compareWithElem !== null) {
		expandedCommit.compareWithElem.classList.remove(CLASS_COMMIT_DETAILS_OPEN);
	}
	CommitsView.closeCdvContextMenuIfOpen(expandedCommit);
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

function commitsShowCommitComparison(view: any, commitHash: string, compareWithHash: string, fileChanges: ReadonlyArray<GG.GitFileChange>, fileTree: FileTreeFolder, codeReview: GG.CodeReview | null, lastViewedFile: string | null, refresh: boolean) {
	const expandedCommit = view.expandedCommit;
	if (expandedCommit === null || expandedCommit.commitElem === null || expandedCommit.compareWithElem === null || expandedCommit.commitHash !== commitHash || expandedCommit.compareWithHash !== compareWithHash) return;

	if (haveFilesChanged(expandedCommit.fileChanges, fileChanges)) {
		expandedCommit.fileChanges = fileChanges;
		expandedCommit.fileTree = fileTree;
		CommitsView.closeCdvContextMenuIfOpen(expandedCommit);
	}
	expandedCommit.codeReview = codeReview;
	if (!refresh) {
		expandedCommit.lastViewedFile = lastViewedFile;
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
			html += '<span class="cdvSummaryTop' + (commitDetailsAvatar !== '' ? ' withAvatar' : '') + '"><span class="cdvSummaryTopRow"><span class="cdvSummaryKeyValues">'
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
			html += 'Displaying all uncommitted changes.<br><br><span id="cdvOpenScmBtn" class="roundedBtn" title="Open Source Control panel to stage and commit changes">Commit Changes...</span>';
		}
	} else {
		const commitOrder = view.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash);
		html += 'Displaying all changes from <b>' + commitOrder.from + '</b> to <b>' + (commitOrder.to !== UNCOMMITTED ? commitOrder.to : 'Uncommitted Changes') + '</b>.';
	}
	return html;
}

function commitsScrollCdvIntoView(view: any, elem: HTMLElement, isDocked: boolean, expandedCommit: any) {
	if (isDocked) {
		const elemTop = view.controlsElem.clientHeight + expandedCommit.commitElem.offsetTop;
		if (elemTop - 8 < view.viewElem.scrollTop) {
			view.viewElem.scroll(0, elemTop - 8);
		} else if (elemTop - view.viewElem.clientHeight + 32 > view.viewElem.scrollTop) {
			view.viewElem.scroll(0, elemTop - view.viewElem.clientHeight + 32);
		}
	} else {
		const elemTop = view.controlsElem.clientHeight + elem.offsetTop;
		const cdvHeight = view.gitRepos[view.currentRepo].cdvHeight;
		if (view.config.commitDetailsView.autoCenter) {
			view.viewElem.scroll(0, elemTop - 12 + (cdvHeight - view.viewElem.clientHeight) / 2);
		} else if (elemTop - 32 < view.viewElem.scrollTop) {
			view.viewElem.scroll(0, elemTop - 32);
		} else if (elemTop + cdvHeight - view.viewElem.clientHeight + 8 > view.viewElem.scrollTop) {
			view.viewElem.scroll(0, elemTop + cdvHeight - view.viewElem.clientHeight + 8);
		}
	}
}

function commitsSetupCdvScrollObservers(view: any, expandedCommit: any) {
	observeElemScroll('cdvSummary', expandedCommit.scrollTop.summary, (scrollTop: number) => {
		if (view.expandedCommit === null) return;
		view.expandedCommit.scrollTop.summary = scrollTop;
		if (view.expandedCommit.contextMenuOpen.summary) {
			view.expandedCommit.contextMenuOpen.summary = false;
			contextMenu.close();
		}
	}, () => view.saveState());

	observeElemScroll('cdvFiles', expandedCommit.scrollTop.fileView, (scrollTop: number) => {
		if (view.expandedCommit === null) return;
		view.expandedCommit.scrollTop.fileView = scrollTop;
		if (view.expandedCommit.contextMenuOpen.fileView > -1) {
			view.expandedCommit.contextMenuOpen.fileView = -1;
			contextMenu.close();
		}
	}, () => view.saveState());
}

function commitsSetupCdvViewButtons(view: any) {
	document.getElementById('cdvFileViewTypeTree')!.addEventListener('click', () => {
		view.changeFileViewType(GG.FileViewType.Tree);
	});
	document.getElementById('cdvFileViewTypeList')!.addEventListener('click', () => {
		view.changeFileViewType(GG.FileViewType.List);
	});
	document.getElementById('cdvDiffViewUnified')!.addEventListener('click', () => {
		view.changeDiffViewMode('unified');
	});
	document.getElementById('cdvDiffViewSideBySide')!.addEventListener('click', () => {
		view.changeDiffViewMode('sideBySide');
	});
}

function commitsSetupCdvCodeReviewBtn(view: any, codeReviewPossible: boolean) {
	if (!codeReviewPossible) return;
	view.renderCodeReviewBtn();
	document.getElementById('cdvCodeReview')!.addEventListener('click', (e: MouseEvent) => {
		const expandedCommit = view.expandedCommit;
		if (expandedCommit === null || e.target === null) return;
		const sourceElem = <HTMLElement>(<Element>e.target).closest('#cdvCodeReview')!;
		if (sourceElem.classList.contains(CLASS_ACTIVE)) {
			sendMessage({ command: 'endCodeReview', repo: view.currentRepo, id: expandedCommit.codeReview!.id });
			view.endCodeReview();
		} else {
			const order = view.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash === null ? expandedCommit.commitHash : expandedCommit.compareWithHash);
			const id = expandedCommit.compareWithHash !== null ? order.from + '-' + order.to : expandedCommit.commitHash;
			sendMessage({
				command: 'startCodeReview', repo: view.currentRepo, id: id,
				commitHash: expandedCommit.commitHash, compareWithHash: expandedCommit.compareWithHash,
				files: getFilesInTree(expandedCommit.fileTree!, expandedCommit.fileChanges!),
				lastViewedFile: expandedCommit.lastViewedFile
			});
		}
	});
}

function commitsSetupCdvExternalDiffBtn(view: any, externalDiffPossible: boolean) {
	if (!externalDiffPossible) return;
	document.getElementById('cdvExternalDiff')!.addEventListener('click', () => {
		const expandedCommit = view.expandedCommit;
		if (expandedCommit === null || view.gitConfig === null || (view.gitConfig.diffTool === null && view.gitConfig.guiDiffTool === null)) return;
		const order = view.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash === null ? expandedCommit.commitHash : expandedCommit.compareWithHash);
		runAction({
			command: 'openExternalDirDiff', repo: view.currentRepo,
			fromHash: order.from, toHash: order.to, isGui: view.gitConfig.guiDiffTool !== null
		}, 'Opening External Directory Diff');
	});
}

function commitsSetupCdvInteractivity(view: any, expandedCommit: any, codeReviewPossible: boolean, externalDiffPossible: boolean) {
	if (expandedCommit.loading) return;
	view.makeCdvFileViewInteractive();
	view.renderCdvFileViewTypeBtns();
	view.renderCdvDiffViewBtns();
	view.renderCdvExternalDiffBtn();
	view.makeCdvDividerDraggable();
	if (view.fullDiffMode && view.currentDiffRequest !== null) view.createFullDiffPanel();
	commitsSetupCdvScrollObservers(view, expandedCommit);
	commitsSetupCdvViewButtons(view);
	commitsSetupCdvCodeReviewBtn(view, codeReviewPossible);
	commitsSetupCdvExternalDiffBtn(view, externalDiffPossible);
	const openScmBtn = document.getElementById('cdvOpenScmBtn');
	if (openScmBtn !== null) openScmBtn.addEventListener('click', () => sendMessage({ command: 'viewScm' }));
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

	const isDocked = view.isCdvDocked();
	const commitOrder = view.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash === null ? expandedCommit.commitHash : expandedCommit.compareWithHash);
	const codeReviewPossible = !expandedCommit.loading && commitOrder.to !== UNCOMMITTED;
	const externalDiffPossible = !expandedCommit.loading && (expandedCommit.compareWithHash !== null || view.commits[view.commitLookup[expandedCommit.commitHash]].parents.length > 0);

	let elem = document.getElementById('cdv');
	if (elem === null) {
		elem = document.createElement(isDocked ? 'div' : 'tr');
		elem.id = 'cdv';
		elem.className = isDocked ? 'docked' : 'inline';
		view.setCdvHeight(elem, isDocked);
		if (isDocked) document.body.appendChild(elem);
		else insertAfter(elem, expandedCommit.commitElem);
	}

	let html = '<div id="cdvContent"><div id="cdvTopRow">';
	if (expandedCommit.loading) {
		html += '<div id="cdvLoading">' + SVG_ICONS.loading + ' Loading ' + (expandedCommit.compareWithHash === null ? expandedCommit.commitHash !== UNCOMMITTED ? 'Commit Details' : 'Uncommitted Changes' : 'Commit Comparison') + ' ...</div>';
	} else {
		html += '<div id="cdvSummary">' + commitsRenderCommitDetailsViewSummary(view, expandedCommit);
		html += '</div><div id="cdvFiles">' + generateFileViewHtml(expandedCommit.fileTree!, expandedCommit.fileChanges!, expandedCommit.lastViewedFile, expandedCommit.contextMenuOpen.fileView, view.getFileViewType(), commitOrder.to === UNCOMMITTED) + '</div><div id="cdvDivider"></div>';
	}
	html += '</div><div id="cdvRowDivider"></div><div id="cdvDiffPreview"></div></div>' +
		'<div id="cdvControls"><div id="cdvClose" class="cdvControlBtn" title="Close">' + SVG_ICONS.close + '</div>' +
		(codeReviewPossible ? '<div id="cdvCodeReview" class="cdvControlBtn">' + SVG_ICONS.review + '</div>' : '') +
		(!expandedCommit.loading ? '<div id="cdvFileViewTypeTree" class="cdvControlBtn cdvFileViewTypeBtn" title="File Tree View">' + SVG_ICONS.fileTree + '</div><div id="cdvFileViewTypeList" class="cdvControlBtn cdvFileViewTypeBtn" title="File List View">' + SVG_ICONS.fileList + '</div>' +
			'<div id="cdvDiffViewUnified" class="cdvControlBtn cdvDiffViewBtn" title="Unified Diff">' + SVG_ICONS.diffUnified + '</div><div id="cdvDiffViewSideBySide" class="cdvControlBtn cdvDiffViewBtn" title="Side by Side Diff">' + SVG_ICONS.diffSideBySide + '</div>' : '') +
		(externalDiffPossible ? '<div id="cdvExternalDiff" class="cdvControlBtn">' + SVG_ICONS.linkExternal + '</div>' : '') +
		'</div><div class="cdvHeightResize"></div>';

	elem.innerHTML = isDocked ? html : '<td><div class="cdvHeightResize"></div></td><td colspan="' + (view.getNumColumns() - 1) + '">' + html + '</td>';
	if (!expandedCommit.loading) view.setCdvDivider();
	view.setCdvRowSplit();
	if (!isDocked) view.renderGraph();

	if (!refresh) commitsScrollCdvIntoView(view, elem, isDocked, expandedCommit);

	view.makeCdvResizable();
	document.getElementById('cdvClose')!.addEventListener('click', () => view.closeCommitDetails(true));
	view.makeCdvRowDividerDraggable();
	commitsSetupCdvInteractivity(view, expandedCommit, codeReviewPossible, externalDiffPossible);
	view.renderTopFullDiffButton();
}

function commitsSetCdvHeight(view: any, elem: HTMLElement, isDocked: boolean) {
	let height = view.gitRepos[view.currentRepo].cdvHeight, windowHeight = window.innerHeight;
	if (height > windowHeight - 40) {
		height = Math.max(windowHeight - 40, 100);
		if (height !== view.gitRepos[view.currentRepo].cdvHeight) {
			view.gitRepos[view.currentRepo].cdvHeight = height;
			view.saveRepoState();
		}
	}

	elem.style.height = height + 'px';
	if (isDocked) view.updateLayoutBottoms();
	view.setCdvRowSplit();
}

function commitsIsCdvOpen(view: any, commitHash: string, compareWithHash: string | null) {
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
	const expandedCommit = view.expandedCommit, filesElem = document.getElementById('cdvFiles');
	if (expandedCommit === null || expandedCommit.fileTree === null || expandedCommit.fileChanges === null || filesElem === null) return;
	CommitsView.closeCdvContextMenuIfOpen(expandedCommit);
	view.setFileViewType(type);
	const commitOrder = view.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash === null ? expandedCommit.commitHash : expandedCommit.compareWithHash);
	filesElem.innerHTML = generateFileViewHtml(expandedCommit.fileTree, expandedCommit.fileChanges, expandedCommit.lastViewedFile, expandedCommit.contextMenuOpen.fileView, type, commitOrder.to === UNCOMMITTED);
	view.makeCdvFileViewInteractive();
	view.renderCdvFileViewTypeBtns();
}
