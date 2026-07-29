# ADR-016: Optional compact UI density

## Problem

The commit graph, branch and file sidebars, diff text, and Activity Bar view use comfortable
default spacing, but this limits how much repository context fits on smaller displays.

## Decision

Add the opt-in `an-dr-commits.compactUi` setting. Both webviews receive the flag in their typed
initial state and apply a `compactUi` body class. Scoped CSS reduces graph rows, sidebar and file
tree rows, and diff typography. The Commits tab keeps buttons and other controls at their normal
size; the narrower Activity Bar view compacts its controls as well. The sidebar mini graph uses a
matching 20-pixel vertical grid so SVG vertices remain aligned with commit rows.

## Rationale

A single presentation flag is predictable, cheap to render, and does not create a second markup
path. Measuring the tab's rendered table rows continues to drive its SVG graph geometry, while
the sidebar's explicit grid keeps its independently rendered SVG aligned.

## Rejected alternatives

- Browser zoom: also shrinks buttons and dialogs in the tab, contrary to the requested scope.
- Several independent density settings: more flexible, but harder to discover and keep visually
  coherent for an initial quickfix.
- Separate compact markup: duplicates rendering and interaction code.
