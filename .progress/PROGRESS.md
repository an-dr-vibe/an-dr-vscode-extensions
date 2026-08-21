# Progress

**Flow:** Quick
**Phase:** COMMIT
**Goal:** VS Code registry keeps a ghost entry for an-dr.an-dr-extension-control (renamed to an-dr-sync); install.ps1 never prunes orphaned an-dr.* links or extensions.json entries
**Done when:** an-dr.an-dr-extension-control is gone from extensions.json; a re-run of install.ps1 leaves no orphaned an-dr.* entry or link; renaming/removing/ignoring an extension self-cleans on the next run; docs (AGENTS.md architecture notes) reflect the behaviour.
**Constraints:** Prune only an-dr.* IDs that this run did not link AND whose directory is absent or is a managed junction into this repo; never touch Marketplace extensions or real non-link directories. PowerShell 7, no new dependencies.
**Out of scope:** No changes to any extension's own source; no new an-dr-extension-control extension; no pruning of non-an-dr extensions; no bundler or test framework.

## Requests

- Fix the missing/broken extension: remove the ghost an-dr.an-dr-extension-control entry from VS Code's extensions.json
- Update install.ps1 so orphaned an-dr.* links and registry entries are pruned automatically on every run and this never recurs

## Questions

- [x] How aggressive should orphan cleanup be? — Only an-dr.* managed links: prune registry entries and links for an-dr.* IDs not linked this run whose directory is absent or is a junction into this repo. Never touch Marketplace extensions or real directories.

_Last updated: 2026-08-21T17:33:28.4741440Z_