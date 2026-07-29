# ADR-003: Shared browser module and second webview bundle for the sidebar

## Problem

Sidebar (Activity Bar) rendering (repo selector, tag pills, mini graph, working-tree
file tree, drag-resize handle) is currently hand-authored as Node-executed
template-string generators (`src/activityBarView/html.ts`, `css.ts`, `script.ts`,
`ui.ts`, `miniGraph.ts`), compiled by the backend `tsc` (`src/tsconfig.json`) even
though the generated output only ever runs inside a browser webview. The tab's
equivalent rendering (`web/*`, compiled by `web/tsconfig.json` into
`media/out.min.js`) runs genuinely client-side, consuming raw data pushed from the
backend. ADR-001 previously kept these two implementations separate ("parity by
convention": same CSS class contracts and DataSource calls, no shared source)
because it evaluated only "importing tab render helpers from `web/` into `src/`" -
i.e. crossing the Node/browser runtime boundary at import time, which is genuinely
unsafe. That rejected a mechanism, not the goal: it did not evaluate compiling a
second, independent browser bundle from shared browser-only source.

## Decision

Introduce `web/common/` (browser-only, compiled once by the existing
`web/tsconfig.json`) holding the presentational logic currently duplicated between
the sidebar and the tab: `escapeHtml`/`codicon`, tag-pill markup, a generic
drag-to-resize helper, and a shared outside-click-detection helper (the last two
also deduplicate three-way duplication that already existed *within* `web/` itself,
between `Dropdown`/`ContextMenu`/`CustomSelect` and between
`commitDetailsView/resizable.ts`/`table/resize.ts`). Add a new `web/sidebar/` entry
point, compiled and bundled the same way as the tab, into a new
`media/sidebar.min.js` (+ associated CSS) output. The sidebar's webview loads this
bundle via `<script src=...>`, exactly like the tab already does, instead of
inlining a `<script>${activityScript()}</script>` block.

This moves the sidebar's actual rendering (working-tree file tree, mini graph, repo
selector, action row) from server-rendered HTML strings pushed over `postMessage`
to client-side rendering driven by raw data messages - the same architecture the
tab already uses. `src/views/sidebar/` (renamed from `activityBarView/`) keeps only
backend orchestration: Git API subscription, data fetching, and the outer HTML
shell (CSP head, script/link tags), mirroring `views/tab/webviewHtml.ts`'s role for
the tab.

Both bundles are built from the same `web/tsconfig.json` compile; `web/common/`'s
compiled output is included in both bundling passes. No backend (`src/`) code ever
imports browser-compiled output, and no browser code imports backend source - the
"no cross-world coupling" rule from the extension's `AGENTS.md` is preserved; what
changes is that there are now two browser bundles instead of one, sharing a common
browser-only module.

## Rationale

This is the only way to make the sidebar/tab presentational duplication (dropdown
behavior, tag-pill markup, escapeHtml/codicon, drag-resize) a single physical
source of truth rather than a convention the two implementations can silently
drift from - which is what "as much DRY as possible" requires once the leaf-level
duplication was catalogued. The build already supports this cheaply:
`web/tsconfig.json` has no `include`/`exclude` (a new subfolder compiles
automatically), and `package-web.js`'s bundling logic (recursive file collection,
two pinned anchor files, alphabetical middle ordering) generalizes to a second
invocation with a different anchor/file-set, with no new bundling *mechanism*,
just a second parametrized pass. The sidebar webview already sets
`enableScripts: true` with `localResourceRoots` pointing at `media/`, so loading an
external script file instead of an inline one is a mechanical change already proven
by the tab.

## Rejected alternatives

- **Backend-only DRY, leave presentational duplication as convention-parity**
  (ADR-001/ADR-002's existing approach, extended only to new Node-side helpers like
  a CSP-head builder): rejected as insufficient - this was presented as the
  lower-risk option and explicitly not chosen, since it leaves the single biggest
  chunk of catalogued duplication (dropdown, tag pills, escapeHtml/codicon,
  drag-resize) unresolved as physically separate implementations.
- **A single source file compiled twice, once by each of `src/tsconfig.json` and
  `web/tsconfig.json`**: considered and rejected - would require restructuring both
  tsconfigs' implicit whole-directory `include` behavior to reach outside their own
  root, is fragile (a change to either tsconfig's target/lib settings could
  silently break the other compile of the same file), and buys nothing over the
  chosen approach once a second browser bundle is already being built.
- **Importing compiled `web/` output directly into `src/`'s Node runtime**: this is
  exactly what ADR-001 already rejected, and remains rejected - it would require
  running browser-targeted, DOM-dependent code inside the Node extension host,
  which does not have a DOM.
