# 11 - Architecture and Clean Code Review

Date: 2026-06-24
Branch: `refactor/code-analysis-architecture`

## Scope

Reviewed `extensions/an-dr-code-analysis` against these criteria:

- DRY
- SOLID
- classical design patterns
- Clean Code
- Clean Architecture
- ease of expansion, reading, understanding, and modification

The review covers the extension host code under `src/`, the webview code under
`webview-src/`, the current specs under `docs/`, and the active Jest/webpack
verification state.

## Executive Summary

`an-dr-code-analysis` has the right broad separation in its folder structure:
analysis, context tracking, tools, cache, graph model, webview messaging, webview
layout, and webview rendering are already recognizable modules. The recent graph
layout work also moved in the right direction by introducing layout strategy
classes and a renderer base class.

The main issue is that the architecture is still module-shaped rather than
responsibility-shaped. Several files are named after UI surfaces or implementation
details, but they own multiple use cases at once. The two largest examples are
`SidepanelProvider` and `webview-src/index.ts`; each is both a controller,
state store, workflow coordinator, renderer, router, and policy owner.

The next refactoring should not start by moving small helper functions. It should
extract explicit use-case services and stable contracts, then let UI classes call
those services. This will reduce duplication, make test failures more local, and
make new graph types, analyzers, renderers, and UI surfaces easier to add.

## Current Verification State

Baseline command:

```powershell
npm test -- --runInBand
```

Current result: red.

Known failing areas:

- `scenario.SidepanelProvider.test.ts`: `reanalyzeTo` path does not post the
  expected busy/error message and the test mock lacks `getWordRangeAtPosition`.
- `analyzers.CtagsAnalyzer.test.ts` and `analyzers.AnalyzerFactory.test.ts`:
  expectations disagree with current `ctags` language support for Python/Rust.
- `webview.groupedLayout.test.ts`: path compression expectations disagree with
  current common-prefix behavior.
- `cache.AnalysisCache.test.ts`: watcher expectation still expects `**/*`, but
  implementation now watches a source-extension glob.

This means broad refactors must run focused tests plus compile on every
increment, and the first test-oriented refactor should separate real regressions
from stale expectations.

## Findings

### 1. `SidepanelProvider` Violates SRP and Owns Too Many Use Cases

Evidence:

- `src/SidepanelProvider.ts:19` declares the VS Code view provider.
- `src/SidepanelProvider.ts:38` and `src/SidepanelProvider.ts:46` create file
  watchers.
- `src/SidepanelProvider.ts:77` handles all webview messages.
- `src/SidepanelProvider.ts:195` implements reanalysis/navigation workflow.
- `src/SidepanelProvider.ts:256` implements analysis execution, cache lookup,
  fallback chain, cancellation, result posting, and error posting.

Clean Architecture problem:

The view provider is an outer adapter, but it also contains application use-case
logic. That makes behavior hard to test without VS Code mocks and makes a second
UI surface duplicate the same workflow.

Recommended pattern:

- Extract an `AnalysisRunner` application service.
- Extract a `ReanalysisNavigator` or `NodeNavigationService`.
- Keep `SidepanelProvider` as a thin adapter: receive message, call use case,
  post typed result.

Priority: High.

### 2. `FullTabPanel` Duplicates Analysis Workflow from `SidepanelProvider`

Evidence:

- `src/FullTabPanel.ts:71` has its own webview message router.
- `src/FullTabPanel.ts:116` implements its own `reanalyzeTo`.
- `src/FullTabPanel.ts:142` repeats the cache/fallback/cancellation loop from
  `SidepanelProvider`.

DRY problem:

Two UI surfaces have independent copies of the same analysis use case. They will
diverge when cancellation, cache keys, busy messages, error handling, or fallback
selection changes.

Recommended pattern:

- One `AnalysisRunner.run(request)` returns a discriminated result:
  `cacheHit`, `started`, `result`, `cancelled`, or `error`.
- Sidepanel and full-tab adapters decide how to post those events to webviews.

Priority: High.

### 3. Webview `index.ts` Is a God Module

Evidence:

- `webview-src/index.ts` is 873 lines.
- It redeclares message, graph, context, and tool types at
  `webview-src/index.ts:10` through `webview-src/index.ts:64`.
