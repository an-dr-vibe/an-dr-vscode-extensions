# ADR-003: Status badges for disabled decoration colors

## Problem

ADR-002's theme-tinted generic file icons remain less explicit than the status
badges users need when label decoration colors are disabled.

## Decision

When `explorer.decorations.colors` is `false`, show the extension's existing colored
Git status SVGs (`A`, `D`, `M`, `R`, `C`, `T`, and `U`) instead of file-type icons.
When decoration colors are enabled, retain file-type icons and ADR-001's colored
labels.

## Rationale

SVG colors are rendered independently of Explorer decoration settings, and the
lettered badges communicate both status and color without relying on label styling.

## Rejected alternatives

- Emoji labels are visually inconsistent across platforms.
- Generic tinted file icons communicate color but not the exact change status.
