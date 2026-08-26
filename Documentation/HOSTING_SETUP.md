# Hosting Setup Documentation
**Last Updated:** March 12, 2026  
**Domain:** https://mac.faizal.uk

---

## Architecture Overview

This project runs on **two separate hosting environments** simultaneously:

| Environment | Host | Port | Binding | IP Version |
|---|---|---|---|---|
| Windows 11 | Local Machine | Frontend: 80, Backend: 3001 | `::` (dual-stack) | IPv6 primary |
| Ubuntu VM | Oracle Cloud / VPS | Frontend: 3000→Nginx:80, Backend: 3001 | `0.0.0.0` | IPv4 |

Cloudflare sits in front of both. DNS points to whichever is live.

---

## Windows 11 Setup

### Services (PM2 - `ecosystem.config.js` `env_production`)

| PM2 App | Script | Port | Role |
|---|---|---|---|
| `backend` | `backend/main/macos-api-server.js` | 3001 | API server |
| `frontend` | `server-prod.js` | 80 | Static file server + API proxy |
| `ipv6-updater` | `scripts_py/ipv6-updater.py` | — | Keeps Cloudflare AAAA record up to date |

### How it works
- Node.js (`server-prod.js`) binds to `::` on port 80 — this enables dual-stack IPv6+IPv4.
- Cloudflare resolves `mac.faizal.uk` to your Windows IPv6 address via AAAA record.
- The `ipv6-updater` Python script monitors your IPv6 and updates Cloudflare automatically.
- API requests to `/api/*` are proxied internally from port 80 → port 3001.

### Start command
```powershell
cd "C:\Users\HP\Desktop\MacOS Project\MacOS-Production"
pm2 start ecosystem.config.js --env production --update-env
```

---

## Ubuntu VM Setup

### Services (PM2 - `ecosystem.config.js` `env_oraclevm`)

| PM2 App | Port | Role |
|---|---|---|
| `backend` | 3001 | API server |
| `frontend` | 3000 | Static file server (behind Nginx) |

> `ipv6-updater` is **NOT** started on Ubuntu. It runs on Windows only.

### Nginx (`/etc/nginx/sites-available/mac.faizal.uk`)

Nginx handles port 80 on Ubuntu and routes traffic:

```
Internet :80 → Nginx
  /api/*        → proxy http://127.0.0.1:3001   (backend)
  /assets/*     → serve directly from disk       (Vite hashed bundles)
  /frontend/*   → serve directly from disk       (module CSS/JS)
  /Assets/Wallpaper/* → alias to ./Wallpapers/  (wallpaper images)
  /             → proxy http://127.0.0.1:3000   (frontend Node.js)
```

> **Important:** `/assets/` and `/frontend/` are served **directly from disk** by Nginx (not proxied to Node.js). This ensures correct MIME types for JS/CSS files.

### Start command
```bash
ssh my-mac
cd /home/ubuntu/MacOS-Production
pm2 start ecosystem.config.js --env oraclevm --only backend,frontend --update-env
pm2 save
```

### File locations on Ubuntu VM
```
/home/ubuntu/MacOS-Production/
├── assets/           ← Vite hashed JS/CSS bundles (synced from dist/)
├── frontend/         ← Frontend module files
├── backend/          ← Backend API source
├── Wallpapers/       ← Wallpaper image files (large, ~5GB)
├── index.html
├── home.html
├── server-prod.js
├── ecosystem.config.js
├── package.json
├── database/         ← SQLite database (NOT overwritten on deploy)
├── backups/          ← Auto-created deploy backups
└── logs/             ← PM2 log files

/etc/nginx/sites-available/mac.faizal.uk  ← Nginx config (synced by deploy)
/etc/nginx/sites-enabled/mac.faizal.uk    ← symlink to above
```

---

## Deployment Pipeline

### Dev → Windows Production
```
MacOS-Development/ 
  → npm run build (Vite)
  → dist/ created with hashed assets
  → MacOS-Production.ps1 copies dist/* to MacOS-Production/
  → pm2 restart --env production --update-env
```

### Dev → Ubuntu VM
```
MacOS-Development/
  → npm run build (Vite)
  → dist/ created with hashed assets
  → rsync dist/ → SSH → /home/ubuntu/MacOS-Production/
  → Nginx config uploaded and reloaded
  → pm2 restart --env oraclevm --update-env
```

Script: `bash "Deploy Scripts/deploy-ubuntu.sh"`

---

## Environment Variables (PM2)

Set in `ecosystem.config.js` per environment block:

| Variable | `env_production` (Windows) | `env_oraclevm` (Ubuntu) |
|---|---|---|
| `NODE_ENV` | `production` | `oraclevm` |
| `PORT` (frontend) | `80` | `3000` |
| `PORT` (backend) | `3001` | `3001` |
| `HOST` | `::` (IPv6 dual-stack) | `0.0.0.0` (IPv4) |
| `API_PORT` | `3001` | `3001` |

---

## Known Issues & Fixes

### Error 522 (Cloudflare timeout)
- **Cause:** Server not binding to the correct IP version
- **Windows fix:** Ensure `HOST=::` in `env_production` and always use `--update-env`
- **Ubuntu fix:** Nginx must be running and `frontend` app on port 3000

### CSS/JS 404 after deploy
- **Cause:** Vite hashes change on every build. Old hashed files no longer exist.
- **Fix:** Run full deploy (build + sync). Check `dist/assets/` exists before deploying.

### CSS MIME type error (`text/html` for `.css`)
- **Cause:** Nginx serving its HTML 404 error page for missing CSS file, OR wrong Nginx config active
- **Fix:** 
  1. Check `ls /etc/nginx/sites-enabled/` — remove duplicate configs
  2. Verify `dist/assets/` was properly synced to VM

### "conflicting server name" Nginx warning
- **Cause:** Multiple Nginx site configs define the same `server_name`
- **Fix:** `ssh my-mac 'sudo rm /etc/nginx/sites-enabled/<OLD>' && sudo nginx -t && sudo systemctl reload nginx`

### PM2 "Environment not defined" warning
- **Cause:** `env` blocks not named correctly (must be `env_production`, not `env`)
- **Fix:** Already fixed in `ecosystem.config.js` — always pass `--env production` or `--env oraclevm`

---

## SSH Configuration

The SSH alias `my-mac` is configured in `~/.ssh/config`:
```
Host my-mac
    HostName <UBUNTU-VM-IP>
    User ubuntu
    IdentityFile ~/.ssh/<your-key>
```

