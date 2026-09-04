param(
  [string]$VersionName,
  [string]$VersionCode,
  [string]$ReleaseNotes,
  [string]$RemoteHost = 'my-mac',
  [string]$RemoteUser = '',
  [string]$RemotePath = '/home/ubuntu/MacOS-Production',
  [switch]$Interactive,
  [switch]$SkipRemoteUpload,
  [switch]$DryRun
)

################################################################################
# ENTERPRISE ANDROID OTA UPDATE PUBLISHER
#
# Builds the APK, computes SHA-256 checksum, archives the previous version,
# writes an enhanced manifest with integrity metadata, copies to local
# production, and atomically deploys to the remote Ubuntu VM via SSH.
#
# Usage:
#   .\publish-android-update.ps1                        # Interactive mode
#   .\publish-android-update.ps1 -VersionName "1.0.5"   # Non-interactive
#   .\publish-android-update.ps1 -DryRun                # Preview only
#
# Failsafes:
#   - SHA-256 checksum on every built APK
#   - Previous version archived before overwrite
#   - Atomic remote deploy (SCP to temp dir, then SSH mv)
#   - Build verification (non-zero APK exists)
#   - Dry-run mode for safe previewing
################################################################################

$ErrorActionPreference = 'Stop'

# ─── Paths ───────────────────────────────────────────────────────────────────

$root = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $root 'android'
$uploadDir = Join-Path $root 'backend/uploads/android-app'
$archiveDir = Join-Path $uploadDir 'archive'
$apkName = 'latest.apk'
$manifestPath = Join-Path $uploadDir 'update-manifest.json'
$historyPath = Join-Path $uploadDir 'version-history.json'
$apkSource = Join-Path $androidDir 'app/build/outputs/apk/debug/app-debug.apk'

New-Item -ItemType Directory -Force -Path $uploadDir | Out-Null
New-Item -ItemType Directory -Force -Path $archiveDir | Out-Null

# ─── Helpers ─────────────────────────────────────────────────────────────────

function Write-Step { param([string]$msg) Write-Host "`n[STEP] $msg" -ForegroundColor Cyan }
function Write-Ok   { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Err  { param([string]$msg) Write-Host "  [ERR] $msg" -ForegroundColor Red }
function Write-Info { param([string]$msg) Write-Host "  [INFO] $msg" -ForegroundColor Gray }

function Compute-Sha256 {
  param([string]$FilePath)
  $hash = Get-FileHash -Path $FilePath -Algorithm SHA256
  return $hash.Hash.ToLower()
}

function Test-ValidJdk {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path $Path)) { return $false }
  if ($Path -like "*Common Files*" -or $Path -like "*Oracle*Java*") { return $false }
  $javaExe = Join-Path $Path "bin\java.exe"
  $javacExe = Join-Path $Path "bin\javac.exe"
  return (Test-Path $javaExe) -or (Test-Path $javacExe)
}

function Find-ValidJavaHome {
  if ($env:JAVA_HOME -and (Test-ValidJdk $env:JAVA_HOME)) {
    return $env:JAVA_HOME
  }
  $candidates = @(
    "C:\Program Files\Android\Android Studio\jbr",
    "C:\Users\HP\.gradle\jdks\eclipse_adoptium-17-amd64-windows.2",
    "C:\Program Files\Java\jdk-23",
    "C:\Program Files\Java\jdk-17",
    "C:\Program Files\Java\jdk-21"
  )
  foreach ($c in $candidates) {
    if (Test-ValidJdk $c) { return $c }
  }
  $gradleJdks = Join-Path $env:USERPROFILE ".gradle\jdks"
  if (Test-Path $gradleJdks) {
    Get-ChildItem -Path $gradleJdks -Directory | ForEach-Object {
      if (Test-ValidJdk $_.FullName) { return $_.FullName }
    }
  }
  return $null
}

$validJavaHome = Find-ValidJavaHome
if ($validJavaHome) {
  $env:JAVA_HOME = $validJavaHome
  Write-Info "Using JAVA_HOME: $env:JAVA_HOME"
}

# ─── Validate Prerequisites ──────────────────────────────────────────────────

if (-not (Test-Path (Join-Path $androidDir 'gradlew.bat'))) {
  throw "Android project not found at $androidDir"
}

# ─── Read Current Manifest ───────────────────────────────────────────────────

