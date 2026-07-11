/**
 * Sidebar (Activity Bar) webview entry point - live as of this increment.
 * src/views/sidebar/sidebarView.ts's renderHtml() produces the static shell this class renders into:
 * #activityRepoRow contains #activityRepo (the "No Git repository" fallback, its text baked in
 * server-side since it's static) and an empty #activityRepoDropdown div (class="dropdown", for
 * Dropdown to mount into) as siblings, plus #activityOpenCommits. Both #activityRepo and
 * #activityRepoDropdown always exist; only one is ever visible, toggled via style.display -
 * Dropdown has no teardown/recreate story (it's a page-lifetime singleton, same as the tab's own
 * repo dropdown), so it's constructed once and simply given an empty option list rather than
 * being destroyed for the (rare) zero-repositories case. #activityActionsRow (Refresh, Reset,
 * Fetch, Pull, Push, Force Push) is likewise always present, visibility toggled on whether a
 * repository is selected. #activityContent is an empty container this class renders into.
 * #activityFooter contains the static (data-independent) commit UI: #cpMessage,
 * #cpCommitBtn/#cpCommitArrow/#cpCommitMenu/#cpAmendBtn - all pre-rendered by the shell rather
 * than by this class, since none of it depends on the changes/error/repo state. #activityGraph
 * (data-more attribute reflects whether more commits are available to page in) and
 * #activityGraphResizeHandle are a pair, both empty/static, visibility toggled together based on
 * whether there's a mini graph to show.
 */

const SIDEBAR_VSCODE_API = acquireVsCodeApi<GG.SidebarRequestMessage, never>();

/**
 * Send a message to the extension's back-end.
 * @param msg The fully-constructed request - see src/types/sidebar-protocol.ts.
 */
function sidebarSendMessage(msg: GG.SidebarRequestMessage) {
	SIDEBAR_VSCODE_API.postMessage(msg);
}

/**
 * The last path segment of a repository or file path, tolerating either separator. Backend
 * repo paths come from Node's fsPath (backslashes on Windows); this runs in the browser, so it
 * can't use Node's path.basename the way the current (pre-port) backend rendering does. Git
 * itself always emits forward-slash paths for file changes regardless of OS, but the
 * pre-port backend normalizes defensively before splitting (views/sidebar/gitUtils.ts's
 * normalizePath) - matched here rather than assuming that guarantee holds everywhere.
 * @param path The repository or file path.
 * @returns The path's last segment.
 */
function sidebarBasename(path: string): string {
	const normalized = path.replace(/\\/g, '/');
	const trimmed = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
	const lastSlash = trimmed.lastIndexOf('/');
	return lastSlash === -1 ? trimmed : trimmed.slice(lastSlash + 1);
}

/**
 * Owns the sidebar's client-side state and rendering. Filled in across the increments that
 * port the sidebar from server-rendered HTML to client-side rendering: repo selector and
 * action row (this increment), the working-tree changes tree, and the mini graph.
 */
class SidebarView {
	private repo: string | null;
	private repoPaths: ReadonlyArray<string>;
	private starredRepos: ReadonlyArray<string>;
	private changes: ReadonlyArray<GG.GitWorkingTreeChangeMsg>;
	private error: GG.ErrorInfo;
	private graphHeight: number;
	private readonly enhancedAccessibility: boolean;
	private graph: GG.SidebarGraphState;
	private readonly graphConfig: GG.SidebarGraphConfig;
	private graphLoading: boolean = false;

	private readonly repoDropdown: Dropdown;

	constructor(state: GG.SidebarInitialState) {
		this.repo = state.repo;
		this.repoPaths = state.repoPaths;
		this.starredRepos = state.starredRepos;
		this.changes = state.changes;
		this.error = state.error;
		this.graphHeight = state.graphHeight;
		this.enhancedAccessibility = state.enhancedAccessibility;
		this.graph = state.graph;
		this.graphConfig = state.graphConfig;

		this.repoDropdown = new Dropdown('activityRepoDropdown', true, false, 'Repos', (values) => {
			this.selectRepo(values[0]);
		}, (repoPath) => {
			this.toggleRepoStarred(repoPath);
		});

		this.renderRepoSelector();
		this.updateActionsRowVisibility();
		this.wireStaticButtons();

		this.renderChangesTree();
		this.wireChangesTreeInteractions();
		this.wireCommitFooter();

		this.renderMiniGraph();
		this.wireGraphInteractions();
		this.wireGraphResizeHandle();
	}

