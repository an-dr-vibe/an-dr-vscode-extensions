export const workspace = {
  getConfiguration: () => ({ get: (_key: string, def: unknown) => def }),
  workspaceFolders: undefined,
  createFileSystemWatcher: () => ({
    onDidCreate: () => ({ dispose: () => {} }),
    dispose: () => {}
  }),
  onDidChangeWorkspaceFolders: () => ({ dispose: () => {} }),
  onDidChangeConfiguration: () => ({ dispose: () => {} })
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} })
};

export const ProgressLocation = {
  SourceControl: 1,
  Window: 10,
  Notification: 15
};

export const window = {
  showErrorMessage: () => Promise.resolve(undefined),
  showInputBox: () => Promise.resolve(undefined),
  // Runs the task directly; the real implementation only adds a progress UI.
  withProgress: <T>(_options: unknown, task: () => Thenable<T>) => Promise.resolve(task())
};

export const extensions = {
  getExtension: () => undefined
};

export const env = {
  language: "en"
};

export const l10n = {
  t: (message: string, ...args: unknown[]) =>
    message.replace(/\{(\d+)\}/g, (_match, index: string) => String(args[Number(index)]))
};

/**
 * Enough of `vscode.Uri` for code that builds paths and hands them to a
 * webview. `toString()` returns the path so assertions can match on it.
 */
export const Uri = {
  file: (fsPath: string) => ({
    scheme: "file",
    fsPath,
    path: fsPath,
    toString: () => fsPath
  }),
  joinPath: (base: { fsPath: string }, ...parts: string[]) =>
    Uri.file([base.fsPath, ...parts].join("/"))
};

/**
 * A stand-in for the webview a panel owns. `asWebviewUri` mirrors the real
 * one's job — rewriting a local path into a URI the webview may load — using a
 * recognisable scheme so tests can assert the rewrite happened.
 */
export function createWebviewStub(cspSource = "vscode-webview://test") {
  return {
    cspSource,
    asWebviewUri: (uri: { toString(): string }) => ({
      toString: () => `https://file+.vscode-resource/${uri.toString()}`
    }),
    postMessage: () => Promise.resolve(true),
    onDidReceiveMessage: () => ({ dispose: () => {} }),
    html: ""
  };
}
