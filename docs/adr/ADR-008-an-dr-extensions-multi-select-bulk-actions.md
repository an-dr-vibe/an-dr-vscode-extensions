# ADR-008: an-dr-extensions multi-select and bulk context-menu actions

## Problem

Acting on one extension at a time via the context menu (ADR-003) doesn't scale once you're
managing hundreds of extensions - e.g. uninstalling a batch, or adding several to the same
custom group, each took one right-click per extension.

## Decision

- **Checkbox placement**: a small checkbox sits below each card's icon, in an `.icon-col`
  flex column (`grid-column: 1; grid-row: 1 / 3`) wrapping both. The first version placed
  icon and checkbox as separate grid children sharing that same spanning cell
  (`align-self: end` on the checkbox, relying on the cell usually being taller than 32px
  because of the name/description rows) - this overlapped on short cards (a one-line
  description leaves the cell barely taller than the icon itself), confirmed by a real
  screenshot during VERIFY. The flex-column wrapper stacks them unconditionally regardless
  of description length: if their combined height ever exceeds the name/description rows'
  height, the grid row (which auto-sizes to its tallest content) just grows to fit, rather
  than overlapping. A checked card also gets a highlighted background/border
  (`--vscode-list-inactiveSelectionBackground`).
- **Explorer-style keyboard/mouse selection**: Ctrl(/Cmd)-click toggles one card's checkbox
  without opening its details; Shift-click selects the visible-card range between the last
  touched card (`selectionAnchorId` - updated by checkbox clicks and ctrl-clicks) and the
  clicked one, replacing the current selection (no Ctrl+Shift additive-range combo -
  deliberately out of scope, single-range shift-click covers the requested behavior);
  Escape clears the selection. A **plain click still opens Details unconditionally** - this
  is a deliberate deviation from full Explorer parity (where a plain click would just
  select, and double-click would open); changing that would alter the grid's core,
  long-standing single-click-to-open interaction, which wasn't part of the request. Range
  selection only considers currently visible cards (`visibleCardIds`, excluding
  filtered/category-hidden ones), so a range spanning a hidden card doesn't silently select
  something the user can't see.
- **Selection is a client-side `Set`**, persisted through `vscode.setState()` alongside the
  existing filter/scroll state (ADR-002/003) so it survives the full-document re-renders
  this webview does on every state change, and cleared automatically after any bulk action
  completes.
- **Right-click routing**: right-clicking a *checked* card opens a bulk-mode menu acting on
  every checked id; right-clicking an *unchecked* card keeps today's unchanged single-item
  menu, regardless of what else happens to be checked. This matches the standard
  multi-select convention (VS Code's own Explorer behaves the same way) and required no new
  design vocabulary - the existing context menu DOM is reused for both modes, just with
  different item visibility/labels/click targets.
- **Bulk menu excludes Open Details** (per explicit request - it has no sensible meaning for
  multiple extensions) and shows a count on every remaining item, e.g. "Uninstall (3)".
- **Toggle-style actions become additive-only in bulk.** Apply to All Profiles and Add to
  group are per-extension toggles for a single card, but "on for some, off for others" has
  no single sensible bulk action - bulk mode only ever turns them *on* (applies to all
  profiles / adds to the group), never off. The "Add to group" submenu drops its per-group
  checkboxes in bulk mode (mixed membership across several extensions has no one checkbox
  state to show) in favor of plain buttons that add every selected id to the clicked group.
- **Ineligible items are silently filtered per action, not blocked entirely.** Uninstall and
  Apply to All Profiles already hide themselves per-card for System/disabled extensions
  (ADR-005); in bulk mode the same eligibility check runs per selected card, and only the
  eligible subset is sent to the extension host - e.g. selecting 5 extensions where 1 is
  System still uninstalls the other 4, rather than blocking the whole action or silently
  including the ineligible one.
- **Bulk writes are batched, not looped per id**, where the underlying operation supports
  it: `GridState.bulkSetGroupMembership` builds the updated group membership set once and
  writes `settings.json` a single time (the original per-id `setGroupMembership` is now a
  one-element call to this), so a multi-item "Add to group" fires one
  `onDidChangeConfiguration` event (and one re-render) instead of one per selected
  extension. Uninstall and Apply to All Profiles have no batch command in VS Code itself,
  so those still loop one `executeCommand` call per id, collecting failures into a single
  summary message instead of one error message per id.
- **Copy ID never clears the selection** - it's non-destructive and a plausible thing to do
  more than once or alongside another action, unlike uninstall/apply-to-all/add-to-group
  which all clear it since they represent a completed batch operation.

## Refinement: checkboxes hidden until a selection exists

Checkboxes on every card by default cluttered the grid for the common case of not
multi-selecting anything. They're now `visibility: hidden` (not `display: none`, so the
`.icon-col` layout space is still reserved and nothing shifts when a selection starts or
ends) until `document.body` gets a `selecting` class, toggled whenever `checkedIds.size`
transitions to/from zero. Ctrl-click (or the checkbox itself, once visible) is how a
selection actually starts; there's no separate "enter selection mode" affordance needed
since Ctrl-click already exists regardless of checkbox visibility.

## Refinement: custom groups become single-membership ("move", not "add")

On request, custom groups (ADR-003) changed from "an extension can belong to any number of
groups, toggled independently per group" to "an extension belongs to at most one group at a
time." This actually *simplified* the bulk-vs-single distinction described above: since
there's no per-group checkbox state to show either way now (a single extension has one
current group, or none; several selected extensions could each have a different one, which
was already unrepresentable as a single checkbox state), single- and bulk-mode now share
one code path in `renderGroupsList` - clicking a group name always means "move the target
id(s) here," with a "Remove from group" item to clear membership back to Ungrouped. This
replaces the `setGroupMembership`/`bulkSetGroupMembership` message pair (which took a
`member: boolean` toggle) with a single `moveToGroup(group: string | null, ids: string[])`,
implemented in `GridState.moveToGroup` by rebuilding the whole `customGroups` map: strip the
moved ids from every existing group, then add them to the target group (skipped entirely if
`group` is `null`). Existing data from before this change, where an id might already appear
in more than one group, is not proactively migrated - it self-corrects lazily the next time
that particular id is moved again, rather than eagerly rewriting `settings.json` for
everyone on first load.

## Rationale

Reusing the existing single-item context-menu DOM and message protocol (adding
`bulk*`-prefixed message variants rather than a parallel UI) kept the change proportional to
the feature - no new menu component, no new selection-model library, just a `Set` and a
routing branch on whether the right-clicked card is checked.

## Rejected alternatives

- A dedicated "Actions" toolbar button/dropdown for bulk operations instead of routing
  through the existing context menu: rejected per explicit request to keep bulk actions "all
  from the context menu."
- Preserving toggle semantics in bulk (e.g. a tri-state "some on, some off" indicator with a
  menu that sets all-on or all-off explicitly): rejected as unnecessary complexity for an
  action a user is very unlikely to want in the "turn off for everyone" direction in bulk;
  turning individual items off is still available one at a time via the unchanged
  single-item menu.
