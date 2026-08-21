# Agent Context

Notes for AI agents working on this repo that cannot be deduced from the code alone.

## Primary instructions

The agent policy is **not** vendored here — there is no `agents/` submodule. Clone
<https://github.com/an-dr/agents> once and install that clone globally with its
`agents-install` skill; every repository on the machine, including this one, then reads
the same policy and skills from it.

```powershell
git clone https://github.com/an-dr/agents.git
pwsh agents/skills/agents-install/scripts/install-agents.ps1
```

Re-run `install-agents.ps1` after pulling the clone or moving it, and
`verify-agents.ps1` to check an existing install. Without it an agent has only this file,
which is not enough to run the workflow.

- Use the globally installed `agents/AGENTS.md` as the base instruction
- Use `AGENTS.md` in the repo root and in the subfolders as scoped extensions of the base rules
- Priority (later entries extend or overwrite earlier ones):
  1. the installed `agents/AGENTS.md` — base
  2. `REPO/AGENTS.md` — this file
  3. `REPO/**/AGENTS.md` — any subdirectory AGENTS.md, chained by depth

## User preferences

- Minimalistic status bar: the user prefers icon-only options; `statusBarIconOnly` should exist
  on every extension that has a status bar item.
- Keep extensions focused and small. No bundler, no test framework, plain `tsc`.

## Commit hygiene

Covered by the COMMIT phase in the installed `agents/AGENTS.md` (WIP-squash before every commit).

## Architecture decisions

- Extensions are junctioned, not copied. `install.ps1` always recompiles on every run
  (the `out/` directory existing is not a skip condition — it used to be and that was a bug).
- No monorepo tooling **at the repository root**. Each extension under `extensions/` is
  fully self-contained with its own `package.json`, `tsconfig.json`, `node_modules/`, and
  `out/`. An extension may declare its own nested workspace to split a host-independent
  core out of its source, which keeps that extension one installable unit and leaves
  `install.ps1` unchanged — see an-dr-com-mit-s' ADR-003.
- `install.ps1` picks up new extensions automatically — just add a dir under `extensions/`.
  An extension opts out by containing a `.installignore` file; the installer then skips the
  build, removes any link a previous run created, and leaves it out of the
  application-scoped list. See `docs/adr/ADR-003-installignore-opt-out.md`.
- `install.ps1` never reports a failed build as a success: it checks `$LASTEXITCODE` after
  `npm install` / `npm run compile` (a non-zero native exit is *not* a PowerShell
  terminating error, so `$ErrorActionPreference = 'Stop'` does not catch it), verifies the
  `main` entry point exists afterwards, skips the build stamp on failure so the next run
  retries, and exits 1. See `docs/adr/ADR-002-install-fails-loudly-on-build-failure.md`.
- `install.ps1` reconciles `~/.vscode/extensions/extensions.json` on every run: an
  `an-dr.*` entry the run did not link is removed when its location is absent or is a
  managed link, and an `an-dr.*` managed link the run did not create is removed with it.
  Renames, deletions, and `.installignore` opt-outs therefore clean up after themselves
  instead of leaving an entry VS Code reports as a broken extension. Marketplace
  extensions, `an-dr` entries backed by a real directory, and entries whose location
  cannot be resolved are never touched. See
  `docs/adr/ADR-004-install-prunes-orphaned-extensions.md`.
- `install.ps1` marks every linked `an-dr.*` extension as application-scoped
  (`metadata.isApplicationScoped = true` in `~/.vscode/extensions/extensions.json`) so they
  stay installed across every VS Code Profile, not just the one that first discovered them.
  See `docs/adr/ADR-001-install-application-scoped-extensions.md`.

## ADR organization

- `docs/adr/` at the repo root holds only decisions that cut across more than one
  extension (shared tooling like `install.ps1`, cross-cutting conventions). Its numbering
  is its own sequence, independent of any extension's.
- Every extension keeps its own decision history in `extensions/<name>/docs/adr/`,
  numbered `ADR-001`, `ADR-002`, ... starting fresh for that extension. Titles and
  filenames inside an extension's own `docs/adr/` don't repeat the extension's name — the
  folder already provides that context.
- A cross-reference to another extension's ADR (or to the root's) must name the scope
  explicitly, e.g. "an-dr-extensions' ADR-004" or "root ADR-001", since the number alone
  is only unique within one folder.

## Platform

- Used on Windows, Linux, and macOS — all must be supported.
- `install.ps1` runs via `pwsh` (PowerShell Core) on all platforms:
  - Windows: NTFS junctions (`New-Item -ItemType Junction`) — no admin needed.
  - Linux/macOS: symlinks (`New-Item -ItemType SymbolicLink`) — no admin needed.
