# ADR-013: Cancellable document blame cache

## Problem

Inline blame spawned a new `git blame` process for each selected line. Rapid cursor movement and large files created overlapping processes, while the one-line render key could incorrectly skip decoration in a second editor showing the same document.

## Decision

Run `git blame --incremental` once per repository, document URI, and document version. Parse its hunks into a zero-based line map, share the promise across cursor updates and split editors, and cancel the child process when that document version becomes stale.

## Rationale

One process amortizes Git startup and history traversal across every line in a document. Document versions provide deterministic invalidation, cancellation bounds obsolete work, and editor-aware render tracking keeps split-editor decorations correct without weakening the shared cache.

## Rejected alternatives

- Keep per-line blame with process cancellation; cursor movement would still repeatedly pay Git startup and traversal costs.
- Cache only the last line; this does not help normal navigation through a file.
- Cache indefinitely by path; edits, branch changes, and repository changes would return stale authorship.
