# an-dr-commits MIT Transition Roadmap

## Purpose

Replace the implementation currently installed as `an-dr-commits` with an
MIT-derived implementation while retaining its public VS Code identity and
user-facing capabilities. The migration starts from this extension's
neo-git-graph-derived code, not from the existing `an-dr-commits` source.

This is a transition plan, not an instruction to copy the current Commits
implementation. The existing extension is a behavioural reference only.

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
`REVIEW` in between. Current classification of the 160 scanned files:

| Verdict    | Files | Meaning                                                               |
| ---------- | ----: | --------------------------------------------------------------------- |
| `YOURS`    |    55 | Locally authored; copy and relicense freely. 5,588 substantive lines. |
| `REVIEW`   |    40 | Mixed origin; annotate and take only `+` hunks.                       |
| `BASELINE` |    65 | Substantially the imported snapshot; reimplement instead.             |

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

### Decisions still open

These have no answer yet and block the sections that name them. Resolve each
with a design decision before the section that depends on it starts.

| Question                                                                                                                  | Blocks                                           | Default if undecided                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the final extension keep the imported `zh-cn`/`zh-tw` localization (`l10n/`, `package.nls.*`, `npm run l10n:check`)? | Cutover; every string added between now and then | Keep it, and keep `l10n:check` green                                                                                                                                                   |
| Does the final extension keep the upstream `oxlint`/`oxfmt` toolchain, or move to the repository's `eslint` convention?   | Backlog 2                                        | Keep `oxlint`/`oxfmt`; they are MIT-baseline tooling                                                                                                                                   |
| Does the final extension keep esbuild and Vitest, against the repository's "no bundler, no test framework" convention?    | Backlog 2                                        | Keep both. The root `AGENTS.md` already states the esbuild exception, but no ADR records it — write one, since [ADR-001](../adr/ADR-001-mit-fork-provenance.md) covers only provenance |

## Initial structural alignment

The first work is an MIT-only refactor that gives the staging extension seams
matching the _responsibilities_ of current Commits. File names may align where
that makes the migration easier, but no current Commits file content moves over.

| Current Commits responsibility and source area                                                        | MIT staging starting point                                                                                                               | Planned staging structure                                               | Mechanical change                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lightweight activation, commands, serializer: `src/extension.ts`, `src/core.ts`, `src/commandIds.ts`  | `src/extension/main.ts`, `src/extension/initExtension.ts`                                                                                | `src/extension.ts`, `src/core.ts`, `src/commandIds.ts`                  | Move MIT activation wiring behind a lazy `core` factory; retain only MIT logic and write small adapters.                                                                                   |
| Git reads and graph snapshot: `src/dataSource.ts`, `src/data-source/*`, `src/repositoryGraphCache.ts` | `src/backend/gitClient.ts`, `src/backend/queries/*`                                                                                      | `src/dataSource.ts`, `src/data-source/*`, `src/repositoryGraphCache.ts` | Rehome MIT query functions first; expose a typed façade before adding caching.                                                                                                             |
| Repository discovery/state: `src/repoManager.ts`, `src/repo-manager/*`                                | `src/extension/repoManager.ts`, `src/extension/watchForRepos.ts`, `src/backend/queries/repoSearch.ts`, `src/backend/utils/repoSearch.ts` | `src/repoManager.ts`, `src/repo-manager/*`                              | Move MIT repository code into a single manager facade; preserve current behaviour only through acceptance tests.                                                                           |
| Repository change monitoring: `src/repoFileWatcher.ts`, `src/gitStatusMonitor.ts`                     | `src/repoFileWatcher.ts`, `src/extension/watchForRepos.ts`                                                                               | `src/repoFileWatcher.ts`, `src/gitStatusMonitor.ts`                     | Keep the MIT watcher first. `gitStatusMonitor.ts` is **4% baseline** — annotate, then relicense and move.                                                                                  |
| Git actions: `src/commands.ts`                                                                        | `src/backend/actions/{branch,commit,merge,tag}.ts`                                                                                       | `src/commands.ts`, `src/actions/*`                                      | Wrap existing MIT actions in one command dispatcher; add missing actions one operation at a time.                                                                                          |
| Graph editor tab: `src/views/tab/*`                                                                   | `src/extension/{webviewPanel,webviewHtml,webviewBridge,messageHandler}.ts`                                                               | `src/views/tab/*`                                                       | Keep the MIT bridge and panel lifecycle; split adapters by message category only after parity tests exist.                                                                                 |
| Browser graph UI: `web/*`, `web/styles/*`                                                             | `src/webview/*`, `media/*.css`                                                                                                           | `web/*`                                                                 | Move the MIT browser modules and their CSS without semantic change, and repoint the esbuild webview entry point. The bundler stays esbuild — see below.                                    |
| Status bar: `src/statusBarItem.ts`                                                                    | `src/statusBarItem.ts`                                                                                                                   | `src/statusBarItem.ts`                                                  | Rename only at first; preserve icon-only configuration and add branch/dirty status later.                                                                                                  |
| Commit/file virtual documents: `src/diffDocProvider.ts`                                               | `src/diffDocProvider.ts`                                                                                                                 | `src/diffDocProvider.ts`                                                | Retain MIT provider; add richer file/revision flows independently.                                                                                                                         |
| Extension state: `src/extensionState.ts`                                                              | `src/extensionState.ts`                                                                                                                  | `src/extensionState.ts`, `src/compat/migrationState.ts`                 | Keep MIT storage; add a versioned migration reader instead of importing old stored objects.                                                                                                |
| Avatars: `src/avatarManager.ts`                                                                       | `src/avatarManager.ts`                                                                                                                   | `src/avatarManager.ts`                                                  | Already MIT; verify and retain.                                                                                                                                                            |
| Settings access: `src/config.ts`                                                                      | `src/config.ts`                                                                                                                          | `src/config.ts`                                                         | Already MIT; extend key by key as backlog 3 adds the compatibility reader.                                                                                                                 |
| Logging: `src/logger.ts`                                                                              | `src/extension/utils/logger.ts`                                                                                                          | `src/logger.ts`                                                         | Rehome only.                                                                                                                                                                               |
| Git credential prompts: `src/askpass/*`                                                               | No equivalent                                                                                                                            | `src/askpass/*`                                                         | **94% baseline** — reimplement. Blocks any authenticated fetch/pull/push, see backlog 5.                                                                                                   |
| Git interactive editor: `src/gitEditor/*`                                                             | No equivalent                                                                                                                            | `src/gitEditor/*`                                                       | **19% baseline, `REVIEW`** — annotate and take the authored hunks. Blocks interactive rebase and message editing, see backlog 5.                                                           |
| Install/uninstall life cycle: `src/life-cycle/*`                                                      | No equivalent                                                                                                                            | `src/life-cycle/*`                                                      | **86% baseline** — reimplement; the `vscode:uninstall` hook must exist before cutover.                                                                                                     |
| Activity Bar sidebar: `src/views/sidebar/*`, `web/sidebar/*`                                          | No equivalent                                                                                                                            | `src/views/sidebar/*`, `web/sidebar/*`                                  | **0.7% baseline, `YOURS`** across 9 files — relicense and move after tab parity.                                                                                                           |
| Inline blame: `src/inlineBlame.ts`                                                                    | No equivalent                                                                                                                            | `src/inlineBlame.ts`                                                    | **0% baseline, `YOURS`** — relicense and move, with its test.                                                                                                                              |
| Code review hand-off: `src/views/tab/miscActions.ts`                                                  | No equivalent                                                                                                                            | `src/codeReviewIntegration.ts`                                          | **0% baseline, `YOURS`** — relicense and move. The whole contract is one outbound `executeCommand('an-dr-code-review.setCommitRange', from, to, repo)`; nothing is persisted on this side. |

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

