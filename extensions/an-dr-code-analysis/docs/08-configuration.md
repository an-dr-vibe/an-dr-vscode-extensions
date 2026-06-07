# 08 — Configuration

## 8.1 Settings Reference

All settings under the `an-dr-code-analysis` namespace.

### Analysis

| Key | Type | Default | Description |
|---|---|---|---|
| `analysis.callGraph.depth` | `number` | `2` | Default call graph depth (both directions) |
| `analysis.callGraph.hideExternal` | `boolean` | `true` | Hide stdlib/external symbols in call graph |
| `analysis.fileDeps.depth` | `number` | `2` | Default file dependency depth |
| `analysis.fileDeps.hideExternal` | `boolean` | `true` | Hide stdlib/external file dependencies |
| `analysis.componentDeps.hideExternal` | `boolean` | `false` | Hide external packages in component graph |
| `analysis.maxDepth` | `number` | `5` | Hard cap on depth (sidebar); expanded view uses `8` |

### Tools

| Key | Type | Default | Description |
|---|---|---|---|
| `tools.clangdPath` | `string` | `""` | Override clangd binary path. Empty = auto-detect from PATH |
| `tools.rustAnalyzerPath` | `string` | `""` | Override rust-analyzer binary path |
| `tools.ctagsPath` | `string` | `""` | Override ctags binary path |
| `tools.cscopePath` | `string` | `""` | Override cscope binary path |
| `tools.compileCommandsPath` | `string` | `""` | Override compile_commands.json path. Empty = search standard locations |
| `tools.fallbackTool` | `"auto" \| "cscope" \| "ctags"` | `"auto"` | Force a specific fallback tool instead of auto-selection |

### clangd

| Key | Type | Default | Description |
|---|---|---|---|
| `clangd.fallbackFlags` | `string[]` | `[]` | Extra compiler flags passed to clangd when compile_commands.json is missing |
| `clangd.warnOnMissingCompileCommands` | `boolean` | `true` | Show warning when compile_commands.json is not found |
| `clangd.autoOfferRecovery` | `boolean` | `true` | Offer recovery actions (generate compile_commands, .clangd) when clangd fails |

### AI

| Key | Type | Default | Description |
|---|---|---|---|
| `ai.enabled` | `boolean` | `false` | Enable AI fallback. Must be explicitly set to true |
| `ai.requireConfirmation` | `boolean` | `true` | Show confirmation dialog before sending code to AI |
| `ai.extensionId` | `string` | `"andrei.ai-extension"` | VSCode extension ID of the AI companion extension |

### UI

| Key | Type | Default | Description |
|---|---|---|---|
| `ui.graphLayout.callGraph` | `"radial" \| "hierarchical"` | `"radial"` | Layout for call graph in sidebar |
| `ui.graphLayout.fileDeps` | `"force" \| "hierarchical"` | `"force"` | Layout for file dependency graph |
| `ui.graphLayout.componentDeps` | `"force" \| "hierarchical"` | `"hierarchical"` | Layout for component dependency graph |
| `ui.showConfidenceBadge` | `boolean` | `true` | Show tool confidence badge below graph |
| `ui.nodeLabel.maxLength.sidebar` | `number` | `15` | Max node label characters in sidebar graph |
| `ui.nodeLabel.maxLength.expanded` | `number` | `25` | Max node label characters in expanded graph |

## 8.2 Standard compile_commands.json Search Locations

When `tools.compileCommandsPath` is empty, search in order:

1. `{workspaceRoot}/compile_commands.json`
2. `{workspaceRoot}/build/compile_commands.json`
3. `{workspaceRoot}/out/compile_commands.json`
4. `{workspaceRoot}/cmake-build-*/compile_commands.json` (CLion default)
5. `{workspaceRoot}/.vscode/compile_commands.json`

Use the first one found. If multiple exist, use the newest by mtime and warn the user.

## 8.3 package.json contributes.configuration Block

```json
"contributes": {
  "configuration": {
    "title": "An-Dr Code Analysis",
    "properties": {
      "an-dr-code-analysis.analysis.callGraph.depth": {
        "type": "number",
        "default": 2,
        "minimum": 1,
        "maximum": 8,
        "description": "Default call graph depth in both directions"
      },
      "an-dr-code-analysis.ai.enabled": {
        "type": "boolean",
        "default": false,
        "description": "Enable AI fallback when all local tools fail. Requires companion extension."
      },
      "an-dr-code-analysis.ai.requireConfirmation": {
        "type": "boolean",
        "default": true,
        "description": "Show confirmation dialog before sending code to AI for analysis"
      }
    }
  }
}
```

(Full property list follows the settings table in 8.1 — abbreviated here for clarity.)
