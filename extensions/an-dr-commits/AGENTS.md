# AGENTS.md — an-dr-commits

> **Maintenance rule**: Update this file whenever you add, remove, or significantly change a file, feature, or data flow. Keep it accurate so future agents can skip exploratory reads.
> **Commit rule**: Never create a git commit or push unless the user explicitly requests it ("commit", "push", "commit and push", etc.). Completing a coding task does NOT imply permission to commit.
> **DRY rule**: Never duplicate logic or markup. If two places need the same output, extract a shared function or reuse existing methods. Prefer passing rendered HTML/data from one owner rather than re-rendering independently.

---

## What this is

A VS Code extension that renders a Git commit graph in a webview panel and lets the user perform Git operations from it. Based on [vscode-an-dr-commits](https://github.com/mhutchie/vscode-an-dr-commits) (MIT).

**Entry point command**: `an-dr-commits.view` → opens the graph panel.

---

## Architecture: two separate worlds

| Layer | Language | Location | Compiled to |
|---|---|---|---|
| Backend (Node.js) | TypeScript | `src/` | `out/` |
| Frontend (browser) | TypeScript | `web/` | Two bundles: `media/out.min.js`+`out.min.css` (tab) and `media/sidebar.min.js`+`sidebar.min.css` (sidebar) — see `.vscode/package-web.js` |

They communicate **only** via VS Code's webview message API (`postMessage` / `onmessage`). No shared imports between `src/` and `web/`. Within each world, `src/views/common/` and `web/common/` hold code shared between the tab and sidebar views (see `docs/adr/ADR-003-shared-browser-module-and-sidebar-webview-bundle.md` and `ADR-004-views-reorganization-and-tabview-split.md`).

---

## Refactor Guardrails (Maintainability Mode)

- **Behavior freeze:** do not change command IDs, settings keys, request/response command names, or persisted state keys during structural refactors.
- **Compatibility-first extraction:** prefer moving code behind existing public entrypoints (`DataSource`, `RepoManager`, `TabView`, `SidebarView`) over changing call sites.
- **File/function size targets:** aim for `<= 350` lines per file and `<= 60` lines per function. If a larger unit is intentionally retained, add a brief in-file justification comment.
- **Topic directories:** place extracted logic under topic folders:
  - backend: `src/data-source/`, `src/repo-manager/`, `src/views/{tab,sidebar,common}/`, `src/types/`
  - webview: `web/main/` (tab-only helpers), `web/common/` (shared by both webviews), `web/sidebar/` (sidebar-only) — all require recursive packaging in `.vscode/package-web.js`
- **No cross-world coupling:** never import `web/*` from `src/*` or vice versa.

### Current hotspot audit list

- `web/main.ts`
- `src/dataSource.ts`
- `src/repoManager.ts`
- `src/views/tab/tabView.ts` (down from 1345 to ~850 lines after its ~70 message handlers moved into `src/views/tab/*Actions.ts` — see below)
- `src/types/message-protocol.ts`

---

## Build

```bash
npm run compile-web   # TypeScript → media/{out,sidebar}.min.js + media/{out,sidebar}.min.css
npm run compile-src   # TypeScript → out/extension.js
npm run compile       # both (clean first)
```

Bundling scripts: `.vscode/package-web.js` (CSS + JS concatenation/minification into the tab bundle `out.min.*` and the sidebar bundle `sidebar.min.*`), `.vscode/package-src.js`.

After any change to `web/` or `web/styles/` (or `web/sidebar/styles/`), run `npm run compile-web` and reload the extension window.

---

## Backend file map (`src/`)

| File | Purpose |
|---|---|
| `extension.ts` | Activation, registers all commands, wires up managers |
| `dataSource.ts` | **All git commands** — spawns git, parses output. Repository loads share a one-use `for-each-ref` snapshot (ADR-014), cache exact graph projections, and prewarm up to twelve individual refs after a show-all load (ADR-015). Key methods: `getCommits()`, `getRepoInfo()`, `getLog()` |
| `repositoryGraphCache.ts` | Bounded per-repository immutable commit pool and exact graph-projection LRU with generation-based staleness (ADR-015) |
| `repoManager.ts` | Discovers `.git` repos in the workspace, tracks them |
| `commands.ts` | Handlers for every Git action (checkout, merge, push, tag, etc.) |
| `config.ts` | Reads VS Code settings into typed config objects |
| `extensionState.ts` | Persists view state across sessions |
| `types.ts` | Public barrel re-exporting `types/*` — the shared TypeScript interfaces for the backend |
| `avatarManager.ts` | Fetches and caches author avatars |
| `editorTabUtils.ts` | Matches existing Commits editor tabs for the explicit-open duplicate safeguard |
| `views/tab/` | The main-editor-tab webview, class `TabView` — see below |
| `views/sidebar/` | The Activity Bar sidebar webview, class `SidebarView` — see below |
| `views/common/` | Backend code shared between `views/tab/` and `views/sidebar/` — see below |
| `statusBarItem.ts` | The status bar button that opens the graph |
| `inlineBlame.ts` | Active editor inline blame backed by a cancellable per-document-version incremental blame cache (ADR-013) |
| `diffDocProvider.ts` | Virtual document provider for diff views |
| `repoFileWatcher.ts` | Watches `.git` for changes, triggers refresh |
| `logger.ts` | Output channel logging |
| `utils.ts` | General backend utilities |
| `data-source/helpers.ts` | DataSource parsing helpers (diff/status/config/error formatting) |
| `data-source/models.ts` | DataSource-internal model and response interfaces extracted from `dataSource.ts` |
| `data-source/parsers.ts` | DataSource stdout parsing helpers for consolidated ref snapshots, log, blame, status, and stashes |
| `repo-manager/workspaceUtils.ts` | Workspace folder / path inclusion utilities |
| `repo-manager/externalRepoConfig.ts` | External repo config read/write/validate/apply/export helpers |
| `types/*` | Grouped contract exports by concern; `types.ts` is the public barrel. `sidebar-state.ts`/`sidebar-protocol.ts` hold the sidebar's own initial-state and discriminated-union request/response types |

At `maxDepthOfRepoSearch === 0`, the workspace creation watcher drops ordinary paths inside known repositories before queueing any filesystem or Git work. Explicit nested `.git` creation remains discoverable (ADR-011, extending ADR-008).

### Tab view (`src/views/tab/`)

`TabView` (`VIEW_TYPE = 'an-dr-commits'`) owns the webview panel lifecycle, HTML rendering, and message dispatch, but the ~70 message handlers themselves live in seven sibling `*Actions.ts` modules grouped by category — `respondToMessage`'s switch is a pure dispatch table delegating into these. Each module exports a small `*ActionContext` interface (a facade over exactly the `TabView` fields/methods that group's handlers need — usually just `dataSource` + `sendMessage`, occasionally more) built once in the `TabView` constructor and passed to every handler call in that group.

