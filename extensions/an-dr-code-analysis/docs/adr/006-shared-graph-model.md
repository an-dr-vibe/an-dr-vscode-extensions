# ADR-006: Shared Graph Model

## Problem

Graph payload types lived under `src/graph`, which made them look like
extension-host implementation details even though analyzers, webview messages,
tests, and browser-safe helpers all depend on the same graph contract.

## Decision

Move `GraphModel.ts` to `shared/graph/GraphModel.ts` and update extension-host
imports to use the shared contract directly. The extension TypeScript root now
includes both `src/` and `shared/` so shared contracts are compiled and checked
with the extension.

## Rationale

The graph model is a runtime-neutral data contract. Moving it to `shared/`
clarifies dependency direction and prepares the next step: moving the webview
message protocol to the same shared boundary.

## Rejected alternatives

- Keep graph contracts under `src/`: rejected because it preserves the
  extension-host ownership signal for shared payload data.
- Add `src/graph/GraphModel.ts` as a re-export wrapper: rejected because it
  keeps two import paths alive and delays cleanup.
- Move renderer-local layout metadata at the same time: rejected because those
  types are browser rendering details, not the extension payload contract.
