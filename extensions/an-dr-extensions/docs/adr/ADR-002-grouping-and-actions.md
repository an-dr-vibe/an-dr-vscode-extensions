# ADR-002: Grouping modes, context menu, custom groups, filter

## Problem

ADR-001 covered a basic grouped grid. The user now manages hundreds of extensions and
needs faster ways to slice and act on them: a filter box, more grouping dimensions
(alphabetical, enabled/disabled, user-defined custom groups) selectable one at a time, and
a right-click context menu with the same kind of actions the native Extensions panel offers
(open, enable/disable, uninstall, copy ID).

## Decision

- **Group by** becomes a single selector (replacing the increment-5 Flat/Grouped button)
  with modes: Category (default), Alphabetical (first letter of `displayName`),
  Enabled/Disabled, My Groups (custom), and None (flat list, formerly "Flat view"). Exactly
  one mode is active at a time.
- The existing Categories visibility checklist (ADR-001) stays as a global filter — it
  hides extensions in *every* grouping mode, not only when grouping-by-category. It is
  visually separate from the Group-by selector.
- **Filter input**: a text box in the toolbar filters visible cards client-side by
  `displayName`, `id`, and `description` substring match, re-applied on every keystroke,
  composing with whatever grouping/visibility state is active.
- **Enabled/Disabled detection**: `vscode.extensions.all` only exposes *enabled*
  extensions — there is no public API to list disabled ones. We detect disabled extensions
  by scanning the extensions install directory on disk (`fs.readdirSync` on the parent of
  this extension's own `extensionUri`, the same directory every extension is installed
  into) and treating any folder whose extension ID is not present in
  `vscode.extensions.all` as disabled. This relies only on the filesystem layout VS Code
  has used for years, not on internal storage formats.
- **Enable/Disable actions do not exist.** [microsoft/vscode#201672](https://github.com/microsoft/vscode/issues/201672)
  is a request to add `workbench.extensions.enableExtension`/`disableExtension` commands
  and is labeled `*out-of-scope` by the VS Code team — there is no public *or* internal
  command to toggle an extension's enabled state by ID, undocumented or otherwise. This
  was discovered empirically during increment 10 (a guessed command name errored with
  "command not found"), correcting the increment-9 assumption that such commands existed
  in some undocumented form. The context menu has no Enable/Disable item; "Open Details"
  is the way to reach the native page's own working toggle.
- **Uninstall action**: implemented via `workbench.extensions.uninstallExtension`, which
  (along with `workbench.extensions.installExtension`) does exist, unlike the enable/disable
  pair. Wrapped so a failure surfaces as an error message instead of failing silently.
  Uninstall doesn't delete the extension's folder immediately — VS Code marks it in a
  `.obsolete` JSON file in the extensions directory and defers actual deletion to the next
  restart. The disabled-extension disk scan now skips any folder listed in `.obsolete`, or
  a freshly-uninstalled extension would incorrectly appear as "disabled" until VS Code
  cleans it up. The grid also re-renders on `vscode.extensions.onDidChange` (in addition to
  right after the uninstall command resolves), since that event reflects VS Code's actual
  settled state rather than assuming the command's promise resolving means the state is
  already consistent.
- **Split-to-details reuses an existing neighbor group.** When the grid is an editor-area
  tab, clicking a card checks `vscode.window.tabGroups.all` for a group already at
  `viewColumn + 1`; if found, it's focused via the fixed `workbench.action.focus<Nth>
  EditorGroup` commands before calling `extension.open`, instead of unconditionally calling
  `workbench.action.splitEditor` (which was creating a new split per click).
- **System category**: extensions bundled with VS Code itself (not installed under the
  user's own extensions directory) are tagged with a synthetic `System` category — detected
  by checking whether `extension.extensionUri` falls outside the extensions install
  directory, not by any category the extension itself declares. `System` is hidden by
  default (the default value of the hidden-categories `globalState`, before any user
  interaction, is `['System']` rather than empty) since these can't be uninstalled and would
  otherwise dilute a grid meant for managing hundreds of user-installed extensions.
- **Context menu**: a custom right-click menu rendered in the webview (VS Code webviews
  cannot invoke the native OS/editor context menu with arbitrary items), styled to match
  VS Code's own menu appearance. Items: Open Details, Uninstall, Copy ID, and "Add to
  group ▸" (custom groups, see below).
- **Startup Time grouping**: there is no public API for per-extension activation time
  either. "Developer: Show Running Extensions" is a native panel with no data-access API;
  "Developer: Startup Performance" opens a real document containing a markdown table under
  a `## Extension Activation Stats` heading (columns: Extension, Eager, Load Code, Call
  Activate, Finish Activate, Event, By) — confirmed against a real capture from the user's
  VS Code 1.127.0 before writing the parser, rather than guessing the format blind as we
  did (and had to correct) for the enable/disable commands. The command id is
  `perfview.show` (title "Developer: Startup Performance"), not the more guessable
  `workbench.action.showStartupPerformance` — found by fetching VS Code's own source
  (`src/vs/workbench/contrib/performance/browser/performance.contribution.ts` and
  `perfviewEditor.ts`) after the guessed id errored with "command not found". The report is
  a real markdown `TextDocument` under a custom `perf:` URI scheme via a registered
  `ITextModelContentProvider`, not a webview, confirming `onDidOpenTextDocument` is the
  right capture mechanism. We run `perfview.show`, capture the resulting document via
  `vscode.workspace.onDidOpenTextDocument`, parse that table, close the document again, and
  cache the per-extension `loadCodeMs + callActivateMs + finishActivateMs` total. Fetching
  is manual — a dedicated toolbar "Measure Startup" button — rather than an automatic side
  effect of selecting "Startup Time" in the Group by selector; opening/closing an editor
  tab as a hidden side effect of a dropdown change was surprising, and since more
  extensions can activate lazily as the session goes on (onCommand, onLanguage, etc.), a
  button the user can press again to re-measure is more useful than a fetch-once cache tied
  to the first mode switch. Buckets: `0-10ms`,
  `10-50ms`, `50-200ms`, `200ms+`, `Not measured` (extensions the report has no entry for —
  not yet activated this session, most commonly). The total ms figure is also shown directly
  on each card, in any grouping mode, once fetched — "where relevant" per the user's request,
  i.e. only for extensions the report actually measured.
