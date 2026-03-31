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

class BranchPanel {
	private readonly changeCallback: (values: string[]) => void;
	private options: ReadonlyArray<DropdownOption> = [];
	private optionsSelected: boolean[] = [];
	private tagNames: ReadonlyArray<string> = [];
	private tagSelected: Set<number> = new Set();
	private filterValue: string = '';
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

	constructor(id: string, changeCallback: (values: string[]) => void) {
		this.changeCallback = changeCallback;
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
	}

	private updateTogglePosition() {
		this.toggleBtn.style.left = (this.sidebarHidden ? 0 : this.sidebarWidth) + 'px';
	}

	public setTags(tags: ReadonlyArray<string>) {
		this.tagNames = tags;
		this.tagSelected = new Set();
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
			this.changeCallback(this.getSelectedValues());
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
			if (this.optionsSelected.every((s) => !s) && !this.tagSelected.size) this.optionsSelected[0] = true;
			this.render();
			this.changeCallback(this.getSelectedValues());
		}
	}

	public refresh() {
		if (this.options.length > 0) this.render();
	}

	public isOpen() { return false; }
	public close() { /* no-op: sidebar is always visible */ }

	private getSelectedValues(): string[] {
		if (this.optionsSelected[0]) return [this.options[0].value];
		const branchValues = this.options.filter((_, i) => this.optionsSelected[i]).map((o) => o.value);
		const tagValues = Array.from(this.tagSelected).map(i => this.tagNames[i]);
		return [...branchValues, ...tagValues];
	}

	private handleClick(e: MouseEvent) {
		const sectionHeader = (<HTMLElement>e.target).closest('.branchPanelSectionHeader') as HTMLElement | null;
		const folder = (<HTMLElement>e.target).closest('.branchPanelFolder') as HTMLElement | null;
		const tagItem = (<HTMLElement>e.target).closest('.branchPanelTagItem') as HTMLElement | null;
		const item = (<HTMLElement>e.target).closest('.branchPanelItem') as HTMLElement | null;

		if (sectionHeader !== null) {
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

	private onItemClick(idx: number) {
		if (idx === 0) {
			if (!this.optionsSelected[0]) {
				this.optionsSelected[0] = true;
				for (let i = 1; i < this.optionsSelected.length; i++) this.optionsSelected[i] = false;
				this.tagSelected = new Set();
				this.render();
				this.changeCallback(this.getSelectedValues());
			}
		} else {
			if (this.optionsSelected[0]) this.optionsSelected[0] = false;
			this.optionsSelected[idx] = !this.optionsSelected[idx];
			if (this.optionsSelected.every((s) => !s) && !this.tagSelected.size) this.optionsSelected[0] = true;
			this.render();
			this.changeCallback(this.getSelectedValues());
		}
	}

	private onTagClick(tagIdx: number) {
		if (this.optionsSelected[0]) this.optionsSelected[0] = false;
		if (this.tagSelected.has(tagIdx)) {
			this.tagSelected.delete(tagIdx);
		} else {
			this.tagSelected.add(tagIdx);
		}
		if (this.optionsSelected.every((s) => !s) && !this.tagSelected.size) this.optionsSelected[0] = true;
		this.render();
		this.changeCallback(this.getSelectedValues());
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

	private renderBranchTreeHtml(nodes: BranchTreeNode[], indent: number, filter: string): string {
		let html = '';
		for (const node of nodes) {
			if (node.type === 'folder') {
				if (filter !== '' && !node.name.toLowerCase().includes(filter) && !this.treeMatchesFilter(node.children, filter)) continue;
				const collapsed = this.folderCollapsed[node.path] ?? false;
				const icon = collapsed ? SVG_ICONS.closedFolder : SVG_ICONS.openFolder;
				html += '<div class="branchPanelFolder" data-folder="' + escapeHtml(node.path) + '" style="padding-left:' + (4 + indent * 14) + 'px">' +
					'<span class="branchPanelFolderIcon">' + icon + '</span>' +
					'<span class="branchPanelFolderName">' + escapeHtml(node.name) + '</span>' +
					'</div>';
				if (!collapsed) {
					html += this.renderBranchTreeHtml(node.children, indent + 1, filter);
				}
			} else {
				if (filter !== '' && !node.fullName.toLowerCase().includes(filter)) continue;
				html += this.itemHtml(node.idx, node.displayName, this.optionsSelected[node.idx], indent);
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
				const icon = collapsed ? SVG_ICONS.closedFolder : SVG_ICONS.openFolder;
				html += '<div class="branchPanelFolder" data-folder="' + escapeHtml(fkey) + '" style="padding-left:' + (4 + indent * 14) + 'px">' +
					'<span class="branchPanelFolderIcon">' + icon + '</span>' +
					'<span class="branchPanelFolderName">' + escapeHtml(node.name) + '</span>' +
					'</div>';
				if (!collapsed) {
					html += this.renderTagTreeHtml(node.children, indent + 1, filter);
				}
			} else {
				if (filter !== '' && !node.fullName.toLowerCase().includes(filter)) continue;
				const selected = this.tagSelected.has(node.idx);
				html += '<div class="branchPanelItem branchPanelTagItem' + (selected ? ' selected' : '') + '" data-tagid="' + node.idx + '" title="' + escapeHtml(node.fullName) + '" style="padding-left:' + (4 + indent * 14) + 'px">' +
					'<span class="branchPanelCheck">' + (selected ? SVG_ICONS.check : '') + '</span>' +
					'<span class="branchPanelTagIcon">' + SVG_ICONS.tag + '</span>' +
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
			html += this.itemHtml(0, this.options[0].name, this.optionsSelected[0], 0);
		}

		// Glob patterns
		if (globs.length > 0) {
			const visibleGlobs = globs.filter((g) => filter === '' || g.opt.name.toLowerCase().indexOf(filter) > -1);
			if (visibleGlobs.length > 0) {
				html += '<div class="branchPanelSectionHeader" data-section="globs"><span class="branchPanelArrow">&#9660;</span>Glob Patterns</div>';
				for (let i = 0; i < visibleGlobs.length; i++) {
					html += this.itemHtml(visibleGlobs[i].idx, visibleGlobs[i].opt.name, this.optionsSelected[visibleGlobs[i].idx], 1);
				}
			}
		}

		// Local branches (with "/" tree grouping)
		const localTree = this.buildTree(locals.map(l => ({ name: l.opt.name, idx: l.idx })));
		const localTreeVisible = filter === '' || this.treeMatchesFilter(localTree, filter);
		html += '<div class="branchPanelSectionHeader' + (this.localCollapsed ? ' collapsed' : '') + '" data-section="local">' +
			'<span class="branchPanelArrow">' + (this.localCollapsed ? '&#9654;' : '&#9660;') + '</span>' +
			'Local (' + locals.length + ')</div>';
		if (!this.localCollapsed) {
			if (localTreeVisible) {
				html += this.renderBranchTreeHtml(localTree, 1, filter);
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
			const remoteTreeVisible = filter === '' || this.treeMatchesFilter(remoteTree, filter);
			html += '<div class="branchPanelSectionHeader' + (this.remoteCollapsed ? ' collapsed' : '') + '" data-section="remote">' +
				'<span class="branchPanelArrow">' + (this.remoteCollapsed ? '&#9654;' : '&#9660;') + '</span>' +
				'Remote (' + remotes.length + ')</div>';
			if (!this.remoteCollapsed) {
				if (remoteTreeVisible) {
					html += this.renderBranchTreeHtml(remoteTree, 1, filter);
				} else if (filter !== '') {
					html += '<div class="branchPanelNoResults">No matches</div>';
				}
			}
		}

		// Tags (with "/" tree grouping)
		if (this.tagNames.length > 0) {
			const tagTree = this.buildTree(this.tagNames.map((name, i) => ({ name, idx: i })));
			const tagTreeVisible = filter === '' || this.treeMatchesFilter(tagTree, filter);
			if (filter === '' || tagTreeVisible) {
				html += '<div class="branchPanelSectionHeader' + (this.tagsCollapsed ? ' collapsed' : '') + '" data-section="tags">' +
					'<span class="branchPanelArrow">' + (this.tagsCollapsed ? '&#9654;' : '&#9660;') + '</span>' +
					'Tags (' + this.tagNames.length + ')</div>';
				if (!this.tagsCollapsed) {
					if (tagTreeVisible) {
						html += this.renderTagTreeHtml(tagTree, 1, filter);
					} else if (filter !== '') {
						html += '<div class="branchPanelNoResults">No matches</div>';
					}
				}
			}
		}

		this.listElem.innerHTML = html;
	}

	private itemHtml(idx: number, name: string, selected: boolean, indent: number) {
		return '<div class="branchPanelItem' + (selected ? ' selected' : '') + '" data-id="' + idx + '" title="' + escapeHtml(name) + '" style="padding-left:' + (4 + indent * 14) + 'px">' +
			'<span class="branchPanelCheck">' + (selected ? SVG_ICONS.check : '') + '</span>' +
			'<span class="branchPanelItemName">' + escapeHtml(name) + '</span>' +
			'</div>';
	}
}
