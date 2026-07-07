# ADR-002: an-dr-extensions grid view

## Problem

There is no unified overview of installed VS Code extensions. The user wants a grid tab
showing all installed extensions, optionally grouped by category, with the ability to
hide entire categories from view and jump to an extension's details page.

## Decision

- New extension `an-dr-extensions` contributes an Activity Bar container with a webview
  view that renders the grid, plus a command to open the same grid as a full editor-area
  webview panel.
- Extension list and categories come from `vscode.extensions.all` /
  `packageJSON.categories` — VS Code's own field, not a custom convention. No extension
  authoring changes required, and third-party extensions are included.
- An extension whose `categories` array has multiple entries is rendered once under each
  category (duplicated across groups) rather than collapsed to a single "primary" one.
- Hidden-category state is stored in `ExtensionContext.globalState` (local per machine),
  not `settings.json`, so it does not sync via Settings Sync.
- Category visibility is controlled from a single toolbar button that opens an in-webview
  dropdown panel: a checkbox per category plus a "Show all" action. An earlier version put
  a Hide/Show link directly in each category header; the user rejected that mechanism in
  favor of one consolidated menu.
- Grouped-by-category vs. flat-list display is a separate view-mode toggle (its own toolbar
  button), independent of the visibility dropdown. Categories hidden via the dropdown are
  excluded from the extension set in both view modes — visibility state, not a display
  arrangement.
- Clicking a card runs the native `extension.open` command. An earlier version of this
  decision split the editor group first to force the details page beside the grid; the user
  rejected that after trying it in increment 3 — it added a stray empty editor group when
  none existed yet, because the Activity Bar *view* isn't itself an editor group to split
  from. Revisited in increment 10: when the grid is opened as a full editor-area *tab*
  (`an-dr-extensions.openGrid`), clicking a card checks `vscode.window.tabGroups.all` for an
  existing group immediately to the right (`viewColumn + 1`); if one exists it is focused
  via the fixed `workbench.action.focus<Nth>EditorGroup` commands (the only stable way to
  target a specific group — neither `extension.open` nor `tabGroups` accept a target
  ViewColumn), otherwise `workbench.action.splitEditor` creates it. This avoids piling up a
  new split group per click, which the first version of this fix did. The Activity Bar view
  still opens Details directly with no split, since it has no editor group of its own to
  split from or reuse.

## Rationale

Reusing VS Code's own `categories` field and native details page avoids inventing a parallel
taxonomy or a custom detail renderer, keeping the extension thin and consistent with the
repo's "no bundler, small and focused" convention. Global (non-synced) state matches the
user's explicit choice to keep hidden-category preference per machine rather than propagate
it via Settings Sync, unlike `an-dr-ui-control`'s activity-bar layout.

## Rejected alternatives

- Custom webview detail page per extension: rejected, out of scope — native Details page
  already covers this and avoids duplicating VS Code UI.
- Manually curated ID → category mapping: rejected in favor of reading `package.json`
  directly, since it requires no maintenance as extensions are added/removed.
- Collapsing multi-category extensions to their first category: rejected because it silently
  hides an extension from categories the author explicitly listed it under.
- Settings Sync for hidden-category state: rejected per explicit user preference for
  local-only persistence.
