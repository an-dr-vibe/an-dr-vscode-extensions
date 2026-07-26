# ADR-002: Colored icon fallback for disabled Explorer decorations

## Problem

ADR-001 uses VS Code file decorations to color changed-file labels, but VS Code
suppresses those colors when the user sets `explorer.decorations.colors` to
`false`. Unlike the `an-dr-commits` webview, a native tree cannot apply its own CSS
to bypass that setting.

## Decision

Keep ADR-001's label decorations when Explorer decoration colors are enabled. When
they are disabled, replace the file-type icon with a theme-aware file or repository
icon tinted with the same Git status color.

## Rationale

The fallback keeps added, deleted, and modified states visibly distinct without
overriding the user's global Explorer preference. It also stays within the native
Tree View API and adapts to the active color theme.

## Rejected alternatives

- Changing `explorer.decorations.colors` would override an unrelated user preference.
- Replacing the native tree with a webview solely for colored text would add
  disproportionate complexity and duplicate tree behavior.
