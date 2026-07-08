# ADR-002: Graph layout strategies
## Problem
`D3Renderer` and `BaseGraphRenderer` had started to own layout selection even though most of that logic is not specific to SVG drawing or DOM event binding. Grouped layout also lived in the renderer folder, which made graph layout code look like renderer code.

## Decision
Move grouped layout and layout strategy dispatch into `webview-src/graph-layouts/`. Keep `src/graph/positionEngine.ts` as the pure primitive positioning layer shared by webview layouts. Renderers pass renderer-specific dependencies, such as the D3 force callback, into the strategy resolver and receive positions plus optional grouped-frame data.

Grouped layout receives the workspace root through the graph payload. It renders paths inside that root relative to the workspace and places absolute paths outside that root under an `external/` group.

## Rationale
This keeps graph layout dispatch out of renderer code while preventing D3 from leaking into extension-side `src/graph` modules. The force-directed strategy still uses a renderer-supplied callback because its implementation depends on the D3 runtime already used by the webview. Returning optional grouped-frame data from the strategy result avoids special layout branches in renderers while preserving fold and edge-routing state in the renderer base class.

## Rejected alternatives
Keeping grouped layout under `webview-src/graph-renderers` was rejected because the module is not renderer-specific. Moving D3-backed layout code into `src/graph` was rejected because it would make extension-side graph modules depend directly on the webview layout runtime. Replacing the existing position functions with a larger class hierarchy was rejected because the current algorithms are pure functions and only need a small dispatch layer.
