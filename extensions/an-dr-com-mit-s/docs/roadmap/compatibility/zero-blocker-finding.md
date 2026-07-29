# There is no zero-risk port

This was supposed to be the easy increment: port the files whose only
dependencies are `vscode`/Node builtins, wire them in, done. It turned out
empty, and the reason is worth recording because it will recur.

## What was checked

Every `YOURS` file whose imports are _also_ `YOURS` in the old tree:
`src/repositoryGraphCache.ts`, `src/commandIds.ts`, `src/editorTabUtils.ts`,
`src/views/common/repoSelection.ts`, `src/views/sidebar/ui.ts`,
`src/views/tab/fileIcons.ts`. All six have zero cross-file imports at all —
about as portable as code gets.

## Why none of them port today

The earlier import-graph analysis answered _"does this file's code compile
once moved?"_ It never answered _"does anything in staging call it?"_ — and
for all six, nothing does:

- `ui.ts`, `repoSelection.ts` render or type the Activity Bar sidebar, which
  does not exist in staging yet.
- `commandIds.ts` lists command IDs including `viewFromStatusBar` and
  `revealCommitInGraph`, neither of which exists in the current 9-command
  target either — it describes a slightly different command set than the one
  this transition is porting to.
- `editorTabUtils.ts` is a generic tab-matching helper with no current caller;
  staging's `webviewPanel.ts` tracks its single panel with a variable, not by
  scanning tabs.
- `fileIcons.ts` (see below) has a real insertion point, but reaching it needs
  a new request/response message pair — a small design decision, not a copy.
- `repositoryGraphCache.ts` keys its cache on the old `DataSource`'s request
  shape (multi-branch arrays, `stashKeys`, `hideRemotes`, a string-enum
  `commitOrdering`). The new `loadCommits(git, { branchName, maxCommits, ... })`
  takes a single branch name and has no stash or ordering concept yet.
  Wiring this cache in means redesigning its key, not moving it.

**"Imports only `YOURS` files" describes portability within the old tree. It
says nothing about whether staging has anywhere to put the result.** The two
questions are independent, and conflating them is the same mistake as the
`web/` global-scope trap from the roadmap's _Porting locally authored code_
section, one layer up: that trap was about missing imports; this one is about
present imports pointing nowhere yet.

## `fileIcons.ts`, ported

This one had a genuine, findable insertion point:
`generateGitFileTreeHtml` (`src/webview/main.ts`) rendered every file in a
commit's file tree with one generic `svgIcons.file`, with no per-extension icon
lookup at all. It is ported now — `src/extension/fileIcons.ts` (extension
host) and `src/webview/utils/fileIcons.ts` (pure lookup). The mechanism turned
out simpler than a first guess suggested: staging already bakes a
`GitGraphViewState` blob into the panel's HTML at creation
(`src/extension/webviewHtml.ts`), the same role the old `loadFileIcons()`
filled in the pre-transition `tabView.ts`. Adding one field to that existing
state — `fileIcons: loadFileIcons()` — was enough; no new message was needed.
A guess that this would require a new request/response pair, made before
reading `webviewHtml.ts`, was wrong.

## What changes

There is no separate zero-blocker increment; `fileIcons.ts` proved that even
the easiest real port needs _some_ wiring decision, just sometimes a small
one. The other five files above still have nowhere to go: they wait for the
features that would call them — the sidebar, or a cache redesigned against the
new `loadCommits` request shape.
