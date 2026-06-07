# 02 — Supported Languages

## 2.1 Language List

| Language | Extension(s) | Status |
|---|---|---|
| C | `.c`, `.h` | Supported |
| C++ | `.cpp`, `.cc`, `.cxx`, `.hpp`, `.hh` | Supported |
| Python | `.py` | Supported |
| Rust | `.rs` | Supported |
| TypeScript | `.ts`, `.tsx` | Supported |
| JavaScript | `.js`, `.jsx` | Supported (via tsserver, best-effort) |

## 2.2 Capability Matrix

| Language | Call Graph | File Deps | Component Deps |
|---|---|---|---|
| C | ✅ | ✅ | ✅ (CMake / Meson / heuristic) |
| C++ | ✅ | ✅ | ✅ (CMake / Meson / heuristic) |
| Python | ✅ | ✅ | ⚠️ heuristic |
| Rust | ✅ | ✅ | ✅ (cargo metadata) |
| TypeScript | ✅ | ✅ | ✅ (tsconfig references) |
| JavaScript | ✅ | ✅ | ⚠️ package.json only |

⚠️ = partial support, best-effort, lower confidence

## 2.3 Language Detection

Language is detected from:
1. VSCode `TextDocument.languageId` (primary)
2. File extension (fallback)

Do not rely on file extension alone — `.h` files may be C or C++.
Use `languageId` first; fall back to extension if `languageId` is ambiguous.
