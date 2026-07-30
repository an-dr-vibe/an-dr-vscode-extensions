# install.ps1 — Links each extension dir under .\extensions\ into VS Code's extension folder.
# Windows: NTFS junctions (no admin needed).  Linux/macOS: symlinks.
# Requires PowerShell >= 5 on Windows or pwsh (PowerShell Core) on Linux/macOS.

param(
    [switch] $SkipBuild,  # Skip npm install / compile entirely
    [switch] $Force       # Rebuild even if commit hash matches
)

$ErrorActionPreference = 'Stop'

# Native command failures are handled explicitly via $LASTEXITCODE (see Build-Extension),
# so one broken extension reports and the loop carries on instead of aborting and leaving
# the remaining extensions unlinked. PowerShell 7.4+ can be configured to turn a non-zero
# native exit into a terminating error; opt out so behaviour is identical on every machine.
$PSNativeCommandUseErrorActionPreference = $false

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

# Absolute path of the entry point an extension's manifest declares in "main".
# Returns $null when the manifest declares none (theme/icon-only extensions have no
# code entry point), meaning there is nothing to verify after a build.
function Get-ExtMainPath ([string]$ExtDir) {
    $pkgPath = Join-Path $ExtDir 'package.json'
    if (-not (Test-Path $pkgPath)) { return $null }
    $main = (Get-Content $pkgPath -Raw | ConvertFrom-Json).main
    if (-not $main) { return $null }
    # GetFullPath collapses the './' most manifests prefix, so failure messages read cleanly.
    return [IO.Path]::GetFullPath((Join-Path $ExtDir $main))
}

# Runs a native command inside $ExtDir and returns its exit code. Output is written
# straight to the host rather than the success stream, so it can never be mistaken for
# the return value of the function that calls this.
function Invoke-ExtCommand ([string]$ExtDir, [string]$Exe, [string[]]$Arguments) {
    Push-Location $ExtDir
    try {
        & $Exe @Arguments | Out-Host
        return $LASTEXITCODE
    } finally {
        Pop-Location
    }
}

function Test-ExtDirty ([string]$ExtName) {
    # Returns $true if the working tree or index has any changes under extensions/<ExtName>/
    & git -C $RepoDir diff --quiet -- "extensions/$ExtName" 2>$null
    if ($LASTEXITCODE -ne 0) { return $true }
    & git -C $RepoDir diff --cached --quiet -- "extensions/$ExtName" 2>$null
    return $LASTEXITCODE -ne 0
}

# Junctioned/symlinked extensions have no 'metadata' object in extensions.json at all (VS
# Code only fully populates that for extensions installed via the Marketplace or a .vsix),
# which means they belong only to the profile they were first discovered in - switching to
# another profile hides them. Setting metadata.isApplicationScoped = true is the same flag
# VS Code's own "Apply Extension to all Profiles" command sets, so these extensions show up
# in every profile. See docs/adr/ADR-001-install-application-scoped-extensions.md.
function Set-ApplicationScopedExtensions ([string[]]$Ids) {
    $manifestPath = Join-Path $VscodeExtensions 'extensions.json'
    if (-not (Test-Path $manifestPath)) { return }

    $entries = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $idSet = @{}
    foreach ($id in $Ids) { $idSet[$id.ToLowerInvariant()] = $true }

    $changed = $false
    foreach ($entry in $entries) {
        if (-not $idSet.ContainsKey($entry.identifier.id.ToLowerInvariant())) { continue }
        if ($null -eq $entry.metadata) {
            $entry | Add-Member -MemberType NoteProperty -Name 'metadata' -Value ([PSCustomObject]@{ isApplicationScoped = $true })
            $changed = $true
        } elseif ($entry.metadata.isApplicationScoped -ne $true) {
            if ($entry.metadata.PSObject.Properties.Name -contains 'isApplicationScoped') {
                $entry.metadata.isApplicationScoped = $true
            } else {
                $entry.metadata | Add-Member -MemberType NoteProperty -Name 'isApplicationScoped' -Value $true
            }
            $changed = $true
        }
    }

    if ($changed) {
        $json = $entries | ConvertTo-Json -Depth 10
        [System.IO.File]::WriteAllText($manifestPath, $json, [System.Text.UTF8Encoding]::new($false))
        Write-Host "  Marked $($Ids.Count) an-dr extension(s) as application-scoped (visible in every profile)." -ForegroundColor DarkGray
        Write-Host '  If VS Code is currently running, reload the window for this to take effect;' -ForegroundColor DarkGray
        Write-Host '  re-run install.ps1 if a later VS Code action ever resets it.' -ForegroundColor DarkGray
    }
}

