/* CDV file view helpers extracted from CommitsView */

function commitsHandleCdvFileClick(view: any, e: Event) {
	const getFileElemOfEventTarget = (target: EventTarget) => <HTMLElement>(<Element>target).closest('.fileTreeFileRecord');
	const getFileOfFileElem = (fileChanges: ReadonlyArray<GG.GitFileChange>, fileElem: HTMLElement) => fileChanges[parseInt(fileElem.dataset.index!)];

	const getCommitHashForFile = (file: GG.GitFileChange, expandedCommit: ExpandedCommit) => {
		const commit = view.commits[view.commitLookup[expandedCommit.commitHash]];
		if (expandedCommit.compareWithHash !== null) {
			return view.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash).to;
		} else if (commit.stash !== null && file.type === GG.GitFileStatus.Untracked) {
			return commit.stash.untrackedFilesHash!;
		} else {
			return expandedCommit.commitHash;
		}
	};

	addListenerToClass('copyGitFile', 'click', (e) => {
		const expandedCommit = view.expandedCommit;
		if (expandedCommit === null || expandedCommit.fileChanges === null || e.target === null) return;

		const fileElem = getFileElemOfEventTarget(e.target);
		sendMessage({ command: 'copyFilePath', repo: view.currentRepo, filePath: getFileOfFileElem(expandedCommit.fileChanges, fileElem).newFilePath, absolute: true });
	});

	addListenerToClass('viewGitFileAtRevision', 'click', (e) => {
		const expandedCommit = view.expandedCommit;
		if (expandedCommit === null || expandedCommit.fileChanges === null || e.target === null) return;

		const fileElem = getFileElemOfEventTarget(e.target);
		const file = getFileOfFileElem(expandedCommit.fileChanges, fileElem);
		view.cdvUpdateFileState(file, fileElem, true, true);
		sendMessage({ command: 'viewFileAtRevision', repo: view.currentRepo, hash: getCommitHashForFile(file, expandedCommit), filePath: file.newFilePath });
	});

	addListenerToClass('openGitFile', 'click', (e) => {
		const expandedCommit = view.expandedCommit;
		if (expandedCommit === null || expandedCommit.fileChanges === null || e.target === null) return;

		const fileElem = getFileElemOfEventTarget(e.target);
		const file = getFileOfFileElem(expandedCommit.fileChanges, fileElem);
		view.cdvUpdateFileState(file, fileElem, true, true);
		sendMessage({ command: 'openFile', repo: view.currentRepo, hash: getCommitHashForFile(file, expandedCommit), filePath: file.newFilePath });
	});

	void e;
}

