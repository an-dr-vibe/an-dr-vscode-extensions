# Agent Context

Notes for AI agents working on this repo that cannot be deduced from the code alone.

## User preferences

- **SmartGit** is the most important git tool — it should always be first in the `tool` enum
  and the default value.
- Minimalistic status bar: the user prefers icon-only options; `statusBarIconOnly` should exist
  on every extension that has a status bar item.
- Keep extensions focused and small. No bundler, no test framework, plain `tsc`.

## Architecture decisions

- Extensions are junctioned, not copied. `install.ps1` always recompiles on every run
  (the `out/` directory existing is not a skip condition — it used to be and that was a bug).
- No monorepo tooling. Each extension under `extensions/` is fully self-contained with its
  own `package.json`, `tsconfig.json`, `node_modules/`, and `out/`.
- `install.ps1` picks up new extensions automatically — just add a dir under `extensions/`.

## Platform

- Used on Windows, Linux, and macOS — all must be supported.
- `install.ps1` runs via `pwsh` (PowerShell Core) on all platforms:
  - Windows: NTFS junctions (`New-Item -ItemType Junction`) — no admin needed.
  - Linux/macOS: symlinks (`New-Item -ItemType SymbolicLink`) — no admin needed.
- Extension TypeScript code must handle paths for all three platforms (e.g. tool
  install paths in `an-dr-git-tool` cover Win/Linux/Mac variants).

## Extensions

- **an-dr-ui-control** — Manages Activity Bar layout (visibility + order). Scans all installed
  extensions for `viewsContainers.activitybar` contributions and maintains an ordered
  `uiControl.activityBar` array in `settings.json`. New containers are appended as visible; hidden
  entries are preserved across machines via Settings Sync. Has a webview UI (drag-to-reorder,
  visibility toggles) and applies on startup (hide-only to avoid sidebar focus side-effects).

## Adding a new extension

1. Create `extensions/<name>/` with `package.json`, `tsconfig.json`, `.vscodeignore`,
   `.gitignore`, and `src/extension.ts`.
2. Copy `tsconfig.json` and `.vscodeignore` from an existing extension — they are identical.
3. Run `.\install.ps1` — it handles `npm install`, `tsc`, and junctioning.
4. Update `README.md` and `AGENTS.md` (this file).
