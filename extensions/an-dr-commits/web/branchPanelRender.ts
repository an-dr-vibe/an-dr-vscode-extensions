interface BranchPanelSectionGroups {
	locals: { opt: DropdownOption; idx: number }[];
	remotes: { opt: DropdownOption; idx: number }[];
	globs: { opt: DropdownOption; idx: number }[];
}

function branchPanelIsAutoTagSelected(view: any) {
	return view.tagSelected.size === 0 && view.pendingTagSelectionNames.size === 0;
}

function branchPanelBuildAutoTagItemHtml(view: any, indent: number) {
	return '<div class="branchPanelItem branchPanelAutoTagItem' + (branchPanelIsAutoTagSelected(view) ? ' selected' : '') + '" title="Automatically show tags on the visible graph" style="padding-left:' + (4 + indent * 14) + 'px">' +
		'<span class="branchPanelCheck">' + (branchPanelIsAutoTagSelected(view) ? ICONS.check : '') + '</span>' +
		'<span class="branchPanelItemName">Auto</span>' +
		'</div>';
}

function branchPanelGetEmptyTagMessage() {
	return 'No tags';
}

function branchPanelBuildItemHtml(view: any, idx: number, name: string, selected: boolean, indent: number, title: string) {
	const isDraggableBranch = idx > 0 && !view.options[idx].name.startsWith('Glob: ') && !view.options[idx].value.startsWith('remotes/');
	const hint = typeof view.options[idx].hint === 'string' && view.options[idx].hint !== '' ? view.options[idx].hint : null;
	const hintKind = typeof view.options[idx].hintKind === 'string' ? view.options[idx].hintKind : null;
	const isCurrent = view.options[idx].isCurrent === true;
	const isRemoteDefault = view.options[idx].isRemoteDefault === true;
	const optRemoteDefaultHint = view.options[idx].remoteDefaultHint;
	const remoteDefaultHint = typeof optRemoteDefaultHint === 'string' && optRemoteDefaultHint !== '' ? optRemoteDefaultHint : null;
	const remoteDefaultTitle: string = remoteDefaultHint ?? 'Remote default branch';
	const actionKey = idx > 0 ? view.getActionSelectionKey('branch', view.options[idx].value) : null;
	return '<div class="branchPanelItem' + (selected ? ' selected' : '') + (isCurrent ? ' currentBranch' : '') + '" data-id="' + idx + '"' +
		(actionKey !== null ? ' data-action-key="' + escapeHtml(actionKey) + '"' : '') +
		(isDraggableBranch ? ' data-drag-ref-type="branch" data-drag-ref-name="' + escapeHtml(view.options[idx].value) + '" draggable="true"' : '') +
		' title="' + escapeHtml(title + (hint !== null ? ' ' + hint : '') + (remoteDefaultHint !== null ? ' (' + remoteDefaultHint + ')' : '')) + '" style="padding-left:' + (4 + indent * 14) + 'px">' +
		'<span class="branchPanelCheck">' + (selected ? ICONS.check : '') + '</span>' +
		'<span class="branchPanelItemContent">' +
		'<span class="branchPanelItemName">' + escapeHtml(name) + '</span>' +
		(isCurrent ? '<span class="branchPanelCurrentBadge">HEAD</span>' : '') +
		(isRemoteDefault ? '<span class="branchPanelRemoteDefaultBadge" title="' + escapeHtml(remoteDefaultTitle) + '">default</span>' : '') +
		(hint !== null ? '<span class="branchPanelItemHint' + (hintKind !== null ? ' ' + hintKind : '') + '">' + escapeHtml(hint) + '</span>' : '') +
		'</span>' +
		'</div>';
}

function branchPanelTransformTree(view: any, nodes: BranchTreeNode[], preserveRootFolders: boolean = false, depth: number = 0): BranchTreeNode[] {
	const transformed = nodes.map((node) => branchPanelTransformTreeNode(view, node, preserveRootFolders, depth));
	if (view.groupsFirst) {
		transformed.sort((a, b) => {
			if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
			const aName = a.type === 'folder' ? a.name : a.displayName;
			const bName = b.type === 'folder' ? b.name : b.displayName;
			return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
		});
	}
	return transformed;
}

