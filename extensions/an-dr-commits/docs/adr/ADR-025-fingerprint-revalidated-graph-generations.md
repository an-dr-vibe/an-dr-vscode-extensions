# ADR-025: Fingerprint-revalidated graph generations

## Problem

ADR-015 introduced per-repository generations to mark cached graph projections stale. A
generation is advanced from four call sites that fire on *possible* change, not actual change:
the status monitor's watcher-driven refresh (`GitStatusMonitor.refresh`), the tab regaining
visibility, any repository file event, and any mutating message (`TabView`).

`updateGraphGeneration` does compare refs structurally, but it can only ever *advance* the
generation - it cannot rescind a conservative bump. In a repository that is actively being
worked in, routine watcher noise therefore discards the whole projection cache even when no ref
actually moved. Any work that depends on cached projections surviving between two consumers -
notably the sidebar and the tab sharing loads (ADR-026) - is defeated by this before it starts.

A second problem blocks revalidation outright. Projections embed working-tree state: a synthetic
`Uncommitted Changes (N)` row is spliced into the commit list by `loadCommits`. That count is in
neither the projection key (`createGraphProjectionKey`) nor the ref fingerprint. Refs are
therefore not a sufficient witness of a projection's validity - staging a file leaves refs
byte-identical while making the cached projection wrong.

## Decision

A generation bump marks the repository **unverified** rather than immediately discarding its
projections. Projections retained under the previous generation are held as revalidatable, not
dead.

On the next read for an unverified repository, `DataSource` recomputes the repository
fingerprint from one cheap `for-each-ref` snapshot plus the working-tree change count:

- fingerprint **matches** the one recorded when the projections were stored - the projections are
  restored as current and served without re-running `git log`.
- fingerprint **differs** - the generation advances for real and the projections are discarded,
  exactly as today.

The fingerprint is extended to cover the working-tree change count alongside
`[head, heads, tags, remotes]`. Where `GitStatusMonitor` already holds fresh counts for the
active repository, they are reused rather than spawning `git status` again.

A witness is only trusted if no further invalidation arrived while it was being read: a
fingerprint sampled at the start of an asynchronous read cannot rule out a change that happened
during it. Invalidations are counted per repository, and a revalidation whose count moved while
in flight declines to confirm - the repository stays unverified, the current read loads from Git,
and the next read revalidates against a fresh witness once the churn settles.

Immutable commit records continue to survive generation changes untouched, as in ADR-015.

## Rationale

Revalidation converts an unconditional cache wipe into one cheap ref read, which is the same
`for-each-ref` process a load would have run anyway - so a cache miss costs nothing extra, and a
cache hit skips the `git log` entirely. Conservative invalidation is preserved as the failure
mode: anything the fingerprint does not witness still results in a discarded cache, never in
stale data being served.

Folding the working-tree count into the fingerprint is what makes the restore path sound. Under
the previous always-discard behavior its absence was invisible; making projections survivable is
precisely what turns it into a correctness requirement, so the two changes belong to one
decision rather than two.

## Rejected alternatives

- **Serve stale projections and revalidate behind them**: the `stale` flag already returned by
  `RepositoryGraphCache.getProjection` makes this cheap to build, but it shows data known to be
  possibly-wrong and needs a second push once the real load settles. Revalidation gets the same
  instant result without ever displaying unverified data.
- **Keep invalidation conservative**: smallest change and no new staleness surface, but the cache
  then only survives in a quiet repository, which is not the case the user is asking about.
- **Narrow the bump call sites instead** (e.g. only bump when the watcher saw a `.git/refs` path):
  moves the guesswork earlier without a witness to confirm it, and spreads repository-validity
  knowledge across the watcher, the status monitor and the tab.
- **Fingerprint the full `git log` output**: an exact witness, but it costs the very process the
  cache exists to avoid.
