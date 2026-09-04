#!/usr/bin/env powershell
<#
.SYNOPSIS
    Initialize production environment
.DESCRIPTION
    Creates Website-Prod folder structure and initial setup
#>

# Function definitions
function Write-Success($msg) { Write-Host -ForegroundColor Green "✓ $msg" }
function Write-Error-Custom($msg) { Write-Host -ForegroundColor Red "✗ $msg" }
function Write-Info($msg) { Write-Host -ForegroundColor Cyan "ℹ $msg" }

$DevDir = "C:\Users\HP\Desktop\MacOS Project\Website"
$ProdDir = "C:\Users\HP\Desktop\MacOS Project\Website-Prod"

Write-Host "════════════════════════════════════════════════════"
Write-Host "   PRODUCTION ENVIRONMENT SETUP"
Write-Host "════════════════════════════════════════════════════"
Write-Host ""

# Check dev exists
if (-not (Test-Path $DevDir)) {
    Write-Error-Custom "Development folder not found: $DevDir"
    exit 1
}

Write-Info "Creating production directory structure..."

# Create main directories
$Directories = @(
    $ProdDir,
    "$ProdDir\logs",
    "$ProdDir\backups",
    "$ProdDir\database"
)

foreach ($dir in $Directories) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "  Created: $dir"
    }
}

Write-Success "Directory structure created"
Write-Host ""

Write-Info "Copying necessary files..."

# Copy ecosystem config (already created but verify)
if (-not (Test-Path "$DevDir\config\ecosystem.config.js")) {
    Write-Error-Custom "ecosystem.config.js not found in config folder"
    Write-Info "Please create it first using the earlier steps"
    exit 1
}
Write-Success "ecosystem.config.js present"

# Copy package files
Copy-Item "$DevDir\package.json" -Destination "$ProdDir\package.json" -Force
Copy-Item "$DevDir\package-lock.json" -Destination "$ProdDir\package-lock.json" -Force -ErrorAction SilentlyContinue
Copy-Item "$DevDir\config\ecosystem.config.js" -Destination "$ProdDir\config\ecosystem.config.js" -Force
Write-Success "package.json copied"

Write-Host ""
Write-Info "Installing production dependencies..."
Push-Location $ProdDir
npm ci --only=production
if ($LASTEXITCODE -ne 0) {
    Write-Error-Custom "npm ci failed"
    Pop-Location
    exit 1
}
Pop-Location
Write-Success "Dependencies installed"

Write-Host ""
Write-Info "Creating README for production folder..."

$ReadmeContent = @"
# Website-Prod

Production deployment folder for Mac Website API.

## ⚠️ IMPORTANT NOTES

1. **Database** (`database/` folder)
   - This contains REAL production data
   - NEVER delete or overwrite this folder
   - Backups are created automatically before each deployment

2. **Logs** (`logs/` folder)
   - PM2 service logs are here
   - Check these for debugging issues

3. **Backups** (`backups/` folder)
   - Automatic timestamped backups before each deploy
   - Can rollback by copying from here if needed

## Quick Commands

```powershell
# Check status
pm2 status

# View logs
pm2 logs

# View specific service
pm2 logs backend-prod
pm2 logs frontend-prod
pm2 logs ipv6-updater-prod

# Restart a service
pm2 restart backend-prod

# Stop all services
pm2 stop config\ecosystem.config.js

# Start all services
pm2 start config\ecosystem.config.js
```

## Deployment Process

Always deploy from the development folder:

```powershell
cd C:\Users\HP\Desktop\MacOS Project\Website
.\scripts\deploy.ps1
```

This will automatically:
1. Build frontend
2. Sync files to Website-Prod
3. Stop services
4. Create backup
5. Install dependencies
6. Restart services

## Monitoring

Monitor production 24/7:

```powershell
pm2 monit --cwd "$PWD"
```

## Emergency Rollback

If something breaks:

```powershell
# 1. Check what happened
pm2 logs

# 2. Stop services
pm2 stop config\ecosystem.config.js

# 3. Restore from backup (replace DATE)
Copy-Item "backups\2026-02-08_15-30-45\*" -Destination "." -Recurse -Force

# 4. Restart
pm2 start config\ecosystem.config.js
```

---

Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
"@

Set-Content -Path "$ProdDir\README.md" -Value $ReadmeContent
Write-Success "README.md created"

Write-Host ""
Write-Host "════════════════════════════════════════════════════"
Write-Host "   PRODUCTION SETUP COMPLETE"
Write-Host "════════════════════════════════════════════════════"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Deploy from dev folder:"
Write-Host "     cd 'C:\Users\HP\Desktop\MacOS Project\Website'"
Write-Host "     .\deploy.ps1"
Write-Host ""
Write-Host "  2. Verify production is running:"
Write-Host "     pm2 status --cwd '$ProdDir'"
Write-Host ""
Write-Host "  3. Monitor logs:"
Write-Host "     pm2 logs --cwd '$ProdDir'"
Write-Host ""
