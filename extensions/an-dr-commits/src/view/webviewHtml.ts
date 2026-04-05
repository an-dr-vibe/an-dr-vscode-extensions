import * as vscode from 'vscode';
import { CommitsViewGlobalState, CommitsViewInitialState, CommitsViewWorkspaceState } from '../types';

export interface CommitsWebviewHtmlRenderResult {
	readonly html: string;
	readonly isGraphViewLoaded: boolean;
}

export interface CommitsWebviewHtmlRenderOptions {
	readonly panel: vscode.WebviewPanel;
	readonly nonce: string;
	readonly viewName: string;
	readonly gitExecutableUnknown: boolean;
	readonly initialState: CommitsViewInitialState;
	readonly globalState: CommitsViewGlobalState;
	readonly workspaceState: CommitsViewWorkspaceState;
	readonly unableToFindGitMessage: string;
	readonly mediaCssUri: vscode.Uri;
	readonly mediaJsUri: vscode.Uri;
}

export function renderCommitsWebviewHtml(options: CommitsWebviewHtmlRenderOptions): CommitsWebviewHtmlRenderResult {
	const numRepos = Object.keys(options.initialState.repos).length;
	const graphColours = options.initialState.config.graph.colours;
	let colorVars = '', colorParams = '';
	for (let i = 0; i < graphColours.length; i++) {
		colorVars += '--an-dr-commits-color' + i + ':' + graphColours[i] + '; ';
		colorParams += '[data-color="' + i + '"]{--an-dr-commits-color:var(--an-dr-commits-color' + i + ');} ';
	}

	const body = getBodyHtml(options, numRepos);
	const html = `<!DOCTYPE html>
		<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${standardiseCspSource(options.panel.webview.cspSource)} 'unsafe-inline'; script-src 'nonce-${options.nonce}'; img-src data:;">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link rel="stylesheet" type="text/css" href="${options.mediaCssUri}">
				<title>${options.viewName}</title>
				<style>body{${colorVars}} ${colorParams}</style>
			</head>
			${body}
		</html>`;
	return {
		html: html,
		isGraphViewLoaded: numRepos > 0
	};
}

function getBodyHtml(options: CommitsWebviewHtmlRenderOptions, numRepos: number): string {
	if (options.gitExecutableUnknown) {
		return `<body class="unableToLoad">
			<h2>Unable to load ${options.viewName}</h2>
			<p class="unableToLoadMessage">${options.unableToFindGitMessage}</p>
			</body>`;
	}

	if (numRepos > 0) {
		return `<body>
			<div id="view" tabindex="-1">
				<div id="topBar">
					<div id="sidebarTop">
						<div id="branchPanelFilterHost"></div>
					</div>
					<div id="controls">
						<div id="controlsLeft">
							<div id="sidebarToggleBtn"></div>
							<div id="findWidgetHost"></div>
							<div id="findWidgetToggleBtn" title="Search Graph"></div>
							<span id="repoControl"><span class="unselectable">Repo: </span><div id="repoDropdown" class="dropdown"></div></span>
						</div>
						<div id="controlsBtns">
							<div id="pullBtn"></div>
							<div id="pushBtn"></div>
							<div id="settingsBtn" title="Repository Settings"></div>
							<div id="moreBtn" title="More Actions"></div>
							<div id="topFullDiffBtn" title="Full Diff Panel"></div>
							<div id="filesPanelToggleBtn"></div>
						</div>
					</div>
				</div>
				<div id="sidebar">
					<div id="branchPanel"></div>
				</div>
				<div id="filesPanel"></div>
				<div id="content">
					<div id="repoInProgressBanner">
						<div id="repoInProgressBannerPrimary"></div>
						<div id="repoInProgressBannerSecondary"></div>
					</div>
					<div id="commitGraph"></div>
					<div id="commitTable"></div>
				</div>
				<div id="footer"></div>
			</div>
			<div id="scrollShadow"></div>
			<script nonce="${options.nonce}">var initialState = ${JSON.stringify(options.initialState)}, globalState = ${JSON.stringify(options.globalState)}, workspaceState = ${JSON.stringify(options.workspaceState)};</script>
			<script nonce="${options.nonce}" src="${options.mediaJsUri}"></script>
			</body>`;
	}

	if (options.initialState.repos && Object.keys(options.initialState.repos).length === 0) {
		return `<body class="unableToLoad">
			<h2>Unable to load ${options.viewName}</h2>
			<p class="unableToLoadMessage">No Git repositories were found in the current workspace when it was last scanned by ${options.viewName}.</p>
			<p>If your repositories are in subfolders of the open workspace folder(s), make sure you have set the Commits Setting "an-dr-commits.maxDepthOfRepoSearch" appropriately (read the <a href="https://github.com/mhutchie/vscode-an-dr-commits/wiki/Extension-Settings#max-depth-of-repo-search" target="_blank">documentation</a> for more information).</p>
			<p><div id="rescanForReposBtn" class="roundedBtn">Re-scan the current workspace for repositories</div></p>
			<script nonce="${options.nonce}">(function(){ var api = acquireVsCodeApi(); document.getElementById('rescanForReposBtn').addEventListener('click', function(){ api.postMessage({command: 'rescanForRepos'}); }); })();</script>
			</body>`;
	}
	return '';
}

/**
 * Standardise the CSP Source provided by Visual Studio Code for use with the Webview.
 */
export function standardiseCspSource(cspSource: string): string {
	if (cspSource.startsWith('http://') || cspSource.startsWith('https://')) {
		const pathIndex = cspSource.indexOf('/', 8), queryIndex = cspSource.indexOf('?', 8), fragmentIndex = cspSource.indexOf('#', 8);
		let endOfAuthorityIndex = pathIndex;
		if (queryIndex > -1 && (queryIndex < endOfAuthorityIndex || endOfAuthorityIndex === -1)) endOfAuthorityIndex = queryIndex;
		if (fragmentIndex > -1 && (fragmentIndex < endOfAuthorityIndex || endOfAuthorityIndex === -1)) endOfAuthorityIndex = fragmentIndex;
		return endOfAuthorityIndex > -1 ? cspSource.substring(0, endOfAuthorityIndex) : cspSource;
	} else {
		return cspSource;
	}
}
