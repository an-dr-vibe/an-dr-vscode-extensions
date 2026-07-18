# ADR-023: Deferred repository reconciliation and lazy feature bootstrap

## Problem

After removing the dependency on VS Code's built-in Git extension, `onStartupFinished`
still parsed and constructed the complete Commits implementation, discovered Git, scanned
the workspace, and installed repository watchers. None of that work is needed to register
the extension's entrypoints, and the scan can compete with other extensions during startup.

Deferral introduces correctness risks: two early commands could initialize twice, a file
change could be missed between persisted-state loading and watcher installation, and a
failed dynamic import could permanently break the registered commands.

## Decision

Use a two-tier activation model:

- `extension.ts` is a lightweight shell. It registers permanent command delegates, lazy
  webview/document providers, and an icon-first status item based on persisted repository
  state.
- The Git-backed implementation lives in `core.ts` and is loaded through one shared promise
  on first use. A five-second fallback loads it after the startup-critical window; enabling
  inline blame loads it immediately because that feature is explicitly requested.
- Command delegates remain registered and call `CommandManager.execute()` after loading,
  avoiding an unregister/re-register race. A failed activation clears the shared promise so
  a later invocation can retry.
- `RepoManager` exposes one shared `ensureReady()` promise. Interactive repository commands
  await it; restored/sidebar views render persisted state first and reconcile in the
  background. A ten-second fallback guarantees eventual reconciliation.
- Reconciliation installs workspace watchers before asynchronous validation and scanning.
  The scan covers changes before watcher installation, and the watchers cover changes during
  the scan.

## Rationale

This removes module parsing, Git discovery, graph/avatar/blame construction, workspace Git
commands, and repository watcher creation from the activation path while preserving every
command ID and provider registration. Persisted repositories keep the startup status item
and views useful until reconciliation completes.

The idle fallbacks preserve eventual freshness for users who never invoke a command. The
single promises bound concurrency, explicit retry handles transient module-load failures,
and watcher-before-scan ordering prevents a permanently stale repository set.

## Rejected alternatives

- Remove `onStartupFinished` entirely. This maximizes savings but removes the automatic
  status item and delays background status/blame behavior until manual use.
- Keep the full core eager and only defer repository scanning. This leaves most parse and
  construction cost on the startup path.
- Replace bootstrap command handlers with real handlers after loading. Disposing and
  re-registering commands creates a small interval where an invocation has no handler.
- Rely only on filesystem events after loading persisted repositories. Events before watcher
  installation would be lost, so state could remain stale indefinitely.
