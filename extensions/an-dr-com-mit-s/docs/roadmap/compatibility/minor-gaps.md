# Minor non-migrated items

Small gaps between `an-dr-commits` and this staging extension that are **not**
covered by a stage of [transition-plan.md](transition-plan.md). Everything here
is under roughly 60 changed lines on its own; the plan's stages hold the large
and blocked work.

An item is _unblocked_ when the feature that owns it already exists here. The
unblocked set is currently empty: everything that could be done without first
building a larger feature has been.

## Closed

| #   | Item                                                  | What it was                                                                                                                                                     | Where it landed                             |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | `clamp` helper (`web/common/mathHelpers.ts`, 9 lines) | Three call sites hand-rolled `Math.max(min, Math.min(max, v))` — the files panel, the branch panel, and the full diff panel.                                    | `src/webview/utils/math.ts`                 |
| 2   | Branch panel folder collapse keys                     | The collapsed-folder set was keyed by path alone, and the Local and Remote sections build their trees separately, so folders sharing a name collapsed together. | Section key prefixes the path               |
| 3   | `dialog.repoInProgress.confirmAbort`                  | The abort confirmation added with the in-progress banner was unconditional.                                                                                     | `viewState.confirmAbortRepoInProgress`      |
| 4   | `branchPanel.groupsFirst`                             | The panel always sorted folders above plain refs.                                                                                                               | `BranchPanelRenderModel.groupsFirst`        |
| 5   | `branchPanel.flattenSingleChildGroups`                | A chain of single-child folders rendered as nested rows instead of one `release/7.0` row.                                                                       | `flattenSingleChildFolders` in the renderer |

## Blocked, and on what

| #   | Item                                                                                | Blocked on                                                                                                               |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 6   | Syntax highlighting in the diff panel (`web/main/syntaxHighlight.ts`, 68 lines)     | A bundled `highlight.js`. This extension has no such dependency, and adding one is a packaging decision, not a port.     |
| 7   | Submodule endpoints in the diff panel                                               | `GitFileChange` here carries no `submodule` field, so the backend cannot tell a gitlink from a file.                     |
| 8   | Ref drag-and-drop (`web/main/actions/dragDrop.ts`, `web/graphRebase.ts`, 155 lines) | The commit table renders no draggable ref pills yet.                                                                     |
| 9   | `commitDetailsView.defaultDiffMode`                                                 | Its `Quick` value names the inline diff in the commit details view, which does not exist here. Only `Full` is reachable. |
| 10  | `branchPanel.showLocalBranchUpstream`                                               | `loadBranches` returns names only; upstream tracking is not queried.                                                     |
| 11  | `defaultCommitMessage`                                                              | There is no commit UI to default a message for.                                                                          |
| 12  | `graph.showTagsInActivityBar`                                                       | Needs `contributes.views` and the activity bar graph.                                                                    |
| 13  | `repository.onLoad.*` (2 settings)                                                  | Initial branch selection is decided webview-side and has no config input yet.                                            |

## Not gaps

- `src/commandIds.ts` — superseded by `getCommandId` in `src/extension/constant/const.ts`.
- `src/editorTabUtils.ts` — its tab-matching exists to find a stray panel tab;
  `webviewPanel.ts` here holds its own panel reference and never needs to search.
- `web/main/diffPreview.ts` — one line, and part of the blocked quick-diff view.

## Known flake

`tests-ext` `repoManager > checkReposExist > returns true and removes repos that
no longer exist` runs ~600 ms against a 2000 ms Mocha timeout and has been seen
to exceed it on a loaded machine. It is timing, not behaviour.
