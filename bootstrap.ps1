# bootstrap.ps1 — Clone (or update) an-dr-vscode-extensions and install all extensions.
#
# One-liner usage:
#   Windows (pwsh):  iex (iwr 'https://raw.githubusercontent.com/an-dr/an-dr-vscode-extensions/main/bootstrap.ps1').Content
#   Linux/macOS:     pwsh -c "iex (iwr 'https://raw.githubusercontent.com/an-dr/an-dr-vscode-extensions/main/bootstrap.ps1').Content"

$ErrorActionPreference = 'Stop'

$RepoUrl  = 'https://github.com/an-dr/an-dr-vscode-extensions.git'
$RepoDir  = Join-Path $HOME '.vscode-an-dr'

Write-Host ''
Write-Host '  an-dr VSCode Extensions Bootstrap' -ForegroundColor Cyan
Write-Host ''

# ── Clone or pull ─────────────────────────────────────────────────────────────

if (Test-Path (Join-Path $RepoDir '.git')) {
    Write-Host '  Repo found — pulling latest changes...' -ForegroundColor DarkGray
    Push-Location $RepoDir
    try   { & git pull --ff-only }
    finally { Pop-Location }
} else {
    Write-Host "  Cloning into $RepoDir ..." -ForegroundColor DarkGray
    & git clone $RepoUrl $RepoDir
}

Write-Host ''

# ── Install ───────────────────────────────────────────────────────────────────

& pwsh (Join-Path $RepoDir 'install.ps1')
