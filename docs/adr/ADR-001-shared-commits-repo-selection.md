# ADR-001: Shared Commits repository selection

## Problem

The Commits Activity Bar sidebar and the main Commits tab each tracked the selected repository independently. The Activity Bar graph also needed tag labels that matched the tab's ref-pill appearance without introducing cross-world imports between backend `src/` code and browser `web/` code.

## Decision

Use an extension-host repository selection event shared by the Activity Bar view and the Commits tab. The Activity Bar emits the event when its repo selector changes, and the Commits tab emits it after its selected repo is confirmed through `loadRepoInfo`. Render Activity Bar tag labels with the same `.gitRef.tag` and `.gitRef.compact` class contract as the tab, while keeping the renderer in `src/activityBarView/`.

## Rationale

Both webviews already communicate through the extension host, so an extension-host event keeps the selection state common without coupling the two webviews to each other. The Commits tab already supports switching repo through `loadRepos` with `loadViewTo`, so repo sync can reuse the existing tab contract. The `an-dr-commits` build keeps `src/` and `web/` separate, so sharing CSS class contracts is the cleanest way to keep tag-pill behavior aligned without unsupported imports.

## Rejected alternatives

- Direct webview-to-webview messaging: rejected because VS Code webviews do not share a direct communication channel and it would bypass the existing backend message ownership.
- Importing tab render helpers from `web/` into `src/`: rejected because the extension explicitly separates backend and browser compilation.
- Persist-only synchronization through `ExtensionState`: rejected because it would not update an already-open tab or sidebar immediately.

