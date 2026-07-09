import * as vscode from 'vscode';
import { CommitsViewGlobalState, CommitsViewInitialState, CommitsViewWorkspaceState } from '../../types';
import { renderLoadingSplashHtml, renderWebviewMetaTags } from '../common/webviewChrome';

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
				${renderWebviewMetaTags({ cspSource: options.panel.webview.cspSource, nonce: options.nonce, imgSrc: 'data:' })}
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
			${renderLoadingSplashHtml('initialLoadSplash')}
			<div id="view" tabindex="-1">
				<div id="topBar">
					<div id="sidebarTop">
						<div id="branchPanelControls">
							<div id="branchPanelRepoHost">
								<div id="repoDropdown" class="dropdown"></div>
							</div>
						</div>
					</div>
					<div id="controls">
						<div id="controlsRow">
							<div id="controlsLeft">
								<div id="sidebarToggleBtn"></div>
								<div id="searchPanelToggleBtn" title="Search Graph"></div>
							</div>
							<input id="commitFilter" type="text" placeholder="Filter..." autocomplete="off" spellcheck="false"/>
							<div id="controlsBtns">
								<div id="repoRefreshBtn" title="Refresh"></div>
								<div id="sendToReviewBtn" title="Send to Code Review"></div>
								<div id="resetBtn"></div>
								<div id="pullBtn"></div>
								<div id="pushBtn"></div>
								<div id="settingsBtn" title="Repository Settings"></div>
								<div id="moreBtn" title="More Actions"></div>
							</div>
						</div>
						<div id="searchPanel">
							<div id="findWidgetHost"></div>
						</div>
					</div>
				</div>
				<div id="sidebar">
					<div id="branchPanelFilterHost"></div>
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
