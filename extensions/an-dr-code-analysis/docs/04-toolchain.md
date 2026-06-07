# 04 — Toolchain

## 4.1 Tool Registry

### C / C++

| Capability | Primary Tool | Fallback 1 | Fallback 2 |
|---|---|---|---|
| Call Graph | `clangd` (LSP `callHierarchy`) | `cscope` (`-L2`/`-L3`) | `ctags` + grep |
| File Deps | `clangd` (`documentLink`) | `#include` regex parse | — |
| File Deps (deep) | `include-what-you-use` (optional) | — | — |
| Component Deps | `cmake --graphviz` / `meson introspect --targets` | `compile_commands.json` grouping | directory heuristic |

### Rust

| Capability | Primary Tool | Fallback |
|---|---|---|
| Call Graph | `rust-analyzer` (LSP `callHierarchy`) | `ctags` |
| File Deps | `cargo metadata` | `mod` AST parse |
| Component Deps | `cargo metadata` | — |

### Python

| Capability | Primary Tool | Fallback |
|---|---|---|
| Call Graph | `pyan3` CLI (`--dot` output) | `ctags` |
| File Deps | `importlab` CLI | AST `import` walk |
| Component Deps | package directory heuristic | — |

### TypeScript / JavaScript

| Capability | Primary Tool | Fallback |
|---|---|---|
| Call Graph | `tsserver` (LSP `callHierarchy`) | `ctags` |
| File Deps | `tsserver` (`documentLink`) | TS compiler API (`ts.createProgram`) |
| Component Deps | `tsconfig.json` `references` | `package.json` deps |

---

## 4.2 Tool Detection & Health Check

### Detection on Activation

On extension activation, scan for all tools and report status:

```
Tools to detect (in order of priority):
  clangd          → which clangd / clangd --version
  rust-analyzer   → which rust-analyzer
  cargo           → cargo --version
  tsserver        → bundled with VSCode, always available
  ctags           → which ctags / ctags --version
  cscope          → which cscope
  pyan3           → python -m pyan3 --version / pyan3 --version
  cmake           → cmake --version
  meson           → meson --version
  bear            → which bear
  importlab       → python -m importlab --version
  iwyu            → which include-what-you-use
```

### Health Check States

```typescript
enum ToolHealth {
  OK,                      // tool found, responding
  NOT_FOUND,               // not on PATH
  WRONG_VERSION,           // found but version too old
  NOT_RESPONDING,          // found but process fails
}
```

### clangd-Specific Health

```typescript
enum ClangdHealth {
  OK,                        // LSP responding, symbols resolving
  NO_COMPILE_COMMANDS,       // compile_commands.json not found
  STALE_COMPILE_COMMANDS,    // older than CMakeLists.txt / meson.build / Makefile
  LSP_NOT_RESPONDING,        // process found, LSP failing
  SYMBOLS_NOT_RESOLVING,     // LSP running, returning empty results
}
```

---

## 4.3 Fallback Chain

For every analysis request, the fallback chain is:

```
1. LSP (clangd / rust-analyzer / tsserver)
       ↓ unavailable or returns empty
2. Language-specific CLI tool (cscope, pyan3, cargo metadata)
       ↓ unavailable or returns empty
3. ctags + grep (universal fallback)
       ↓ unavailable or returns empty
4. Regex / AST heuristic (single-file, last resort)
       ↓ fails or empty
5. AI fallback (opt-in, explicit confirmation required)
```

Each level must be attempted and explicitly fail before moving to the next.
Never skip levels silently.
Tag every result with the tool that produced it.

### Confidence Levels

| Tool | Confidence | Display |
|---|---|---|
| LSP (clangd / rust-analyzer / tsserver) | High | 🟢 |
| cscope / pyan3 / cargo metadata | Medium | 🟡 |
| ctags / importlab / TS compiler API | Medium | 🟡 |
| regex / AST heuristic | Low | 🔴 |
| AI | Best-effort | 🤖 |

---

## 4.4 clangd Misconfiguration Handling

### Detection

Check on every C/C++ analysis request:
1. Does `compile_commands.json` exist in project root or known build dirs?
2. Is it newer than `CMakeLists.txt` / `meson.build` / `Makefile`?
3. Is clangd LSP returning non-empty results for the active file?

### Recovery Actions (offer to user, do not auto-execute)

| Condition | Offer |
|---|---|
| No `compile_commands.json`, CMake detected | "Generate via CMake" → `cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=ON <build_dir>` |
| No `compile_commands.json`, Meson detected | "Generate via Meson" → `meson setup <build_dir>` (Meson always generates `compile_commands.json`) |
| No `compile_commands.json`, Make detected | "Generate via Bear" → `bear -- make` (if bear available) |
| `compile_commands.json` stale | "Regenerate" → re-run last known generation command |
| Cross-compilation flags detected | "Generate `.clangd` config" → create `.clangd` with flag remapping |
| Manual override needed | "Set path manually" → open settings |

### Cross-Compilation `.clangd` Generation

When `arm-none-eabi`, `riscv`, or similar cross-compiler is detected in
`compile_commands.json`, offer to generate a `.clangd` file:

```yaml
# .clangd
CompileFlags:
  Add: [--target=arm-none-eabi]
  Remove: [-march=*, -mfpu=*, -mfloat-abi=*]
```

Specific flag sets per detected toolchain. Do not auto-write without user confirmation.

### Fallback Trigger

If clangd health is anything other than `OK` after recovery attempts:
→ proceed with cscope/ctags fallback
→ show clangd health reason in Tools Status section
→ do not block analysis

---

## 4.5 Tool Installation Notes (for README, not enforcement)

```
Mandatory for core value:
  clangd          installed with LLVM or as VSCode extension dependency
  rust-analyzer   installed via rustup or VSCode extension
  cargo           installed with Rust toolchain
  tsserver        bundled with VSCode — no install needed

Recommended:
  ctags           universal-ctags preferred over exuberant-ctags
  pyan3           pip install pyan3
  cmake           system package manager
  meson           pip install meson / system package manager

Optional:
  cscope          system package manager
  bear            system package manager (Linux/macOS)
  importlab       pip install importlab
  iwyu            system package manager (include-what-you-use)
```

The extension detects what is available and degrades gracefully.
It never requires the user to install anything to activate.
