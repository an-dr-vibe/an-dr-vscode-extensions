# ADR-010: Scoped repository file refreshes

## Problem

Every working-tree file event triggered a full repository-info, refs, log, and status reload. Saving one file therefore spawned several Git processes even though only the uncommitted-changes row was stale.

## Decision

Classify watched events as Git-metadata or working-tree changes. Git metadata keeps the full refresh; working-tree changes run one status command and update only the uncommitted node, escalating mixed debounce bursts to a full refresh.

## Rationale

The classification preserves correctness for refs, HEAD, index, and repository-operation state while removing unrelated Git reads from the dominant edit/save path. Repository identity travels with lightweight results so a late response cannot update a newly selected repository.

## Rejected alternatives

- Poll the complete graph after every event; this retains the avoidable cost.
- Watch only `.git`; ordinary file saves would leave the working-tree row stale.
- Update user Git performance configuration; repository configuration is outside the extension's internal refresh contract.