- Extension TypeScript code must handle paths for all three platforms (e.g. tool
  install paths in `an-dr-git-tool` cover Win/Linux/Mac variants).

## Building web code in an-dr-commits

`an-dr-commits` has a two-step web build: TypeScript compiles to individual JS files in
`media/`, then `package-web.js` concatenates and uglifies them into **two** bundles
(deleting the individual files afterwards):

- `media/out.min.js` / `out.min.css` — the tab webview (`web/main.ts` + `web/*`), loaded by
  `TabView` (`src/views/tab/`).
- `media/sidebar.min.js` / `sidebar.min.css` — the sidebar webview (`web/sidebar/main.ts` +
  `web/sidebar/*`), loaded by `SidebarView` (`src/views/sidebar/`).

Both bundles include everything under `web/common/` (shared browser-side helpers with no
`import`/`export` — see `extensions/an-dr-commits/docs/adr/ADR-003-shared-browser-module-and-sidebar-webview-bundle.md`),
so a file placed there must compile standalone in both bundles' concatenated global scope.
Each webview loads **only** its own bundle.

- **Always use `npm run compile-web`** (or the full `npm run compile`) after editing
  anything under `web/`. Running bare `tsc -p web/tsconfig.json` produces individual JS
  files that neither webview loads — changes will appear to have no effect.
- For a readable bundle during debugging, use `npm run compile-web-debug`.
- `install.ps1` runs `npm run compile` and is already correct; this applies to manual
  dev iteration only.

`src/views/tab/`'s message-handling switch (`TabView.respondToMessage`) delegates to seven
`views/tab/*Actions.ts` modules grouped by message category (repo lifecycle, branch/remote,
tag/stash, commit-graph, diff/file-content, working-tree, misc) rather than inlining ~70
case bodies in one class — see `extensions/an-dr-commits/docs/adr/ADR-004-views-reorganization-and-tabview-split.md`.

## Shared view data in an-dr-commits

The sidebar and the tab read through one `DataSource` (created in `core.ts`), so its caches are
shared by construction — but sharing only pays off because of three things that are easy to
break. See `src/views/README.md` for the fuller picture, and ADR-025 / ADR-026.

- **`invalidateGraph` does not discard anything.** It marks a repository *unverified*; the next
  read recomputes a fingerprint and either restores the cache or advances the generation for
  real. If you add anything a cached projection depends on, it must be in either the projection
  key or that fingerprint — the fingerprint already covers the working-tree change count because
  projections embed an "Uncommitted Changes (N)" row. A known pre-existing gap: config values
  like `showCommitsOnlyReferencedByTags`, mailmap and date type are in neither, so changing them
  can serve a stale projection.
- **`getHeadInfo` no longer spawns Git.** It derives from the same canonical unfiltered snapshot
  `getRepoInfo` and revalidation use. Don't reintroduce direct `symbolic-ref`/`rev-parse` reads
  for head state.
- **Warming replays recorded parameters, it does not recompute them.** The tab's branch selection
  is decided webview-side (`getInitialBranchesOnRepoLoad`), so `RepoWarmer` replays what the
  webview actually asked for. Resist adding a backend copy of that logic — two copies diverge.

## Adding a new extension

1. Create `extensions/<name>/` with `package.json`, `tsconfig.json`, `.vscodeignore`,
   `.gitignore`, and `src/extension.ts`.
2. Copy `tsconfig.json` and `.vscodeignore` from an existing extension — they are identical.
3. Run `.\install.ps1` — it handles `npm install`, `tsc`, and junctioning.
4. Update `README.md` and `AGENTS.md` (this file).

## an-dr-com-mit-s provenance

`an-dr-com-mit-s` is a separately distributed MIT fork based only on
`asispts/neo-git-graph`. Keep its [NOTICE.md](extensions/an-dr-com-mit-s/NOTICE.md)
and `LICENSE` intact, and do not copy implementation from post-MIT
`mhutchie/vscode-git-graph`. Locally authored `an-dr-commits` code may be
relicensed and copied over once `extensions/an-dr-com-mit-s/scripts/check-provenance.js`
clears it; baseline expression may not. Its standalone webview build retains the
upstream esbuild step because it bundles browser modules.

It carries a `.installignore`, so `install.ps1` skips it: build and test it
directly with `npm run compile` and `npm test` in its own directory. Remove that
file at cutover, when it takes over the `an-dr-commits` identity.
