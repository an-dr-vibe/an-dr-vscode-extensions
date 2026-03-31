/**
 * Implements the branch list panel shown as a left sidebar in the Git Graph View.
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
const BRANCH_PANEL_OPEN_FOLDER_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1.75 3A1.75 1.75 0 0 1 3.5 1.25h2.08c.46 0 .9.18 1.23.51l.66.66c.1.1.24.16.38.16h4.65c.97 0 1.75.78 1.75 1.75v1.08H1.75V3Zm12.43 3.75H1.8l1.14 5.04c.09.4.44.68.85.68h8.42c.39 0 .73-.26.84-.64l1.13-5.08Z"/></svg>';
const BRANCH_PANEL_CLOSED_FOLDER_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M1.75 3A1.75 1.75 0 0 1 3.5 1.25h2.08c.46 0 .9.18 1.23.51l.66.66c.1.1.24.16.38.16h4.65c.97 0 1.75.78 1.75 1.75v7.17c0 .97-.78 1.75-1.75 1.75h-9A1.75 1.75 0 0 1 1.75 12.5V3Z"/></svg>';

class BranchPanel {
	private readonly branchChangeCallback: (values: string[]) => void;
	private readonly tagChangeCallback: (values: string[]) => void;
	private readonly contextMenuCallback: (type: BranchPanelEntryType, name: string, event: MouseEvent) => void;
	private options: ReadonlyArray<DropdownOption> = [];
	private optionsSelected: boolean[] = [];
	private tagNames: ReadonlyArray<string> = [];
	private tagSelected: Set<number> = new Set();
	private pendingTagSelectionNames: Set<string> = new Set();
	private filterValue: string = '';
	private readonly flattenSingleChildGroups: boolean;
	private readonly groupsFirst: boolean;
	private localCollapsed: boolean = false;
	private remoteCollapsed: boolean = false;
	private tagsCollapsed: boolean = true;
	private folderCollapsed: { [path: string]: boolean } = {};
	private sidebarWidth: number = 200;
	private sidebarHidden: boolean = false;

	private readonly filterInput: HTMLInputElement;
	private readonly listElem: HTMLElement;
	private readonly sidebar: HTMLElement;
	private readonly toggleBtn: HTMLElement;

	constructor(id: string, branchChangeCallback: (values: string[]) => void, tagChangeCallback: (values: string[]) => void, contextMenuCallback: (type: BranchPanelEntryType, name: string, event: MouseEvent) => void, flattenSingleChildGroups: boolean, groupsFirst: boolean) {
		this.branchChangeCallback = branchChangeCallback;
		this.tagChangeCallback = tagChangeCallback;
		this.contextMenuCallback = contextMenuCallback;
		this.flattenSingleChildGroups = flattenSingleChildGroups;
		this.groupsFirst = groupsFirst;
		const elem = document.getElementById(id)!;
		this.sidebar = elem.parentElement!; // #sidebar

		// Fixed-position toggle button (stays visible when sidebar is hidden)
		this.toggleBtn = document.createElement('div');
		this.toggleBtn.id = 'sidebarToggle';
		this.toggleBtn.title = 'Toggle Branch Panel';
		this.toggleBtn.innerHTML = '&#9664;';
		document.body.appendChild(this.toggleBtn);
		this.toggleBtn.addEventListener('click', () => this.toggleSidebar());

		// Resize handle on the right edge of the sidebar
		const resizeHandle = document.createElement('div');
		resizeHandle.id = 'sidebarResizeHandle';
		this.sidebar.appendChild(resizeHandle);
		this.setupResize(resizeHandle);

		// Filter input
		const filterWrapper = elem.appendChild(document.createElement('div'));
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
		this.listElem.addEventListener('contextmenu', (e) => this.handleContextMenu(e));

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
		if (!this.sidebarHidden) {
			this.sidebar.style.width = width + 'px';
			const content = document.getElementById('content');
			if (content) content.style.marginLeft = width + 'px';
		}
		this.updateTogglePosition();
		this.updateHintLayout();
	}

	private toggleSidebar() {
		this.sidebarHidden = !this.sidebarHidden;
		const content = document.getElementById('content');
		if (this.sidebarHidden) {
			this.sidebar.style.width = '0';
			this.sidebar.style.overflow = 'hidden';
			if (content) content.style.marginLeft = '0';
			this.toggleBtn.innerHTML = '&#9654;';
		} else {
			this.sidebar.style.width = this.sidebarWidth + 'px';
			this.sidebar.style.overflow = '';
			if (content) content.style.marginLeft = this.sidebarWidth + 'px';
			this.toggleBtn.innerHTML = '&#9664;';
		}
		this.updateTogglePosition();
		this.updateHintLayout();
	}

	private updateTogglePosition() {
		this.toggleBtn.style.left = (this.sidebarHidden ? 0 : this.sidebarWidth) + 'px';
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

	public isOpen() { return false; }
	public close() { /* no-op: sidebar is always visible */ }

	private getSelectedBranchValues(): string[] {
		if (this.optionsSelected[0]) return [this.options[0].value];
		return this.options.filter((_, i) => this.optionsSelected[i]).map((o) => o.value);
	}

	private getSelectedTagValues(): string[] {
		return Array.from(this.tagSelected).map((i) => this.tagNames[i]);
	}

	private handleClick(e: MouseEvent) {
		const autoItem = (<HTMLElement>e.target).closest('.branchPanelAutoTagItem') as HTMLElement | null;
		const sectionHeader = (<HTMLElement>e.target).closest('.branchPanelSectionHeader') as HTMLElement | null;
		const folder = (<HTMLElement>e.target).closest('.branchPanelFolder') as HTMLElement | null;
		const tagItem = (<HTMLElement>e.target).closest('.branchPanelTagItem') as HTMLElement | null;
		const item = (<HTMLElement>e.target).closest('.branchPanelItem') as HTMLElement | null;

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
			this.onTagClick(parseInt(tagItem.dataset.tagid));
		} else if (item !== null && typeof item.dataset.id !== 'undefined') {
			this.onItemClick(parseInt(item.dataset.id));
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
			e.preventDefault();
			e.stopPropagation();
			this.contextMenuCallback('tag', this.tagNames[parseInt(tagItem.dataset.tagid)], e);
		} else if (item !== null && typeof item.dataset.id !== 'undefined') {
			const idx = parseInt(item.dataset.id);
			if (idx === 0) return;
			e.preventDefault();
			e.stopPropagation();
			const value = this.options[idx].value;
			this.contextMenuCallback('branch', value.startsWith('remotes/') ? value.substring(8) : value, e);
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

	private isAutoTagSelected() {
		return this.tagSelected.size === 0 && this.pendingTagSelectionNames.size === 0;
	}

	private getAutoTagItemHtml(indent: number) {
		return '<div class="branchPanelItem branchPanelAutoTagItem' + (this.isAutoTagSelected() ? ' selected' : '') + '" title="Automatically show tags on the visible graph" style="padding-left:' + (4 + indent * 14) + 'px">' +
			'<span class="branchPanelCheck">' + (this.isAutoTagSelected() ? SVG_ICONS.check : '') + '</span>' +
			'<span class="branchPanelItemName">Auto</span>' +
			'</div>';
	}

	private getEmptyTagMessage() {
		return 'No tags';
	}

	private transformTree(nodes: BranchTreeNode[], preserveRootFolders: boolean = false, depth: number = 0): BranchTreeNode[] {
		const transformed = nodes.map((node) => this.transformTreeNode(node, preserveRootFolders, depth));
		if (this.groupsFirst) {
			transformed.sort((a, b) => {
				if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
				const aName = a.type === 'folder' ? a.name : a.displayName;
				const bName = b.type === 'folder' ? b.name : b.displayName;
				return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
			});
		}
		return transformed;
	}

	private transformTreeNode(node: BranchTreeNode, preserveRootFolders: boolean, depth: number): BranchTreeNode {
		if (node.type === 'leaf') return node;

		const children = this.transformTree(node.children, preserveRootFolders, depth + 1);
		if (this.flattenSingleChildGroups && children.length === 1 && !(preserveRootFolders && depth === 0)) {
			const child = children[0];
			if (child.type === 'leaf') {
				return {
					type: 'leaf',
					displayName: node.name + '/' + child.displayName,
					fullName: child.fullName,
					idx: child.idx
				};
			}
			return {
				type: 'folder',
				name: node.name + '/' + child.name,
				path: child.path,
				children: child.children
			};
		}

		return {
			type: 'folder',
			name: node.name,
			path: node.path,
			children
		};
	}

	// Build a prefix tree from "/" separated names
	private buildTree(items: Array<{ name: string; idx: number }>): BranchTreeNode[] {
		const root: BranchTreeNode[] = [];
		for (const item of items) {
			this.insertIntoTree(root, item.name.split('/'), item.idx, item.name, '');
		}
		return root;
	}

	private insertIntoTree(nodes: BranchTreeNode[], parts: string[], idx: number, fullName: string, pathPrefix: string): void {
		const seg = parts[0];
		const path = pathPrefix ? pathPrefix + '/' + seg : seg;
		if (parts.length === 1) {
			nodes.push({ type: 'leaf', displayName: seg, fullName, idx });
			return;
		}
		let folder = nodes.find(n => n.type === 'folder' && n.name === seg) as BranchTreeFolder | undefined;
		if (!folder) {
			folder = { type: 'folder', name: seg, path, children: [] };
			nodes.push(folder);
		}
		this.insertIntoTree(folder.children, parts.slice(1), idx, fullName, path);
	}

	private treeMatchesFilter(nodes: BranchTreeNode[], filter: string): boolean {
		for (const node of nodes) {
			if (node.type === 'folder') {
				if (node.name.toLowerCase().includes(filter)) return true;
				if (this.treeMatchesFilter(node.children, filter)) return true;
			} else {
				if (node.fullName.toLowerCase().includes(filter)) return true;
			}
		}
		return false;
	}

	private renderBranchTreeHtml(nodes: BranchTreeNode[], indent: number, filter: string, treeType: 'local' | 'remote' = 'local'): string {
		let html = '';
		for (const node of nodes) {
			if (node.type === 'folder') {
				if (filter !== '' && !node.name.toLowerCase().includes(filter) && !this.treeMatchesFilter(node.children, filter)) continue;
				const collapsed = this.folderCollapsed[node.path] ?? false;
				const icon = collapsed ? BRANCH_PANEL_CLOSED_FOLDER_ICON : BRANCH_PANEL_OPEN_FOLDER_ICON;
				const isRemoteRoot = treeType === 'remote' && indent === 1;
				html += '<div class="branchPanelFolder" data-folder="' + escapeHtml(node.path) + '"' +
					(isRemoteRoot ? ' data-entry-type="remote" data-entry-name="' + escapeHtml(node.name) + '"' : '') +
					' style="padding-left:' + (4 + indent * 14) + 'px">' +
					'<span class="branchPanelFolderIcon">' + icon + '</span>' +
					'<span class="branchPanelFolderName">' + escapeHtml(node.name + '/') + '</span>' +
					'</div>';
				if (!collapsed) {
					html += this.renderBranchTreeHtml(node.children, indent + 1, filter, treeType);
				}
			} else {
				if (filter !== '' && !node.fullName.toLowerCase().includes(filter)) continue;
				html += this.itemHtml(node.idx, node.displayName, this.optionsSelected[node.idx], indent, node.fullName);
			}
		}
		return html;
	}

	private renderTagTreeHtml(nodes: BranchTreeNode[], indent: number, filter: string): string {
		let html = '';
		for (const node of nodes) {
			if (node.type === 'folder') {
				if (filter !== '' && !node.name.toLowerCase().includes(filter) && !this.treeMatchesFilter(node.children, filter)) continue;
				const fkey = 'tag:' + node.path;
				const collapsed = this.folderCollapsed[fkey] ?? false;
				const icon = collapsed ? BRANCH_PANEL_CLOSED_FOLDER_ICON : BRANCH_PANEL_OPEN_FOLDER_ICON;
				html += '<div class="branchPanelFolder" data-folder="' + escapeHtml(fkey) + '" style="padding-left:' + (4 + indent * 14) + 'px">' +
					'<span class="branchPanelFolderIcon">' + icon + '</span>' +
					'<span class="branchPanelFolderName">' + escapeHtml(node.name + '/') + '</span>' +
					'</div>';
				if (!collapsed) {
					html += this.renderTagTreeHtml(node.children, indent + 1, filter);
				}
			} else {
				if (filter !== '' && !node.fullName.toLowerCase().includes(filter)) continue;
				const selected = this.tagSelected.has(node.idx);
				html += '<div class="branchPanelItem branchPanelTagItem' + (selected ? ' selected' : '') + '" data-tagid="' + node.idx + '" data-drag-ref-type="tag" data-drag-ref-name="' + escapeHtml(node.fullName) + '" draggable="true" title="' + escapeHtml(node.fullName) + '" style="padding-left:' + (4 + indent * 14) + 'px">' +
					'<span class="branchPanelCheck">' + (selected ? SVG_ICONS.check : '') + '</span>' +
					'<span class="branchPanelItemName">' + escapeHtml(node.displayName) + '</span>' +
					'</div>';
			}
		}
		return html;
	}

	private render() {
		const locals: { opt: DropdownOption; idx: number }[] = [];
		const remotes: { opt: DropdownOption; idx: number }[] = [];
		const globs: { opt: DropdownOption; idx: number }[] = [];

		for (let i = 1; i < this.options.length; i++) {
			const opt = this.options[i];
			if (opt.name.startsWith('Glob: ')) {
				globs.push({ opt, idx: i });
			} else if (opt.value.startsWith('remotes/')) {
				remotes.push({ opt, idx: i });
			} else {
				locals.push({ opt, idx: i });
			}
		}

		const filter = this.filterValue;
		let html = '';

		// Show All
		if (filter === '' || 'show all'.indexOf(filter) > -1) {
			html += this.itemHtml(0, this.options[0].name, this.optionsSelected[0], 0, this.options[0].name);
		}

		// Glob patterns
		if (globs.length > 0) {
			const visibleGlobs = globs.filter((g) => filter === '' || g.opt.name.toLowerCase().indexOf(filter) > -1);
			if (visibleGlobs.length > 0) {
				html += '<div class="branchPanelSectionHeader" data-section="globs"><span class="branchPanelArrow">&#9660;</span>Glob Patterns</div>';
				for (let i = 0; i < visibleGlobs.length; i++) {
					html += this.itemHtml(visibleGlobs[i].idx, visibleGlobs[i].opt.name, this.optionsSelected[visibleGlobs[i].idx], 1, visibleGlobs[i].opt.name);
				}
			}
		}

		// Local branches (with "/" tree grouping)
		const localTree = this.transformTree(this.buildTree(locals.map(l => ({ name: l.opt.name, idx: l.idx }))));
		const localTreeVisible = filter === '' || this.treeMatchesFilter(localTree, filter);
		html += '<div class="branchPanelSectionHeader' + (this.localCollapsed ? ' collapsed' : '') + '" data-section="local">' +
			'<span class="branchPanelArrow">' + (this.localCollapsed ? '&#9654;' : '&#9660;') + '</span>' +
			'Local (' + locals.length + ')</div>';
		if (!this.localCollapsed) {
			if (localTreeVisible) {
				html += this.renderBranchTreeHtml(localTree, 1, filter, 'local');
			} else if (filter !== '') {
				html += '<div class="branchPanelNoResults">No matches</div>';
			}
		}

		// Remote branches (with "/" tree grouping)
		if (remotes.length > 0) {
			// Strip the "remotes/" prefix from the display name for tree building
			const remoteTree = this.buildTree(remotes.map(r => ({
				name: r.opt.value.startsWith('remotes/') ? r.opt.value.substring(8) : r.opt.name,
				idx: r.idx
			})));
			const transformedRemoteTree = this.transformTree(remoteTree, true);
			const remoteTreeVisible = filter === '' || this.treeMatchesFilter(transformedRemoteTree, filter);
			html += '<div class="branchPanelSectionHeader' + (this.remoteCollapsed ? ' collapsed' : '') + '" data-section="remote">' +
				'<span class="branchPanelArrow">' + (this.remoteCollapsed ? '&#9654;' : '&#9660;') + '</span>' +
				'Remote (' + remotes.length + ')</div>';
			if (!this.remoteCollapsed) {
				if (remoteTreeVisible) {
					html += this.renderBranchTreeHtml(transformedRemoteTree, 1, filter, 'remote');
				} else if (filter !== '') {
					html += '<div class="branchPanelNoResults">No matches</div>';
				}
			}
		}

		// Tags (with "/" tree grouping)
		if (this.tagNames.length > 0) {
			const tagTree = this.transformTree(this.buildTree(this.tagNames.map((name, i) => ({ name, idx: i }))));
			const tagTreeVisible = filter === '' || this.treeMatchesFilter(tagTree, filter);
			html += '<div class="branchPanelSectionHeader' + (this.tagsCollapsed ? ' collapsed' : '') + '" data-section="tags">' +
				'<span class="branchPanelArrow">' + (this.tagsCollapsed ? '&#9654;' : '&#9660;') + '</span>' +
				'<span class="branchPanelSectionTitle">Tags (' + this.tagNames.length + ')</span>' +
				'</div>';
			if (!this.tagsCollapsed) {
				html += this.getAutoTagItemHtml(1);
				if (tagTreeVisible) {
					html += this.renderTagTreeHtml(tagTree, 1, filter);
				} else {
					html += '<div class="branchPanelNoResults">' + (filter !== '' ? 'No matches' : this.getEmptyTagMessage()) + '</div>';
				}
			}
		}

		this.listElem.innerHTML = html;
		this.updateHintLayout();
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

	private itemHtml(idx: number, name: string, selected: boolean, indent: number, title: string) {
		const isDraggableBranch = idx > 0 && !this.options[idx].name.startsWith('Glob: ') && !this.options[idx].value.startsWith('remotes/');
		const hint = typeof this.options[idx].hint === 'string' && this.options[idx].hint !== '' ? this.options[idx].hint! : null;
		const hintKind = typeof this.options[idx].hintKind === 'string' ? this.options[idx].hintKind : null;
		return '<div class="branchPanelItem' + (selected ? ' selected' : '') + '" data-id="' + idx + '"' +
			(isDraggableBranch ? ' data-drag-ref-type="branch" data-drag-ref-name="' + escapeHtml(this.options[idx].value) + '" draggable="true"' : '') +
			' title="' + escapeHtml(title + (hint !== null ? ' ' + hint : '')) + '" style="padding-left:' + (4 + indent * 14) + 'px">' +
			'<span class="branchPanelCheck">' + (selected ? SVG_ICONS.check : '') + '</span>' +
			'<span class="branchPanelItemContent">' +
			'<span class="branchPanelItemName">' + escapeHtml(name) + '</span>' +
			(hint !== null ? '<span class="branchPanelItemHint' + (hintKind !== null ? ' ' + hintKind : '') + '">' + escapeHtml(hint) + '</span>' : '') +
			'</span>' +
			'</div>';
	}
}