### 1. Establish the compatibility ledger

1. Create command, settings, state, and scenario inventory documents.
2. Add a machine-readable feature ledger with `id`, `surface`, `status`,
   `target`, and `test` fields.
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

### 5. Git action parity

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
   backlog 7.4.

Each operation uses a disposable local Git fixture and checks success, failure,
cancellation, and repository-in-progress handling.

### 6. Graph and browser parity

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

### 7. Details, comparison, and file workflows

1. Add commit details, file list/tree, copy/open actions, URLs, Markdown, and
   emoji rendering.
2. Add two-commit comparison and uncommitted-versus-commit comparison.
3. Add native VS Code diff, unified/split full diff, syntax highlighting, file
   revision/open/restore operations, encodings, mailmap, and signatures.
4. Add issue-link and pull-request provider configuration as independent URL
   construction modules.

### 8. Sidebar, blame, and review tooling

1. Add the Activity Bar container, shared repository selection, working-tree
   controls, and mini graph.
2. Add inline blame as a cancellable document-version service with its own
   configuration and tests.
3. Add the Code Review hand-off: a single outbound
   `an-dr-code-review.setCommitRange` invocation behind capability detection,
   degrading silently when that extension is absent. No state crosses back.
4. Add the install/uninstall life cycle, including the `vscode:uninstall`
   script, so uninstalling the final extension clears the state it wrote.
5. Add SCM title/actions and terminal integration last, behind capability
   detection.

### 9. Cutover and cleanup

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
2. Copy only the closest MIT staging module, then rename/move it if necessary.
3. Add a small typed adapter or independently authored implementation.
4. Add a black-box test for the row's observable behaviour.
5. Run `npm run typecheck`, `npm run compile`, the focused Vitest project
   (`npx vitest run --project backend|extension|webview`), and
   `git diff --check`.
6. Review the diff for forbidden path references and provenance drift.

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
- `extensions/an-dr-commits/NOTICE.md` is corrected: it currently claims the
  original license is MIT, which contradicts the restrictive `LICENSE` beside
  it, and its project URL is a find/replace corruption of the upstream one.
- `npm test`, `npm run test:ext`, `npm run lint`, `npm run format`, and
  `npm run l10n:check` all pass.
- A clean VS Code profile installs and opens the replacement successfully.
- A rollback tag and recovery instructions exist.
