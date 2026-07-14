# ADR-009: Lazy activation and concurrent read-message handling

## Problem

The extension loads slowly and the views frequently feel unresponsive:

- `activationEvents: ["*"]` activated the extension (including `findGit`, which spawns
  `git --version` processes) during every VS Code startup, before the workbench was ready.
- Every webview message in `TabView` - including pure reads like `loadCommits`,
  `loadRepoInfo`, and `getFileDiff` - was serialized through one promise chain, so a single
  long-running action (fetch, rebase, pull) blocked all data loading until it finished. The
  chain also had no error containment: one thrown handler left the chain permanently
  rejected (all later messages silently dropped) and the repo file watcher muted forever.
- The sidebar refreshed (git status + mini-graph log spawns) synchronously on every
  `vscode.git` state change and every active-editor switch, bypassing its own 500ms
  debounce.
- `DataSource.getCommits` awaited `git status` serially after the log/refs round-trip,
  adding one full git-spawn latency to every graph load on large working trees.

## Decision

- Activate on `onStartupFinished` instead of `*`.
- Split `TabView` message handling: a `READ_ONLY_COMMANDS` set is handled concurrently
  (no chain, no watcher muting); repository-mutating commands stay serialized (index.lock
  protection) inside `respondToMutatingMessage`, which wraps the handler in
  `try/catch/finally` so the watcher always unmutes and the chain never poisons.
- Route the sidebar's `vscode.git`/editor events through `_scheduleRefresh()` (badge still
  updates instantly - it reads native API state without spawning git).
- Fetch the uncommitted-changes count in parallel with the log/refs in `getCommits`; a
  status failure now only hides the uncommitted row instead of failing the whole load.
- `package-web.js` removes the empty directory skeleton left after deleting compiled JS.

## Rationale

These are the highest-leverage latency/reliability fixes that change no user-visible
behavior and add no features. Serializing only writes preserves the index.lock guarantee
the chain existed for, while restoring SmartGit-like responsiveness for reads (git read
commands don't take index.lock).

## Rejected alternatives

- Narrower activation events (`onView:`/`onCommand:`): the extension contributes a status
  bar item, inline blame, and startup repo detection, which need background activation;
  `onStartupFinished` gives that without slowing the workbench.
- Removing the message chain entirely: concurrent mutating git commands genuinely race for
  `index.lock`; writes must stay serialized.
- Debouncing the sidebar badge as well: the badge read is free (in-memory native API
  state), and instant feedback there is worth keeping.
