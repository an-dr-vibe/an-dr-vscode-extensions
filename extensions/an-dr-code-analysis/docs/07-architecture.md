# 07 — Architecture

## 7.1 Extension Structure

```
an-dr-code-analysis/
├── package.json
├── tsconfig.json
├── webpack.config.js           # bundles extension + webview separately
├── src/
│   ├── extension.ts            # activation, command registration, lifecycle
│   ├── SidepanelProvider.ts    # WebviewViewProvider implementation
│   │
│   ├── analyzers/
│   │   ├── IAnalyzer.ts        # base analyzer interface
│   │   ├── IAiAnalyzer.ts      # AI analyzer interface
│   │   ├── AnalyzerFactory.ts  # selects best available tool per language+task
│   │   ├── lsp/
│   │   │   ├── LspAnalyzer.ts  # clangd, rust-analyzer, tsserver
│   │   │   └── LspClient.ts    # LSP protocol helpers
│   │   ├── cli/
│   │   │   ├── CtagsAnalyzer.ts
│   │   │   ├── CscopeAnalyzer.ts
│   │   │   ├── CargoAnalyzer.ts
│   │   │   ├── Pyan3Analyzer.ts
│   │   │   └── CmakeAnalyzer.ts
│   │   ├── heuristic/
│   │   │   ├── RegexAnalyzer.ts
│   │   │   └── AstWalkAnalyzer.ts
│   │   └── ai/
│   │       └── ExternalExtensionAnalyzer.ts
│   │
│   ├── graph/
│   │   ├── GraphModel.ts       # node/edge types
│   │   ├── GraphBuilder.ts     # normalizes analyzer output → GraphModel
│   │   └── GraphLayout.ts      # layout hints per graph type + view mode
│   │
│   ├── tools/
│   │   ├── ToolRegistry.ts     # detects installed tools, reports health
│   │   ├── ClangdHealth.ts     # clangd-specific health checks
│   │   └── RecoveryActions.ts  # generate compile_commands, .clangd, etc.
│   │
│   ├── context/
│   │   └── ContextTracker.ts   # tracks active file + symbol from editor events
│   │
│   ├── cache/
│   │   └── AnalysisCache.ts    # mtime-based cache, FileSystemWatcher invalidation
│   │
│   ├── webview/
│   │   ├── messages.ts         # shared message types (Extension ↔ Webview)
│   │   └── webviewHtml.ts      # generates CSP-safe HTML for WebviewView
│   │
│   └── config/
│       └── Settings.ts         # typed settings accessors
│
└── webview-src/                # compiled separately by webpack
    ├── index.ts                # webview entry point
    ├── panel/
    │   ├── ContextSection.ts
    │   ├── AnalysisSection.ts
    │   ├── GraphSection.ts
    │   └── ToolsSection.ts
    └── graph/
        ├── CytoscapeRenderer.ts
        └── layouts.ts
```

## 7.2 IAnalyzer Interface

```typescript
type Language = 'c' | 'cpp' | 'python' | 'rust' | 'typescript' | 'javascript'
type GraphType = 'callGraph' | 'fileDeps' | 'componentDeps'

interface AnalysisRequest {
  graphType: GraphType
  language: Language
  filePath: string
  symbol?: string               // required for callGraph
  depth?: number                // default: 2
  workspaceRoot: string
}

interface AnalysisResult {
  graph: GraphModel
  tool: string                  // name of tool that produced this result
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
}

interface IAnalyzer {
  readonly toolName: string
  readonly supportedLanguages: Language[]
  readonly supportedGraphTypes: GraphType[]

  isAvailable(): Promise<boolean>
  analyze(request: AnalysisRequest): Promise<AnalysisResult>
}
```

## 7.3 IAiAnalyzer Interface

```typescript
interface IAiAnalyzer {
  isAvailable(): Promise<boolean>
  getCompanionExtensionId(): string

  analyze(
    request: AnalysisRequest,
    fileContent: string,
    nearbyFiles?: FileSnippet[]
  ): Promise<AiAnalysisResult>
}

interface AiAnalysisResult {
  graph: GraphModel
  confidence: 'low' | 'medium'
  warnings: string[]
  reasoning?: string
}
```

## 7.4 AnalyzerFactory

Selects the best available analyzer per language + graph type:

```typescript
class AnalyzerFactory {
  // Returns ordered list of analyzers to try, best first
  getChain(language: Language, graphType: GraphType): IAnalyzer[]
  
  // Returns AI analyzer if available and enabled
  getAiAnalyzer(): IAiAnalyzer | null
}
```

The factory reads `ToolRegistry` to know what is available.
The fallback chain is implemented in the caller (not inside analyzers).

## 7.5 GraphModel

