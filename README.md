# an-dr VSCode Extensions

Personal VS Code extension pack. Each extension lives under `extensions/` and is
junctioned into `~/.vscode/extensions/` via `install.ps1` — no packaging, no marketplace,
no admin rights needed.

---

## Extensions

### an-dr: View in Git Tool

Opens the current repo in a git GUI tool from the status bar.

**Config** (`gitTool.*`):

|Setting|Default|Description|
|-------|-------|-----------|
|`tool`|`"smartgit"`|Which tool to open (`smartgit`, `gitkraken`, `sourcetree`, `fork`, `tower`, `github-desktop`, `sublime-merge`, `gitextensions`, `gitk`, `git-gui`)|
|`toolPath`|`""`|Absolute path to executable. Empty = auto-detect.|
|`showStatusBar`|`true`|Show/hide the status bar button.|
|`statusBarIconOnly`|`false`|Show icon only, no tool name.|
|`statusBarAlignment`|`"right"`|`"left"` or `"right"`.|
|`statusBarPriority`|`99`|Higher = further from center.|

Tool discovery order: PATH → common install paths → directory search (handles versioned dirs).

---

### an-dr: View Online

Opens the current file (and optionally line / selection) on GitHub, GitLab, or Bitbucket.
Platform and remote URL are auto-detected from git.

**Config** (`viewOnline.*`):

|Setting|Default|Description|
|-------|-------|-----------|
|`remote`|`"origin"`|Git remote to use.|
|`defaultBranch`|`"main"`|Fallback branch name.|
|`openTarget`|`"browser"`|`"browser"`, `"clipboard"`, or `"both"`.|
|`showStatusBar`|`true`|Show/hide the status bar button.|
|`statusBarIconOnly`|`false`|Show icon only, no platform name.|
|`includeLineOnClick`|`true`|Include current line in URL on click.|
|`useSelectionRange`|`true`|Use start–end range when text is selected.|
|`customHostMap`|`{}`|Map custom hosts to base URLs (self-hosted GitLab etc.).|
|`statusBarAlignment`|`"right"`|`"left"` or `"right"`.|
|`statusBarPriority`|`100`|Higher = further from center.|

---

### an-dr: Jira Link

Status bar button that detects Jira tickets from the current branch name, commits unique to the branch, and comments in the active file, then opens them in the browser.

Shows one ticket directly or a picker when multiple are found. The icon indicates where the ticket was detected: `$(git-branch)` branch name, `$(git-commit)` commit message, `$(file-code)` file comment.

**Config** (`jiraLink.*`):

|Setting|Default|Description|
|-------|-------|-----------|
|`domain`|`""`|Jira base URL, e.g. `https://mycompany.atlassian.net`|
|`projects`|`[]`|Project keys to match, e.g. `["PROJ", "APP"]`. Empty = any ALL-CAPS key.|
|`mainBranch`|`"main"`|Base branch for scoping commit detection.|
|`statusBarAlignment`|`"left"`|`"left"` or `"right"`.|
|`statusBarPriority`|`10`|Higher = further from center on its side.|

**Commands** (Ctrl+Shift+P → `an-dr`):

- `Jira Link: Open Ticket` — open the detected ticket (or pick from a list)
- `Jira Link: Refresh Detection` — force re-scan

---

### an-dr: Editor Selection

Status bar item showing the current cursor position and selection info, with quick actions to copy the file location or jump to a line.

**Status bar behavior:**

|State|Shows|
|-----|-----|
|No selection|`Ln 12, Col 5`|
|Single-line selection|`Ln 12, Col 5  (8 selected)`|
|Multi-line selection|`Ln 12, Col 5  (3 lines, 42 chars)`|

**Click** the text → copies `relative/path/to/file.ts:12` to the clipboard.

**`$(go-to-file)` button** (right next to the text) → opens the built-in Go to Line dialog.

**Config** (`editorSelection.*`):

|Setting|Default|Description|
|-------|-------|-----------|
|`cursorFormat`|`"Ln {line}, Col {col}"`|Format when no selection. Placeholders: `{line}`, `{col}`.|
|`selectionFormat`|`"Ln {line}, Col {col}  ({chars} selected)"`|Format for a single-line selection. Placeholders: `{line}`, `{col}`, `{chars}`.|
|`multilineFormat`|`"Ln {line}, Col {col}  ({selLines} lines, {chars} chars)"`|Format for a multi-line selection. Placeholders: `{line}`, `{col}`, `{chars}`, `{selLines}`.|
|`showGoToLineButton`|`true`|Show/hide the go-to-line button.|