$currentVersionName = '1.0.0'
$currentVersionCode = 1
$currentReleaseNotes = 'Updated via publish script'

if (Test-Path $manifestPath) {
  try {
    $existingManifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
    if ($existingManifest.versionName) { $currentVersionName = [string]$existingManifest.versionName }
    if ($existingManifest.versionCode) { $currentVersionCode = [int]$existingManifest.versionCode }
    if ($existingManifest.releaseNotes) { $currentReleaseNotes = [string]$existingManifest.releaseNotes }
  } catch {
    Write-Warn "Could not read existing manifest; using defaults."
  }
}

# ─── Version Bump Selection ──────────────────────────────────────────────────

$selectedVersionName = $VersionName
$selectedVersionCode = $VersionCode
$selectedReleaseNotes = $ReleaseNotes

if ($Interactive.IsPresent -or (-not $PSBoundParameters.ContainsKey('VersionName') -and -not $PSBoundParameters.ContainsKey('VersionCode'))) {
  Write-Host ""
  Write-Host "Current version: $currentVersionName ($currentVersionCode)"
  $versionChoice = (Read-Host "Version bump? [p]atch [m]inor [M]ajor [n]one [s]kip (default: patch)").Trim().ToLowerInvariant()
  if ([string]::IsNullOrWhiteSpace($versionChoice)) { $versionChoice = 'patch' }

  $versionParts = $currentVersionName -split '\.'
  if ($versionParts.Count -ge 3) {
    $major = [int]$versionParts[0]
    $minor = [int]$versionParts[1]
    $patch = [int]$versionParts[2]
  } else {
    $major = 1; $minor = 0; $patch = 0
  }

  switch ($versionChoice) {
    { $_ -in 'p', 'patch' } {
      $selectedVersionName = "$major.$minor.$($patch + 1)"
      $selectedVersionCode = $currentVersionCode + 1
    }
    { $_ -in 'm', 'minor' } {
      $selectedVersionName = "$major.$($minor + 1).0"
      $selectedVersionCode = $currentVersionCode + 1
    }
    { $_ -in 'M', 'major' } {
      $selectedVersionName = "$($major + 1).0.0"
      $selectedVersionCode = $currentVersionCode + 1
    }
    { $_ -in 'n', 'none', 's', 'skip' } {
      $selectedVersionName = $currentVersionName
      $selectedVersionCode = $currentVersionCode
    }
    default {
      Write-Warn "Unknown option '$versionChoice'; using patch increment."
      $selectedVersionName = "$major.$minor.$($patch + 1)"
      $selectedVersionCode = $currentVersionCode + 1
    }
  }
}

# Release notes
if ($Interactive.IsPresent -or -not $PSBoundParameters.ContainsKey('ReleaseNotes')) {
  $notesInput = Read-Host "Release notes (press Enter for default, or type [s]kip to leave blank)"
  if ($notesInput -match '^(s|skip)$') {
    $selectedReleaseNotes = ''
  } elseif (-not [string]::IsNullOrWhiteSpace($notesInput)) {
    $selectedReleaseNotes = $notesInput
  } else {
    $selectedReleaseNotes = $currentReleaseNotes
  }
} elseif ([string]::IsNullOrWhiteSpace($selectedReleaseNotes)) {
  $selectedReleaseNotes = $currentReleaseNotes
}

