// Based on vscode-an-dr-commits by Michael Hutchison
// Original: https://github.com/mhutchie/vscode-an-dr-commits
// License: MIT
// Refactor note: This file remains large while behavior-preserving extraction proceeds into `web/main/*` helpers.
type DraggedRef = {
	type: 'branch' | 'tag';
	name: string;
	tagType?: 'annotated' | 'lightweight';
};

type SidebarResolvedRef =
	{ kind: 'localBranch'; name: string; displayName: string }
	| { kind: 'remoteBranch'; name: string; displayName: string; remote: string; branchName: string }
	| { kind: 'tag'; name: string; displayName: string; hash: string | null; annotated: boolean | null };

type SidebarTagContextResolver = (result: { hash: string; annotated: boolean } | null) => void;
type CommitRefBadgeType = 'head' | 'remote' | 'tag' | 'stash';
type CommitRefBadge = {
	type: CommitRefBadgeType;
	html: string;
};
type CurrentDiffRequest = {
	fromHash: string;
	toHash: string;
	oldFilePath: string;
	newFilePath: string;
	type: GG.GitFileStatus;
};

class CommitsView {
	private gitRepos: GG.GitRepoSet;
	private gitBranches: ReadonlyArray<string> = [];
	private gitBranchUpstreams: { readonly [branchName: string]: string } = {};
	private gitGoneUpstreamBranches: ReadonlyArray<string> = [];
	private gitRemoteHeadTargets: { readonly [remoteName: string]: string } = {};
	private gitRepoInProgressState: GG.GitRepoInProgressState | null = null;
	private gitBranchHead: string | null = null;
	private gitConfig: GG.GitRepoConfig | null = null;
	private gitRemotes: ReadonlyArray<string> = [];
	private gitStashes: ReadonlyArray<GG.GitStash> = [];
	private gitTags: ReadonlyArray<string> = [];
	private commits: GG.GitCommit[] = [];
	private commitHead: string | null = null;
	private commitLookup: { [hash: string]: number } = {};
	private onlyFollowFirstParent: boolean = false;
	private avatars: AvatarImageCollection = {};
	private proceduralAvatars: { [seed: string]: string } = {};
	private currentBranches: string[] | null = null;
	private currentTags: string[] = [];

	private currentRepo!: string;
	private currentRepoLoading: boolean = true;
	private currentRepoRefreshState: {
		inProgress: boolean;
		hard: boolean;
		loadRepoInfoRefreshId: number;
		loadCommitsRefreshId: number;
		repoInfoChanges: boolean;
		configChanges: boolean;
		requestingRepoInfo: boolean;
		requestingConfig: boolean;
	};
	private loadViewTo: GG.LoadCommitsViewTo = null;

	private readonly graph: Graph;
	private readonly config: Config;
	public filesPanel!: FilesPanel;
	private commitDropTarget: HTMLElement | null = null;

	private moreCommitsAvailable: boolean = false;
	private expandedCommit: ExpandedCommit | null = null;
	public fullDiffViewMode: 'unified' | 'sideBySide' = globalState.fullDiffViewMode;
	public currentDiffRequest: CurrentDiffRequest | null = null;
	public currentDiffText: string | null = null;
	public currentFullDiffData: { diff: string | null; oldContent: string | null; newContent: string | null; oldExists: boolean; newExists: boolean } | null = null;
	private fullDiffMode: boolean = initialState.config.commitDetailsView.defaultDiffMode === 'full';
	public currentDiffFilePath: string | null = null;
	public previewCommitHash: string | null = null;
	public filesPanelCommitHash: string | null = null;
	public filesPanelCompareWithHash: string | null = null;
	public filesPanelFileChanges: ReadonlyArray<GG.GitFileChange> | null = null;
	public filesPanelFileTree: FileTreeFolder | null = null;
	public filesPanelCodeReview: GG.CodeReview | null = null;
	public previewCompareHashes: readonly [string, string] | null = null;
	private selectedCommits: Set<string> = new Set();
	private lastSelectedIndex: number = -1;
	private maxCommits: number;
	private scrollTop = 0;
	private renderedGitBranchHead: string | null = null;

	private lastScrollToStash: {
		time: number,
		hash: string | null
	} = { time: 0, hash: null };

	private readonly findWidget!: FindWidget;
	private readonly settingsWidget!: SettingsWidget;
	private readonly repoDropdown!: Dropdown;
	private readonly branchDropdown!: BranchPanel;

