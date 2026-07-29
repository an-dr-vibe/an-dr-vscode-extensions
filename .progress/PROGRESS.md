# Progress

**Flow:** Detailed Auto
**Phase:** BUILD
**Goal:** Create an an-dr commit-graph extension distributable under MIT terms.
**Done when:** A new an-dr-com-mit-s extension exists, has an MIT license and attribution, compiles successfully, and can be installed by install.ps1.
**Constraints:** Use only the MIT-licensed neo-git-graph codebase and its dependencies; preserve required notices; retain cross-platform VS Code support; do not reuse restricted-source code; keep the extension self-contained.
**Out of scope:** Marketplace publication, copying restricted Git Graph revisions, and changes to the existing an-dr-commits extension.

## Iterations

- [x] **MIT source foundation** (completed) — Import the current neo-git-graph MIT source, preserve the license and provenance, and establish the an-dr-com-mit-s extension identity.
- [x] **Repository build integration** (completed) — Adapt the imported extension to the repository-local npm and TypeScript build contract while retaining graph functionality.
- [x] **Distribution verification** (completed) — Document the extension, verify its license boundary and build, and validate installation discovery.
- [x] **MIT feature-parity migration** (completed) — Map the public an-dr-commits feature set and reimplement the missing functionality on an-dr-com-mit-s using only the MIT-derived foundation and independent code.
- [ ] **Compatibility contract** (in progress) — Document the public command, configuration, view, and persisted-state compatibility contract for replacing an-dr-commits with the MIT foundation.
- [ ] **MIT core replacement** (planned) — Create an an-dr-commits identity on the MIT foundation and replace basic graph, repository discovery, status-bar, and command surfaces without restricted implementation reuse.
- [ ] **Git workflow parity** (planned) — Independently implement branch, tag, stash, working-tree, remote, and commit workflow actions required by the public Commits behavior.
- [ ] **Graph and details parity** (planned) — Independently implement filtering, search, comparison, commit details, file navigation, diff modes, and display configuration on the MIT foundation.
- [ ] **Workspace tooling parity** (planned) — Independently implement Activity Bar changes, code-review state, inline blame, repository lifecycle, and public integrations.
- [ ] **Migration verification** (planned) — Migrate documented user-facing settings and commands, verify behavior across platforms, and install the replacement under the an-dr-commits identity.

_Last updated: 2026-07-29T04:54:20.7553927Z_