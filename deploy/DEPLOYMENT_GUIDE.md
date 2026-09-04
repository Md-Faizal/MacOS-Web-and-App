# Unified Production & VM Configuration

## Overview
Both **Windows Production** and **Ubuntu VM** environments use the **exact same file structure, PM2 configuration, and Node.js setup**. The deployment process ensures perfect parity.

---

## File & Folder Structure (UNIFIED)

Both production deployments maintain this identical structure:

```
MacOS-Production/        (Windows C:\Users\HP\Desktop\...)
/home/ubuntu/MacOS       (Ubuntu via SSH)

├── scripts/              # Utility scripts (synced)
├── scripts_py/           # Python scripts (synced)
├── Assets/               # Wallpapers, images (synced)
├── dist/                 # Built frontend (from vite build)
├── logs/                 # PM2 service logs (local only)
├── .env.production       # Environment variables (synced)
├── manifest.json         # PWA manifest (synced)
├── CloudStorage/         # User uploaded files (local only, NOT synced)
└── database/             # SQLite databases (local only, NOT synced)
```

### What Does NOT Sync
- `src/` folder - bundled into `dist/` during build
- `home.html`, `index.html` - built into `dist/` by vite
- `node_modules/` - installed on each environment
- `database/`, `logs/`, `backups/`, `CloudStorage/` - local to each environment
- Windows-only files (`run-ipv6.bat`, `IPV6 UPDATER`) - Windows only

---

## PM2 Configuration (ecosystem.config.js)

### Unified App Names
Both environments use the same app names:

```javascript
{
  apps: [
    {
      name: 'backend',
      script: 'dist/src/api/main/macos-api-server.js',
      env: { NODE_ENV: 'production', PORT: '3001' }
    },
    {
      name: 'frontend',
      script: 'server-prod.js',
      env: { NODE_ENV: 'production', PORT: '3000' }
    }
  ]
}
```

---

## Environment Variables (.env.production)

Both environments use identical variables:

```bash
NODE_ENV=production
PORT=3001
```

---

## Deployment Scripts

### Windows Production
**File:** `MacOS-Production.ps1`
- Syncs: scripts, scripts_py, package.json, package-lock.json, server-prod.js, manifest.json, dist, Assets, ecosystem.config.js, .env.production, run-ipv6.bat, IPV6 UPDATER
- Startup: `pm2 start ecosystem.config.js`

### Ubuntu VM
**File:** `deploy-ubuntu.sh`
- Syncs: scripts, scripts_py, package.json, package-lock.json, server-prod.js, manifest.json, dist, Assets, ecosystem.config.js, .env.production
  *(Windows-only files excluded)*
- Startup: `pm2 start ecosystem.config.js`

### Key Difference
- **Windows:** runs locally
- **Ubuntu:** runs via SSH (`ssh $SSH_TARGET 'command'`)

Both use **identical PM2 ecosystem and Node.js commands**.

---

## Starting Services

### Windows Production
```powershell
# From C:\Users\HP\Desktop\MacOS Project\MacOS-Production
pm2 start ecosystem.config.js
```

### Ubuntu VM
```bash
# From /home/ubuntu/MacOS (via SSH)
pm2 start ecosystem.config.js
```

---

## File Sync Comparison

| File/Folder | Windows | Ubuntu | Reason |
|-------------|---------|--------|--------|
| scripts/ | ✓ | ✓ | Synced |
| scripts_py/ | ✓ | ✓ | Synced |
| Assets/ | ✓ | ✓ | Synced |
| dist/ | ✓ | ✓ | Synced (built locally) |
| ecosystem.config.js | ✓ | ✓ | Synced |
| server-prod.js | ✓ | ✓ | Synced |
| .env.production | ✓ | ✓ | Synced |
| package.json | ✓ | ✓ | Synced |
| manifest.json | ✓ | ✓ | Synced |
| src/ | ✗ | ✗ | Bundled in dist |
| home.html | ✗ | ✗ | In dist via vite |
| run-ipv6.bat | ✓ | ✗ | Windows only |
| IPV6 UPDATER | ✓ | ✗ | Windows only |
| CloudStorage/ | ✗ | ✗ | Local, never synced |
| database/ | ✗ | ✗ | Local, never synced |
| logs/ | ✗ | ✗ | Local, never synced |
| node_modules/ | ✗ | ✗ | Installed locally |

---

## Troubleshooting

### App Names Changed
If you see errors like: `Error: App [backend-prod] not found`

Update to new names: `backend` and `frontend`

### Services Not Starting
Check logs:
```bash
pm2 logs backend      # Both Windows and Ubuntu
pm2 logs frontend
```

### Port Conflicts
- Frontend: Port 3000
- Backend: Port 3001

Update ecosystem.config.js if needed.

---

## Summary

✅ **Identical configurations between Windows Production and Ubuntu VM**  
✅ **Same files, same folder structure**  
✅ **Same PM2 ecosystem.config.js**  
✅ **Same environment variables**  
✅ **Same Node.js and npm versions**  
✅ **Perfect parity - VM matches Production exactly**

