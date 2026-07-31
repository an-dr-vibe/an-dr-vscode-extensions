# Tab UI parity with 2.0

What the MIT tab still owes the 2.0 tab, written 2026-07-31 after the tab UI
parity branch. Derived from reading all 174 commits of `an-dr-commits` plus the
29 that precede its rename from `an-dr-git`, so the entries below are what the
maintainer actually solved, not a wish list.

The complementary documents are [transition-plan.md](transition-plan.md), which
owns the cutover stages, and [minor-gaps.md](minor-gaps.md), which owns gaps
under ~60 lines. This file owns the tab's look and behaviour.

## Delivered on the parity branch

| Area             | What landed                                                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Toolbar          | Icon-only buttons in 2.0's groups, repo dropdown over the sidebar, overflow into a more menu, combined fetch/pull, Reset to HEAD |
| Layout           | Fixed viewport body with a single `#view` scroll container and a sticky top bar                                                  |
| Commit table     | 2.0's four-column layout, graph gutter merged into the message cell and indented per lane, date folded into the Dev cell         |
| Reference labels | Solid pills tinted with the commit's lane colour, light-theme darkening, the five muted default lane colours                     |
| Selection        | Click selects and previews, double click opens, Ctrl/Cmd and Shift extend, two commits compare, Escape unwinds a layer at a time |
| Files panel      | One changed-file tree, in the panel only                                                                                         |

## Remaining, in dependency order

### 1. The uncommitted row is not a commit row

2.0 renders it as `.commit` with `id="uncommittedChanges"`; here it is
`.unsavedChanges`. It therefore cannot be selected, hovered, or styled with the
rest of the table, and every rule written for `.commit` has to be repeated or
widened for it. This is the root cause behind the oversized avatar fixed on the
branch, and it will keep producing that class of defect until the row joins the
same model.

Do this first: the branch panel and changes panel work below both assume a
uniform row model.

### 2. Branch panel: auto-hide, quick filters, detached HEAD

- Collapse the panel by CSS when the graph area drops below ~300px, restoring
  on resize (`efc4890`, with the flicker and threshold fixes `a1cb02c`,
  `532c607`).
- Default / Merged / Show Remotes filter buttons (`4d918a4`, `c54171a`).
- HEAD badge, auto-selected HEAD filter in detached state, and the
  double-click-checkout warning (`345a98b`, `2d04d67`, `dcd0ad4`, `ef65b89`).

### 3. Reset as independent checkboxes

`041b31c` replaced a confirmation with six independent options — `reset --hard`,
`clean -fd`, `clean -fdx` and the rest. The branch shipped a soft/mixed/hard
select instead, so this is a rework, and it needs backend actions for the clean
variants that do not exist yet. Note `e62faf3`: `git clean` has no
`--recurse-submodules`.

### 4. Uncommitted changes panel and the commit workflow

The largest remaining feature, and the cheapest large one:
`web/changesPanel.ts` is **433 lines at 0.0% baseline**, so it ports rather than
needing clean-room work.

- The panel itself (`40a0aeb`, `5124ccf`, `8a3950b`).
- Stage, commit, amend, `defaultCommitMessage`, auto-stage (`2c7f3d7`,
  `11295d6`).
- Discard-changes option dialog and Ignore File (`867f543`).

### 5. Visual polish

- Remove decorative `pointer`, `grab` and `help` cursors; keep the resize
  cursors, which are functional feedback (`d5b2693`).
- Compact reference labels (`e050cf7`).
- Move the find widget into a `#searchPanel` row inside the controls, as 2.0
  does, rather than a floating fixed widget (`02d0110`).
- The "Graph" column header still centres; it should sit left.

### 6. Send to Code Review

Depends on the selection model, which is now in place. The provenance audit is
already done — see
[review-hunks/send-to-code-review.md](review-hunks/send-to-code-review.md):
the behaviour in `web/main.ts` is clear to relicense, the styling is clear but
useless here because it targets `.codicon` elements this extension does not use.

## What the provenance data allows

Measured, not assumed. Re-run `check-provenance.js --annotate <file>` before
copying: classification is per line, not per file.

| Source                      | Baseline | Verdict                                                          |
| --------------------------- | -------: | ---------------------------------------------------------------- |
| `web/changesPanel.ts`       |     0.0% | Port directly                                                    |
| `web/main/tableRender.ts`   |     1.7% | Port directly                                                    |
| `web/main/avatarVisuals.ts` |     1.4% | Port directly                                                    |
| `web/main.ts`               |    12.2% | Annotate first; the send-to-review path is all authored          |
| `web/styles/main.css`       |    22.3% | Annotate first; mixed **within** single rules                    |
| `web/utils.ts`              |    82.4% | Do not copy — this is where `ICONS` and `addSingleDblClick` live |
| `web/graph.ts`              |    90.9% | Do not copy — `getWidthsAtVertices` had to be re-derived         |

The two 80%+ files matter more than their size suggests: between them they hold
the icon set and the graph geometry, so anything reaching for either has to be
authored against this extension's own API instead.

## Lessons the branch paid for

- **The stylesheet is untested ground.** jsdom applies no CSS, so every
  rendering defect on this branch — the hidden graph, the unsized avatar, the
  clipped ID column — passed the whole DOM suite. `tableRegressions.test.ts`
  asserts against the stylesheet text for that reason.
- **Persisted state outlives the layout that wrote it.** Column widths were
  saved as a positional array; changing the column count made the old array
  index past the end and throw mid-render, which cost the click listeners and
  the graph at once. Anything persisted per column needs a shape check on read.
- **One exception mid-render costs everything after it.** `renderTable` builds
  markup, sizes columns, then attaches listeners. A throw in the middle leaves a
  table that looks fine and responds to nothing. Prefer attaching listeners
  before optional layout work.
