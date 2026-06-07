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

## Key Design Decisions (Summary)

- **LSP-first**: clangd, rust-analyzer, tsserver are primary tools
- **Fallback chain**: LSP → cscope/ctags → regex → AI (explicit opt-in)
- **AI is external**: AI capability provided by a separate companion extension via `vscode.commands.executeCommand`
- **Single WebviewView**: entire sidepanel is one webview, not a TreeView mix
- **Confidence indicators**: every graph result is tagged with the tool that produced it
- **No Doxygen**: not a dependency; optional bonus if pre-generated XML detected
- **AI is opt-in, confirmed, explicit**: never triggers silently
