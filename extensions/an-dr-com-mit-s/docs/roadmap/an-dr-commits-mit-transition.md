# an-dr-commits MIT Transition Roadmap

## Purpose

Replace the implementation currently installed as `an-dr-commits` with an
MIT-derived implementation while retaining its public VS Code identity and
user-facing capabilities. The migration builds on this extension's
neo-git-graph-derived code.

Every file in the current `an-dr-commits` falls into exactly one of three
categories, decided by the provenance checker and nothing else:

| Category   | Share of source | What happens to it                                       |
| ---------- | --------------: | -------------------------------------------------------- |
| `YOURS`    |     5,134 lines | **Move it.** Locally authored, relicensable MIT.         |
| `REVIEW`   |     6,755 lines | **Annotate, then move the `+` hunks.**                   |
| `BASELINE` |    10,941 lines | **Do not move.** Reimplement, or use the MIT equivalent. |

Moving `YOURS` code is not a shortcut around this plan — it _is_ the plan. A
transition that reimplements code the author already owns wastes the work and
loses behaviour that has no other specification. Most `BASELINE` lines need no
reimplementation either: neo-git-graph is itself a Git Graph fork, so it already
supplies equivalents for `dataSource`, `utils`, `config`, `avatarManager`,
`dialog`, `findWidget`, `settingsWidget`, and `web/graph.ts`.

The current extension is therefore two things at once: a behavioural reference,
**and** the licensed source for 5,134 lines of `YOURS` code plus the clean hunks
of another 6,755. Treating it as reference-only is a misreading of this plan.

## Non-negotiable provenance rules

1. Copy or move implementation code only within `an-dr-com-mit-s`, or import it
   from a documented MIT dependency or the neo-git-graph baseline recorded in
   [NOTICE.md](../../NOTICE.md).
2. Code in `extensions/an-dr-commits` that was authored locally is the author's
   own copyright and may be copied here and relicensed MIT, at file or hunk
   granularity. Expression originating in the imported Git Graph snapshot may
   not be, in any quantity.

   The test is overlap with the baseline snapshot, never the date a file was
   added. Every commit in this repository — including the bulk import
   `4d4c579` — carries the same author, so `git blame` cannot separate the two,
   and later refactors such as `c52c771` moved baseline code into brand-new
   files. Run the provenance checker below and record its verdict for every
   copy; in a `REVIEW` file, take only the `+` hunks.

3. Public interface facts can be recorded independently: command IDs, setting
   keys, view IDs, and user-observable acceptance scenarios. Their
   implementation must be authored on the MIT foundation.
4. Preserve the MIT license and notice in the final replacement. Audit every
   newly added dependency before it enters `package.json`.
5. Keep the current `an-dr-commits` folder intact until the replacement passes
   the complete transition matrix and a cutover is approved.

## Terminology and working copies

| Term                  | Location                                     | Role                                                                                       |
| --------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Current Commits       | `extensions/an-dr-commits`                   | Behavioural reference, and a source for locally authored code only.                        |
| Baseline snapshot     | `4d4c579:extensions/an-dr-git`               | The imported Git Graph source, before any local work. Restricted; the checker's reference. |
| MIT staging extension | `extensions/an-dr-com-mit-s`                 | The only codebase changed during the migration.                                            |
| Final extension       | `extensions/an-dr-commits`                   | The staging extension after approved cutover and identity switch.                          |
| MIT baseline          | neo-git-graph at the revision in `NOTICE.md` | Imported source provenance.                                                                |

## Provenance checker

`scripts/check-provenance.js` classifies every source file in current Commits
against the baseline snapshot. It matches 3-line shingles over substantive
lines — a single shared line is coincidence, three consecutive shared lines is
relocation — and ignores blank lines, punctuation-only lines, and module
declarations, since which symbols a file imports is dictated by the module
layout rather than authored.

```sh
node scripts/check-provenance.js                        # summary table
node scripts/check-provenance.js --annotate <file>      # per-line origin
node scripts/check-provenance.js --json                 # machine-readable
```

Verdicts are `YOURS` (under 5% baseline overlap), `BASELINE` (over 40%), and
`REVIEW` in between. Current classification of the 160 scanned files, with
source and tests separated because they carry very different costs:

| Verdict    | Files | Source lines | Test lines | Meaning                                                   |
| ---------- | ----: | -----------: | ---------: | --------------------------------------------------------- |
| `YOURS`    |    55 |        5,134 |        454 | Locally authored; copy and relicense freely.              |
| `REVIEW`   |    40 |        6,755 |        350 | Mixed origin; annotate and take only `+` hunks.           |
| `BASELINE` |    65 |       10,941 |     14,076 | Substantially the imported snapshot; reimplement instead. |

**The test column is the hidden cost of this project.** 14,076 lines of the
existing suite are `BASELINE` and cannot move — `tests/dataSource.test.ts` alone
is 4,264 lines, `tests/tabView.test.ts` 2,320, `tests/config.test.ts` 1,641.
Every one of those behaviours needs a black-box test written from scratch. Budget
for it explicitly; it is plausibly the single largest line item below.

