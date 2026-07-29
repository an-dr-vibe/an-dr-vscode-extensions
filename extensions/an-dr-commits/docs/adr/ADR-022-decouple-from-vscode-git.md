# ADR-022: Decouple from the built-in vscode.git extension

## Problem

The extension declared `extensionDependencies: ["vscode.git"]`, serializing its
activation behind the built-in Git extension, and read live repository state
(branch name, working-tree change counts, SCM repo selection, change events)
from the vscode.git API in four places: the status bar item, the sidebar
badge/refresh path, the tab's native-SCM watcher, and the command manager's
"selected SCM repo" lookup. This slowed activation, made the extension unusable
with the built-in Git extension disabled, and blocked a future fully
self-contained Commits.

## Decision

- Remove the `vscode.git` manifest dependency and every API usage.
- Add `GitStatusMonitor`: the extension's own authority for the active
  repository (pinned via the shared repo-selection events, falling back to the
  active editor's repo, then dropdown order), its branch name (read directly
  from `.git/HEAD`, no git spawn), and its working-tree change counts
  (`DataSource.getStatusCounts`, debounced via a reused `RepoFileWatcher` on
  the active repo's working tree). Status bar, sidebar badge/refresh, and the
  commands that need a "current repo" all consume the monitor.
- Stop awaiting `findGit` during activation: `DataSource._spawnGit` holds the
  first git calls on a git-executable-resolution barrier instead, so activation
  wires everything immediately and git-dependent data fills in when discovery
  settles.
- The tab invalidates its repository graph generation when the panel becomes
  visible again, covering file events missed while its watcher was stopped
  (previously covered by the native SCM watcher).

## Rationale

`DataSource` and `RepoManager` were already vscode.git-free; only presentation
fast paths and refresh signals remained. Replacing them with one monitor keeps
a single source of truth for "current repo/branch/dirty state", removes the
activation serialization, and lets the built-in Git extension be disabled
entirely once no other extension needs it. This supersedes ADR-009's rationale
for keeping the badge on vscode.git's in-memory state: the pushed-state fast
path is gone, and the badge now updates from debounced status spawns
(~1s after a change) — the price of independence.

## Rejected alternatives

- Keeping vscode.git as an optional fast path: two code paths for the same
  state, and the manifest dependency (the activation cost) would have to stay
  for the fast path to be reliable.
- Persisting branch/counts across sessions for instant startup display: the
  `.git/HEAD` read is already instant and spawn-free; persisted counts add
  stale-data handling for ~200ms of benefit.
- Honoring the native SCM view's repo selection via polling: the concept only
  exists inside vscode.git; the shared Commits repo selection replaces it.
