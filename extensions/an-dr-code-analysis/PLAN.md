# an-dr-code-analysis — Implementation Plan

Each iteration ends with a reviewable checkpoint. Complete one before starting the next.

---

## Iteration 1 — Scaffolding

Get a buildable, activatable extension with an empty sidepanel.

- [x] Create `package.json` (publisher `an-dr`, engine `^1.90.0`, `activationEvents: ["*"]`)
  - Register `viewsContainers.activitybar` and `views.an-dr-code-analysis` (webview type)
- [x] Create `tsconfig.json` and `webpack.config.js` (two entry points: extension + webview)
- [x] Create `src/extension.ts` — activate(), register sidepanel provider, return empty exports
- [x] Create `src/SidepanelProvider.ts` — `WebviewViewProvider` with static HTML placeholder
- [x] Create `webview-src/index.ts` — empty entry point, renders "Code Analysis (loading...)"
- [x] Build succeeds (`npm run build`), extension loads in Extension Development Host
- [ ] Sidepanel appears in Activity Bar with placeholder text

**Checkpoint:** Panel opens, no errors in Extension Host log.

---

## Iteration 2 — Tool Detection (TOOLS STATUS section)

Detect installed tools on activation and render status in the panel.

- [ ] Create `src/tools/ToolRegistry.ts` — detects: clangd, rust-analyzer, cargo, ctags, cscope, pyan3, cmake, bear, importlab, iwyu; tsserver always "ok" (bundled)
- [ ] Create `src/tools/ClangdHealth.ts` — checks `compile_commands.json` presence and staleness
- [ ] Define `ToolStatus` type in `src/webview/messages.ts`
- [ ] `SidepanelProvider` sends `toolsStatus` message after detection
- [ ] Webview renders TOOLS STATUS section with ✅ / ⚠️ / ❌ icons (collapsed by default)
- [ ] `ToolRegistry.refresh()` callable on demand

**Checkpoint:** Open panel → TOOLS STATUS shows real state for the machine's installed tools.

---

## Iteration 3 — Context Tracking (CONTEXT section)

Track active editor symbol and file; render in panel.

- [ ] Create `src/context/ContextTracker.ts`
  - Subscribe to `onDidChangeActiveTextEditor` and `onDidChangeTextEditorSelection` (debounced 300ms)
  - Symbol detection: LSP hover first, word-boundary regex fallback
  - `pin()` / `unpin()` / `isPinned()`
  - Emit `onContextChange: vscode.Event<EditorContext>`
- [ ] Define `contextUpdate` message in `messages.ts`
- [ ] `SidepanelProvider.updateContext()` posts `contextUpdate` to webview
- [ ] Webview renders CONTEXT section: Symbol, File, Lang, Pin button
- [ ] Pin toggle works (pinned state visually distinct)

**Checkpoint:** Switch editor tabs → CONTEXT updates. Pin → stays locked.

---

## Iteration 4 — Graph Infrastructure

Define types and wire the analysis skeleton without any real analyzer yet.

- [ ] Create `src/graph/GraphModel.ts` — all types from spec §7.5
- [ ] Create `src/analyzers/IAnalyzer.ts` — `IAnalyzer`, `AnalysisRequest`, `AnalysisResult` interfaces
- [ ] Create `src/analyzers/AnalyzerFactory.ts` — stub returning empty chain
- [ ] Create `src/cache/AnalysisCache.ts` — mtime-based cache with `FileSystemWatcher`
- [ ] Create `src/config/Settings.ts` — typed accessors for all settings (§08)
- [ ] Create analysis pipeline in `SidepanelProvider`: receives `requestAnalysis`, runs chain, sends `analysisResult` or `analysisError`
- [ ] Webview renders ANALYSIS section: three buttons (Call Graph, File Deps, Component Deps)
- [ ] Webview renders GRAPH section skeleton: graph area placeholder, depth controls (no renderer yet), confidence badge area
- [ ] Define all message types in `messages.ts`

**Checkpoint:** Click "Call Graph" → spinner appears → "No results found" (empty graph). No crashes.

---

## Iteration 5 — Cytoscape Renderer

Render graphs in the webview. Use stub data first to verify rendering.

