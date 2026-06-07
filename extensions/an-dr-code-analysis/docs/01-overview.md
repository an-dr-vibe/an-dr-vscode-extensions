# 01 — Overview

## 1.1 Purpose

`an-dr-code-analysis` is a VSCode extension for **code comprehension**, not editing.
Its goal is to answer: *"What is happening in this codebase?"* without requiring the
developer to read every file manually.

It produces three types of visual graph analysis:
- **Call Graph** — who calls what around a selected function
- **File Dependencies** — what a file depends on and who depends on it
- **Component Dependencies** — high-level module/target relationships across the project

## 1.2 Target Users

- Embedded software engineers (primary)
- Any developer working in C, C++, Python, Rust, TypeScript, or JavaScript
- Engineers onboarding to unfamiliar codebases
- Tech leads doing architecture reviews

Assumed environment:
- VSCode as primary editor
- Local development (not cloud/remote-only)
- Projects may include cross-compilation toolchains (ARM, RISC-V)
- Security-critical codebases where sending code to external services requires explicit consent

## 1.3 Scope

In scope:
- Static analysis of local source files
- Call graph visualization (function-level)
- File dependency visualization (module-level)
- Component dependency visualization (architecture-level)
- Sidepanel UI with inline graph rendering
- Multi-language support: C, C++, Python, Rust, TypeScript, JavaScript
- Deterministic local tool integration
- AI fallback via companion extension (opt-in, explicit)

## 1.4 Out of Scope

- Code editing or refactoring
- Documentation generation (no Doxygen dependency)
- Runtime analysis or profiling
- Remote/cloud analysis without explicit user consent
- AI provider management (handled by companion extension)
- Building or compiling the user's project
- Test coverage or metrics