| File | Purpose |
|---|---|
| `tabView.ts` | **Core class `TabView`** — panel lifecycle, HTML rendering, native-SCM-extension watcher, `respondToMessage` dispatch switch |
| `webviewHtml.ts` | Tab webview HTML + CSP rendering (`renderCommitsWebviewHtml`) |
| `repoLifecycleActions.ts` | `loadRepos`/`loadRepoInfo`/`loadCommits`/`loadConfig`/`rescanForRepos`/`setRepoState`/`exportRepoConfig`/`setGlobalViewState`/`setWorkspaceViewState`/`setColumnVisibility`/`repoInProgressAction` |
| `branchRemoteActions.ts` | Branch and remote management (checkout/create/delete/rename/push/pull/fetch/merge/rebase/create-PR/…) |
| `tagStashActions.ts` | Tag and stash management (add/delete/push tag; apply/pop/drop/push stash; branch-from-stash) |
| `commitGraphActions.ts` | Per-commit actions (details, compare, checkout, cherry-pick, drop, reword, edit-author, squash, reset-to-commit/head, revert) and the sidebar batch-ref-action helpers |
| `diffFileContentActions.ts` | Diff viewing and file-content/file-management (view/get diff, open file, copy path, create archive, add to `.gitignore`) |
| `workingTreeActions.ts` | Working-tree changes (load/stage/unstage/commit/discard/clean-untracked) |
| `miscActions.ts` | Everything else (user details, extension settings, external URL, error dialog, view-scm, fetch avatar, send-to-code-review) |
| `fileIcons.ts` | Loads file-type icon SVGs from the `an-dr-file-icons` extension for the file tree |

