import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from '../config';
import { GitWorkingTreeChange } from '../dataSource';
import { ErrorInfo } from '../types';
import { MiniGraphData, renderMiniGraph } from './miniGraph';
import { activityCss } from './css';
import { activityScript } from './script';
import { normalizePath } from './gitUtils';
import { codicon, esc, renderRefreshButton, renderRepoSelector } from './ui';

type CpTreeFolder = {
	folders: { [name: string]: CpTreeFolder };
	files: GitWorkingTreeChange[];
};

function basename(p: string) {
	return normalizePath(p).split('/').pop() || p;
}

function statusTitle(status: GitWorkingTreeChange['status']) {
	return status === 'U' ? 'Untracked' : status === 'A' ? 'Added' : status === 'D' ? 'Deleted' : status === 'R' ? 'Renamed' : 'Modified';
}

function renderAddDel(f: GitWorkingTreeChange): string {
	if (f.additions === null || f.deletions === null) return '';
	return '<span class="fileTreeFileAddDel cpFileAddDel">(<span class="fileTreeFileAdd" title="' + f.additions + ' addition' + (f.additions !== 1 ? 's' : '') + '">+' + f.additions + '</span>|<span class="fileTreeFileDel" title="' + f.deletions + ' deletion' + (f.deletions !== 1 ? 's' : '') + '">-' + f.deletions + '</span>)</span>';
}

function renderFileRow(f: GitWorkingTreeChange, isStaged: boolean): string {
	const name = esc(basename(f.path));
	const encodedPath = esc(f.path);
	const stageTitle = isStaged ? 'Unstage file' : 'Stage file';
	const stageAction = isStaged ? 'unstage' : 'stage';
	const stageIcon = isStaged ? codicon('remove') : codicon('add');
	const changeTypeMessage = statusTitle(f.status) + (f.oldPath ? ' (' + esc(f.oldPath) + ' -> ' + encodedPath + ')' : '');
	return `<div class="cpFile fileTreeFileRecord" data-path="${encodedPath}" data-status="${f.status}" data-staged="${isStaged}">` +
		`<span class="fileTreeFile gitDiffPossible" title="Click to View Diff - ${changeTypeMessage}">` +
		`<span class="fileTreeFileIcon">${codicon('file', 'fileTreeCodicon fileIcon')}</span>` +
		`<span class="gitFileName ${f.status}" title="${encodedPath + (f.oldPath ? ' <- ' + esc(f.oldPath) : '')}">${name}</span>` +
		`</span>` +
		(getConfig().enhancedAccessibility ? `<span class="fileTreeFileType" title="${changeTypeMessage}">${f.status}</span>` : '') +
		renderAddDel(f) +
		`<span class="cpFileActions">` +
		(isStaged
			? `<button class="cpFileBtn" data-action="${stageAction}" data-path="${encodedPath}" title="${stageTitle}">${stageIcon}</button>`
			: `<button class="cpFileBtn" data-action="${stageAction}" data-path="${encodedPath}" title="${stageTitle}">${stageIcon}</button>` +
			  `<button class="cpFileBtn" data-action="discard" data-path="${encodedPath}" data-untracked="${f.status === 'U'}" title="Discard changes">${codicon('discard')}</button>`
		) +
		`</span>` +
		`</div>`;
}

