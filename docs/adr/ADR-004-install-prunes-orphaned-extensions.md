# ADR-004: install.ps1 prunes orphaned an-dr entries and links

## Problem

`install.ps1` adds and updates, but never removes. When an extension is renamed,
deleted, or opted out with `.installignore`, its directory under
`extensions/` stops existing — and both the junction in VS Code's extensions
folder and, worse, the entry in `~/.vscode/extensions/extensions.json` survive
indefinitely.

The rename of `an-dr-extension-control` to `an-dr-sync` left exactly that:
an `an-dr.an-dr-extension-control` entry whose location pointed at a directory
that no longer existed. VS Code kept reading the entry, kept reporting an
extension it could not load, and no number of re-runs cleared it, because
nothing in the installer was ever responsible for deletion.

The registry is the part that matters. A stale junction is invisible once its
target is gone, but a stale entry is what the editor actually reports.

## Decision

Every run reconciles `extensions.json` against what that run linked.

An entry is pruned when all of the following hold:

- its identifier begins with `an-dr.`;
- this run did not link it;
- its location resolves to a path that is absent, or that is a managed link.

Any managed link the entry pointed at is removed with it. Separately, an
`an-dr.*` managed link whose destination path this run did not create is removed
even when no entry references it.

Everything else is left untouched: extensions from the Marketplace, an `an-dr.*`
entry backed by a real directory (a manual `.vsix` install), and any entry whose
location cannot be resolved at all.

## Rationale

The prune conditions are deliberately narrow, because the failure modes are
asymmetric. Leaving a stale entry costs a confusing editor message; deleting a
live one costs the user an extension they installed on purpose. Every condition
is therefore positive evidence that the installer itself created the thing being
removed — the `an-dr.` prefix, the absence from this run's link list, and a
location that is either gone or is a junction this repository owns.

An unresolvable location is treated as "keep" for the same reason. It is not
evidence of an orphan, only evidence that the entry was written in a form this
script does not parse, so it must not trigger deletion.

Reconciliation runs unconditionally, including when nothing was linked. That is
precisely the case where every `an-dr` entry is an orphan, so an early return on
an empty list would skip the cleanup that matters most.

Orphaned links are matched by comparing against the destination paths the main
loop created, rather than by parsing a version off the directory name. The
`publisher.name-version` shape is a convention, and a version that is not a
semver triple would parse into the wrong identifier and delete a live extension.

## Rejected alternatives

- **Prune any entry whose directory is missing, `an-dr` or not:** makes the
  installer responsible for extensions it did not install, and one unusual
  location format would remove a working Marketplace extension.
- **Prune every `an-dr.*` entry not linked by this run:** deletes a manually
  installed `an-dr` `.vsix`, which is a legitimate thing for the user to have.
- **A one-off cleanup script:** fixes the instance and not the cause; the next
  rename recreates it.
- **Letting VS Code clean up after itself:** it does not. The entry survived
  every restart and every re-install until it was removed explicitly.