- It owns file-tree building at `webview-src/index.ts:111`.
- It owns graph transforms at `webview-src/index.ts:442` and
  `webview-src/index.ts:507`.
- It owns full render at `webview-src/index.ts:662`.
- It owns event delegation at `webview-src/index.ts:732`,
  `webview-src/index.ts:747`, `webview-src/index.ts:844`,
  `webview-src/index.ts:853`, and `webview-src/index.ts:902`.

Clean Code problem:

The file has no local narrative. A reader has to keep state shape, HTML string
rendering, graph transformation, event routing, VS Code API posting, and renderer
lifecycle in memory at the same time.

Recommended pattern:

- `state/appState.ts`: state model and update actions.
- `messages/protocol.ts`: shared webview-side message types.
- `views/*.ts`: pure render functions per section.
- `graph/graphTransforms.ts`: filtering, folding, circular-edge merging.
- `controllers/eventController.ts`: DOM event delegation.
- `controllers/messageController.ts`: inbound webview message handling.

Priority: High.

### 4. Message and Graph Contracts Are Duplicated Across Extension and Webview

Evidence:

- Extension message types live in `src/webview/messages.ts`.
- Backend graph model lives in `src/graph/GraphModel.ts`.
- Webview graph model is duplicated in `webview-src/index.ts:34` and
  `webview-src/index.ts:45`.
- Renderer graph model is duplicated in `webview-src/graph-renderers/types.ts`.
- Webview imports some backend files directly:
  `webview-src/index.ts:4`,
  `webview-src/graph-renderers/D3Renderer.ts:4`,
  `webview-src/graph-layouts/RadialLayoutStrategy.ts:1`,
  `webview-src/graph-layouts/HierarchicalLayoutStrategy.ts:1`,
  `webview-src/graph-layouts/RoseLayoutStrategy.ts:1`, and others.

Clean Architecture problem:

The webview and extension host are different runtimes, but the current contract
is neither fully shared nor fully isolated. Direct imports from `src/` into
`webview-src/` blur the runtime boundary and make it easy to accidentally bundle
VS Code-only code into the webview.

Recommended pattern:

- Create a runtime-neutral `shared/` folder for pure types and pure algorithms.
- Move `GraphModel`, message types, `nodeActions`, and pure position engine code
  there.
- Keep `src/` for VS Code extension host adapters.
- Keep `webview-src/` for browser-only UI and rendering.

Priority: High.

### 5. Analyzer Selection Is a Hard-Coded List, Not an Open Registry

Evidence:

- `src/analyzers/AnalyzerFactory.ts:30` manually creates every analyzer.
- `src/analyzers/AnalyzerFactory.ts:41` builds one ordered array inline.
- `src/analyzers/AnalyzerFactory.ts:54` filters by `canHandle`.
- `src/analyzers/language-agnostic/CtagsAnalyzer.ts:10` hard-codes broad language
  support.

SOLID problem:

Adding a new analyzer requires editing the factory and understanding the whole
chain ordering. This violates Open/Closed at the registration boundary. It also
makes fallback policy implicit and hard to test separately from analyzer
construction.

Recommended pattern:

- Introduce `AnalyzerDescriptor`:
  `id`, `priority`, `languages`, `graphTypes`, `capability`, `factory`.
- Build a registry array from descriptors.
- Keep fallback ordering in a policy object, not spread across constructor order
  and `canHandle`.

Priority: High.

### 6. Analyzer Implementations Mix IO, Parsing, Graph Construction, and Policy

Evidence:

- `CtagsAnalyzer` spawns `ctags`, parses JSON lines, scans files for callers,
  and constructs `GraphModel` in one class.
- `FileDepsAnalyzer` scans files, parses includes, resolves includes, builds
  reverse indexes, performs BFS, and constructs `GraphModel`.
- `TsFileDepsAnalyzer` repeats much of `FileDepsAnalyzer` with different parse
  and resolve functions.

Clean Architecture problem:

Analyzers are difficult to unit-test without filesystem/process fixtures because
their pure domain logic is not separated from IO. Similar dependency traversal
logic is duplicated per language.

Recommended pattern:

- Split each analyzer into:
  - adapter: process/filesystem/LSP access
  - parser: ctags JSON, include directives, imports
  - resolver: path/include/import resolution
  - graph assembler: common dependency graph builder
