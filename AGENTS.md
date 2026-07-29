# Agent Context

Notes for AI agents working on this repo that cannot be deduced from the code alone.

## Primary instructions

- Use `agents/AGENTS.md` as the base instruction
- Use `AGENTS.md` in the repo root and in the subfolders as scoped extensions of the base rules
- Priority (later entries extend or overwrite earlier ones):
  1. `REPO/agents/AGENTS.md` — base
  2. `REPO/AGENTS.md` — this file
  3. `REPO/**/AGENTS.md` — any subdirectory AGENTS.md, chained by depth

## User preferences

- Minimalistic status bar: the user prefers icon-only options; `statusBarIconOnly` should exist
  on every extension that has a status bar item.
- Keep extensions focused and small. No bundler, no test framework, plain `tsc`.

## Commit hygiene

Covered by the COMMIT phase in `agents/AGENTS.md` (WIP-squash before every commit).

## Architecture decisions

- Extensions are junctioned, not copied. `install.ps1` always recompiles on every run
  (the `out/` directory existing is not a skip condition — it used to be and that was a bug).
- No monorepo tooling. Each extension under `extensions/` is fully self-contained with its
  own `package.json`, `tsconfig.json`, `node_modules/`, and `out/`.
- `install.ps1` picks up new extensions automatically — just add a dir under `extensions/`.
  An extension opts out by containing a `.installignore` file; the installer then skips the
  build, removes any link a previous run created, and leaves it out of the
  application-scoped list. See `docs/adr/ADR-003-installignore-opt-out.md`.
- `install.ps1` never reports a failed build as a success: it checks `$LASTEXITCODE` after
  `npm install` / `npm run compile` (a non-zero native exit is *not* a PowerShell
  terminating error, so `$ErrorActionPreference = 'Stop'` does not catch it), verifies the
  `main` entry point exists afterwards, skips the build stamp on failure so the next run
  retries, and exits 1. See `docs/adr/ADR-002-install-fails-loudly-on-build-failure.md`.
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

`an-dr-commits` is the final MIT-derived extension. Its browser UI lives in
`src/webview/` and is bundled by `esbuild.js`; run `npm run compile` after a webview
change. Do not revive the retired `web/` concatenation pipeline.

The extension has no dependency on VS Code's built-in Git extension. Keep repository
discovery, selection, graph refresh, and status changes inside its own services.

## Adding a new extension

1. Create `extensions/<name>/` with `package.json`, `tsconfig.json`, `.vscodeignore`,
   `.gitignore`, and `src/extension.ts`.
2. Copy `tsconfig.json` and `.vscodeignore` from an existing extension — they are identical.
3. Run `.\install.ps1` — it handles `npm install`, `tsc`, and junctioning.
4. Update `README.md` and `AGENTS.md` (this file).

## an-dr-commits provenance

`an-dr-commits` is the final MIT-derived extension based only on
`asispts/neo-git-graph`. Keep its [NOTICE.md](extensions/an-dr-commits/NOTICE.md)
and `LICENSE` intact, and do not copy implementation from post-MIT
`mhutchie/vscode-git-graph`. Locally authored code may be relicensed and retained
once `extensions/an-dr-commits/scripts/check-provenance.js` clears it; baseline
expression may not. Its standalone webview build retains the upstream esbuild step
because it bundles browser modules.

It no longer carries `.installignore`; `install.ps1` builds and links it under the
final `an-dr-commits` identity. Build and test it directly with `npm run compile`
and `npm test` while iterating.
