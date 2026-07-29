# ADR-020: Submodules as repository-boundary changes

## Problem

Git stores a submodule in its parent repository as a gitlink (mode `160000`), not as a
file blob. Commits currently discovers submodule repositories, but its change pipeline
drops gitlink metadata and later treats the path as either a regular file or a repository
shortcut. Blob-based diff and checkout operations consequently fail or leave the
submodule modified.

## Decision

- Detect gitlinks from Git's raw mode and object-ID data and carry their old/new commit
  IDs and working-tree dirtiness through the existing change protocols.
- Keep a changed submodule as a change row in the parent repository. Opening the
  submodule repository is a separate action and never replaces the parent change.
- Render a semantic submodule diff: pointer changes, available commit summaries, and
  tracked/untracked working-tree state. Do not expand nested files into the parent's
  file tree.
- Offer staging only when the parent gitlink pointer can change. Nested content must be
  committed from the submodule repository before the parent can stage that commit.
- When discarding, always offer two explicit choices: reset the pointer and tracked
  content while preserving nested untracked files, or additionally delete nested
  untracked files. Scope either operation to the selected submodule.
- Apply the same model and actions in the Commits tab and Activity Bar sidebar.

## Rationale

The parent repository owns only the gitlink commit ID. Preserving that boundary matches
Git's data model, keeps parent staging truthful, works for uninitialised submodules, and
avoids recursively loading arbitrarily large nested repositories. An explicit destructive
choice prevents a normal discard from silently deleting files that the parent repository
cannot enumerate individually.

## Rejected alternatives

- Expanding nested files into the parent file list mixes indexes and makes parent-level
  stage actions misleading.
- Treating the submodule only as a repository shortcut hides the parent gitlink change.
- Always cleaning nested untracked files makes a routine discard unexpectedly destructive.
- Always preserving nested untracked files makes it impossible to clear the parent change
  from the file list when untracked content is its only cause.
