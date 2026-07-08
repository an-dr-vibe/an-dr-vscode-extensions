# ADR-003: Profile switching command

## Problem

The user wanted to group extensions by VS Code Profile and add/remove extensions to/from
profiles, similar to the existing "My Groups" custom-groups feature (ADR-002).

## Decision

- No grouping-by-profile, no add/remove-to-profile feature, and no reading of VS Code's
  internal profile storage. Investigation ([microsoft/vscode#226355](https://github.com/microsoft/vscode/issues/226355),
  closed *not planned*) confirmed there is no public extension API to enumerate profiles,
  read the active profile, or change profile membership programmatically — the same class
  of gap ADR-002 hit for enable/disable. Unlike the enable/disable and Startup Time cases,
  there was also no second real profile on this machine to empirically capture an internal
  file format against, so writing a parser for undocumented per-profile storage was
  rejected outright rather than attempted blind.
- The only piece implemented: a "Switch Profile..." toolbar button in the grid (always
  visible, not mode-dependent like Measure Startup), which posts a `switchProfile` message
  handled in `extension.ts` by calling
  `vscode.commands.executeCommand('workbench.profiles.actions.switchProfile')` to open
  VS Code's own native "Switch Profile..." picker. This is a real, working command (same
  kind of undocumented-but-invocable command id already used for `perfview.show` and
  `workbench.extensions.uninstallExtension`), wrapped in try/catch so a missing command in
  some VS Code build surfaces as an error message instead of failing silently. A toolbar
  button rather than a Command Palette entry matches how other one-off grid actions
  (Measure Startup, Uninstall) are already surfaced — none of them duplicate as top-level
  commands.
- No status bar entry, no display of the current profile's name: `context.globalStorageUri`
  changing path shape for non-default profiles could hint at a profile id, but that id is
  not guaranteed to match the profile's display name and reading meaning into it isn't a
  documented API either. Command Palette access is enough for "an option to change it."

## Rationale

Matches this repo's established precedent of only building on real, verifiable
capabilities (a public API, or a confirmed command/file format) rather than the
undocumented internal profile storage, which could not even be inspected on this machine.

## Rejected alternatives

- Grouping extensions by real VS Code Profile, with add/remove actions: rejected — no
  public API, and the only path (reading/writing internal `profiles.json` /
  per-profile `extensions.json`) is exactly the class of fragile, undocumented approach
  ADR-002 already rejected for enable/disable and disabled-extension detection, made worse
  here by having no second profile to verify the format against.
- Reading internal files for display only, writing via the `code` CLI: rejected for the
  same unverifiable-format reason, plus requiring `code` on PATH and spawning a process per
  action.
- Deriving the active profile's display name from `context.globalStorageUri`: rejected —
  not a documented profile-name API, and the folder id is not guaranteed to equal the
  display name.
