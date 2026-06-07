# 03 — Analysis Capabilities

## 3.1 Call Graph

### What It Shows
A directed graph centered on a selected function:
- **Incoming edges**: functions that call the selected function (callers)
- **Outgoing edges**: functions called by the selected function (callees)
- Configurable depth in both directions (default: 2 levels each)

### Entry Point
- Right-click on a function name → "Show Call Graph"
- Cursor positioned inside a function body → "Show Call Graph" from sidepanel button

### Graph Properties
- Nodes: function names, decorated with file name
- Edges: directed, labeled with call count if available
- Selected function: visually distinct (center node)
- External / stdlib calls: shown but visually de-emphasized; can be hidden via filter

### Interactions
- Click node → re-center graph on that function (new analysis)
- Double-click node → jump to definition in editor
- Depth controls: increase/decrease depth without re-centering
- "Pin" toggle: lock current symbol, ignore editor cursor changes
- Filter toggle: hide external/stdlib symbols

### Layout
- Sidebar view: radial layout, selected function at center
- Expanded view (full tab): hierarchical top-down layout

---

## 3.2 File Dependencies

### What It Shows
A directed graph of file-level dependencies for the active file:
- **Outgoing edges**: files this file imports / includes
- **Incoming edges**: files that import / include this file
- Transitive deps shown up to configurable depth (default: 2)

### Entry Point
- Active editor file → "Show File Deps" from sidepanel button
- Right-click on file in explorer → "Show File Dependencies"

### Graph Properties
- Nodes: file paths (relative to project root), decorated with language
- Edges: directed import/include relationship
- Active file: visually distinct (center node)
- External / node_modules / stdlib: shown but de-emphasized; can be hidden

### Language-Specific Notes
- **C/C++**: `#include` chains; system includes (`<stdio.h>`) shown but filtered by default
- **Rust**: crate-level dependencies from `cargo metadata`; internal `mod` relationships from source
- **Python**: `import` and `from X import` statements; dynamic imports (`importlib`) not resolvable
- **TypeScript/JavaScript**: ES module `import` statements + `require()` calls

---

## 3.3 Component Dependencies

### What It Shows
A high-level architecture graph of project components/modules and their relationships.
Components are larger than files — targets, packages, crates, top-level modules.

### Entry Point
- "Show Component Deps" from sidepanel button (workspace-level, not file-level)

### Component Definition per Language

| Language | Component = |
|---|---|
| C/C++ (CMake) | CMake target (`add_library`, `add_executable`) |
| C/C++ (no build sys) | Top-level directory |
| Rust | Workspace member crate |
| Python | Top-level package (directory with `__init__.py`) |
| TypeScript | `tsconfig.json` project reference |
| JavaScript | `package.json` package |

### Graph Properties
- Nodes: component names
- Edges: dependency relationships between components
- Node size: optionally proportional to file count
- External dependencies: shown as leaf nodes, visually distinct

### Notes
- This is the slowest analysis — may require parsing build system files
- Cache aggressively; invalidate only when build config files change
- C/C++ without CMake falls back to directory heuristic — label results accordingly