	private readonly viewElem: HTMLElement;
	private readonly controlsElem!: HTMLElement;
	private readonly controlsLeftElem!: HTMLElement;
	private readonly controlsBtnsElem!: HTMLElement;
	private readonly commitGraphElem!: HTMLElement;
	private readonly repoInProgressBannerElem!: HTMLElement;
	private readonly repoInProgressBannerPrimaryElem!: HTMLElement;
	private readonly repoInProgressBannerSecondaryElem!: HTMLElement;
	private readonly tableElem!: HTMLElement;
	private readonly footerElem!: HTMLElement;
	private readonly scrollShadowElem!: HTMLElement;
	private readonly findWidgetToggleBtnElem!: HTMLElement;
	private readonly topFullDiffBtnElem!: HTMLElement;
	private readonly settingsBtnElem!: HTMLElement;
	private readonly pullBtnElem!: HTMLElement;
	private readonly pushBtnElem!: HTMLElement;
	private readonly moreBtnElem!: HTMLElement;
	private compactFindWidgetPinnedOpen: boolean = false;
	private pendingBranchPanelState: GG.CommitsBranchPanelState | null = null;
	private sidebarTagContextRequestId: number = 0;
	private sidebarTagContextResolvers: { [requestId: number]: SidebarTagContextResolver } = {};

	constructor(viewElem: HTMLElement, prevState: WebViewState | null) {
		this.gitRepos = initialState.repos;
		this.config = initialState.config;
		this.maxCommits = this.config.initialLoadCommits;
		this.viewElem = viewElem;
		this.currentRepoRefreshState = {
			inProgress: false,
			hard: true,
			loadRepoInfoRefreshId: initialState.loadRepoInfoRefreshId,
			loadCommitsRefreshId: initialState.loadCommitsRefreshId,
			repoInfoChanges: false,
			configChanges: false,
			requestingRepoInfo: false,
			requestingConfig: false
		};

		commitsInitDomElements(this);
		viewElem.focus();
		this.graph = new Graph('commitGraph', viewElem, this.config.graph, this.config.mute);
		commitsInitDropdowns(this);
		this.renderRefreshButton();
		this.findWidget = new FindWidget(this);
		this.settingsWidget = new SettingsWidget(this);
		alterClass(document.body, CLASS_BRANCH_LABELS_ALIGNED_TO_GRAPH, this.config.referenceLabels.branchLabelsAlignedToGraph);
		alterClass(document.body, CLASS_TAG_LABELS_RIGHT_ALIGNED, this.config.referenceLabels.tagLabelsOnRight);
		this.observeWindowSizeChanges();
		this.observeWebviewStyleChanges();
		this.observeViewScroll();
		this.observeKeyboardEvents();
		this.observeUrls();
		this.observeTableEvents();

		const canRestoreFromPrevState = !!prevState && !prevState.currentRepoLoading &&
			typeof this.gitRepos[prevState.currentRepo] !== 'undefined' && prevState.commits.length > 0;
		if (canRestoreFromPrevState && prevState) commitsRestoreFromPrevState(this, prevState);

		const loadViewTo = commitsResolveLoadViewTo(this, prevState, canRestoreFromPrevState);
		commitsBootstrapLoad(this, prevState, loadViewTo);
		commitsInitButtonHandlers(this);
		this.updateControlsLayout();
	}


	/* Loading Data */

	public loadRepos(repos: GG.GitRepoSet, lastActiveRepo: string | null, loadViewTo: GG.LoadCommitsViewTo) {
		return commitsLoadRepos(this, repos, lastActiveRepo, loadViewTo);
	}

	private loadRepo(repo: string) {
		commitsLoadRepo(this, repo);
	}

	public static closeCdvContextMenuIfOpen(expandedCommit: ExpandedCommit) { commitsCloseCdvContextMenuIfOpen(expandedCommit); }

	private static isSameRepoInProgressState(a: GG.GitRepoInProgressState | null, b: GG.GitRepoInProgressState | null) {
		return commitsIsSameRepoInProgressState(a, b);
	}

	private getRebaseSequenceBadgeHtml(commitHash: string) {
		return commitsGetRebaseSequenceBadgeHtml(this, commitHash);
	}

	private loadRepoInfo(branchOptions: ReadonlyArray<string>, branchUpstreams: { readonly [branchName: string]: string }, goneUpstreamBranches: ReadonlyArray<string>, remoteHeadTargets: { readonly [remoteName: string]: string }, repoInProgressState: GG.GitRepoInProgressState | null, branchHead: string | null, remotes: ReadonlyArray<string>, stashes: ReadonlyArray<GG.GitStash>, isRepo: boolean) {
		commitsLoadRepoInfo(this, branchOptions, branchUpstreams, goneUpstreamBranches, remoteHeadTargets, repoInProgressState, branchHead, remotes, stashes, isRepo);
	}

