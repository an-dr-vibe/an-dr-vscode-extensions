import * as vscode from "vscode";

import { getNonce } from "@/backend/utils/nonce";
import { buildExtensionUri } from "@/backend/utils/path";
import { Config } from "@/config";
import { ExtensionState } from "@/extensionState";
import { GitGraphViewState } from "@/types";

import { EXTENSION_NAME } from "./constant/const";
import { loadFileIcons } from "./fileIcons";
import { getWebviewLocalizedStrings } from "./l10n/webviewL10n";
import { RepoManager } from "./repoManager";

/**
 * Safely escape JSON for embedding in HTML script tags.
 * Prevents XSS by escaping characters that could break out of script context.
 */
function escapeJsonForHtml(obj: object): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

/**
 * Exactly the configuration this module reads.
 *
 * Declared narrowly rather than taking the whole `Config` so a test can supply
 * a matching object with no type assertion. Reading a new setting here means
 * widening this type, which then fails any caller that has not supplied it —
 * the compile-time check a cast would have thrown away.
 */
export type WebviewHtmlConfig = Pick<
  Config,
  | "autoCenterCommitDetailsView"
  | "avatarMode"
  | "avatarShape"
  | "avatarSize"
  | "columnVisibility"
  | "committedVisual"
  | "dateFormat"
  | "fetchAvatars"
  | "graphColours"
  | "graphStyle"
  | "initialLoadCommits"
  | "loadMoreCommits"
  | "showCurrentBranchByDefault"
  | "refreshShortcutKey"
  | "uiDensity"
  | "branchPanelGroupsFirst"
  | "branchPanelFlattenSingleChildGroups"
  | "confirmAbortRepoInProgress"
>;

/** The extension state this module reads. */
export type WebviewHtmlState = Pick<
  ExtensionState,
  "getLastActiveRepo" | "isAvatarStorageAvailable"
>;

/** The repository lookup this module reads. */
export type WebviewHtmlRepos = Pick<RepoManager, "getRepos">;

