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
  registerCommand: () => ({ dispose: () => {} }),
  getCommands: (_filterInternal?: boolean) => Promise.resolve([]),
  executeCommand: (_command: string, ..._args: unknown[]) => Promise.resolve(undefined)
};

export const window = {
  showErrorMessage: () => Promise.resolve(undefined)
};