	private finaliseLoadRepoInfo(repoInfoChanges: boolean, isRepo: boolean) {
		commitsFinaliseLoadRepoInfo(this, repoInfoChanges, isRepo);
	}

	private loadCommits(commits: GG.GitCommit[], commitHead: string | null, tags: ReadonlyArray<string>, moreAvailable: boolean, onlyFollowFirstParent: boolean) {
		commitsLoadCommits(this, commits, commitHead, tags, moreAvailable, onlyFollowFirstParent);
	}

	private finaliseLoadCommits() {
		commitsFinaliseLoadCommits(this);
	}

	private finaliseRepoLoad(didLoadRepoData: boolean) {
		commitsFinaliseRepoLoad(this, didLoadRepoData);
	}

	private clearCommits() {
		commitsClearCommits(this);
	}

	public processLoadRepoInfoResponse(msg: GG.ResponseLoadRepoInfo) {
		commitsProcessLoadRepoInfoResponse(this, msg);
	}

	public processLoadCommitsResponse(msg: GG.ResponseLoadCommits) {
		commitsProcessLoadCommitsResponse(this, msg);
	}

	public processLoadConfig(msg: GG.ResponseLoadConfig) {
		commitsProcessLoadConfig(this, msg);
	}

	private displayLoadDataError(message: string, reason: string) {
		commitsDisplayLoadDataError(this, message, reason);
	}

	public loadAvatar(email: string, image: string) {
		commitsLoadAvatar(this, email, image);
	}

	private shouldFetchAuthorAvatars() {
		return commitsShouldFetchAuthorAvatars(this);
	}

	private getAuthorAvatarShapeClass() {
		return commitsGetAuthorAvatarShapeClass(this);
	}

	private getAuthorAvatarSizeClass() {
		return commitsGetAuthorAvatarSizeClass(this);
	}

	private updateCommittedColumnDisplayMode() {
		commitsUpdateCommittedColumnDisplayMode(this);
	}

	private getAuthorAvatarSeed(author: string, email: string) {
		return commitsGetAuthorAvatarSeed(this, author, email);
	}

	private getProceduralAvatarImage(seed: string) {
		return commitsGetProceduralAvatarImage(this, seed);
	}

	private getAuthorVisual(author: string, email: string, fetchedAvatar: string | null) {
		return commitsGetAuthorVisual(this, author, email, fetchedAvatar);
	}

	private getCommitAuthorAvatarHtml(author: string, email: string) {
		return commitsGetCommitAuthorAvatarHtml(this, author, email);
	}

	private getCommittedVisualHtml(author: string, email: string) {
		return commitsGetCommittedVisualHtml(this, author, email);
	}

	private getCommittedDateParts(formatted: string) {
		return commitsGetCommittedDateParts(this, formatted);
	}

	private getCommittedCellHtml(commit: GG.GitCommit) {
		return commitsGetCommittedCellHtml(this, commit);
	}

	private getCommitDetailsAvatarHtml(author: string, email: string, fetchedAvatar: string | null) {
		return commitsGetCommitDetailsAvatarHtml(this, author, email, fetchedAvatar);
	}


	/* Getters */

	public getBranches(): ReadonlyArray<string> { return commitsGetBranches(this); }
	public getBranchOptions(includeShowAll?: boolean): ReadonlyArray<DialogSelectInputOption> { return commitsGetBranchOptions(this, includeShowAll); }
	public getRemoteHeadTargets(): { readonly [remoteName: string]: string } { return commitsGetRemoteHeadTargets(this); }
	public getCommitId(hash: string) { return commitsGetCommitId(this, hash); }
	private getCommitOfElem(elem: HTMLElement) { return commitsGetCommitOfElem(this, elem); }
	private updateSelectionClasses() { commitsUpdateSelectionClasses(this); }
	private selectCommit(hash: string, index: number) { commitsSelectCommit(this, hash, index); }
	private toggleCommitSelection(hash: string, index: number) { commitsToggleCommitSelection(this, hash, index); }
	private rangeSelectCommits(toIndex: number) { commitsRangeSelectCommits(this, toIndex); }
	public getCommits(): ReadonlyArray<GG.GitCommit> { return commitsGetCommits(this); }
	private getPushRemote(branch: string | null = null) { return commitsGetPushRemote(this, branch); }
	public getRepoConfig(): Readonly<GG.GitRepoConfig> | null { return commitsGetRepoConfig(this); }
	public getRepoState(repo: string): Readonly<GG.GitRepoState> | null { return commitsGetRepoState(this, repo); }
	public isConfigLoading(): boolean { return commitsIsConfigLoading(this); }


	/* Refresh */

	public refresh(hard: boolean, configChanges: boolean = false) { commitsRefresh(this, hard, configChanges); }


