# HANDOFF — an-dr-commits performance & reliability overhaul

Continuation notes for the next AI/developer. Delete this file when the work is complete.

## Goal (user's words)

Make the extension "snappy and reliable — speed/reliability of SmartGit". **No new
features** — holistic cleanup of what exists, in the cleanest possible way. The user
delegated decisions ("no questions, do your best") and reviews results afterwards.

## Mandatory process

Read `agents/AGENTS.md` and root `AGENTS.md` before any task (see `CLAUDE.md`). State the
active flow/phase at the start of every response. Key rules: never commit/push without an
explicit user request; one-line commit messages, **no** `Co-Authored-By`/AI attribution;
squash same-topic WIP commits only when they are the unpushed tip; record design decisions
as immutable ADRs in `extensions/an-dr-commits/docs/adr/`.

## Work already done (committed to `main`)

Commit `9dc3dba` — responsiveness batch 1 (documented in `docs/adr/ADR-009-lazy-activation-and-concurrent-read-messages.md`):

- `package.json`: `activationEvents` `"*"` → `"onStartupFinished"`.
- `TabView` (`src/views/tab/tabView.ts`): read-only webview commands (`READ_ONLY_COMMANDS`
  set) now run concurrently; only repository-mutating commands are serialized on
  `messageHandlerChain` via `respondToMutatingMessage`, which uses `try/catch/finally` so a
  throwing handler can no longer poison the chain (previously: all later messages silently
  dropped + repo file watcher muted forever — this was a major "unresponsive" cause).
- `SidebarView`: `vscode.git` state events / active-editor switches go through the 500 ms
  `_scheduleRefresh()` debounce instead of spawning git per event (badge still instant).
- `DataSource.getCommits`: uncommitted-changes `git status` runs in parallel with log/refs.
- `.vscode/package-web.js`: removes the empty dir skeleton tsc leaves in `media/`.

Commit `a8f6ab7` — bug fixes + perf round 2 + partial test repair:

- **Bug** `RepoManager.addRepo` now refuses to re-add a known repo. Previously any new
  directory created inside a known repo (watcher event → `repoRoot` → `addRepo(root)`)
  overwrote the repo's saved state with `DEFAULT_REPO_STATE` (lost name/starred/hidden
  remotes/columns).
- **Bug** `Config.onlyFollowFirstParent` defaulted to `true` while `package.json` declares
  `false` — the graph silently hid all non-first-parent (merged-branch) commits by default.
  Now `false`.
- **Bug/discrepancy** `an-dr-commits.statusBarIconOnly` was required by root `AGENTS.md`
  user preferences and tested, but didn't exist. Added: `package.json` contribution
  (default `true`), `Config.statusBarIconOnly`, `StatusBarItem.refresh()` honors it +
  config-change listener. Removed dead `setRepoCommit`/`setBlameCommit` no-op stubs.
