/**
 * Implements the branch list panel shown as a left sidebar in the Commits View.
 * Provides the same public interface as a multi-select Dropdown for branch selection.
 */

interface BranchTreeFolder {
	type: 'folder';
	name: string;
	path: string;
	children: BranchTreeNode[];
}

interface BranchTreeLeaf {
	type: 'leaf';
	displayName: string;
	fullName: string;
	idx: number;
}

type BranchTreeNode = BranchTreeFolder | BranchTreeLeaf;
type BranchPanelEntryType = 'branch' | 'tag' | 'remote' | 'remoteSection' | 'localSection';
interface BranchPanelActionSelectionItem {
	type: 'branch' | 'tag';
	name: string;
}
const BRANCH_PANEL_OPEN_FOLDER_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1.75 3A1.75 1.75 0 0 1 3.5 1.25h2.08c.46 0 .9.18 1.23.51l.66.66c.1.1.24.16.38.16h4.65c.97 0 1.75.78 1.75 1.75v1.08H1.75V3Zm12.43 3.75H1.8l1.14 5.04c.09.4.44.68.85.68h8.42c.39 0 .73-.26.84-.64l1.13-5.08Z"/></svg>';
const BRANCH_PANEL_CLOSED_FOLDER_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1.75 3A1.75 1.75 0 0 1 3.5 1.25h2.08c.46 0 .9.18 1.23.51l.66.66c.1.1.24.16.38.16h4.65c.97 0 1.75.78 1.75 1.75v7.17c0 .97-.78 1.75-1.75 1.75h-9A1.75 1.75 0 0 1 1.75 12.5V3Z"/></svg>';

class BranchPanel {
	private readonly branchChangeCallback: (values: string[]) => void;
	private readonly tagChangeCallback: (values: string[]) => void;
	private readonly contextMenuCallback: (type: BranchPanelEntryType, name: string, event: MouseEvent) => void;
	private readonly doubleClickCallback: (type: 'branch' | 'tag', name: string) => void;
	private options: ReadonlyArray<DropdownOption> = [];
	private optionsSelected: boolean[] = [];
	private tagNames: ReadonlyArray<string> = [];
	private tagSelected: Set<number> = new Set();
	private pendingTagSelectionNames: Set<string> = new Set();
	private filterValue: string = '';
	public readonly flattenSingleChildGroups: boolean;
	public readonly groupsFirst: boolean;
	private localCollapsed: boolean = false;
	private remoteCollapsed: boolean = false;
	private tagsCollapsed: boolean = true;
	private folderCollapsed: { [path: string]: boolean } = {};
	private listScrollTop: number = 0;
	private sidebarWidth: number = 200;
	private sidebarHidden: boolean = false;
	private remoteUrls: { [remoteName: string]: string | null } = {};
	private actionSelection: Set<string> = new Set();
	private actionSelectionAnchor: string | null = null;
	private actionSelectionActive: string | null = null;
	private actionSelectionVisible: boolean = false;

	private readonly filterInput: HTMLInputElement;
	private readonly listElem: HTMLElement;
	private readonly sidebar: HTMLElement;
	private readonly toggleBtn: HTMLElement;
	private readonly filterHost: HTMLElement | null;
	private pendingScrollRestoreHandle: number | null = null;

