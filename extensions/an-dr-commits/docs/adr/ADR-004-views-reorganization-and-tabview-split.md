# ADR-004: views/ reorganization, TabView split, sidebar protocol upgrade, and tab/editor-tab naming cleanup

## Problem

The sidebar (`src/activityBarView/`) and the tab (`src/commitsView.ts` +
`src/view/webviewHtml.ts` + `web/*`) have no shared parent structure despite being
the two "views" of this extension, and use inconsistent naming: the tab has no
`TabView` class analogous to `ActivityBarView`, its backend logic is a single
1346-line `CommitsView` file already flagged as a hotspot in this extension's own
`AGENTS.md` (file/function size guardrails: `<=350` lines/file, `<=60` lines/function),
and its message protocol (`src/types/message-protocol.ts`, a ~150-type
discriminated union with shared `base.ts` envelope types) is a materially stronger
convention than the sidebar's flat, untyped `ActivityBarMessage` (`command: string`
plus six always-optional fields, no compile-time discriminant). Separately,
`src/tabUtils.ts` already uses "tab" to mean VS Code *editor* tabs (tab-group/
duplicate-tab detection, unrelated to the Commits tab), which will collide with the
new `TabView` naming.

## Decision

1. **Folder structure**: introduce `src/views/{tab,sidebar,common}/` and, per
   ADR-003, `web/{tab,sidebar,common}/`. `src/activityBarView/` becomes
   `src/views/sidebar/`; `src/view/webviewHtml.ts` becomes
   `src/views/tab/webviewHtml.ts`; `src/commitsView.ts` becomes
   `src/views/tab/tabView.ts`.
2. **Rename**: `CommitsView` class becomes `TabView`. The webview panel's
   `VIEW_TYPE` string value (`'an-dr-commits'`) and all command IDs/persisted-state
   keys are unchanged (Behavior freeze) - only the TypeScript class/file name
   changes.
3. **Split**: `TabView`'s 68-case message switch is broken into per-concern handler
   modules under `views/tab/` (repo-lifecycle/loading actions, branch/remote
   actions, tag/stash actions, commit-graph actions, diff/file-content actions,
   working-tree actions, sidebar-batch-ref actions, misc actions), plus standalone
   extraction of the unrelated `loadFileIcons()` helper. `TabView` itself keeps
   only panel lifecycle, dispatch, and repo-selection sync.
4. **Sidebar protocol upgrade**: replace `ActivityBarMessage` with a discriminated
   union (one `Request*`/`Response*` pair per command, sharing a `BaseMessage`-style
   envelope), matching the tab's convention. Wire-level `command` string values are
   unchanged.
5. **Naming cleanup**: `src/tabUtils.ts` (VS Code editor-tab utilities) becomes
   `src/editorTabUtils.ts`, freeing "tab" to consistently mean the Commits tab
   everywhere in the codebase.

## Rationale

Once ADR-003 establishes that the sidebar and tab share a real architectural shape
(backend orchestration + shell HTML, client-side rendering bundle), giving them
symmetric folder locations and class names (`views/sidebar/` + a slimmed
orchestration class, `views/tab/` + `TabView`) makes that symmetry legible rather
than incidental. Splitting `TabView`'s switch statement was already implied by this
extension's own pre-existing hotspot-audit list, independent of this refactor's
other goals - this is the natural moment to do it, since every case is already
being re-examined for the protocol/structure work. Upgrading the sidebar's protocol
costs relatively little (~17 commands vs. the tab's ~150 types) and removes the
last major inconsistency between the two views' backend conventions. The
`tabUtils.ts` rename is a small, mechanical fix for a naming collision this
refactor would otherwise introduce.

## Rejected alternatives

- **Move + rename `TabView` without splitting the switch**: presented as the
  smaller-effort option; rejected in favor of the full split, since leaving a
  single ~1000-line switch inside a freshly-renamed file would recreate the exact
  hotspot this refactor had an opportunity to resolve, and contradicts "as much DRY
  as possible."
- **Leave `ActivityBarMessage` flat**: presented as the lower-effort option;
  rejected since it would leave the two views' backend conventions inconsistent in
  a way "make naming consistent everywhere" was explicitly meant to fix, for a
  comparatively small amount of additional typing work (~17 commands).
- **Leave `tabUtils.ts` named as-is**: rejected as a small but avoidable
  inconsistency once `TabView`/`views/tab/` exist elsewhere in the same codebase.