	/* Requests */

	private requestLoadRepoInfo() { commitsRequestLoadRepoInfo(this); }
	private requestLoadCommits() { commitsRequestLoadCommits(this); }
	private requestLoadRepoInfoAndCommits(hard: boolean, skipRepoInfo: boolean, configChanges: boolean = false) { commitsRequestLoadRepoInfoAndCommits(this, hard, skipRepoInfo, configChanges); }
	public requestLoadConfig() { commitsRequestLoadConfig(this); }
	public requestCommitDetails(hash: string, refresh: boolean) { commitsRequestCommitDetails(this, hash, refresh); }
	public requestCommitComparison(hash: string, compareWithHash: string, refresh: boolean) { commitsRequestCommitComparison(this, hash, compareWithHash, refresh); }
	private requestAvatars(avatars: { [email: string]: string[] }) { commitsRequestAvatars(this, avatars); }


	/* State */

	public saveState() { commitsSaveState(this); }
	public saveRepoState() { commitsSaveRepoState(this); }
	private saveColumnWidths(columnWidths: GG.ColumnWidth[]) { commitsSaveColumnWidths(this, columnWidths); }
	private saveExpandedCommitLoading(index: number, commitHash: string, commitElem: HTMLElement, compareWithHash: string | null, compareWithElem: HTMLElement | null) { commitsSaveExpandedCommitLoading(this, index, commitHash, commitElem, compareWithHash, compareWithElem); }
	public saveRepoStateValue<K extends keyof GG.GitRepoState>(repo: string, key: K, value: GG.GitRepoState[K]) { commitsSaveRepoStateValue(this, repo, key, value); }


	/* Renderers */

	private render() { commitsRender(this); }
	private renderGraph() { commitsRenderGraph(this); }
	private getRemoteDefaultCloudHtml(title: string) { return commitsGetRemoteDefaultCloudHtml(this, title); }
	private getHeadRemoteSuffixHtml(remoteName: string, remoteRefName: string, isRemoteDefault: boolean, isGoneUpstream: boolean) { return commitsGetHeadRemoteSuffixHtml(this, remoteName, remoteRefName, isRemoteDefault, isGoneUpstream); }
	private renderRefBadgeGroup(badges: CommitRefBadge[]) { return commitsRenderRefBadgeGroup(this, badges); }
	private getElemOuterWidth(elem: HTMLElement) { return commitsGetElemOuterWidth(this, elem); }
	private getBadgesTotalWidth(badges: ReadonlyArray<HTMLElement>) { return commitsGetBadgesTotalWidth(this, badges); }
	private getAvailableRefBadgeWidth(commitElem: HTMLElement) { return commitsGetAvailableRefBadgeWidth(this, commitElem); }
	private collapseReferenceBadgesToFit() { commitsCollapseReferenceBadgesToFit(this); }
	private renderTable() { commitsRenderTable(this); }
	private renderUncommittedChanges() { commitsRenderUncommittedChanges(this); }

	private getRepoInProgressStateLabel() { return commitsGetRepoInProgressStateLabel(this); }
	private getRepoInProgressStateStatusVerb() { return commitsGetRepoInProgressStateStatusVerb(this); }
	private formatRepoInProgressWorkingTreeStatus() { return commitsFormatRepoInProgressWorkingTreeStatus(this); }
	private updateRepoInProgressBannerOffset() { commitsUpdateRepoInProgressBannerOffset(this); }
	private renderRepoInProgressBanner() { commitsRenderRepoInProgressBanner(this); }
	public getRepoInProgressActionTitle(action: GG.GitRepoInProgressAction) { return commitsGetRepoInProgressActionTitle(this, action); }
	private executeRepoInProgressAction(action: GG.GitRepoInProgressAction) { commitsExecuteRepoInProgressAction(this, action); }

	private renderFetchButton() { commitsRenderFetchButton(this); }
	private renderTopFullDiffButton() { commitsRenderTopFullDiffButton(this); }
	public renderRefreshButton() {
		// Refresh now lives in the Settings context menu.
		// Keep this method so existing refresh call sites stay unchanged.
	}
	public renderTagDetails(tagName: string, commitHash: string, details: GG.GitTagDetails) { commitsRenderTagDetails(this, tagName, commitHash, details); }

	public renderRepoDropdownOptions(repo?: string) {
		this.repoDropdown.setOptions(getRepoDropdownOptions(this.gitRepos), [repo || this.currentRepo]);
	}

	/* Sidebar Context Menus */