- Introduce a shared dependency traversal engine for file dependency graphs.

Priority: Medium-high.

### 7. `ContextTracker` Is a State Machine Without an Explicit State Model

Evidence:

- `src/context/ContextTracker.ts` has pin state, current context,
  call-hierarchy item cache, debounce timer, update id, last position, event
  subscriptions, retry logic, and a three-tier resolution strategy in one class.
- `src/context/ContextTracker.ts:100` uses hard-coded retry delays.
- `src/context/ContextTracker.ts:180` starts semantic resolution.
- `src/context/ContextTracker.ts:262` assumes every `TextDocument` has
  `getWordRangeAtPosition`, which is valid in VS Code but brittle in tests.

Clean Code problem:

The resolution algorithm is not represented as an object or strategy, so tests
must drive the whole tracker. The class also has hidden temporal coupling:
update id, active editor, debounce, retries, and cached call hierarchy item must
all line up correctly.

Recommended pattern:

- Extract `SymbolResolver` with ordered strategies:
  `CallHierarchyResolver`, `DocumentSymbolResolver`, `WordResolver`.
- Keep `ContextTracker` as event/debounce/pin state only.
- Inject clock/retry policy to avoid slow/flaky tests.

Priority: High.

### 8. Webview HTML/CSS Is Generated as One Large Template String

Evidence:

- `src/webview/webviewHtml.ts` is 442 lines.
- CSS, HTML shell, CSP, full-tab variation, and tooltip markup are all inside
  one function.

Clean Code problem:

The webview shell is hard to review and hard to change safely. CSS changes
require editing TypeScript string literals, and there is no per-component style
ownership.

Recommended pattern:

- Keep CSP and shell generation in `webviewHtml.ts`.
- Move CSS to `webview-src/styles/*.css` or small string modules if bundling CSS
  is intentionally avoided.
- Keep full-tab overrides in a named helper.

Priority: Medium.

### 9. `BaseGraphRenderer` Owns Grouped-Layout-Specific Semantics

Evidence:

- `webview-src/graph-renderers/BaseGraphRenderer.ts` owns grouped frame fold
  state, hidden node routing, frame movement, collapsed frame bounds, and dynamic
  frame fitting.

SOLID problem:

The base renderer is no longer only a renderer abstraction; it knows about one
layout family. Future renderers or layout types inherit grouped-frame behavior
even when they do not support it.

Recommended pattern:

- Introduce a `FrameRenderModel` or `GroupedFrameController` composed by renderers
  that support grouped frames.
- Keep `BaseGraphRenderer` focused on layout resolution and generic graph state,
  or remove it if composition is clearer.

Priority: Medium.

### 10. `groupedLayout.ts` Is Algorithmically Dense and Under-Decomposed

Evidence:

- `webview-src/graph-layouts/groupedLayout.ts` is 686 lines.
- It owns path normalization, tree construction, frame creation, intra-frame
  packing, inter-frame force layout, sibling packing, overlap separation, and
  final fallback placement.

Clean Code problem:

The algorithm may be reasonable, but the file mixes multiple levels of
abstraction. Modifying one concept risks breaking another because there are no
strong module boundaries inside the grouped layout engine.

Recommended pattern:

- `grouped/pathLabels.ts`
- `grouped/frameTree.ts`
- `grouped/packing.ts`
- `grouped/frameBounds.ts`
- `grouped/groupedLayout.ts` as orchestrator

Priority: Medium.

### 11. Configuration Is Under-Implemented Relative to the Spec

Evidence:

- `docs/08-configuration.md` lists many settings.
- `package.json` contributes only `an-dr-code-analysis.analysis.maxDepth`.
- `src/config/Settings.ts` reads only `analysis.maxDepth`.
- Local `.vscode/code-analyser/config.json` is a second config channel.

Architecture problem:

There is no single configuration port. Some settings are VS Code settings,
others are local JSON overrides, and many spec settings are not implemented.
This makes behavior hard to reason about and hard to document.

Recommended pattern:

- Define `CodeAnalysisSettings` as one application-facing config interface.
- Implement adapters for VS Code settings and local override JSON.
- Make every use case depend on the interface, not direct static reads.

