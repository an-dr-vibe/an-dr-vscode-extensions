# ADR-005: Starred/favorite repositories in the repo dropdown

## Problem

Users with many repositories in the Commits repo dropdown (both the tab's top
control bar dropdown and the Activity Bar sidebar's repo selector) want to pin
their most-used repositories to the top instead of scrolling/filtering every
time. The two dropdowns already keep repo *selection* in sync with each other
(`views/common/repoSelection.ts`), so a starred/favorite flag that only worked
in one of the two dropdowns would break that same DRY expectation - and per
user direction in this iteration, they must behave consistently.

## Decision

1. **Storage**: add `starred: boolean` to `GitRepoState` (`src/types/repo-state.ts`),
   defaulting to `false` in `DEFAULT_REPO_STATE`. This persists through the
   existing `RepoManager`/`ExtensionState` workspace-state mechanism
   (`REPO_STATES` key) - per-workspace, local to this machine (never registered
   for Settings Sync), matching how every other per-repo setting already works.
2. **Write path**: `RepoManager.setRepoStarred(repoPath, starred)` looks up the
   known repo key (falling back to a case-insensitive match on Windows, since
   the sidebar's repo paths come from the native VS Code Git API rather than
   `RepoManager`'s own key strings), updates state, persists, and - unlike the
   existing generic `setRepoState` - calls `sendRepos()` so every subscriber
   (tab and sidebar) picks up the change immediately, even if only one of the
   two views is the one that changed it.
   - Tab: new `RequestSetRepoStarred` message (`src/types/message-protocol.ts`),
     handled in `views/tab/repoLifecycleActions.ts`, dispatched from
     `TabView.respondToMessage`. Fire-and-forget, mirroring `setRepoState`.
   - Sidebar: new `SidebarRequestSetRepoStarred` message
     (`src/types/sidebar-protocol.ts`), handled in `SidebarView._handleMessage`.
     `SidebarView` gains a `RepoManager` dependency (it previously had none) and
     subscribes to `RepoManager.onDidChangeRepos` to refresh when starring
     happens from the tab.
3. **Read/sort path**: `getSortedRepositoryPaths` (duplicated in
   `src/utils.ts` and `web/utils.ts`, per this codebase's no-shared-code-between-
   worlds convention) sorts starred repos first, then applies the existing
   `repoDropdownOrder` tie-break within each group. The sidebar's repo list
   (which does not use `repoDropdownOrder` at all today - a pre-existing gap,
   left untouched) gets a lighter starred-first stable partition over its
   native VS Code Git API order.
4. **UI**: `web/common/dropdown.ts`'s shared `Dropdown` class (already used by
   both the tab and sidebar repo dropdowns) renders a clickable star icon on
   each row, to the left of the name (the only side not already used by
   `showInfo`/multi-select for these two dropdowns). Clicking it toggles
   starred without selecting/switching to that repo; selecting the row still
   works exactly as before.

## Rationale

Reusing `GitRepoState`/`RepoManager` rather than inventing a parallel starred-
repos store keeps this DRY with every other per-repo setting already stored
there, and automatically threads the field through the tab's existing
`loadRepos` response with no protocol change on the *read* side. The write
path needs its own message (rather than piggybacking on `setRepoState`)
because `setRepoState` is scoped to "the currently open repo's settings" and
deliberately does not broadcast to other views (that would make transient,
per-view fields like `scrollTop`/`columnWidths` leak between tab and sidebar,
which is not desired) - starring is the one field that *should* broadcast, so
it gets its own method and message pair. Giving `SidebarView` a `RepoManager`
dependency is a small, one-directional addition (sidebar reads/writes through
it) rather than a new integration surface.

## Rejected alternatives

- **Separate global/workspace starred-repos list** (a plain `string[]` of
  paths, independent of `GitRepoState`): rejected - it would duplicate the
  repo-keying logic `RepoManager` already owns, and wouldn't get "free" delivery
  through the existing `loadRepos`/`GitRepoSet` payload the way a `GitRepoState`
  field does.
- **Reusing `setRepoState` for starring**: rejected - it's fire-and-forget with
  no cross-view broadcast by design, and is only ever sent for the currently
  open repo; starring must work for any repo in the dropdown and must reach
  the other view.
- **Making the sidebar adopt `RepoManager`'s repo list (and `repoDropdownOrder`)
  wholesale, instead of its own VS Code-Git-API-sourced list**: presented as a
  way to fully unify both dropdowns' ordering; rejected for this iteration as
  a larger, unrelated behavior change (the sidebar's repo enumeration source
  is a pre-existing design choice, not something this feature needs to touch)
  - noted here as a natural follow-up if full ordering parity is wanted later.
