# ADR-001: Theme-aware change colors in the files tree

## Problem

The changed-files tree renders every file with the same foreground color, making
added, deleted, and modified files harder to distinguish at a glance.

## Decision

Decorate file resources in the changed-files tree with VS Code's native Git theme
colors. Added and untracked files use `gitDecoration.addedResourceForeground`,
deleted files use `gitDecoration.deletedResourceForeground`, and other changes use
`gitDecoration.modifiedResourceForeground`.

## Rationale

This matches the file-color treatment in `an-dr-commits` while adapting automatically
to light, dark, and custom VS Code themes.

## Rejected alternatives

- Hard-coded green, red, and yellow values would not adapt to the active theme.
- Coloring only custom status icons would leave filenames visually identical.