- [ ] Add `cytoscape` as a bundled dependency (no CDN)
- [ ] Create `webview-src/graph/CytoscapeRenderer.ts` — renders `GraphModel` into a `cy` instance
- [ ] Create `webview-src/graph/layouts.ts` — radial (call graph sidebar), hierarchical (expanded), force-directed (file/component deps)
- [ ] Node styling: target (large, bold), caller, callee, external (gray)
- [ ] Edge styling: directed arrows, dashed for external
- [ ] Node interactions: single click → `nodeClick` message, double-click → `nodeDoubleClick` message, hover tooltip (full name + file)
- [ ] Depth `[−]` / `[+]` / `[reset]` controls wired to `depthChange` message (debounced 500ms)

**Checkpoint:** Paste a hardcoded `GraphModel` fixture → graph renders with correct layout and interactions.

---

## Iteration 6 — clangd Call Graph (first real analysis)

Implement LSP call hierarchy for C/C++ via clangd.

- [ ] Create `src/analyzers/lsp/LspClient.ts` — LSP protocol helpers (callHierarchy/prepareCallHierarchy, incomingCalls, outgoingCalls)
- [ ] Create `src/analyzers/lsp/LspAnalyzer.ts` — implements `IAnalyzer` for C/C++, call graph only
- [ ] Create `src/graph/GraphBuilder.ts` — normalizes LSP call hierarchy response → `GraphModel`
- [ ] Wire `LspAnalyzer` into `AnalyzerFactory` for `c`/`cpp` + `callGraph`
- [ ] Confidence: `high`, tool: `clangd`

**Checkpoint:** Open a `.cpp` file, click "Call Graph" → real call graph appears with 🟢 clangd badge.

---

## Iteration 7 — ctags Fallback

Add universal fallback for call graph when LSP unavailable or empty.

- [ ] Create `src/analyzers/cli/CtagsAnalyzer.ts` — runs `ctags -x` or `ctags -R --fields=+n`, parses output → `GraphModel`; confidence `medium`
- [ ] `AnalyzerFactory.getChain()` returns `[LspAnalyzer, CtagsAnalyzer]` for C/C++ call graph
- [ ] Fallback chain logic in pipeline: try each analyzer in order, use first non-empty result
- [ ] Confidence badge reflects actual tool used
- [ ] Show warning in graph if fallback was used

**Checkpoint:** Disable clangd (or open a file with no `compile_commands.json`) → ctags result appears with 🟡 badge.

---

## Iteration 8 — File Dependencies (C/C++)

Implement file dependency graph via clangd `documentLink` + `#include` regex fallback.

- [ ] Extend `LspAnalyzer` to handle `fileDeps` graph type via `textDocument/documentLink`
- [ ] Create `src/analyzers/heuristic/RegexAnalyzer.ts` — `#include` parse → `GraphModel`; confidence `low`
- [ ] Wire both into factory for `c`/`cpp` + `fileDeps`
- [ ] "File Deps" button now triggers real analysis

**Checkpoint:** Click "File Deps" on a `.cpp` file → include graph renders.

---

## Iteration 9 — clangd Health & Recovery Actions

Surface clangd misconfiguration and offer fixes.

- [ ] `ClangdHealth.ts` checks: `compile_commands.json` exists, is newer than `CMakeLists.txt`/`Makefile`, LSP returning results
- [ ] Create `src/tools/RecoveryActions.ts` — generates `cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON`, `bear -- make`, `.clangd` for cross-compilation
- [ ] On clangd `NO_COMPILE_COMMANDS` or `STALE_COMPILE_COMMANDS`: send `analysisError` with `recoveryActions`
- [ ] Webview renders recovery action buttons below error message
- [ ] Cross-compilation detection: scan `compile_commands.json` for `arm-none-eabi`, `riscv` — offer `.clangd` generation with user confirmation

**Checkpoint:** Open project without `compile_commands.json` → error with "Generate via CMake" button.

---

## Iteration 10 — Rust (rust-analyzer + cargo)

Add Rust language support.

- [ ] Extend `LspAnalyzer` to handle `rust` language via rust-analyzer
- [ ] Create `src/analyzers/cli/CargoAnalyzer.ts` — `cargo metadata --format-version 1` → component deps `GraphModel`
- [ ] Wire into factory: `rust` + `callGraph` → `[LspAnalyzer, CtagsAnalyzer]`; `rust` + `fileDeps` → `[LspAnalyzer, RegexAnalyzer]`; `rust` + `componentDeps` → `[CargoAnalyzer]`

