# `src/views/common/`

Backend code shared between `../tab/` (`TabView`) and `../sidebar/` (`SidebarView`).
Keep anything added here genuinely used by both.

| File | Purpose |
|---|---|
| `repoSelection.ts` | `RepoSelectionEvent`/`RepoSelectionSource` — the event contract both views publish/subscribe to so selecting a repo in one view updates the other |
| `repoWarmer.ts` | `RepoWarmer` — replays a repository's recorded load parameters into the shared caches so whichever surface opens next finds its data already there (ADR-026) |
| `webviewChrome.ts` | `standardiseCspSource`, `renderWebviewMetaTags`, `renderLoadingSplashHtml` — webview-shell HTML shared between `tab/webviewHtml.ts` and `sidebar/html.ts` |