function commitsHandleCdvFileContext(view: any, e: Event) {
	const getFileElemOfEventTarget = (target: EventTarget) => <HTMLElement>(<Element>target).closest('.fileTreeFileRecord');
	const getFileOfFileElem = (fileChanges: ReadonlyArray<GG.GitFileChange>, fileElem: HTMLElement) => fileChanges[parseInt(fileElem.dataset.index!)];

	const getCommitHashForFile = (file: GG.GitFileChange, expandedCommit: ExpandedCommit) => {
		const commit = view.commits[view.commitLookup[expandedCommit.commitHash]];
		if (expandedCommit.compareWithHash !== null) {
			return view.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash).to;
		} else if (commit.stash !== null && file.type === GG.GitFileStatus.Untracked) {
			return commit.stash.untrackedFilesHash!;
		} else {
			return expandedCommit.commitHash;
		}
	};

	addListenerToClass('fileTreeFileRecord', 'contextmenu', (e: Event) => {
		handledEvent(e);
		const expandedCommit = view.expandedCommit;
		if (expandedCommit === null || expandedCommit.fileChanges === null || e.target === null) return;
		const fileElem = getFileElemOfEventTarget(e.target);
		const file = getFileOfFileElem(expandedCommit.fileChanges, fileElem);
		const commitOrder = view.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash === null ? expandedCommit.commitHash : expandedCommit.compareWithHash);
		const isUncommitted = commitOrder.to === UNCOMMITTED;

		CommitsView.closeCdvContextMenuIfOpen(expandedCommit);
		expandedCommit.contextMenuOpen.fileView = parseInt(fileElem.dataset.index!);

		const target: ContextMenuTarget & CommitTarget = {
			type: TargetType.CommitDetailsView,
			hash: expandedCommit.commitHash,
			index: view.commitLookup[expandedCommit.commitHash],
			elem: fileElem
		};
		const diffPossible = file.type === GG.GitFileStatus.Untracked || (file.additions !== null && file.deletions !== null);
		const fileExistsAtThisRevision = file.type !== GG.GitFileStatus.Deleted && !isUncommitted;
		const fileExistsAtThisRevisionAndDiffPossible = fileExistsAtThisRevision && diffPossible;
		const codeReviewInProgressAndNotReviewed = expandedCommit.codeReview !== null && expandedCommit.codeReview.remainingFiles.includes(file.newFilePath);
		const visibility = view.config.contextMenuActionsVisibility.commitDetailsViewFile;

		const getFileDiffHashes = (file: GG.GitFileChange): { fromHash: string; toHash: string; fileStatus: GG.GitFileStatus } => {
			let commit = view.commits[view.commitLookup[expandedCommit!.commitHash]], fromHash: string, toHash: string, fileStatus = file.type;
			if (expandedCommit!.compareWithHash !== null) {
				const co = view.getCommitOrder(expandedCommit!.commitHash, expandedCommit!.compareWithHash);
				fromHash = co.from; toHash = co.to;
			} else if (commit.stash !== null) {
				if (fileStatus === GG.GitFileStatus.Untracked) {
					fromHash = commit.stash.untrackedFilesHash!; toHash = fromHash;
					fileStatus = GG.GitFileStatus.Added;
				} else { fromHash = commit.stash.baseHash; toHash = expandedCommit!.commitHash; }
			} else { fromHash = expandedCommit!.commitHash; toHash = expandedCommit!.commitHash; }
			return { fromHash, toHash, fileStatus };
		};

		const triggerViewFileDiff = (file: GG.GitFileChange, fileElem: HTMLElement) => {
			if (expandedCommit === null) return;
			const { fromHash, toHash, fileStatus } = getFileDiffHashes(file);
			view.cdvUpdateFileState(file, fileElem, true, true);
			view.currentDiffRequest = { fromHash, toHash, oldFilePath: file.oldFilePath, newFilePath: file.newFilePath, type: fileStatus };
			view.currentDiffFilePath = file.newFilePath;
			view.currentDiffText = null;
			view.currentFullDiffData = null;
			if (view.fullDiffMode) {
				view.createFullDiffPanel();
				view.hideDiffPane();
				sendMessage({ command: 'getFullDiffContent', repo: view.currentRepo, fromHash, toHash, oldFilePath: file.oldFilePath, newFilePath: file.newFilePath, type: fileStatus });
			} else {
				sendMessage({ command: 'getFileDiff', repo: view.currentRepo, fromHash, toHash, oldFilePath: file.oldFilePath, newFilePath: file.newFilePath });
			}
		};

		contextMenu.show([
			[
				{
					title: 'View Diff',
					visible: visibility.viewDiff && diffPossible,
					onClick: () => {
						if (expandedCommit === null) return;
						const { fromHash, toHash, fileStatus } = getFileDiffHashes(file);
						sendMessage({ command: 'viewDiff', repo: view.currentRepo, fromHash, toHash, oldFilePath: file.oldFilePath, newFilePath: file.newFilePath, type: fileStatus });
					}
				},
				{
					title: 'View File at this Revision',
					visible: visibility.viewFileAtThisRevision && fileExistsAtThisRevisionAndDiffPossible,
					onClick: () => { view.cdvUpdateFileState(file, fileElem, true, true); sendMessage({ command: 'viewFileAtRevision', repo: view.currentRepo, hash: getCommitHashForFile(file, expandedCommit), filePath: file.newFilePath }); }
				},
				{
					title: 'View Diff with Working File',
					visible: visibility.viewDiffWithWorkingFile && fileExistsAtThisRevisionAndDiffPossible,
					onClick: () => { view.cdvUpdateFileState(file, fileElem, null, true); sendMessage({ command: 'viewDiffWithWorkingFile', repo: view.currentRepo, hash: getCommitHashForFile(file, expandedCommit), filePath: file.newFilePath }); }
				},
				{
					title: 'Open File',
					visible: visibility.openFile && file.type !== GG.GitFileStatus.Deleted,
					onClick: () => { view.cdvUpdateFileState(file, fileElem, true, true); sendMessage({ command: 'openFile', repo: view.currentRepo, hash: getCommitHashForFile(file, expandedCommit), filePath: file.newFilePath }); }
				}
			],
			[
				{
					title: 'Mark as Reviewed',
					visible: visibility.markAsReviewed && codeReviewInProgressAndNotReviewed,
					onClick: () => view.cdvUpdateFileState(file, fileElem, true, false)
				},
				{
					title: 'Mark as Not Reviewed',
					visible: visibility.markAsNotReviewed && expandedCommit.codeReview !== null && !codeReviewInProgressAndNotReviewed,
					onClick: () => view.cdvUpdateFileState(file, fileElem, false, false)
				}
			],
			[
				{
					title: 'Reset File to this Revision' + ELLIPSIS,
					visible: visibility.resetFileToThisRevision && fileExistsAtThisRevision && expandedCommit.compareWithHash === null,
					onClick: () => {
						const commitHash = getCommitHashForFile(file, expandedCommit);
						dialog.showConfirmation('Are you sure you want to reset <b><i>' + escapeHtml(file.newFilePath) + '</i></b> to it\'s state at commit <b><i>' + abbrevCommit(commitHash) + '</i></b>? Any uncommitted changes made to this file will be overwritten.', 'Yes, reset file', () => {
							runAction({ command: 'resetFileToRevision', repo: view.currentRepo, commitHash: commitHash, filePath: file.newFilePath }, 'Resetting file');
						}, { type: TargetType.CommitDetailsView, hash: commitHash, elem: fileElem });
					}
				}
			],
			[
				{
					title: 'Copy Absolute File Path to Clipboard',
					visible: visibility.copyAbsoluteFilePath,
					onClick: () => sendMessage({ command: 'copyFilePath', repo: view.currentRepo, filePath: file.newFilePath, absolute: true })
				},
				{
					title: 'Copy Relative File Path to Clipboard',
					visible: visibility.copyRelativeFilePath,
					onClick: () => sendMessage({ command: 'copyFilePath', repo: view.currentRepo, filePath: file.newFilePath, absolute: false })
				}
			]
		], false, target, <MouseEvent>e, view.isCdvDocked() ? document.body : view.viewElem, () => {
			expandedCommit.contextMenuOpen.fileView = -1;
		});
	});
}