	constructor(id: string, branchChangeCallback: (values: string[]) => void, tagChangeCallback: (values: string[]) => void, contextMenuCallback: (type: BranchPanelEntryType, name: string, event: MouseEvent) => void, doubleClickCallback: (type: 'branch' | 'tag', name: string) => void, flattenSingleChildGroups: boolean, groupsFirst: boolean) {
		this.branchChangeCallback = branchChangeCallback;
		this.tagChangeCallback = tagChangeCallback;
		this.contextMenuCallback = contextMenuCallback;
		this.doubleClickCallback = doubleClickCallback;
		this.flattenSingleChildGroups = flattenSingleChildGroups;
		this.groupsFirst = groupsFirst;
		const elem = document.getElementById(id)!;
		this.sidebar = elem.parentElement!; // #sidebar
		this.filterHost = document.getElementById('branchPanelFilterHost');

		// Toggle button in the top controls bar
		this.toggleBtn = document.createElement('div');
		this.toggleBtn.id = 'sidebarToggle';
		this.toggleBtn.title = 'Toggle Branch Panel';
		this.toggleBtn.innerHTML = SVG_ICONS.sidebarPanel;
		this.toggleBtn.classList.add('active');
		const toggleBtnContainer = document.getElementById('sidebarToggleBtn');
		if (toggleBtnContainer) {
			toggleBtnContainer.appendChild(this.toggleBtn);
		}
		this.toggleBtn.addEventListener('click', () => this.toggleSidebar());

		// Resize handle just outside the sidebar, next to the toggle button
		const resizeHandle = document.createElement('div');
		resizeHandle.id = 'sidebarResizeHandle';
		document.body.appendChild(resizeHandle);
		this.setupResize(resizeHandle);

		// Filter input
		const filterWrapper = (this.filterHost ?? elem).appendChild(document.createElement('div'));
		filterWrapper.className = 'branchPanelFilter';
		this.filterInput = filterWrapper.appendChild(document.createElement('input'));
		this.filterInput.className = 'branchPanelFilterInput';
		this.filterInput.placeholder = 'Filter...';
		this.filterInput.addEventListener('input', () => {
			this.filterValue = this.filterInput.value.toLowerCase();
			this.render();
		});

		this.listElem = elem.appendChild(document.createElement('div'));
		this.listElem.className = 'branchPanelList';
		this.listElem.addEventListener('click', (e) => this.handleClick(e));
		this.listElem.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
		this.listElem.addEventListener('contextmenu', (e) => this.handleContextMenu(e));
		this.listElem.addEventListener('mousedown', () => this.setActionSelectionVisible(true));
		this.filterInput.addEventListener('focus', () => this.setActionSelectionVisible(false));
		document.addEventListener('mousedown', (e) => {
			const target = e.target;
			if (target === null) return;
			const insideSidebar = target instanceof Node && (this.sidebar.contains(target) || (this.filterHost !== null && this.filterHost.contains(target)));
			if (!insideSidebar) this.setActionSelectionVisible(false);
		});
		document.addEventListener('focusin', (e) => {
			const target = e.target;
			if (target === null) return;
			const insideSidebar = target instanceof Node && (this.sidebar.contains(target) || (this.filterHost !== null && this.filterHost.contains(target)));
			if (!insideSidebar) this.setActionSelectionVisible(false);
		});
		window.addEventListener('blur', () => this.setActionSelectionVisible(false));
		this.sidebar.addEventListener('scroll', () => {
			this.listScrollTop = this.sidebar.scrollTop;
		});

		this.updateWidth(this.sidebarWidth);
	}

	private setupResize(handle: HTMLElement) {
		let startX = 0;
		let startWidth = 0;
		const onMove = (e: MouseEvent) => {
			const w = Math.max(120, Math.min(600, startWidth + e.clientX - startX));
			this.updateWidth(w);
		};
		const onUp = () => {
			document.removeEventListener('mousemove', onMove);
			document.removeEventListener('mouseup', onUp);
		};
		handle.addEventListener('mousedown', (e) => {
			e.preventDefault();
			startX = e.clientX;
			startWidth = this.sidebarWidth;
			document.addEventListener('mousemove', onMove);
			document.addEventListener('mouseup', onUp);
		});
	}

	private updateWidth(width: number) {
		this.sidebarWidth = width;
		this.applyLayoutWidth(this.sidebarHidden ? 0 : width);
		this.updateHintLayout();
		this.scheduleScrollRestore();
	}

	private toggleSidebar() {
		this.sidebarHidden = !this.sidebarHidden;
		if (this.sidebarHidden) {
			this.sidebar.style.overflow = 'hidden';
			document.body.classList.add('branchPanelHidden');
			this.applyLayoutWidth(0);
			this.toggleBtn.classList.remove('active');
		} else {
			this.sidebar.style.overflow = '';
			document.body.classList.remove('branchPanelHidden');
			this.applyLayoutWidth(this.sidebarWidth);
			this.toggleBtn.classList.add('active');
		}
		this.updateHintLayout();
	}

