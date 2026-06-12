# Agent Context

Notes for AI agents working on this repo that cannot be deduced from the code alone.

## Primary instructions

- Use `AGENTS.md` as the source of truth for agent instructions in this repo.
- When working on anything inside `extensions/an-dr-commits/`, read
  [extensions/an-dr-commits/AGENTS.md](extensions/an-dr-commits/AGENTS.md)
  before touching any files. It contains the architecture overview, file map,
  build instructions, and a "where to look by feature" table.

## User preferences

- Minimalistic status bar: the user prefers icon-only options; `statusBarIconOnly` should exist
  on every extension that has a status bar item.
- Keep extensions focused and small. No bundler, no test framework, plain `tsc`.

## Commit hygiene

Before committing, always run `git log --oneline -6` and check the previous commit(s).
If the most recent commit(s) are WIP commits that touch the same extension or the same
concern as the current work, squash them together into a single descriptive commit
(`git reset --soft <hash-before-wips>` then one clean commit). The goal is no WIP
commits left between proper commits; WIPs are only acceptable as the very tip of the
branch while work is in progress.

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

## Shared agents

Reusable agent prompts live in [`agents/`](agents/). Any extension can invoke them.

| Agent          | File                                              | Purpose                                                                 |
| -------------- | ------------------------------------------------- | ----------------------------------------------------------------------- |
| adversarial-ut | [agents/adversarial-ut.md](agents/adversarial-ut.md) | Bug-finding UT run — three-pass adversarial suite, outputs TECHDEBT.md |

---

## Adding a new extension

1. Create `extensions/<name>/` with `package.json`, `tsconfig.json`, `.vscodeignore`,
   `.gitignore`, and `src/extension.ts`.
2. Copy `tsconfig.json` and `.vscodeignore` from an existing extension — they are identical.
3. Run `.\install.ps1` — it handles `npm install`, `tsc`, and junctioning.
4. Update `README.md` and `AGENTS.md` (this file).
