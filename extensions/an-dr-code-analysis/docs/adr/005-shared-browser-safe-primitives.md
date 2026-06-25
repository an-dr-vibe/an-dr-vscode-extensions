# ADR-005: Shared Browser-Safe Primitives

## Problem

The webview imported pure helpers from `src/`, including graph positioning and
node double-click action resolution. That blurred the runtime boundary between
browser code and VS Code extension-host code, making future imports from
VS Code-only modules easier to introduce accidentally.

## Decision

Move browser-safe pure helpers into `shared/`:

- `shared/graph/positionEngine.ts`
- `shared/protocol/nodeActions.ts`

Webview code and tests import these helpers from `shared/`. Extension-host
folders remain reserved for VS Code adapters, application services, analyzers,
cache, tools, and configuration.

## Rationale

The moved modules have no VS Code dependency and are safe to bundle into the
webview. Establishing `shared/` with small pure modules creates the runtime
boundary before moving larger graph and message contracts.

## Rejected alternatives

- Leave webview imports pointing into `src/`: rejected because it keeps the
  browser/extension boundary unclear.
- Move every shared contract in one increment: rejected because graph and
  message type migration touches many more files and should be verified
  separately.
- Keep wrapper re-exports under `src/`: rejected for these modules because no
  extension-host runtime code uses them.
