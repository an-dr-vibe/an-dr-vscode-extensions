# ADR-006: Sidebar repo dropdown sources from RepoManager, not the native Git API

## Problem

ADR-005 introduced starring and explicitly left the sidebar's repo *enumeration*
source alone (`SidebarView._getRepoPaths()`, backed by `vscode.git`'s API
`repositories` array - whatever that extension has auto-detected/opened),
noting the tab's dropdown already uses a different, broader source
(`RepoManager`, which actively searches the workspace). In practice this
surfaced immediately: the sidebar's dropdown was missing repositories the tab
(and VS Code's own Source Control view) could see, because `RepoManager`'s
discovery (configurable `maxDepthOfRepoSearch`, submodules, manually
registered repos via `an-dr-commits.addGitRepository`) is a superset of what
the native Git extension auto-opens.

## Decision

`SidebarView` now sources its repo list, active-repo resolution, and repo-path
normalization entirely from `RepoManager`:

- `_getRepoPaths()` returns `Object.keys(repoManager.getRepos())` instead of
  mapping `vscode.git`'s `api.repositories`.
- `_resolveActiveRepoPath()` resolves the pinned repo via
  `RepoManager.findKnownRepoPath` (new public method, case-insensitive on
  Windows), falls back to `RepoManager.getRepoContainingFile()` for the active
  editor, and as a last resort to the first repo in dropdown order
  (`getSortedRepositoryPaths` - starred first, then `repositoryDropdownOrder`),
  mirroring the tab's own default-repo fallback.
- `.git/**` file watching (`_syncRepoWatchers`, keyed by a `Map` for
  idempotency) is driven by `RepoManager.getRepos()` plus
  `RepoManager.onDidChangeRepos`, not by the native API's repo set.
- The native Git extension (`this._api`) is still used for what only it can
  provide: branch/upstream/remote resolution for Pull/Push/Reset
  (`getHeadInfo`), the mini graph, and - as a fast, spawn-free path - live
  change counts for the activity badge. `_updateBadge()` now falls back to
  this view's own last-fetched working-tree changes (already CLI-based via
  `DataSource`) when the active repo isn't tracked by the native API, so the
  badge stays correct even for RepoManager-only repos.

## Rationale

`RepoManager` is already Commits' authoritative repo list - the tab trusts it,
starring (ADR-005) is keyed off it, and it actively searches rather than
relying on the native extension's auto-detection. Making the sidebar agree
with it removes a second, narrower source of truth that could silently
diverge from what the rest of the extension considers "the known repos,"
which is exactly what the user hit in practice. Git *actions* (stage, unstage,
commit, discard, fetch, pull, push, reset, working-tree-changes listing) still
run through `DataSource`, which spawns `git` directly - never through
`vscode.git`'s API - so none of that is affected by which list the dropdown is
built from.

## Rejected alternatives

- **Investigate/fix why `vscode.git`'s API doesn't report all repos**:
  rejected - even a fully-correct native API would still be a narrower
  discovery mechanism than `RepoManager` (different `maxDepthOfRepoSearch`,
  no knowledge of manually-registered or submodule repos), so this would fix
  today's symptom without preventing the next divergence.
- **Keep both sources and merge/dedupe them for the sidebar's dropdown**:
  rejected as needless complexity - `RepoManager`'s list already needs to be
  the sidebar's list per the "both dropdowns must be the same" requirement
  from ADR-005; a merge would just reintroduce two things to keep in sync.