if ([string]::IsNullOrWhiteSpace($selectedVersionName)) { $selectedVersionName = $currentVersionName }
if ([string]::IsNullOrWhiteSpace($selectedVersionCode)) { $selectedVersionCode = $currentVersionCode }
if ([string]::IsNullOrWhiteSpace($selectedReleaseNotes)) { $selectedReleaseNotes = $currentReleaseNotes }

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════"
Write-Host "  ANDROID OTA UPDATE PUBLISHER"
Write-Host "  Version: $selectedVersionName ($selectedVersionCode)"
Write-Host "  Notes:   $($selectedReleaseNotes -replace "`n", ' ')"
if ($DryRun) { Write-Host "  MODE:    DRY RUN (no changes)" -ForegroundColor Yellow }
Write-Host "════════════════════════════════════════════════════════════"

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 1: BUILD APK
# ═══════════════════════════════════════════════════════════════════════════════

Write-Step "Building APK via Gradle..."

if ($DryRun) {
  Write-Info "[DRY RUN] Would run: gradlew.bat assembleDebug -PversionName=$selectedVersionName -PversionCode=$selectedVersionCode"
} else {
  Push-Location $androidDir
  try {
    & .\gradlew.bat assembleDebug "-PversionName=$([string]$selectedVersionName)" "-PversionCode=$([string]$selectedVersionCode)" | Out-String | Write-Host
  } finally {
    Pop-Location
  }

  # Verify build output
  if (-not (Test-Path $apkSource)) {
    throw "BUILD FAILED: APK not found at $apkSource"
  }
  $apkSize = (Get-Item $apkSource).Length
  if ($apkSize -eq 0) {
    throw "BUILD FAILED: APK is empty (0 bytes)"
  }
  Write-Ok "APK built successfully ($([math]::Round($apkSize / 1MB, 1)) MB)"
}

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 2: COMPUTE SHA-256 CHECKSUM
# ═══════════════════════════════════════════════════════════════════════════════

Write-Step "Computing SHA-256 checksum..."

if ($DryRun) {
  $sha256 = "dry-run-no-hash"
  $apkSize = 0
  Write-Info "[DRY RUN] Would compute SHA-256 of built APK"
} else {
  $sha256 = Compute-Sha256 -FilePath $apkSource
  $apkSize = (Get-Item $apkSource).Length
  Write-Ok "SHA-256: $sha256"
  Write-Ok "Size:    $apkSize bytes ($([math]::Round($apkSize / 1MB, 1)) MB)"
}

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 3: ARCHIVE PREVIOUS VERSION
# ═══════════════════════════════════════════════════════════════════════════════

Write-Step "Archiving previous version..."

$previousApkPath = Join-Path $uploadDir $apkName
$previousVersion = $null

if (Test-Path $previousApkPath) {
  $archiveName = "v${currentVersionName}_${currentVersionCode}_$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()).apk"
  $archiveDest = Join-Path $archiveDir $archiveName

  if ($DryRun) {
    Write-Info "[DRY RUN] Would archive $apkName -> archive/$archiveName"
  } else {
    Copy-Item $previousApkPath -Destination $archiveDest -Force
    Write-Ok "Archived: $archiveName"

    # Record in version history
    $history = @()
    if (Test-Path $historyPath) {
      try { $history = Get-Content -Raw $historyPath | ConvertFrom-Json } catch { $history = @() }
      if ($null -eq $history) { $history = @() }
    }
    $historyEntry = @{
      versionCode = $currentVersionCode
      versionName = $currentVersionName
      releaseNotes = $currentReleaseNotes
      archiveFile = $archiveName
      archivedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    $history = @($historyEntry) + @($history)
    # Keep last 20
    if ($history.Count -gt 20) { $history = $history[0..19] }
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    $historyJsonStr = $history | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($historyPath, $historyJsonStr, $utf8NoBom)

    # Prune old archives (keep last 5 files)
    $archiveFiles = Get-ChildItem -Path $archiveDir -Filter '*.apk' | Sort-Object LastWriteTime -Descending
    if ($archiveFiles.Count -gt 5) {
      $archiveFiles | Select-Object -Skip 5 | ForEach-Object {
        Remove-Item $_.FullName -Force
        Write-Info "Pruned old archive: $($_.Name)"
      }
    }
  }
  $previousVersion = @{ versionCode = $currentVersionCode; versionName = $currentVersionName }
} else {
  Write-Info "No previous APK to archive (first publish)"
}

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 4: COPY APK + WRITE ENHANCED MANIFEST
# ═══════════════════════════════════════════════════════════════════════════════

Write-Step "Writing enhanced manifest and copying APK..."

if ($DryRun) {
  Write-Info "[DRY RUN] Would copy APK to $uploadDir/$apkName"
  Write-Info "[DRY RUN] Would write manifest to $manifestPath"
} else {
  Copy-Item $apkSource -Destination (Join-Path $uploadDir $apkName) -Force

  $manifest = @{
    versionCode = [int]$selectedVersionCode
    versionName = $selectedVersionName
    apkUrl = '/api/android/update/latest'
    releaseNotes = $selectedReleaseNotes
    publishedAt = (Get-Date).ToUniversalTime().ToString('o')
    fileName = $apkName
    sha256 = $sha256
    fileSize = $apkSize
    minSdkVersion = 24
    previousVersion = $previousVersion
    downloadCount = 0
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  $jsonStr = $manifest | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText($manifestPath, $jsonStr, $utf8NoBom)

  Write-Ok "Manifest written with SHA-256 integrity"
}

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 5: COPY TO LOCAL PRODUCTION
# ═══════════════════════════════════════════════════════════════════════════════

Write-Step "Copying to local production folder..."

$localProdRoot = [System.IO.Path]::GetFullPath((Join-Path $root '..\MacOS-Production'))
$localProdUploadDir = Join-Path $localProdRoot 'backend/uploads/android-app'

if (Test-Path $localProdRoot) {
  if ($DryRun) {
    Write-Info "[DRY RUN] Would copy to $localProdUploadDir"
  } else {
    New-Item -ItemType Directory -Force -Path $localProdUploadDir | Out-Null
    Copy-Item $manifestPath -Destination (Join-Path $localProdUploadDir 'update-manifest.json') -Force
    Copy-Item (Join-Path $uploadDir $apkName) -Destination (Join-Path $localProdUploadDir $apkName) -Force
    Write-Ok "Copied to local production: $localProdUploadDir"
  }
} else {
  Write-Warn "Local production folder not found at $localProdRoot (skipping)"
}

# ═══════════════════════════════════════════════════════════════════════════════
# STEP 6: ATOMIC REMOTE DEPLOYMENT VIA SSH
# ═══════════════════════════════════════════════════════════════════════════════

if (-not $SkipRemoteUpload -and $RemoteHost) {
  Write-Step "Deploying to remote host (atomic upload)..."

  $remoteTarget = if ($RemoteUser) { "${RemoteUser}@${RemoteHost}" } else { $RemoteHost }
  $remoteDir = if ($RemotePath) {
    ($RemotePath.TrimEnd('/') + '/backend/uploads/android-app').Replace('\', '/')
  } else {
    '/home/ubuntu/MacOS-Production/backend/uploads/android-app'
  }
  $remoteTmpDir = "$remoteDir/.tmp-deploy"

  $sshArgs = @('-o', 'StrictHostKeyChecking=no')
  if (Test-Path "$env:USERPROFILE\.ssh\id_rsa") {
    $sshArgs += @('-i', "$env:USERPROFILE\.ssh\id_rsa")
  }

  if ($DryRun) {
    Write-Info "[DRY RUN] Would upload to ${remoteTarget}:${remoteDir}"
    Write-Info "[DRY RUN] Strategy: SCP to temp dir -> SSH mv (atomic)"
  } else {
    # 1. Create temp dir on remote
    & ssh @sshArgs $remoteTarget "mkdir -p '$remoteTmpDir'" | Out-String | Write-Host

    # 2. Upload to temp dir
    $localManifest = Join-Path $uploadDir 'update-manifest.json'
    $localApk = Join-Path $uploadDir $apkName
    & scp @sshArgs "$localManifest" "$localApk" "${remoteTarget}:${remoteTmpDir}/" | Out-String | Write-Host

    # 3. Atomic move from temp to production dir
    & ssh @sshArgs $remoteTarget "mkdir -p '$remoteDir' && mv '$remoteTmpDir/update-manifest.json' '$remoteDir/update-manifest.json' && mv '$remoteTmpDir/$apkName' '$remoteDir/$apkName' && rmdir '$remoteTmpDir'" | Out-String | Write-Host

    Write-Ok "Atomically deployed to ${remoteTarget}:${remoteDir}"
  }
} else {
  Write-Info "Remote upload skipped (--SkipRemoteUpload or no RemoteHost)"
}

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

Write-Host ""
Write-Host "════════════════════════════════════════════════════════════"
if ($DryRun) {
  Write-Host "  DRY RUN COMPLETE (no changes made)" -ForegroundColor Yellow
} else {
  Write-Host "  ANDROID OTA UPDATE PUBLISHED" -ForegroundColor Green
}
Write-Host "════════════════════════════════════════════════════════════"
Write-Host "  Version:  $selectedVersionName ($selectedVersionCode)"
Write-Host "  SHA-256:  $sha256"
Write-Host "  Size:     $([math]::Round($apkSize / 1MB, 1)) MB"
Write-Host "  Notes:    $($selectedReleaseNotes -replace "`n", ' ')"
Write-Host "  Manifest: $manifestPath"
Write-Host "  APK:      $(Join-Path $uploadDir $apkName)"
Write-Host "════════════════════════════════════════════════════════════"
Write-Host ""
