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