function commitsMakeCdvFileViewInteractive(view: any) {
	commitsHandleCdvFileClick(view, <Event><unknown>null);
	commitsHandleCdvFileContext(view, <Event><unknown>null);
}

function commitsRenderCdvFileViewTypeBtns(view: any) {
	if (view.expandedCommit === null) return;
	let treeBtnElem = document.getElementById('cdvFileViewTypeTree'), listBtnElem = document.getElementById('cdvFileViewTypeList');
	if (treeBtnElem === null || listBtnElem === null) return;

	let listView = view.getFileViewType() === GG.FileViewType.List;
	alterClass(treeBtnElem, CLASS_ACTIVE, !listView);
	alterClass(listBtnElem, CLASS_ACTIVE, listView);
}

function commitsRenderCdvExternalDiffBtn(view: any) {
	if (view.expandedCommit === null) return;
	const externalDiffBtnElem = document.getElementById('cdvExternalDiff');
	if (externalDiffBtnElem === null) return;

	alterClass(externalDiffBtnElem, CLASS_ENABLED, view.gitConfig !== null && (view.gitConfig.diffTool !== null || view.gitConfig.guiDiffTool !== null));
	const toolName = view.gitConfig !== null
		? view.gitConfig.guiDiffTool !== null
			? view.gitConfig.guiDiffTool
			: view.gitConfig.diffTool
		: null;
	externalDiffBtnElem.title = 'Open External Directory Diff' + (toolName !== null ? ' with "' + toolName + '"' : '');
}

function commitsCdvUpdateFileState(view: any, file: GG.GitFileChange, fileElem: HTMLElement, isReviewed: boolean | null, fileWasViewed: boolean) {
	const expandedCommit = view.expandedCommit, filesElem = view.filesPanel.getContentElem(), filePath = file.newFilePath;
	if (expandedCommit === null || expandedCommit.fileTree === null) return;

	if (fileWasViewed) {
		expandedCommit.lastViewedFile = filePath;
		let lastViewedElem = document.getElementById('cdvLastFileViewed');
		if (lastViewedElem !== null) lastViewedElem.remove();
		lastViewedElem = document.createElement('span');
		lastViewedElem.id = 'cdvLastFileViewed';
		lastViewedElem.title = 'Last File Viewed';
		lastViewedElem.innerHTML = SVG_ICONS.eyeOpen;
		insertBeforeFirstChildWithClass(lastViewedElem, fileElem, 'fileTreeFileAction');
	}

	if (expandedCommit.codeReview !== null) {
		if (isReviewed !== null) {
			if (isReviewed) {
				expandedCommit.codeReview.remainingFiles = expandedCommit.codeReview.remainingFiles.filter((path: string) => path !== filePath);
			} else {
				expandedCommit.codeReview.remainingFiles.push(filePath);
			}

			alterFileTreeFileReviewed(expandedCommit.fileTree, filePath, isReviewed);
			updateFileTreeHtmlFileReviewed(filesElem, expandedCommit.fileTree, filePath);
		}

		sendMessage({
			command: 'updateCodeReview',
			repo: view.currentRepo,
			id: expandedCommit.codeReview.id,
			remainingFiles: expandedCommit.codeReview.remainingFiles,
			lastViewedFile: expandedCommit.lastViewedFile
		});

		if (expandedCommit.codeReview.remainingFiles.length === 0) {
			expandedCommit.codeReview = null;
			view.renderCodeReviewBtn();
		}
	}

	view.saveState();
}

