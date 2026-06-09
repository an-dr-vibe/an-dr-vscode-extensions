# install.ps1 — Links each extension dir under .\extensions\ into VS Code's extension folder.
# Windows: NTFS junctions (no admin needed).  Linux/macOS: symlinks.
# Requires PowerShell >= 5 on Windows or pwsh (PowerShell Core) on Linux/macOS.

param(
    [switch] $SkipBuild,  # Skip npm install / compile entirely
    [switch] $Force       # Rebuild even if commit hash matches
)

$ErrorActionPreference = 'Stop'

$RepoDir          = $PSScriptRoot
$ExtensionsSource = Join-Path $RepoDir 'extensions'
$VscodeExtensions = Join-Path $HOME '.vscode' 'extensions'

Write-Host ''
Write-Host '  an-dr VSCode Extension Installer' -ForegroundColor Cyan
# Write-Host "  Platform : $($IsWindows ? 'Windows (junction)' : ($IsMacOS ? 'macOS (symlink)' : 'Linux (symlink)'))"
Write-Host '  Source   : ' -NoNewline; Write-Host $ExtensionsSource
Write-Host '  Target   : ' -NoNewline; Write-Host $VscodeExtensions
if ($Force) { Write-Host '  Mode     : FORCE (rebuilding all)' -ForegroundColor Magenta }
Write-Host ''

if (-not (Test-Path $VscodeExtensions)) {
    New-Item -ItemType Directory -Path $VscodeExtensions | Out-Null
}

# ── helpers ───────────────────────────────────────────────────────────────────

function Test-ManagedLink ([string]$Path) {
    if (-not (Test-Path $Path)) { return $false }
    $item = Get-Item $Path -Force
    if ($IsWindows) {
        return ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
    } else {
        return $null -ne $item.LinkType
    }
}

function Remove-ManagedLink ([string]$Path) {
    if ($IsWindows) {
        # cmd rmdir removes the junction itself without touching the target
        & cmd /c "rmdir `"$Path`"" | Out-Null
    } else {
        Remove-Item -Path $Path -Force
    }
}

function New-ManagedLink ([string]$Dst, [string]$Src) {
    if ($IsWindows) {
        New-Item -ItemType Junction -Path $Dst -Target $Src | Out-Null
    } else {
        New-Item -ItemType SymbolicLink -Path $Dst -Target $Src | Out-Null
    }
}

# Last commit touching all files under extensions/<ExtName>/ (build stamp).
function Get-ExtCommitHash ([string]$ExtName) {
    try {
        $hash = & git -C $RepoDir log -1 --format='%H' -- "extensions/$ExtName" 2>$null
        if ($LASTEXITCODE -eq 0 -and $hash) { return $hash.Trim() }
    } catch {}
    return $null
}

# Last commit touching only package.json / package-lock.json (install stamp).
function Get-ExtInstallHash ([string]$ExtName) {
    try {
        $hash = & git -C $RepoDir log -1 --format='%H' -- `
            "extensions/$ExtName/package.json" `
            "extensions/$ExtName/package-lock.json" 2>$null
        if ($LASTEXITCODE -eq 0 -and $hash) { return $hash.Trim() }
    } catch {}
    return $null
}

function Get-Stamp ([string]$ExtDir, [string]$File) {
    $stamp = Join-Path $ExtDir 'out' $File
    if (Test-Path $stamp) { return (Get-Content $stamp -Raw).Trim() }
    return $null
}

function Set-Stamp ([string]$ExtDir, [string]$File, [string]$Hash) {
    $outDir = Join-Path $ExtDir 'out'
    if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
    Set-Content -Path (Join-Path $outDir $File) -Value $Hash -NoNewline
}

function Build-Extension ([string]$ExtDir, [string]$ExtName) {
    if (-not (Test-Path (Join-Path $ExtDir 'package.json'))) { return }

    if (-not $Force) {
        $currentHash = Get-ExtCommitHash $ExtName
        $builtHash   = Get-Stamp $ExtDir '.build-commit'
        if ($currentHash -and $builtHash -and $currentHash -eq $builtHash) {
            Write-Host ' (up to date)' -ForegroundColor DarkGray -NoNewline
            return
        }
    }

    Write-Host ''

    $installHash  = Get-ExtInstallHash $ExtName
    $installedAt  = Get-Stamp $ExtDir '.install-commit'
    if ($Force -or -not ($installHash -and $installedAt -and $installHash -eq $installedAt)) {
        Write-Host '    npm install...' -ForegroundColor DarkGray
        Push-Location $ExtDir
        try   { & npm install --silent }
        finally { Pop-Location }
        Set-Stamp $ExtDir '.install-commit' ($installHash ?? 'no-git')
    }

    Write-Host '    compile...' -ForegroundColor DarkGray
    Push-Location $ExtDir
    try   { & npm run compile --silent }
    finally { Pop-Location }

    Set-Stamp $ExtDir '.build-commit' ((Get-ExtCommitHash $ExtName) ?? 'no-git')
}

# ── main loop — one link per nested extension dir ─────────────────────────────

$linked  = 0
$skipped = 0

foreach ($ext in Get-ChildItem -Path $ExtensionsSource -Directory) {
    $src = $ext.FullName
    $dst = Join-Path $VscodeExtensions $ext.Name

    Write-Host "  $($ext.Name)" -ForegroundColor Yellow -NoNewline

    if (Test-Path $dst) {
        if (Test-ManagedLink $dst) {
            Remove-ManagedLink $dst
            Write-Host ' (replaced)' -NoNewline
        } else {
            Write-Host ''
            Write-Host '    SKIP — real directory already exists. Remove it manually to reinstall.' -ForegroundColor Red
            $skipped++
            continue
        }
    }

    if (-not $SkipBuild) { Build-Extension $src $ext.Name }

    New-ManagedLink $dst $src
    Write-Host ' linked' -ForegroundColor Green
    $linked++
}

Write-Host ''
Write-Host "  Done — linked $linked, skipped $skipped." -ForegroundColor Cyan
Write-Host "  Run 'Developer: Reload Window' in VS Code to activate."
Write-Host ''