	private async openSidebarContextMenu(type: 'branch' | 'tag' | 'remote' | 'remoteSection' | 'localSection', name: string, event: MouseEvent) { return commitsOpenSidebarContextMenu(this, type, name, event); }
	private async getSidebarContextMenuActions(type: 'branch' | 'tag' | 'remote' | 'remoteSection' | 'localSection', name: string): Promise<ContextMenuActions> { return commitsGetSidebarContextMenuActions(this, type, name); }
	private appendSidebarRevealAction(actions: ContextMenuActions, refName: string): ContextMenuActions { return commitsAppendSidebarRevealAction(this, actions, refName); }
	private createSidebarRefTarget(refName: string, hash: string = ''): DialogTarget & RefTarget { return commitsCreateSidebarRefTarget(this, refName, hash); }
	private resolveSidebarBranch(value: string): SidebarResolvedRef | null { return commitsResolveSidebarBranch(this, value); }
	private async resolveSidebarSelection(selection: ReadonlyArray<BranchPanelActionSelectionItem>): Promise<ReadonlyArray<SidebarResolvedRef>> { return commitsResolveSidebarSelection(this, selection); }
	private getSidebarBatchContextMenuActions(selection: ReadonlyArray<SidebarResolvedRef>): ContextMenuActions { return commitsGetSidebarBatchContextMenuActions(this, selection); }
	private getSidebarBatchRequestRefs(selection: ReadonlyArray<SidebarResolvedRef>): GG.SidebarBatchRefActionTarget[] { return commitsGetSidebarBatchRequestRefs(this, selection); }
	private async resolveSidebarTagContext(tagName: string): Promise<{ hash: string; annotated: boolean } | null> { return commitsResolveSidebarTagContext(this, tagName); }
	public processResolveSidebarTagContext(msg: GG.ResponseResolveSidebarTagContext) { commitsProcessResolveSidebarTagContext(this, msg); }


	/* Context Menu Generation */

	private getBranchContextMenuActions(target: DialogTarget & RefTarget): ContextMenuActions { return commitsGetBranchContextMenuActions(this, target); }
	private getCommitContextMenuActions(target: DialogTarget & CommitTarget): ContextMenuActions { return commitsGetCommitContextMenuActions(this, target); }
	private getMultiSelectContextMenuActions(target: DialogTarget & CommitTarget): ContextMenuActions { return commitsGetMultiSelectContextMenuActions(this, target); }
	private getRemoteBranchContextMenuActions(remote: string, target: DialogTarget & RefTarget): ContextMenuActions { return commitsGetRemoteBranchContextMenuActions(this, remote, target); }
	private getStashContextMenuActions(target: DialogTarget & RefTarget): ContextMenuActions { return commitsGetStashContextMenuActions(this, target); }
	private getTagContextMenuActions(isAnnotated: boolean, target: DialogTarget & RefTarget): ContextMenuActions { return commitsGetTagContextMenuActions(this, isAnnotated, target); }
	private getUncommittedChangesContextMenuActions(target: DialogTarget & CommitTarget): ContextMenuActions { return commitsGetUncommittedChangesContextMenuActions(this, target); }
	private getViewIssueAction(refName: string, visible: boolean, target: DialogTarget & RefTarget): ContextMenuAction { return commitsGetViewIssueAction(this, refName, visible, target); }


	/* Actions */

	private getCleanupLocalBranches() { return commitsGetCleanupLocalBranches(this); }
	private addRemoteAction() { commitsAddRemoteAction(this); }
	private addTagAction(hash: string, initialName: string, initialType: GG.TagType, initialMessage: string, initialPushToRemote: string | null, target: DialogTarget & CommitTarget, isInitialLoad: boolean = true) { commitsAddTagAction(this, hash, initialName, initialType, initialMessage, initialPushToRemote, target, isInitialLoad); }
	private checkoutBranchAction(refName: string, remote: string | null, prefillName: string | null, target: DialogTarget | null) { commitsCheckoutBranchAction(this, refName, remote, prefillName, target); }
	private createBranchAction(hash: string, initialName: string, initialCheckOut: boolean, target: DialogTarget & CommitTarget) { commitsCreateBranchAction(this, hash, initialName, initialCheckOut, target); }
	private deleteTagAction(refName: string, deleteOnRemote: string | null) { commitsDeleteTagAction(this, refName, deleteOnRemote); }
	private cleanupLocalBranchesAction() { commitsCleanupLocalBranchesAction(this); }
	private deleteRemoteAction(name: string) { commitsDeleteRemoteAction(this, name); }
	private fetchFromRemotesAction() { commitsFetchFromRemotesAction(this); }
	private mergeAction(obj: string, name: string, actionOn: GG.MergeActionOn, target: DialogTarget & (CommitTarget | RefTarget)) { commitsMergeAction(this, obj, name, actionOn, target); }
	private rebaseAction(obj: string, name: string, actionOn: GG.RebaseActionOn, target: DialogTarget & (CommitTarget | RefTarget)) { commitsRebaseAction(this, obj, name, actionOn, target); }
	private resetCurrentBranchToCommitAction(hash: string, target: DialogTarget & CommitTarget) { commitsResetCurrentBranchToCommitAction(this, hash, target); }