The thresholds are heuristics, not a licence. `REVIEW` means read the
annotation, and a `YOURS` verdict on a file that only makes sense as a patch to
baseline internals still needs judgement before it moves.

The script reads `extensions/an-dr-commits`, which is the one place this
extension's tooling reaches outside its own directory; that is inherent to
comparing the two, it is a development script rather than shipped code, and
`.vscodeignore` is allowlist-based so it never enters the package. It is
deleted at cutover along with the staging identity.

## Target end state

The final package has the existing stable identity:

| Surface                 | Final value                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Extension ID            | `an-dr.an-dr-commits`                                                               |
| Package name            | `an-dr-commits`                                                                     |
| Command namespace       | `an-dr-commits.*`                                                                   |
| Configuration namespace | `an-dr-commits.*`                                                                   |
| Virtual diff scheme     | `an-dr-commits`                                                                     |
| Activity Bar container  | `an-dr-commits-container`                                                           |
| Activity Bar view       | `an-dr-commits.activityView`                                                        |
| Status-bar preference   | `an-dr-commits.statusBarIconOnly` is present and defaults to `true`                 |
| Uninstall hook          | `vscode:uninstall` script is present and cleans the same state the extension writes |

During development the staging extension keeps its `an-dr-com-mit-s` identity
so both implementations can run side by side. The identity swap happens once,
at cutover; it is never performed halfway through feature work.

### The gap to close

Backlog 1.3 asks for this; here is the measured answer, so the size of the
project is visible before any work starts. Re-read both columns from the
manifests when the ledger is built and treat drift as a ledger bug.

| Surface            | MIT staging today | Target | Gap |
| ------------------ | ----------------: | -----: | --: |
| Commands           |                 2 |      9 |   7 |
| Settings           |                14 |    139 | 125 |
| Activity Bar views |                 0 |      1 |   1 |

The settings gap is the largest single number in this plan and the least
examined. Backlog 0 triages it before any of it is scheduled.

### Decisions now recorded

| Question                                                                                         | Answer                                                                                          | Recorded in  |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | ------------ |
| Keep the imported `zh-cn`/`zh-tw` localization (`l10n/`, `package.nls.*`, `npm run l10n:check`)? | Yes. Keep `l10n:check` green; every user-facing string added from here needs all three bundles. | This roadmap |
| Keep the upstream `oxlint`/`oxfmt` toolchain, or move to the repository's `eslint` convention?   | Keep `oxlint`/`oxfmt`; they are MIT-baseline tooling.                                           | ADR pending  |
| Keep esbuild and Vitest, against the repository's "no bundler, no test framework" convention?    | Keep both; the webview genuinely needs bundling.                                                | ADR pending  |

The last two were settled once and the ADR recording them was lost when the
premature cutover was reverted; a copy survives at the `archive/mit-cutover`
tag. Rewrite it as this extension's ADR-002 during backlog 2, which is the first
item those decisions actually bind.

### Decisions still open

| Question                                                                                | Blocks                  | Default if undecided                                                                                                     |
| --------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Which of the 139 settings are kept, retired, or deferred?                               | Backlog 3 and most of 7 | None — backlog 0 exists to answer this, and scheduling settings work before it is answered is how the estimate runs away |
| Does workspace state migrate from the current extension, or start fresh under new keys? | Backlog 4               | Start fresh under versioned keys; never write the legacy keys, so rolling back to the current extension keeps working    |

## Initial structural alignment

The first work is an MIT-only refactor that gives the staging extension seams
matching the _responsibilities_ of current Commits. File names may align where
that makes the migration easier, but no current Commits file content moves over.

