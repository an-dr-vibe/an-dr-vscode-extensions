# ADR-002: Sidebar action row, resizable graph, repo-selector parity, and unified loading splash

## Problem

The Activity Bar sidebar (`src/activityBarView/`) lagged behind the tab (`web/`) in four
ways the user called out directly:

1. The mini commit graph (`#activityGraph`) has a fixed `max-height:120px` with internal
   scroll — no way to resize it.
2. The sidebar has no Git action buttons at all beyond "Open Commits" and Refresh; the tab
   has Reset/Pull/Push in its toolbar.
3. The sidebar's repo selector collapses to a plain non-interactive `<div>` when there is
   only one repository, instead of the same dropdown widget the tab always renders
   regardless of repo count.
4. The sidebar shows nothing at all (blank webview) until the first full data fetch
   resolves, then pops in everything at once. The user wants a visible "rotating arrows"
   loading indicator during that gap, with everything else still appearing atomically once
   ready — and wants the tab's own initial load reworked to match the same
   splash-then-reveal-everything model, rather than its current
   shell-appears-instantly / table-spins-separately behavior.

## Decision

### Resizable mini-graph
Add a drag handle to the bottom edge of `#activityGraph`, following the exact technique
already used in `web/main/commitDetailsView/resizable.ts` (mousedown → mousemove computes
delta → clamp → apply, mouseup persists). Height is clamped to `[60, 400]` and persisted
globally in `ExtensionState` (not per-repo — the sidebar is a single persistent view, unlike
the tab's per-repo `commitDetailsViewHeight`).

### Sidebar action row
A new row (`#activityActionsRow`), placed directly below `#activityRepoRow`, with five
buttons: **Reset, Fetch, Pull, Push, Force Push**. Each calls the same `DataSource` methods
the tab's `src/commands.ts` handlers already use — `activityBarView/index.ts` is backend
code in the same world as `DataSource`, so it calls these directly, no message-passing
indirection needed:

- **Fetch** → `dataSource.fetch(repo, null, prune, pruneTags)` — all remotes, defaults from
  `getConfig().dialogDefaults.fetchRemote.{prune,pruneTags}`. Fires immediately, no dialog.
- **Pull** → `dataSource.pullBranch(repo, branchName, remote, createNewCommit, squash)` —
  defaults from `getConfig().dialogDefaults.pullBranch.{noFastForward,squash}`. Fires
  immediately. Remote/branch resolved from the already-subscribed Git API (`repo.state.HEAD`
  / `.upstream`), same resolution `miniGraph.ts`'s `fetchMiniGraph` already does. If pull
  fails due to unstaged changes, surface the error via `vscode.window.showErrorMessage`
  rather than porting the tab's stash-and-retry dialog flow — that's real added complexity
  for a rare edge case in a compact panel; the tab remains the place to resolve it.
- **Push** → `dataSource.pushBranch(repo, branchName, remote, setUpstream, GitPushBranchMode.Normal)`.
  Fires immediately, no dialog — the tab's own confirmation dialog is mostly remote/upstream
  configuration (redundant here since we resolve those automatically), not a safety gate.
- **Force Push** → same call with `GitPushBranchMode.ForceWithLease` (matching the tab's own
  force-push shortcut, which also defaults to the lease-checked variant over a bare force).
  Gated behind `vscode.window.showWarningMessage(..., { modal: true }, 'Force Push')` — the
  one of the five actions that can destroy remote history, so it is the one that gets real
  friction, consistent with the user's answer that routine actions should stay one-click but
  destructive ones shouldn't.
- **Reset** → target is always the current HEAD commit (read from the Git API, same as
  `miniGraph.ts` does for `head.commit`) — there's no commit graph to pick a different
  target from in this panel. Mode is chosen via a native
  `vscode.window.showQuickPick` with the exact same three labelled options and wording as
  the tab's dialog ("Soft - Keep all changes, but reset head" / "Mixed - Keep working tree,
  but reset index" / "Hard - Discard all changes"), defaulting to
  `getConfig().dialogDefaults.resetCommit.mode`, then `dataSource.resetToCommit(repo, headHash, mode)`.
  A native QuickPick was chosen over building a custom webview dialog (the sidebar has no
  dialog framework, and building one to mirror `web/dialog.ts` would be a large, one-off
  addition for a single action).

### Repo selector parity
`renderRepoSelector` (`ui.ts`) always renders the `#activityRepoDropdown` dropdown markup,
matching the tab's `Dropdown`/`setOptions()` behavior of always rendering the widget and
only auto-closing/refusing to open when there is exactly one option. The plain informational
`<div>` is kept only for the true zero-repos case.

### Unified loading splash
Both surfaces get the same visual: a centered `codicon('loading', 'codicon-modifier-spin')`
(VS Code's built-in spin utility, already bundled in the shared `media/out.min.css` both
webviews load) with "Loading..." text — the same glyph the tab's `ICONS.loading` already
uses for its per-region loading states, reused here as a full-panel splash for both:

- **Sidebar**: `resolveWebviewView` sets a minimal loading-shell HTML immediately, before the
  first `_refreshPanel()` call. The same splash reappears whenever the active repo actually
  changes (a real context switch, refetching everything), but not on routine
  file-watcher-triggered refreshes — those keep the current silent full-HTML-replace
  behavior, since flashing a splash on every keystroke-adjacent refresh would be more
  disruptive than the blank-until-ready gap it replaces.
- **Tab**: reworked (larger change, explicitly requested) to hide `#view`'s real content
  behind the same centered splash on initial load and on repo switch, removing it only after
  the first `loadRepoInfo` + `loadCommits` pair resolves and `render()` completes — so the
  toolbar, branch panel, graph and table all appear together, instead of the toolbar
  appearing instantly while the table spins its own separate "Loading..." text.

## Rationale

Every new sidebar action reuses an existing `DataSource` method already exercised by the
tab — no new git-command logic, only new call sites and native VS Code UI (QuickPick /
warning dialog) instead of a new custom dialog system. The loading splash reuses an existing
icon/class combination already shipped in the bundled CSS, so "the same animation in both
surfaces" is true by construction (same font glyph, same CSS class, same file) rather than
something that needs to be kept in sync by convention.

## Rejected alternatives

- **Single/double-click combined Pull and Push buttons (mirroring the tab exactly)**:
  rejected per explicit user request for five separate one-action buttons — avoids an
  accidental double-click triggering a force push from a small icon, and avoids porting the
  tab's rebase/merge-in-progress continue/abort tracking into the sidebar.
- **Custom webview modal for Reset (porting `web/dialog.ts`)**: rejected as disproportionate
  for one action; a native QuickPick gives the same mode selection with zero new dialog
  framework code.
- **Confirming every action (Fetch/Pull/Push/Reset/Force Push) equally**: rejected — would
  add friction to the routine actions the sidebar exists to make quick, when only Force Push
  is meaningfully destructive.
- **Leaving the tab's loading behavior untouched**: this was the smaller-scope option
  presented; the user explicitly chose the larger rework so both surfaces share one loading
  model rather than the sidebar being brought up to a standard the tab itself doesn't fully
  meet.