Priority: Medium.

### 12. Tests Are Broad but Too Coupled to Internals

Evidence:

- Many tests cast to `any` to reach private members.
- Current full test suite is red due to expectation drift and mock mismatch.
- Scenario tests drive large objects with VS Code mocks instead of small
  extracted use cases.

Clean Architecture problem:

Tests are catching problems, but they are not yet shaped around stable
boundaries. When implementation changes, tests fail for mock shape or stale
expectations rather than clearly reporting domain behavior.

Recommended pattern:

- Add narrow tests for extracted services first.
- Keep VS Code scenario tests as a thin integration layer.
- Treat the current failing tests as architectural debt, not noise.

Priority: High.

## Design Direction

The target architecture should look like this:

```text
src/
  extension.ts                         VS Code activation only
  adapters/vscode/
    SidepanelProvider.ts               WebviewView adapter
    FullTabPanel.ts                    WebviewPanel adapter
    WebviewMessenger.ts                typed post/receive wrapper
    VsCodeDocumentNavigator.ts         open/reveal command adapter
  application/
    AnalysisRunner.ts                  analysis use case
    ReanalysisService.ts               node double-click / re-center use case
    ToolStatusService.ts               tool refresh use case
    ContextTrackingService.ts          pin/current context facade
  domain/
    GraphModel.ts
    AnalysisRequest.ts
    Analyzer.ts
    AnalyzerRegistry.ts
    CachePort.ts
    ToolRegistryPort.ts
  infrastructure/
    analyzers/
    cache/
    tools/
shared/
  graph/
    GraphModel.ts
    positionEngine.ts
  protocol/
    messages.ts
    nodeActions.ts
webview-src/
  app/
    state.ts
    messageController.ts
    eventController.ts
  views/
    contextView.ts
    analysisView.ts
    graphView.ts
    toolsView.ts
    fileTreeView.ts
  graph/
    graphTransforms.ts
  graph-layouts/
  graph-renderers/
```

This does not require a large framework. It is still plain TypeScript and
webpack. The change is about dependency direction and ownership, not tooling.

## Recommended Refactoring Roadmap

### Increment 1 - Extract analysis orchestration

Create `src/application/AnalysisRunner.ts`.

Move from `SidepanelProvider` and `FullTabPanel`:

- depth clamping
- cache get/set
- abort controller lifecycle
- analyzer chain execution
- no-context handling
- no-results handling

Expected outcome:

- `SidepanelProvider` and `FullTabPanel` stop duplicating `_runAnalysis`.
- Tests can cover analysis behavior without constructing a webview.

### Increment 2 - Extract symbol resolution strategies

Create `src/context/SymbolResolver.ts` plus small strategy classes/functions.

Expected outcome:

- `ContextTracker` owns event/debounce/pin only.
- `reanalyzeTo` becomes less fragile.
- Current `getWordRangeAtPosition` test failure becomes a small mock or adapter
  issue, not a provider scenario failure.

### Increment 3 - Move shared contracts out of runtime folders

Create `extensions/an-dr-code-analysis/shared/`.

Move:

- graph model
- message protocol
- node double-click action resolution
- position engine

Expected outcome:

- No `webview-src` import reaches into `src`.
- No webview-side type redeclarations.

### Increment 4 - Split webview app module

Extract render functions, graph transforms, state updates, event routing, and
message routing from `webview-src/index.ts`.

Expected outcome:

- `index.ts` becomes bootstrapping only.
- UI changes become local to one view module.
- Graph transform behavior can be tested without DOM.

### Increment 5 - Introduce analyzer registry descriptors

Replace hard-coded factory construction/order with descriptors and policy.

Expected outcome:

- Adding a language/tool is a new descriptor, not a factory edit.
- Fallback policy is visible and testable.

### Increment 6 - Split grouped layout internals

Move path, tree, packing, frame-bounds, and orchestration code into dedicated
files.

Expected outcome:

- Grouped layout becomes easier to tune without risking path labeling or frame
  tree behavior.

## First Refactor to Start Now

Start with Increment 1: `AnalysisRunner`.

Reason:

- It removes real duplication.
- It improves Clean Architecture by creating an application use case.
- It is directly testable.
- It reduces risk before touching the large webview module.
