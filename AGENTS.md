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
- `install.ps1` marks every linked `an-dr.*` extension as application-scoped
  (`metadata.isApplicationScoped = true` in `~/.vscode/extensions/extensions.json`) so they
  stay installed across every VS Code Profile, not just the one that first discovered them.
  See `docs/adr/ADR-007-install-application-scoped-extensions.md`.

## Platform

- Used on Windows, Linux, and macOS — all must be supported.
- `install.ps1` runs via `pwsh` (PowerShell Core) on all platforms:
  - Windows: NTFS junctions (`New-Item -ItemType Junction`) — no admin needed.
  - Linux/macOS: symlinks (`New-Item -ItemType SymbolicLink`) — no admin needed.
- Extension TypeScript code must handle paths for all three platforms (e.g. tool
  install paths in `an-dr-git-tool` cover Win/Linux/Mac variants).

## Building web code in an-dr-commits

`an-dr-commits` has a two-step web build: TypeScript compiles to individual JS files in
`media/`, then `package-web.js` concatenates and uglifies them into `media/out.min.js`
(deleting the individual files). The webview loads **only** `out.min.js`.

- **Always use `npm run compile-web`** (or the full `npm run compile`) after editing
  anything under `web/`. Running bare `tsc -p web/tsconfig.json` produces individual JS
  files that the webview never loads — changes will appear to have no effect.
- For a readable bundle during debugging, use `npm run compile-web-debug`.
- `install.ps1` runs `npm run compile` and is already correct; this applies to manual
  dev iteration only.

## Adding a new extension

1. Create `extensions/<name>/` with `package.json`, `tsconfig.json`, `.vscodeignore`,
   `.gitignore`, and `src/extension.ts`.
2. Copy `tsconfig.json` and `.vscodeignore` from an existing extension — they are identical.
3. Run `.\install.ps1` — it handles `npm install`, `tsc`, and junctioning.
4. Update `README.md` and `AGENTS.md` (this file).
