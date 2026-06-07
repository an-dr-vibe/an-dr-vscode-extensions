# 06 — Sidepanel UI

## 6.1 Panel Registration

The extension registers a single `WebviewView` in the Activity Bar.

```json
"contributes": {
  "viewsContainers": {
    "activitybar": [{
      "id": "an-dr-code-analysis",
      "title": "Code Analysis",
      "icon": "$(graph)"
    }]
  },
  "views": {
    "an-dr-code-analysis": [{
      "type": "webview",
      "id": "an-dr-code-analysis.panel",
      "name": "Code Analysis"
    }]
  }
}
```

The entire panel is a single `WebviewView`. Do not mix `TreeView` + `WebviewView`.
All sections are rendered inside the webview as HTML.

## 6.2 Panel Layout

```
┌─────────────────────────────┐
│ ▼ CONTEXT                   │
│   Symbol: myFunction()      │
│   File:   motor_ctrl.cpp    │
│   Lang:   C++  [📌 Pin]     │
├─────────────────────────────┤
│ ▼ ANALYSIS                  │
│  [⬡ Call Graph    ]         │
│  [⬡ File Deps     ]         │
│  [⬡ Component Deps]         │
├─────────────────────────────┤
│ ▼ GRAPH                     │
│   [graph type label] [🔗 ↗] │  ← expand to full tab
│  ┌───────────────────────┐  │
│  │                       │  │
│  │   Cytoscape graph     │  │
│  │                       │  │
│  └───────────────────────┘  │
│  🔎 depth [−][2][+] [reset] │
│  🟢 clangd                  │  ← confidence badge
├─────────────────────────────┤
│ ▼ TOOLS STATUS              │
│   ✅ clangd   ✅ ctags      │
│   ✅ cargo    ⚠️ pyan3      │
│   🤖 AI: linked             │
└─────────────────────────────┘
```

Sections are collapsible. Default state: all expanded except TOOLS STATUS (collapsed).

## 6.3 CONTEXT Section

### Content
- **Symbol**: name of function/symbol at cursor, or "—" if none detected
- **File**: active editor file name (relative to workspace root)
- **Lang**: detected language

### Updates
- Updates automatically on `onDidChangeActiveTextEditor`
- Updates symbol on `onDidChangeTextEditorSelection` (debounced 300ms)
- Symbol detection: use LSP hover (`textDocument/hover`) to resolve symbol at cursor
- If LSP unavailable: use word-boundary regex as fallback

### Pin Toggle
- 📌 Pin button: locks CONTEXT to current symbol/file
- While pinned: editor changes do not update CONTEXT
- Pinned state is visually distinct (pin icon filled, section header highlighted)
- Analysis buttons always operate on the pinned context when pinned

## 6.4 ANALYSIS Section

Three buttons, always visible:

| Button | Triggers | Requires |
|---|---|---|
| Call Graph | Call graph analysis on current symbol | Symbol in CONTEXT |
| File Deps | File dependency analysis on current file | File in CONTEXT |
| Component Deps | Component analysis on workspace root | Workspace open |

Button states:
- **Default**: enabled, icon + label
- **Loading**: spinner, label "Analyzing...", disabled
- **Disabled**: grayed, tooltip explains why (e.g. "No symbol at cursor")
- **Error**: red tint, tooltip with error summary

Only one analysis can run at a time. Starting a new analysis cancels the previous.

## 6.5 GRAPH Section

### Header
- Graph type label: "Call Graph", "File Dependencies", "Component Dependencies"
- Expand button (↗): opens graph in a full `WebviewPanel` editor tab
- Refresh button (↺): re-runs current analysis

### Graph Area
- Rendered by Cytoscape.js (bundled, no CDN)
- Minimum height: 200px
- Resizable: user can drag the section border
- Empty state: placeholder text "Run an analysis to see results"
- Loading state: spinner overlay

### Layout per Graph Type
- **Call Graph (sidebar)**: radial layout, selected function at center
- **Call Graph (expanded)**: hierarchical top-down, callers above, callees below
- **File Deps**: force-directed, active file at center
- **Component Deps**: hierarchical or force-directed depending on graph size

### Node Styling
- Selected/target node: larger, distinct color, bold label
- Caller nodes: one color family
- Callee nodes: different color family
- External nodes: muted/gray
- Labels: truncated at 15 chars in sidebar, 25 chars in expanded; full name in tooltip

### Edge Styling
- Directed arrows
- External edges: dashed
- Labels: omitted in sidebar, optional in expanded view

### Depth Controls
- `[−]` / `[+]` buttons adjust depth (min 1, max 5 in sidebar, max 8 in expanded)
- Depth number shown between buttons
- `[reset]` returns to default depth and re-runs analysis
- Depth change triggers re-analysis (debounced 500ms)

### Confidence Badge
- Shown below graph controls
- 🟢 `clangd` / `rust-analyzer` / `tsserver`
- 🟡 `cscope` / `ctags` / `pyan3` / `cargo metadata`
- 🔴 `regex` / heuristic
- 🤖 `AI (all local tools failed)`

### Node Interactions
- Single click: re-center graph on clicked node (new analysis)
- Double-click: jump to definition in editor
- Right-click: context menu with "Jump to Definition", "Copy Name", "Pin this symbol"
- Hover: tooltip with full name, file path, and any available metadata

## 6.6 TOOLS STATUS Section

Collapsible, collapsed by default.

### Content
Grid of tool name + status icon:

```
✅ clangd 14.0.0          ✅ rust-analyzer 2024-01
✅ cargo 1.75.0           ✅ tsserver (bundled)
✅ ctags 6.1.0            ⚠️ pyan3 (not found)
❌ cscope (not found)     ⚠️ cmake (not found)
🤖 AI: andrei.ai-ext ✅
```

Icons:
- ✅ = found and healthy
- ⚠️ = found but degraded / wrong version
- ❌ = not found (required tool missing)
- 🤖 = AI companion extension status

Clicking a ⚠️ or ❌ item shows a popover with:
- What the tool is used for
- How to install it
- Which capabilities are degraded without it

## 6.7 Expand to Full Tab

Clicking ↗ opens a `WebviewPanel` editor tab:
- Title: "Code Analysis — {graph type} — {symbol or file}"
- Full editor width available
- Same Cytoscape graph, wider layout, higher depth default
- Independent from sidebar — sidebar stays open and functional
- Expanded view has additional controls: export as PNG/SVG, filter panel

## 6.8 General UX Rules

- Never block the editor. All analysis is async with visible loading state.
- Never auto-trigger heavy analysis on cursor move. User initiates via buttons.
- Always show what tool produced the result.
- Always show a confidence level.
- Empty results ≠ error. Show "No results found" with the tool that was used.
- Cancellation: if analysis takes >10s, show a "Cancel" button.
- Context switching: if user changes file while analysis is running, do not auto-cancel —
  show a "Results are for {previous file}" notice and let user decide.
