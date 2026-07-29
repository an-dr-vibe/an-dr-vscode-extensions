# ADR-014: Single Git ref snapshot

## Problem

Loading a repository separately queried branch names, upstreams, and commit refs. The extra Git processes duplicated work and could describe different repository moments during a single view load.

## Decision

Read heads, remotes, tags, symbolic targets, upstream state, and the current-branch marker with one `git for-each-ref` process. Resolve `HEAD` with one parallel `git rev-parse` process so detached and unborn repositories remain representable. Reuse the parsed refs once between the paired repository-info and commit loads.

The webview continues comparing parsed state structurally and skips table, graph, and branch-panel rendering when a response is unchanged.

## Rationale

One consistent snapshot replaces three overlapping ref reads with two parallel processes, preserves annotated-tag and detached-HEAD semantics, and avoids a duplicate ref read during the normal two-message load sequence.

## Rejected alternatives

- Keep separate `branch`, `for-each-ref`, and `show-ref` calls: more process overhead and no consistency boundary.
- Persist snapshots beyond one paired load: risks serving stale refs after repository changes.
- Enable Git's untracked cache or filesystem monitor automatically: mutates user repositories and has unrelated compatibility tradeoffs.
