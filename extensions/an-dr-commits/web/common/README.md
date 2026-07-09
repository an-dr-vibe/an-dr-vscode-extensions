# `web/common/`

Browser-side code shared by **both** compiled bundles — the tab (`out.min.js`) and
the sidebar (`sidebar.min.js`). Like everything under `web/`, there's no
`import`/`export`: each bundle is a flat concatenation of its files into one global
scope (see `.vscode/package-web.js`), so anything here must compile standalone and
must not collide (by name) with anything else in either bundle.

| File | Purpose |
|---|---|
| `htmlHelpers.ts` | `escapeHtml`/`unescapeHtml`, `codicon(name, extraClass)` |
| `refPills.ts` | `renderTagPill`, `renderTagOverflowPill` — the small colored ref/tag badges |
| `dropdown.ts` | `Dropdown` class — the repo-selector dropdown widget (used by the tab's top bar and the sidebar) |
| `mathHelpers.ts` | `clamp(value, min, max)` |
| `outsideClick.ts` | `addOutsideClickListener(isInside, onClick)` — dismiss-on-outside-click for `Dropdown`/`CustomSelect` |
| `uiHelpers.ts` | `alterClass` (add/remove a class conditionally), `formatCommaSeparatedList`, `CLASS_SELECTED` |
| `graphConstants.ts` | `UNCOMMITTED` — the sentinel commit hash for the uncommitted-changes row, shared by the graph and the mini-graph |

Both bundles' `package-web.js` step will fail the recursive-file-collection scan if
a new file added here doesn't compile in isolation — test with `npm run compile-web`
after adding anything, not just `tsc -p web/tsconfig.json`.
