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

export const l10n = {
  t: (message: string, ...args: unknown[]) =>
    message.replace(/\{(\d+)\}/g, (_match, index: string) => String(args[Number(index)]))
};
