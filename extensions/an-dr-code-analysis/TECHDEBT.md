# Technical Debt — Known Bugs

All bugs below were found via adversarial and scenario-based unit tests.
Tests pass by asserting the buggy behaviour, so they serve as regression
anchors once fixes land.

---

## GraphBuilder

| # | Bug | File | Test |
|---|-----|------|------|
| G1 | Role lost when the same symbol is both a caller and a callee — first-write-wins on the node map drops the second role | `src/graph/GraphBuilder.ts` | `bugs.GraphBuilder.test.ts` |
| G2 | Two callers with identical `id` produce 1 node but 2 edges (duplicate edges) | `src/graph/GraphBuilder.ts` | `bugs.GraphBuilder.test.ts` |
| G3 | `confidence` is hardcoded to `'high'` regardless of the `tool` parameter passed in | `src/graph/GraphBuilder.ts` | `bugs.GraphBuilder.test.ts` |
| G4 | `langId` is empty string for files with no extension (e.g. `Makefile`) | `src/graph/GraphBuilder.ts` | `bugs.GraphBuilder.test.ts` |

---

## CtagsAnalyzer

| # | Bug | File | Test |
|---|-----|------|------|
| C1 | Regex injection: `targetName` is used verbatim in `new RegExp(...)` — symbols like `operator+`, `str.length`, `arr[0]` throw `Invalid regular expression` or produce false matches | `src/analyzers/cli/CtagsAnalyzer.ts` | `bugs.CtagsAnalyzer.test.ts` |
| C2 | `C_CPP_EXTENSIONS` constant is declared but never used anywhere — `canHandle` checks `langId`, not file extension | `src/analyzers/cli/CtagsAnalyzer.ts` | `bugs.CtagsAnalyzer.test.ts` |
| C3 | `targetId` uses raw 1-based ctags line numbers; caller ids use 0-based — ID format is inconsistent between target and callers | `src/analyzers/cli/CtagsAnalyzer.ts` | `bugs.CtagsAnalyzer.test.ts` |
| C4 | ctags entry with `line=0` produces a graph node with `line=-1` (invalid) | `src/analyzers/cli/CtagsAnalyzer.ts` | `bugs.CtagsAnalyzer.test.ts` |
| C5 | Only the first overload is used when ctags returns multiple entries for the same symbol name (C++ overloads silently dropped) | `src/analyzers/cli/CtagsAnalyzer.ts` | `bugs.CtagsAnalyzer.test.ts` |

---

## AnalysisCache

| # | Bug | File | Test |
|---|-----|------|------|
| A1 | Cache key collision: `symbol: undefined` and `symbol: ''` produce the same key string (via `symbol ?? ''`) | `src/cache/AnalysisCache.ts` | `bugs.AnalysisCache.test.ts` |
| A2 | File path containing `|` causes false cache invalidation — `k.startsWith(fsPath + '|')` matches mid-key substrings | `src/cache/AnalysisCache.ts` | `bugs.AnalysisCache.test.ts` |
| A3 | `set()` silently does nothing when the file does not exist — no error, no warning, caller is unaware | `src/cache/AnalysisCache.ts` | `bugs.AnalysisCache.test.ts` |

---

## ClangdHealth

| # | Bug | File | Test |
|---|-----|------|------|
| H1 | `compile_commands.json` is only checked at the workspace root — a `.clangd` config pointing to a build subdirectory is entirely ignored | `src/tools/ClangdHealth.ts` | `bugs.ClangdHealth.test.ts` |
| H2 | `meson.build` and `build.ninja` are not checked for staleness — only `CMakeLists.txt` and `Makefile` are | `src/tools/ClangdHealth.ts` | `bugs.ClangdHealth.test.ts` |
| H3 | Empty (`[]`) or malformed `compile_commands.json` returns `ok` — content is never validated | `src/tools/ClangdHealth.ts` | `bugs.ClangdHealth.test.ts` |
| H4 | Only the first workspace folder is checked — multi-root workspaces where the second folder has `compile_commands.json` always show `warn` | `src/tools/ClangdHealth.ts` | `bugs.ClangdHealth.test.ts` |
| H5 | Lowercase `makefile` is not checked for staleness on case-sensitive filesystems (Linux) | `src/tools/ClangdHealth.ts` | `bugs.ClangdHealth.test.ts` |

---

## selectCompileCommands

