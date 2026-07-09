# `web/` — Frontend (browser)

The webview side of Commits. Compiles via `tsc -p ./web` to individual JS files in
`media/`, then `.vscode/package-web.js` concatenates + minifies them into **two**
separate bundles (deleting the individual files afterwards):

| Bundle | Loaded by | Includes |
|---|---|---|
| `media/out.min.js` + `out.min.css` | `TabView` (`src/views/tab/`) | `main.ts`, `styles/*`, `main/*`, `common/*`, plus every other flat file below |
| `media/sidebar.min.js` + `sidebar.min.css` | `SidebarView` (`src/views/sidebar/`) | `sidebar/*`, `common/*` |

**No `import`/`export` anywhere in `web/`** — every file in a bundle is concatenated
into one global scope, so top-level `function`/`class`/`const` names must be unique
within that bundle (`common/` names must be unique across *both* bundles, since it's
in both). Never imports from `src/` — the two worlds only talk over the webview
`postMessage`/`onmessage` API.

**Always run `npm run compile-web`** (or `npm run compile`) after any change here —
running bare `tsc -p web/tsconfig.json` produces individual files neither webview
actually loads, so changes will silently appear to do nothing.

## Subfolders

| Folder | Purpose |
|---|---|
| `common/` | Code shared by both bundles (`escapeHtml`/`codicon`, tag pills, `Dropdown`, `clamp`, outside-click, misc UI helpers) |
| `sidebar/` | The sidebar bundle's own client-side code (rendering, mini-graph, styles) |
| `main/` | Tab-bundle-only support modules for `main.ts` |
| `styles/` | Tab-only CSS, bundled into `out.min.css` |

## Top-level files (tab bundle)

| File | Purpose |
|---|---|
| `main.ts` | **Core UI class `CommitsView`** (frontend-only; a distinct class from the backend `TabView` in `src/views/tab/`) — owns all state, renders commit table + graph, handles all user interactions, sends/receives messages |
| `branchPanel.ts` | Left sidebar: branch + tag list with checkboxes, folder grouping by `/`, resize handle, hide/show toggle. Class `BranchPanel` |
| `branchPanelRender.ts` | Branch panel tree building and HTML rendering helpers |
| `graph.ts` | SVG commit graph controller / rendering orchestration |
| `graphRebase.ts` | Rebase-guide lookup and path helpers for the graph |
| `aGraphModels.ts` | Graph constants, geometry types, and `Branch`/`Vertex` models |
| `dialog.ts` | Modal dialogs for Git operations |
| `customSelect.ts` | Dialog multi/single-select widget used by `dialog.ts` |
| `contextMenu.ts` | Right-click context menu rendering/positioning (actions themselves come from `main/contextMenus/`) |
| `findWidget.ts` | Ctrl+F find bar |
| `settingsWidget.ts` | Repository settings panel |
| `settingsWidgetDialogs.ts` | Settings widget issue-linking and pull-request dialog flows |
| `changesPanel.ts` | Uncommitted-changes mode for the Files Panel: staged/unstaged sections, commit message textarea, stage/unstage/discard/commit actions |
| `filesPanel.ts` | The Files Panel container that `changesPanel.ts` and the commit-details file view share |
| `textFormatter.ts` | Commit message formatting (issue links, etc.) |
| `utils.ts` | Frontend globals: `ICONS` object, `VSCODE_API`, table/graph/column-width constants and other tab-only helpers (cross-bundle helpers live in `common/`, not here) |
| `global.d.ts` | Type declarations for globals shared across `web/` files; `acquireVsCodeApi<TMessage, TState>()` is generic so the tab and sidebar can each type their own `VSCODE_API` |
