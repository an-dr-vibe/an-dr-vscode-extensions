# ADR-004: Symbol Resolver Boundary

## Problem

`ContextTracker` handled editor events, debounce, pin state, current context
storage, call-hierarchy item caching, and the full symbol resolution algorithm.
That made one class both an event-driven state machine and a semantic resolver,
which was hard to read and difficult to test in isolation.

## Decision

Extract the tiered cursor-position resolution algorithm into
`src/context/SymbolResolver.ts`. `ContextTracker` remains responsible for VS Code
event subscriptions, pin/current state, stale-update guards, and applying
resolver results to the cached call-hierarchy item.

## Rationale

The resolver is a focused strategy boundary: call hierarchy first, document
symbols second, word fallback last. Keeping result application in
`ContextTracker` preserves the public API and avoids moving event/debounce state
into the resolver. The split makes future resolver strategy tests and retry
policy changes smaller.

## Rejected alternatives

- Leave `_resolveAt` inside `ContextTracker`: rejected because it keeps semantic
  resolution and event-state concerns coupled.
- Move all context tracking into a new service: rejected because it would be a
  larger behavior change than needed for this increment.
- Change `forceUpdateAt` retry behavior now: rejected because navigation retry
  policy should be handled separately from resolver extraction.
