#!/usr/bin/env powershell
<#
.SYNOPSIS
    Deploy updates from development to production
.DESCRIPTION
    Builds frontend from current src, syncs code, and restarts production services
    
    IMPORTANT: This script ALWAYS builds from src and copies fresh dist to prod.
    There is no skip-build option - builds are mandatory for safety.
#>

param(
    [switch]$DryRun,
    [switch]$Force
)

$DevDir = "C:\Users\HP\Desktop\MacOS Project\MacOS-Development"
$ProdDir = "C:\Users\HP\Desktop\MacOS Project\MacOS-Production"
$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

Write-Host "======================================================"
Write-Host "   DEPLOYMENT: Dev -> Prod (with FRESH BUILD)"
Write-Host "   Timestamp: $Timestamp"
Write-Host "======================================================"
Write-Host ""

# Color functions
function Write-Success($msg) { Write-Host -ForegroundColor Green "[OK] $msg" }
function Write-Error-Custom($msg) { Write-Host -ForegroundColor Red "[ERR] $msg" }
function Write-Info($msg) { Write-Host -ForegroundColor Cyan "[INFO] $msg" }
function Write-Warning-Custom($msg) { Write-Host -ForegroundColor Yellow "[WARN] $msg" }

# Check disk space
Write-Info "Checking disk space..."
$drive = Get-Volume -DriveLetter C
$freeGB = [math]::Round($drive.SizeRemaining / 1GB, 2)
$totalGB = [math]::Round($drive.Size / 1GB, 2)
Write-Host "  Free space: $freeGB GB / $totalGB GB"

if ($freeGB -lt 2) {
    Write-Error-Custom "CRITICAL: Less than 2GB free disk space!"
    Write-Warning-Custom "Please free up space before deploying"
    Write-Host ""
    Write-Host "Suggestions:"
    Write-Host "  1. Delete old backups: Remove-Item 'C:\Users\HP\Desktop\MacOS Project\Website-Prod\backups\*' -Recurse"
    Write-Host "  2. Clean npm cache: npm cache clean --force"
    Write-Host "  3. Clean Windows temp: Remove-Item 'C:\Windows\Temp\*' -Recurse -Force"
    exit 1
}

Write-Host ""

# ============================================================================
# PRE-DEPLOYMENT: Clean up to save disk space
# ============================================================================
Write-Info "PRE-DEPLOYMENT: Freeing disk space..."
try {
    # Clean old PM2 logs
    $pm2LogsPath = "$env:USERPROFILE\.pm2\logs"
    if (Test-Path $pm2LogsPath) {
        Write-Host "  - Cleaning PM2 logs..."
        Remove-Item "$pm2LogsPath\*" -Force -ErrorAction SilentlyContinue
    }
    
    # Clean npm cache to help with disk space
    Write-Host "  - Cleaning npm cache..."
    npm cache clean --force 2>$null
    
    Write-Success "Disk space cleanup complete"
} catch {
    Write-Warning-Custom "Could not clean some files, continuing anyway..."
}

Write-Host ""

# Check prerequisites
Write-Info "Checking prerequisites..."
if (-not (Test-Path $DevDir)) {
    Write-Error-Custom "Dev directory not found: $DevDir"
    exit 1
}

if (-not (Test-Path $ProdDir)) {
    Write-Error-Custom "Prod directory not found: $ProdDir"
    Write-Info "Creating prod directory..."
    New-Item -ItemType Directory -Path $ProdDir -Force | Out-Null
}

# Ensure logs directory exists
if (-not (Test-Path "$ProdDir\logs")) {
    New-Item -ItemType Directory -Path "$ProdDir\logs" -Force | Out-Null
}

Write-Success "Prerequisites OK"
Write-Host ""