```typescript
interface GraphModel {
  graphType: GraphType
  nodes: GraphNode[]
  edges: GraphEdge[]
  metadata: GraphMetadata
}

interface GraphNode {
  id: string                    // unique, format: "filepath::symbolName" or "filepath"
  label: string                 // display name (truncated in UI)
  fullName: string              // full qualified name
  filePath?: string             // source file, if known
  lineNumber?: number           // line number in source file
  type: NodeType
}

type NodeType =
  | 'target'      // the selected function/file/component
  | 'caller'      // calls the target (call graph)
  | 'callee'      // called by the target (call graph)
  | 'dependency'  // imported by target (file/component deps)
  | 'dependent'   // imports the target (file/component deps)
  | 'external'    // stdlib or third-party
  | 'component'   // architectural component node

interface GraphEdge {
  id: string
  source: string                // node id
  target: string                // node id
  type: 'call' | 'import' | 'depends'
  external: boolean
}

interface GraphMetadata {
  tool: string
  confidence: 'high' | 'medium' | 'low' | 'ai'
  generatedAt: number           // timestamp
  warnings: string[]
  rootNodeId: string            // id of the target/center node
}
```

## 7.6 Webview Message Protocol

All messages are typed. No untyped `postMessage` calls.

### Extension → Webview

```typescript
type ExtensionMessage =
  | { type: 'contextUpdate'; symbol: string; file: string; lang: Language }
  | { type: 'analysisStart'; graphType: GraphType }
  | { type: 'analysisResult'; graphType: GraphType; data: GraphModel }
  | { type: 'analysisError'; graphType: GraphType; message: string; recoveryActions?: RecoveryAction[] }
  | { type: 'toolsStatus'; tools: ToolStatus[] }
  | { type: 'aiConfirmationRequired'; payload: AiConfirmationPayload }
```

### Webview → Extension

```typescript
type WebviewMessage =
  | { type: 'ready' }
  | { type: 'requestAnalysis'; graphType: GraphType }
  | { type: 'nodeClick'; nodeId: string; graphType: GraphType }
  | { type: 'nodeDoubleClick'; nodeId: string; filePath: string; lineNumber?: number }
  | { type: 'depthChange'; depth: number }
  | { type: 'pinToggle'; pinned: boolean }
  | { type: 'expandGraph'; graphType: GraphType }
  | { type: 'aiConfirmed' }
  | { type: 'aiCancelled' }
```

```typescript
interface ToolStatus {
  name: string
  health: 'ok' | 'degraded' | 'missing'
  version?: string
  reason?: string               // why it's degraded
}

interface RecoveryAction {
  label: string                 // button label
  command: string               // VSCode command to execute
}

interface AiConfirmationPayload {
  reason: string                // why local tools failed
  filesBeingSent: { name: string; sizeBytes: number }[]
  companionExtensionName: string
  usesRemoteApi: boolean
}
```

## 7.7 ContextTracker

```typescript
class ContextTracker {
  // Subscribe to editor events
  activate(context: vscode.ExtensionContext): void

  // Current tracked state
  getCurrentContext(): EditorContext

  // Pin management
  pin(): void
  unpin(): void
  isPinned(): boolean

  // Events
  onContextChange: vscode.Event<EditorContext>
}

interface EditorContext {
  filePath: string
  language: Language
  symbol?: string               // resolved via LSP hover or regex
  symbolLine?: number
}
```

## 7.8 AnalysisCache

```typescript
class AnalysisCache {
  // Returns cached result or null
  get(request: AnalysisRequest): AnalysisResult | null

  // Store result
  set(request: AnalysisRequest, result: AnalysisResult): void

  // Invalidate by file (called by FileSystemWatcher)
  invalidate(filePath: string): void

  // Invalidate all
  clear(): void
}
```

Cache key: `{filePath}:{symbol}:{graphType}:{depth}:{tool}`
Invalidation: watch `CMakeLists.txt`, `meson.build`, `Cargo.toml`, `package.json`, `tsconfig.json`,
`compile_commands.json` for changes → clear affected entries.

## 7.9 SidepanelProvider

```typescript
class SidepanelProvider implements vscode.WebviewViewProvider {
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void

  // Called by ContextTracker
  updateContext(ctx: EditorContext): void

  // Called by analysis pipeline
  sendResult(result: AnalysisResult): void
  sendError(graphType: GraphType, message: string, actions?: RecoveryAction[]): void
  sendLoading(graphType: GraphType): void
}
```

CSP policy for webview:
```
default-src 'none';
script-src 'nonce-{nonce}';
style-src {webview.cspSource} 'unsafe-inline';
img-src {webview.cspSource} data:;
```

All local resource URIs must use `webview.asWebviewUri()`.
