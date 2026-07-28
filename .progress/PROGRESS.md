# Progress

**Flow:** Detailed Auto
**Phase:** COMMIT
**Goal:** Create an an-dr commit-graph extension distributable under MIT terms.
**Done when:** A new an-dr-com-mit-s extension exists, has an MIT license and attribution, compiles successfully, and can be installed by install.ps1.
**Constraints:** Use only the MIT-licensed neo-git-graph codebase and its dependencies; preserve required notices; retain cross-platform VS Code support; do not reuse restricted-source code; keep the extension self-contained.
**Out of scope:** Marketplace publication, copying restricted Git Graph revisions, and changes to the existing an-dr-commits extension.

## Iterations

- [ ] **MIT source foundation** (verified) — Import the current neo-git-graph MIT source, preserve the license and provenance, and establish the an-dr-com-mit-s extension identity.
- [ ] **Repository build integration** (planned) — Adapt the imported extension to the repository-local npm and TypeScript build contract while retaining graph functionality.
- [ ] **Distribution verification** (planned) — Document the extension, verify its license boundary and build, and validate installation discovery.

_Last updated: 2026-07-28T21:58:59.5049756Z_