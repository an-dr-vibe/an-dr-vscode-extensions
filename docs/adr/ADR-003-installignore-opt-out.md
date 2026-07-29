# ADR-003: Extensions opt out of install.ps1 with .installignore

## Problem

`install.ps1` links every directory under `extensions/`, which is what makes
adding an extension a one-step operation. That becomes a liability for a
codebase that is not ready to run: `an-dr-com-mit-s` duplicates much of
`an-dr-commits`' command and view surface, so linking both loads two extensions
competing for the same job in the same editor.

Excluding it by editing a list inside `install.ps1` would put one extension's
state in shared tooling, and the list would drift as directories are renamed.

## Decision

An extension containing a `.installignore` file is skipped by `install.ps1`. The
installer does not build it, does not link it, and leaves it out of the
application-scoped identifier list. Any managed link a previous run created —
under the current `publisher.name-version` name or the legacy bare directory
name — is removed.

The file's contents are ignored; it holds a comment explaining the exclusion.

## Rationale

Removing the stale link is what makes the mechanism honest: without it, adding
the file would stop updating an extension that is still installed and still
loading, which is the opposite of the intent.

Keeping the marker in the extension directory keeps each extension
self-contained, consistent with `.vscodeignore` and `.gitignore` beside it, and
means the decision travels with the directory rather than with the installer.
Discovery stays automatic — the opt-out is explicit and local.

## Rejected alternatives

- Exclusion list inside `install.ps1`: puts one extension's state in shared
  tooling and silently goes stale when a directory is renamed.
- Moving the directory outside `extensions/`: breaks its relative paths and the
  repository's single location for extensions, for what is a temporary state.
- A `package.json` field: needs manifest parsing before the skip decision and
  risks shipping a non-standard field in a packaged extension.