- **Custom groups**: stored as a `an-dr-extensions.customGroups` setting —
  `{ [groupName: string]: string[] }` (extension IDs per group) — in `settings.json`, so it
  syncs via Settings Sync like other user preferences. This differs from the
  hidden-category/grouping-mode state (ADR-001), which stays in `globalState`
  local-only; group membership is content the user curates and would reasonably want to
  carry across machines. Groups are created inline from the context menu's "Add to group ▸
  New group..." action; membership is toggled per extension from the same submenu.

  **Superseded by ADR-006's single-group refinement**: membership is no longer an
  independent per-group toggle (an extension could originally belong to several groups at
  once) - "Add to group" is now "move to group," and each extension belongs to at most one
  custom group. See ADR-006 for the updated design and rationale.

## Rationale

A single Group-by selector avoids the combinatorial complexity of independently toggleable
grouping axes while still covering the four ways the user wants to slice hundreds of
extensions. Disk-based disabled-extension detection avoids depending on VS Code's internal
SQLite/storage.json formats, which are genuinely undocumented and have changed across
versions; the extensions install directory layout has been stable far longer. Custom groups
go into `settings.json` rather than `globalState` because, unlike "which categories are
hidden right now," the groups themselves are curated data the user is likely to want on
every machine.

## Addendum: System-hidden bug fix

Found: built-in extensions that also declare a real category (e.g. "Programming Languages")
stayed visible even with System hidden (the default). The hidden check was `every category
in hiddenCategories`, i.e. an AND across categories - correct for two *real* categories a
user might toggle independently, but wrong for System, which is meant as a blanket override
per the Decision above, not one more category to intersect. Fixed in both `renderCard`
(`gridHtml.ts`) and its client-side mirror `applyCategoryVisibility` by hiding whenever
System is present on the extension and hidden, independent of its other categories.

## Rejected alternatives

- Independently combinable grouping toggles: rejected for UI/mental-model complexity at
  this stage; can be revisited if a single mode proves insufficient.
- Reading VS Code's internal `state.vscdb` / `storage.json` for disabled-extension state:
  rejected as more fragile than the directory-diff approach and clearly out of bounds of
  any documented interface.
- Native OS context menu via a hidden `<select>` or similar trick: rejected — no reliable
  cross-platform way to get native-looking multi-item context menus with icons from inside
  a webview; a styled custom menu is the standard VS Code extension pattern (used by
  webview-heavy extensions like this repo's `an-dr-commits`).
- Custom groups in `globalState`: rejected because curated group membership is exactly the
  kind of preference Settings Sync exists for, unlike ephemeral per-machine view state.