	/* Drag and Drop */

	private getDraggedRef(eventTarget: Element): DraggedRef | null { return commitsGetDraggedRef(this, eventTarget); }
	private getDraggedRefFromEvent(e: DragEvent): DraggedRef | null { return commitsGetDraggedRefFromEvent(this, e); }
	private setCommitDropTarget(commitElem: HTMLElement) { commitsSetCommitDropTarget(this, commitElem); }
	private clearCommitDropTarget() { commitsClearCommitDropTarget(this); }
	private inferTagType(tagName: string): GG.TagType { return commitsInferTagType(this, tagName); }
	private getDroppedRefContextMenuActions(ref: DraggedRef, target: DialogTarget & CommitTarget): ContextMenuActions { return commitsGetDroppedRefContextMenuActions(this, ref, target); }


	/* Table Utils */

	private makeTableResizable() { commitsMakeTableResizable(this); }

	public getColumnVisibility() {
		return this.config.commitsColumnVisibility;
	}

	private getNumColumns() { return commitsGetNumColumns(this); }
	public scrollToCommit(hash: string, alwaysCenterCommit: boolean, flash: boolean = false) { commitsScrollToCommit(this, hash, alwaysCenterCommit, flash); }
	private scrollToStash(next: boolean) { commitsScrollToStash(this, next); }
	private findRenderedRefElem(refName: string) { return commitsFindRenderedRefElem(this, refName); }
	private revealReference(refName: string) { commitsRevealReference(this, refName); }
	private loadMoreCommits() { commitsLoadMoreCommits(this); }

	/* Observers */

	private observeWindowSizeChanges() { commitsObserveWindowSizeChanges(this); }
	private observeWebviewStyleChanges() { commitsObserveWebviewStyleChanges(this); }
	private observeViewScroll() { commitsObserveViewScroll(this); }
	private observeKeyboardEvents() { commitsObserveKeyboardEvents(this); }
	private observeUrls() { commitsObserveUrls(this); }
	private observeTableEvents() { commitsObserveTableEvents(this); }

	/* Pull/Push Actions */

	private getCurrentPullRemote() { return commitsGetCurrentPullRemote(this); }
	private runPullCurrentBranchAction(remote: string, createNewCommit: boolean, squash: boolean) { commitsRunPullCurrentBranchAction(this, remote, createNewCommit, squash); }
	private pullCurrentBranchAction() { commitsPullCurrentBranchAction(this); }
	private showPullCurrentBranchDialog() { commitsShowPullCurrentBranchDialog(this); }
	private getDefaultPushRemotes(branchName: string) { return commitsGetDefaultPushRemotes(this, branchName); }
	private shouldSetUpstreamForPush(branchName: string) { return commitsShouldSetUpstreamForPush(this, branchName); }
	private willPushUpdateBranchConfig(branchName: string, remotes: string[], setUpstream: boolean) { return commitsWillPushUpdateBranchConfig(this, branchName, remotes, setUpstream); }
	private runPushCurrentBranchAction(branchName: string, remotes: string[], setUpstream: boolean, mode: GG.GitPushBranchMode) { commitsRunPushCurrentBranchAction(this, branchName, remotes, setUpstream, mode); }
	private pushCurrentBranchAction() { commitsPushCurrentBranchAction(this); }
	private forcePushCurrentBranchAction() { commitsForcePushCurrentBranchAction(this); }
	private showPushCurrentBranchDialog(defaultMode: GG.GitPushBranchMode = GG.GitPushBranchMode.Normal) { commitsShowPushCurrentBranchDialog(this, defaultMode); }
	private showPushButtonContextMenu(event: MouseEvent) { commitsShowPushButtonContextMenu(this, event); }
	private showPullButtonContextMenu(event: MouseEvent) { commitsShowPullButtonContextMenu(this, event); }
	private showSettingsButtonContextMenu(event: MouseEvent) { commitsShowSettingsButtonContextMenu(this, event); }

	private showOverflowActions(event: MouseEvent) {
		commitsShowOverflowActions(this, event);
	}

	private updateControlsLayout() {
		void this.controlsLeftElem;
		void this.controlsBtnsElem;
		commitsUpdateControlsLayout(this);
	}

	public requestControlsLayoutUpdate() {
		this.updateControlsLayout();
	}

