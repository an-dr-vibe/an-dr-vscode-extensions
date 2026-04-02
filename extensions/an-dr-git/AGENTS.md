# AGENTS.md — an-dr-git

> **Maintenance rule**: Update this file whenever you add, remove, or significantly change a file, feature, or data flow. Keep it accurate so future agents can skip exploratory reads.

---

## What this is

A VS Code extension that renders a Git commit graph in a webview panel and lets the user perform Git operations from it. Based on [vscode-git-graph](https://github.com/mhutchie/vscode-git-graph) (MIT).

**Entry point command**: `an-dr-git.view` → opens the graph panel.

---

## Architecture: two separate worlds

| Layer | Language | Location | Compiled to |
|---|---|---|---|
| Backend (Node.js) | TypeScript | `src/` | `out/` |
| Frontend (browser) | TypeScript | `web/` | `media/out.min.js` + `media/out.min.css` |

They communicate **only** via VS Code's webview message API (`postMessage` / `onmessage`). No shared imports.

---

## Refactor Guardrails (Maintainability Mode)

- **Behavior freeze:** do not change command IDs, settings keys, request/response command names, or persisted state keys during structural refactors.
- **Compatibility-first extraction:** prefer moving code behind existing public entrypoints (`DataSource`, `RepoManager`, `GitGraphView`) over changing call sites.
- **File/function size targets:** aim for `<= 350` lines per file and `<= 60` lines per function. If a larger unit is intentionally retained, add a brief in-file justification comment.
- **Topic directories:** place extracted logic under topic folders:
  - backend: `src/data-source/`, `src/repo-manager/`, `src/view/`, `src/types/`
  - webview: `web/main/` (requires recursive packaging in `.vscode/package-web.js`)
- **No cross-world coupling:** never import `web/*` from `src/*` or vice versa.

### Current hotspot audit list

- `web/main.ts`
- `src/dataSource.ts`
- `src/repoManager.ts`
- `src/gitGraphView.ts`
- `src/types/legacy.ts` (compatibility source while grouped exports live in `src/types/*`)

---

## Build

```bash
npm run compile-web   # TypeScript → media/out.min.js + media/out.min.css
npm run compile-src   # TypeScript → out/extension.js
npm run compile       # both (clean first)
```

Bundling scripts: `.vscode/package-web.js` (CSS + JS concatenation/minification), `.vscode/package-src.js`.

After any change to `web/` or `web/styles/`, run `npm run compile-web` and reload the extension window.

---

## Backend file map (`src/`)

| File | Purpose |
|---|---|
| `extension.ts` | Activation, registers all commands, wires up managers |
| `gitGraphView.ts` | Creates/manages the webview panel; generates HTML; routes messages between webview and backend |
| `dataSource.ts` | **All git commands** — spawns git, parses output. Key methods: `getCommits()`, `getBranches()`, `getRefs()`, `getLog()` |
| `repoManager.ts` | Discovers `.git` repos in the workspace, tracks them |
| `commands.ts` | Handlers for every Git action (checkout, merge, push, tag, etc.) |
| `config.ts` | Reads VS Code settings into typed config objects |
| `extensionState.ts` | Persists view state across sessions |
| `types.ts` | Shared TypeScript interfaces for the backend |
| `avatarManager.ts` | Fetches and caches author avatars |
| `statusBarItem.ts` | The status bar button that opens the graph |
| `diffDocProvider.ts` | Virtual document provider for diff views |
| `repoFileWatcher.ts` | Watches `.git` for changes, triggers refresh |
| `logger.ts` | Output channel logging |
| `utils.ts` | General backend utilities |
| `data-source/helpers.ts` | DataSource parsing helpers (diff/status/config/error formatting) |
| `data-source/models.ts` | DataSource-internal model and response interfaces extracted from `dataSource.ts` |
| `data-source/parsers.ts` | DataSource stdout parsing helpers for branches/refs/log/status/stashes |
| `repo-manager/workspaceUtils.ts` | Workspace folder / path inclusion utilities |
| `repo-manager/externalRepoConfig.ts` | External repo config read/write/validate/apply/export helpers |
| `view/webviewHtml.ts` | Webview HTML + CSP rendering helpers |
| `types/*` | Grouped contract exports by concern; `types.ts` is the public barrel |

---

## Frontend file map (`web/`)

| File | Purpose |
|---|---|
| `main.ts` | **Core UI class `GitGraphView`** — owns all state, renders commit table + graph, handles all user interactions, sends/receives messages |
| `branchPanel.ts` | Left sidebar: branch + tag list with checkboxes, folder grouping by `/`, resize handle, hide/show toggle. Class `BranchPanel`. |
| `graph.ts` | SVG commit graph visualization — `Branch` and `Vertex` classes |
| `dropdown.ts` | Repo selector dropdown (top bar). Class `Dropdown`. |
| `dialog.ts` | Modal dialogs for Git operations |
| `contextMenu.ts` | Right-click context menus on commits/refs |
| `findWidget.ts` | Ctrl+F find bar |
| `settingsWidget.ts` | Repository settings panel |
| `textFormatter.ts` | Commit message formatting (issue links, etc.) |
| `utils.ts` | Frontend globals: `SVG_ICONS` object, `escapeHtml`, `VSCODE_API`, helpers |
| `main/*` | Extracted `main.ts` helper modules (committed column, controls layout, file tree rendering, repo-state helpers, misc helpers) |
| `global.d.ts` | Type declarations for globals shared across web files |

### Styles (`web/styles/`)

Each CSS file corresponds 1:1 to its component. All get concatenated into `media/out.min.css`.

| File | Styles for |
|---|---|
| `main.css` | Body, `#view`, `#content`, `#controls`, `#footer`, commit table, graph |
| `branchPanel.css` | `#sidebar`, `#sidebarToggle`, `#sidebarResizeHandle`, all `.branchPanel*` classes |
| `contextMenu.css` | `.contextMenu*` |
| `dialog.css` | `.dialog*` |
| `dropdown.css` | `.dropdown*` |
| `findWidget.css` | `#findWidget` |
| `settingsWidget.css` | `#settingsWidget` |

---

## HTML layout (the webview)

```
#view
├── #controls (41px, fixed top bar)
│   ├── #repoDropdown
│   ├── #showRemoteBranchesCheckbox
│   ├── #findWidget / #findWidgetToggleBtn
│   ├── #pullBtn, #pushBtn, #settingsBtn, #moreBtn
│   ├── Pull right-click menu includes Fetch
├── #sidebar (fixed left, resizable via JS)
│   ├── #branchPanel  ← BranchPanel mounts here
│   └── #sidebarResizeHandle
├── #sidebarToggle (fixed, outside sidebar)
├── #content (margin-left matches sidebar width, set by JS)
│   ├── #commitGraph (SVG)
│   └── #commitTable
└── #footer ("Load more commits")
```

---

## Key data flows

### Opening the graph
`extension.ts:activate` → `GitGraphView.createOrShow()` → `getHtmlForWebview()` injects `initialState` JSON → webview `main.ts` constructor reads it → calls `requestLoadRepoInfoAndCommits()`.

### Loading commits
Webview sends `loadRepoInfo` / `loadCommits` messages → `gitGraphView.ts` receives → calls `dataSource.getRepoInfo()` + `dataSource.getCommits()` → sends back `loadRepoInfo` / `loadCommits` responses → webview `loadRepoInfo()` / `loadCommits()` update state → `render()`.

### Branch filter
`BranchPanel.changeCallback` → `main.ts` sets `this.currentBranches` → `requestLoadCommits()` → backend `dataSource.getLog(repo, branches, ...)` → passes branch names directly as `git log <branch>` args. `null` means show all (`--branches --tags --remotes`). Tag names work as valid git refs.

### Git operations
User right-clicks commit → `contextMenu.ts` → click handler in `main.ts` → `sendMessage({command: 'someAction', ...})` → `gitGraphView.ts` → `commands.ts` runs git → response sent back to webview.

---

## Where to look by feature

| Want to change… | Go to |
|---|---|
| Git command execution | `src/dataSource.ts` |
| Branch/tag sidebar UI | `web/branchPanel.ts` + `web/styles/branchPanel.css` |
| Commit table rendering | `web/main.ts` → `renderTable()` (~line 812) |
| Commit graph (SVG) | `web/graph.ts` |
| Context menu actions | `web/main.ts` (handlers) + `src/commands.ts` (execution) |
| Webview HTML structure | `src/gitGraphView.ts` → `getHtmlForWebview()` |
| Extension settings | `src/config.ts` + `package.json` `contributes.configuration` |
| Message protocol | `src/types.ts` (backend) + `web/global.d.ts` (frontend) |
| SVG icons | `web/utils.ts` → `SVG_ICONS` constant |
| Status bar button | `src/statusBarItem.ts` |
| Repo discovery | `src/repoManager.ts` |

---

## Important conventions

- **No shared code** between `src/` and `web/` — they are compiled independently.
- Frontend globals (`SVG_ICONS`, `escapeHtml`, `VSCODE_API`, etc.) are defined in `web/utils.ts` and available to all other web files (concatenated, not module imports).
- `BranchPanel` (`web/branchPanel.ts`) implements the same public interface as `Dropdown` — `setOptions`, `isSelected`, `selectOption`, `unselectOption`, `refresh`, `isOpen`, `close` — plus `setTags(tags)`. It is stored in `main.ts` as `this.branchDropdown: BranchPanel`.
- Sidebar width is set dynamically via JS (`sidebar.style.width`, `content.style.marginLeft`). The CSS default `margin-left:200px` on `#content` is just a fallback.
- `currentBranches` is persisted in extension state. `[SHOW_ALL_BRANCHES]` means no filter (git log sees `null`).
