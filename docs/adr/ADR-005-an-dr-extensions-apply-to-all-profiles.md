# ADR-005: an-dr-extensions "Apply to All Profiles" toggle and badge

## Problem

Following ADR-004 (profile switching), the user wants to apply an extension to all VS Code
Profiles from the grid's context menu, with a visible indication on the card when an
extension is already scoped that way.

## Decision

- Unlike ADR-004's finding (no public API for profile membership), VS Code's own native
  extensions view already exposes this exact feature via a real command:
  `workbench.extensions.action.toggleApplyToAllProfiles`.
- Current state (whether an extension already applies to all profiles) is read from the
  same install-state manifest (`extensions.json`, alongside every extension folder in the
  install directory) already implicated by ADR-003's disabled-extension detection - each
  entry's `metadata.isApplicationScoped` boolean. This was confirmed against a real capture
  of this machine's own `extensions.json` (VS Code 1.127.0, 250 installed extensions) before
  writing the parser, per this repo's established practice - the field is present (as
  `false`) even though no extension on this machine currently has it toggled on.
  `readApplicationScopedIds` in `extensionsData.ts` parses this manifest once per grid
  render and marks each `ExtensionCardData.appliesToAllProfiles`; wrapped in try/catch like
  every other disk read in this file, degrading to "none scoped" on any parse failure rather
  than throwing.
- **Command argument bug found and fixed during VERIFY.** The first implementation called
  `executeCommand('workbench.extensions.action.toggleApplyToAllProfiles', id)`, based on an
  AI-summarized "quote" of VS Code's source that turned out to be a paraphrase, not the
  actual code - it invented a plausible-looking `run(accessor, id: string)` signature that
  doesn't exist. This failed identically for every extension tried (both this repo's own
  dev extensions and normally-installed ones like `streetsidesoftware.code-spell-checker`),
  which disproved the first (also wrong) theory that dev/junctioned extensions were
  special-cased. The actual cause was only found by downloading VS Code's real source
  (`extensions.contribution.ts` and `common/extensions.ts` from `microsoft/vscode` on
  GitHub) and grepping it verbatim instead of trusting a fetch-tool summary again. The real
  handler is `run(accessor, id: string, extensionArg: IExtensionArg)` where `IExtensionArg =
  { id, version, location: URI | undefined, galleryLink }`, and it matches purely on
  `extensionArg.location` via `uriIdentityService.extUri.isEqual(e.local?.location,
  extensionArg.location)` - the location isn't optional in practice, so calling with just
  the id left the third argument undefined and crashed on `.location`. The fix passes a
  second argument `{ id, version, location: extension.extensionUri, galleryLink: undefined
  }`, using `vscode.extensions.getExtension(id)!.extensionUri` as the location - the same
  URI VS Code itself uses to install the extension, so it compares equal.
  **Lesson: treat WebFetch/WebSearch tool summaries of source code as paraphrases, not
  quotes, for anything the implementation will actually depend on (exact signatures, argument
  shapes) - re-fetch and grep the raw file when the summary is going to become code.**
- Because the fix resolves `location` via `vscode.extensions.getExtension(id)`, which only
  returns enabled extensions (same public-API gap ADR-003 already worked around for
  disabled-extension detection), the toggle is only offered for enabled extensions. The
  earlier "no install metadata" hiding heuristic (from the disproven dev-extension theory)
  was removed entirely - it wasn't the real constraint. What actually gates the menu item now:
  System extensions (same as Uninstall) and disabled extensions (no resolvable location),
  checked via the card's existing `status-disabled` class rather than a new field.
- **Context menu**: a single toggle item "Apply to All Profiles" (checkmark prefix `✓ ` when
  already active, mirroring the native menu's checked-item style).
- **Card badge**: a small badge (`All Profiles`, styled with `--vscode-badge-*` variables
  like a native badge) shown next to the name when `appliesToAllProfiles` is true, in every
  grouping mode - the same "shown wherever relevant" pattern Startup Time's per-card timing
  already uses.
- **Re-render after toggling**: this command doesn't affect `vscode.extensions.all` and
  doesn't touch `settings.json`, so neither of the grid's existing re-render triggers
  (`vscode.extensions.onDidChange`, `onDidChangeConfiguration`) fire for it. The handler
  re-renders explicitly after the command resolves, the same way `uninstallExtension`
  already does.

## Rationale

Reuses the exact install-state manifest and reading conventions already established and
verified in ADR-003, rather than introducing a new file format. The command argument is
built from data the public `vscode.extensions` API already exposes (the extension's own
`extensionUri`), rather than reading or guessing at VS Code's internal representation.

## Addendum: grouping by profile / moving extensions across profiles

Investigated on request after this ADR was first written, by reading VS Code's actual
source (`userDataProfile.ts`, `extensions.contribution.ts`) rather than guessing further.
Confirmed real but insufficient:

- `workbench.profiles.actions.profileEntry.<profileId>` is registered per existing profile
  and switches to it directly; ids (not names - command titles aren't readable through the
  extension API) are discoverable via the public `vscode.commands.getCommands(true)`.
- `workbench.profiles.actions.manageProfiles` opens VS Code's native Profiles editor, where
  a human can create/duplicate/export a profile and hand-pick which extensions to carry
  over - but that per-extension selection logic lives entirely inside that editor's own
  model, not behind any invokable command.

No command lists a specific *other* profile's installed extensions, and none moves/copies
one named extension into one specific other existing profile - confirmed by reading the
actual `createFromCurrentProfile`/`exportProfile` implementations, which just open the same
interactive editor rather than doing headless data manipulation. This is an architectural
ceiling, not a documentation gap: a running window's extension host only ever sees its own
profile's extensions via any API, public or real-but-undocumented, and switching profiles
reloads the whole window (our own extension included), so there's no way to enumerate
another profile without leaving the current one. Decision: don't build a "Manage Profiles..."
shortcut or a profile grouping mode - the existing Switch Profile button and Apply to All
Profiles toggle are enough for now.

## Rejected alternatives

- Writing `isApplicationScoped` directly into `extensions.json` ourselves instead of calling
  the native command: rejected - the command already exists, is real, and goes through VS
  Code's own supported code path instead of hand-editing install state.
- A submenu (like "Add to group ▸") instead of a single toggle item: rejected as unnecessary
  complexity for a boolean with no further choices, and it mirrors the native menu's own
  single-checkbox-item design more closely.
- Hiding the item based on presence/absence of a `metadata` key in `extensions.json` (the
  first fix attempt): rejected once disproven - the actual failure had nothing to do with
  install metadata, and this heuristic would have hidden the action for dev extensions that,
  post-fix, work exactly like any other enabled extension.
