# Code review — 2026-07-18, decouple-vscode-git

## Summary

The branch removes the built-in Git extension dependency, makes activation lazy, defers
repository reconciliation, and centralizes live status in `GitStatusMonitor`. All seven
findings are resolved, with no open critical or high-severity defects.

## Findings

### Critical — must fix before merge

- None.

### High

- **CR.1 (resolved)** `extensions/an-dr-commits/src/views/tab/README.md:16` — The tab-view map described the removed native-SCM-extension watcher. It now describes the repository watcher.
- **CR.2 (resolved)** `extensions/an-dr-commits/src/dataSource.ts:1318` — `getStatusCounts` omitted untracked files, so status-bar and sidebar counts could disagree with the displayed working-tree rows. It now counts each untracked path once, with parser-level regression coverage.
- **CR.3 (resolved)** `extensions/an-dr-commits/src/repoManager.ts:78` — The delayed reconciliation fallback discarded a potentially rejected promise, producing an unhandled rejection. It now catches and logs the failure while preserving retry through `ensureReady()`.
- **CR.4 (resolved)** `extensions/an-dr-commits/src/extension.ts:117` — Immediate lazy-core loading watched only the deprecated inline-blame alias, so the current setting waited for the idle fallback. Bootstrap now applies the same current-then-legacy setting precedence as `Config` and watches both keys.
- **CR.5 (resolved)** `extensions/an-dr-commits/src/repoFileWatcher.ts:50` — The watcher now resolves `.git` redirection files and watches both the per-worktree Git directory and its optional shared `commondir`, with regression coverage for external `HEAD` and shared-ref watcher registration.

### Improvements

- **CR.6 (resolved)** `extensions/an-dr-commits/src/core.ts:21` — `ActivatedCore` and the touched test contract now use function-property signatures, and the changed TypeScript surface passes the configured zero-warning lint command with CRLF working-tree formatting.
- **CR.7 (resolved)** `extensions/an-dr-commits/src/extension.ts:19` — The core exposes Git readiness and the lazy shell awaits it before dispatching the version command, with a regression test proving execution remains blocked until discovery settles.

## Positives

The monitor tests cover direct status behavior without mocking the removed extension API.
Lazy-activation tests cover no-work startup, shared first-use loading, retry, idle fallback,
and immediate loading for enabled inline blame. Repository tests cover shared reconciliation
and the watcher-before-scan boundary. The full compile and all 1,325 tests pass; the changed
TypeScript surface passes lint with zero warnings.

## Verdict

Approve — CR.1 through CR.7 are resolved; compile, changed-surface lint, and tests pass.
