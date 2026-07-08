# ADR-001: Grouped graph layout
## Problem
Code-analysis graphs become hard to scan when functions from many files are shown as one flat node cloud. Users need file and folder context without losing the existing node interactions, D3 rendering, and layout switching.

## Decision
Add a grouped graph layout as a pure webview layout engine that builds compressed file/folder frames from node `filePath` values, positions nodes inside file frames with D3 force simulation, and positions file frames with a second D3 force simulation. The renderer will consume the resulting node positions and frame bounds, while fold state remains a renderer concern.

## Rationale
Keeping grouping in a pure layout module makes path compression, frame membership, and frame bounds unit-testable without DOM setup. Two smaller force passes are easier to reason about than one global force simulation with custom containment constraints. Keeping fold state in the renderer avoids rewriting the graph model and keeps grouped-frame folding separate from the existing sidebar tree collapse.

## Rejected alternatives
A single global force simulation with group constraints was rejected because it would mix layout, containment, and collision behavior in one hard-to-test loop. Reusing the existing sidebar tree collapse was rejected because it replaces graph nodes with folder nodes, while grouped layout needs to preserve original nodes and reroute only the drawn edges. A non-D3 custom force implementation was rejected because this extension already bundles D3 for the current renderer.