function branchPanelTransformTreeNode(view: any, node: BranchTreeNode, preserveRootFolders: boolean, depth: number): BranchTreeNode {
	if (node.type === 'leaf') return node;

	const children = branchPanelTransformTree(view, node.children, preserveRootFolders, depth + 1);
	if (view.flattenSingleChildGroups && children.length === 1 && !(preserveRootFolders && depth === 0)) {
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

function branchPanelBuildTree(view: any, items: Array<{ name: string; idx: number }>): BranchTreeNode[] {
	const root: BranchTreeNode[] = [];
	for (const item of items) {
		branchPanelInsertIntoTree(view, root, item.name.split('/'), item.idx, item.name, '');
	}
	return root;
}

function branchPanelInsertIntoTree(view: any, nodes: BranchTreeNode[], parts: string[], idx: number, fullName: string, pathPrefix: string): void {
	const seg = parts[0];
	const path = pathPrefix ? pathPrefix + '/' + seg : seg;
	if (parts.length === 1) {
		nodes.push({ type: 'leaf', displayName: seg, fullName, idx });
		return;
	}
	let folder = nodes.find((n) => n.type === 'folder' && n.name === seg) as BranchTreeFolder | undefined;
	if (!folder) {
		folder = { type: 'folder', name: seg, path, children: [] };
		nodes.push(folder);
	}
	branchPanelInsertIntoTree(view, folder.children, parts.slice(1), idx, fullName, path);
}

function branchPanelTreeMatchesFilter(view: any, nodes: BranchTreeNode[], filter: string): boolean {
	for (const node of nodes) {
		if (node.type === 'folder') {
			if (node.name.toLowerCase().includes(filter)) return true;
			if (branchPanelTreeMatchesFilter(view, node.children, filter)) return true;
		} else if (node.fullName.toLowerCase().includes(filter)) {
			return true;
		}
	}
	return false;
}

function branchPanelRenderBranchTreeHtml(view: any, nodes: BranchTreeNode[], indent: number, filter: string, treeType: 'local' | 'remote' = 'local'): string {
	let html = '';
	for (const node of nodes) {
		if (node.type === 'folder') {
			if (filter !== '' && !node.name.toLowerCase().includes(filter) && !branchPanelTreeMatchesFilter(view, node.children, filter)) continue;
			const collapsed = view.folderCollapsed[node.path] ?? false;
			const icon = collapsed ? BRANCH_PANEL_CLOSED_FOLDER_ICON : BRANCH_PANEL_OPEN_FOLDER_ICON;
			const isRemoteRoot = treeType === 'remote' && indent === 1;
			const remoteUrl = isRemoteRoot && typeof view.remoteUrls === 'object' ? (view.remoteUrls[node.name] ?? null) : null;
			html += '<div class="branchPanelFolder" data-folder="' + escapeHtml(node.path) + '"' +
				(isRemoteRoot ? ' data-entry-type="remote" data-entry-name="' + escapeHtml(node.name) + '"' : '') +
				' style="padding-left:' + (4 + indent * 14) + 'px">' +
				'<span class="branchPanelFolderIcon">' + icon + '</span>' +
				'<span class="branchPanelFolderName">' + escapeHtml(node.name + '/') + '</span>' +
				(remoteUrl !== null ? '<span class="branchPanelFolderUrl" title="' + escapeHtml(remoteUrl) + '">' + escapeHtml(remoteUrl) + '</span>' : '') +
				'</div>';
			if (!collapsed) {
				html += branchPanelRenderBranchTreeHtml(view, node.children, indent + 1, filter, treeType);
			}
			continue;
		}
		if (filter !== '' && !node.fullName.toLowerCase().includes(filter)) continue;
		html += branchPanelBuildItemHtml(view, node.idx, node.displayName, view.optionsSelected[node.idx], indent, node.fullName);
	}
	return html;
}

function branchPanelRenderTagTreeHtml(view: any, nodes: BranchTreeNode[], indent: number, filter: string): string {
	let html = '';
	for (const node of nodes) {
		if (node.type === 'folder') {
			if (filter !== '' && !node.name.toLowerCase().includes(filter) && !branchPanelTreeMatchesFilter(view, node.children, filter)) continue;
			const folderKey = 'tag:' + node.path;
			const collapsed = view.folderCollapsed[folderKey] ?? false;
			const icon = collapsed ? BRANCH_PANEL_CLOSED_FOLDER_ICON : BRANCH_PANEL_OPEN_FOLDER_ICON;
			html += '<div class="branchPanelFolder" data-folder="' + escapeHtml(folderKey) + '" style="padding-left:' + (4 + indent * 14) + 'px">' +
				'<span class="branchPanelFolderIcon">' + icon + '</span>' +
				'<span class="branchPanelFolderName">' + escapeHtml(node.name + '/') + '</span>' +
				'</div>';
			if (!collapsed) {
				html += branchPanelRenderTagTreeHtml(view, node.children, indent + 1, filter);
			}
			continue;
		}
		if (filter !== '' && !node.fullName.toLowerCase().includes(filter)) continue;
		const selected = view.tagSelected.has(node.idx);
		const actionKey = view.getActionSelectionKey('tag', node.fullName);
		html += '<div class="branchPanelItem branchPanelTagItem' + (selected ? ' selected' : '') + '" data-tagid="' + node.idx + '" data-action-key="' + escapeHtml(actionKey) + '" data-drag-ref-type="tag" data-drag-ref-name="' + escapeHtml(node.fullName) + '" draggable="true" title="' + escapeHtml(node.fullName) + '" style="padding-left:' + (4 + indent * 14) + 'px">' +
			'<span class="branchPanelCheck">' + (selected ? ICONS.check : '') + '</span>' +
			'<span class="branchPanelItemName">' + escapeHtml(node.displayName) + '</span>' +
			'</div>';
	}
	return html;
}

function branchPanelMatchesInProgress(value: string, branches: ReadonlyArray<string>): boolean {
	for (let i = 0; i < branches.length; i++) {
		const b = branches[i];
		if (value === b) return true;
		// remote branch stored as 'remotes/origin/main', rebaseContext stores 'origin/main'
		if (value === 'remotes/' + b) return true;
	}
	return false;
}

function branchPanelBuildSectionGroups(view: any): BranchPanelSectionGroups {
	const groups: BranchPanelSectionGroups = { locals: [], remotes: [], globs: [] };
	const inProgressActive = view.inProgressFilterActive && view.inProgressBranches.length > 0;
	for (let i = 1; i < view.options.length; i++) {
		const opt = view.options[i];
		if (opt.value === 'HEAD') continue;
		if (inProgressActive && !branchPanelMatchesInProgress(opt.value, view.inProgressBranches)) continue;
		if (opt.name.startsWith('Glob: ')) {
			groups.globs.push({ opt, idx: i });
		} else if (opt.value.startsWith('remotes/')) {
			groups.remotes.push({ opt, idx: i });
		} else {
			groups.locals.push({ opt, idx: i });
		}
	}
	return groups;
}

function branchPanelRenderSectionHeader(section: string, collapsed: boolean, label: string): string {
	return '<div class="branchPanelSectionHeader' + (collapsed ? ' collapsed' : '') + '" data-section="' + section + '">' +
		'<span class="branchPanelArrow">' + (collapsed ? '&#9654;' : '&#9660;') + '</span>' +
		label +
		'</div>';
}

function branchPanelRenderLocals(view: any, filter: string, locals: { opt: DropdownOption; idx: number }[]): string {
	const localTree = branchPanelTransformTree(view, branchPanelBuildTree(view, locals.map((item) => ({ name: item.opt.name, idx: item.idx }))));
	const localTreeVisible = filter === '' || branchPanelTreeMatchesFilter(view, localTree, filter);
	let html = branchPanelRenderSectionHeader('local', view.localCollapsed, 'Local (' + locals.length + ')');
	if (view.localCollapsed) return html;
	if (localTreeVisible) return html + branchPanelRenderBranchTreeHtml(view, localTree, 1, filter, 'local');
	if (filter !== '') html += '<div class="branchPanelNoResults">No matches</div>';
	return html;
}

function branchPanelRenderRemotes(view: any, filter: string, remotes: { opt: DropdownOption; idx: number }[]): string {
	if (remotes.length === 0) return '';
	const remoteTree = branchPanelBuildTree(view, remotes.map((item) => ({
		name: item.opt.value.startsWith('remotes/') ? item.opt.value.substring(8) : item.opt.name,
		idx: item.idx
	})));
	const transformedRemoteTree = branchPanelTransformTree(view, remoteTree, true);
	const remoteTreeVisible = filter === '' || branchPanelTreeMatchesFilter(view, transformedRemoteTree, filter);
	let html = branchPanelRenderSectionHeader('remote', view.remoteCollapsed, 'Remote (' + remotes.length + ')');
	if (view.remoteCollapsed) return html;
	if (remoteTreeVisible) return html + branchPanelRenderBranchTreeHtml(view, transformedRemoteTree, 1, filter, 'remote');
	if (filter !== '') html += '<div class="branchPanelNoResults">No matches</div>';
	return html;
}

function branchPanelRenderTags(view: any, filter: string): string {
	if (view.tagNames.length === 0) return '';
	const tagTree = branchPanelTransformTree(view, branchPanelBuildTree(view, view.tagNames.map((name: string, i: number) => ({ name, idx: i }))));
	const tagTreeVisible = filter === '' || branchPanelTreeMatchesFilter(view, tagTree, filter);
	let html = '<div class="branchPanelSectionHeader' + (view.tagsCollapsed ? ' collapsed' : '') + '" data-section="tags">' +
		'<span class="branchPanelArrow">' + (view.tagsCollapsed ? '&#9654;' : '&#9660;') + '</span>' +
		'<span class="branchPanelSectionTitle">Tags (' + view.tagNames.length + ')</span>' +
		'</div>';
	if (view.tagsCollapsed) return html;
	html += branchPanelBuildAutoTagItemHtml(view, 1);
	if (tagTreeVisible) return html + branchPanelRenderTagTreeHtml(view, tagTree, 1, filter);
	return html + '<div class="branchPanelNoResults">' + (filter !== '' ? 'No matches' : branchPanelGetEmptyTagMessage()) + '</div>';
}

function branchPanelRender(view: any) {
	if (view.options.length === 0) {
		view.listElem.innerHTML = '';
		view.updateActionSelectionStyles();
		view.updateHintLayout();
		view.scheduleScrollRestore();
		return;
	}

	const filter = view.filterValue;
	const groups = branchPanelBuildSectionGroups(view);
	let html = '';

	if (filter === '' || 'show all'.indexOf(filter) > -1) {
		html += branchPanelBuildItemHtml(view, 0, view.options[0].name, view.optionsSelected[0], 0, view.options[0].name);
	}

	const headIdx = view.options.findIndex((option: DropdownOption) => option.value === 'HEAD');
	if (headIdx > -1 && (filter === '' || 'head'.indexOf(filter) > -1)) {
		html += branchPanelBuildItemHtml(view, headIdx, view.options[headIdx].name, view.optionsSelected[headIdx], 0, view.options[headIdx].name);
	}

	if (groups.globs.length > 0) {
		const visibleGlobs = groups.globs.filter((item) => filter === '' || item.opt.name.toLowerCase().indexOf(filter) > -1);
		if (visibleGlobs.length > 0) {
			html += branchPanelRenderSectionHeader('globs', false, 'Glob Patterns');
			for (const glob of visibleGlobs) {
				html += branchPanelBuildItemHtml(view, glob.idx, glob.opt.name, view.optionsSelected[glob.idx], 1, glob.opt.name);
			}
		}
	}

	html += branchPanelRenderLocals(view, filter, groups.locals);
	html += branchPanelRenderRemotes(view, filter, groups.remotes);
	html += branchPanelRenderTags(view, filter);

	view.listElem.innerHTML = html;
	view.updateActionSelectionStyles();
	view.updateHintLayout();
	view.scheduleScrollRestore();
}