| Current Commits responsibility and source area                                                        | MIT staging starting point                                                                                                               | Planned staging structure                                               | Mechanical change                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lightweight activation, commands, serializer: `src/extension.ts`, `src/core.ts`, `src/commandIds.ts`  | `src/extension/main.ts`, `src/extension/initExtension.ts`                                                                                | `src/extension.ts`, `src/core.ts`, `src/commandIds.ts`                  | Move MIT activation wiring behind a lazy `core` factory; retain only MIT logic and write small adapters.                                                                                    |
| Git reads and graph snapshot: `src/dataSource.ts`, `src/data-source/*`, `src/repositoryGraphCache.ts` | `src/backend/gitClient.ts`, `src/backend/queries/*`                                                                                      | `src/dataSource.ts`, `src/data-source/*`, `src/repositoryGraphCache.ts` | Rehome MIT query functions first; expose a typed façade before adding caching.                                                                                                              |
| Repository discovery/state: `src/repoManager.ts`, `src/repo-manager/*`                                | `src/extension/repoManager.ts`, `src/extension/watchForRepos.ts`, `src/backend/queries/repoSearch.ts`, `src/backend/utils/repoSearch.ts` | `src/repoManager.ts`, `src/repo-manager/*`                              | Move MIT repository code into a single manager facade; preserve current behaviour only through acceptance tests.                                                                            |
| Repository change monitoring: `src/repoFileWatcher.ts`, `src/gitStatusMonitor.ts`                     | `src/repoFileWatcher.ts`, `src/extension/watchForRepos.ts`                                                                               | `src/repoFileWatcher.ts`, `src/gitStatusMonitor.ts`                     | Keep the MIT watcher first. `gitStatusMonitor.ts` is **2.7% baseline** — annotate, then relicense and move.                                                                                 |
| Git actions: `src/commands.ts`                                                                        | `src/backend/actions/{branch,commit,merge,tag}.ts`                                                                                       | `src/commands.ts`, `src/actions/*`                                      | Wrap existing MIT actions in one command dispatcher; add missing actions one operation at a time.                                                                                           |
| Graph editor tab: `src/views/tab/*`                                                                   | `src/extension/{webviewPanel,webviewHtml,webviewBridge,messageHandler}.ts`                                                               | `src/views/tab/*`                                                       | Keep the MIT bridge and panel lifecycle; split adapters by message category only after parity tests exist.                                                                                  |
| Browser graph UI: `web/*`, `web/styles/*`                                                             | `src/webview/*`, `media/*.css`                                                                                                           | `web/*`                                                                 | Move the MIT browser modules and their CSS without semantic change, and repoint the esbuild webview entry point. The bundler stays esbuild — see below.                                     |
| Status bar: `src/statusBarItem.ts`                                                                    | `src/statusBarItem.ts`                                                                                                                   | `src/statusBarItem.ts`                                                  | Rename only at first; preserve icon-only configuration and add branch/dirty status later.                                                                                                   |
| Commit/file virtual documents: `src/diffDocProvider.ts`                                               | `src/diffDocProvider.ts`                                                                                                                 | `src/diffDocProvider.ts`                                                | Retain MIT provider; add richer file/revision flows independently.                                                                                                                          |
| Extension state: `src/extensionState.ts`                                                              | `src/extensionState.ts`                                                                                                                  | `src/extensionState.ts`, `src/compat/migrationState.ts`                 | Keep MIT storage; add a versioned migration reader instead of importing old stored objects.                                                                                                 |
| Avatars: `src/avatarManager.ts`                                                                       | `src/avatarManager.ts`                                                                                                                   | `src/avatarManager.ts`                                                  | Already MIT; verify and retain.                                                                                                                                                             |
| Settings access: `src/config.ts`                                                                      | `src/config.ts`                                                                                                                          | `src/config.ts`                                                         | Already MIT; extend key by key as backlog 3 adds the compatibility reader.                                                                                                                  |
| Logging: `src/logger.ts`                                                                              | `src/extension/utils/logger.ts`                                                                                                          | `src/logger.ts`                                                         | Rehome only.                                                                                                                                                                                |
| Git credential prompts: `src/askpass/*`                                                               | No equivalent                                                                                                                            | `src/askpass/*`                                                         | **100% baseline** (`askpassMain.ts`), **91%** (`askpassManager.ts`) — reimplement. Blocks any authenticated fetch/pull/push, see backlog 6.                                                 |
| Git interactive editor: `src/gitEditor/*`                                                             | No equivalent                                                                                                                            | `src/gitEditor/*`                                                       | **32% baseline** (`gitEditorMain.ts`), **17%** (`gitEditorManager.ts`), both `REVIEW` — annotate and take the authored hunks. Blocks interactive rebase and message editing, see backlog 6. |
| Install/uninstall life cycle: `src/life-cycle/*`                                                      | No equivalent                                                                                                                            | `src/life-cycle/*`                                                      | **84–90% baseline** (`startup.ts`, `utils.ts`; `uninstall.ts` is 65%) — reimplement; the `vscode:uninstall` hook must exist before cutover.                                                 |
| Activity Bar sidebar: `src/views/sidebar/*`, `web/sidebar/*`                                          | No equivalent                                                                                                                            | `src/views/sidebar/*`, `web/sidebar/*`                                  | **1.0% baseline on `sidebarView.ts`, `YOURS`** across 9 files — relicense and move, ordered by the import graph rather than by feature; see _Porting locally authored code_.                |
| Inline blame: `src/inlineBlame.ts`                                                                    | No equivalent                                                                                                                            | `src/inlineBlame.ts`                                                    | **0% baseline, `YOURS`** — relicense and move, with its test.                                                                                                                               |
| Code review hand-off: `src/views/tab/miscActions.ts`                                                  | No equivalent                                                                                                                            | `src/codeReviewIntegration.ts`                                          | **0% baseline, `YOURS`** — relicense and move. The whole contract is one outbound `executeCommand('an-dr-code-review.setCommitRange', from, to, repo)`; nothing is persisted on this side.  |

The staging extension bundles with esbuild (`esbuild.js`, entry points
`src/extension/main.ts` and `src/webview/main.ts`) and tests with Vitest, unlike
the plain-`tsc`, no-test-framework convention the repository's other extensions
follow. That exception is deliberate and stays: rehoming `src/webview/*` to
`web/*` is a source-location move plus an entry-point update, not a switch to
the `tsc` + concatenate + uglify pipeline current Commits uses. Replacing the
bundler would be a separate decision, recorded before any file moves.

### Refactor completion check

Before feature work begins, the staging extension must:

1. Compile with `npm run compile` and typecheck with `npm run typecheck`.
2. Pass `npm test` (Vitest: `tests/backend`, `tests/extension`, `tests/webview`)
   and `npm run test:ext` (`vscode-test`: `tests-ext/`).
