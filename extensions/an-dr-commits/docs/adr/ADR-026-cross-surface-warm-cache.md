# ADR-026: Cross-surface warm cache for the sidebar and the tab

## Problem

The sidebar and the tab load their data independently, so whichever one the user opens second
pays a full cold load even though the other already has the repository's data in memory.

Both surfaces already share one `DataSource` instance (`core.ts`), and that instance already owns
the `RepositoryGraphCache` from ADR-015 - but they never hit each other's entries:

1. **The projection keys never collide.** The sidebar's mini graph asks for
   `branches: [local(, upstream)]`, `maxCommits: 10`, `onlyFollowFirstParent: true`,
   `showTags: false`, no stashes. The tab asks for the user's selected branches at
   `config.initialLoadCommits`, `onlyFollowFirstParent` from repo state, real tags and stashes.
   Different key, different `git log`, nothing shared.
2. **Repository info is not cached at all.** `getRepoInfo` runs five git calls on every load. The
   only reuse is ADR-014's single-use `pendingRefSnapshots` handoff, consumed by the very next
   `getCommits` and then gone. The sidebar's `getHeadInfo` separately spawns git for what is a
   strict subset of the same data.

The tab's key additionally cannot be predicted by the backend: `branches` comes from
`getInitialBranchesOnRepoLoad` in the webview (config mode, per-repo state, `gitBranchHead`,
mainline detection), and `remotes`/`stashes` come from the *preceding* `loadRepoInfo` response, so
the commits key is causally downstream of repository info.

## Decision

### Repository info becomes a cached snapshot

`getRepoInfo` results are cached per repository under the ADR-025 generation, replacing ADR-014's
"reuse once across one paired load" limit. `getHeadInfo` is served from the same snapshot instead
of spawning its own git processes. Invalidation and revalidation are ADR-025's, unchanged.

### The last-used projection key is persisted per repository

Rather than reproducing `getInitialBranchesOnRepoLoad` in the backend, `DataSource` records the
projection key of each successful commits load per repository and persists it. Warming replays
the recorded key; a repository opened for the very first time has none and stays cold.

### Warming happens on sidebar activation and after either surface loads

When the sidebar resolves its webview, it warms the repository snapshot and then the recorded
projection key in the background. After either surface completes a load, the other's recorded key
is warmed, reusing the deferred-timer pattern `scheduleGraphWarmup` already established.

Warming is strictly best-effort: failures are swallowed, and a warm-up never blocks, delays, or
alters what the surface that triggered it renders.

## Rationale

The shared `DataSource` already makes cross-surface reuse an addressing problem rather than an
architectural one - what was missing is that the two surfaces never ask the same question, and
that the most expensive shared part (`getRepoInfo`) had no cache at all. Caching the snapshot
helps both surfaces on every load, not only when a warm-up guessed right.

Recording the key the webview actually used avoids mirroring branch-selection logic in two places
where the two copies could silently diverge; it is self-correcting, since every load refreshes
what will be warmed next.

Warming on sidebar activation matters because the sidebar is effectively always open, which makes
the tab warm even in a session where the tab is never opened until it is needed.

## Rejected alternatives

- **Derive the sidebar's mini graph from the tab's projection**: one fetch instead of two, but it
  re-derives first-parent ordering in the webview - which ADR-015 explicitly rejected - and needs
  a fallback whenever the superset lacks the needed commits (load limit, hidden remotes,
  `showRemoteBranches: false`). Saves one `git log -10`, which is not worth the correctness
  surface.
- **Make the sidebar request the tab's exact key**: collapses the keys but makes the sidebar pay
  the tab's much larger load, regressing the cheap surface to fund the expensive one.
- **Reproduce `getInitialBranchesOnRepoLoad` in the backend**: warms correctly on a repository's
  first ever open, at the cost of branch-selection logic duplicated across the webview and the
  backend.
- **Warm every plausible key on activation**: maximizes hit rate and spends unbounded git work on
  repositories the user may never open.
