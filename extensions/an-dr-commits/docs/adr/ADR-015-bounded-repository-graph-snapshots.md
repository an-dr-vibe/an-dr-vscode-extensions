# ADR-015: Bounded repository graph snapshots

## Problem

Changing the selected branches clears the visible commits and reruns Git before rendering the
new graph. The loading splash makes every filter interaction feel like a repository reload, even
though commit objects are immutable and most requested projections repeat during a session.

ADR-014 deliberately reused ref snapshots only across one paired load because longer reuse had
no invalidation contract.

## Decision

Keep native VS Code Git integration and add a bounded, in-memory cache per repository. The cache
retains immutable commit records by hash and exact Git-ordered graph projections keyed by every
request field that changes the result. Repository generations explicitly mark projections stale
when refs change while retaining immutable commit records.

Branch-filter changes use stale-while-revalidate rendering: a current cached projection replaces
the graph immediately; otherwise the existing graph remains visible until the requested
projection arrives. Common projections are warmed in the background. Cache state is session-only
and bounded by LRU eviction.

## Rationale

Exact projections preserve Git's date, author-date, topological, first-parent, reflog, hidden
remote, stash, and load-limit semantics. Generation tracking addresses ADR-014's stale-data risk,
while bounded session storage avoids startup persistence, schema migration, and unbounded memory.

## Rejected alternatives

- Clear and reload on every selection: correct but causes the unwanted loading experience.
- Rebuild ordered graphs entirely in the webview: duplicates Git traversal semantics and risks
  subtle ordering differences.
- Index every commit persistently: closest to a desktop Git client, but adds storage lifecycle and
  corruption handling before session caching has been measured.
- Cache only the last selection: bounded but provides little benefit when comparing branches.