	private applyLayoutWidth(width: number) {
		document.body.style.setProperty('--branch-panel-width', width + 'px');
	}

	public setRemoteUrls(urls: { [remoteName: string]: string | null }) {
		this.remoteUrls = urls;
		this.render();
	}

	public setTags(tags: ReadonlyArray<string>) {
		const selectedTagNames = new Set<string>([
			...Array.from(this.tagSelected).map((i) => this.tagNames[i]),
			...Array.from(this.pendingTagSelectionNames)
		]);
		this.tagNames = tags;
		this.tagSelected = new Set(tags
			.map((tagName, i) => selectedTagNames.has(tagName) ? i : -1)
			.filter((i) => i !== -1));
		this.pendingTagSelectionNames.clear();
		this.pruneActionSelection();
		this.render();
	}

	public setSelectedTags(tags: ReadonlyArray<string>) {
		this.pendingTagSelectionNames = new Set(tags);
		this.tagSelected = new Set(this.tagNames
			.map((tagName, i) => this.pendingTagSelectionNames.has(tagName) ? i : -1)
			.filter((i) => i !== -1));
		this.render();
	}

	public setOptions(options: ReadonlyArray<DropdownOption>, optionsSelected: string[]) {
		this.options = options;
		this.optionsSelected = [];
		let selectedOption = -1;
		for (let i = 0; i < options.length; i++) {
			const isSelected = optionsSelected.includes(options[i].value);
			this.optionsSelected[i] = isSelected;
			if (isSelected) selectedOption = i;
		}
		if (selectedOption === -1) {
			this.optionsSelected[0] = true;
		}
		this.pruneActionSelection();
		this.render();
	}

	public isSelected(value: string) {
		if (this.options.length > 0) {
			if (this.optionsSelected[0]) return true;
			const idx = this.options.findIndex((o) => o.value === value);
			if (idx > -1 && this.optionsSelected[idx]) return true;
		}
		return false;
	}

	public addToSelection(values: ReadonlyArray<string>) {
		if (this.optionsSelected[0]) return;
		let changed = false;
		for (let i = 1; i < this.options.length; i++) {
			if (!this.optionsSelected[i] && values.includes(this.options[i].value)) {
				this.optionsSelected[i] = true;
				changed = true;
			}
		}
		if (changed) this.render();
	}

	public selectOnlyOption(value: string) {
		const idx = this.options.findIndex((o) => o.value === value);
		if (idx === -1) return;
		this.optionsSelected = this.options.map((_, i) => i === idx);
		this.render();
		this.branchChangeCallback(this.getSelectedBranchValues());
	}

	public selectOnlyTag(tagName: string) {
		const idx = this.tagNames.indexOf(tagName);
		this.tagSelected = idx > -1 ? new Set([idx]) : new Set();
		this.pendingTagSelectionNames.clear();
		this.render();
		this.tagChangeCallback(this.getSelectedTagValues());
	}

	public selectTag(tagName: string) {
		const idx = this.tagNames.indexOf(tagName);
		if (idx > -1 && !this.tagSelected.has(idx)) {
			this.tagSelected.add(idx);
			this.pendingTagSelectionNames.clear();
			this.render();
			this.tagChangeCallback(this.getSelectedTagValues());
		}
	}

	public selectOption(value: string) {
		const idx = this.options.findIndex((o) => o.value === value);
		if (idx > -1 && !this.optionsSelected[0] && !this.optionsSelected[idx]) {
			this.optionsSelected[idx] = true;
			this.render();
			this.branchChangeCallback(this.getSelectedBranchValues());
		}
	}