3. Pass `npm run lint`, `npm run format`, and `npm run l10n:check`.
4. Open the MIT graph and perform its original supported actions.
5. Have no imports from `extensions/an-dr-commits` and no relative path
   references escaping this extension's directory.
6. Keep all added files traceable to MIT staging files or newly authored code.
7. Keep browser code in `web/` and extension-host code in `src/` with no
   cross-world imports.

## Porting locally authored code

A `YOURS` verdict means the _expression_ is relicensable. It does not mean the
file compiles once moved, and the obstacle differs by area. Measured over the 47
`YOURS` source files:

| Category                     | Files | Lines | Obstacle                                                               |
| ---------------------------- | ----: | ----: | ---------------------------------------------------------------------- |
| CSS                          |     2 |   408 | None — move it                                                         |
| `web/*`                      |    23 | 3,109 | Written for global-scope concatenation; needs conversion to ES modules |
| `src/*`, imports all `YOURS` |     6 |   212 | None — move it                                                         |
| `src/*`, blocked             |    16 | 1,405 | Imports resolve into `BASELINE`/`REVIEW` modules                       |

**Only 620 lines are drop-in.** The rest needs one of two conversions, and
neither is visible in a provenance verdict.

### The `web/` trap

22 of the 23 `web/` files contain **zero `import` statements** —
`web/changesPanel.ts` is 615 lines with none, `web/main/fullDiffPanel.ts` 469,
`web/main/loadProcessing.ts` 437. They are not dependency-free; the retired
build pipeline concatenated them into one global scope, so their dependencies
were never written down. The MIT webview uses real ES modules bundled by
esbuild.

Porting one therefore means recovering its implicit dependencies: find every
identifier it uses but does not define, locate that identifier's origin, and
add an explicit import. An import-graph analysis cannot find these — a file with
no imports looks standalone and is not.

This fails silently. A missed global becomes a runtime `undefined` that
typechecks cleanly and passes any test not exercising that path. For each ported
`web/` file, exercise it in the running extension, not only under Vitest.

### Blocked `src/` files

The blockers concentrate in a handful of modules:

| Blocking module                 | Files needing it | Verdict         |
| ------------------------------- | ---------------: | --------------- |
| `src/dataSource.ts`             |                9 | BASELINE        |
| `src/utils.ts`                  |                6 | BASELINE        |
| `src/repoManager.ts`            |                5 | BASELINE        |
| `src/config.ts`                 |                4 | BASELINE        |
| `src/logger.ts`                 |                4 | BASELINE        |
| `src/utils/event.ts`            |                4 | BASELINE (100%) |
| `src/utils/disposable.ts`       |                3 | BASELINE        |
| `src/types/base.ts`             |                3 | BASELINE        |
| `src/types/message-protocol.ts` |                3 | BASELINE        |

**Port order follows the obstacle, not the feature grouping.** Move the 620
drop-in lines first; convert `web/` files once the module pattern is
established; port blocked `src/` files only after every module they import has
an MIT equivalent. Recompute this classification after each group lands rather
than trusting the snapshot above.

### Symbol mapping

Every symbol the blocked files import from a non-`YOURS` module, and what it
becomes. "Author it" means no MIT equivalent exists and the replacement is new
code — never a copy of the baseline original.

| Old import                                                                                                                                                                                                                                               | MIT equivalent                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `utils/event` → `Event`, `EventEmitter`                                                                                                                                                                                                                  | `vscode.EventEmitter` / `vscode.Event` from the VS Code API                                                                                                                  |
| `utils/disposable` → `Disposable`, `toDisposable`                                                                                                                                                                                                        | `vscode.Disposable`                                                                                                                                                          |
| `logger` → `Logger`                                                                                                                                                                                                                                      | `logger` in `src/extension/utils/logger.ts`                                                                                                                                  |
| `config` → `getConfig`                                                                                                                                                                                                                                   | the `config` object in `src/config.ts`                                                                                                                                       |
| `extensionState` → `ExtensionState`                                                                                                                                                                                                                      | `ExtensionState` in `src/extensionState.ts`                                                                                                                                  |
| `avatarManager` → `AvatarManager`                                                                                                                                                                                                                        | `AvatarManager` in `src/avatarManager.ts`                                                                                                                                    |
| `repoFileWatcher` → `RepoFileWatcher`                                                                                                                                                                                                                    | `RepoFileWatcher` in `src/repoFileWatcher.ts`                                                                                                                                |
| `repoManager` → `RepoManager`                                                                                                                                                                                                                            | `createRepoManager` in `src/extension/repoManager.ts` — a factory, not a class                                                                                               |
| `utils` → `abbrevCommit`                                                                                                                                                                                                                                 | `src/backend/utils/string.ts`                                                                                                                                                |
| `utils` → `getPathFromUri`                                                                                                                                                                                                                               | `src/backend/utils/path.ts`                                                                                                                                                  |
| `utils` → `copyToClipboard`                                                                                                                                                                                                                              | `src/extension/utils/clipboard.ts`                                                                                                                                           |
| `utils` → `viewDiff`                                                                                                                                                                                                                                     | `encodeDiffDocUri` from `src/diffDocProvider.ts` plus `vscode.diff`; see `viewDiff` in `messageHandler.ts`                                                                   |
| `dataSource` → `DataSource`                                                                                                                                                                                                                              | No equivalent shape. MIT is function-based: `loadCommits(git, input)`, `loadBranches(...)`, `commitDetails(...)`, with `gitClientFactory` supplying the `SimpleGit` instance |
| `utils` → `UNCOMMITTED`, `archive`, `viewScm`, `viewFileAtRevision`, `viewDiffWithWorkingFile`, `copyFilePathToClipboard`, `openFile`, `openExternalUrl`, `openExtensionSettings`, `showErrorMessage`, `getSortedRepositoryPaths`, `getRelativeTimeDiff` | Author it                                                                                                                                                                    |
| `dataSource` → `GitChangeCounts`, `GitWorkingTreeChange`, `HeadInfo`, `BlameLineInfo`, `GitConfigKey`, `GitCommitDetailsData`                                                                                                                            | Author it, on `src/backend/types/*`                                                                                                                                          |
| `types/base`, `types/settings`, `types/message-protocol`, `types/git-domain`                                                                                                                                                                             | Author it, on `src/types.ts` and `src/backend/types/*`                                                                                                                       |