# Builds one extension. Returns $null on success, or a short string naming the step that
# failed ('npm install', 'compile', 'entry point').
#
# A failed build must never be recorded as a good one: npm's exit code is checked
# explicitly (a non-zero native exit is not a PowerShell terminating error, so
# $ErrorActionPreference does not catch it), and on failure the .build-commit stamp is
# left unwritten so the next run retries instead of reporting '(up to date)'.
# See docs/adr/ADR-002-install-fails-loudly-on-build-failure.md.
function Build-Extension ([string]$ExtDir, [string]$ExtName) {
    if (-not (Test-Path (Join-Path $ExtDir 'package.json'))) { return $null }

    $mainPath = Get-ExtMainPath $ExtDir

    if (-not $Force) {
        $currentHash = Get-ExtCommitHash $ExtName
        $builtHash   = Get-Stamp $ExtDir '.build-commit'
        $dirty       = Test-ExtDirty $ExtName
        # A matching stamp only means 'up to date' while the built entry point is still
        # on disk — an interrupted build can leave the stamp behind without the output.
        $hasOutput   = (-not $mainPath) -or (Test-Path $mainPath)
        if ($currentHash -and $builtHash -and $currentHash -eq $builtHash -and -not $dirty -and $hasOutput) {
            Write-Host ' (up to date)' -ForegroundColor DarkGray -NoNewline
            return $null
        }
        if ($dirty) {
            Write-Host ' (dirty)' -ForegroundColor Yellow -NoNewline
        }
    }

    Write-Host ''

    $installHash  = Get-ExtInstallHash $ExtName
    $installedAt  = Get-Stamp $ExtDir '.install-commit'
    if ($Force -or -not ($installHash -and $installedAt -and $installHash -eq $installedAt)) {
        Write-Host '    npm install...' -ForegroundColor DarkGray
        $exitCode = Invoke-ExtCommand $ExtDir 'npm' @('install', '--silent')
        if ($exitCode -ne 0) {
            Write-Host "    BUILD FAILED — 'npm install' exited with $exitCode" -ForegroundColor Red
            return 'npm install'
        }
        Set-Stamp $ExtDir '.install-commit' ($installHash ?? 'no-git')
    }

    Write-Host '    compile...' -ForegroundColor DarkGray
    $exitCode = Invoke-ExtCommand $ExtDir 'npm' @('run', 'compile', '--silent')
    if ($exitCode -ne 0) {
        Write-Host "    BUILD FAILED — 'npm run compile' exited with $exitCode" -ForegroundColor Red
        return 'compile'
    }

    # A build can exit 0 and still produce nothing — e.g. a multi-step chain whose first
    # step wipes out/ and whose later steps are skipped — so verify what the manifest
    # actually points VS Code at.
    if ($mainPath -and -not (Test-Path $mainPath)) {
        Write-Host "    BUILD FAILED — entry point missing after compile: $mainPath" -ForegroundColor Red
        return 'entry point'
    }

    Set-Stamp $ExtDir '.build-commit' ((Get-ExtCommitHash $ExtName) ?? 'no-git')
    return $null
}

# ── main loop — one link per nested extension dir ─────────────────────────────

$linked   = 0
$skipped  = 0
$excluded = 0
$failed  = @()   # @{ Name; Reason } per extension whose build did not succeed
$extensionIds = @()

