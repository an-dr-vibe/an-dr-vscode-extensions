# an-dr VSCode Extensions

Personal VS Code extension pack. Each extension lives under `extensions/` and is
junctioned into `~/.vscode/extensions/` via `install.ps1` — no packaging, no marketplace,
no admin rights needed.

---

## Extensions

### an-dr: View in Git Tool

Opens the current repo in a git GUI tool from the status bar.

**Config** (`gitTool.*`):

| Setting | Default | Description |
|---------|---------|-------------|
| `tool` | `"smartgit"` | Which tool to open (`smartgit`, `gitkraken`, `sourcetree`, `fork`, `tower`, `github-desktop`, `sublime-merge`, `gitextensions`, `gitk`, `git-gui`) |
| `toolPath` | `""` | Absolute path to executable. Empty = auto-detect. |
| `showStatusBar` | `true` | Show/hide the status bar button. |
| `statusBarIconOnly` | `false` | Show icon only, no tool name. |
| `statusBarAlignment` | `"right"` | `"left"` or `"right"`. |
| `statusBarPriority` | `99` | Higher = further from center. |

Tool discovery order: PATH → common install paths → directory search (handles versioned dirs).

---

### an-dr: View Online

Opens the current file (and optionally line / selection) on GitHub, GitLab, or Bitbucket.
Platform and remote URL are auto-detected from git.

**Config** (`viewOnline.*`):

| Setting | Default | Description |
|---------|---------|-------------|
| `remote` | `"origin"` | Git remote to use. |
| `defaultBranch` | `"main"` | Fallback branch name. |
| `openTarget` | `"browser"` | `"browser"`, `"clipboard"`, or `"both"`. |
| `showStatusBar` | `true` | Show/hide the status bar button. |
| `statusBarIconOnly` | `false` | Show icon only, no platform name. |
| `includeLineOnClick` | `true` | Include current line in URL on click. |
| `useSelectionRange` | `true` | Use start–end range when text is selected. |
| `customHostMap` | `{}` | Map custom hosts to base URLs (self-hosted GitLab etc.). |
| `statusBarAlignment` | `"right"` | `"left"` or `"right"`. |
| `statusBarPriority` | `100` | Higher = further from center. |

---

### an-dr: Extension Control

Manages the extensions repo from inside VS Code — pull updates, rebuild, and reload without touching a terminal.

Auto-detects the repo root by resolving the NTFS junction / symlink from `~/.vscode/extensions/an-dr-*` back to the source. Falls back to `~/.vscode-an-dr`.

**Commands** (Ctrl+Shift+P → `an-dr`):

- `Extension Control: Pull & Reload` — `git pull`, rebuild all extensions, offer window reload
- `Extension Control: Check for Updates` — `git fetch` and report commits behind; offers Pull & Reload
- `Extension Control: Rebuild All Extensions` — Run `install.ps1` in a terminal (npm install + tsc + re-link)
- `Extension Control: Open Repo in New Window` — Open the repo folder as a workspace in a new VS Code window
- `Extension Control: Show Repo Path` — Display the detected repo path; copy or open from the notification

**Config** (`extensionControl.*`):

| Setting     | Default | Description                              |
|-------------|---------|------------------------------------------|
| `repoPath`  | `""`    | Override auto-detected repo root path.   |

---

## Install

### One-liner (fresh machine or update)

Clones the repo into `~/.vscode-an-dr` (or pulls if already cloned), then installs all extensions. Requires `git`, `node`, and `pwsh` (PowerShell Core).

**Windows** — PowerShell / pwsh:

```powershell
iex (iwr 'https://raw.githubusercontent.com/an-dr/an-dr-vscode-extensions/main/bootstrap.ps1').Content
```

**Linux / macOS** — any shell:

```bash
pwsh -c "iex (iwr 'https://raw.githubusercontent.com/an-dr/an-dr-vscode-extensions/main/bootstrap.ps1').Content"
```

### Manual (if repo is already cloned)

```powershell
# Windows (PowerShell 5+ or pwsh)
.\install.ps1            # npm install + compile + link each extension
.\install.ps1 -SkipBuild # skip build, link only

# Linux / macOS
pwsh install.ps1
pwsh install.ps1 -SkipBuild
```

Then **Ctrl+Shift+P** → `Developer: Reload Window` in VS Code.

- **Windows**: creates NTFS junctions — no admin rights needed.
- **Linux/macOS**: creates symlinks — no admin rights needed.