### Sidebar view (`src/views/sidebar/`)

`SidebarView` sends raw-JSON `SidebarResponseUpdateContent`/`SidebarResponseUpdateGraph` payloads over the discriminated-union sidebar protocol (`types/sidebar-protocol.ts`); all HTML rendering happens client-side in `web/sidebar/` (mirrors how the tab already worked), not server-side.

| File | Purpose |
|---|---|
| `sidebarView.ts` | **Core class `SidebarView`** (webview view type `an-dr-commits.activityView`) — repository selection sync, message dispatch. Its repo dropdown list, active-repo resolution, and file watching are sourced from `RepoManager` (not the native VS Code Git API — see ADR-006), including starred-repo sync (ADR-005). The native Git API (`this._api`) is still used for branch/remote resolution (Pull/Push/Reset), the mini graph, and as a fast path for the activity badge. The badge (`_updateBadge()`) reflects only the currently selected repo's changes, not every repo in the workspace summed together. |
| `html.ts` | Renders the static webview shell only (meta tags, `sidebarInitialState` JSON, `sidebar.min.js`/`sidebar.min.css` tags) — no server-rendered content HTML |
| `gitUtils.ts` | Git API working-tree helpers (`getHeadInfo`, `getWorkingTreeChanges`, `countChanges`, …) |
| `miniGraph.ts` | Fetches the current branch/upstream mini-graph's raw commit data (`fetchMiniGraph`); reachable-set computation and rendering both live client-side in `web/sidebar/miniGraph.ts` |
| `ui.ts` | Server-rendered chrome only: `codicon`, refresh button, open-commits button, actions row |

### Shared view code (`src/views/common/`)

| File | Purpose |
|---|---|
| `repoSelection.ts` | `RepoSelectionEvent`/`RepoSelectionSource` — the cross-view repository-selection sync contract used by both `TabView` and `SidebarView` |
| `webviewChrome.ts` | `standardiseCspSource`, `renderWebviewMetaTags`, `renderLoadingSplashHtml` — webview shell HTML shared between the tab and sidebar HTML renderers |

---

## Frontend file map (`web/`)

