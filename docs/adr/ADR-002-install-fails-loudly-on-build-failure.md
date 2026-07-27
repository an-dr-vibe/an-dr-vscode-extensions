# ADR-002: install.ps1 fails loudly on a failed extension build

## Problem

`an-dr-commits` stopped activating in VS Code. The proximate cause was a
regression in `src/views/sidebar/sidebarView.ts` (an auto-WIP commit reverted the
file to a pre-`df10652` version that still imports the since-deleted
`./gitUtils`), but the reason it reached a running VS Code *at all* was
`install.ps1`:

- `npm run compile` for `an-dr-commits` is `clean && compile-src && compile-web`.
  `clean` deletes `out/` and `media/` first. `tsc` reports the type errors but
  still **emits** JS, so `out/` is repopulated with a `sidebarView.js` containing
  `require("./gitUtils")` — a module that does not exist. Because `tsc` exits
  non-zero, the `&&` chain stops: `package-src.js` and the whole `compile-web`
  step never run, so `media/` (both webview bundles) is never produced.
- `install.ps1` invoked `& npm install` and `& npm run compile` without ever
  checking `$LASTEXITCODE`. A native command's non-zero exit is not a PowerShell
  terminating error, so `$ErrorActionPreference = 'Stop'` does not catch it.
- The script then wrote the `.build-commit` stamp as though the build had
  succeeded, created the junction, and printed `linked` in green.
- On the next run the stamp matched the current commit, so the extension was
  reported `(up to date)` and never rebuilt.

The net effect: a build that failed was indistinguishable from one that
succeeded, and the failure was cached as a success.

## Decision

`install.ps1` treats a non-zero exit from `npm install` or `npm run compile`, and
a missing `main` entry point after a build, as a build failure. On failure it:

1. Prints a red `BUILD FAILED` line naming the failing step and its exit code.
2. Does **not** write the `.build-commit` / `.install-commit` stamp, so the next
   run retries instead of reporting `(up to date)`.
3. Still creates the junction, and continues with the remaining extensions.
4. Prints a `FAILED n` count plus a per-extension failure list in the summary,
   and exits with code 1.

The entry-point check reads `main` from the extension's own `package.json` and
verifies the file exists on disk after the build.

## Rationale

- Checking `$LASTEXITCODE` is the only reliable way to detect native-command
  failure in PowerShell; wrapping in `try`/`catch` does not work here.
- Not stamping on failure is the part that actually breaks the loop. Without it
  a single bad build is remembered as good forever.
- Continuing rather than aborting keeps the remaining extensions linked. The
  script removes an existing junction *before* building, so aborting mid-loop
  would leave later extensions unlinked as collateral damage.
- Still linking a failed extension is deliberate: the junction points at live
  source, so once the build is fixed the extension works without re-linking, and
  VS Code's activation error is itself a visible signal. The authoritative signal
  is the installer's own red output and non-zero exit.
- The `main` check catches the class of failure where a build tool exits 0 but
  produces nothing — which an exit-code check alone would miss. Reading `main`
  from `package.json` keeps it generic across every extension, with no per-
  extension configuration.
- Exit code 1 lets `an-dr-sync`'s rebuild commands, and any future CI, detect the
  failure without parsing output.

## Rejected alternatives

- **Abort the whole run on first failure.** Loudest signal, but extensions later
  in the loop are never processed, and any whose junction was already removed in
  a prior run stay missing.
- **Skip linking the failed extension.** Makes the extension vanish from VS Code
  rather than fail at activation. Rejected because it hides a *partially* working
  extension entirely and adds an un-link/re-link asymmetry to the loop for no
  diagnostic gain.
- **Set `noEmitOnError: true` in each extension's `tsconfig.json`.** This would
  stop `tsc` producing the half-built `out/` in the first place, and is a
  worthwhile change on its own, but it is a per-extension edit that does nothing
  for non-`tsc` build steps or for the stamp-caching bug. It is orthogonal to,
  not a substitute for, this decision.
- **Parse npm's output for the string `error`.** Fragile, locale-dependent, and
  produces false positives on any log line containing the word.
