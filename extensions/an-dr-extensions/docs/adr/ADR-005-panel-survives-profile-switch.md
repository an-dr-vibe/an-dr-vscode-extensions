# ADR-005: Grid survives the extension-host restart on profile switch

## Problem

The user wants the grid's enabled/disabled status to auto-refresh when the active VS Code
Profile changes, instead of showing stale data from before the switch.

## Decision

- Read VS Code's actual profile-switch implementation
  (`userDataProfileManagement.ts`, `changeCurrentProfile`) rather than assuming a full
  window reload happens. On a **local** (non-remote) window, switching profiles does
  **not** reload the window - it calls `extensionService.stopExtensionHosts()` then
  `startExtensionHosts()`, restarting every extension's activation in place. Only remote
  windows show a reload prompt and call `hostService.reload()`.
- Because of this, our own `activate()` runs again fresh on every profile switch (fresh
  `GridState`, fresh `activeWebviews`), so:
  - The Activity Bar sidebar view needs no change - `resolveWebviewView` is invoked again
    by VS Code when the view becomes visible under the new extension host, and it already
    calls `renderGrid` with fresh data (`vscode.extensions.all` already reflects the new
    profile's actual enabled set by the time this runs).
  - The **editor-tab panel** (`Extensions Grid: Open in Editor Tab`) was the real gap: VS
    Code does not automatically recreate an open `WebviewPanel` after an extension-host
    restart unless the extension registers a `WebviewPanelSerializer` for that panel's view
    type. Without one, a grid left open as an editor tab simply vanished on profile switch
    instead of reappearing with the new profile's data.
- Fixed by registering `vscode.window.registerWebviewPanelSerializer(GRID_PANEL_VIEW_TYPE,
  ...)`, whose `deserializeWebviewPanel` calls the same `setupGridPanel` helper the
  `openGrid` command now shares, so the recreated panel renders fresh state immediately.
  The webview's own filter-text/scroll-position persistence (`vscode.setState`/`getState()`
  in `gridHtml.ts`) already survives this the same way it survives a normal window reload -
  no extra plumbing needed for that part.
- Removed a dead `an-dr-extensions.switchProfile` command registration left over from
  ADR-003's first draft (before the Switch Profile action became a toolbar button posting a
  message instead of a top-level command) - it was never contributed in `package.json` and
  was unreachable.

## Rationale

Fixing this at the panel-recreation layer (a serializer) is the documented, correct
mechanism VS Code provides for exactly this situation - surviving an extension-host
restart - rather than trying to detect "a profile switch happened" ourselves, which has no
dedicated public event to listen for.

## Correction: the sidebar assumption was wrong

Real-world testing (switching profiles via the grid's own Switch Profile button) showed the
sidebar view does *not* self-heal as this ADR originally claimed: it kept showing the old
profile's enabled/disabled list, and clicks inside it (including the Switch Profile button
itself) stopped doing anything - "UI without logic," per the user's own description. The
underlying assumption - that VS Code re-invokes `resolveWebviewView` for a fresh provider
registration after the old extension host dies - is contradicted by
[microsoft/vscode#109625](https://github.com/microsoft/vscode/issues/109625): once a view has
been resolved, a later `registerWebviewViewProvider` call for the same view id does not
trigger `resolveWebviewView` again while the view stays visible. The webview's DOM/JS
persists (the renderer/window itself never reloaded), but its message channel to the new
extension host is never (re-)established, so it's orphaned: still visible, completely
unreachable.

There is no per-extension public API to force VS Code to re-resolve an orphaned view, and no
public "profile changed" event to react to in general. The only reliable fix is a real
window reload, which properly recreates every webview from scratch (this is also when the
`WebviewPanelSerializer` from the main Decision above actually does its job). Since
switching profile itself doesn't reload the window, `switchProfile()` now also writes a
plain OS-temp-dir marker file (`PROFILE_SWITCH_MARKER`, in `extension.ts`) just before
triggering the native picker - not `context.globalState`, which turned out to still be
`StorageScope.PROFILE` even for an application-scoped extension (confirmed by reading
`extensionStorage.ts`'s `getExtensionStateRaw`/`setExtensionState`, which branch on
`global ? StorageScope.PROFILE : StorageScope.WORKSPACE` with no application-scope check at
all) - so a value written in the old profile would have been invisible to the new one.
`checkPendingProfileSwitch()` runs at the top of the next `activate()`; if the marker is
present, it prompts the user to reload the window, which is the one thing that reliably
fixes the staleness.

**This only covers profile switches triggered through our own Switch Profile button.**
Switching via VS Code's native Command Palette, the Profiles editor, or the per-profile
`workbench.profiles.actions.profileEntry.<id>` quick actions gives us no hook at all, so the
grid can still go stale via those paths with no prompt - a real, currently-accepted gap.

## Second correction: the marker was being wiped before the new host could see it

The first version of this fix cleared `PROFILE_SWITCH_MARKER` in both the success branch
*and* the `catch` branch of `switchProfile()`, on the assumption that a host-killing restart
would leave the `await vscode.commands.executeCommand(...)` call hanging forever (never
resolving, never rejecting) rather than throwing. Real-world testing showed no reload
prompt ever appeared, confirming that assumption was wrong too: the extension-host RPC
layer evidently rejects in-flight calls when the host they were talking to is torn down, so
execution lands in the `catch` block - which then immediately deleted the very marker the
new host needed to find. Fixed by no longer clearing the marker on error at all; the only
cost is a possible unnecessary reload prompt on some later, unrelated activation if the
command fails for a genuinely different reason, which is a much smaller problem than the
signal being silently lost on every real switch.

## Third refinement: fix the editor tab in place instead of asking for a reload

The user pushed back on requiring a full window reload at all. Unlike a `WebviewView`,
editor-area webview panels are independently enumerable through the fully public
`vscode.window.tabGroups` API even when orphaned (a `Tab`'s `input` can be inspected without
any live connection to the extension host that created it). `checkPendingProfileSwitch` now
calls `reopenStaleGridTabs`, which finds any tab whose `input instanceof
vscode.TabInputWebview` with a `viewType` containing `GRID_PANEL_VIEW_TYPE`, closes it via
`vscode.window.tabGroups.close(tab)`, and immediately recreates a fresh panel in the same
`viewColumn` via the same `setupGridPanel` helper the `openGrid` command and the panel
serializer already share - fully automatic, no reload, no prompt. The reload-window message
is now only shown as a fallback when no such tab was found (most likely meaning only the
sidebar view was open, which still has no equivalent automatic fix - see the second
correction above).

## Rejected alternatives

- Polling or file-watching for a profile change signal: rejected - unnecessary once the
  real mechanism (extension-host restart) was understood; the existing `activate()`
  lifecycle already provides the refresh point for free.
- Persisting grid state across restarts via `globalState` and manually reopening the panel:
  rejected - `registerWebviewPanelSerializer` is the mechanism VS Code already provides for
  this exact case and requires no manual reopening logic.