function buildTree(files: GitWorkingTreeChange[]): CpTreeFolder {
	const root: CpTreeFolder = { folders: {}, files: [] };
	files.forEach((file) => {
		const parts = normalizePath(file.path).split('/');
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

function renderTree(folder: CpTreeFolder, isStaged: boolean, topLevel: boolean = true): string {
	const folderNames = Object.keys(folder.folders).sort((a, b) => a.localeCompare(b));
	const files = folder.files.slice().sort((a, b) => basename(a.path).localeCompare(basename(b.path)));
	const children = folderNames.map((name) =>
		`<li data-pathseg="${encodeURIComponent(name)}"><span class="fileTreeFolder cpTreeFolder">` +
		`<span class="fileTreeFolderIcon">${codicon('folder-opened', 'fileTreeCodicon openFolderIcon')}</span><span class="gitFolderName">${esc(name)}</span></span>` +
		renderTree(folder.folders[name], isStaged, false) +
		`</li>`
	).concat(files.map((file) => `<li data-pathseg="${encodeURIComponent(basename(file.path))}">${renderFileRow(file, isStaged)}</li>`));
	return `<ul class="fileTreeFolderContents${topLevel ? ' cpSectionFiles' : ''}">${children.join('')}</ul>`;
}

function renderSection(title: string, files: GitWorkingTreeChange[], isStaged: boolean) {
	if (files.length === 0) return '';
	const stageAllAction = isStaged ? 'unstageAll' : 'stageAll';
	const stageAllTitle = isStaged ? 'Unstage all' : 'Stage all';
	const stageAllIcon = isStaged ? codicon('remove') : codicon('add');
	return `<div class="cpSection" data-staged="${isStaged}">` +
		`<div class="cpSectionHeader fileTreeFolder">` +
		`<span class="cpSectionArrow fileTreeFolderIcon">${codicon('folder-opened', 'fileTreeCodicon openFolderIcon')}</span>` +
		`<span class="cpSectionTitle gitFolderName">${esc(title)}</span>` +
		`<span class="cpSectionCount">${files.length}</span>` +
		`<button class="cpFileBtn cpSectionBtn" data-action="${stageAllAction}" title="${stageAllTitle}">${stageAllIcon}</button>` +
		`</div>` +
		renderTree(buildTree(files), isStaged) +
		`</div>`;
}

function renderContent(changes: GitWorkingTreeChange[]) {
	const staged = changes.filter((c) => c.staged);
	const unstaged = changes.filter((c) => !c.staged && c.status !== 'U');
	const untracked = changes.filter((c) => c.status === 'U');
	const allUnstaged = [...unstaged, ...untracked];
	if (changes.length === 0) {
		return '<div class="cpPlaceholder">No uncommitted changes.</div>';
	}
	return renderSection('Staged Changes', staged, true) +
		renderSection('Changes', allUnstaged, false);
}

/**
 * Renders the inner HTML of #activityContent - shared by the full-page render
 * and the incremental data-update path, so both stay in sync by construction.
 */
export function renderContentHtml(changes: GitWorkingTreeChange[], error: ErrorInfo): string {
	return error !== null ? '<div class="cpError">' + esc(error) + '</div>' : renderContent(changes);
}

function renderFooter() {
	return `<div id="cpFooter">` +
		`<textarea id="cpMessage" placeholder="Message (Ctrl+Enter to commit)" rows="3"></textarea>` +
		`<div id="cpCommitRow">` +
		`<button id="cpCommitBtn" disabled>${codicon('check')}&nbsp;Commit</button>` +
		`<button id="cpCommitArrow" disabled title="More commit options">&#9660;</button>` +
		`<div id="cpCommitMenu" class="hidden">` +
		`<button id="cpAmendBtn">Amend Previous Commit</button>` +
		`</div>` +
		`</div>` +
		`</div>`;
}

export function renderHtml(
	webview: any,
	extensionPath: string,
	repo: string | null,
	changes: GitWorkingTreeChange[],
	error: ErrorInfo,
	repoPaths: string[] = [],
	miniGraph: MiniGraphData | null = null,
	graphHeight: number = 120
): string {
	const nonce = Date.now().toString(36);
	const cssUri = webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'media', 'out.min.css')));
	const cspSource = String(webview.cspSource).replace(/\/$/g, '');
	const repoSelector = renderRepoSelector(repo, repoPaths);
	const graphHtml = renderMiniGraph(miniGraph);
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${cssUri}">
<style>${activityCss()}</style>
</head>
<body class="activityChangesBody" style="--activity-graph-height:${graphHeight}px">
<div id="activityTop">
	<button id="activityOpenCommits" class="activityPrimaryBtn">${codicon('git-commit')}<span>Open Commits</span></button>
</div>
<div id="activityRepoRow">
	${repoSelector}
	${renderRefreshButton()}
</div>
<div id="activityContent">${renderContentHtml(changes, error)}</div>
<div id="activityFooter">${renderFooter()}</div>
${graphHtml !== '' ? '<div id="activityGraphResizeHandle"></div>' : ''}
${graphHtml}
<script nonce="${nonce}">${activityScript()}</script>
</body>
</html>`;
}