	public unselectOption(value: string) {
		const idx = this.options.findIndex((o) => o.value === value);
		if (idx > -1 && (this.optionsSelected[0] || this.optionsSelected[idx])) {
			if (this.optionsSelected[0]) {
				this.optionsSelected[0] = false;
				for (let i = 1; i < this.optionsSelected.length; i++) this.optionsSelected[i] = true;
			}
			this.optionsSelected[idx] = false;
			if (this.optionsSelected.every((s) => !s)) this.optionsSelected[0] = true;
			this.render();
			this.branchChangeCallback(this.getSelectedBranchValues());
		}
	}

	public refresh() {
		if (this.options.length > 0) this.render();
	}

	public getState(): GG.CommitsBranchPanelState {
		return {
			filterValue: this.filterValue,
			localCollapsed: this.localCollapsed,
			remoteCollapsed: this.remoteCollapsed,
			tagsCollapsed: this.tagsCollapsed,
			folderCollapsed: Object.assign({}, this.folderCollapsed),
			sidebarWidth: this.sidebarWidth,
			sidebarHidden: this.sidebarHidden,
			scrollTop: this.listScrollTop
		};
	}

	public restoreState(state: GG.CommitsBranchPanelState) {
		this.filterValue = state.filterValue;
		this.localCollapsed = state.localCollapsed;
		this.remoteCollapsed = state.remoteCollapsed;
		this.tagsCollapsed = state.tagsCollapsed;
		this.folderCollapsed = Object.assign({}, state.folderCollapsed);
		this.filterInput.value = this.filterValue;
		this.sidebarWidth = state.sidebarWidth;
		this.updateWidth(this.sidebarWidth);
		if (this.sidebarHidden !== state.sidebarHidden) {
			this.toggleSidebar();
		}
		this.listScrollTop = state.scrollTop;
		this.render();
	}

	public isOpen() { return false; }
	public close() { /* no-op: sidebar is always visible */ }

	public getActionSelection(): ReadonlyArray<BranchPanelActionSelectionItem> {
		return Array.from(this.actionSelection)
			.map((key) => this.parseActionSelectionKey(key))
			.filter((item): item is BranchPanelActionSelectionItem => item !== null);
	}

	public isActionSelected(type: 'branch' | 'tag', name: string) {
		return this.actionSelection.has(this.getActionSelectionKey(type, name));
	}

	private getSelectedBranchValues(): string[] {
		if (this.optionsSelected[0]) return [this.options[0].value];
		return this.options.filter((_, i) => this.optionsSelected[i]).map((o) => o.value);
	}

	private getSelectedTagValues(): string[] {
		return Array.from(this.tagSelected).map((i) => this.tagNames[i]);
	}

	private handleClick(e: MouseEvent) {
		const eventTarget = <HTMLElement>e.target;
		const autoItem = eventTarget.closest('.branchPanelAutoTagItem') as HTMLElement | null;
		const sectionHeader = eventTarget.closest('.branchPanelSectionHeader') as HTMLElement | null;
		const folder = eventTarget.closest('.branchPanelFolder') as HTMLElement | null;
		const tagItem = eventTarget.closest('.branchPanelTagItem') as HTMLElement | null;
		const item = eventTarget.closest('.branchPanelItem') as HTMLElement | null;
		const clickedCheck = eventTarget.closest('.branchPanelCheck') !== null;

		if (autoItem !== null) {
			this.onAutoTagClick();
		} else if (sectionHeader !== null) {
			const section = sectionHeader.dataset.section;
			if (section === 'local') this.localCollapsed = !this.localCollapsed;
			else if (section === 'remote') this.remoteCollapsed = !this.remoteCollapsed;
			else if (section === 'tags') this.tagsCollapsed = !this.tagsCollapsed;
			this.render();
		} else if (folder !== null) {
			const path = folder.dataset.folder!;
			this.folderCollapsed[path] = !(this.folderCollapsed[path] ?? false);
			this.render();
		} else if (tagItem !== null && typeof tagItem.dataset.tagid !== 'undefined') {
			const tagName = this.tagNames[parseInt(tagItem.dataset.tagid)];
			if (clickedCheck) {
				this.onTagClick(parseInt(tagItem.dataset.tagid));
			} else if (typeof tagName !== 'undefined') {
				this.onActionItemClick('tag', tagName, e);
			}
		} else if (item !== null && typeof item.dataset.id !== 'undefined') {
			const idx = parseInt(item.dataset.id);
			if (idx === 0 || clickedCheck) {
				this.onItemClick(idx);
			} else {
				const option = this.options[idx];
				if (typeof option !== 'undefined') {
					this.onActionItemClick('branch', option.value, e);
				}
			}
		}
	}

