# `src/views/tab/`

The main editor-tab webview. `TabView` (`tabView.ts`) owns the panel lifecycle and
HTML rendering, but the ~70 message handlers live in seven sibling `*Actions.ts`
modules grouped by category — `TabView.respondToMessage`'s switch is a pure dispatch
table delegating into these, rather than one file with every handler inlined.

Each `*Actions.ts` module exports a small `*ActionContext` interface: a facade over
exactly the `TabView` fields/methods that group's handlers need (usually just
`dataSource` + `sendMessage`, occasionally `repoManager`/`extensionState`/mutable
refresh-id state too). `TabView`'s constructor builds one instance of each context
and reuses it for every handler call in that group.

| File | Purpose |
|---|---|
| `tabView.ts` | **Core class `TabView`** — panel lifecycle, HTML rendering, repository watcher, and the `respondToMessage` dispatch switch |
| `webviewHtml.ts` | Tab webview HTML + CSP rendering (`renderCommitsWebviewHtml`) |
| `repoLifecycleActions.ts` | `loadRepos`/`loadRepoInfo`/`loadCommits`/`loadConfig`/`rescanForRepos`/`setRepoState`/`exportRepoConfig`/`setGlobalViewState`/`setWorkspaceViewState`/`setColumnVisibility`/`repoInProgressAction` |
| `branchRemoteActions.ts` | Branch and remote management (checkout/create/delete/rename/push/pull/fetch/merge/rebase/create-PR/…) |
| `tagStashActions.ts` | Tag and stash management (add/delete/push tag; apply/pop/drop/push stash; branch-from-stash) |
| `commitGraphActions.ts` | Per-commit actions (details, compare, checkout, cherry-pick, drop, reword, edit-author, squash, reset-to-commit/head, revert) and the sidebar batch-ref-action helpers |
| `diffFileContentActions.ts` | Diff viewing and file-content/file-management (view/get diff, open file, copy path, create archive, add to `.gitignore`) |
| `workingTreeActions.ts` | Working-tree changes (load/stage/unstage/commit/discard/clean-untracked) |
| `miscActions.ts` | Everything else (user details, extension settings, external URL, error dialog, view-scm, fetch avatar, send-to-code-review) |
| `fileIcons.ts` | Loads file-type icon SVGs from the `an-dr-file-icons` extension for the file tree |

The corresponding frontend code lives in `../../../web/main.ts` + `web/main/*`
(**not** `web/views/tab/` — the two worlds don't mirror each other's folder layout).
Note: the frontend `web/main.ts` class is *also* called `CommitsView`, but it's an
unrelated class in a different compiled world — see `../../../web/main/README.md`.
