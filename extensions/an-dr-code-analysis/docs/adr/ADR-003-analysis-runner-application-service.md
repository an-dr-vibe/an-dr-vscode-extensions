# ADR-003: Analysis Runner Application Service

## Problem

`SidepanelProvider` and `FullTabPanel` both implemented the same graph analysis
workflow: clamp depth, check cache, create an abort controller, build the analyzer
chain, run fallback analyzers, store the first result, and post error/cancel
states. That duplicated application behavior inside VS Code UI adapters and made
future changes easy to apply to one surface but miss in the other.

## Decision

Introduce `src/application/AnalysisRunner.ts` as the application-layer use case
for graph analysis orchestration. UI adapters pass the current context and
translate runner events into webview messages; the runner owns cache,
cancellation, fallback analyzer execution, and analysis outcome decisions.

## Rationale

This keeps VS Code adapters focused on message routing and webview integration.
It gives analysis behavior a single testable boundary and reduces duplication
without changing analyzer implementations or the webview protocol. The runner
uses small ports for the analyzer chain and cache so focused tests do not need
to construct webviews or VS Code provider objects.

## Rejected alternatives

- Keep duplicated provider logic: rejected because it preserves the DRY and SRP
  issue identified in the architecture review.
- Create a generic message bus first: rejected because the immediate duplication
  is analysis orchestration, and a message bus would increase scope before the
  use-case boundary is stable.
- Move analyzers and graph contracts at the same time: rejected because that is
  a larger runtime-boundary change and belongs in a later increment.
