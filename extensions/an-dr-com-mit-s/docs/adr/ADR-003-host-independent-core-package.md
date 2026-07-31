# ADR-003: A host-independent core in a nested workspace package

## Problem

The tab's Git access, view model and webview are wanted in a second host — a
standalone Git client — but they lived beside the VS Code integration in one
`src/` tree. Nothing prevented a `vscode` import from reaching the parts that
must run without VS Code, and nothing expressed which code was portable.

Measured before the change: `src/webview/` imported `vscode` in 0 of 30 files
and `src/backend/` in 1 of 23, so the separation already existed in practice.
It was neither enforced nor packaged.

## Decision

- `packages/core/` holds `backend`, `data-source` and `types`, published under
  the name `@an-dr/commits-core` and consumed by that name, so the boundary is
  a module-resolution fact rather than a naming convention.
- The workspace is declared **inside** `extensions/an-dr-com-mit-s`, not at the
  repository root. The root `AGENTS.md` requires each extension to be
  self-contained with its own `package.json`, `node_modules/` and `out/`, and
  `install.ps1` runs `npm install` per extension directory. A nested workspace
  satisfies both: the extension is still one installable unit.
- An oxlint override bans importing `vscode` anywhere under `packages/core/`.
- The two path helpers that take a `vscode.Uri` moved to
  `src/extension/utils/hostPaths.ts`. The core deals in plain path strings.

## Rationale

A lint rule alone would leave the core reachable by relative path from the
extension, which is how such boundaries erode. A package name makes the
dependency direction explicit and one-way. Keeping the workspace nested avoids
contradicting the no-monorepo-tooling decision and leaves `install.ps1`
untouched, which was the practical constraint that ruled out a root workspace.

Enforcement is deliberately two-layered because each layer catches what the
other cannot: the package name stops the extension reaching into core
internals, and the lint rule stops the core reaching out to VS Code.

## Consequences

- Importing `vscode` inside the core fails lint, verified with a probe import.
- The core can be published or consumed as a submodule by the standalone client
  without moving code again.
- `no-await-in-loop` began reporting two pre-existing intentional sequential
  awaits once the files sat under a nested package root. Both are annotated
  with their reason rather than parallelised, since a file move is the wrong
  place to change behaviour.

## Rejected alternatives

- **A root-level npm workspace.** Contradicts the root `AGENTS.md` rule and
  would require reworking `install.ps1`'s per-extension install.
- **A folder boundary with only a lint rule.** No build-time enforcement; the
  extension could still import core internals by relative path.
- **A git submodule now.** Strongest separation, but cross-repo changes need
  two commits and a pointer bump for every edit, which is the wrong cost while
  the interface is still moving. It remains available later.
