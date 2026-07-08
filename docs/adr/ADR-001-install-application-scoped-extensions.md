# ADR-001: install.ps1 marks an-dr extensions as application-scoped

## Problem

The user's own `an-dr-*` extensions are junctioned/symlinked into VS Code's shared
extensions folder rather than installed via the Marketplace or a `.vsix`.
an-dr-extensions' ADR-004/ADR-005 established why: such extensions get no `metadata` object at all in `extensions.json`, so
they belong only to whichever profile first discovered them - switching to a different
profile makes them disappear entirely.

## Decision

- `install.ps1` now sets `metadata.isApplicationScoped = true` directly in
  `~/.vscode/extensions/extensions.json` for every `an-dr.*` extension it links (new
  `Set-ApplicationScopedExtensions` function, called once after the main link loop with the
  full list of ids built during it). This is the exact same flag VS Code's own "Apply
  Extension to all Profiles" command sets (an-dr-extensions' ADR-004), so these extensions become visible and
  usable in every profile, not just the one that discovered them.
- **This deliberately overrides an-dr-extensions' ADR-004's stance** of always preferring the real VS Code
  command over hand-editing install state: `install.ps1` is a PowerShell script that runs
  outside a live VS Code process (often before VS Code has ever been opened), so there is no
  command to invoke - the interactive-extension option that made hand-editing avoidable
  doesn't exist here. The user chose this path explicitly, aware of the tradeoff, over the
  alternatives (manual one-time toggle via the grid per machine, or a bulk-toggle button in
  the grid) - both of which still require a running VS Code and a manual trigger, whereas
  this is automatic on every install/reinstall.
- Verified safe against a real copy of this machine's `extensions.json` (249 entries)
  before shipping: entries with no `metadata` at all get a fresh `{ isApplicationScoped:
  true }` object; entries with existing metadata missing the field get it added; entries
  already `true` are left alone (no spurious writes); every other id, and every other field
  on the patched entries themselves (`location`, `version`, `identifier`, etc.), is
  byte-for-byte unchanged. Confirmed a few `an-dr-*` ids already had the flag set from prior
  manual testing via the grid, confirming the toggle (an-dr-extensions' ADR-004) really does persist.
- Runs unconditionally on every `install.ps1` invocation (matching this repo's existing
  "always recompiles, `out/` existing is not a skip condition" philosophy for the same
  script) rather than once - if VS Code later resets the flag for any reason (e.g. its own
  extensions.json rewrite logic doesn't know about our injected field), re-running
  `install.ps1` reapplies it. This is printed to the user as a caveat rather than solved
  outright, since there's no way to detect "VS Code silently reset this" from the script.

## Rationale

The alternatives (manual toggle, bulk grid action) both require a running VS Code and a
remembered manual step on every new machine; writing the flag during install is the only
way to make it automatic. The risk (VS Code overwriting/ignoring a hand-edited field) is
bounded by re-running `install.ps1`, which the user already does routinely to rebuild/relink
extensions.

## Rejected alternatives

- Manual per-extension toggle via the grid's context menu: works today with zero code
  changes, but is a manual step to repeat on every machine and after every extension
  removal/reinstall that resets metadata.
- A bulk "Apply to All Profiles" action added to the grid for all an-dr-* extensions at
  once: still a manual trigger requiring a running VS Code; not chosen since full automation
  in install.ps1 was preferred.