| File | Purpose |
|---|---|
| `main.ts` | **Core UI class `CommitsView`** (frontend-only; unrelated to the backend `TabView` class, which used to share this name before the backend-side rename) — owns all state, renders commit table + graph, handles all user interactions, sends/receives messages |
| `branchPanel.ts` | Left sidebar: branch + tag list with checkboxes, folder grouping by `/`, resize handle, hide/show toggle. Class `BranchPanel`. |
| `graph.ts` | SVG commit graph controller / rendering orchestration |
| `aGraphModels.ts` | Graph constants, geometry types, and `Branch` / `Vertex` models |
| `graphRebase.ts` | Rebase-guide lookup and path helpers for the graph |
| `dialog.ts` | Modal dialogs for Git operations |
| `customSelect.ts` | Dialog multi/single select widget used by `dialog.ts` |
| `contextMenu.ts` | Right-click context menus on commits/refs |
| `findWidget.ts` | Ctrl+F find bar |
| `settingsWidget.ts` | Repository settings panel |
| `settingsWidgetDialogs.ts` | Settings widget issue-linking and pull-request dialog flows |
| `changesPanel.ts` | Uncommitted-changes mode for the Files Panel: staged/unstaged sections, commit message textarea, stage/unstage/discard/commit actions — shown in `#filesPanel` when the uncommitted row is selected |
| `textFormatter.ts` | Commit message formatting (issue links, etc.) |
| `utils.ts` | Frontend globals: `ICONS` object, `VSCODE_API`, table/graph/column-width constants. Cross-view helpers (`escapeHtml`, `codicon`, tag pills, `Dropdown`, …) moved to `web/common/`, see below |
| `branchPanelRender.ts` | Branch panel tree building and HTML rendering helpers |
| `main/*` | Extracted `main.ts` helper modules (committed column, controls layout, quick diff rendering, file tree rendering, full diff panel rendering, repo-state helpers, misc helpers) — tab-bundle only |
| `common/*` | Browser-side code shared by both the tab bundle and the sidebar bundle (no `import`/`export`, global scope like everything else in `web/`): `htmlHelpers.ts` (`escapeHtml`, `unescapeHtml`, `codicon`), `refPills.ts` (`renderTagPill`, `renderTagOverflowPill`), `dropdown.ts` (`Dropdown` class — repo selector), `mathHelpers.ts` (`clamp`), `outsideClick.ts` (`addOutsideClickListener`), `uiHelpers.ts` (`alterClass`, `formatCommaSeparatedList`, `CLASS_SELECTED`), `graphConstants.ts` (`UNCOMMITTED`) |
| `sidebar/*` | The sidebar bundle's own client-side code — see below |
| `global.d.ts` | Type declarations for globals shared across web files; `acquireVsCodeApi<TMessage, TState>()` is generic so the tab and sidebar bundles can each type their own `VSCODE_API` |

### Sidebar frontend (`web/sidebar/`)

Compiles into the separate `sidebar.min.js`/`sidebar.min.css` bundle (see "Building web code" in the repo-root `AGENTS.md`). Client-side rendering ported from what used to be server-rendered HTML in `src/activityBarView/` (now `src/views/sidebar/`) — the sidebar now works the same way the tab always did: the backend sends raw JSON, the browser renders it.

| File | Purpose |
|---|---|
| `main.ts` | **Core class `SidebarView`** (frontend-only; distinct from the backend `SidebarView` in `src/views/sidebar/sidebarView.ts`) — wires the repo dropdown, action buttons, changes-tree interactions, commit footer, mini-graph, resize handle. `sidebarBootstrap()` is the entry point (renamed from a plain `bootstrap()` to avoid colliding with `web/main.ts`'s own `bootstrap()` in the shared global scope — the tab bundle isn't loaded here, but naming stays collision-safe project-wide) |
| `changesTree.ts` | Pure client-side rendering of the working-tree changes tree (staged/unstaged sections, folders, file rows) |
| `miniGraph.ts` | Pure client-side mini-graph rendering, including the `Set`-based reachable-commit computation (ported from the old server-side `activityBarView/miniGraph.ts`) |
| `styles/main.css` | Sidebar-only CSS, bundled into `sidebar.min.css` |
| `global.d.ts` | Declares the `sidebarInitialState: GG.SidebarInitialState` global injected by `views/sidebar/html.ts` |

`an-dr-commits.uiDensity` (`Big` / `Normal` / `Compact`) is carried in both typed initial-state
payloads. `Normal` is the default and applies `body.compactUi`; `Compact` additionally applies
`body.extraCompactUi`. Tab controls keep their original dimensions, while Activity Bar controls
follow the selected density (ADR-017, superseding ADR-016).

### Styles (`web/styles/`)

Each CSS file corresponds 1:1 to its component. All get concatenated into `media/out.min.css` (the tab bundle only — `web/sidebar/styles/main.css` is separate and goes into `media/sidebar.min.css`, see above).

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