The `DataSource` row is the hard one: a class with methods becomes free
functions taking an explicit git handle. Every blocked file touching it needs
its call sites restructured, which is why it blocks the most files and why the
first port of any group is pattern-establishing work rather than mechanical.

### Worked example: `src/views/sidebar/sidebarView.ts`

305 lines, 0.7% baseline — as portable as anything in the project, and still not
movable today. Its 16 imports split:

- **Move with it, already `YOURS`:** `./miniGraph`, `./html`,
  `../common/repoSelection`, `../../gitStatusMonitor`,
  `../../types/sidebar-state`, `../../types/sidebar-protocol`
- **Already in MIT staging, retarget the import:** `../../config`,
  `../../extensionState`
- **Restructure the call sites:** `../../dataSource` (`DataSource`,
  `GitChangeCounts`, `GitWorkingTreeChange`, `HeadInfo`), `../../repoManager`
- **Author first:** `../../utils` (`UNCOMMITTED`, `viewDiff`,
  `viewSubmoduleDiff`), `../../utils/event` (`Event`)
- **Audit the `+` hunks:** `../common/repoWarmer` (`REVIEW`)

So group A's real prerequisite is not backlog 4 alone: it needs the MIT
`DataSource` replacement and the authored `utils` subset first. Sequence the
group behind those, and port `sidebarView.ts` last within it, after the six
files that move with it.

### Who executes what

| Kind of work                                       |  Lines | Executor                              |
| -------------------------------------------------- | -----: | ------------------------------------- |
| CSS and drop-in `src/` files                       |    620 | Mechanical — delegatable immediately  |
| Symbol mapping, and the first port in each cluster |      — | Pattern-establishing — primary agent  |
| `web/` ports after the module pattern exists       | ~3,100 | Delegatable, but see the caveat below |
| Blocked `src/` ports                               | ~1,405 | Pattern-establishing — primary agent  |
| Reimplementation of `BASELINE` services            |      — | Pattern-establishing — primary agent  |
| Every `VERIFY` pass and the reachability check     |      — | Primary agent, never delegated        |

**Only 620 lines are delegatable before any pattern work.** The `web/` bulk
becomes delegatable only after the first two or three conversions establish how
implicit globals map to explicit imports — and even then, each port must be
exercised in the running extension, because the failure mode is a runtime
`undefined` that every static check passes.

A delegated port follows an existing example in the same cluster and changes no
API decisions. If a port needs a new mapping-table row, or introduces an import
whose origin is not already mapped, it is not mechanical and comes back to the
primary agent.

## Compatibility inventory method

Do not reverse-engineer implementation details. Build a compact, independent
contract from observable behaviour.

| Inventory item                                   | Source of fact                                   | Resulting artefact                                           |
| ------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------ |
| Commands and menus (9 commands today)            | Current package manifest and Command Palette     | `docs/roadmap/compatibility/commands.md`                     |
| Configuration keys and defaults (139 keys today) | Current package manifest and Settings UI         | `docs/roadmap/compatibility/settings.md`                     |
| View IDs and storage keys                        | Running extension behaviour and package manifest | `docs/roadmap/compatibility/state.md`                        |
| Git action behaviour                             | Disposable Git fixture repositories              | Black-box Vitest suites under `tests/`, written from scratch |
| Graph and details UI                             | Manual acceptance checklist and screenshots      | Scenario checklist, not copied markup or styles              |

The two counts above are a snapshot; re-read them from the manifest when the
ledger is built, and treat any drift as a ledger bug rather than adjusting them
here.

Every inventory row receives one of these labels:

- **Already MIT** — supported by the staging extension now; verify and retain.
- **Adapter** — public identity/configuration difference only; add a thin new
  adapter.
- **New implementation** — no MIT equivalent; schedule an independently
  authored component.
- **Intentionally retired** — only with an explicit user decision and migration
  note.

## Ordered transition backlog

