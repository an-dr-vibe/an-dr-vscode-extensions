# ADR-002: Retain esbuild, Vitest, and oxlint for the MIT transition

## Problem

The MIT staging extension already uses esbuild to bundle browser modules,
Vitest for its backend, extension, and webview contracts, and oxlint/oxfmt for
the imported codebase. The repository convention normally favours plain `tsc`
without a bundler or test framework.

## Decision

Retain esbuild, Vitest, oxlint, and oxfmt throughout the transition. Browser
code moves to `web/` while remaining an esbuild entry point; it does not adopt
the separate Commits bundling pipeline.

## Rationale

Keeping the established MIT toolchain limits the transition to independently
authored adapters and source-location changes. It also preserves executable
tests around the imported graph implementation instead of introducing a second
build and test architecture during compatibility work.

## Rejected alternatives

- Replace esbuild with the current Commits concatenate-and-uglify pipeline:
  this expands the migration and couples it to restricted implementation
  structure.
- Replace Vitest with ad-hoc tests: this removes the existing contract suite
  without improving the final extension.
- Replace oxlint/oxfmt with ESLint during the transition: this is a tooling
  migration unrelated to public compatibility.
