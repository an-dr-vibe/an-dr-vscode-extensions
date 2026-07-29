# `web/sidebar/`

The Activity Bar sidebar's own client-side code, compiled into the separate
`sidebar.min.js`/`sidebar.min.css` bundle (plus everything in `../common/`, which
both bundles include — see `../README.md`). This is where all sidebar HTML
rendering happens; the backend (`../../src/views/sidebar/`) sends only raw JSON.

| File | Purpose |
|---|---|
| `main.ts` | **Core class `SidebarView`** (frontend-only; distinct from the backend `SidebarView` in `../../src/views/sidebar/sidebarView.ts`) — wires the repo dropdown, action buttons, changes-tree interactions, commit footer, mini-graph, resize handle. `sidebarBootstrap()` is the entry point (named that way, not `bootstrap()`, to avoid colliding with `../main.ts`'s own `bootstrap()` — see `../README.md`) |
| `changesTree.ts` | Pure client-side rendering of the working-tree changes tree (staged/unstaged sections, folders, file rows) |
| `miniGraph.ts` | Pure client-side mini-graph rendering, including the `Set`-based reachable-commit computation |
| `styles/main.css` | Sidebar-only CSS, bundled into `sidebar.min.css` (not `../styles/`, which is tab-only) |
| `global.d.ts` | Declares the `sidebarInitialState: GG.SidebarInitialState` global injected by `src/views/sidebar/html.ts` |
