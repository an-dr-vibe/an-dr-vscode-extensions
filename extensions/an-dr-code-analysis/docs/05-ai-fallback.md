# 05 — AI Fallback

## 5.1 Role of AI

AI is the **last level** of the fallback chain. It triggers only when all deterministic
local tools are exhausted or return empty results.

AI is **never** the primary analysis path.
AI is **never** triggered silently.
AI is **disabled by default**.

## 5.2 AI Provider

AI capability is **not implemented in this extension**.
It is provided by a companion extension (e.g. `andrei.ai-extension`) via
VSCode's `executeCommand` IPC mechanism.

This extension owns:
- The decision to invoke AI (fallback logic)
- The prompt content (what to ask)
- The result parsing (GraphModel extraction)
- The user confirmation flow

The companion extension owns:
- Model selection
- API key management
- Request transport
- Rate limiting / quota

## 5.3 Inter-Extension Contract

### Request

```typescript
interface AiAnalysisRequest {
  task: 'callGraph' | 'fileDeps' | 'componentDeps'
  language: 'c' | 'cpp' | 'python' | 'rust' | 'typescript' | 'javascript'
  fileContent?: string          // primary file content
  symbol?: string               // target function/symbol name (call graph only)
  nearbyFiles?: FileSnippet[]   // relevant headers/imports (optional, improves accuracy)
  projectSnapshot?: string[]    // directory tree, 2-3 levels (component deps)
  prompt: string                // full prompt string, owned by this extension
}

interface FileSnippet {
  path: string
  content: string
}
```

### Response

```typescript
interface AiAnalysisResponse {
  graphModel: GraphModel        // see 07-architecture.md for GraphModel definition
  confidence: 'low' | 'medium' // AI is never 'high'
  warnings: string[]           // e.g. "macro expansion not visible to static analysis"
  reasoning?: string           // AI explanation of its analysis (optional, shown in UI)
}
```

### IPC Call

```typescript
const response: AiAnalysisResponse = await vscode.commands.executeCommand(
  'andrei.ai-extension.analyze',
  request
)
```

### Availability Check

```typescript
function isAiAvailable(): boolean {
  const ext = vscode.extensions.getExtension(
    vscode.workspace.getConfiguration('an-dr-code-analysis').get('ai.extensionId')
  )
  return ext?.isActive ?? false
}
```

## 5.4 What Is Sent to AI per Task

### Call Graph

```
- fileContent: full content of the file containing the target symbol
- symbol: the function/method name
- nearbyFiles: direct includes/imports (content, not paths) up to 5 files
- prompt: see Section 5.5
```

### File Dependencies

```
- fileContent: full content of the active file
- projectSnapshot: directory listing (paths only, no content), 3 levels deep
- prompt: see Section 5.5
```

### Component Dependencies

```
- projectSnapshot: directory tree, 3 levels deep
- fileContent: content of CMakeLists.txt / Cargo.toml / package.json if present
- prompt: see Section 5.5
```

Keep payloads minimal. Never send entire project source trees.

## 5.5 Prompt Templates

Prompts are owned and versioned by this extension. They are passed verbatim to the
companion extension as the `prompt` field.

### Call Graph Prompt

```
Analyze the following {language} code and identify the call graph for the function "{symbol}".

Return a JSON object with this exact structure:
{
  "nodes": [
    { "id": "string", "label": "string", "file": "string", "type": "target|caller|callee|external" }
  ],
  "edges": [
    { "source": "string", "target": "string" }
  ]
}

Rules:
- "target" type = the function named "{symbol}"
- "caller" type = functions that call "{symbol}"
- "callee" type = functions called by "{symbol}"
- "external" type = stdlib or external library calls
- id must be unique per function (use "file::functionName" format)
- Return only JSON. No markdown. No explanation outside the JSON.
- If you are uncertain about a call relationship, omit it rather than guess.

Code:
{fileContent}

{nearbyFilesSection}
```

### File Dependencies Prompt

```
Analyze the following {language} file and identify all file dependencies (imports/includes).

Return a JSON object with this exact structure:
{
  "nodes": [
    { "id": "string", "label": "string", "type": "target|dependency|dependent|external" }
  ],
  "edges": [
    { "source": "string", "target": "string" }
  ]
}

Rules:
- "target" = the file being analyzed
- "dependency" = files this file imports/includes
- "external" = stdlib or third-party imports
- Use relative paths for file ids where possible
- Return only JSON. No markdown. No explanation.
- Only include imports that are statically resolvable. Omit dynamic imports.

File path: {filePath}
Project structure (paths only):
{projectSnapshot}

File content:
{fileContent}
```

### Component Dependencies Prompt

```
Analyze the following project structure and identify high-level component dependencies.

Return a JSON object with this exact structure:
{
  "nodes": [
    { "id": "string", "label": "string", "type": "component|external" }
  ],
  "edges": [
    { "source": "string", "target": "string" }
  ]
}

Rules:
- A component = a CMake target, Cargo crate, Python package, or tsconfig project
- "external" = third-party dependencies outside the project
- Return only JSON. No markdown. No explanation.
- If component boundaries are unclear, use top-level directories as components.

Build config:
{buildConfigContent}

Project structure:
{projectSnapshot}
```

## 5.6 User Confirmation Flow

Before invoking AI, always show a confirmation dialog:

```
┌────────────────────────────────────────────┐
│ ⚠️  All local tools exhausted              │
│                                            │
│ Reason: {specific failure reason}          │
│                                            │
│ AI analysis is available via {extName}.    │
│                                            │
│ Will send to AI:                           │
│   • {fileName} ({fileSize})                │
│   • {nearbyFiles count} header file(s)     │
│   • Project directory listing              │
│                                            │
│ No source code leaves your machine if      │
│ using a local model.                       │
│                                            │
│ [Run AI Analysis]        [Cancel]          │
└────────────────────────────────────────────┘
```

- Show exact files and sizes being sent
- If AI extension uses a remote API, state that explicitly
- Do not show this dialog if `ai.requireConfirmation` is `false`
- Never auto-proceed

## 5.7 Result Display

AI results are displayed identically to deterministic results, with:
- Confidence badge: `🤖 AI (all local tools failed)`
- Warning banner below graph: *"Results are inferred. Verify critical paths manually."*
- Optional reasoning panel: collapsible, shows AI's explanation if provided

## 5.8 Configuration

```json
"an-dr-code-analysis.ai.enabled": false,
"an-dr-code-analysis.ai.requireConfirmation": true,
"an-dr-code-analysis.ai.extensionId": "andrei.ai-extension"
```

`ai.enabled` = false means AI fallback is never triggered, even if companion extension
is available. User must explicitly enable it.