- Logger output channel renamed `an-dr-commits` → `Commits` (matches extension branding).
- **Perf** `DataSource._spawnGit` sets `GIT_OPTIONAL_LOCKS=0` on every spawn — read
  commands no longer take `index.lock` for opportunistic index refreshes (the technique
  VS Code's git extension uses); required for safe concurrent reads.
- **Perf** `getRepoInfo`: `git remote -v` now runs inside the main `Promise.all` (it never
  needed the remote list first) — removes a serial git round-trip from every repo load.
  `getRemoteUrls(repo)` now returns all fetch URLs; caller maps known remotes to null.
- **Perf** `InlineBlameController`: `renderedBlameKey` (`uri@version:line`) skip-cache —
  cursor movement within the same line no longer re-spawns `git blame` (selection events
  fire per character). Known edge: with the same document open in two split editors the
  second editor may skip its render; key could include a view-column discriminator.
- Test suites repaired: `statusBarItem` (rewritten to current design), `config` (305 pass;
  replaced removed `dateType`/`defaultColumnVisibility` blocks with
  `commitsColumnVisibility`, added `repoInProgress`/`setUpstream`/`unsetUpstream` to
  expected defaults, collapsed `fileViewType` to hardcoded-Tree), `commands` (43 pass;
  `commitsView` → `views/tab/tabView`, spy `logDebug` for "Command Invoked", removed
  code-review command blocks, `resolveRepoContainingFile` mock), `extensionState` partial
  (39/45; removed code-review blocks, added new `GitRepoState`/`CommitsViewGlobalState`
  fields to fixtures, rewrote `transferRepo` tests), plus 3 new `tabView` tests covering
  the read/write message split and chain-survives-throw, and an updated `dataSource`
  empty-repo test (3rd parallel status spawn).

Verified: `npm run compile` clean; lint unchanged from baseline (212 pre-existing
problems, see below); no new test failures vs baseline in the touched suites.

## Current test status (after `a8f6ab7`)

`Tests: 109 failed, 1164 passed, 1273 total` — all remaining failures are PRE-EXISTING
stale tests (the suite was never updated after the fork's rename/refactors), except where
noted they were re-baselined by the fixes above. Per suite:

| Suite | Status | Known causes |
| --- | --- | --- |
| avatarManager | 12 fail / 49 | Not yet analyzed in depth; includes a GitHub rate-limit log-message expectation that never fires. Very slow suite (~35 s) — check fake timers. |
| dataSource | 53 fail / 299 | Mostly stale expectations vs current git arg construction/parsers (`getRepoInfo` now spawns `remote -v` in parallel — expected spawn sets/orders in tests may need the extra call). Also `getCommitDetails`/`getUncommittedDetails`/`openExternalDirDiff` groups. |
| extensionState | 6 fail / 45 | `getRepos` migrate/defaults tests: expected objects still lack newer `GitRepoState` fields (`commitDetailsViewTopRowRatio`, `fullDiffCompact`, `fullDiffPanelHeight`, `starred`) in the *expected merge results* (the input fixtures were already fixed; the `toStrictEqual` expected literals were not). |
| inlineBlame | 4 fail / 4 | Test's fake RepoManager lacks `resolveRepoContainingFile` (code moved from `getRepoContainingFile`); one test references removed status-bar blame behavior. |
| repoManager | 16 fail / 160 | Watcher/startup/register tests — expectations predate ADR-008 recursion, the new `addRepo` known-repo guard, and `checkReposExist` retry logic (200 ms sleeps → use jest fake timers). Add a regression test: watcher-create event inside a known repo must NOT reset its state (guard added in `a8f6ab7`). |
| sidebarView | suite fails to compile | `new SidebarView(...)` called with 2 args; constructor now takes 6 (`context, dataSource, extensionState, repoManager, onDidChangeRepoSelection, emitRepoSelection`). |
| tabView | 18 fail / 145 | `WebviewPanel Construction` (retainContextWhenHidden default is now `true`; icon paths/title assertions), `getHtmlForWebview` (initial-state shape grew), `openTerminal` (command may have been removed/renamed), `rewordCommit`/`squashCommits`/`pushBranch`/`viewDiff` (API drift), `sendMessage` disposal-logging expectations, `Native SCM Selection`. |

Repair strategy that worked so far: run one suite, strip ANSI (`sed 's/\x1b\[[0-9;]*m//g'`),
bucket unique errors, then decide per bucket: **stale test → align to current behavior;
declared-but-unimplemented behavior → fix the code** (that's how `statusBarIconOnly` and
`onlyFollowFirstParent` were caught — always check `package.json` before trusting either side).

Beware: `jest.fn().mockReturnValueOnce` queues leak into the next test when the code under
test stops consuming them — one stale test can cascade failures into unrelated tests in
the same suite (seen in extensionState).

## Remaining code work (audit findings not yet addressed)

1. **Working-tree refresh cost** — `src/repoFileWatcher.ts` watches `repo/**` and its
   `FILE_CHANGE_REGEX` treats every non-`.git` file event as a change → each file save
   triggers (750 ms later) a full webview refresh (repo info + full `git log` + status ≈ 8
   git spawns). SmartGit-style fix: distinguish `.git` events (refs/index/HEAD → full
   refresh) from working-tree events (→ only refresh the uncommitted-changes row/status).
   Needs a lightweight webview message alongside the existing `refresh`; touch
   `web/main/requestsState.ts` / `loadProcessing.ts`. Medium effort, biggest remaining win.
2. **Repo-discovery watcher churn** — `RepoManager.startWatchingFolder` watches each
   workspace folder with `/**`; every created directory spawns `git rev-parse` (buffered,
   deduped, but still churn during `npm install`). Consider skipping watcher-create paths
   inside known repos when `maxDepthOfRepoSearch === 0`, while keeping `.git`-suffix events
   (nested repo creation) — reconcile with `docs/adr/ADR-008`.
3. **Orphan/duplicate-tab machinery** — `src/extension.ts` (suppression windows, 250 ms
   re-scheduling checks) + the 300 ms "re-send repo after initial render" timeout in the
   `TabView` constructor are workaround-shaped; redesign around the webview serializer
   state instead of timers. Behavioral risk — needs manual testing of window reload with
   the Commits tab open/closed, duplicate tab restore.
4. **Inline blame process management** — no kill/cancellation of in-flight `git blame`;
   for large files consider whole-file `git blame --incremental` cached per document
   version (GitLens technique) instead of per-line spawns.
5. **Lint** — 212 pre-existing problems (`npm run lint`, max-warnings 0 so it always
   fails): 2 `no-console` errors in `src/gitEditor/gitEditorMain.ts` (child-process entry —
   probably legitimate; add an eslint override or route through its own logger), 210
   warnings (~199 auto-fixable via `--fix`: quotes, sort-imports, spaced-comment).
6. **Further git-client perf ideas (unimplemented)**: skip webview re-render when refresh
   data is unchanged (hash `git log`/`show-ref` stdout and compare before posting);
   replace the `branch --no-color` + `for-each-ref` + `show-ref` trio with a single
   `for-each-ref` format covering heads/remotes/tags+upstreams; suggest/leverage
   `core.untrackedCache` and `core.fsmonitor` for big repos; consider `--no-optional-locks`
   equivalent already done via env var.

## Verification commands

```
cd extensions/an-dr-commits
npm run compile        # tsc src + web, bundles media/*.min.*  (ALWAYS after web/ edits)
npm test               # jest; compare failures against the table above, not against zero
npm run lint           # 212 pre-existing problems; don't add new ones
```

`install.ps1` at repo root junctions the extension into `~/.vscode/extensions` and always
recompiles. Webviews load ONLY `media/out.min.js`/`sidebar.min.js` — bare `tsc -p web/`
output is never loaded (see root `AGENTS.md`). Repo files are CRLF; Python-scripted test
edits must read/write with `newline=''` and match `\r\n`.

## Open questions for the user (non-blocking)

- Status bar: with `statusBarIconOnly` default `true` the branch name is hidden by default
  (tooltip shows it). Confirm this matches the "minimalistic" preference.
- The 4 WIP commits at the tip of `main` before this work were already pushed, so they were
  not squashed (would need force-push).