	/**
	 * Renders #activityContent from the current changes/error state, preserving scroll position
	 * across in-place updates (ported from script.ts's scrollTop save + requestAnimationFrame
	 * restore around its innerHTML replacement) - harmless no-op at construction time, when
	 * there's no prior scroll position to preserve.
	 */
	private renderChangesTree() {
		const contentElem = document.getElementById('activityContent');
		if (contentElem !== null) {
			const scrollTop = contentElem.scrollTop;
			contentElem.innerHTML = sidebarRenderContentHtml(this.changes, this.error, this.enhancedAccessibility);
			requestAnimationFrame(() => { contentElem.scrollTop = scrollTop; });
		}
		this.updateCommitButtonState();
	}

	/**
	 * Delegated click handler for the changes tree: section collapse/expand, folder
	 * collapse/expand, per-file stage/unstage/discard buttons, and clicking a file row to view its
	 * diff (or, for an untracked file, open it directly - handled server-side by viewDiff's own
	 * GitFileStatus.Untracked fallback). Ported from script.ts's single root-level click listener.
	 */
	private wireChangesTreeInteractions() {
		const root = document.body;
		root.addEventListener('click', (e) => {
			const target = e.target as HTMLElement | null;
			if (target === null) return;

			const sectionHeader = target.closest<HTMLElement>('.cpSectionHeader');
			if (sectionHeader !== null && target.closest('.cpFileBtn') === null) {
				const section = sectionHeader.closest('.cpSection');
				section?.classList.toggle('cpCollapsed');
				const arrow = sectionHeader.querySelector('.cpSectionArrow .codicon');
				if (arrow !== null) {
					const closed = section?.classList.contains('cpCollapsed') ?? false;
					arrow.classList.toggle('codicon-folder', closed);
					arrow.classList.toggle('codicon-folder-opened', !closed);
				}
				return;
			}

			const folderElem = target.closest<HTMLElement>('.cpTreeFolder');
			if (folderElem !== null) {
				const parent = folderElem.parentElement;
				const childList = parent?.querySelector(':scope > .fileTreeFolderContents');
				const icon = folderElem.querySelector('.fileTreeFolderIcon .codicon');
				const closed = !childList?.classList.contains('hidden');
				childList?.classList.toggle('hidden', closed);
				icon?.classList.toggle('codicon-folder', closed);
				icon?.classList.toggle('codicon-folder-opened', !closed);
				return;
			}

			const fileButton = target.closest<HTMLElement>('.cpFileBtn');
			if (fileButton !== null) {
				e.stopPropagation();
				this.handleFileButtonClick(fileButton);
				return;
			}

			const fileRow = target.closest<HTMLElement>('.cpFile');
			if (fileRow !== null && fileRow.dataset.path) {
				sidebarSendMessage({ command: 'openChanges', filePath: fileRow.dataset.path });
			}
		});
	}

	/**
	 * Maps a .cpFileBtn's data-action (set by changesTree.ts's renderFileRow/renderSection) to
	 * its properly-typed request - data-action is a plain string read off the DOM, so it can't
	 * narrow SidebarRequestMessage's discriminant the way a literal at the call site would.
	 */
	private handleFileButtonClick(fileButton: HTMLElement) {
		const path = fileButton.dataset.path;
		switch (fileButton.dataset.action) {
			case 'stage':
				if (path) sidebarSendMessage({ command: 'stage', filePath: path });
				return;
			case 'unstage':
				if (path) sidebarSendMessage({ command: 'unstage', filePath: path });
				return;
			case 'stageAll':
				sidebarSendMessage({ command: 'stageAll' });
				return;
			case 'unstageAll':
				sidebarSendMessage({ command: 'unstageAll' });
				return;
			case 'discard':
				// eslint-disable-next-line no-alert -- deliberate: native confirm() over a custom dialog for this one action (ADR-002); pre-existing behavior, only now visible to lint since it moved out of a template-string script.ts.
				if (path && confirm('Discard changes in ' + path + '?')) {
					sidebarSendMessage({ command: 'discard', filePath: path, isUntracked: fileButton.dataset.untracked === 'true' });
				}
				return;
		}
	}

