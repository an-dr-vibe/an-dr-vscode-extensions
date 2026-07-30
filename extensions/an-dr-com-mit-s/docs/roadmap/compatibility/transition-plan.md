# Complete transition plan

Where the MIT transition actually stands, and every remaining stage to
cutover. Written 2026-07-30, after increments 1–12 plus the `tests-ext` repair.
Supersedes nothing; it makes the remaining path in
[an-dr-commits-mit-transition.md](../an-dr-commits-mit-transition.md)
concrete and measured.

Every number below is measured from the provenance data or the two manifests.
Where a figure is an estimate, it says so.

## Where we are

| Surface                   |  Target | Staging today |                                                                                       Gap |
| ------------------------- | ------: | ------------: | ----------------------------------------------------------------------------------------: |
| Commands declared         |       9 |             9 |                                                                                         0 |
| Commands implemented      |       9 |             5 | **4** (`fetch`, `pull`, `push` unimplemented; `view`/`clearAvatarCache` wired separately) |
| Settings declared         | 34 kept |            14 |                   **33** (13 of staging's 14 are MIT-native, disjoint from the kept list) |
| Activity Bar views        |       1 |             0 |                                                                                         1 |
| `contributes.keybindings` |       1 |        absent |                                                                                         1 |
| `YOURS` source ported     |   5,134 |           156 |                                                                                 **4,978** |

Verification is real and green: typecheck, lint, format, `l10n:check`,
180 Vitest tests, 28 `vscode-test` tests, and `check-provenance.js` at zero
`BASELINE`.

### What is already genuinely done

- Commands registered on **both** activation paths, including the empty-workspace
  path — the defect that made the previous cutover's palette half-broken.
- Unimplemented commands raise an explicit localized error, never a silent no-op.
- Workspace state is versioned (`v2.*`). Writes never touch a legacy key, and
  after cutover the legacy key is not even read
  (`shouldReadStagingLegacyState`). The rollback promise in `docs/cutover.md` is
  literally true.
- `utils.ts`, `dataSource.ts`, `gitStatusMonitor.ts`, `fileIcons` ported and
  reachable from `activate()`.

## Stage 1 — Finish the command surface (increments 13, 15, 16)

The declared contract is complete but four commands still error out. This is
the smallest remaining piece and unblocks scenario rows 6 and 7.

| Increment | Work                                                 |      Estimate |
| --------- | ---------------------------------------------------- | ------------: |
| 13        | Askpass lifecycle + `GIT_ASKPASS` environment wiring | ~200 authored |
| 15        | `fetch` against the askpass environment              | ~120 authored |
| 16        | `pull` and `push`                                    | ~180 authored |

`src/askpass/*` in the old tree is **91–100% baseline** — it must be authored
fresh, not ported. This is the single largest authored-from-scratch item in the
whole transition and is not delegatable.

**Exit:** all 9 commands do their job; `pull`/`push` prompt for credentials
rather than hanging (scenario 7, the defect that made the old cutover's remote
commands unusable).

## Stage 2 — The `web/` ES-module conversion pattern (not yet started)

**This is the gate on everything in Stage 3, and it has no worked example yet.**

22 of 23 portable `web/` files contain **zero `import` statements** —
`web/changesPanel.ts` is 615 lines with none. They relied on the retired
concatenate-into-global-scope pipeline; staging uses real ES modules bundled by
esbuild. Porting one means recovering its implicit dependencies: find every
identifier it uses but does not define, locate the origin, add an explicit
import.

The failure mode is silent: a missed global becomes a runtime `undefined` that
typechecks cleanly and passes any test that does not exercise that path. So
**every converted `web/` file must be exercised in the running extension**, not
only under Vitest.

| Step | Work                                                         | Estimate |
| ---- | ------------------------------------------------------------ | -------: |
| 2a   | Convert one small `web/` file end-to-end; record the pattern |     ~150 |
| 2b   | Convert two more, confirming the pattern generalises         |     ~300 |

**Exit:** a written, followed-twice procedure for global→module conversion.
Until this exists, the ~3,100 lines of `web/` code cannot be delegated, and
that is the bulk of the remaining port.

## Stage 3 — The feature port (4,978 lines, none started)

Measured group sizes. Ordering is by dependency, not by size: each group needs
its imports to exist in staging first, and blocked `src/` files need the
`DataSource`-equivalent surface they call.

| Group | Contents                                                                              |         Lines | Depends on                                 |
| ----- | ------------------------------------------------------------------------------------- | ------------: | ------------------------------------------ |
| D     | `inlineBlame.ts`, `repositoryGraphCache.ts` (`gitStatusMonitor.ts` done)              | 311 remaining | `DataSource` blame + status surface        |
| E     | 4 `src/views/tab/*Actions.ts`                                                         |           325 | `DataSource`, message protocol             |
| C     | `loadProcessing`, `tableRender`, `controlsLayout`, `avatarVisuals`, `constructorInit` |         1,028 | Stage 2 pattern                            |
| B     | `changesPanel`, `filesPanel`, `fullDiffPanel` + CSS                                   |         1,052 | Stage 2 pattern, group C                   |
| A     | Activity Bar sidebar — 11 files                                                       |         1,404 | All of the above, plus `contributes.views` |

`repositoryGraphCache.ts` needs its cache **key redesigned**, not moved: it keys
on the old request shape (multi-branch arrays, `stashKeys`, `hideRemotes`,
string-enum `commitOrdering`), and the new `loadCommits(git, { branchName,
maxCommits, ... })` has no stash or ordering concept. That is design work.

Group A is last for a real reason: the sidebar's `sidebarView.ts` imports
`DataSource`, `RepoManager`, `ExtensionState`, `utils.viewDiff`, and `Event` —
six of its sixteen imports land in modules that must exist first.

## Stage 4 — Settings (33 missing)

Blocked on the features that own them; a setting for a view that does not exist
is the exact defect the previous cutover shipped. Schedule each with its
feature, never ahead of it.

| Block                                                                                                                 | Count | Lands with                                          |
| --------------------------------------------------------------------------------------------------------------------- | ----: | --------------------------------------------------- |
| `blame.*` + `inlineBlame.enabled`                                                                                     |    11 | Stage 3 group D                                     |
| `branchPanel.*`                                                                                                       |     3 | Stage 3 group A                                     |
| `scmButtons.*`                                                                                                        |     3 | Stage 3 group A / SCM integration                   |
| `repository.commits.avatar.*` + `columnVisibility` + `committedVisual`                                                |     5 | Stage 3 group C                                     |
| `repository.onLoad.*`                                                                                                 |     2 | Repository lifecycle (done) — can land now          |
| `graph.showTagsInActivityBar`                                                                                         |     1 | Stage 3 group A                                     |
| `commitDetailsView.defaultDiffMode`                                                                                   |     1 | Stage 3 group B                                     |
| `uiDensity`, `logLevel`, `defaultCommitMessage`, `dialog.repoInProgress.confirmAbort`, `statusBarItem.dirtyIndicator` |     5 | Independent — can land any time                     |
| `keyboardShortcut.refresh`                                                                                            |     1 | Needs `contributes.keybindings`                     |
| `repository.commits.fetchAvatars`                                                                                     |     1 | Key-path adapter onto staging's flat `fetchAvatars` |

## Stage 5 — Tests

The largest single line item, and still almost entirely unwritten.
**14,076 lines** of the old suite are `BASELINE` and cannot move —
`dataSource.test.ts` alone is 4,264. Every behaviour needs a black-box test
authored fresh. Estimate only; it is not derived from anything.

Delegatable **once a fixture pattern exists**, which the existing
`tests/backend/*` suites largely provide.

## Stage 6 — Cutover

Only after every gate in the roadmap's _Cutover gates_ holds. Ordered:

1. Prune upstream scaffolding (`.github/`, `flake.nix`, `pnpm-*`).
2. Run the command/settings/scenario matrix on Windows, Linux, macOS.
3. Verify state migration and the `vscode:uninstall` hook in a copied profile —
   and confirm the hook actually runs, since it is skipped for
   junction-installed extensions, which is how `install.ps1` installs everything
   here.
4. Install under a disposable VS Code profile.
5. Rollback tag, swap the folder, delete `.installignore`, run `install.ps1`.
6. Re-run the matrix under the final identity.

Two manifest items must be fixed before cutover, both defects the previous
attempt shipped: the version must not regress (the old cutover went 2.0.0 →
0.5.0), and the CHANGELOG must document every removed feature.

## Delegation

| Work                                              | Executor                                    |
| ------------------------------------------------- | ------------------------------------------- |
| Askpass, `DataSource` surface, cache key redesign | **Not delegatable** — design                |
| Stage 2 pattern establishment                     | **Not delegatable** — defines the procedure |
| `web/` conversions after the pattern exists       | Delegatable, ~3,100 lines                   |
| Test authoring after a fixture pattern exists     | Delegatable, the largest pool               |
| Every VERIFY pass and the reachability check      | **Never delegated**                         |

A delegated port changes no API decisions. If it needs a new symbol-mapping row,
it comes back.

## Standing rules, learned the hard way

1. **Run `npm run test:ext`, not just `npm test`.** Vitest stayed green while
   all 25 integration tests failed for six increments. The two suites cover
   different paths.
2. **No `as unknown as` on a test double.** That cast hid the interface drift
   that caused the above. Use `Pick<>` so the compiler catches it.
3. **Reachability, every increment.** For each new exported symbol, if its only
   references are its own file and its own test, it is dead — wire it or delete
   it.
4. **Exercise `web/` ports in the running extension.** A missed global is a
   runtime `undefined` that every static check passes.
5. **A declared setting or command with no implementation behind it is a
   user-visible lie.** Both cutover gates check this.
