# Changelog

## [Unreleased]

## [3.0.0] - 2026-07-30

The MIT-licensed rebuild of **an-dr: Commits**, derived solely from
[neo-git-graph](https://github.com/asispts/neo-git-graph). It carries the
version forward past the 2.x series it replaces, so upgrading is never a
downgrade.

While the transition is in progress this ships under the temporary
`an-dr-com-mit-s` identity and installs **alongside** an-dr-commits 2.x, with
its own commands, settings, and stored state. Nothing is shared, and removing
it leaves the 2.x extension untouched.

### Added

- The full nine-command public surface: view, add/remove repository, fetch,
  pull, push, version, open file, and clear avatar cache
- Git credential prompts, so authenticated fetch, pull, and push ask for
  credentials instead of hanging without a terminal
- Inline blame for the active line, with message format, hover detail, author
  alias, whitespace and move/copy detection, delay, and file-size limit
- Author avatars with procedural patterns and coloured initials, in
  configurable shape and size
- File-type icons in the commit file tree
- A shared repository status feeding the status bar

### Changed

- Workspace state is stored under versioned keys and never writes the keys
  2.x uses, so rolling back to 2.x keeps its stored state intact

### Not yet ported

Present in 2.x, absent here: the Activity Bar sidebar, the changes and files
panels, full-diff view modes, and 29 of the 34 retained settings. Track
progress in `docs/roadmap/compatibility/transition-plan.md`.

## [0.5.0] - 2026-07-24

### Added

- Git Graph button in the Source Control view title
- Centralized logging with a dedicated "Git Graph" output channel

### Changed

- Optimize extension initialization logic
- Replace the "Locate HEAD" button with a highlighted HEAD commit row in the graph
- Status bar: add icons for the active and watching states
- Simplify localization to use English-string keys extracted with @vscode/l10n-dev

### Fixed

- Native browser context menu appearing over the graph in browser-based VS Code (vscode.dev / Codespaces)
- Header layout quirks around the refresh button

## [0.4.0] - 2026-04-10

### Added

- Full internationalization (i18n) support with multiple languages
- Language support: English (default), Simplified Chinese (简体中文), Traditional Chinese (繁體中文)

### Fixed

- Escape HTML in git output before rendering

## [0.3.0] - 2026-03-26

### Added

- Introduce gitClient based on simple-git
- Added a button to locate HEAD in the graph

### Changed

- Extract webview bridge
- Extract webview lifecycle

## [0.2.0] - 2026-03-17

### Added

- Add initial test suite and CI configuration

### Fixed

- Remove information message

## [0.1.1] - 2026-02-23

### Changed

- Migrate build system to esbuild and upgrade dependencies
- Add oxlint linter and oxfmt formatter

## [0.1.0] - 2026-02-18

Initial release

[Unreleased]: https://github.com/asispts/neo-git-graph/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/asispts/neo-git-graph/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/asispts/neo-git-graph/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/asispts/neo-git-graph/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/asispts/neo-git-graph/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/asispts/neo-git-graph/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/asispts/neo-git-graph/releases/tag/v0.1.0
