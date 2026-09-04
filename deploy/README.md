# Scripts Directory

This directory contains utility scripts for deployment and maintenance.

## Files

- **deploy.ps1** - Automated deployment script for moving changes from development to production
- **ipv6-updater.ps1** - Updates Cloudflare DNS with current IPv6 address for dynamic IP support

## Usage

### Deployment

```powershell
# From project root
cd 'C:\Users\HP\Desktop\MacOS Project\Website'
.\scripts\deploy.ps1
```

**What it does:**
- Builds the frontend (Vite)
- Syncs files to production directory
- Stops running services
- Creates automatic backup
- Installs/updates dependencies
- Restarts services with PM2

### IPv6 Updater

```powershell
# Manual run
powershell -ExecutionPolicy Bypass -File scripts\ipv6-updater.ps1

# Via npm
npm run ipv6:update

# Scheduled (runs automatically in production)
pm2 start config/ecosystem.config.js
```

**What it does:**
- Retrieves current IPv6 address
- Updates Cloudflare DNS records
- Logs updates for monitoring

## Configuration

These scripts use settings from:
- `config/ecosystem.config.js` - PM2 process configuration
- `config/setup-prod.ps1` - Production paths and settings
- Environment variables (if configured)

## Troubleshooting

### Deployment fails
1. Verify production directory exists: `C:\Users\HP\Desktop\Website-Prod`
2. Check firewall rules allow the PowerShell process
3. Ensure sufficient disk space on target drive
4. Review logs: `pm2 logs`

### IPv6 updater not updating
1. Verify Cloudflare API credentials
2. Check IPv6 connectivity: `ipconfig /all | findstr IPv6`
3. Review logs: `pm2 logs ipv6-updater-prod`
4. Ensure DNS recordID is correct in ecosystem.config.js
