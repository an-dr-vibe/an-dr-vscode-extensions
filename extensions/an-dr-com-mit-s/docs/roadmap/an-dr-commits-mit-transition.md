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
2. Do not copy TypeScript, JavaScript, CSS, HTML, tests, comments, or strings
   from `extensions/an-dr-commits` into this extension.
3. Public interface facts can be recorded independently: command IDs, setting
   keys, view IDs, and user-observable acceptance scenarios. Their
   implementation must be authored on the MIT foundation.
4. Preserve the MIT license and notice in the final replacement. Audit every
   newly added dependency before it enters `package.json`.
5. Keep the current `an-dr-commits` folder intact until the replacement passes
   the complete transition matrix and a cutover is approved.

## Terminology and working copies

| Term | Location | Role |
| --- | --- | --- |
| Current Commits | `extensions/an-dr-commits` | Behavioural reference; never an implementation source. |
| MIT staging extension | `extensions/an-dr-com-mit-s` | The only codebase changed during the migration. |
| Final extension | `extensions/an-dr-commits` | The staging extension after approved cutover and identity switch. |
| MIT baseline | neo-git-graph at the revision in `NOTICE.md` | Imported source provenance. |

## Target end state

The final package has the existing stable identity:

| Surface | Final value |
| --- | --- |
| Extension ID | `an-dr.an-dr-commits` |
| Package name | `an-dr-commits` |
| Command namespace | `an-dr-commits.*` |
| Configuration namespace | `an-dr-commits.*` |
| Virtual diff scheme | `an-dr-commits` |
| Activity Bar container | `an-dr-commits-container` |
| Activity Bar view | `an-dr-commits.activityView` |
| Status-bar preference | `an-dr-commits.statusBarIconOnly` is present and defaults to icon-only |

During development the staging extension keeps its `an-dr-com-mit-s` identity
so both implementations can run side by side. The identity swap happens once,
at cutover; it is never performed halfway through feature work.

## Initial structural alignment

The first work is an MIT-only refactor that gives the staging extension seams
matching the *responsibilities* of current Commits. File names may align where
that makes the migration easier, but no current Commits file content moves over.

| Current Commits responsibility and source area | MIT staging starting point | Planned staging structure | Mechanical change |
| --- | --- | --- | --- |
| Lightweight activation, commands, serializer: `src/extension.ts`, `src/core.ts`, `src/commandIds.ts` | `src/extension/main.ts`, `src/extension/initExtension.ts` | `src/extension.ts`, `src/core.ts`, `src/commandIds.ts` | Move MIT activation wiring behind a lazy `core` factory; retain only MIT logic and write small adapters. |
| Git reads and graph snapshot: `src/dataSource.ts`, `src/data-source/*`, `src/repositoryGraphCache.ts` | `src/backend/gitClient.ts`, `src/backend/queries/*` | `src/dataSource.ts`, `src/data-source/*`, `src/repositoryGraphCache.ts` | Rehome MIT query functions first; expose a typed façade before adding caching. |
| Repository discovery/state: `src/repoManager.ts`, `src/repo-manager/*` | `src/extension/repoManager.ts`, `src/extension/watchForRepos.ts`, `src/backend/utils/repoSearch.ts` | `src/repoManager.ts`, `src/repo-manager/*` | Move MIT repository code into a single manager facade; preserve current behaviour only through acceptance tests. |
| Repository change monitoring: `src/repoFileWatcher.ts`, `src/gitStatusMonitor.ts` | `src/repoFileWatcher.ts`, `src/extension/watchForRepos.ts` | `src/repoFileWatcher.ts`, `src/gitStatusMonitor.ts` | Keep the MIT watcher first; add status monitoring as a new isolated service later. |
| Git actions: `src/commands.ts` | `src/backend/actions/{branch,commit,merge,tag}.ts` | `src/commands.ts`, `src/actions/*` | Wrap existing MIT actions in one command dispatcher; add missing actions one operation at a time. |
| Graph editor tab: `src/views/tab/*` | `src/extension/{webviewPanel,webviewHtml,webviewBridge,messageHandler}.ts` | `src/views/tab/*` | Keep the MIT bridge and panel lifecycle; split adapters by message category only after parity tests exist. |
| Browser graph UI: `web/*` | `src/webview/*` | `web/*` | Move the MIT browser modules without semantic change, then package them under the repository's web bundle contract. |
| Status bar: `src/statusBarItem.ts` | `src/statusBarItem.ts` | `src/statusBarItem.ts` | Rename only at first; preserve icon-only configuration and add branch/dirty status later. |
| Commit/file virtual documents: `src/diffDocProvider.ts` | `src/diffDocProvider.ts` | `src/diffDocProvider.ts` | Retain MIT provider; add richer file/revision flows independently. |
| Extension state: `src/extensionState.ts` | `src/extensionState.ts` | `src/extensionState.ts`, `src/compat/migrationState.ts` | Keep MIT storage; add a versioned migration reader instead of importing old stored objects. |
| Activity Bar sidebar: `src/views/sidebar/*`, `web/sidebar/*` | No equivalent | `src/views/sidebar/*`, `web/sidebar/*` | New independently authored feature after tab parity. |
| Inline blame: `src/inlineBlame.ts` | No equivalent | `src/inlineBlame.ts` | New independent service; no source transplant. |
| Code review state: current code-review integration | No equivalent | `src/codeReviewIntegration.ts` | New independent adapter to the local Code Review extension. |

