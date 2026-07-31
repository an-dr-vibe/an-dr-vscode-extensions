# Complete transition plan

Where the MIT transition actually stands, and every remaining stage to
cutover. Written 2026-07-30 after increments 1–12; the state table and stage 3
were re-measured 2026-07-31 after the tab UI parity branch.
Supersedes nothing; it makes the remaining path in
[an-dr-commits-mit-transition.md](../an-dr-commits-mit-transition.md)
concrete and measured.

Every number below is measured from the provenance data or the two manifests.
Where a figure is an estimate, it says so.

## Where we are

Updated 2026-07-31, after the tab UI parity branch.

| Surface                   |  Target | Staging today | Gap                                                 |
| ------------------------- | ------: | ------------: | --------------------------------------------------- |
| Version                   | > 2.0.0 |         3.0.0 | none — no longer a downgrade                        |
| Commands declared         |       9 |             9 | 0                                                   |
| Commands implemented      |       9 |             9 | 0                                                   |
| Settings declared         | 34 kept |            40 | 0 kept keys missing; 6 declared beyond the kept set |
| Activity Bar views        |       1 |             0 | 1 — blocked, see stage 3                            |
| `contributes.keybindings` |       1 |        absent | 1                                                   |
| `YOURS` source re-fitted  |  ~2,480 |          ~640 | ~1,840 re-fittable; ~2,650 blocked behind baseline  |

The `YOURS` row no longer counts 5,134 as the target: ADR-002 established that
about 2,650 of those lines cannot run here without reimplementing the baseline
substrate they were written against.

Verification is real and green: typecheck, lint, format, `l10n:check` at
183/183 in both Chinese locales, 520 Vitest tests, 33 `vscode-test` tests, and
`check-provenance.js` at zero `BASELINE`.

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

## Stage 1 — Finish the command surface — DONE

All nine commands now do their job. Kept for the record of how they landed:

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

## Stage 2 — The `web/` ES-module conversion pattern — DONE

**Established.** See [web-conversion-pattern.md](web-conversion-pattern.md); three files have been converted with it, two by a delegate.

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

The procedure is written and has been followed by a delegate twice.

## Stage 3 — Re-fitting authored features (~4,500 lines remaining)

**Superseded grouping.** This stage previously listed the whole `YOURS` set as
one port ordered by dependency. That treated the tab glue as movable.
[ADR-002](../../adr/ADR-002-refit-features-onto-the-mit-tab.md) records why it is
not: `tableRender`, `constructorInit` and `loadProcessing` reference 123 view
members, 93 absent here, backed by ~2,644 lines of `BASELINE` substrate.

The real division is **how much of the old tab a feature needs**:

| Category                | Contents                                                                                  |  Lines | Status                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------- | -----: | --------------------------------------------------------------------------------------------------------------------- |
| Self-contained services | blame, status monitor, avatars, file icons, tag pills                                     |   ~640 | **done**                                                                                                              |
| Extension-host actions  | `src/views/tab/*Actions.ts` — working tree, misc, commit graph, diff/file content         |    325 | Re-fittable; needs a UI trigger, or it is dead on arrival                                                             |
| Cache                   | `repositoryGraphCache.ts`                                                                 |    114 | Key must be **redesigned** for `loadCommits(git, { branchName, maxCommits })`, which has no stash or ordering concept |
| Tab UI glue             | `tableRender`, `constructorInit`, `loadProcessing`, `controlsLayout`, `branchPanelRender` | ~1,230 | **Reimplemented**, not ported — toolbar, layout and commit table now match 2.0; see tab-ui-parity.md                  |
| Panels                  | `changesPanel`, `filesPanel`, `fullDiffPanel` + CSS                                       | ~1,052 | files and full-diff panels **done**; `changesPanel` is 0.0% baseline and ports directly                               |
| Sidebar                 | `src/views/sidebar/*`, `web/sidebar/*`                                                    | ~1,404 | **Blocked**; also needs `contributes.views`                                                                           |

The sidebar remains blocked. The tab glue and panels no longer are, and the
2026-07-31 branch is why: ADR-002 was right that those files cannot be _ported_,
and wrong to conclude the features were therefore out of reach. Reading 2.0 for
its behaviour and reimplementing against the MIT view delivered the toolbar,
the viewport layout, the commit table, selection and both panels without
touching the baseline substrate. Treat "blocked" in this table as "cannot be
copied", never as "cannot be built".

**Each action handler needs a caller.** The four `*Actions.ts` files are
message handlers with no view coupling, so they re-fit cleanly onto
`messageHandler.ts` — but only for messages the MIT webview actually sends. A
handler for a button that does not exist is dead code, and the reachability
check will say so.

## Stage 4 — Settings (18 missing)

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

## Installer gap found while enabling side-by-side install

`install.ps1` links each extension into a directory named
`<publisher>.<name>-<version>`, but never removes a link from a previous
version. When the premature cutover briefly published the MIT build as
`an-dr-commits@0.5.0`, it left `an-dr.an-dr-commits-0.5.0` behind; after the
revert restored 2.0.0 the two links coexisted, both pointing at the same
folder and both claiming the same extension ID. `extensions.json` still
referenced the stale one, so no entry described the version actually on disk.

Both were repaired by hand. Before cutover, the installer should remove links
whose version no longer matches the extension's manifest — otherwise the
identity switch will leave exactly this behind again, and a duplicate ID is
harder to notice than a missing one.

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