export function buildWebviewHtml(opts: {
  webview: vscode.Webview;
  config: WebviewHtmlConfig;
  extensionPath: string;
  extensionState: WebviewHtmlState;
  repoManager: WebviewHtmlRepos;
}): { html: string; isGraphLoaded: boolean } {
  const { webview, config, extensionPath, extensionState, repoManager } = opts;
  const nonce = getNonce();
  const l10nStrings = getWebviewLocalizedStrings();
  const viewState: GitGraphViewState = {
    autoCenterCommitDetailsView: config.autoCenterCommitDetailsView(),
    committedVisual: config.committedVisual(),
    avatarMode: config.avatarMode(),
    avatarSize: config.avatarSize(),
    avatarShape: config.avatarShape(),
    dateFormat: config.dateFormat(),
    fetchAvatars: config.fetchAvatars() && extensionState.isAvatarStorageAvailable(),
    fileIcons: loadFileIcons(),
    uiDensity: config.uiDensity(),
    refreshShortcutKey: config.refreshShortcutKey(),
    branchPanelGroupsFirst: config.branchPanelGroupsFirst(),
    branchPanelFlattenSingleChildGroups: config.branchPanelFlattenSingleChildGroups(),
    confirmAbortRepoInProgress: config.confirmAbortRepoInProgress(),
    columnVisibility: config.columnVisibility(),
    graphColours: config.graphColours(),
    graphStyle: config.graphStyle(),
    initialLoadCommits: config.initialLoadCommits(),
    lastActiveRepo: extensionState.getLastActiveRepo(),
    loadMoreCommits: config.loadMoreCommits(),
    locale: vscode.env.language,
    repos: repoManager.getRepos(),
    showCurrentBranchByDefault: config.showCurrentBranchByDefault()
  };

  const numRepos = Object.keys(viewState.repos).length;
  let colorVars = "",
    colorParams = "";
  for (let i = 0; i < viewState.graphColours.length; i++) {
    colorVars += "--git-graph-color" + i + ":" + viewState.graphColours[i] + "; ";
    colorParams += '[data-color="' + i + '"]{--git-graph-color:var(--git-graph-color' + i + ");} ";
  }

  const mediaUri = (file: string) =>
    webview.asWebviewUri(buildExtensionUri(extensionPath, "media", file));
  const compiledOutputUri = (file: string) =>
    webview.asWebviewUri(buildExtensionUri(extensionPath, "out", file));

  let body: string;
  if (numRepos > 0) {
    body = `<body style="${colorVars}">
		<div id="controls">
			<div id="branchPanelToggle" class="roundedBtn" title="${vscode.l10n.t("Toggle Branch Panel")}"></div>
			<span id="repoControl"><span class="unselectable">${vscode.l10n.t("Repo")}: </span><div id="repoSelect" class="dropdown"></div></span>
			<span id="branchControl"><span class="unselectable">${vscode.l10n.t("Branch")}: </span><div id="branchSelect" class="dropdown"></div></span>
			<label id="showRemoteBranchesControl"><input type="checkbox" id="showRemoteBranchesCheckbox" value="1" checked>${vscode.l10n.t("Show Remote Branches")}</label>
			<span id="commitFilterControl"><input id="commitFilter" type="search" spellcheck="false" placeholder="${vscode.l10n.t("Filter commits...")}" title="${vscode.l10n.t("Filter by message, author, email, or hash")}"></span>
			<span id="controlsBtns">
				<div id="findBtn" class="roundedBtn" title="${vscode.l10n.t("Find Commits")}">${vscode.l10n.t("Find")}</div>
				<div id="fetchBtn" class="roundedBtn" title="${vscode.l10n.t("Fetch from Remote(s)")}">${vscode.l10n.t("Fetch")}</div>
				<div id="pullBtn" class="roundedBtn" title="${vscode.l10n.t("Pull Current Branch")}">${vscode.l10n.t("Pull")}</div>
				<div id="pushBtn" class="roundedBtn" title="${vscode.l10n.t("Push Current Branch")}">${vscode.l10n.t("Push")}</div>
				<div id="refreshBtn" class="roundedBtn">${vscode.l10n.t("Refresh")}</div>
			</span>
		</div>
		<div id="findWidget" aria-hidden="true">
			<input id="findInput" type="search" spellcheck="false" placeholder="${vscode.l10n.t("Find commits...")}">
			<span id="findMatchCount" aria-live="polite"></span>
			<button id="findPreviousBtn" title="${vscode.l10n.t("Previous Match")}" aria-label="${vscode.l10n.t("Previous Match")}">↑</button>
			<button id="findNextBtn" title="${vscode.l10n.t("Next Match")}" aria-label="${vscode.l10n.t("Next Match")}">↓</button>
			<button id="findCloseBtn" title="${vscode.l10n.t("Close")}" aria-label="${vscode.l10n.t("Close")}">×</button>
		</div>
		<aside id="branchPanelSidebar">
			<div id="branchPanel"></div>
			<div id="branchPanelResizeHandle"></div>
		</aside>
		<div id="repoInProgressBanner"></div>
		<div id="content">
			<div id="commitGraph"></div>
			<div id="commitTable"></div>
		</div>
		<div id="filesPanel"></div>
		<div id="fullDiffPanel">
			<div id="fullDiffResizeHandle"></div>
			<div id="fullDiffHeader">
				<span id="fullDiffFilename"></span>
				<span id="fullDiffControls">
					<button id="fullDiffMode-unified" title="${vscode.l10n.t("Unified full file view")}">${vscode.l10n.t("Unified")}</button>
					<button id="fullDiffMode-sideBySide" title="${vscode.l10n.t("Side by side full file view")}">${vscode.l10n.t("Split")}</button>
					<button id="fullDiffMode-raw" title="${vscode.l10n.t("Raw git diff output")}">${vscode.l10n.t("Raw")}</button>
					<button id="fullDiffCompactBtn" title="${vscode.l10n.t("Fold long runs of unchanged lines")}">${vscode.l10n.t("Compact")}</button>
					<button id="fullDiffPrevChangeBtn" title="${vscode.l10n.t("Previous Change")}" aria-label="${vscode.l10n.t("Previous Change")}">▲</button>
					<span id="fullDiffChangeCounter" aria-live="polite"></span>
					<button id="fullDiffNextChangeBtn" title="${vscode.l10n.t("Next Change")}" aria-label="${vscode.l10n.t("Next Change")}">▼</button>
				</span>
				<button id="fullDiffCloseBtn" title="${vscode.l10n.t("Close")}" aria-label="${vscode.l10n.t("Close")}">×</button>
			</div>
			<div id="fullDiffContent"></div>
		</div>
		<div id="footer"></div>
		<ul id="contextMenu"></ul>
		<div id="dialogBacking"></div>
		<div id="dialog"></div>
		<div id="scrollShadow"></div>
		<script nonce="${nonce}">var viewState = ${escapeJsonForHtml(viewState)};</script>
		<script nonce="${nonce}">var l10n = ${escapeJsonForHtml(l10nStrings)};</script>
		<script src="${compiledOutputUri("web.min.js")}"></script>
		</body>`;
  } else {
    body = `<body class="unableToLoad" style="${colorVars}">
		<h2>${vscode.l10n.t("Unable to load Git Graph")}</h2>
		<p>${vscode.l10n.t("Either the current workspace does not contain a Git repository, or the Git repository is not configured correctly.")}</p>
		<p>${vscode.l10n.t('If you are using a portable Git installation, make sure you have set the Visual Studio Code Setting "git.path" to the path of your portable installation (e.g. "C:\\Program Files\\Git\\bin\\git.exe" on Windows).')}</p>
		</body>`;
  }

  const html = `<!DOCTYPE html>
	<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; img-src data:;">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<link rel="stylesheet" type="text/css" href="${mediaUri("main.css")}">
			<link rel="stylesheet" type="text/css" href="${mediaUri("dropdown.css")}">
			<title>${EXTENSION_NAME}</title>
			<style>${colorParams}"</style>
		</head>
		${body}
	</html>`;

  return { html, isGraphLoaded: numRepos > 0 };
}