`#initialLoadSplash` is a `#view` sibling shown by default (CSS) and hidden once
`body.commitsLoaded` is added by `loadProcessing.ts` after the first successful
`commitsLoadCommits()` render - covers first load, repo switch, and the prevState-restore
fast path, since all three call through the same `render()` site.

```
#view
├── #controls (41px, fixed top bar)
│   ├── #repoDropdown
│   ├── #showRemoteBranchesCheckbox
│   ├── #findWidget / #findWidgetToggleBtn
│   ├── #topFullDiffBtn, #pullBtn, #pushBtn, #settingsBtn, #moreBtn
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
`extension.ts:activate` → `TabView.createOrShow()` → `getHtmlForWebview()` injects `initialState` JSON → webview `main.ts` constructor reads it → calls `requestLoadRepoInfoAndCommits()`.

Window reload restoration is owned exclusively by VS Code's registered webview serializer. The serializer passes the persisted webview state into `TabView.revive()`, which injects it as `restoredState`; frontend bootstrap consumes it directly without reopen flags or retry timers (ADR-012).

### Loading commits
Webview sends `loadRepoInfo` / `loadCommits` messages → `TabView.respondToMessage` receives → dispatches to `views/tab/repoLifecycleActions.ts`'s `handleLoadRepoInfo`/`handleLoadCommits` → these call `dataSource.getRepoInfo()` + `dataSource.getCommits()` → send back `loadRepoInfo` / `loadCommits` responses → webview `loadRepoInfo()` / `loadCommits()` update state → `render()`.

`RepoFileWatcher` classifies Git metadata changes as full refreshes and ordinary working-tree events as lightweight refreshes. The latter runs only `DataSource.getWorkingTreeChangeCount()` and sends `refreshWorkingTree`; `web/main/loadProcessing.ts` updates the uncommitted graph node without reloading refs or history (ADR-010).

### Following Source Control selection
`TabView` subscribes to the built-in Git extension API on startup (`setupNativeScmWatcher()`). When a repository's `ui.selected` state changes in VS Code Source Control, Commits resolves the selected Git API repository back to a known Commits repo via `repoManager.getKnownRepo()`, sends `loadRepos` with `loadViewTo`, then triggers a refresh so the webview reloads the newly selected repository. The tab and sidebar also sync repo selection with each other directly, independent of VS Code's own SCM selection — see `views/common/repoSelection.ts` and `TabView.configureRepoSelectionSync()`.

### Branch filter
`BranchPanel.changeCallback` → `main/constructorInit.ts` sets `currentBranches` → requests a soft commit projection without clearing the current graph (ADR-015) → backend `dataSource.getCommits()` returns a cached exact projection or runs `git log <branch>`. `null` means show all (`--branches --tags --remotes`). Tag names work as valid git refs.

### Git operations
User right-clicks commit → `contextMenu.ts` → click handler in `main.ts` → `sendMessage({command: 'someAction', ...})` → `TabView.respondToMessage` dispatches to the matching `views/tab/*Actions.ts` handler → `commands.ts` (or `dataSource.ts` directly) runs git → response sent back to webview.

### Sending commit ranges to Code Review
`web/main.ts` sends `sendToCodeReview` with `repo`, `from`, and `to`. `TabView.respondToMessage` dispatches to `views/tab/miscActions.ts`'s `handleSendToCodeReview`, which forwards all three values to `an-dr-code-review.setCommitRange`; Code Review uses the repository root to switch to the matching Git API repository before diffing the pinned commit range. Keep this repo argument when changing the contract so submodule and multi-root workspaces do not diff the wrong repository.

---

## Where to look by feature

| Want to change… | Go to |
|---|---|
| Top toolbar button order / overflow | `web/main/controlsLayout.ts` + `src/views/tab/webviewHtml.ts` |
| Quick diff rendering / switching | `web/main/diffPreview.ts` + `web/styles/main.css` |
| Full diff bottom panel rendering | `web/main/fullDiffPanel.ts` + `web/styles/main.css` |
| Git command execution | `src/dataSource.ts` |
| Branch/tag sidebar UI (tab's left panel, not the Activity Bar sidebar) | `web/branchPanel.ts` + `web/styles/branchPanel.css` |
| Remote URL display / edit in sidebar | `web/branchPanelRender.ts` + `web/main/contextMenus/sidebar.ts` + `web/main/actions/gitActions.ts` |
| Commit table rendering | `web/main.ts` → `renderTable()` (~line 812) |
| Commit graph (SVG) | `web/graph.ts` |
| Context menu actions | `web/main.ts` (handlers) + `src/commands.ts` / `src/views/tab/commitGraphActions.ts` (execution) |
| Tab webview HTML structure | `src/views/tab/tabView.ts` → `getHtmlForWebview()` + `src/views/tab/webviewHtml.ts` |
| Tab message handler for a specific request | `src/views/tab/tabView.ts`'s `respondToMessage` switch → follow the `case` to whichever `src/views/tab/*Actions.ts` module it delegates to |
| Activity Bar sidebar webview (panel + interactions) | `src/views/sidebar/` (backend: shell HTML, Git API, message dispatch) + `web/sidebar/` (frontend: all rendering) |
| Extension settings | `src/config.ts` + `package.json` `contributes.configuration` |
| Message protocol (tab) | `src/types/message-protocol.ts` (backend) + `web/global.d.ts` (frontend) |
| Message protocol (sidebar) | `src/types/sidebar-protocol.ts` + `src/types/sidebar-state.ts` (backend) + `web/sidebar/global.d.ts` (frontend) |
| Code shared between tab and sidebar | `src/views/common/` (backend) + `web/common/` (frontend) |
| Webview icons | `web/utils.ts` → `ICONS` constant (tab) / `web/common/htmlHelpers.ts` → `codicon()` (both) |
| Status bar button | `src/statusBarItem.ts` |
| Inline blame / current line commit display | `src/inlineBlame.ts` + `src/dataSource.ts` |
| Repo discovery | `src/repoManager.ts` |

---

## Important conventions

- **No shared code** between `src/` and `web/` — they are compiled independently. Within each of those two worlds, however, `src/views/common/` and `web/common/` are deliberately shared between the tab and sidebar views — see ADR-003/ADR-004.
- Frontend globals (`ICONS`, `VSCODE_API`, etc. in `web/utils.ts`; `escapeHtml`/`codicon`/`Dropdown`/etc. in `web/common/`) are available to all other web files in the same bundle (concatenated, not module imports) — but the tab bundle and sidebar bundle are two separate concatenations, so a tab-only file (e.g. anything under `web/main/`) is not visible to sidebar code and vice versa.
- `BranchPanel` (`web/branchPanel.ts`) implements the same public interface as `web/common/dropdown.ts`'s `Dropdown` — `setOptions`, `isSelected`, `selectOption`, `unselectOption`, `refresh`, `isOpen`, `close` — plus `setTags(tags)`. It is stored in `main.ts` as `this.branchDropdown: BranchPanel`.
- Sidebar width is set dynamically via JS (`sidebar.style.width`, `content.style.marginLeft`). The CSS default `margin-left:200px` on `#content` is just a fallback. (This is the tab's left branch/tag panel, unrelated to the Activity Bar sidebar webview.)
- `currentBranches` is persisted in extension state. `[SHOW_ALL_BRANCHES]` means no filter (git log sees `null`).
- The frontend `web/main.ts` class `CommitsView` and the frontend `web/sidebar/main.ts` class `SidebarView` were **not** renamed by the `src/`-side `CommitsView`→`TabView` / `ActivityBarView`→`SidebarView` renames — `web/` classes are a separate, unrelated namespace from `src/` classes since the two worlds never share imports. Don't assume a name match implies the same class.