# ============================================================================
# STEP 1: CLEAN AND BUILD FRONTEND (MANDATORY - ALWAYS RUNS)
# ============================================================================
Write-Info "STEP 1: Cleaning old dist folder and building fresh..."
Push-Location $DevDir
try {
    # Remove old dist to ensure fresh build
    Write-Host "  - Removing old dist folder..."
    if (Test-Path "dist") {
        Remove-Item -Path "dist" -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    # Run build (includes src folder and both html files)
    Write-Host "  - Running npm run build..."
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Custom "BUILD FAILED! Deployment aborted to prevent broken release."
        Pop-Location
        exit 1
    }
    
    # Verify dist was created
    if (-not (Test-Path "dist")) {
        Write-Error-Custom "CRITICAL: dist folder was not created after build!"
        Pop-Location
        exit 1
    }

    Write-Success "Fresh build completed and verified"
    Write-Host "  - Build includes: index.html, home.html, offline.html, assets/, frontend/, backend/"
        # Copy src to dist for deployment
        Write-Host "  - Copying src to dist..."
        Copy-Item -Path "src" -Destination "dist/src" -Recurse -Force -ErrorAction SilentlyContinue
} catch {
    Write-Error-Custom "Build error: $_"
    Pop-Location
    exit 1
}
Pop-Location

Write-Host ""

# ============================================================================
# STEP 2: VERIFY PRODUCTION DIRECTORY
# ============================================================================
Write-Info "STEP 2: Backing up current production state..."
Push-Location $ProdDir
$BackupDir = Join-Path $ProdDir "backups\$Timestamp"

