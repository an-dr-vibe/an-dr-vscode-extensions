# ADR-001: Use neo-git-graph as the MIT source baseline

## Problem

The existing Commits extension cannot be used as a distributable source
baseline because its provenance includes a Git Graph lineage after that
project's MIT era.

## Decision

an-dr-com-mit-s derives from the current MIT-licensed neo-git-graph source,
with its upstream license and provenance notice preserved. It uses its own
extension ID, commands, configuration namespace, and virtual-document scheme.

## Rationale

neo-git-graph provides the graph, repository selection, commit details, and
Git actions required for a functional replacement while retaining an auditable
MIT license. An independent namespace allows it to run beside both neo-git-graph
and an-dr-commits without state or command collisions.

## Rejected alternatives

- Reuse an-dr-commits source: its provenance is unsuitable for this distributable baseline.
- Use modern vscode-git-graph source: its current license is not MIT.
- Reimplement the graph from scratch: it would substantially delay a compatible result.
