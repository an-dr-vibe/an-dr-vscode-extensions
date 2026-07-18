# `src/views/sidebar/`

The Activity Bar sidebar webview. `SidebarView` (`sidebarView.ts`) follows the
active repository via `GitStatusMonitor` (`../../gitStatusMonitor.ts` — no
vscode.git dependency, see ADR-022), keeps repo selection in sync with the tab
(`../common/repoSelection.ts`), and dispatches incoming messages — but sends only
**raw JSON** back to the webview (`SidebarResponseUpdateContent`/
`SidebarResponseUpdateGraph`, see `../../types/sidebar-protocol.ts`). All HTML
rendering happens client-side in `../../../web/sidebar/`, the same way the tab
renders client-side from `web/main.ts`.

| File | Purpose |
|---|---|
| `sidebarView.ts` | **Core class `SidebarView`** (webview view type `an-dr-commits.activityView`) — badge/refresh driven by `GitStatusMonitor` events, repository selection sync, message dispatch |
| `html.ts` | Renders the static webview shell only (meta tags, `sidebarInitialState` JSON, `sidebar.min.js`/`sidebar.min.css` tags) |
| `miniGraph.ts` | Fetches the current branch/upstream mini-graph's raw commit data (`fetchMiniGraph`) — the reachable-set computation and all rendering live client-side in `web/sidebar/miniGraph.ts` |
| `ui.ts` | The handful of bits still worth rendering server-side: `codicon`, refresh button, open-commits button, actions row |