Each numbered item is split into commits of roughly 150–300 changed lines. A
commit must compile and have focused tests; do not mix structural moves with a
new feature in the same commit.

### Ordering principle

Two rules decide the order, and they sometimes conflict:

1. **Portable code moves as early as its substrate allows.** A `YOURS` file is
   already written, already tested in production use, and costs a fraction of an
   equivalent reimplementation. Deferring it converts cheap work into expensive
   work and leaves the extension unusable for longer.
2. **Nothing moves before what it depends on.** The sidebar needs a repository
   manager; the panels need the tab. Where the two rules conflict, this one wins
   — but the delay must be a real dependency, not a preference for finishing one
   category before starting another.

In the table below, **the Move column is measured** — substantive lines from the
provenance data. **The Author and Tests columns are estimates** and have not
been derived from anything; treat them as order-of-magnitude only and replace
each with a real figure when its backlog item is planned. Backlog 0 replaces the
settings-driven ones first.

The measured column is the basis for the size rule; an item that cannot be split
into 150–300 line commits is not ready to start.

|   # | Item                                                   |   Move | Author |  Tests |
| --: | ------------------------------------------------------ | -----: | -----: | -----: |
|   0 | Triage the settings surface                            |      — |      — |      — |
|   1 | Compatibility ledger                                   |      — |   ~200 |      — |
|   2 | Align the MIT staging structure                        |      — |   ~400 |   ~300 |
|   3 | Compatibility shell                                    |      — |   ~350 |   ~250 |
|   4 | Repository lifecycle and status                        |   ~226 |   ~500 |   ~600 |
|   5 | Port the provenance-clear feature set                  | ~4,200 |   ~600 | ~1,500 |
|   6 | Git action parity                                      |   ~325 | ~1,800 | ~3,000 |
|   7 | Graph and browser parity                               | ~1,028 | ~1,200 | ~2,500 |
|   8 | Details, comparison, and file workflows                | ~1,052 |   ~900 | ~2,000 |
|   9 | Install/uninstall life cycle and optional integrations |      — |   ~700 |   ~600 |
|  10 | Cutover and cleanup                                    |      — |   ~200 |      — |

Roughly 6,800 lines move, 6,850 are authored, and 10,750 are tests. **The test
column is the largest** — if a plan revision ever makes it look small, the
revision is wrong.

### 0. Triage the settings surface

125 of the 139 settings have no MIT equivalent today. Scheduling that as one
undifferentiated block is how this project's estimate runs away, so classify
before committing to any of it.

1. List all 139 keys with their current default and the feature they control.
2. Label each **keep** (reimplement), **retire** (drop, with a migration note),
   or **defer** (post-cutover), and record a line estimate per keep.
3. Sum the keeps into the backlog 3, 7, and 8 estimates above, replacing them.
4. Any setting controlling a feature that is itself retired is retired with it —
   a setting for a view that does not exist is the defect this transition
   already shipped once.

**Exit:** Every one of the 139 keys carries a label and, if kept, an estimate.
No settings work starts before this is complete.

### 1. Establish the compatibility ledger

1. Create command, settings, state, and scenario inventory documents.
2. Add a machine-readable feature ledger at
   `docs/roadmap/compatibility/feature-ledger.json`. One object per row, with
   `status` drawn from the four labels above:

   ```json
   [
     {
       "id": "an-dr-commits.addGitRepository",
       "surface": "command",
       "status": "New implementation",
       "target": "command adapter for an-dr-commits.addGitRepository",
       "test": "tests-ext/compatibility.test.ts"
     }
   ]
   ```

   A prior version of this file, covering all 9 commands and 139 settings,
   survives at the `archive/mit-cutover` tag and is worth recovering rather than
   retyping — but re-derive every `status` from the current staging extension,
   since that copy was written against a tree that no longer exists.

3. Record which capabilities are already offered by the MIT staging extension.
4. Record the cutover constraints and rollback procedure.

**Exit:** Every documented current feature belongs to exactly one migration
category; no source code is copied.

### 2. Align the MIT staging structure

1. Introduce the activation/core/command seams in the table above.
2. Rehome MIT Git query/action modules behind `DataSource` and `RepoManager`
   facades without changing their output.
3. Rehome the MIT webview into the repository's `web/` layout, repoint the
   esbuild entry point, and make its build output explicit.
4. Extend the existing Vitest suites — `tests/backend/actions/*`,
   `tests/backend/queries/*`, `tests/extension/watchForRepos.test.ts` — into
   contract tests around graph loading and repository discovery before
   extending the modules they cover. These suites already exist; do not
   re-create them.

**Exit:** The staging implementation has the target module boundaries and
still behaves as the MIT extension.

### 3. Add the `an-dr-commits` compatibility shell

1. Add a versioned configuration reader: canonical internal values remain
   staging values until cutover, while a compatibility reader understands
   selected `an-dr-commits.*` settings.
2. Add command registrations for the public Commits command set. Commands that
   lack an implementation return a clear, temporary capability error during
   staging; no silent no-ops.
3. Add ID, view, state, and virtual-document scheme migration functions.
4. Write a launch test proving that the two extensions can coexist without
   command, state, or URI-scheme collisions.