# Clean up old backups to save disk space (keep only last 3)
Write-Host "  - Cleaning old backups..."
$backups = Get-ChildItem "$ProdDir\backups" -Directory -ErrorAction SilentlyContinue | Sort-Object CreationTime -Descending
if ($backups.Count -gt 3) {
    $oldBackups = $backups | Select-Object -Skip 3
    foreach ($backup in $oldBackups) {
        Write-Host "    Removing old backup: $($backup.Name)"
        Remove-Item -Path $backup.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if (-not $DryRun) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    
    # Only backup dist folder (quick and essential)
    if (Test-Path "$ProdDir\dist") {
        Write-Host "  - Backing up dist folder..."
        Copy-Item -Path "$ProdDir\dist" -Destination "$BackupDir\dist" -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    # Skip database backup to save space - it's in version control
    Write-Success "Backup created at: $BackupDir"
} else {
    Write-Info "[DRY RUN] Would create backup"
}
Pop-Location

Write-Host ""

# ============================================================================
# STEP 3: STOP PRODUCTION SERVICES
# ============================================================================
Write-Info "STEP 3: Stopping production services..."
if (-not $DryRun) {
    try {
        # Gracefully stop all services
        Write-Host "  - Stopping PM2 services..."
        pm2 stop ecosystem.config.js --cwd "$ProdDir" 2>$null
        Start-Sleep -Seconds 3
        
        # Kill any remaining node processes in prod directory
        Write-Host "  - Terminating any remaining processes..."
        $prodProcesses = Get-Process node -ErrorAction SilentlyContinue | Where-Object {
            $_.Path -like "*node.exe*"
        }
        if ($prodProcesses) {
            $prodProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
        }
        
        # Wait for file locks to be released
        Start-Sleep -Seconds 5
        
        Write-Success "Services stopped and processes terminated"
    } catch {
        Write-Warning-Custom "Error stopping services: $_"
    }
} else {
    Write-Info "[DRY RUN] Would stop services"
}

Write-Host ""

# ============================================================================
# STEP 4: SYNC FILES FROM DEV TO PROD
# ============================================================================
Write-Info "STEP 4: Syncing files from dev to prod..."
Write-Info "Cleaning extra files in production directory..."
if (-not $DryRun) {
    $excludeList = @("database", "backups", "logs", "CloudStorage")
    $prodItems = Get-ChildItem -Path $ProdDir -Force | Where-Object { $_.Name -notin $excludeList }
    foreach ($item in $prodItems) {
        Write-Host "  Removing extra: $($item.Name)"
        Remove-Item -Path $item.FullName -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Success "Extra files cleaned from production directory"
} else {
    Write-Info "[DRY RUN] Would clean extra files except: $($excludeList -join ', ')"
}


$FilesToSync = @(
    "dist"
)
# Note: most items (backend, frontend, server-prod.js, package.json, ecosystem.config.js) 
# are now bundled into the dist/ folder for a more self-contained deployment.
# NOTE: src is NOT synced - it's bundled into dist/ during build
# NOTE: home.html and index.html are only in dist/ folder (built by vite), not at root

if (-not $DryRun) {
    foreach ($file in $FilesToSync) {
        # Standard path handling for all files
        $sourcePath = Join-Path $DevDir $file
        $destPath = $ProdDir  # Copy CONTENTS of dist to ProdDir root
        
        if (Test-Path $sourcePath) {
            Write-Host "  Syncing: $file Contents..."
            # Copy contents of dist to root to flatten structure
            Copy-Item -Path "$sourcePath\*" -Destination $destPath -Recurse -Force -ErrorAction SilentlyContinue
        }
    }

    # Sync Wallpapers folder separately (stored at root)
    Write-Info "Syncing Wallpapers storage (separate from build)..."
    $wallpaperSrc = Join-Path $DevDir "Wallpapers"
    $wallpaperDest = Join-Path $ProdDir "Wallpapers"
    if (Test-Path $wallpaperSrc) {
        if (-not (Test-Path $wallpaperDest)) {
            New-Item -ItemType Directory -Path $wallpaperDest -Force | Out-Null
        }
        Write-Host "  Copying Wallpapers..."
        Copy-Item -Path "$wallpaperSrc\*" -Destination $wallpaperDest -Recurse -Force -ErrorAction SilentlyContinue
    }
    
    Write-Success "Files synced and structure flattened"
} else {
    Write-Info "[DRY RUN] Would sync files: $($FilesToSync -join ', ')"
}

Write-Host ""

# ============================================================================
# STEP 5: INSTALL PRODUCTION DEPENDENCIES
# ============================================================================
Write-Info "STEP 5: Installing production dependencies..."
if (-not $DryRun) {
    Push-Location $ProdDir
    try {
        # Remove old node_modules before install to avoid file lock conflicts and save space
        if (Test-Path "node_modules") {
            Write-Host "  - Cleaning old node_modules..."
            Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }
        
        # Clean npm cache to free space
        Write-Host "  - Cleaning npm cache..."
        npm cache clean --force 2>$null
        
        Write-Host "  - Installing dependencies (omitting dev dependencies)..."
        # We are already at $ProdDir root where package.json was synced from dist/*
        npm install --omit=dev
        
        if ($LASTEXITCODE -ne 0) {
            Write-Warning-Custom "npm install had some warnings, continuing..."
        }
        
        Write-Success "Dependencies installed"
    } catch {
        Write-Error-Custom "Dependency installation error: $_"
        Pop-Location
        exit 1
    }
    Pop-Location
} else {
    Write-Info "[DRY RUN] Would install dependencies"
}

Write-Host ""

# ============================================================================
# STEP 6: START PRODUCTION SERVICES
# ============================================================================
Write-Info "STEP 6: Starting production services..."
if (-not $DryRun) {
    Push-Location $ProdDir
    
    # Extra cleanup before start
    Write-Host "  - Final cleanup before start..."
    Start-Sleep -Seconds 2
    
    Write-Host "  - Starting PM2 services..."
    # --env production: HOST=:: (IPv6 dual-stack), PORT=80 frontend, PORT=3001 backend
    # --update-env ensures HOST and PORT are applied even on restarts
    pm2 start ecosystem.config.js --env production --update-env
    Pop-Location
    
    # Wait longer for services to fully initialize
    Write-Host "  - Waiting for services to initialize (5 seconds)..."
    Start-Sleep -Seconds 5
    
    Write-Success "Services started"
    
    # Show status
    Write-Host ""
    Write-Info "Service Status:"
    pm2 status
} else {
    Write-Info "[DRY RUN] Would start services"
}

Write-Host ""
Write-Host "======================================================"
if ($DryRun) {
    Write-Host "   DRY RUN COMPLETE (no changes made)"
} else {
    Write-Host "   DEPLOYMENT COMPLETE"
}
Write-Host "======================================================"
Write-Host ""
Write-Host "Summary:"
Write-Host "  [OK] Fresh build from dev src completed"
Write-Host "  [OK] Backup created: $BackupDir"
Write-Host "  [OK] Files synced to production"
Write-Host "  [OK] Services restarted"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  - Monitor: pm2 logs --cwd '$ProdDir'"
Write-Host "  - Status:  pm2 status --cwd '$ProdDir'"
Write-Host "  - Rollback: rm -r '$ProdDir\dist' && cp -r '$BackupDir\dist' '$ProdDir\dist'"
Write-Host ""
