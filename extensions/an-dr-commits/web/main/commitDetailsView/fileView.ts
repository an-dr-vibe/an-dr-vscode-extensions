/* Commit Details View file view helpers extracted from CommitsView */

function commitsHandleCommitDetailsViewFileClick(view: any, e: Event) {
	const getFileElemOfEventTarget = (target: EventTarget) => <HTMLElement>(<Element>target).closest('.fileTreeFileRecord');
	const getFileOfFileElem = (fileChanges: ReadonlyArray<GG.GitFileChange>, fileElem: HTMLElement) => fileChanges[parseInt(fileElem.dataset.index!)];

	const getFileChanges = () => {
		const expandedCommit = view.expandedCommit;
		return expandedCommit !== null ? expandedCommit.fileChanges : view.filesPanelFileChanges;
	};

	const getCommitHashForFile = (file: GG.GitFileChange) => {
		const expandedCommit = view.expandedCommit;
		if (expandedCommit !== null) {
			const commit = view.commits[view.commitLookup[expandedCommit.commitHash]];
			if (expandedCommit.compareWithHash !== null) {
				return view.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash).to;
			} else if (commit.stash !== null && file.type === GG.GitFileStatus.Untracked) {
				return commit.stash.untrackedFilesHash!;
			} else {
				return expandedCommit.commitHash;
			}
		}
		const commitHash = view.filesPanelCommitHash;
		const compareWithHash = view.filesPanelCompareWithHash;
		if (compareWithHash !== null) {
			return view.getCommitOrder(commitHash, compareWithHash).to;
		}
		return commitHash;
	};

	addListenerToClass('copyGitFile', 'click', (e) => {
		const fileChanges = getFileChanges();
		if (fileChanges === null || e.target === null) return;

		const fileElem = getFileElemOfEventTarget(e.target);
		sendMessage({ command: 'copyFilePath', repo: view.currentRepo, filePath: getFileOfFileElem(fileChanges, fileElem).newFilePath, absolute: true });
	});

	addListenerToClass('viewGitFileAtRevision', 'click', (e) => {
		const fileChanges = getFileChanges();
		if (fileChanges === null || e.target === null) return;

		const fileElem = getFileElemOfEventTarget(e.target);
		const file = getFileOfFileElem(fileChanges, fileElem);
		view.commitDetailsViewUpdateFileState(file, fileElem, true, true);
		sendMessage({ command: 'viewFileAtRevision', repo: view.currentRepo, hash: getCommitHashForFile(file), filePath: file.newFilePath });
	});

	addListenerToClass('openGitFile', 'click', (e) => {
		const fileChanges = getFileChanges();
		if (fileChanges === null || e.target === null) return;

		const fileElem = getFileElemOfEventTarget(e.target);
		const file = getFileOfFileElem(fileChanges, fileElem);
		view.commitDetailsViewUpdateFileState(file, fileElem, true, true);
		sendMessage({ command: 'openFile', repo: view.currentRepo, hash: getCommitHashForFile(file), filePath: file.newFilePath });
	});

	void e;
}