**Checkpoint:** Open a `.rs` file → call graph, file deps, and component deps all work.

---

## Iteration 11 — TypeScript / JavaScript (tsserver)

Add TS/JS support.

- [ ] Extend `LspAnalyzer` for `typescript`/`javascript` via tsserver
- [ ] Add TS compiler API fallback for file deps (`ts.createProgram`)
- [ ] `tsconfig.json` `references` → component deps
- [ ] Wire into factory for all three graph types

**Checkpoint:** Open a `.ts` file → all three analyses work.

---

## Iteration 12 — Python (pyan3 + AST)

Add Python support.

- [ ] Create `src/analyzers/cli/Pyan3Analyzer.ts` — runs `pyan3 --dot`, parses DOT → `GraphModel`; confidence `medium`
- [ ] Create `src/analyzers/heuristic/AstWalkAnalyzer.ts` — `import` AST walk → file deps; confidence `low`
- [ ] Wire into factory: `python` + `callGraph` → `[Pyan3Analyzer, CtagsAnalyzer]`; `python` + `fileDeps` → `[AstWalkAnalyzer]`

**Checkpoint:** Open a `.py` file → call graph and file deps work.

---

## Iteration 13 — Component Dependencies (CMake + directory heuristic)

Add component-level analysis for C/C++.

- [ ] Create `src/analyzers/cli/CmakeAnalyzer.ts` — `cmake --graphviz=<tmpfile>`, parses DOT → `GraphModel`
- [ ] Directory heuristic fallback: group files by top-level directory, infer deps from `#include` across groups
- [ ] Wire into factory: `c`/`cpp` + `componentDeps` → `[CmakeAnalyzer, RegexAnalyzer(heuristic)]`

**Checkpoint:** Open a CMake project → "Component Deps" shows target graph.

---

## Iteration 14 — Expand to Full Tab

Wider graph in a `WebviewPanel` editor tab.

- [ ] Clicking ↗ in GRAPH section opens `vscode.window.createWebviewPanel`
- [ ] Title: `Code Analysis — {graphType} — {symbol or file}`
- [ ] Same `CytoscapeRenderer` instance, hierarchical layout, higher depth default (max 8)
- [ ] Independent from sidebar (both work simultaneously)
- [ ] No PNG/SVG export yet (deferred)

**Checkpoint:** Click ↗ → full-tab graph opens, sidebar still works.

---

## Iteration 15 — AI Fallback Bridge

Connect to companion extension (e.g. `an-dr-ai`) as last-resort analyzer.

- [ ] Create `src/analyzers/ai/ExternalExtensionAnalyzer.ts` — calls companion via `vscode.commands.executeCommand('an-dr-ai.analyzeCode', request)`
- [ ] `AiConfirmationPayload` built from failed request: files being sent, sizes, companion name
- [ ] Webview renders AI confirmation dialog before sending; waits for `aiConfirmed` / `aiCancelled`
- [ ] Wire into factory as final fallback (all languages, all graph types)
- [ ] `contractVersion: "1.0"` included in every request
- [ ] AI is never triggered silently — always requires explicit user confirmation

**Checkpoint:** Kill all local tools → AI fallback dialog appears → confirming produces AI graph with 🤖 badge.

---

## Iteration 16 — Polish

Final UX pass.

- [ ] Cancellation: if analysis runs >10s, show "Cancel" button; wire to `AbortController`
- [ ] Context-switch notice: if file changes mid-analysis, show "Results are for {previous file}"
- [ ] Node right-click context menu: "Jump to Definition", "Copy Name", "Pin this symbol"
- [ ] TOOLS STATUS: clicking ⚠️/❌ item shows popover (install hint + affected capabilities)
- [ ] Empty result display: "No results found" with tool name (not an error)
- [ ] Output channel logging for all analysis steps (errors, fallbacks, tool output)
- [ ] Section collapse/expand state persisted across panel closes

**Checkpoint:** Manual smoke test of all graph types, all interactions, error states, and cancellation.
