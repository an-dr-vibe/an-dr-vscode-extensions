# install.ps1 — Junctions each extension dir nested under .\extensions\ into VS Code's extension folder.
# Creates one junction per extension, leaving all other installed extensions untouched.
# Run from any location; no admin rights required (uses NTFS junctions).

param(
    [switch] $SkipBuild   # Pass -SkipBuild to skip npm install / compile
)

$ErrorActionPreference = 'Stop'

$RepoDir        = $PSScriptRoot
$ExtensionsSource = Join-Path $RepoDir 'extensions'
$VscodeExtensions = Join-Path $env:USERPROFILE '.vscode\extensions'

Write-Host ''
Write-Host '  an-dr VSCode Extension Installer' -ForegroundColor Cyan
Write-Host '  Source : ' -NoNewline; Write-Host $ExtensionsSource
Write-Host '  Target : ' -NoNewline; Write-Host $VscodeExtensions
Write-Host ''

if (-not (Test-Path $VscodeExtensions)) {
    New-Item -ItemType Directory -Path $VscodeExtensions | Out-Null
}

# ── helpers ───────────────────────────────────────────────────────────────────

function Is-Junction ([string]$Path) {
    if (-not (Test-Path $Path)) { return $false }
    $attr = (Get-Item $Path -Force).Attributes
    return ($attr -band [IO.FileAttributes]::ReparsePoint) -ne 0
}

function Remove-Junction ([string]$Path) {
    # rmdir removes the junction itself without touching the target
    & cmd /c "rmdir `"$Path`"" | Out-Null
}

function Build-Extension ([string]$ExtDir) {
    $pkgJson  = Join-Path $ExtDir 'package.json'
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

# ── main loop — one junction per nested extension dir ────────────────────────

$linked  = 0
$skipped = 0

foreach ($ext in Get-ChildItem -Path $ExtensionsSource -Directory) {
    $src = $ext.FullName
    $dst = Join-Path $VscodeExtensions $ext.Name

    Write-Host "  $($ext.Name)" -ForegroundColor Yellow -NoNewline

    if (Test-Path $dst) {
        if (Is-Junction $dst) {
            Remove-Junction $dst
            Write-Host ' (replaced)' -NoNewline
        } else {
            Write-Host ''
            Write-Host '    SKIP — real directory already exists. Remove it manually to reinstall.' -ForegroundColor Red
            $skipped++
            continue
        }
    }

    if (-not $SkipBuild) { Build-Extension $src }

    New-Item -ItemType Junction -Path $dst -Target $src | Out-Null
    Write-Host ' linked' -ForegroundColor Green
    $linked++
}

Write-Host ''
Write-Host "  Done — linked $linked, skipped $skipped." -ForegroundColor Cyan
Write-Host "  Run 'Developer: Reload Window' in VS Code to activate."
Write-Host ''
