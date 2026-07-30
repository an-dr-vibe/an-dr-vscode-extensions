import * as path from "node:path";

import { getWebviewLocalizedStrings } from "@/extension/l10n/webviewL10n";
import { buildWebviewHtml, WebviewHtmlConfig } from "@/extension/webviewHtml";
import type * as GG from "@/types";

/**
 * Presents a view state as the configuration the HTML builder reads, so a test
 * declares its scenario once. Widening `WebviewHtmlConfig` breaks this
 * function, which is the intended signal that the new setting needs a value.
 */
function viewStateConfig(viewState: GG.GitGraphViewState): WebviewHtmlConfig {
  return {
    autoCenterCommitDetailsView: () => viewState.autoCenterCommitDetailsView,
    avatarMode: () => viewState.avatarMode,
    avatarShape: () => viewState.avatarShape,
    avatarSize: () => viewState.avatarSize,
    columnVisibility: () => viewState.columnVisibility,
    committedVisual: () => viewState.committedVisual,
    dateFormat: () => viewState.dateFormat,
    fetchAvatars: () => viewState.fetchAvatars,
    graphColours: () => viewState.graphColours,
    graphStyle: () => viewState.graphStyle,
    initialLoadCommits: () => viewState.initialLoadCommits,
    loadMoreCommits: () => viewState.loadMoreCommits,
    showCurrentBranchByDefault: () => viewState.showCurrentBranchByDefault,
    refreshShortcutKey: () => viewState.refreshShortcutKey,
    uiDensity: () => viewState.uiDensity
  };
}

export function createVscodeMock() {
  const sent: GG.RequestMessage[] = [];
  let state: WebViewState | null = null;

  const mock = {
    postMessage: (msg: GG.RequestMessage) => sent.push(msg),
    getState: () => state,
    setState: (s: WebViewState) => {
      state = s;
    }
  };

  global.acquireVsCodeApi = () => mock;

  return {
    sentMessages: sent,
    clearMessages: () => sent.splice(0),
    getState: () => state
  };
}

/**
 * Builds the panel body with the real `buildWebviewHtml`, so the DOM a webview
 * test runs against is the DOM the extension actually ships. A hand-copied
 * duplicate would let markup the webview depends on drift out of the builder
 * without any test noticing.
 */
export function setupHtml(viewState: GG.GitGraphViewState) {
  const { html } = buildWebviewHtml({
    webview: {
      asWebviewUri: (uri: { toString(): string }) => uri,
      cspSource: "vscode-webview:"
    } as never,
    config: viewStateConfig(viewState),
    extensionPath: path.resolve(__dirname, "../.."),
    extensionState: {
      getLastActiveRepo: () => viewState.lastActiveRepo,
      isAvatarStorageAvailable: () => true
    },
    repoManager: { getRepos: () => viewState.repos }
  });

  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html);
  if (body === null) {
    throw new Error("buildWebviewHtml produced no body");
  }
  // The real scripts are loaded by the test itself via `import`, so strip the
  // tags rather than let jsdom try to fetch them.
  document.body.innerHTML = body[1].replace(/<script[\s\S]*?<\/script>/g, "");

  (global as unknown as { viewState: GG.GitGraphViewState }).viewState = viewState;
  global["l10n"] = getWebviewLocalizedStrings();
}

export function receive(msg: GG.ResponseMessage) {
  window.dispatchEvent(new MessageEvent("message", { data: msg }));
}