function commitsHandleCommitDetailsViewFileContext(view: any, e: Event) {
	const getFileElemOfEventTarget = (target: EventTarget) => <HTMLElement>(<Element>target).closest('.fileTreeFileRecord');
	const getFileOfFileElem = (fileChanges: ReadonlyArray<GG.GitFileChange>, fileElem: HTMLElement) => fileChanges[parseInt(fileElem.dataset.index!)];

	addListenerToClass('fileTreeFileRecord', 'contextmenu', (e: Event) => {
		handledEvent(e);
		const expandedCommit = view.expandedCommit;
		const fileChanges: ReadonlyArray<GG.GitFileChange> | null = expandedCommit !== null ? expandedCommit.fileChanges : view.filesPanelFileChanges;
		const commitHash: string | null = expandedCommit !== null ? expandedCommit.commitHash : view.filesPanelCommitHash;
		const compareWithHash: string | null = expandedCommit !== null ? expandedCommit.compareWithHash : view.filesPanelCompareWithHash;
		if (fileChanges === null || commitHash === null || e.target === null) return;

		const fileElem = getFileElemOfEventTarget(e.target);
		const file = getFileOfFileElem(fileChanges, fileElem);
		const commitOrder = view.getCommitOrder(commitHash, compareWithHash === null ? commitHash : compareWithHash);
		const isUncommitted = commitOrder.to === UNCOMMITTED;

		if (expandedCommit !== null) {
			CommitsView.closeCommitDetailsViewContextMenuIfOpen(expandedCommit);
			expandedCommit.contextMenuOpen.fileView = parseInt(fileElem.dataset.index!);
		}

		const target: ContextMenuTarget & CommitTarget = {
			type: TargetType.CommitDetailsView,
			hash: commitHash,
			index: view.commitLookup[commitHash],
			elem: fileElem
		};
		const diffPossible = file.type === GG.GitFileStatus.Untracked || (file.additions !== null && file.deletions !== null);
		const fileExistsAtThisRevision = file.type !== GG.GitFileStatus.Deleted && !isUncommitted;
		const fileExistsAtThisRevisionAndDiffPossible = fileExistsAtThisRevision && diffPossible;
		const visibility = view.config.contextMenuActionsVisibility.commitDetailsViewFile;

		const getCommitHashForFile = (file: GG.GitFileChange) => {
			if (expandedCommit !== null) {
				const commit = view.commits[view.commitLookup[expandedCommit.commitHash]];
				if (expandedCommit.compareWithHash !== null) {
					return view.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash).to;
				} else if (commit.stash !== null && file.type === GG.GitFileStatus.Untracked) {
					return commit.stash.untrackedFilesHash!;
				} else {
					return expandedCommit.commitHash;
				}
			}
			if (compareWithHash !== null) return view.getCommitOrder(commitHash, compareWithHash).to;
			return commitHash;
		};

		const getFileDiffHashes = (file: GG.GitFileChange): { fromHash: string; toHash: string; fileStatus: GG.GitFileStatus } => {
			let fromHash: string, toHash: string, fileStatus = file.type;
			if (expandedCommit !== null) {
				const commit = view.commits[view.commitLookup[expandedCommit.commitHash]];
				if (expandedCommit.compareWithHash !== null) {
					const co = view.getCommitOrder(expandedCommit.commitHash, expandedCommit.compareWithHash);
					fromHash = co.from; toHash = co.to;
				} else if (commit.stash !== null) {
					if (fileStatus === GG.GitFileStatus.Untracked) {
						fromHash = commit.stash.untrackedFilesHash!; toHash = fromHash;
						fileStatus = GG.GitFileStatus.Added;
					} else { fromHash = commit.stash.baseHash; toHash = expandedCommit.commitHash; }
				} else { fromHash = expandedCommit.commitHash; toHash = expandedCommit.commitHash; }
			} else if (compareWithHash !== null) {
				const co = view.getCommitOrder(commitHash, compareWithHash);
				fromHash = co.from; toHash = co.to;
			} else { fromHash = commitHash; toHash = commitHash; }
			return { fromHash, toHash, fileStatus };
		};

		const triggerViewFileDiff = (file: GG.GitFileChange, fileElem: HTMLElement) => {
			const { fromHash, toHash, fileStatus } = getFileDiffHashes(file);
			view.commitDetailsViewUpdateFileState(file, fileElem, true, true);
			view.currentDiffRequest = { fromHash, toHash, oldFilePath: file.oldFilePath, newFilePath: file.newFilePath, type: fileStatus };
			view.currentDiffFilePath = file.newFilePath;
			view.currentDiffText = null;
			view.currentFullDiffData = null;
			view.createFullDiffPanel();
			view.hideDiffPane();
			sendMessage({ command: 'getFullDiffContent', repo: view.currentRepo, fromHash, toHash, oldFilePath: file.oldFilePath, newFilePath: file.newFilePath, type: fileStatus });
		};

		contextMenu.show([
			[
				{
					title: 'View Diff',
					visible: visibility.viewDiff && diffPossible,
					onClick: () => {
						const { fromHash, toHash, fileStatus } = getFileDiffHashes(file);
						sendMessage({ command: 'viewDiff', repo: view.currentRepo, fromHash, toHash, oldFilePath: file.oldFilePath, newFilePath: file.newFilePath, type: fileStatus });
					}
				},
				{
					title: 'View File at this Revision',
					visible: visibility.viewFileAtThisRevision && fileExistsAtThisRevisionAndDiffPossible,
					onClick: () => { view.commitDetailsViewUpdateFileState(file, fileElem, true, true); sendMessage({ command: 'viewFileAtRevision', repo: view.currentRepo, hash: getCommitHashForFile(file), filePath: file.newFilePath }); }
				},
				{
					title: 'View Diff with Working File',
					visible: visibility.viewDiffWithWorkingFile && fileExistsAtThisRevisionAndDiffPossible,
					onClick: () => { view.commitDetailsViewUpdateFileState(file, fileElem, null, true); sendMessage({ command: 'viewDiffWithWorkingFile', repo: view.currentRepo, hash: getCommitHashForFile(file), filePath: file.newFilePath }); }
				},
				{
					title: 'Open File',
					visible: visibility.openFile && file.type !== GG.GitFileStatus.Deleted,
					onClick: () => { view.commitDetailsViewUpdateFileState(file, fileElem, true, true); sendMessage({ command: 'openFile', repo: view.currentRepo, hash: getCommitHashForFile(file), filePath: file.newFilePath }); }
				}
			],
			[
				{
					title: 'Reset File to this Revision' + ELLIPSIS,
					visible: visibility.resetFileToThisRevision && fileExistsAtThisRevision && compareWithHash === null,
					onClick: () => {
						const hash = getCommitHashForFile(file);
						dialog.showConfirmation('Are you sure you want to reset <b><i>' + escapeHtml(file.newFilePath) + '</i></b> to it\'s state at commit <b><i>' + abbrevCommit(hash) + '</i></b>? Any uncommitted changes made to this file will be overwritten.', 'Yes, reset file', () => {
							runAction({ command: 'resetFileToRevision', repo: view.currentRepo, commitHash: hash, filePath: file.newFilePath }, 'Resetting file');
						}, { type: TargetType.CommitDetailsView, hash: hash, elem: fileElem });
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
		], false, target, <MouseEvent>e, view.isCommitDetailsViewDocked() ? document.body : view.viewElem, () => {
			if (view.expandedCommit !== null) view.expandedCommit.contextMenuOpen.fileView = -1;
		});
	});
}

function commitsMakeCommitDetailsViewFileViewInteractive(view: any) {
	commitsHandleCommitDetailsViewFileClick(view, <Event><unknown>null);
	commitsHandleCommitDetailsViewFileContext(view, <Event><unknown>null);
}

function commitsSetSelectedFileRecord(record: HTMLElement) {
	document.querySelectorAll('.fileTreeFileRecord.' + CLASS_SELECTED).forEach((elem) => {
		elem.classList.remove(CLASS_SELECTED);
	});
	record.classList.add(CLASS_SELECTED);
}

function commitsRenderCommitDetailsViewExternalDiffBtn(view: any) {
	const toolName = view.gitConfig !== null
		? view.gitConfig.guiDiffTool !== null
			? view.gitConfig.guiDiffTool
			: view.gitConfig.diffTool
		: null;
	document.querySelectorAll('[id="commitDetailsViewExternalDiff"]').forEach((externalDiffBtnElem) => {
		alterClass(<HTMLElement>externalDiffBtnElem, CLASS_ENABLED, toolName !== null);
		(<HTMLElement>externalDiffBtnElem).title = 'Open External Directory Diff' + (toolName !== null ? ' with "' + toolName + '"' : '');
	});
}

function commitsCommitDetailsViewUpdateFileState(view: any, file: GG.GitFileChange, fileElem: HTMLElement, isReviewed: boolean | null, fileWasViewed: boolean) {
	void fileWasViewed;
	view.saveState();
}

function commitsHandleFilesPanelClick(view: any, e: MouseEvent) {
	const target = e.target as Element;

	// Folder toggle
	const folderElem = target.closest('.fileTreeFolder') as HTMLElement | null;
	if (folderElem) {
		const expandedCommit = view.expandedCommit;
		const fileTree = expandedCommit !== null ? expandedCommit.fileTree : view.filesPanelFileTree;
		if (fileTree === null) return;
		const parent = folderElem.parentElement!;
		parent.classList.toggle('closed');
		const isOpen = !parent.classList.contains('closed');
		parent.children[0].children[0].innerHTML = isOpen ? ICONS.openFolder : ICONS.closedFolder;
		parent.children[1].classList.toggle('hidden');
		alterFileTreeFolderOpen(fileTree, decodeURIComponent(folderElem.dataset.folderpath!), isOpen);
		view.saveState();
		return;
	}

	// File click — show diff in full diff panel
	const hashes = commitsGetFilesPanelDiffHashes(view, target);
	if (!hashes) return;
	const { file, fromHash, toHash, fileStatus } = hashes;
	const record = target.closest('.fileTreeFileRecord') as HTMLElement | null;
	if (record !== null) commitsSetSelectedFileRecord(record);
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
	const fileChanges: ReadonlyArray<GG.GitFileChange> | null = expandedCommit !== null ? expandedCommit.fileChanges : view.filesPanelFileChanges;
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
	} else if (view.filesPanelCompareWithHash !== null) {
		const co = view.getCommitOrder(commitHash, view.filesPanelCompareWithHash);
		fromHash = co.from; toHash = co.to;
	} else {
		fromHash = commitHash; toHash = commitHash;
	}
	return { file, fromHash, toHash, fileStatus };
}
