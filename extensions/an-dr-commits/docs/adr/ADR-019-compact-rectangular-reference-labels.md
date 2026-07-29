# ADR-019: Compact rectangular reference labels

## Problem

Rounded branch and tag pills consume unnecessary horizontal space. Dense commit graphs benefit from more compact reference labels without changing the familiar circular commit nodes.

## Decision

Render branch, remote, stash, and tag labels as lightly rounded rectangles with reduced horizontal padding. Keep commit vertices, current-commit outlines, stash markers, and rebase rings circular in both graph surfaces. Preserve existing colors, icons, interaction targets, and density scaling.

## Rationale

Small corner radii preserve visual separation without the end-cap width of pills. Circular vertices remain easy to distinguish from the rectangular labels and preserve the established graph language.

## Rejected alternatives

- Sharp label corners save no additional width and look too severe beside VS Code controls.
- Removing label icons would save more space but would weaken branch, remote, tag, and stash recognition.
- Square commit nodes would change a familiar graph convention without reducing label width.