	private showFindWidgetFromToggle() {
		const pinnedOpen = this.compactFindWidgetPinnedOpen;
		this.compactFindWidgetPinnedOpen = pinnedOpen;
		commitsShowFindWidgetFromToggle(this);
	}

	private updateCompactFindWidgetState() {
		void this.compactFindWidgetPinnedOpen;
		commitsUpdateCompactFindWidgetState(this);
	}


	/* Commit Details View */

	public loadCommitDetails(commitElem: HTMLElement) { commitsLoadCommitDetails(this, commitElem); }
	public previewCommitFiles(commitHash: string) {
		if (this.filesPanelCommitHash === commitHash) return;
		if (this.expandedCommit !== null && this.expandedCommit.commitHash === commitHash) return;
		this.previewCommitHash = commitHash;
		this.filesPanelCommitHash = null;
		this.filesPanelFileChanges = null;
		this.filesPanelFileTree = null;
		this.filesPanelCompareWithHash = null;
		this.filesPanelCodeReview = null;
		if (this.expandedCommit === null) {
			this.resetDiffState();
			this.previewCompareHashes = null;
		}
		this.filesPanel.setContentLoading();
		this.requestCommitDetails(commitHash, false);
	}
	public previewCommitComparison(hash1: string, hash2: string) { commitsPreviewCommitComparison(this, hash1, hash2); }
	public applyComparisonPreviewResponse(commitHash: string, compareWithHash: string, fileChanges: ReadonlyArray<GG.GitFileChange>, fileTree: FileTreeFolder, codeReview: GG.CodeReview | null) { commitsApplyComparisonPreviewResponse(this, commitHash, compareWithHash, fileChanges, fileTree, codeReview); }
	public updateSelectionPreview() { commitsUpdateSelectionPreview(this); }
	public applyPreviewResponse(commitDetails: GG.GitCommitDetails, fileTree: FileTreeFolder, codeReview: GG.CodeReview | null) {
		if (this.previewCommitHash !== commitDetails.hash) return;
		this.previewCommitHash = null;
		if (this.expandedCommit === null || this.expandedCommit.commitHash !== commitDetails.hash) {
			this.filesPanel.update(fileTree, commitDetails.fileChanges, codeReview !== null ? codeReview.lastViewedFile : null, -1, commitsGetFileViewType(this), false);
			this.filesPanelCommitHash = commitDetails.hash;
			this.filesPanelCompareWithHash = null;
			this.filesPanelFileChanges = commitDetails.fileChanges;
			this.filesPanelFileTree = fileTree;
			this.filesPanelCodeReview = codeReview;
			commitsPopulateFilesPanelHeaderForPreview(this, commitDetails);
		}
	}
	public closeCommitDetails(saveAndRender: boolean) { commitsCloseCommitDetails(this, saveAndRender); }
	public showCommitDetails(commitDetails: GG.GitCommitDetails, fileTree: FileTreeFolder, avatar: string | null, codeReview: GG.CodeReview | null, lastViewedFile: string | null, refresh: boolean) { commitsShowCommitDetails(this, commitDetails, fileTree, avatar, codeReview, lastViewedFile, refresh); }
	public createFileTree(gitFiles: ReadonlyArray<GG.GitFileChange>, codeReview: GG.CodeReview | null) { return commitsCreateFileTree(this, gitFiles, codeReview); }
	private loadCommitComparison(commitElem: HTMLElement, compareWithElem: HTMLElement) { commitsLoadCommitComparison(this, commitElem, compareWithElem); }
	public closeCommitComparison(saveAndRequestCommitDetails: boolean) { commitsCloseCommitComparison(this, saveAndRequestCommitDetails); }
	public showCommitComparison(commitHash: string, compareWithHash: string, fileChanges: ReadonlyArray<GG.GitFileChange>, fileTree: FileTreeFolder, codeReview: GG.CodeReview | null, lastViewedFile: string | null, refresh: boolean) { commitsShowCommitComparison(this, commitHash, compareWithHash, fileChanges, fileTree, codeReview, lastViewedFile, refresh); }
	private renderCommitDetailsView(refresh: boolean) { commitsRenderCommitDetailsView(this, refresh); }
	private setCdvHeight(elem: HTMLElement, isDocked: boolean) { commitsSetCdvHeight(this, elem, isDocked); }
	public isCdvOpen(commitHash: string, compareWithHash: string | null) { return commitsIsCdvOpen(this, commitHash, compareWithHash); }
	private getCommitOrder(hash1: string, hash2: string) { return commitsGetCommitOrder(this, hash1, hash2); }
	private getFileViewType() { return commitsGetFileViewType(this); }
	private setFileViewType(type: GG.FileViewType) { commitsSetFileViewType(this, type); }
	private changeFileViewType(type: GG.FileViewType) { commitsChangeFileViewType(this, type); }

