# 🚀 Overkill Architecture Roadmap & Future Enhancements

This document outlines high-impact architectural enhancements designed to elevate the **macOS Web & Cloud Desktop** stack to industry-leading performance, security, and durability—tailored specifically to run efficiently within a **1GB RAM VM**.

---

## 📋 Roadmap Overview

| Priority | Feature | Category | Primary Benefit | Resource Impact |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | **Litestream Real-Time DB Streaming** | Data Durability | Sub-second RPO, Point-in-Time Recovery | < 10 MB RAM |
| **Phase 2** | **Cloudflare R2 Media CDN** | Performance | Zero-RAM 4K streaming & APK downloads | 0 MB RAM (Offloaded) |
| **Phase 3** | **Cloudflare Zero-Trust Tunnel** | Security | 100% closed inbound firewall ports (Ghost VM) | ~15 MB RAM |
| **Phase 4** | **Self-Healing Auto-Recovery** | High Availability | Auto-restarts/swaps broken containers | 0 MB RAM (External) |
| **Phase 5** | **WASM In-Browser Edge Cache** | UX Performance | 0ms instant app opening | 0 MB RAM (Client-side) |
| **Phase 6** | **WebRTC P2P AirDrop** | Collaboration | Device-to-device LAN transfers (100MB/s+) | 0 MB RAM (P2P) |

---

## 1. 🛡️ Phase 1: Real-Time SQLite Streaming with Litestream

### Objective
Upgrade periodic snapshots to continuous, sub-second SQLite replication directly into **Cloudflare R2**.

### Architecture
- **Tool:** [Litestream](https://litestream.io) (single lightweight Go binary, <10MB RAM).
- **Mechanism:** Monitors SQLite's Write-Ahead Log (`MacOS.db-wal`) in real-time. Every committed transaction is compressed, encrypted, and streamed to Cloudflare R2 within **1 second**.
- **Point-in-Time Recovery (PITR):** Allows rolling back the database to any exact second (e.g. `2026-09-05T13:45:00Z`), completely eliminating data loss risk.

### Implementation Checklist
1. Install Litestream binary on the host or inside a sidecar container:
   ```bash
   wget https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz
   tar -xzf litestream-v0.3.13-linux-amd64.tar.gz -C /usr/local/bin/
   ```
2. Create `/etc/litestream.yml`:
   ```yaml
   dbs:
     - path: /home/ubuntu/MacOS-Production/database/MacOS.db
       replicas:
         - type: s3
           bucket: macos-db-backups
           path: litestream/MacOS.db
           endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
           access-key-id: <R2_ACCESS_KEY_ID>
           secret-access-key: <R2_SECRET_ACCESS_KEY>
   ```
3. Enable systemd service: `sudo systemctl enable --now litestream`.

---

## 2. ⚡ Phase 2: Zero-RAM Media & Static CDN (Cloudflare R2 + CDN)

### Objective
Completely eliminate Node.js memory spikes and bandwidth saturation caused by serving 4K dynamic video wallpapers, heavy PDF invoice generations, and Android APK downloads.

### Architecture
- Heavy assets reside in **Cloudflare R2**.
- Bound to a custom domain: `cdn.faizal.uk` with Cloudflare edge caching rules (`Cache-Control: public, max-age=31536000, immutable`).
- When a user changes wallpaper or downloads an APK, the browser fetches it from Cloudflare's nearest edge server. The 1GB VM receives **0 requests**.

### Implementation Checklist
1. Create a dedicated R2 bucket: `macos-media-assets`.
2. Connect a custom domain in Cloudflare dashboard: `cdn.faizal.uk`.
3. Update `frontend/scripts/desktop/wallpaper-controller.js` and APK release links to prefix `https://cdn.faizal.uk/...`.
4. Upload `Wallpapers/` and Android APK artifacts using `rclone` or AWS CLI.

---

## 3. 👻 Phase 3: Cloudflare Zero-Trust Tunnel ("Ghost Server")

### Objective
Lock down the Ubuntu VM so that **zero inbound ports are open to the public internet** (no open port 80, 443, or 22).

### Architecture
- Runs `cloudflared` daemon as a lightweight outbound tunnel.
- The Oracle Cloud and `ufw` firewalls drop all incoming traffic from the public web.
- Only authenticated requests passing through Cloudflare's DDoS protection and WAF are forwarded through the secure tunnel to `localhost:3001`/`localhost:3004`.
- **SSH access** is placed behind Cloudflare Zero Trust (browser-based web terminal or SSH over Cloudflare Access), defeating brute-force bot attacks completely.

### Implementation Checklist
1. Install `cloudflared` on the VM:
   ```bash
   curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   sudo dpkg -i cloudflared.deb
   ```
2. Create tunnel: `cloudflared tunnel create macos-production`.
3. Configure ingress rules to route `mac.faizal.uk` to `http://localhost:80` (or directly to upstream socket).
4. Close public ports:
   ```bash
   sudo ufw default deny incoming
   sudo ufw enable
   ```

---

## 4. 🤖 Phase 4: Self-Healing Docker Auto-Recovery

### Objective
Enable the server to autonomously detect container degradation and execute a Blue/Green rollback or restart without human intervention.

### Architecture
- Better Stack or an external health probe detects 3 consecutive non-200 responses.
- Fires a secure Webhook to GitHub Actions or a lightweight local webhook listener.
- Executes `deploy/ubuntu/deploy-docker.sh --target <standby-slot>` automatically.
- Sends a push notification to your phone: *"Service recovered automatically via slot flip."*

---

## 5. ⚡ Phase 5: WASM / Client-Side Offline Data Acceleration

### Objective
Make opening desktop apps (Notes, Contacts, Product Catalog) instantaneous (0ms perceived latency).

### Architecture
- On desktop load, cache app schemas and recent catalog entries into client-side **IndexedDB**.
- Use optimistic UI rendering: apps open instantly from local cache while background `fetch()` checks for delta updates via `ETag` or `If-Modified-Since`.
- Full offline capabilities when internet connectivity is intermittent.

---

## 6. 📡 Phase 6: WebRTC P2P AirDrop for Desktop Sessions

### Objective
Enable high-speed peer-to-peer file transfer between devices (e.g. desktop browser to Android phone) with zero server storage and zero bandwidth consumption.

### Architecture
- Use WebSockets on the server only for initial SDP signaling.
- Once connected, file chunks stream directly via **WebRTC DataChannels** over local Wi-Fi / LAN at 50–100+ MB/s.
- Dropping a file onto another user's avatar transfers it directly from browser memory to browser memory.