	/** Wires the commit message textarea, commit button, amend menu, and their enabled/disabled state. */
	private wireCommitFooter() {
		const message = document.getElementById('cpMessage') as HTMLTextAreaElement | null;
		const commitBtn = document.getElementById('cpCommitBtn') as HTMLButtonElement | null;
		const commitArrow = document.getElementById('cpCommitArrow') as HTMLButtonElement | null;
		const commitMenu = document.getElementById('cpCommitMenu');

		message?.addEventListener('input', () => this.updateCommitButtonState());
		message?.addEventListener('keydown', (e) => {
			if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && commitBtn && !commitBtn.disabled) {
				sidebarSendMessage({ command: 'commit', message: message.value, amend: false });
			}
		});
		commitBtn?.addEventListener('click', () => sidebarSendMessage({ command: 'commit', message: message ? message.value : '', amend: false }));
		commitArrow?.addEventListener('click', (e) => { e.stopPropagation(); commitMenu?.classList.toggle('hidden'); });
		document.getElementById('cpAmendBtn')?.addEventListener('click', () => sidebarSendMessage({ command: 'commit', message: message ? message.value : '', amend: true }));
		document.addEventListener('click', () => commitMenu?.classList.add('hidden'));
	}

	/** Enables/disables the commit button and its options-menu arrow based on staged/unstaged state and message text. */
	private updateCommitButtonState() {
		const message = document.getElementById('cpMessage') as HTMLTextAreaElement | null;
		const commitBtn = document.getElementById('cpCommitBtn') as HTMLButtonElement | null;
		const commitArrow = document.getElementById('cpCommitArrow') as HTMLButtonElement | null;
		const hasChanges = this.error === null && this.changes.length > 0;
		const hasMessage = !!(message && message.value.trim());
		const enabled = hasChanges && hasMessage;
		if (commitBtn) commitBtn.disabled = !enabled && !hasChanges;
		if (commitArrow) commitArrow.disabled = !hasChanges;
	}

	/**
	 * Shows the repo Dropdown (populated from the current repo list) or the "No Git repository"
	 * fallback - exactly one of the two, matching the pre-port server-rendered behavior.
	 */
	private renderRepoSelector() {
		const hasRepos = this.repoPaths.length > 0;
		const noRepoElem = document.getElementById('activityRepo');
		const dropdownElem = document.getElementById('activityRepoDropdown');
		if (noRepoElem !== null) noRepoElem.style.display = hasRepos ? 'none' : '';
		if (dropdownElem !== null) dropdownElem.style.display = hasRepos ? '' : 'none';
		if (hasRepos) {
			// Starred repos are shown first, preserving the existing (native VS Code Git API) order
			// within each group - Array.prototype.sort is stable, so this is a safe partition.
			const sortedPaths = this.repoPaths.slice().sort((a, b) => (this.starredRepos.includes(b) ? 1 : 0) - (this.starredRepos.includes(a) ? 1 : 0));
			const options: DropdownOption[] = sortedPaths.map((repoPath) => ({ name: sidebarBasename(repoPath), value: repoPath, isStarred: this.starredRepos.includes(repoPath) }));
			this.repoDropdown.setOptions(options, this.repo !== null ? [this.repo] : []);
		}
	}

	/** Toggles whether a repo is starred - broadcast to the tab's own repo dropdown too, see ADR-005. */
	private toggleRepoStarred(repoPath: string) {
		sidebarSendMessage({ command: 'setRepoStarred', filePath: repoPath, starred: !this.starredRepos.includes(repoPath) });
	}

	/** Shows #activityActionsRow only once a repository is selected, matching the pre-port behavior. */
	private updateActionsRowVisibility() {
		const actionsRow = document.getElementById('activityActionsRow');
		if (actionsRow !== null) actionsRow.style.display = this.repo !== null ? '' : 'none';
	}

	private selectRepo(repoPath: string) {
		sidebarSendMessage({ command: 'selectRepo', filePath: repoPath });
	}

	/** Wires the buttons whose behavior never depends on the currently loaded data: Open Commits and the action row. */
	private wireStaticButtons() {
		document.getElementById('activityOpenCommits')?.addEventListener('click', () => sidebarSendMessage({ command: 'openCommits' }));
		document.getElementById('activityRefresh')?.addEventListener('click', () => sidebarSendMessage({ command: 'refresh' }));
		document.getElementById('activityReset')?.addEventListener('click', () => sidebarSendMessage({ command: 'gitReset' }));
		document.getElementById('activityFetch')?.addEventListener('click', () => sidebarSendMessage({ command: 'gitFetch' }));
		document.getElementById('activityPull')?.addEventListener('click', () => sidebarSendMessage({ command: 'gitPull' }));
		document.getElementById('activityPush')?.addEventListener('click', () => sidebarSendMessage({ command: 'gitPush' }));
		document.getElementById('activityForcePush')?.addEventListener('click', () => sidebarSendMessage({ command: 'gitForcePush' }));
	}

	/**
	 * Renders (or hides) #activityGraph and #activityGraphResizeHandle from the current graph
	 * load state. Hidden only when no repo is selected - there's nothing meaningful to show then.
	 * Otherwise the container always stays visible at its resizable height, showing a spinner
	 * while loading, an error message if the fetch failed, a muted note when there's genuinely
	 * nothing to draw (no branch checked out, or zero commits), or the graph itself once ready -
	 * see SidebarGraphState. Preserves scroll position across in-place updates in the ready-with-
	 * data case (same technique as renderChangesTree - script.ts additionally replaced just the
	 * #miniGraph child rather than all of #activityGraph's innerHTML, but since #miniGraph is
	 * #activityGraph's only content either way, both produce the same DOM; the scrollTop
	 * save/restore is what actually matters for scroll continuity, and both approaches need it).
	 */
	private renderMiniGraph() {
		document.body.style.setProperty('--activity-graph-height', this.graphHeight + 'px');

		const graphElem = document.getElementById('activityGraph');
		const handleElem = document.getElementById('activityGraphResizeHandle');
		const visible = this.repo !== null;

		if (graphElem !== null) graphElem.style.display = visible ? '' : 'none';
		if (handleElem !== null) handleElem.style.display = visible ? '' : 'none';
		if (graphElem === null || !visible) return;

		const graph = this.graph;
		if (graph.status === 'ready' && graph.data !== null && graph.data.commits.length > 0) {
			const scrollTop = graphElem.scrollTop;
			graphElem.innerHTML = sidebarRenderMiniGraphInner(graph.data, this.graphConfig);
			graphElem.dataset.more = graph.data.moreAvailable ? 'true' : 'false';
			requestAnimationFrame(() => { graphElem.scrollTop = scrollTop; });
			return;
		}

		graphElem.dataset.more = 'false';
		if (graph.status === 'loading') {
			graphElem.innerHTML = `<div id="activityGraphMessage">${codicon('loading', 'codicon-modifier-spin')}<span>Loading...</span></div>`;
		} else if (graph.status === 'error') {
			graphElem.innerHTML = `<div id="activityGraphMessage" class="cpError">${escapeHtml(graph.message)}</div>`;
		} else {
			graphElem.innerHTML = `<div id="activityGraphMessage" class="cpPlaceholder">No commits yet</div>`;
		}
	}

	/** Click-to-open-commits on a mini graph row, and scroll-triggered pagination (loadMoreGraph). */
	private wireGraphInteractions() {
		const graphElem = document.getElementById('activityGraph');
		if (graphElem === null) return;

		graphElem.addEventListener('click', (e) => {
			const row = (e.target as HTMLElement).closest('.miniCommit');
			if (row) sidebarSendMessage({ command: 'openCommits' });
		});

		graphElem.addEventListener('scroll', () => {
			if (this.graphLoading || graphElem.dataset.more !== 'true') return;
			if (graphElem.scrollTop + graphElem.clientHeight >= graphElem.scrollHeight - 8) {
				this.graphLoading = true;
				sidebarSendMessage({ command: 'loadMoreGraph' });
			}
		});
	}

	/**
	 * Drag-to-resize the mini graph's height via #activityGraphResizeHandle. Computes the new
	 * height from the fixed mousedown-time reference point (startY/startHeight), same technique
	 * as commitDetailsView/resizable.ts's divider drag - not its accumulating-delta height drag,
	 * which is a different shape (see the increment 4 commit for why those two aren't shared).
	 */
	private wireGraphResizeHandle() {
		const handle = document.getElementById('activityGraphResizeHandle');
		const graphElem = document.getElementById('activityGraph');
		if (handle === null || graphElem === null) return;

		let startY = 0;
		let startHeight = 0;

		const onMove = (e: MouseEvent) => {
			const height = clamp(startHeight + (startY - e.clientY), 60, 400);
			document.body.style.setProperty('--activity-graph-height', height + 'px');
		};
		const onUp = () => {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
			handle.classList.remove('resizing');
			const height = parseInt(getComputedStyle(document.body).getPropertyValue('--activity-graph-height'), 10);
			if (!isNaN(height)) sidebarSendMessage({ command: 'setGraphHeight', height });
		};
		handle.addEventListener('mousedown', (e) => {
			e.preventDefault();
			startY = e.clientY;
			startHeight = graphElem.clientHeight;
			handle.classList.add('resizing');
			document.addEventListener('mousemove', onMove);
			document.addEventListener('mouseup', onUp);
		});
	}

	/**
	 * Applies a fresh data snapshot pushed from the back-end (the 'updateContent' message) and
	 * re-renders everything it affects. Doesn't touch graph state - the graph settles on its own
	 * schedule and arrives separately via 'updateGraph' (see SidebarView._refreshPanel) - but still
	 * re-renders the graph container, since its visibility depends on `repo` too (hidden when no
	 * repo is selected).
	 */
	public applyDataUpdate(data: GG.SidebarResponseUpdateContent) {
		this.repo = data.repo;
		this.repoPaths = data.repoPaths;
		this.starredRepos = data.starredRepos;
		this.changes = data.changes;
		this.error = data.error;

		this.renderRepoSelector();
		this.updateActionsRowVisibility();
		this.renderChangesTree();
		this.renderMiniGraph();
	}

	/** Applies the graph's current load state, pushed independently of 'updateContent' - both the initial post-shell fetch and 'loadMoreGraph' pagination arrive this way. */
	public applyGraphUpdate(graph: GG.SidebarGraphState) {
		this.graph = graph;
		this.graphLoading = false;
		this.renderMiniGraph();
	}
}

let sidebar: SidebarView;

/** Registers the handler for messages pushed from the back-end (src/views/sidebar/sidebarView.ts). */
function sidebarRegisterMessageHandler(view: SidebarView) {
	window.addEventListener('message', (event) => {
		const msg: GG.SidebarResponseMessage = event.data;
		if (!msg) return;
		switch (msg.command) {
			case 'updateContent':
				view.applyDataUpdate(msg);
				break;
			case 'updateGraph':
				view.applyGraphUpdate(msg.graph);
				break;
		}
	});
}

function sidebarBootstrap() {
	sidebar = new SidebarView(sidebarInitialState);
	sidebarRegisterMessageHandler(sidebar);
}

if (document.readyState === 'loading') {
	window.addEventListener('DOMContentLoaded', sidebarBootstrap, { once: true });
} else {
	sidebarBootstrap();
}
