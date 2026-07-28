# `src/views/`

The two webview surfaces Commits exposes, plus the backend code they share.

| Folder | Purpose |
|---|---|
| `tab/` | The main-editor-tab webview — class `TabView` (`VIEW_TYPE = 'an-dr-commits'`) |
| `sidebar/` | The Activity Bar sidebar webview — class `SidebarView` (view type `an-dr-commits.activityView`) |
| `common/` | Backend code shared between `tab/` and `sidebar/` (repo-selection sync contract, shared webview-shell HTML) |

Both webviews follow the same shape: a backend class owns the panel/view lifecycle
and HTML rendering, sends/receives typed messages (`types/message-protocol.ts` for
the tab, `types/sidebar-protocol.ts` for the sidebar), and the corresponding
`web/main/` or `web/sidebar/` frontend code renders everything client-side from raw
JSON — no server-rendered HTML fragments on either side.

## Shared data

Both surfaces read through one `DataSource` instance (created in `core.ts`), so the
caches it owns are shared by construction. What makes that sharing actually pay off:

- **Invalidation is a suspicion, not a verdict.** `DataSource.invalidateGraph` marks a
  repository *unverified* and retains its cached data; the next read recomputes a
  fingerprint (refs **plus** the working-tree change count, since projections embed an
  "Uncommitted Changes (N)" row) and either restores the cache or discards it for real.
  A witness overtaken by a later invalidation is never trusted. See ADR-025.
- **Repo info and head info come from one snapshot.** `getRepoInfo` is cached per
  generation and keyed by the request flags that shape it; `getHeadInfo` is derived from
  the same canonical unfiltered snapshot rather than spawning its own Git. See ADR-026.
- **The caches are warmed ahead of use.** `common/repoWarmer.ts` replays the parameters a
  repository was last loaded with — recorded by the tab's `loadRepoInfo`/`loadCommits`
  handlers, persisted in workspace state — whenever the sidebar settles on a repository.
  The branch selection is recorded rather than recomputed because it is decided
  webview-side (`getInitialBranchesOnRepoLoad`), and a second backend copy could diverge.

Both surfaces also delay their loading splash by a second, so a load served from a warm
cache goes straight to content instead of flashing a spinner.
