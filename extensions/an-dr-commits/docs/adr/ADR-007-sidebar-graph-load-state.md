# ADR-007: Sidebar mini graph gets its own always-present load state

## Problem

The mini graph's container (`#activityGraph`) was only ever shown or hidden
based on whether `SidebarMiniGraphInitialState | null` had data - `null`
covered "still loading," "no branch checked out," and "the fetch failed" all
the same way: an invisible container. A user had no way to tell "it's still
loading" apart from "it's broken," and a slow or failing graph fetch (large
repo, transient git error) blocked the graph from ever appearing rather than
surfacing that state.

Fetching the graph was also bundled into the same `Promise.all` as the
working-tree changes fetch (`SidebarView._refreshPanel`), so a slow graph
fetch delayed the changes tree too, and both were sent together in one
`updateContent` message.

## Decision

- `SidebarGraphState` (`src/types/sidebar-state.ts`) replaces the bare
  `SidebarMiniGraphInitialState | null` on the wire: a discriminated union of
  `loading`, `error` (with a message), and `ready` (with `data:
  SidebarMiniGraphInitialState | null` - `null` covers the valid-but-nothing-
  to-draw case: no branch checked out yet, or zero commits).
- `fetchMiniGraph` (`src/views/sidebar/miniGraph.ts`) always resolves to a
  `SidebarGraphState`, never rejects - it distinguishes "the native git API
  hasn't attached yet" (`loading`, self-heals on the next refresh once it
  attaches) from a genuine `dataSource.getCommits` failure (`error`).
- `SidebarView._refreshPanel` no longer awaits the graph fetch together with
  the changes fetch. The graph fetch is kicked off in parallel but settles
  and is pushed independently via its own `updateGraph` message (never
  bundled into `updateContent`), whether that's the first render, a repo
  switch, or a routine background refresh - reusing the same message the
  `loadMoreGraph` pagination path already used.
- Client-side (`web/sidebar/main.ts`), `#activityGraph` is now hidden only
  when no repository is selected at all. Whenever a repo is selected, it
  stays visible at its resizable height and shows one of: a loading spinner,
  an error message (`.cpError`, matching the changes tree's own error
  styling), a muted "No commits yet" note, or the graph itself.
- Loading is only ever shown when the container has no prior data for the
  newly-selected repo (first render / repo switch) - the initial state is
  explicitly seeded as `{status: 'loading'}` right before the shell renders.
  Routine background refreshes (`updateContent` without an accompanying
  `updateGraph`) leave whatever the graph was already showing untouched until
  its own `updateGraph` message arrives, so an in-progress git operation
  never flashes the graph away.

## Rationale

Separating the graph's readiness from the rest of the panel's, and giving it
an explicit three-state contract instead of a nullable blob, means the user
always sees *why* the graph isn't there yet instead of a silent gap - and it
was a `null`-collapses-everything shape like this that made the ADR-006
path-comparison bug (fixed separately) invisible as "loading forever" rather
than surfacing as an error.

## Rejected alternatives

- **Show the loading spinner on every refresh, not just first paint/repo
  switch**: rejected - it would flicker the graph away on every routine
  git operation (stage, commit, external commit via file watcher), a
  regression from the smooth in-place patching the panel already had.
- **Collapse the container to a slim strip when there's nothing to draw**:
  rejected in favor of keeping the full resizable height with a centered
  message - avoids the layout jumping around as the graph appears/disappears
  across refreshes.