**Commands** (Ctrl+Shift+P → `an-dr`):

- `Editor Selection: Copy Relative Path and Line` — copy `<relative-path>:<line>` to clipboard
- `Editor Selection: Go to Line` — open the Go to Line dialog

---

### an-dr: Extension Control

Manages the extensions repo from inside VS Code — pull updates, rebuild, and reload without touching a terminal.

Auto-detects the repo root by resolving the NTFS junction / symlink from `~/.vscode/extensions/an-dr-*` back to the source. Falls back to `~/.vscode-an-dr`.

**Commands** (Ctrl+Shift+P → `an-dr`):

- `Extension Control: Pull & Reload` — `git pull`, rebuild all extensions, offer window reload
- `Extension Control: Check for Updates` — `git fetch` and report commits behind; offers Pull & Reload
- `Extension Control: Rebuild All Extensions` — Run `install.ps1` in a terminal (npm install + tsc + re-link)
- `Extension Control: Reinstall All Extensions in Remote/Container` — package each extension as a `.vsix` and install it into the current remote/container via `code --install-extension` (useful when connected via Dev Containers or Remote SSH)
- `Extension Control: Open Repo in New Window` — Open the repo folder as a workspace in a new VS Code window
- `Extension Control: Show Repo Path` — Display the detected repo path; copy or open from the notification

**Config** (`extensionControl.*`):

|Setting|Default|Description|
|-------|-------|-----------|
|`repoPath`|`""`|Override auto-detected repo root path.|

---

### an-dr: UI Control

Keeps the Activity Bar layout consistent across machines. Stores visibility and order in `settings.json` so Settings Sync carries it everywhere. New extensions are automatically appended at the end as visible; hidden items stay hidden.

**How it works:**

1. On startup, scans all installed extensions for `viewsContainers.activitybar` contributions.
2. Merges newly found containers into the config (appended as visible).
3. Applies the config — hides items marked as not visible.
4. On subsequent machines, synced settings are applied on startup.

**Commands** (Ctrl+Shift+P → `an-dr`):

- `UI Control: Configure Activity Bar` — Open the drag-and-drop configuration panel
- `UI Control: Apply Layout Now` — Re-apply the saved config (show + hide)
- `UI Control: Scan for New Extensions` — Discover newly installed extensions and add them to the config

**Config** (`uiControl.*`):

|Setting|Default|Description|
|-------|-------|-----------|
|`activityBar`|`[]`|Ordered list of `{id, visible}` objects. Managed by the extension, but editable by hand.|
|`applyOnStartup`|`true`|Automatically hide items on startup.|
|`statusBarIconOnly`|`true`|Show only the icon in the status bar.|

**Status bar:** `$(layout-activitybar-left)` — click to open the configure panel.

---

### an-dr: Code Review

Combines inline review comments with a dedicated changed-files tree for branch review.
The tree supports comparing against branches, tags, and commits, with tree/list
view, filtering, checkboxes, base switching, and diff opening directly from the review sidebar.

**Config** (`codeReview.*`):

|Setting|Default|Description|
|-------|-------|-----------|
|`dataFile`|`"code-review/.code-review.json"`|Workspace-relative storage for inline review comments.|
|`showAuthor`|`false`|Include author names in comments and exports.|
|`author`|`""`|Author override for comment/export metadata.|
|`autoRefresh`|`true`|Refresh the changes tree on workspace changes.|
|`openChanges`|`true`|Open a diff instead of the file when selecting a changed file.|
|`diffMode`|`"merge"`|`"merge"` or `"full"` comparison mode.|
|`showCheckboxes`|`false`|Show review checkboxes beside files and folders.|
|`sortOrder`|`"path"`|List view sort: `name`, `path`, `status`, `recentlyModified`.|
|`omitUntrackedFiles`|`false`|Hide untracked files from the changes tree.|
|`omitUnstagedChanges`|`false`|Show only staged changes.|

**Commands** (Ctrl+Shift+P → `Code Review`):

- `Export Review to Markdown`
- `Export Review to Jira`
- `Change Base...`
- `Refresh Changes`

Integrated tree-compare functionality is based on
[`vscode-git-tree-compare`](https://github.com/letmaik/vscode-git-tree-compare) by Maik Riechert,
with attribution preserved in the extension sources and notice files.

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