	private handleContextMenu(e: MouseEvent) {
		const target = <HTMLElement>e.target;
		const sectionHeader = target.closest('.branchPanelSectionHeader') as HTMLElement | null;
		if (sectionHeader !== null && sectionHeader.dataset.section === 'local') {
			e.preventDefault();
			e.stopPropagation();
			this.contextMenuCallback('localSection', '', e);
			return;
		}

		if (sectionHeader !== null && sectionHeader.dataset.section === 'remote') {
			e.preventDefault();
			e.stopPropagation();
			this.contextMenuCallback('remoteSection', '', e);
			return;
		}

		const folder = target.closest('.branchPanelFolder') as HTMLElement | null;
		if (folder !== null && folder.dataset.entryType === 'remote' && typeof folder.dataset.entryName !== 'undefined') {
			e.preventDefault();
			e.stopPropagation();
			this.contextMenuCallback('remote', folder.dataset.entryName, e);
			return;
		}

		const tagItem = target.closest('.branchPanelTagItem') as HTMLElement | null;
		const item = target.closest('.branchPanelItem') as HTMLElement | null;

		if (tagItem !== null && typeof tagItem.dataset.tagid !== 'undefined') {
			const tagName = this.tagNames[parseInt(tagItem.dataset.tagid)];
			if (typeof tagName === 'undefined') return;
			if (!this.isActionSelected('tag', tagName)) {
				this.setSingleActionSelection('tag', tagName);
			} else {
				this.actionSelectionAnchor = this.getActionSelectionKey('tag', tagName);
				this.actionSelectionActive = this.actionSelectionAnchor;
				this.setActionSelectionVisible(true);
				this.updateActionSelectionStyles();
			}
			e.preventDefault();
			e.stopPropagation();
			this.contextMenuCallback('tag', tagName, e);
		} else if (item !== null && typeof item.dataset.id !== 'undefined') {
			const idx = parseInt(item.dataset.id);
			if (idx === 0) return;
			const option = this.options[idx];
			if (typeof option === 'undefined') return;
			if (!this.isActionSelected('branch', option.value)) {
				this.setSingleActionSelection('branch', option.value);
			} else {
				this.actionSelectionAnchor = this.getActionSelectionKey('branch', option.value);
				this.actionSelectionActive = this.actionSelectionAnchor;
				this.setActionSelectionVisible(true);
				this.updateActionSelectionStyles();
			}
			e.preventDefault();
			e.stopPropagation();
			this.contextMenuCallback('branch', option.value, e);
		}
	}

	private handleDoubleClick(e: MouseEvent) {
		const target = <HTMLElement>e.target;
		const tagItem = target.closest('.branchPanelTagItem') as HTMLElement | null;
		const item = target.closest('.branchPanelItem') as HTMLElement | null;
		if (tagItem !== null && typeof tagItem.dataset.tagid !== 'undefined') {
			const tagName = this.tagNames[parseInt(tagItem.dataset.tagid)];
			if (typeof tagName !== 'undefined') this.doubleClickCallback('tag', tagName);
		} else if (item !== null && typeof item.dataset.id !== 'undefined') {
			const idx = parseInt(item.dataset.id);
			if (idx === 0) return;
			const option = this.options[idx];
			if (typeof option !== 'undefined') this.doubleClickCallback('branch', option.value);
		}
	}