**Exit:** The target public contract is represented, but the original
extension remains the only provider of incomplete features.

### 4. Repository lifecycle and status

1. Add workspace and external repository discovery.
2. Add selected-repository persistence, dropdown ordering, and starred state.
3. Add active-editor repository selection and file-system/Git metadata refresh.
4. Add a status monitor that feeds the status bar, tab, and future sidebar from
   the same state source.

**Exit:** Multiple repositories remain correctly selected and refreshed across
window reloads and linked worktrees.

### 5. Port the provenance-clear feature set

The largest block of ready-made functionality, and the point at which the
staging extension stops being a demo. Everything here is `YOURS`: it moves,
adapted to the MIT APIs, and is not rewritten.

**Prerequisites are per file, not per group.** Read _Porting locally authored
code_ before starting: 31 of the 47 portable files compile standalone and can
move as soon as backlog 2 gives them somewhere to live, while 16 are blocked
until the modules they import have MIT equivalents — chiefly the `DataSource`
replacement, the authored `utils` subset, and `RepoManager`. Those blocked files
land late, some of them only after backlogs 7 and 8.

Do not treat a group as a unit of scheduling. Within each group, port the
standalone files first and the blocked ones as their dependencies appear.

Groups, for grouping related review and testing — not for ordering. They cover
4,232 of the 5,134 `YOURS` source lines; the remaining ~900 (`extension.ts`,
`statusBarItem.ts`, `graphRebase.ts`, `webviewHtml.ts`, `syntaxHighlight.ts`,
`fileIcons.ts` and other singletons) are ported alongside whichever group first
needs them. Do not read the group list as the complete inventory — the ledger
is:

| Group                                   | Files                                                                                                  |  Lines |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ | -----: |
| A. Activity Bar sidebar                 | `web/sidebar/*`, `src/views/sidebar/*`, `src/types/sidebar-{protocol,state}.ts`                        | ~1,404 |
| B. Changes, files, and full-diff panels | `web/changesPanel.ts`, `web/filesPanel.ts`, `web/main/fullDiffPanel.ts`, `web/styles/changesPanel.css` | ~1,052 |
| C. Graph rendering helpers              | `web/main/{loadProcessing,tableRender,controlsLayout,avatarVisuals,constructorInit}.ts`                | ~1,028 |
| D. Blame, graph cache, status monitor   | `src/inlineBlame.ts`, `src/repositoryGraphCache.ts`, `src/gitStatusMonitor.ts`                         |   ~423 |
| E. Tab action modules                   | `src/views/tab/{commitGraphActions,diffFileContentActions,workingTreeActions,miscActions}.ts`          |   ~325 |

Adapting to the MIT APIs is real work — imports, type names, and service
boundaries all differ — but the behaviour and its edge cases come across intact,
which is the entire reason this category exists.

Group E's Code Review hand-off, in `miscActions.ts`, is one outbound
`executeCommand('an-dr-code-review.setCommitRange', from, to, repo)` behind
capability detection. When the receiver is absent the user must be told, not
left with a button that silently does nothing.

**Exit:** Every ported file is reachable from `activate()`, exercised through
its real caller, and recorded with its checker verdict.

### 6. Git action parity

Implement and test one operation family at a time. Two shared services come
first, because most families below fail without them:

0. Credential and editor plumbing: the askpass service (any authenticated
   fetch, pull, or push) and the Git interactive-editor service (interactive
   rebase, commit-message editing). Neither exists in the MIT staging
   extension, so both are new independently authored code.
1. Branch operations: create, checkout, rename, delete, merge, rebase, reset,
   fetch into local branch, pull, and push.
2. Tag operations: create lightweight/annotated tags, delete, push, and show
   annotation details.
3. Commit operations: checkout, cherry-pick, drop, revert, reset, compare, and
   copy identifiers.
4. Working-tree operations: stage, unstage, commit, amend, discard, clean,
   stash, apply, pop, drop, and branch-from-stash.
5. Remote operations: add, edit, delete, fetch, and prune. The pull-request
   launch action belongs here; the URL construction it calls is built in
   backlog 8.4.

Each operation uses a disposable local Git fixture and checks success, failure,
cancellation, and repository-in-progress handling.

### 7. Graph and browser parity

1. Add branch/tag/stash/ref filtering, custom glob patterns, and repository
   load modes.
2. Add commit order, first-parent, reflog, tag-only, remote-head, and untracked
   display settings.
3. Add find, keyboard navigation, column visibility/width persistence, graph
   colours/styles, reference-label modes, and density/accessibility options.
4. Add load-more, background refresh, cache invalidation, and large-repository
   limits only after correctness tests exist.

**Exit:** Every graph scenario in the compatibility ledger has a passing
black-box test or an explicit retirement decision.

### 8. Details, comparison, and file workflows

1. Add commit details, file list/tree, copy/open actions, URLs, Markdown, and
   emoji rendering.
2. Add two-commit comparison and uncommitted-versus-commit comparison.
3. Add native VS Code diff, unified/split full diff, syntax highlighting, file
   revision/open/restore operations, encodings, mailmap, and signatures.
4. Add issue-link and pull-request provider configuration as independent URL
   construction modules.

