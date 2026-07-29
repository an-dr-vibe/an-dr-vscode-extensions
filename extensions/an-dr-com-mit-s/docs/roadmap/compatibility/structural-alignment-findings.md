# Backlog 2 structural alignment — findings

The staging extension's seams (`src/backend/*`, `src/extension/*`,
`src/webview/*`, `src/config.ts`, `src/diffDocProvider.ts`,
`src/avatarManager.ts`, `src/statusBarItem.ts`) already existed before this
transition round started. This increment verified the _Refactor completion
check_ rather than redoing structural work that was already done.

## Verified against the checklist

| Check                                                                    | Result                                                    |
| ------------------------------------------------------------------------ | --------------------------------------------------------- |
| `npm run compile` (esbuild, both entry points)                           | Passes — `out/extension.js` and `out/web.min.js` produced |
| `npm run typecheck`                                                      | Passes                                                    |
| `npm test` (Vitest: backend, extension, webview)                         | 133/133 passing                                           |
| `npm run test:ext` (`vscode-test`)                                       | 28/28 passing, after two fixes below                      |
| `npm run lint`, `npm run format`                                         | Clean                                                     |
| No imports escaping `extensions/an-dr-com-mit-s`                         | Confirmed by grep                                         |
| No cross-world imports (`src/` importing `src/webview/`, or the reverse) | Confirmed by grep                                         |

## One documented discrepancy, not fixed here

The roadmap's _Initial structural alignment_ table names `web/*` as the
planned location for browser code. The actual, working location is
`src/webview/*`, and the root `AGENTS.md` already documents this as the settled
convention: _"Its browser UI lives in `src/webview/`... Do not revive the
retired `web/` concatenation pipeline."_ The roadmap table is stale on this
point; `src/webview/*` is correct and nothing should move to match the table.

## Two real bugs found and fixed

`npm run test:ext` had never been run before this transition round — Node
below the toolchain's minimum made the whole suite unable to start. Once it
could run, it surfaced two genuine defects, both in the tests, not the shipped
code:

1. **Stale assertion.** `tests-ext/extension.test.ts` checked for a tab
   labelled `"(neo) Git Graph"`; the actual panel title is
   `EXTENSION_NAME = "an-dr: Commits (MIT)"` (`src/extension/constant/const.ts`).
   This produced three 2-second timeouts that looked like the panel command was
   broken. It was not — the assertion was checking for a title that has never
   existed in this codebase.
2. **Windows teardown race.** `tests-ext/repoManager.test.ts` deleted freshly
   created Git repo fixture directories immediately after `checkReposExist`
   spawned `git` against them. On Windows, the OS does not always release a
   just-exited child process's file handle before an immediately following
   `rmSync`, producing an intermittent `EPERM`. Fixed with a small
   `removeRepoDirectory` retry helper, applied at every deletion site in the
   file; stable across two consecutive full runs afterward.

Neither defect was introduced by this transition round — both test files
predate it, and the Node upgrade in increment 1 is what first made them
runnable at all.