	private onItemClick(idx: number) {
		if (idx === 0) {
			if (!this.optionsSelected[0]) {
				this.optionsSelected[0] = true;
				for (let i = 1; i < this.optionsSelected.length; i++) this.optionsSelected[i] = false;
				this.render();
				this.branchChangeCallback(this.getSelectedBranchValues());
			}
		} else {
			if (this.optionsSelected[0]) this.optionsSelected[0] = false;
			this.optionsSelected[idx] = !this.optionsSelected[idx];
			if (this.optionsSelected.every((s) => !s)) this.optionsSelected[0] = true;
			this.render();
			this.branchChangeCallback(this.getSelectedBranchValues());
		}
	}

	private onTagClick(tagIdx: number) {
		if (this.tagSelected.has(tagIdx)) {
			this.tagSelected.delete(tagIdx);
		} else {
			this.tagSelected.add(tagIdx);
		}
		this.pendingTagSelectionNames.clear();
		this.render();
		this.tagChangeCallback(this.getSelectedTagValues());
	}

	private onAutoTagClick() {
		if (this.tagSelected.size === 0 && this.pendingTagSelectionNames.size === 0) return;
		this.tagSelected = new Set();
		this.pendingTagSelectionNames.clear();
		this.render();
		this.tagChangeCallback([]);
	}

	private render() {
		branchPanelRender(this);
	}

	private scheduleScrollRestore() {
		if (this.pendingScrollRestoreHandle !== null) {
			cancelAnimationFrame(this.pendingScrollRestoreHandle);
		}

		this.pendingScrollRestoreHandle = requestAnimationFrame(() => {
			this.sidebar.scrollTop = this.listScrollTop;
			this.pendingScrollRestoreHandle = requestAnimationFrame(() => {
				this.sidebar.scrollTop = this.listScrollTop;
				this.pendingScrollRestoreHandle = null;
			});
		});
	}

	private updateHintLayout() {
		const rows = this.listElem.querySelectorAll('.branchPanelItemContent');
		for (let i = 0; i < rows.length; i++) {
			const content = rows[i] as HTMLElement;
			const name = content.querySelector('.branchPanelItemName') as HTMLElement | null;
			const hint = content.querySelector('.branchPanelItemHint') as HTMLElement | null;
			if (name === null || hint === null) continue;

			name.style.maxWidth = '';
			hint.style.maxWidth = '';
			hint.classList.remove('hidden');

			const available = content.clientWidth;
			const gap = parseFloat(getComputedStyle(hint).marginLeft) || 0;
			const nameWidth = name.scrollWidth;
			const hintWidth = hint.scrollWidth;

			if (nameWidth + gap + hintWidth <= available) continue;

			if (nameWidth < available) {
				hint.style.maxWidth = Math.max(0, available - nameWidth - gap) + 'px';
			} else {
				hint.classList.add('hidden');
				name.style.maxWidth = available + 'px';
			}
		}
	}

	private getActionSelectionKey(type: 'branch' | 'tag', name: string) {
		return type + ':' + name;
	}

	private parseActionSelectionKey(key: string): BranchPanelActionSelectionItem | null {
		const separator = key.indexOf(':');
		if (separator === -1) return null;
		const type = key.substring(0, separator);
		const name = key.substring(separator + 1);
		if (name === '' || (type !== 'branch' && type !== 'tag')) return null;
		return { type: <'branch' | 'tag'>type, name: name };
	}

	private pruneActionSelection() {
		const branchValues = new Set<string>(this.options.slice(1).map((option) => option.value));
		const tagValues = new Set<string>(this.tagNames);
		let changed = false;
		this.actionSelection.forEach((key) => {
			const item = this.parseActionSelectionKey(key);
			if (item === null) {
				this.actionSelection.delete(key);
				changed = true;
				return;
			}
			if ((item.type === 'branch' && !branchValues.has(item.name)) || (item.type === 'tag' && !tagValues.has(item.name))) {
				this.actionSelection.delete(key);
				changed = true;
			}
		});
		if (this.actionSelectionAnchor !== null && !this.actionSelection.has(this.actionSelectionAnchor)) {
			this.actionSelectionAnchor = null;
			changed = true;
		}
		if (this.actionSelectionActive !== null && !this.actionSelection.has(this.actionSelectionActive)) {
			this.actionSelectionActive = this.actionSelectionAnchor;
			changed = true;
		}
		if (changed) {
			this.updateActionSelectionStyles();
		}
	}

