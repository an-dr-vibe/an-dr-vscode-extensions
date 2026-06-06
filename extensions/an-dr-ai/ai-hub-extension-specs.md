# an-dr-ai VS Code Extension — Specs

## Overview

A VS Code extension that detects installed AI CLIs on the machine and exposes a unified API for other extensions to consume. No API keys managed by the hub. No binary downloads. Auth is the user's responsibility via their installed CLI.

---

## CLI Support

| CLI | Command | Detection |
|---|---|---|
| Claude | `claude` | `which claude` / `where claude` |
| GitHub Copilot | `gh copilot` | `which gh` + `gh copilot --version` |
| OpenAI Codex | `codex` | `which codex` |

Detection runs on extension activation. First available CLI in priority order is used as default. User can override via settings.

---

## Commands

All commands are exposed via `vscode.commands.registerCommand` and accessible from Command Palette.

### 1. Explain Selection
- **ID:** `an-dr-ai.explainSelection`
- **Input:** Active editor text selection
- **Output:** VS Code Output Channel (`AI Hub`)
- **Prompt:** `"Explain this code briefly and clearly:"`
- **Error:** Notification if no text selected

### 2. Generate Commit Message
- **ID:** `an-dr-ai.generateCommitMessage`
- **Input:** `git diff --staged` output
- **Output:** Fills SCM input box (`vscode.scm`)
- **Prompt:** `"Write a conventional commit message for this diff. One line only. No explanation."`
- **Error:** Notification if nothing staged

### 3. Explain Commit
- **ID:** `an-dr-ai.explainCommit`
- **Input:** `git diff --staged` output
- **Output:** VS Code Output Channel (`AI Hub`)
- **Prompt:** `"Explain what this diff does, why it matters, and what the intended behavior change is."`
- **Error:** Notification if nothing staged

### 4. Find Flaws in Commit
- **ID:** `an-dr-ai.findFlaws`
- **Input:** `git diff --staged` output
- **Output:** VS Code Output Channel (`AI Hub`)
- **Prompt:** *(see Prompt Templates section)*
- **Error:** Notification if nothing staged

### 5. Review File
- **ID:** `an-dr-ai.reviewFile`
- **Input:** Full content of active editor file
- **Output:** VS Code Output Channel (`AI Hub`)
- **Prompt:** *(see Prompt Templates section)*
- **Error:** Notification if no active editor

### 6. Ask About Selection
- **ID:** `an-dr-ai.askSelection`
- **Input:** Active editor text selection + user question via `vscode.window.showInputBox`
- **Output:** VS Code Output Channel (`AI Hub`)
- **Prompt:** `"Given this code: <selection>\n\nAnswer this question: <user question>"`
- **Error:** Notification if no text selected or question empty

---

## Prompt Templates

Stored as user-editable settings. Defaults below.

### Find Flaws (`an-dr-ai.prompts.findFlaws`)
```
You are a senior code reviewer. Review this diff for:
- Logic errors and edge cases
- Security issues (injection, auth, data exposure)
- Breaking changes not obvious from the diff
- Missing error handling
- Test coverage gaps
- Anything that will cause pain in 3 months

Be blunt. No praise. Flag unknowns explicitly.
```

### Review File (`an-dr-ai.prompts.reviewFile`)
```
You are a senior code reviewer. Review this file for:
- Architecture and structural issues
- Security vulnerabilities
- Dead code or unnecessary complexity
- Missing error handling
- Anything that should be refactored before this goes to production

Be blunt. No praise. Flag unknowns explicitly.
```

---

## Extension Settings

```json
{
  "an-dr-ai.preferredCli": {
    "type": "string",
    "enum": ["auto", "claude", "codex", "gh-copilot"],
    "default": "auto",
    "description": "Preferred CLI to use. Auto selects first available."
  },
  "an-dr-ai.prompts.findFlaws": {
    "type": "string",
    "default": "<see defaults above>",
    "description": "System prompt for Find Flaws command."
  },
  "an-dr-ai.prompts.reviewFile": {
    "type": "string",
    "default": "<see defaults above>",
    "description": "System prompt for Review File command."
  },
  "an-dr-ai.outputChannel": {
    "type": "string",
    "default": "an-dr-ai",
    "description": "Name of the VS Code output channel."
  }
}
```

---

## Public Extension API (Hub Exports)

Other extensions consume this via `vscode.extensions.getExtension`.

```typescript
export interface AnDrAiApi {
  /** Run a prompt with optional stdin. Returns full stdout as string. */
  runPrompt(prompt: string, stdin?: string): Promise<string>;

  /** Check if any CLI is available and ready. */
  isAvailable(): boolean;

  /** Return the name of the currently active CLI. */
  getActiveCli(): 'claude' | 'codex' | 'gh-copilot' | null;
}
```

### Consumer Usage Example

```typescript
const hubExt = vscode.extensions.getExtension<AnDrAiApi>('author.an-dr-ai');
if (!hubExt) {
  vscode.window.showErrorMessage('an-dr-ai extension not installed.');
  return;
}
const hub = hubExt.isActive ? hubExt.exports : await hubExt.activate();
const result = await hub.runPrompt('Summarize this', myCode);
```

### Activation Order Handling

Hub must handle consumers activating before hub. Recommended: hub sets `activationEvents: ["*"]` and consumers use `await hubExt.activate()` defensively.

---

## Internal Architecture

```
activation
  └── detectClis()          // probe PATH for each CLI
  └── registerCommands()    // register all 6 commands
  └── return AiHubApi       // export public interface

spawnCli(prompt, stdin?)
  └── resolve active CLI binary
  └── spawn process with -p flag (print/non-interactive mode)
  └── pipe stdin if provided
  └── collect stdout
  └── return as string

getGitDiff()
  └── spawn git diff --staged
  └── return stdout string
  └── throw if empty (nothing staged)
```

---

## CLI Invocation Pattern

```bash
# Explanation / review / ask
echo "<stdin>" | claude -p "<prompt>"

# Commit message (no stdin needed if piped)
git diff --staged | claude -p "<prompt>"
```

All CLIs must be called in **non-interactive / print mode**. Interactive mode hangs the subprocess.

| CLI | Print flag |
|---|---|
| `claude` | `-p` or `--print` |
| `codex` | `--quiet` (verify on target machine) |
| `gh copilot` | `suggest -t shell` (limited, may not fit all uses) |

---

## Error Handling

| Scenario | Behavior |
|---|---|
| No CLI detected | Error notification on activation + all commands disabled |
| Nothing selected | Warning notification, command aborts |
| Nothing staged | Warning notification, command aborts |
| CLI process exits non-zero | Error shown in output channel with exit code |
| CLI not in PATH at command time | Re-run detection, show error if still missing |

---

## Out of Scope (v1)

- Streaming output (collect full response, then display)
- Multi-CLI fallback per command
- Inline decorations or CodeLens
- Chat history or multi-turn conversations
- Any API key management
- Windows support (Linux/macOS first)
