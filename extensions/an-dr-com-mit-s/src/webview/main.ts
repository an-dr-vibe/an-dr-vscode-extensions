import { startCommitsView } from "@an-dr/commits-core/webview/main";
import { setWebviewHost } from "@an-dr/commits-core/webview/utils/host";

/**
 * The VS Code entry point for the webview bundle.
 *
 * It installs the host transport and then starts the view, which is why the
 * core exports a start function rather than building itself on import: a
 * different host installs a different transport before the same call.
 */
const api = acquireVsCodeApi();

setWebviewHost({
  postMessage: (message) => api.postMessage(message),
  getState: () => api.getState(),
  setState: (state) => api.setState(state),
  getStyleValue: (name) => document.documentElement.style.getPropertyValue(name)
});

startCommitsView();