### Refactor completion check

Before feature work begins, the staging extension must:

1. Compile with `npm run compile`.
2. Open the MIT graph and perform its original supported actions.
3. Have no imports from `extensions/an-dr-commits`.
4. Keep all added files traceable to MIT staging files or newly authored code.
5. Keep browser code in `web/` and extension-host code in `src/` with no
   cross-world imports.

## Compatibility inventory method

Do not reverse-engineer implementation details. Build a compact, independent
contract from observable behaviour.

| Inventory item | Source of fact | Resulting artefact |
| --- | --- | --- |
| Commands and menus | Current package manifest and Command Palette | `docs/roadmap/compatibility/commands.md` |
| Configuration keys and defaults | Current package manifest and Settings UI | `docs/roadmap/compatibility/settings.md` |
| View IDs and storage keys | Running extension behaviour and package manifest | `docs/roadmap/compatibility/state.md` |
| Git action behaviour | Disposable Git fixture repositories | Black-box integration tests written from scratch |
| Graph and details UI | Manual acceptance checklist and screenshots | Scenario checklist, not copied markup or styles |

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
3. Rehome the MIT webview into the repository's `web/` layout and make its
   build output explicit.
4. Add contract tests around graph loading, repository discovery, and the
   existing MIT actions before extending them.

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

Implement and test one operation family at a time:

1. Branch operations: create, checkout, rename, delete, merge, rebase, reset,
   fetch into local branch, pull, and push.
2. Tag operations: create lightweight/annotated tags, delete, push, and show
   annotation details.
3. Commit operations: checkout, cherry-pick, drop, revert, reset, compare, and
   copy identifiers.
4. Working-tree operations: stage, unstage, commit, amend, discard, clean,
   stash, apply, pop, drop, and branch-from-stash.
5. Remote operations: add/edit/delete/fetch/prune and pull-request launch.

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
3. Add Code Review integration through a narrow interface; persist only the
   data the new implementation owns.
4. Add SCM title/actions and terminal integration last, behind capability
   detection.

### 9. Cutover and cleanup

1. Run the complete command/settings/scenario matrix on Windows, Linux, and
   macOS.
2. Test settings/state migration from a copied VS Code profile directory.
3. Build and install the replacement under `an-dr-commits` in a disposable VS
   Code profile.
4. Create a rollback tag, replace the current extension folder, remove the
   temporary staging extension, and run `install.ps1`.
5. Re-run the matrix with the final identity and publish the migration notes.

## Mechanical-work checklist

For every transition task, use this sequence to keep reasoning small and
repeatable:

1. Choose one ledger row and one target module.
2. Copy only the closest MIT staging module, then rename/move it if necessary.
3. Add a small typed adapter or independently authored implementation.
4. Add a black-box test for the row's observable behaviour.
5. Run `npm run compile`, focused tests, and `git diff --check`.
6. Review the diff for forbidden path references and provenance drift.

Never use `an-dr-commits` as a copy/paste source. If a requirement cannot be
expressed as an adapter, a MIT module reuse, or a new small implementation,
stop and create a design decision before proceeding.

## Cutover gates

The final replacement may take the `an-dr-commits` identity only when all gates
are true:

- The feature ledger has no unclassified rows.
- Each retained public feature has a passing acceptance test.
- `LICENSE`, `NOTICE.md`, and dependency notices pass the provenance review.
- The final package has no source imports, copied assets, or copied test/code
  text from the current non-MIT implementation.
- A clean VS Code profile installs and opens the replacement successfully.
- A rollback tag and recovery instructions exist.