	private onActionItemClick(type: 'branch' | 'tag', name: string, event: MouseEvent) {
		const key = this.getActionSelectionKey(type, name);
		if (event.shiftKey) {
			this.selectActionRange(key);
			return;
		}
		if (event.ctrlKey || event.metaKey) {
			if (this.actionSelection.has(key)) {
				this.actionSelection.delete(key);
				if (this.actionSelectionAnchor === key) {
					this.actionSelectionAnchor = null;
				}
				if (this.actionSelectionActive === key) {
					this.actionSelectionActive = this.actionSelectionAnchor;
				}
			} else {
				this.actionSelection.add(key);
				this.actionSelectionAnchor = key;
				this.actionSelectionActive = key;
			}
			this.setActionSelectionVisible(true);
			this.updateActionSelectionStyles();
			return;
		}
		this.actionSelection.clear();
		this.actionSelection.add(key);
		this.actionSelectionAnchor = key;
		this.actionSelectionActive = key;
		this.setActionSelectionVisible(true);
		this.updateActionSelectionStyles();
	}

	private setSingleActionSelection(type: 'branch' | 'tag', name: string) {
		const key = this.getActionSelectionKey(type, name);
		this.actionSelection.clear();
		this.actionSelection.add(key);
		this.actionSelectionAnchor = key;
		this.actionSelectionActive = key;
		this.setActionSelectionVisible(true);
		this.updateActionSelectionStyles();
	}

	private selectActionRange(targetKey: string) {
		const visibleKeys = this.getVisibleActionSelectionKeys();
		if (visibleKeys.length === 0) return;
		let anchor = this.actionSelectionAnchor;
		if (anchor === null || visibleKeys.indexOf(anchor) === -1) {
			anchor = targetKey;
		}
		const anchorIdx = visibleKeys.indexOf(anchor);
		const targetIdx = visibleKeys.indexOf(targetKey);
		if (anchorIdx === -1 || targetIdx === -1) {
			this.actionSelection.clear();
			this.actionSelection.add(targetKey);
			this.actionSelectionAnchor = targetKey;
			this.updateActionSelectionStyles();
			return;
		}
		const start = Math.min(anchorIdx, targetIdx);
		const end = Math.max(anchorIdx, targetIdx);
		this.actionSelection.clear();
		for (let i = start; i <= end; i++) {
			this.actionSelection.add(visibleKeys[i]);
		}
		this.actionSelectionAnchor = anchor;
		this.actionSelectionActive = targetKey;
		this.setActionSelectionVisible(true);
		this.updateActionSelectionStyles();
	}

	private getVisibleActionSelectionKeys() {
		const rows = this.listElem.querySelectorAll('.branchPanelItem[data-action-key]');
		const keys: string[] = [];
		for (let i = 0; i < rows.length; i++) {
			const key = (<HTMLElement>rows[i]).dataset.actionKey;
			if (typeof key === 'string' && key !== '') {
				keys.push(key);
			}
		}
		return keys;
	}

	private updateActionSelectionStyles() {
		this.listElem.classList.toggle('actionSelectionVisible', this.actionSelectionVisible);
		const rows = this.listElem.querySelectorAll('.branchPanelItem[data-action-key]');
		for (let i = 0; i < rows.length; i++) {
			const row = <HTMLElement>rows[i];
			const key = row.dataset.actionKey;
			const isSelected = typeof key === 'string' && this.actionSelection.has(key);
			row.classList.toggle('actionSelectedRow', isSelected);
			row.classList.toggle('actionSelected',
				this.actionSelectionVisible &&
				isSelected &&
				this.actionSelectionActive !== null &&
				key === this.actionSelectionActive
			);
		}
	}

	private setActionSelectionVisible(visible: boolean) {
		if (this.actionSelectionVisible === visible) return;
		this.actionSelectionVisible = visible;
		this.updateActionSelectionStyles();
	}
}