| # | Bug | File | Test |
|---|-----|------|------|
| S1 | The scan depth variable named `depth=5` actually scans 6 levels (condition is `> depth`, not `>= depth`) | `src/commands/selectCompileCommands.ts` | `bugs.selectCompileCommands.test.ts` |
| S2 | Hidden directories (`.build`, `.cache`) are silently skipped during scan with no user feedback | `src/commands/selectCompileCommands.ts` | `bugs.selectCompileCommands.test.ts` |
| S3 | `writeClangdConfig` silently overwrites an existing hand-crafted `.clangd` file without prompting | `src/commands/selectCompileCommands.ts` | `bugs.selectCompileCommands.test.ts` |
| S4 | Selecting "None" calls `showInformationMessage` — unnecessary noise for a remove action | `src/commands/selectCompileCommands.ts` | `bugs.selectCompileCommands.test.ts` |
| S5 | Non-null assertion `picked.detail!` — if `detail` is `undefined`, this throws a `TypeError` at runtime | `src/commands/selectCompileCommands.ts` | `bugs.selectCompileCommands.test.ts` |

---

## SidepanelProvider

| # | Bug | File | Test |
|---|-----|------|------|
| P1 | `depth=0` is not validated — `Math.min(0, maxDepth)=0` passes through; schema says `min:1` | `src/SidepanelProvider.ts` | `scenario.SidepanelProvider.test.ts` |
| P2 | `depth=-1` is not validated — negative depths are silently accepted | `src/SidepanelProvider.ts` | `scenario.SidepanelProvider.test.ts` |
| P3 | A graph with `nodes.length=0` is treated as no result and falls through to `analysisError` instead of being returned as a valid (empty) result | `src/SidepanelProvider.ts` | `scenario.SidepanelProvider.test.ts` |

---

## Settings (dead settings)

All settings below are readable via `Settings.*` but are never consumed by any
analyzer, factory, or renderer. Users who configure them get no effect.

| # | Setting | Dead since | Test |
|---|---------|-----------|------|
| D1 | `tools.clangdPath` | Always — LspClient uses VS Code's bundled clangd extension, not a configurable binary | `scenario.Settings.test.ts` |
| D2 | `tools.ctagsPath` | Always — `CtagsAnalyzer` invokes bare `'ctags'`, never reads this setting | `scenario.Settings.test.ts` |
| D3 | `tools.compileCommandsPath` | Always — neither `LspAnalyzer` nor `ClangdHealth` reads it | `scenario.Settings.test.ts` |
| D4 | `tools.fallbackTool` | Always — `AnalyzerFactory` always builds `[LspAnalyzer, CtagsAnalyzer]` regardless | `scenario.Settings.test.ts` |
| D5 | `clangd.fallbackFlags` | Always — flags are never passed to clangd | `scenario.Settings.test.ts` |
| D6 | `ai.enabled`, `ai.extensionId`, `ai.requireConfirmation` | Always — AI analyzer is not implemented in `AnalyzerFactory` | `scenario.Settings.test.ts` |
| D7 | `ui.nodeLabel.maxLength.sidebar`, `ui.nodeLabel.maxLength.expanded` | Always — labels are never truncated in `GraphBuilder` or the renderer | `scenario.Settings.test.ts` |
| D8 | `analysis.callGraph.hideExternal`, `analysis.fileDeps.hideExternal` | Always — no analyzer or builder reads these | `scenario.Settings.test.ts` |
| D9 | `analysis.fileDeps.*` (all) | iter 8 not implemented yet | `scenario.Settings.test.ts` |
| D10 | `analysis.maxDepth=0` accepted — `Math.min(any, 0)=0` makes every analysis produce depth=0 permanently | `src/config/Settings.ts` | `scenario.Settings.test.ts` |
| D11 | `workspace.getConfiguration` is called fresh on every `Settings.*` read — 5 settings reads = 5 VS Code API calls with no caching | `src/config/Settings.ts` | `scenario.Settings.test.ts` |

---

## ToolRegistry

| # | Bug | File | Test |
|---|-----|------|------|
| T1 | `statuses` getter returns the internal array by reference — callers can mutate registry state directly | `src/tools/ToolRegistry.ts` | `scenario.ToolRegistry.test.ts` |
| T2 | `clangd` appears in the `TOOLS` constant but is filtered out and handled separately — the entry in `TOOLS` is dead data | `src/tools/ToolRegistry.ts` | `scenario.ToolRegistry.test.ts` |
| T3 | `refresh()` re-runs all tool checks on every call with no caching — repeated refreshes are O(n) tool lookups each time | `src/tools/ToolRegistry.ts` | `scenario.ToolRegistry.test.ts` |

---

## LspClient

| # | Bug | File | Test |
|---|-----|------|------|
| L1 | `AbortSignal` is only checked at function entry — a signal aborted mid-flight does not cancel the in-flight VS Code command | `src/analyzers/lsp/LspClient.ts` | `scenario.LspClient.test.ts` |
