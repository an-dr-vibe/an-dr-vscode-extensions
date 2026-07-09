# `web/main/`

Support modules for `../main.ts`'s `CommitsView` class. Tab-bundle only — none of
this is visible to the sidebar bundle. Every function takes the `view`/`CommitsView`
instance as its first argument rather than being a method.

| File | Purpose |
|---|---|
| `bootstrap.ts` | `commitsRegisterMessageHandler()` — the incoming-message switch that routes every backend response to the right handler, plus a few response handlers that don't fit elsewhere |
| `constructorInit.ts` | DOM element lookup/caching, dropdown construction, and restoring UI state from the previous webview session |
| `controlsLayout.ts` | Top toolbar button visibility/overflow layout |
| `toolbarButtons.ts` | Individual toolbar button click handlers |
| `committedColumn.ts` | Rendering for the "Committed" table column |
| `tableRender.ts` | Commit table row rendering |
| `diffPreview.ts` | Quick-diff panel rendering and switching |
| `fullDiffPanel.ts` | Full-diff bottom panel rendering |
| `fileTree.ts` | File tree rendering (commit details view and full-diff panel) |
| `repoState.ts` | Resolves per-repo config overrides against global defaults (ordering, show-stashes, reflog inclusion, …) |
| `requestsState.ts` | Read-only accessors over current view state used when building outgoing request messages (branch list/options, remote head targets, commit id lookup) |
| `loadProcessing.ts` | Top-level repo/commit loading orchestration once a `loadRepos`/`loadCommits` response arrives |
| `repoInProgress.ts` | Rendering and actions for the "repo has an operation in progress" banner (merge/rebase/cherry-pick continuation) |
| `avatarVisuals.ts` | Author avatar image/initials rendering |
| `misc.ts` | Small standalone pure helpers (file-list diffing, hash abbreviation, ambiguous repo name disambiguation, repo dropdown options) |
| `actions/` | Click-handler implementations for git actions: `gitActions.ts` (add remote/tag, cleanup branches, …), `pullPushActions.ts` (pull/push flows, including the unstaged-changes recovery dialog), `dragDrop.ts` (drag a commit onto a ref to rebase/merge) |
| `commitDetailsView/` | The expanded commit-details panel: `lifecycle.ts` (load/close/compare), `fileView.ts` (file list click/context-menu handling), `resizable.ts` (drag-to-resize height and divider) |
| `contextMenus/` | Right-click menu action lists per target type: `commitMenu.ts`, `branchMenu.ts`, `remoteTagMenu.ts` (covers remotes, tags, and stashes), `sidebar.ts` (context menus for the tab's own branch/tag sidebar panel — unrelated to the Activity Bar `web/sidebar/`) |
| `observers/` | Passive event wiring: `keyboardEvents.ts` (arrow-key nav, Escape), `urlEvents.ts` (clicking issue/PR links in commit messages), `windowStyle.ts` (window resize, webview style/scroll changes) |
| `table/` | Commit table interaction: `events.ts` (click/double-click/drag/context-menu), `nav.ts` (scroll-to-commit/stash), `resize.ts` (column drag-resize) |
