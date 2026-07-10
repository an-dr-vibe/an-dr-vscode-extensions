# ADR-002: Renamed to an-dr-sync, config/command namespace broken on purpose

## Problem

The extension was named `an-dr-extension-control` / `extensionControl.*`,
which undersold what it does (keep the repo in sync: pull, rebuild, reload,
and now an automatic startup check) and read awkwardly next to the new
startup-check feature.

## Decision

Renamed the extension end-to-end:

- Folder: `extensions/an-dr-extension-control/` → `extensions/an-dr-sync/`
- Package `name` / `displayName`: `an-dr-extension-control` /
  `an-dr: Extension Control` → `an-dr-sync` / `an-dr: Sync`
- Command ids: `an-dr-extension-control.*` → `an-dr-sync.*`
- Command titles: `Extension Control: *` → `Sync: *`
- Config section: `extensionControl.*` → `sync.*`

This is a breaking change for any existing `extensionControl.*` entries in
`settings.json` (most likely just a custom `repoPath`) — they silently stop
applying and must be re-entered under `sync.*`.

## Rationale

A clean, fully-consistent rename was chosen over a display-only rename
because this is a single-user, unpublished extension pack with no external
consumers — the only "breakage" is the author's own `settings.json`, a
one-time, easily fixed cost. Keeping the old `extensionControl.*` key
alongside a new "Sync" display name would leave a permanent naming mismatch
for no real benefit.

## Rejected alternatives

- **Display-only rename, keep `extensionControl.*` / `an-dr-extension-control.*`
  under the hood** — zero settings breakage, but permanently inconsistent
  naming between what the extension is called and how it's configured.
