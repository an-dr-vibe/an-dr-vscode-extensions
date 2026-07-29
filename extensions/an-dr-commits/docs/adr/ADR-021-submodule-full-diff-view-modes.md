# ADR-021: Submodule full-diff view modes

## Problem

Submodule gitlinks identify an old and new commit rather than line-oriented file content.
Using the normal full-file renderers hides that relationship, while showing every commit in a
range makes a direct pointer comparison hard to scan.

## Decision

- Unified renders the old and new gitlink endpoint commits as vertical detail cards.
- Split renders the old endpoint on the left and the new endpoint on the right.
- Raw keeps Git's semantic `--submodule=log` output without card rendering.

## Rationale

The endpoint pair is the change stored by the parent repository. Reusing the existing view
selector makes the information readable without altering normal-file diff behavior.

## Rejected alternatives

- Rendering every commit in the range in Unified or Split obscures the two gitlink endpoints.
- Treating the semantic Git log as a line diff produces empty or misleading panes.
