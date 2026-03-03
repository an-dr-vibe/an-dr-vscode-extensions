# install.ps1 — Links each extension dir under .\extensions\ into VS Code's extension folder.
# Windows: NTFS junctions (no admin needed).  Linux/macOS: symlinks.
# Requires PowerShell >= 5 on Windows or pwsh (PowerShell Core) on Linux/macOS.

param(
    [switch] $SkipBuild   # Pass -SkipBuild to skip npm install / compile
)

$ErrorActionPreference = 'Stop'

$RepoDir          = $PSScriptRoot
$ExtensionsSource = Join-Path $RepoDir 'extensions'
$VscodeExtensions = Join-Path $HOME '.vscode' 'extensions'

Write-Host ''
Write-Host '  an-dr VSCode Extension Installer' -ForegroundColor Cyan
Write-Host "  Platform : $($IsWindows ? 'Windows (junction)' : ($IsMacOS ? 'macOS (symlink)' : 'Linux (symlink)'))"
Write-Host '  Source   : ' -NoNewline; Write-Host $ExtensionsSource
Write-Host '  Target   : ' -NoNewline; Write-Host $VscodeExtensions
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

function Build-Extension ([string]$ExtDir) {
    $pkgJson     = Join-Path $ExtDir 'package.json'
    $nodeModules = Join-Path $ExtDir 'node_modules'
    if (-not (Test-Path $pkgJson)) { return }

    if (-not (Test-Path $nodeModules)) {
        Write-Host '    npm install...' -ForegroundColor DarkGray
        Push-Location $ExtDir
        try   { & npm install --silent }
        finally { Pop-Location }
    }

    Write-Host '    tsc compile...' -ForegroundColor DarkGray
    Push-Location $ExtDir
    try   { & npm run compile --silent }
    finally { Pop-Location }
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

    if (-not $SkipBuild) { Build-Extension $src }

    New-ManagedLink $dst $src
    Write-Host ' linked' -ForegroundColor Green
    $linked++
}

Write-Host ''
Write-Host "  Done — linked $linked, skipped $skipped." -ForegroundColor Cyan
Write-Host "  Run 'Developer: Reload Window' in VS Code to activate."
Write-Host ''