### 9. Install/uninstall life cycle and optional integrations

The sidebar, blame, and Code Review hand-off that this item used to hold moved
to backlog 5 — they are `YOURS` and should not wait behind reimplementation
work. What remains here is genuinely baseline-derived or optional.

1. Add the install/uninstall life cycle, including the `vscode:uninstall`
   script, so uninstalling the final extension clears the state it wrote. The
   current implementation is **84–90% baseline** — reimplement, do not move.
   Verify the hook actually runs: it is skipped for extensions installed by
   symlink or junction, which is how `install.ps1` installs everything here, so
   a hook that is never exercised is not done.
2. Add SCM title/actions and terminal integration last, behind capability
   detection.

### 10. Cutover and cleanup

1. Prune the upstream project scaffolding the MIT import carried in, which
   belongs to neo-git-graph's own repository rather than to an extension inside
   this one: `.github/` (notably `workflows/publish.yml`, which publishes under
   the upstream identity), `flake.nix`, `flake.lock`, `.envrc`,
   `pnpm-workspace.yaml`, and the duplicate `pnpm-lock.yaml` beside
   `package-lock.json`. Keep `LICENSE`, `NOTICE.md`, and `CHANGELOG.md`.
2. Run the complete command/settings/scenario matrix on Windows, Linux, and
   macOS.
3. Test settings/state migration from a copied VS Code profile directory,
   including an uninstall/reinstall cycle that exercises `vscode:uninstall`.
4. Build and install the replacement under `an-dr-commits` in a disposable VS
   Code profile.
5. Create a rollback tag, replace the current extension folder, remove the
   temporary staging extension, delete `.installignore` so the installer picks
   the replacement up, and run `install.ps1`.
6. Re-run the matrix with the final identity and publish the migration notes.

## Mechanical-work checklist

For every transition task, use this sequence to keep reasoning small and
repeatable:

1. Choose one ledger row and one target module.
2. Establish the source: the closest MIT staging module, a checker-cleared
   `YOURS` file from the current extension, the `+` hunks of a `REVIEW` file, or
   newly authored code. Record which, with the checker verdict.
3. Add a small typed adapter or independently authored implementation.
4. Wire it to its real caller in the same commit. A module that compiles but
   nothing reaches is not progress.
5. Add a black-box test for the row's observable behaviour, driven through that
   caller rather than by importing the module directly.
6. Run `npm run typecheck`, `npm run compile`, the focused Vitest project
   (`npx vitest run --project backend|extension|webview`), and
   `git diff --check`.
7. Run the reachability check below.
8. Review the diff for forbidden path references and provenance drift.

### Reachability check

An earlier attempt at this transition marked eighteen increments complete while
shipping eight modules that nothing imported, each with a passing unit test on
its own exported helper. Green tests do not distinguish working code from dead
code; this check does.

For every symbol exported by a file the increment added, list its references:

```sh
grep -rl "<exportedSymbol>" src tests | grep -v node_modules
```

If the only matches are the file itself and its own test, the symbol is dead and
the increment fails. Either wire it to a caller or delete it — a module kept
"for later" is indistinguishable from a module that was never finished.

The same failure has a manifest form: a declared command that no code
registers, or a declared setting that no code reads. Both are user-visible lies
and both are caught by the same question — _what reaches this?_

Use `an-dr-commits` as a copy source only through the checker, never by
inspection alone. A file that "looks new" proves nothing: the refactors moved
baseline code into new files, and nothing in the Git history distinguishes the
two. If a requirement cannot be met by an adapter, an MIT module reuse, a
checker-cleared copy, or a new small implementation, stop and create a design
decision before proceeding.

## Cutover gates

The final replacement may take the `an-dr-commits` identity only when all gates
are true:

- The feature ledger has no unclassified rows.
- Every question in _Decisions still open_ has been answered and recorded.
- Each retained public feature has a passing acceptance test.
- `LICENSE`, `NOTICE.md`, and dependency notices pass the provenance review,
  and `NOTICE.md` still names the exact neo-git-graph commit the code derives
  from.
- The final package has no source imports from the current implementation, and
  no expression traceable to the baseline snapshot: `check-provenance.js` run
  with `--baseline 4d4c579:extensions/an-dr-git` against the final tree reports
  no `BASELINE` file and no unresolved `REVIEW` file.
- Every copied file or hunk has a recorded checker verdict.
- Every declared command is registered on **every** activation path, including
  the path taken when no repository is found, and every declared setting is read
  by code that acts on it. A manifest entry with no implementation behind it
  fails the cutover.
- No exported symbol is referenced only by its own file and its own test.
- The cutover preflight asserts observable behaviour, not manifest arithmetic.
  A gate that counts entries in the same file it guards passes by construction
  and proves nothing.
- `extensions/an-dr-commits/NOTICE.md` is corrected: it currently claims the
  original license is MIT, which contradicts the restrictive `LICENSE` beside
  it, and its project URL is a find/replace corruption of the upstream one.
- `npm test`, `npm run test:ext`, `npm run lint`, `npm run format`, and
  `npm run l10n:check` all pass.
- A clean VS Code profile installs and opens the replacement successfully.
- A rollback tag and recovery instructions exist.
