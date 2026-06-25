# an-dr-code-analysis — Spec Package

## Purpose of This Package

This is the full specification for the `an-dr-code-analysis` VSCode extension.
It is structured for a builder AI to implement the extension from scratch.

## How to Use These Files

Read in order. Each file is self-contained but references others where relevant.
Do not skip `01-overview.md` — it defines constraints that apply everywhere.

## File Index

| File | Content |
|---|---|
| `00-README.md` | This file |
| `01-overview.md` | Purpose, users, scope, non-goals |
| `02-languages.md` | Supported languages and capability matrix |
| `03-analysis-capabilities.md` | Call graph, file deps, component deps — what each shows |
| `04-toolchain.md` | Tools per language, detection, fallback chain, clangd handling |
| `05-ai-fallback.md` | AI as last resort, external extension bridge contract |
| `06-sidepanel-ui.md` | Panel layout, sections, graph rendering, UX rules |
| `07-architecture.md` | Extension structure, interfaces, graph model, message protocol |
| `08-configuration.md` | All settings with types, defaults, descriptions |
| `09-error-handling.md` | Failure modes, recovery actions, user-facing messages |
| `10-constraints.md` | Known limitations, out of scope, explicit non-goals |
| `11-architecture-cleanliness-review.md` | Architecture and clean-code review with refactoring roadmap |
| `adr/001-grouped-graph-layout.md` | Decision record for grouped file/folder graph layout |
| `adr/002-graph-layout-strategies.md` | Decision record for graph layout strategy ownership |
| `adr/003-analysis-runner-application-service.md` | Decision record for extracting analysis orchestration from UI adapters |
| `adr/004-symbol-resolver.md` | Decision record for extracting cursor symbol resolution from context tracking |
| `adr/005-shared-browser-safe-primitives.md` | Decision record for moving pure webview-safe helpers into `shared/` |
| `adr/006-shared-graph-model.md` | Decision record for moving graph payload contracts into `shared/graph` |

## Key Design Decisions (Summary)

- **LSP-first**: clangd, rust-analyzer, tsserver are primary tools
- **Fallback chain**: LSP → cscope/ctags → regex → AI (explicit opt-in)
- **AI is external**: AI capability provided by a separate companion extension via `vscode.commands.executeCommand`
- **Single WebviewView**: entire sidepanel is one webview, not a TreeView mix
- **Layout strategies**: graph layout selection lives in the webview layout layer, not renderer code
- **Analysis runner**: cache, cancellation, and analyzer fallback orchestration live in an application service
- **Symbol resolver**: cursor symbol resolution is separate from context tracking state
- **Shared primitives**: browser-safe pure helpers live in `shared/`, not extension-host folders
- **Shared graph model**: graph payload contracts live in `shared/graph`
- **Confidence indicators**: every graph result is tagged with the tool that produced it
- **No Doxygen**: not a dependency; optional bonus if pre-generated XML detected
- **AI is opt-in, confirmed, explicit**: never triggers silently