function commitsHandleFilesPanelClick(view: any, e: MouseEvent) {
	const target = e.target as Element;

	// Folder toggle (only when CDV is open and has file tree state)
	const folderElem = target.closest('.fileTreeFolder') as HTMLElement | null;
	if (folderElem) {
		const expandedCommit = view.expandedCommit;
		if (expandedCommit === null || expandedCommit.fileTree === null) return;
		const parent = folderElem.parentElement!;
		parent.classList.toggle('closed');
		const isOpen = !parent.classList.contains('closed');
		parent.children[0].children[0].innerHTML = isOpen ? SVG_ICONS.openFolder : SVG_ICONS.closedFolder;
		parent.children[1].classList.toggle('hidden');
		alterFileTreeFolderOpen(expandedCommit.fileTree, decodeURIComponent(folderElem.dataset.folderpath!), isOpen);
		view.saveState();
		return;
	}

	// File click — show diff in full diff panel
	const hashes = commitsGetFilesPanelDiffHashes(view, target);
	if (!hashes) return;
	const { file, fromHash, toHash, fileStatus } = hashes;
	view.currentDiffRequest = { fromHash, toHash, oldFilePath: file.oldFilePath, newFilePath: file.newFilePath, type: fileStatus };
	view.currentDiffFilePath = file.newFilePath;
	view.currentFullDiffData = null;
	view.createFullDiffPanel();
	sendMessage({ command: 'getFullDiffContent', repo: view.currentRepo, fromHash, toHash, oldFilePath: file.oldFilePath, newFilePath: file.newFilePath, type: fileStatus });
}

function commitsHandleFilesPanelDblClick(view: any, e: MouseEvent) {
	const hashes = commitsGetFilesPanelDiffHashes(view, e.target as Element);
	if (!hashes) return;
	const { file, fromHash, toHash, fileStatus } = hashes;
	sendMessage({ command: 'viewDiff', repo: view.currentRepo, fromHash, toHash, oldFilePath: file.oldFilePath, newFilePath: file.newFilePath, type: fileStatus });
}

function commitsGetFilesPanelDiffHashes(view: any, target: Element): { file: GG.GitFileChange; fromHash: string; toHash: string; fileStatus: GG.GitFileStatus } | null {
	const fileElem = target.closest('.fileTreeFile') as HTMLElement | null;
	if (!fileElem || !fileElem.classList.contains('gitDiffPossible')) return null;
	const record = target.closest('.fileTreeFileRecord') as HTMLElement | null;
	if (!record) return null;

	const fileIndex = parseInt(record.dataset.index!);
	const expandedCommit = view.expandedCommit;
	const fileChanges: ReadonlyArray<GG.GitFileChange> | null = expandedCommit !== null ? expandedCommit.fileChanges : view.previewFileChanges;
	const commitHash: string | null = expandedCommit !== null ? expandedCommit.commitHash : view.filesPanelCommitHash;
	if (!fileChanges || !commitHash) return null;

	const file = fileChanges[fileIndex];
	if (!file) return null;

	let fromHash: string, toHash: string, fileStatus = file.type;
	if (expandedCommit !== null) {
		const commit = view.commits[view.commitLookup[expandedCommit.commitHash]];
		if (expandedCommit.compareWithHash !== null) {
			const co = view.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash);
			fromHash = co.from; toHash = co.to;
		} else if (commit.stash !== null) {
			if (fileStatus === GG.GitFileStatus.Untracked) {
				fromHash = commit.stash.untrackedFilesHash!; toHash = fromHash; fileStatus = GG.GitFileStatus.Added;
			} else {
				fromHash = commit.stash.baseHash; toHash = expandedCommit.commitHash;
			}
		} else {
			fromHash = expandedCommit.commitHash; toHash = expandedCommit.commitHash;
		}
	} else {
		fromHash = commitHash; toHash = commitHash;
	}
	return { file, fromHash, toHash, fileStatus };
}