	/* CDV Resizable */

	private setCdvDivider() { commitsSetCdvDivider(this); }
	private makeCdvResizable() { commitsMakeCdvResizable(this); }
	private makeCdvDividerDraggable() { commitsMakeCdvDividerDraggable(this); }

	public renderFullDiffContent(data: { diff: string | null; oldContent: string | null; newContent: string | null; oldExists: boolean; newExists: boolean } | null) { commitsRenderFullDiffContent(this, data); }
	public getDisplayLines(content: string | null): string[] { return commitsGetDisplayLines(content); }
	public parseUnifiedDiffHunks(diff: string): { oldStart: number; newStart: number; lines: string[] }[] { return commitsParseUnifiedDiffHunks(diff); }
	public buildFullUnifiedFileView(oldLines: string[], newLines: string[], hunks: { oldStart: number; newStart: number; lines: string[] }[]): string { return commitsBuildFullUnifiedFileView(this, oldLines, newLines, hunks); }
	public compactFullDiffUnifiedRows<T extends { changed: boolean }>(rows: T[]): (T | { spacer: string })[] { return commitsCompactFullDiffUnifiedRows(this, rows); }
	public buildFullSideBySideFileView(oldLines: string[], newLines: string[], hunks: { oldStart: number; newStart: number; lines: string[] }[]): string { return commitsBuildFullSideBySideFileView(this, oldLines, newLines, hunks); }

	private toggleFullDiffMode(on: boolean) { commitsToggleFullDiffMode(this, on); }
	private createFullDiffPanel() { commitsCreateFullDiffPanel(this); }
	public renderFullDiffCompactBtn() { commitsRenderFullDiffCompactBtn(this); }
	public renderFullDiffViewBtns() { commitsRenderFullDiffViewBtns(this); }
	public changeFullDiffViewMode(mode: 'unified' | 'sideBySide') { commitsChangeFullDiffViewMode(this, mode); }
	private destroyFullDiffPanel() { commitsDestroyFullDiffPanel(this); }
	public resetDiffState() { commitsResetDiffState(this); }
	public setFullDiffPanelHeight(height: number) { commitsSetFullDiffPanelHeight(this, height); }
	private updateLayoutBottoms() { commitsUpdateLayoutBottoms(this); }
	public makeFullDiffPanelResizable() { commitsMakeFullDiffPanelResizable(this); }
	public attachFullDiffHunkNav() { commitsAttachFullDiffHunkNav(this); }

	/* CDV File View */

	private makeCdvFileViewInteractive() { commitsMakeCdvFileViewInteractive(this); }
	private renderCdvFileViewTypeBtns() { commitsRenderCdvFileViewTypeBtns(this); }
	private renderCdvExternalDiffBtn() { commitsRenderCdvExternalDiffBtn(this); }
	private cdvUpdateFileState(file: GG.GitFileChange, fileElem: HTMLElement, isReviewed: boolean | null, fileWasViewed: boolean) { commitsCdvUpdateFileState(this, file, fileElem, isReviewed, fileWasViewed); }

	private isCdvDocked() {
		return this.config.commitDetailsView.location === GG.CommitDetailsViewLocation.DockedToBottom;
	}

	/* Code Review */

	public startCodeReview(commitHash: string, compareWithHash: string | null, codeReview: GG.CodeReview) { commitsStartCodeReview(this, commitHash, compareWithHash, codeReview); }
	public endCodeReview() { commitsEndCodeReview(this); }
	private saveAndRenderCodeReview(codeReview: GG.CodeReview | null) { commitsSaveAndRenderCodeReview(this, codeReview); }
	private renderCodeReviewBtn() { commitsRenderCodeReviewBtn(this); }
}


/* Main */

const contextMenu = new ContextMenu(), dialog = new Dialog(), eventOverlay = new EventOverlay();
let loaded = false, commits: CommitsView, imageResizer: ImageResizer;

function bootstrap() {
	if (loaded) return;
	loaded = true;

	TextFormatter.registerCustomEmojiMappings(initialState.config.customEmojiShortcodeMappings);

	const viewElem = document.getElementById('view');
	if (viewElem === null) return;

	commits = new CommitsView(viewElem, VSCODE_API.getState() || null);
	imageResizer = new ImageResizer();

	commitsRegisterMessageHandler(commits);
}

if (document.readyState === 'loading') {
	window.addEventListener('DOMContentLoaded', bootstrap, { once: true });
	window.addEventListener('load', bootstrap, { once: true });
} else {
	bootstrap();
}
