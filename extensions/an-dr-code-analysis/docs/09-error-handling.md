# 09 — Error Handling & Diagnostics

## 9.1 Failure Modes per Tool

### clangd

| Failure | Detection | User Message | Recovery |
|---|---|---|---|
| Not installed | `which clangd` fails | "clangd not found. C/C++ analysis will use ctags fallback." | Link to LLVM install guide |
| No compile_commands.json | File not found at search paths | "No compile_commands.json found. Analysis accuracy will be reduced." | Offer CMake/Meson/Bear generation |
| Stale compile_commands.json | mtime < CMakeLists.txt / meson.build mtime | "compile_commands.json may be outdated. Results may be inaccurate." | Offer regeneration |
| LSP not responding | Timeout on `initialize` request | "clangd is not responding. Falling back to ctags." | Suggest restart, check PATH |
| Symbols not resolving | Empty result on known-good file | "clangd returned no results. Falling back to ctags." | Check compile_commands, offer .clangd generation |
| Cross-compiler flags | Detected arm-none-eabi / riscv in compile_commands | "Cross-compilation flags detected. clangd may struggle." | Offer .clangd generation |

### rust-analyzer

| Failure | Detection | User Message | Recovery |
|---|---|---|---|
| Not installed | `which rust-analyzer` fails | "rust-analyzer not found. Rust analysis will use ctags fallback." | Suggest `rustup component add rust-analyzer` |
| No Cargo.toml | File not found | "No Cargo.toml found in workspace. Cannot analyze Rust project structure." | None |
| LSP not responding | Timeout | "rust-analyzer is not responding." | Suggest restart |

### cargo

| Failure | Detection | User Message | Recovery |
|---|---|---|---|
| Not installed | `cargo --version` fails | "cargo not found. Rust component/file dependency analysis unavailable." | Suggest rustup install |
| `cargo metadata` fails | Non-zero exit | "cargo metadata failed: {stderr}" | Show stderr, suggest `cargo check` first |

### pyan3 (Python)

| Failure | Detection | User Message |
|---|---|---|
| Not installed | `pyan3 --version` fails | "pyan3 not found. Python call graph will use ctags fallback." |
| Parse error | Non-zero exit | "pyan3 failed to parse file. Falling back to ctags." |
| Empty output | DOT output has no edges | "pyan3 found no call relationships. Results may be incomplete." |

### ctags (fallback)

| Failure | Detection | User Message |
|---|---|---|
| Not installed | `ctags --version` fails | "ctags not found. Heuristic regex analysis will be used (low accuracy)." |
| Index generation fails | Non-zero exit | "ctags failed to index project." |
| No results | Empty output | "ctags found no symbols. File may be empty or unsupported." |

### cmake

| Failure | Detection | User Message |
|---|---|---|
| Not installed | `cmake --version` fails | "cmake not found. C/C++ component dependency analysis will use directory heuristic." |
| Graphviz generation fails | Non-zero exit | "cmake --graphviz failed. Using directory heuristic for component analysis." |

### meson

| Failure | Detection | User Message |
|---|---|---|
| Not installed | `meson --version` fails | "meson not found. C/C++ component dependency analysis will use directory heuristic." |
| Introspect fails | Non-zero exit from `meson introspect --targets` | "meson introspect failed. Using directory heuristic for component analysis." |
| Build dir not found | No `meson-info/` in known build dirs | "Meson build directory not configured. Run 'meson setup <build_dir>' first." |

### AI Companion Extension

| Failure | Detection | User Message |
|---|---|---|
| Extension not installed | `getExtension()` returns undefined | "AI companion extension not found. Install {extensionId} to enable AI fallback." |
| Extension not active | `isActive` = false | "AI companion extension is installed but not active." |
| Command not found | `executeCommand` throws | "AI companion extension does not support analysis requests. Update may be required." |
| Response invalid | Schema validation fails | "AI returned an unexpected response format." |
| User cancelled | User clicks Cancel in confirmation | Silent — no error shown |

## 9.2 Recovery Action Implementations

### Generate compile_commands.json via CMake

```
Condition: CMakeLists.txt found, cmake available, no compile_commands.json
Action:
  1. Find or prompt for build directory
  2. Run: cmake -S {workspaceRoot} -B {buildDir} -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
  3. On success: copy/symlink compile_commands.json to workspaceRoot
  4. On failure: show cmake output, suggest manual configuration
```

### Generate compile_commands.json via Meson

```
Condition: meson.build found, meson available, no compile_commands.json
Action:
  1. Find or prompt for build directory
  2. Run: meson setup {buildDir} --wipe (or meson setup {buildDir} if no prior config)
  3. Meson always writes compile_commands.json to {buildDir}
  4. Copy/symlink {buildDir}/compile_commands.json to workspaceRoot
  5. On failure: show meson output, suggest manual configuration
```

### Generate compile_commands.json via Bear

```
Condition: Makefile found, bear available, no compile_commands.json
Action:
  1. Confirm with user: "Run 'bear -- make' in {workspaceRoot}?"
  2. Run: bear -- make
  3. On success: refresh clangd
  4. On failure: show bear output
```

### Generate .clangd for cross-compilation

```
Condition: cross-compiler flags detected in compile_commands.json
Detected flags triggering this:
  - -march= with arm/thumb/riscv/avr values
  - -mfpu=, -mfloat-abi=
  - Compiler path containing arm-none-eabi, riscv32, avr, etc.

Generated .clangd content (example for ARM Cortex-M):
  CompileFlags:
    Add: [--target=arm-none-eabi]
    Remove: [-march=*, -mfpu=*, -mfloat-abi=*, -mthumb-interwork]

Action:
  1. Show preview of .clangd content to user
  2. Confirm write
  3. Write to {workspaceRoot}/.clangd
  4. Restart clangd LSP client
```

## 9.3 General Error Display Rules

- **Errors appear in the GRAPH section**, not as modal dialogs or notifications
- Show: what failed, why (specific reason), what fallback was used
- Show recovery action buttons inline when available
- Do not pop up OS notifications for analysis failures
- Do log to the "An-Dr Code Analysis" output channel (always, regardless of UI display)

### Output Channel

Create a dedicated output channel: `"An-Dr Code Analysis"`

Log format:
```
[2024-01-15 10:23:45] [INFO]  clangd health: OK (v14.0.3)
[2024-01-15 10:23:46] [INFO]  Analysis: callGraph for myFunction() in motor_ctrl.cpp
[2024-01-15 10:23:47] [WARN]  clangd returned empty results, falling back to ctags
[2024-01-15 10:23:47] [INFO]  ctags analysis completed: 12 nodes, 8 edges
[2024-01-15 10:23:48] [ERROR] pyan3 exited with code 1: SyntaxError in sensor.py:45
```

Output channel is visible via: View → Output → "An-Dr Code Analysis"

## 9.4 Timeout Policy

| Operation | Timeout | Action on timeout |
|---|---|---|
| Tool health check (each tool) | 3s | Mark as not found |
| LSP initialization | 10s | Mark LSP as not responding |
| Single analysis request | 30s | Cancel, show timeout error, offer fallback |
| AI analysis request | 60s | Cancel, show timeout error |
| compile_commands generation | 120s | Cancel, show partial output |

Show cancel button after 10s for any running analysis.
