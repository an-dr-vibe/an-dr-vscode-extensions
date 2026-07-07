# ADR-010: an-dr-extensions "Add to Profile" - target a specific non-default profile

## Problem

ADR-004/ADR-005 established that VS Code has no command to enable/disable an extension or
target a specific *other* profile for install - only "Apply to All Profiles" (all-or-current)
and switching your own window's profile exist as real actions. The user asked whether a
specific extension could be added to one chosen non-default profile directly, without
switching into it.

## Decision

- Confirmed via the actual `workbench.extensions.installExtension` command handler
  (`extensions.contribution.ts`) that installing always targets the *current window's*
  profile - its typed options (`installPreReleaseVersion`, `donotSync`, `justification`,
  `enable`, `installOnlyNewlyAddedFromExtensionPackVSIX`) have no `profileLocation`. The
  underlying platform service does support an arbitrary target profile
  (`profileLocation` appears throughout `abstractExtensionManagementService.ts`), but that
  layer is only reachable from in-process services, never from an extension via
  `executeCommand`. So: no command-level way exists, confirmed rather than assumed.
- Real per-profile mechanism, read via `extensionsProfileScannerService.ts`: each profile
  has its **own** extension list, a small JSON array (`IStoredProfileExtension[]`) at
  `User/profiles/<location>/extensions.json`, entirely separate from the shared
  install-state manifest ADR-005/007 already write to. Each entry is
  `{identifier: {id, uuid}, version, location, relativeLocation, metadata}`.
  `relativeLocation` resolves against the *same shared* `~/.vscode/extensions/` directory
  the shared manifest uses - extensions are never physically duplicated per profile, only
  which ones are "owned" by which profile differs. VS Code trusts this file's contents on
  read with no cross-check against the shared manifest, so copying an existing shared
  entry's fields verbatim into a profile's own file is exactly what a real install into that
  profile would have produced.
- **Discovering profiles (id + friendly name)**: found in `User/globalStorage/storage.json`
  (a plain JSON file, distinct from the SQLite `state.vscdb` in the same directory - easy to
  miss, which is exactly what happened during an earlier investigation this session) under
  a `userDataProfiles` key: `[{location, name, useDefaultFlags}]`. `location` is not always
  a flat id - on this machine one profile's location is the nested `builtin/agents`.
- **Correction to ADR-006's addendum**: that entry dismissed an `agents` folder under
  `CachedProfilesData` as "leftover global-storage for an extension publisher, not an actual
  second profile." `storage.json` proves this wrong - `builtin/agents` is a real profile
  named "Agents." The dismissal was never written into a persisted ADR, only stated in
  conversation, so nothing else needed correcting.
- **Implementation**: `computeUserDataRoot(globalStorageUri)` in `extensionsData.ts` walks
  up from the extension's own (public, documented) `globalStorageUri` looking for an
  ancestor directory literally named `User`, since the path depth to it varies by which
  profile is currently active (`User/globalStorage/<ext>` in Default,
  `User/profiles/<id>/globalStorage/<ext>` otherwise) - rather than assuming a fixed number
  of `..` segments. `readCustomProfiles` parses `storage.json`; `addExtensionsToProfile`
  reads the shared manifest and the target profile's file (or starts from `[]` if it
  doesn't exist yet), copies matched entries across (skipping ones already present or not
  found in the shared manifest), and writes once. Verified structurally correct against
  copies of this machine's real files before running for real (same practice as ADR-007),
  since a mistake here has a larger blast radius than the shared manifest - a broken
  per-profile file risks that profile failing to load its extensions correctly.
- **UI**: a new "Add to Profile ▸" context-menu entry, parallel to "Add to group ▸," listing
  profiles by name (from `storage.json`) rather than internal ids. Deliberately shows no
  "already there" markers per profile - unlike custom groups, membership across profiles
  isn't mutually exclusive, and checking would mean reading every listed profile's own file
  just to render a menu. The result is reported instead, in an information message after
  the action (added / already present / not found counts). Doesn't touch the current
  window's own profile or `vscode.extensions.all` at all, so nothing re-renders - the
  change only takes effect the next time the *target* profile itself is loaded or reloaded,
  exactly matching how the user originally framed the request.

## Rationale

Reuses the exact verified-schema, copy-fields-from-the-shared-manifest approach ADR-007
already established for the (differently-scoped) all-profiles case, rather than inventing a
new format. Reading `storage.json` for names is read-only and used purely for display - the
actual write path only needs `location`, which is already necessary regardless of naming.

## Rejected alternatives

- Showing per-profile "already there" checkmarks in the menu: rejected - would require
  reading every listed profile's own `extensions.json` just to render a context menu,
  disproportionate to the benefit given membership isn't exclusive like custom groups.
- Assuming a fixed relative path from `globalStorageUri` to the userData root: rejected once
  it became clear the depth depends on whether the *current* window's profile is Default or
  not - the "walk up to a directory named User" heuristic handles both without needing to
  know which.
