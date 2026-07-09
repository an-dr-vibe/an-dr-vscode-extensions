/**
 * Working-tree changes tree rendering - the client-side port of
 * src/views/sidebar/html.ts's content-rendering functions (renderFileRow, buildTree,
 * renderTree, renderSection, renderContent, renderContentHtml). Pure presentational functions;
 * SidebarView (main.ts) owns fetching the data and wiring interactions against the HTML these
 * produce.
 */

type SidebarTreeFolder = {
	folders: { [name: string]: SidebarTreeFolder };
	files: GG.GitWorkingTreeChangeMsg[];
};

function sidebarStatusTitle(status: GG.GitWorkingTreeChangeMsg['status']): string {
	return status === 'U' ? 'Untracked' : status === 'A' ? 'Added' : status === 'D' ? 'Deleted' : status === 'R' ? 'Renamed' : 'Modified';
}

function sidebarRenderAddDel(f: GG.GitWorkingTreeChangeMsg): string {
	if (f.additions === null || f.deletions === null) return '';
	return '<span class="fileTreeFileAddDel cpFileAddDel">(<span class="fileTreeFileAdd" title="' + f.additions + ' addition' + (f.additions !== 1 ? 's' : '') + '">+' + f.additions + '</span>|<span class="fileTreeFileDel" title="' + f.deletions + ' deletion' + (f.deletions !== 1 ? 's' : '') + '">-' + f.deletions + '</span>)</span>';
}

function sidebarRenderFileRow(f: GG.GitWorkingTreeChangeMsg, isStaged: boolean, enhancedAccessibility: boolean): string {
	const name = escapeHtml(sidebarBasename(f.path));
	const encodedPath = escapeHtml(f.path);
	const stageTitle = isStaged ? 'Unstage file' : 'Stage file';
	const stageAction = isStaged ? 'unstage' : 'stage';
	const stageIcon = isStaged ? codicon('remove') : codicon('add');
	const changeTypeMessage = sidebarStatusTitle(f.status) + (f.oldPath ? ' (' + escapeHtml(f.oldPath) + ' -> ' + encodedPath + ')' : '');
	return `<div class="cpFile fileTreeFileRecord" data-path="${encodedPath}" data-status="${f.status}" data-staged="${isStaged}">` +
		`<span class="fileTreeFile gitDiffPossible" title="Click to View Diff - ${changeTypeMessage}">` +
		`<span class="fileTreeFileIcon">${codicon('file', 'fileTreeCodicon fileIcon')}</span>` +
		`<span class="gitFileName ${f.status}" title="${encodedPath + (f.oldPath ? ' <- ' + escapeHtml(f.oldPath) : '')}">${name}</span>` +
		`</span>` +
		(enhancedAccessibility ? `<span class="fileTreeFileType" title="${changeTypeMessage}">${f.status}</span>` : '') +
		sidebarRenderAddDel(f) +
		`<span class="cpFileActions">` +
		(isStaged
			? `<button class="cpFileBtn" data-action="${stageAction}" data-path="${encodedPath}" title="${stageTitle}">${stageIcon}</button>`
			: `<button class="cpFileBtn" data-action="${stageAction}" data-path="${encodedPath}" title="${stageTitle}">${stageIcon}</button>` +
			  `<button class="cpFileBtn" data-action="discard" data-path="${encodedPath}" data-untracked="${f.status === 'U'}" title="Discard changes">${codicon('discard')}</button>`
		) +
		`</span>` +
		`</div>`;
}

function sidebarBuildTree(files: ReadonlyArray<GG.GitWorkingTreeChangeMsg>): SidebarTreeFolder {
	const root: SidebarTreeFolder = { folders: {}, files: [] };
	files.forEach((file) => {
		const parts = file.path.replace(/\\/g, '/').split('/');
		const fileName = parts.pop();
		if (!fileName) return;
		let cur = root;
		parts.forEach((part) => {
			if (!cur.folders[part]) cur.folders[part] = { folders: {}, files: [] };
			cur = cur.folders[part];
		});
		cur.files.push(file);
	});
	return root;
}

function sidebarRenderTree(folder: SidebarTreeFolder, isStaged: boolean, enhancedAccessibility: boolean, topLevel: boolean = true): string {
	const folderNames = Object.keys(folder.folders).sort((a, b) => a.localeCompare(b));
	const files = folder.files.slice().sort((a, b) => sidebarBasename(a.path).localeCompare(sidebarBasename(b.path)));
	const children = folderNames.map((name) =>
		`<li data-pathseg="${encodeURIComponent(name)}"><span class="fileTreeFolder cpTreeFolder">` +
		`<span class="fileTreeFolderIcon">${codicon('folder-opened', 'fileTreeCodicon openFolderIcon')}</span><span class="gitFolderName">${escapeHtml(name)}</span></span>` +
		sidebarRenderTree(folder.folders[name], isStaged, enhancedAccessibility, false) +
		`</li>`
	).concat(files.map((file) => `<li data-pathseg="${encodeURIComponent(sidebarBasename(file.path))}">${sidebarRenderFileRow(file, isStaged, enhancedAccessibility)}</li>`));
	return `<ul class="fileTreeFolderContents${topLevel ? ' cpSectionFiles' : ''}">${children.join('')}</ul>`;
}

function sidebarRenderSection(title: string, files: ReadonlyArray<GG.GitWorkingTreeChangeMsg>, isStaged: boolean, enhancedAccessibility: boolean): string {
	if (files.length === 0) return '';
	const stageAllAction = isStaged ? 'unstageAll' : 'stageAll';
	const stageAllTitle = isStaged ? 'Unstage all' : 'Stage all';
	const stageAllIcon = isStaged ? codicon('remove') : codicon('add');
	return `<div class="cpSection" data-staged="${isStaged}">` +
		`<div class="cpSectionHeader fileTreeFolder">` +
		`<span class="cpSectionArrow fileTreeFolderIcon">${codicon('folder-opened', 'fileTreeCodicon openFolderIcon')}</span>` +
		`<span class="cpSectionTitle gitFolderName">${escapeHtml(title)}</span>` +
		`<span class="cpSectionCount">${files.length}</span>` +
		`<button class="cpFileBtn cpSectionBtn" data-action="${stageAllAction}" title="${stageAllTitle}">${stageAllIcon}</button>` +
		`</div>` +
		sidebarRenderTree(sidebarBuildTree(files), isStaged, enhancedAccessibility) +
		`</div>`;
}

function sidebarRenderContent(changes: ReadonlyArray<GG.GitWorkingTreeChangeMsg>, enhancedAccessibility: boolean): string {
	const staged = changes.filter((c) => c.staged);
	const unstaged = changes.filter((c) => !c.staged && c.status !== 'U');
	const untracked = changes.filter((c) => c.status === 'U');
	const allUnstaged = [...unstaged, ...untracked];
	if (changes.length === 0) {
		return '<div class="cpPlaceholder">No uncommitted changes.</div>';
	}
	return sidebarRenderSection('Staged Changes', staged, true, enhancedAccessibility) +
		sidebarRenderSection('Changes', allUnstaged, false, enhancedAccessibility);
}

/** Renders the inner HTML of #activityContent. */
function sidebarRenderContentHtml(changes: ReadonlyArray<GG.GitWorkingTreeChangeMsg>, error: GG.ErrorInfo, enhancedAccessibility: boolean): string {
	return error !== null ? '<div class="cpError">' + escapeHtml(error) + '</div>' : sidebarRenderContent(changes, enhancedAccessibility);
}