foreach ($ext in Get-ChildItem -Path $ExtensionsSource -Directory) {
    $src = $ext.FullName

    # Derive junction name from package.json (publisher.name-version) so VS Code
    # recognises it; fall back to folder name if fields are missing.
    $pkgJson = Join-Path $src 'package.json'
    $dstName = $ext.Name
    $extId   = $null
    if (Test-Path $pkgJson) {
        $pkg = Get-Content $pkgJson -Raw | ConvertFrom-Json
        if ($pkg.publisher -and $pkg.name -and $pkg.version) {
            $dstName = "$($pkg.publisher).$($pkg.name)-$($pkg.version)"
            $extId = "$($pkg.publisher).$($pkg.name)"
        }
    }
    $dst = Join-Path $VscodeExtensions $dstName

    # An extension opts out of the shared install by containing a .installignore file,
    # for work that must not load in the editor yet. Opting out also removes any link an
    # earlier run left behind, so it uninstalls rather than merely stopping updates.
    if (Test-Path (Join-Path $src '.installignore')) {
        $unlinked = $false
        foreach ($stale in @($dst, (Join-Path $VscodeExtensions $ext.Name))) {
            if (Test-ManagedLink $stale) {
                Remove-ManagedLink $stale
                $unlinked = $true
            }
        }
        Write-Host "  $dstName" -ForegroundColor DarkGray -NoNewline
        if ($unlinked) {
            Write-Host ' (excluded by .installignore — unlinked)' -ForegroundColor DarkGray
        } else {
            Write-Host ' (excluded by .installignore)' -ForegroundColor DarkGray
        }
        $excluded++
        continue
    }

    if ($extId) { $extensionIds += $extId }

    Write-Host "  $dstName" -ForegroundColor Yellow -NoNewline

    # Remove stale bare-name junction (legacy naming from earlier installs).
    $legacyDst = Join-Path $VscodeExtensions $ext.Name
    if ($legacyDst -ne $dst -and (Test-ManagedLink $legacyDst)) {
        Remove-ManagedLink $legacyDst
    }

    # Remove links this extension left behind under an earlier version. VS Code
    # keys directories by publisher.name-version, so without this a version bump
    # leaves two directories claiming the same extension ID — and the registry
    # keeps pointing at whichever one it saw first.
    if ($extId) {
        Get-ChildItem -Path $VscodeExtensions -Directory -Filter "$extId-*" -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -ne $dst -and (Test-ManagedLink $_.FullName) } |
            ForEach-Object { Remove-ManagedLink $_.FullName }
    }

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

    $buildError = $null
    if (-not $SkipBuild) { $buildError = Build-Extension $src $ext.Name }

    # A failed build is still linked: the junction points at live source, so once the
    # build is fixed the extension works without re-linking. The installer's red output
    # and non-zero exit are the authoritative signal, not the presence of the link.
    New-ManagedLink $dst $src
    if ($buildError) {
        Write-Host ' linked (BROKEN BUILD)' -ForegroundColor Red
        $failed += @{ Name = $ext.Name; Reason = $buildError }
    } else {
        Write-Host ' linked' -ForegroundColor Green
    }
    $linked++
}

if ($extensionIds.Count -gt 0) {
    Set-ApplicationScopedExtensions $extensionIds
}

Write-Host ''

$excludedNote = if ($excluded -gt 0) { ", excluded $excluded" } else { '' }

if ($failed.Count -gt 0) {
    Write-Host "  Done — linked $linked, skipped $skipped$excludedNote, FAILED $($failed.Count)." -ForegroundColor Red
    Write-Host ''
    Write-Host '  Failed extensions:' -ForegroundColor Red
    foreach ($f in $failed) {
        Write-Host "    - $($f.Name) ($($f.Reason))" -ForegroundColor Red
    }
    Write-Host '  These are linked but will not start until their build succeeds.'
    Write-Host '  No build stamp was written for them, so the next run rebuilds them.'
    Write-Host ''
    exit 1
}

Write-Host "  Done — linked $linked, skipped $skipped$excludedNote." -ForegroundColor Cyan
Write-Host "  Run 'Developer: Reload Window' in VS Code to activate."
Write-Host ''
