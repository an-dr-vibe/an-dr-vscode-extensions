# `src/` — Backend (Node.js)

The extension-host side of Commits: activation, git execution, repo discovery, state
persistence, and the two webviews' panel lifecycle and message handling. Compiles via
`tsc -p ./src` into `out/`. Never imports from `web/` — the two worlds only talk over
the webview `postMessage`/`onmessage` API. See the extension's own `AGENTS.md` for the
full architecture writeup and message-protocol data flows.

## Subfolders

| Folder | Purpose |
|---|---|
| `views/` | The two webviews (`TabView`, `SidebarView`) and the code they share — see `views/README.md` |
| `data-source/` | Parsing/model support modules for `DataSource` (`dataSource.ts`) |
| `repo-manager/` | Support modules for `RepoManager` (`repoManager.ts`) |
| `types/` | All shared TypeScript interfaces, grouped by concern; `types.ts` re-exports the barrel |
| `utils/` | Small standalone utility classes (`Disposable`, `EventEmitter`, `BufferedQueue`) |
| `askpass/` | Git `GIT_ASKPASS` credential-prompt implementation |
| `gitEditor/` | Git `GIT_EDITOR` implementation (used for interactive rebase, commit message editing, etc.) |
| `life-cycle/` | Anonymous install/update/uninstall telemetry ping |

## Top-level files

| File | Purpose |
|---|---|
| `extension.ts` | Activation entry point — registers all commands, wires up every manager |
| `dataSource.ts` | **All git command execution** — spawns git, parses output. Key methods: `getCommits()`, `getBranches()`, `getRefs()`, `getLog()` |
| `repoManager.ts` | Discovers `.git` repos in the workspace, tracks them |
| `commands.ts` | Command Palette / context-menu command handlers (checkout, merge, push, tag, etc.) |
| `config.ts` | Reads VS Code settings into typed config objects |
| `extensionState.ts` | Persists view state across sessions |
| `avatarManager.ts` | Fetches and caches author avatars |
| `editorTabUtils.ts` | Matches existing Commits editor tabs for the explicit-open duplicate safeguard |
| `statusBarItem.ts` | The status bar button that opens the graph — branch/dirty state from `GitStatusMonitor` |
| `gitStatusMonitor.ts` | The active repo/branch/dirty-counts authority — own watcher + `.git/HEAD` read, no vscode.git (ADR-022) |
| `inlineBlame.ts` | Active editor inline blame backed by a cancellable per-document-version incremental blame cache |
| `diffDocProvider.ts` | Virtual document provider for diff views |
| `repoFileWatcher.ts` | Watches `.git` for changes, triggers refresh |
| `logger.ts` | Output channel logging |
| `utils.ts` | General backend utilities (git executable discovery, message boxes, misc helpers) |
| `types.ts` | Public barrel re-exporting everything in `types/` |
