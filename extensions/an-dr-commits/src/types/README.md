# `src/types/`

All shared TypeScript interfaces for the backend, grouped by concern. `../types.ts`
re-exports every file here as one public barrel — always import from `'../types'`
(or `'../../types'` from `views/*`), never reach into `types/*` directly.

| File | Purpose |
|---|---|
| `base.ts` | Foundational message shapes: `BaseMessage`, `RepoRequest`, `ResponseWithErrorInfo`, `ResponseWithMultiErrorInfo`, `ErrorInfo`, plus small generic type helpers (`DeepReadonly`, `DeepWriteable`, `Writeable`) |
| `git-domain.ts` | Git domain model types shared across requests/responses (`GitCommit`, `GitCommitDetails`, `GitFileChange`, `GitStash`, `GitTagDetails`, `GitConfigLocation`, `GitPushBranchMode`, `GitResetMode`, `GitRepoConfig`, …) |
| `repo-state.ts` | Per-repo persisted state and config types (`GitRepoState`, `GitRepoSet`, `PullRequestConfig`, `CommitsBranchPanelState`) |
| `settings.ts` | Extension-settings-derived types (`CommitOrdering`, `CommitsColumnVisibility`, `TagType`, …) |
| `view-state.ts` | Tab view-state types (`CommitsViewGlobalState`, `CommitsViewWorkspaceState`, `LoadCommitsViewTo`, `GitRepoInProgressState[Type]`) — the `CommitsView` prefix is independent of the `TabView` class name in `../views/tab/` |
| `message-protocol.ts` | The tab's full `Request*`/`Response*` discriminated union (~70 message pairs) plus the `RequestMessage`/`ResponseMessage` union types |
| `protocol.ts` | Re-exports `message-protocol.ts` — kept as a separate file so the barrel's import list reads `./protocol` rather than the longer name |
| `sidebar-state.ts` | The sidebar's initial-state types (`SidebarInitialState`, `SidebarGraphState`, `SidebarMiniGraphInitialState`, `SidebarGraphConfig`) |
| `sidebar-protocol.ts` | The sidebar's own `Request*`/`Response*` discriminated union, independent of the tab's protocol |
