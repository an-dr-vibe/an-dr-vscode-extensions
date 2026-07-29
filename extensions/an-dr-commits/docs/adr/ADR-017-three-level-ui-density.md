# ADR-017: Three-level UI density

## Problem

ADR-016 added one optional compact presentation. That density is a better general default, while
some users still need the former spacious layout and others want to fit even more repository
context on screen.

## Decision

Supersede ADR-016's boolean setting with `an-dr-commits.uiDensity`, offering `Big`, `Normal`, and
`Compact`. `Big` preserves the original layout, `Normal` uses ADR-016's compact layout and becomes
the default, and `Compact` adds a tighter layer. The Commits tab continues to exclude buttons and
other controls from density changes. Activity Bar controls follow the chosen density.

Remove ADR-016's `an-dr-commits.compactUi` setting instead of retaining a second public route to
the same behavior. The two denser sidebar modes use 20- and 18-pixel mini-graph grids to match
their commit rows.

## Rationale

Named levels make the former and new layouts discoverable without multiplying component-specific
settings. Layered body classes reuse the balanced rules and keep the compact delta small.

## Rejected alternatives

- Remove the old layout: gives existing users no way to retain its larger targets and spacing.
- Keep the boolean and add a second toggle: creates ambiguous combinations.
- Apply browser zoom: also changes tab controls and dialogs, outside the requested scope.
