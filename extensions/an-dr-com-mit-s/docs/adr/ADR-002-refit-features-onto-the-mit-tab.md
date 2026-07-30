# ADR-002: Re-fit authored features onto the MIT tab rather than porting the 2.x tab

## Problem

The transition assumed that code the author wrote themselves could be carried
over, with only baseline expression reimplemented. That holds for services and
self-contained features. It does not hold for the 2.x tab.

The tab's own glue — `web/main/tableRender.ts`, `constructorInit.ts`,
`loadProcessing.ts` and the panels — is `YOURS` and relicensable, but it is not
standalone. Those files are `GitGraphView` methods extracted into free
functions taking `view`, with 68, 125 and 200 references back into it. Between
them they touch 123 view members, of which **93 do not exist** in the MIT
extension's view.

Those 93 are not merely fields to add. They are backed by the tab substrate the
authored code was written against, and that substrate is baseline:

| File                    | Baseline | Lines |
| ----------------------- | -------: | ----: |
| `web/textFormatter.ts`  |     100% |   397 |
| `web/graph.ts`          |      91% |   419 |
| `web/settingsWidget.ts` |      87% |   345 |
| `web/main/fileTree.ts`  |      85% |   142 |
| `web/customSelect.ts`   |      83% |   161 |
| `web/utils.ts`          |      82% |   409 |
| `web/dialog.ts`         |      82% |   362 |
| `web/contextMenu.ts`    |      80% |   117 |
| `web/findWidget.ts`     |      76% |   292 |

That is roughly 2,644 lines the provenance rule excludes. The authored tab code
sits on top of Git Graph's tab; separating one from the other is not a matter of
effort, because what remains after removing the baseline is glue with nothing to
glue to.

## Decision

Keep the MIT extension's own tab. Authored features are **re-fitted** onto it
one at a time, adapting each to the equivalents the MIT base already provides.
The 2.x tab is not reproduced, and the tab spine and panels are not ported in
their existing form.

## Rationale

Re-fitting is the only approach that has actually shipped working features here.
Tag pills, file-type icons, author avatars and initials, inline blame, and the
repository status monitor all landed this way, each adapted rather than copied —
`codicon` became `svgIcons`, a `view`-coupled avatar API became plain
parameters, blame moved onto a cancellable spawn.

The pattern also predicts which features are cheap. A feature is re-fittable in
proportion to how little of the old tab it needs: inline blame required none of
it and was straightforward, while `changesPanel` and `tableRender` require most
of it and are not.

Every re-fitted increment ships something observable, which matters after a
transition that once marked eighteen increments complete while shipping dead
modules.

## Consequences

- The tab will not look or behave like the 2.x tab. Features return
  individually, in MIT-native form.
- Features that exist only as tab UI — the find widget, settings widget,
  dialogs, context menus, the branch and changes panels, column visibility and
  widths — do not return without first reimplementing the substrate beneath
  them.
- The 5,134 `YOURS` lines are not uniformly recoverable. The recoverable share
  is the part that is self-contained; the rest is blocked behind baseline, and
  estimates must stop treating the total as portable work.
- Settings tied to unported tab UI stay unimplemented, and must not be declared
  before the feature that reads them exists.

## Rejected alternatives

- **Reimplement the baseline substrate, then port the tab.** Restores a 2.x-like
  tab, but ~2,644 lines of dialogs, context menus, find, graph rendering and text
  formatting must be authored fresh before any of the ported tab code runs. It is
  the largest item in the project, entirely design work, and delivers nothing
  observable until nearly complete.
- **Port the tab spine incrementally.** Not available: the spine's 93 missing
  view members mean nothing runs until most of the substrate exists, so the
  increments cannot be made independently shippable.
- **Abandon the MIT transition.** The provenance goal is still met for services
  and self-contained features, and the extension is already usable.
