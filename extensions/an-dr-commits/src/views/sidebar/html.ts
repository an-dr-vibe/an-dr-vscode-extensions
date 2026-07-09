import * as path from 'path';
import * as vscode from 'vscode';
import { codicon, renderActionsRow, renderOpenCommitsButton } from './ui';
import { renderLoadingSplashHtml, renderWebviewMetaTags } from '../common/webviewChrome';
import { SidebarInitialState } from '../../types/sidebar-state';

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

/**
 * Shared <head> markup (CSP/stylesheet/nonce) for both the real panel and the loading splash.
 * out.min.css is the tab's bundle, loaded here too for the shared codicon/gitRef/dropdown rules
 * (see ADR-003); sidebar.min.css carries the sidebar-only rules migrated off activityCss().
 */
function renderHead(webview: any, extensionPath: string, nonce: string): string {
	const cssUri = webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'media', 'out.min.css')));
	const sidebarCssUri = webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'media', 'sidebar.min.css')));
	return `${renderWebviewMetaTags({ cspSource: String(webview.cspSource), nonce })}
<link rel="stylesheet" href="${cssUri}">
<link rel="stylesheet" href="${sidebarCssUri}">`;
}

/**
 * Renders a minimal loading splash - the same spinning codicon the tab already uses for
 * its own per-region loading states (ICONS.loading in web/utils.ts), shown full-panel here.
 * Used only while a full render is pending (first load / repo switch), never for routine
 * data refreshes which patch the existing DOM in place instead.
 */
export function renderLoadingHtml(webview: any, extensionPath: string): string {
	const nonce = Date.now().toString(36);
	return `<!DOCTYPE html>
<html lang="en">
<head>
${renderHead(webview, extensionPath, nonce)}
</head>
<body class="activityChangesBody">
${renderLoadingSplashHtml('activityLoading')}
</body>
</html>`;
}

/**
 * Renders the sidebar's static shell: every element the client-side bundle (web/sidebar/main.ts)
 * needs already present, populated by that bundle from the injected sidebarInitialState rather
 * than server-rendered (see ADR-003). #activityRepo carries its "No Git repository" text
 * directly since it's static; everything else the bundle fills in or shows/hides.
 */
export function renderHtml(webview: any, extensionPath: string, initialState: SidebarInitialState): string {
	const nonce = Date.now().toString(36);
	const sidebarJsUri = webview.asWebviewUri(vscode.Uri.file(path.join(extensionPath, 'media', 'sidebar.min.js')));
	return `<!DOCTYPE html>
<html lang="en">
<head>
${renderHead(webview, extensionPath, nonce)}
</head>
<body class="activityChangesBody">
<div id="activityRepoRow">
	<div id="activityRepo">No Git repository</div>
	<div id="activityRepoDropdown" class="dropdown"></div>
	${renderOpenCommitsButton()}
</div>
${renderActionsRow()}
<div id="activityContent"></div>
<div id="activityFooter">${renderFooter()}</div>
<div id="activityGraphResizeHandle"></div>
<div id="activityGraph"></div>
<script nonce="${nonce}">var sidebarInitialState = ${JSON.stringify(initialState)};</script>
<script nonce="${nonce}" src="${sidebarJsUri}"></script>
</body>
</html>`;
}
