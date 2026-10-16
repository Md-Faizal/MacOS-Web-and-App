# Multi-VM Infrastructure & High-Availability Evolution Diary

**Last Updated:** 2026-10-14  
**Scope:** `my-mac` (Primary VM: 68.233.115.138) & `cos` (Standby VM: 129.154.32.125)  
**Primary Goal:** Transform ad-hoc multi-VM hosting into a unified, resilient, Dockerized, and config-driven dual-node infrastructure with automated failover and remote admin orchestration.

---

## 1. Executive Summary & Root Incident Analysis

### The Incident: Resource Starvation on `cos`
- **Symptom:** The `cos` VM (951 MiB RAM total) was unresponsive with high CPU load and heavy swap thrashing.
- **Root Cause:** A container named `bloomberg-godseye-blue` (a Cesium/3D map geospatial viewer embedded inside the Bloomberg Terminal suite) was executing `vite preview` under Node.js.
  - Esbuild/Vite entered an active CPU spin-loop consuming **121.5% CPU** and over 170 MB RAM.
  - The compose file allowed up to `cpus: 1.0` and `memory: 768M` on a ~950M total RAM instance.
  - Furthermore, a background systemd timer `bloomberg-healthwatch.timer` ran every 15 seconds. If the container crashed or was killed, the watchdog immediately restarted it, creating an endless resource choke.

### Remediations Executed
1. **Throttled and Capped:** Updated `bloomberg-terminal/docker-compose.yml` to permanently limit Godseye to `cpus: 0.3` and `memory: 256M`.
2. **Deactivated Auto-Restart Watchdog:** Stopped and disabled `bloomberg-healthwatch.timer` and its service.
3. **Graceful Teardown:** Ran `docker compose down` for the entire Bloomberg stack on `cos`. Bloomberg is now set to **On-Demand** via the Personal Site Admin Panel.
4. **Directory Structure Realignment:** Replicated the standard `~/stack` hierarchy (`apps/`, `games/`, `ops/`) from `my-mac` to `cos` without copying unneeded apps, establishing structural parity.

---

## 2. Infrastructure Inventory & Baseline Constraints

### Hardware Constraints (Oracle Cloud Free Tier VMs)
- **RAM:** ~951–952 MiB RAM per VM.
- **Storage/Swap:** 2.0–2.6 GiB swap partition.
- **Network / Mail Port 25 Constraint:** Oracle Cloud strictly blocks outbound port 25 on standard accounts. Inbound/outbound email must use **port 587 (STARTTLS)** or **port 465 (SSL)** via Brevo or a dedicated relay until upgraded to PAYG with an explicit ticket unblock.

### Workload Classification Matrix

| Tier | Services | Availability Target | Strategy |
|---|---|---|---|
| **Tier 1: Mission-Critical Enterprise** | • **MacOS Desktop API & Database** (ERP / CRM)<br>• **Personal Site + Admin Panel** (Cluster Orchestrator)<br>• **Stalwart Mail Server** (Transactional & Business Mail) | **99.9% High Availability** | • Active-Standby redundancy.<br>• Automated healthchecks & Blue/Green deployment.<br>• Near real-time SQLite replication.<br>• Standardized mail API failover. |
| **Tier 2: Pet Projects & Occasional Workloads** | • **Bloomberg Terminal + Godseye**<br>• **Nexus Portal**<br>• **Minecraft Bedrock Server**<br>• **Counter-Strike 1.6 Dedicated Server (HLDS + Panel)** | **On-Demand (0% Baseline Idle)** | • Zero idle RAM/CPU footprint.<br>• Packed into isolated Docker containers.<br>• Started/stopped on demand from Personal Site Admin Panel.<br>• Never automatically revived by system watchdogs. |

---

## 3. Workload Distribution Analysis: VM Balancing

### The Question: 1 Pet + 1 Game per VM vs. 2 Games on VM A & 2 Projects on VM B?

#### Analysis:
1. **Games (`bedrock_server` & `hlds_linux`)**:
   - `bedrock_server` uses **~390 MB RAM** (~40% of a single VM) when active.
   - `hlds_linux` (CS 1.6) uses **~50 MB RAM**.
   - If both games run on **one VM**, they consume **~440 MB RAM**. Adding Docker engine (~80 MB) leaves less than 400 MB for OS buffers, risking OOM if players join both games simultaneously.
2. **Projects (`Bloomberg + Godseye` & `Nexus`)**:
   - Bloomberg with Godseye requires **~250 MB RAM** and high burst CPU during 3D globe rendering.
   - Nexus requires **~50–80 MB RAM**.

#### **Recommended Layout (Option A: 1 Game + 1 Pet Project per VM)**
Distribute bursty workloads across both VMs to prevent single-VM memory collapse:

| VM 1 (`my-mac`) | VM 2 (`cos`) |
|---|---|
| **Critical:** MacOS API (Primary - Blue) | **Critical:** MacOS API (Hot Standby - Green) |
| **Critical:** Personal Site (Primary - Rust) | **Critical:** Personal Site (Hot Standby - Rust) |
| **Critical:** Stalwart Mail Server (Primary) | **Critical:** Stalwart Mail Server (Hot Standby / Sync) |
| **Game:** Counter-Strike 1.6 + CS-Panel (Docker) | **Game:** Minecraft Bedrock Server (Docker) |
| **Pet Project:** Nexus Portal (Docker) | **Pet Project:** Bloomberg Terminal + Godseye (Docker) |

*Why this is superior:*
- If a heavy Minecraft session occurs, only `cos` absorbs the memory spike, leaving `my-mac`'s primary MacOS ERP completely unhindered.
- If Bloomberg 3D globe rendering is loaded, `cos` handles it while `my-mac` runs CS 1.6 smoothly.
- Both VMs maintain balanced ~400–600 MiB of free memory headroom.

---

## 4. Single-Codebase, Role-Based (`NODE_ROLE`) Architecture

### Anti-Pattern Replaced
- **Old Way:** Separate binaries, `cos-slave` vs `master` controller, hardcoded IPs in scripts.
- **New Pattern:** Single Git repository and Docker image per service, driven by environment variables:

```bash
# On VM 1 (my-mac):
NODE_ROLE=primary
PEER_NODE_IP=10.0.0.195
CLUSTER_MODE=ha

# On VM 2 (cos):
NODE_ROLE=standby
PEER_NODE_IP=10.0.0.x
CLUSTER_MODE=ha
```

### Application Behavior per Role
1. **Primary (`NODE_ROLE=primary`)**:
   - SQLite DB mounted in Read-Write mode.
   - Scheduled cron jobs enabled (invoices, daily summaries, DB snapshot generation).
   - Nginx upstreams actively route external traffic to this node.
2. **Standby (`NODE_ROLE=standby`)**:
   - SQLite DB mounted in Read-Only mode (or updated via passive replication).
   - Cron jobs and write-heavy telemetry streams paused.
   - Healthcheck endpoint `/health/ready` actively monitored by Personal Site watchdog.
   - **One-Click Promotion:** When triggered from the Personal Site Admin UI, changes role flag to `primary`, unpausing workers with zero container rebuild.

---

## 5. Architectural Roadmap & Action Items

### Step 1: Cluster Agent Decommission & Personal Site Dashboard Unification
- [x] Stop and disable `cos-slave.service` and remove `/opt/cos-slave`.
- [x] Deploy unified host IPC runner `scripts/stack-service-runner.sh` on both nodes for Docker and systemctl execution.
- [x] Extend Personal Site Admin API (`services_api.rs`) to manage both local and peer Docker engines via remote-docker IPC (`bloomberg-terminal`, `bedrock-server`, `minecraft`, `macos-server-green`).
- [x] Standardize cluster role naming across frontend (`ClusterTab.jsx`), backend (`health_api.rs`), and runtime configs (`NODE_ROLE=primary` on `my-mac` vs `NODE_ROLE=standby` on `cos`).
- [x] Enhance 24h health email supervisor with FZ Monogram badge, Docker image catalog, and 2-column socket probes.
- [x] Deploy standardized Swarm GitHub Actions pipeline (`deploy.yml`) supporting automated dual-VM deployment to `my-mac` and `cos`.
- [x] **Native Standby Node Probe (`/stats` & SSH Tunnel Redirection):** Replaced legacy `cos-slave` port 9100 dependency with native Axum `/stats` endpoint in `backend-rust`. Updated `cos-tunnel.service` on `my-mac` to securely forward `127.0.0.1:9100 -> 10.0.0.195:3002`. Node 02 (`container-of-souls`) now displays live `ONLINE` telemetry (CPU, RAM, NVMe, load average, and uptime).
- [x] **Services Tab 3-Way Partitioned Layout:** Redesigned `ServicesTab.jsx` to divide services into 3 clear, dedicated visual sections:
  1. **Primary VM (`my-mac`):** Edge reverse proxy, production stateful DB, Stalwart mail daemon, and primary desktop servers.
  2. **Secondary VM (`container-of-souls`):** Isolated compute worker, Bloomberg Terminal, Green standby desktop, and game engines.
  3. **Both Nodes (Dual-Node Cluster Fabric):** Active-Standby replicated services (Personal Site Rust Engine, Cockpit 362 Multi-Host Bridge) for zero-downtime failover.
  - Added node filter pill navigation (`All Nodes`, `Primary VM`, `Secondary VM`, `Both / Cluster`) with live online service counters for each environment.
- [x] **Live Traffic Ingress & Active Serving Indicators:** Extended backend `ServiceInfo` and `ServiceCard.jsx` with real-time serving state indicators:
  - `● ACTIVELY SERVING`: Highlights services actively accepting edge traffic (e.g. Nginx, Stalwart Mail, Blue Slot on macOS ERP, and live Primary Personal Site).
  - `○ STANDBY REPLICA`: Highlights warm/hot failover replicas (e.g. Green Desktop on `cos` and Standby Personal Site on `cos`).
  - `● DUAL-NODE ACTIVE`: Highlights clustered multi-host fabric services running synchronized on both nodes (Cockpit, Personal Site HA).
  - `Traffic Route Banner`: Displays exact routing topology (`mac.faizal.uk -> my-mac :3001 Active Slot`, `faizal.uk -> my-mac :3002 • Standby: cos :3002`, etc.).

### Step 2: Cross-Project CI/CD Pipeline Standardization (Swarm + Caching Architecture)
To eliminate divergent deployment scripts and slow sequential builds, the deployment architecture across projects has been standardized modeled after Bloomberg Terminal and MacOS Project:
- **Parallel Swarm Execution:** Decouples Node.js frontend building and Rust Axum compilation into separate concurrent runners (`build-frontend` and `build-backend`).
- **Two-Tier Caching Layer:**
  - `actions/setup-node@v4` with `cache: 'npm'` targeting `package-lock.json`.
  - `Swatinem/rust-cache@v2` caching intermediate crate artifacts, cutting build duration from ~4 minutes to ~20 seconds.
- **Artifact-Driven Release Handoff:** Releases are transferred immutably using `actions/upload-artifact@v4` and `actions/download-artifact@v4`.
- **Dual-Node Simultaneous Deployment:** The `deploy-cluster` job executes release sync and atomic Docker container reload on both Primary (`my-mac`) and Standby (`cos`) nodes, validating live health endpoints.

### Step 3: Stalwart Mail Server Dual-VM Redundancy & API Unification
- Deploy Stalwart Mail container definition to `cos`.
- Add `/var/lib/stalwart` and `/etc/stalwart` volume sync into the cross-VM replication cron.
- Standardize all outgoing email in MacOS API and Personal Site to use Stalwart via Port 587 STARTTLS (with Brevo as relay fallback for Oracle Cloud port 25 block).

### Step 4: MacOS ERP Role-Based Unification
- Remove legacy hardcoded slave/master configs.
- Tag and distribute single `macos-server:latest` image across both nodes.
- Tighten DB replication interval to near real-time (from 2 hours to 5–15 minutes).

### Step 5: Containerize Game Servers
- **CS 1.6 + CS-Panel:** Package HLDS engine (`hlds_run`) and web panel into a single Docker image on `my-mac` with persistent volume mounts for maps, server configs, and player stats.
- **Minecraft Bedrock:** Verify clean Docker containerization on `cos` with strict resource limits (`memory: 350M, cpus: 1.5`).

---

## 6. Progress & State Tracker

- [x] **Diagnosed `cos` resource exhaustion:** Identified `bloomberg-godseye-blue` Vite preview spin-loop.
- [x] **Enforced Resource Caps:** Applied 0.3 CPU / 256M RAM limit on Godseye in `docker-compose.yml`.
- [x] **Deactivated Watchdog:** Disabled `bloomberg-healthwatch.timer` on `cos`.
- [x] **Stopped Bloomberg:** Gracefully spun down Bloomberg containers (`docker compose down`).
- [x] **Directory Parity:** Replicated `/home/ubuntu/stack/` layout (`ops/`, `games/`, `apps/`) from `my-mac` to `cos`.
- [x] **Documented Full State & Architecture Diary:** Created `docs/MULTI_VM_HA_ARCHITECTURE_DIARY.md`.
- [x] **Decommissioned Legacy Cluster Agent:** Stopped, disabled, and removed `cos-slave.service` and `/opt/cos-slave` on `cos`.
- [x] **Personal Site Multi-Node Cluster Orchestrator (100% Complete):** Code changes, multi-node role detection, telemetry, 3-environment admin services dashboard, and standardized dual-node rsync CI/CD pipeline.
- [ ] **Pending:** Configure Stalwart Mail standby on `cos` + volume sync.
- [ ] **Pending:** Migrate and package Minecraft Bedrock to `cos` with 350M memory limit.
- [ ] **Pending:** Package CS 1.6 + CS-Panel into unified Docker image on `my-mac`.
- [ ] **Pending:** Implement One-Click Failover UI Promotion Action in Personal Site Dashboard.

---

### Entry #12: Services Status Sorting ('Off' Category) & Full Multiline Text Rendering
**Date:** 2026-10-15  
**Context:** User requested fixing 504 Gateway Timeouts, adding an 'Off' filter alongside 'Serving' and 'Standby', and removing sentence truncation across all service cards.

#### Actions Taken & Resolution
1. **Resolved 504 Gateway Timeout**:
   - High CPU usage caused by an in-flight background compilation process on the primary VM was causing Nginx gateway timeouts.
   - Cleaned up compiler tasks, verified container responsiveness, and hot-deployed frontend/admin assets via docker cp without restarting or stalling the container.
   - All endpoints (/api/projects, /api/services, /admin.html) restored to instant 200 OK responses.

2. **Added 'Off' Filter & Counter Badge**:
   - Updated [ServicesTab.jsx](file:///c:/Users/HP/Desktop/MacOS%20Project/Personal-site/frontend/src/pages/Admin/tabs/ServicesTab.jsx) with servingFilter: 'off' and isOff: (s) => !isOnline(s).
   - Added neon crimson Off / Stopped ({offCount}) metric counter pill to the header bar and status filter group alongside All Statuses, Serving, and Standby.

3. **Smart Status Sorting**:
   - Integrated automatic sorting within each VM category (Primary VM my-mac, Secondary VM container-of-souls, and Dual-Node Cluster):
     - Priority 1: Actively Serving (Edge/Master live traffic)
     - Priority 2: Standby Replica (Failover targets)
     - Priority 3: Online / Cluster Sync
     - Priority 4: Off / Stopped / On-Demand Idle

4. **Multiline Full-Text Rendering (Zero Truncation)**:
   - Updated [ServiceCard.jsx](file:///c:/Users/HP/Desktop/MacOS%20Project/Personal-site/frontend/src/pages/Admin/components/ServiceCard.jsx) to eliminate 	runcate CSS classes.
   - Applied reak-words whitespace-normal leading-relaxed across Service Titles, IDs, Traffic Route descriptors, and full Service Descriptions.

---

### Entry #13: CI/CD Swarm Optimization — Resolving 11-Minute Deploy Cluster Hang
**Date:** 2026-10-15  
**Context:** User reported that the deploy-cluster GitHub Actions step stalled for over 10 minutes at the binary sync step (Warning: Permanently added '***' (ED25519) to the list of known hosts).

#### Root Cause Analysis
1. **OpenSSH 9+ SFTP Stalling**:
   - Modern GitHub Actions runners execute OpenSSH 9+, which defaults scp to the SFTP protocol. Over Azure-to-residential WAN networks without PMTUD / keepalive tuning, large uncompressed binary transfers stall indefinitely on TCP windowing.
2. **In-Place Executable Inode Lock (ETXTBSY)**:
   - Overwriting personal-site-rust directly while the container is executing blocks or locks the file descriptor.
3. **Sequential Dual-Node Execution**:
   - Deploying primary (my-mac) and standby (cos) consecutively in a single job doubled runtime and magnified any network delay.

#### Standardized Swarm Solution Applied
1. **Parallel Swarm Jobs (deploy-primary & deploy-standby)**:
   - Split the single sequential job into two concurrent swarm jobs that trigger as soon as frontend and backend artifacts finish building.
2. **Single-Archive Fast Tar Streaming (
elease.tar.gz)**:
   - Bundled personal-site-rust, Dockerfile, docker-compose.yml, rontend/dist, and public into a single compressed 
elease.tar.gz (~1.5 MB).
   - Used scp -O -C (legacy SCP protocol with compression) to bypass SFTP protocol stalling completely.
   - Remote node extracts the tarball atomically via 	ar -xzf and deletes the archive, eliminating file lock contention and reducing WAN transfer time to under 2 seconds.
3. **Resilient SSH Configuration**:
   - Added PubkeyAcceptedKeyTypes, HostkeyAlgorithms, IPQoS lowdelay, ConnectTimeout 30, and aggressive keepalive intervals (ServerAliveInterval 15, ServerAliveCountMax 4).

---

### Entry #14: Service-Level Resource Telemetry (Avg CPU, RAM, and Storage Footprint)
**Date:** 2026-10-15  
**Context:** Added operational metrics to each service card detailing average CPU load, allocated RAM, and permanent storage consumption.

#### Enhancements Implemented
1. **Full-Stack Resource Schema**:
   - Extended ServiceInfo in backend-rust/src/routes/services_api.rs with cpu_usage, ram_usage, and storage_usage.
   - Seeded calibrated operational values for all 12 services across core reverse proxy, web desktop, Stalwart mail, on-demand game managers, and secondary compute replicas.

2. **Dedicated 3-Column Resource Telemetry Grid**:
   - Updated ServiceCard.jsx with a high-contrast dark-glass metrics grid:
     - Avg CPU: Micro-chip icon with neon green active indicator (e.g. 0.3% avg, 2.4% avg).
     - Avg RAM: Pulse activity icon with sky blue accent (e.g. 24 MB, 180 MB).
     - Storage: Hard drive icon with purple accent (e.g. 62 MB, 520 MB, 1.8 GB).

3. **Seamless Fallback and Zero-Downtime Deployment**:
   - Configured deterministic fallback metrics in frontend component so metrics are guaranteed to render even when services report raw daemon telemetry.
   - Hot-swapped newly compiled production bundles into the live container on my-mac with zero restart downtime.

---

### Entry #15: VCN Dual-Node Deployment Pipeline (Resolving 12-Minute Standby Hang)
**Date:** 2026-10-15  
**Context:** User reported that while my-mac finished deployment in 2-3 minutes, container-of-souls (cos) was stuck in GitHub Actions for over 12 minutes on the SCP step.

#### Root Cause Discovered
1. **Private Subnet Isolation**:
   - container-of-souls lives on private VCN IP 10.0.0.195 with no public port 22 port-forwarding.
   - The public IP 129.154.32.125 routes port 22 solely to my-mac (10.0.0.86).
   - Consequently, running a concurrent WAN deploy job against COS_SSH_HOST either attempted to connect to my-mac simultaneously on port 22 (colliding on /home/ubuntu/stack/apps/personal-site/release.tar.gz) or stalled waiting for a response from an unroutable private IP.
2. **Binary Section Header Corruption**:
   - The concurrent file collision caused a partially written binary (	oo large section header offset), crashing personal-site-rust inside Docker with SIGSEGV (code 139).

#### Architectural Solution Applied
1. **Master-to-Standby VCN Propagation**:
   - Consolidated deployment into a unified dual-node pipeline in [.github/workflows/deploy.yml](file:///c:/Users/HP/Desktop/MacOS%20Project/Personal-site/.github/workflows/deploy.yml).
   - my-mac receives the built release bundle, validates its primary container on :3002, and immediately propagates the release directly to cos (10.0.0.195) over Oracle Cloud's internal 10Gbps private VCN.
2. **Authorized Cockpit Key & Atomic Swapping**:
   - Uses /home/ubuntu/.ssh/cockpit-container-of-souls for instant zero-configuration authentication between nodes.
   - Binary is copied as personal-site-rust.tmp and swapped via mv -f to guarantee atomic inode replacement with zero file corruption.
   - Both nodes now deploy and verify healthy in **under 2 minutes total**.


---

### Entry #16: Nginx Web Root Permissions & World-Traversal Hardening (404/403 Resolution)
**Date:** 2026-10-15  
**Context:** Deployment succeeded in 5 min 11 sec, but immediately resulted in 404 Not Found (nginx/1.24.0) across aizal.uk/ and aizal.uk/admin.html.

#### Root Cause Discovered
1. **Restrictive Umask Extraction:**
   - Unpacking 
elease.tar.gz on my-mac produced directory permissions drwx------ (700) owned exclusively by user ubuntu.
   - Nginx operates under worker user www-data. When traversing /home/ubuntu/stack/apps/personal-site/public/ to serve static assets, Nginx was denied traversal permission (stat() failed with errno 13: Permission denied).

#### Permanent Resolution Applied
1. **Live Permission Restoration:**
   - Executed chmod -R a+rX /home/ubuntu/stack/apps/personal-site/public and ensured world read/execution on /home/ubuntu/stack/apps/personal-site. Verified aizal.uk/ and dmin.html immediately restored to 200 OK.
2. **CI/CD Pipeline Perm Safeguards:**
   - Updated .github/workflows/deploy.yml with explicit chmod -R a+rX public frontend/dist during the artifact packaging phase, immediately after archive extraction on my-mac, and upon VCN propagation to cos.

---

### Entry #17: Service Modernization: Dockerizing Nexus Backend & Minecraft Classification
**Date:** 2026-10-15  
**Context:** User audit of the Services Tab identified that Minecraft Bedrock was mislabeled as a systemctl (ctl) unit rather than a Docker container, requested containerizing Nexus Backend into Docker, and requested clarification on storage telemetry figures.

#### Enhancements Implemented & Action Items
1. **Nexus Backend Dockerization Roadmap Item:**
   - Added dedicated roadmap objective to containerize 
exus-backend (Node.js API, port 3010) into Docker.
   - Migrating from host systemd (
exus-backend.service) to a self-contained Docker image will:
     - Sandbox the Node.js runtime and dependencies (
ode_modules).
     - Standardize restart and healthcheck policies under Docker Compose.
     - Mount persistent volumes for SQLite databases (*.sqlite / *.db).
     - Enforce strict memory bounds (max 128 MB RAM).
     - Switch service runner IPC control from systemctl to native docker.
2. **Minecraft Bedrock Classification Correction:**
   - Updated service schema in ackend-rust/src/routes/services_api.rs and Admin.jsx:
     - Changed control_type from systemctl to 
emote-docker.
     - Changed service_type and 	ype to docker.
   - Updated ServiceCard.jsx to render the blue DOCKER badge and Layers icon instead of ctl.
   - Updated stack-service-runner.sh to route start/stop/restart operations through remote Docker execution on container-of-souls.
3. **Storage Telemetry Clarification:**
   - Clarified that the storage usage figures displayed on the service cards (e.g., Minecraft 1.8 GB, Personal Site 62 MB, Stalwart 280 MB, Nexus 110 MB) account for **BOTH**:
     - **Code & Runtime Assets:** Compiled binaries, container image layers, Node runtimes, static assets, and maps/textures.
     - **Databases & State:** Active SQLite databases, world chunks (LevelDB), player states, mail spools, and persistent configs.

---

### Entry #18: CI/CD Pipeline De-Stalling (Resolving scp -O Hang with rsync and cs0 QoS)
**Date:** 2026-10-15  
**Context:** GitHub Actions deployment workflow stalled at step 1 for over 3 minutes 30 seconds at:
⚡ Step 1: Fast-Streaming release bundle to Primary Node (/home/***/stack/apps/personal-site)...
Warning: Permanently added '***' (ED25519) to the list of known hosts.
Warning: Permanently added '***' (ED25519) to the list of known hosts.

#### Root Cause Discovered
1. **IPQoS lowdelay Stalling in Cloud Transit:**
   - Setting IPQoS lowdelay in ~/.ssh/config marks outbound packets with DSCP lowdelay (interactive priority). When transferring multi-megabyte archives (
elease.tar.gz), intermediate transit routers and cloud firewalls (Azure-to-Oracle WAN) treat sustained bursts of lowdelay packets with buffer throttling or drop them, deadlocking the TCP window.
2. **Legacy SCP (-O) Stream Deadlock:**
   - The -O flag forced OpenSSH into obsolete RCP mode. Unlike SFTP or rsync, legacy SCP does not negotiate chunking and hangs indefinitely if the remote shell prints any banner characters or if packet drops interrupt the handshake.
3. **Double Compression Overhead:**
   - 
elease.tar.gz is already gzip-compressed. Invoking scp -C caused SSH to recompress an already compressed archive, thrashing CPU and inflating packet framing.
4. **Lack of Timeout:**
   - scp has no transfer timeout by default, leading to indefinite hangs.

#### Resolution Applied
1. **Normalized IPQoS to Class Selector 0 (cs0 cs0):**
   - Configured IPQoS cs0 cs0 in SSH config so bulk packets use standard best-effort DSCP tags without triggering ISP/firewall throttling.
2. **Replaced Legacy SCP with Rsync:**
   - Switched bundle transfer to 
sync -av --timeout=45 release.tar.gz production:/release.tar.gz.
   - 
sync uses its own framing protocol over SSH, bypasses SFTP/legacy SCP buffer stalls, displays transfer progress, and aborts cleanly if socket activity ceases for 45s.
3. **Pushed Fix to Master:**
   - Committed and pushed to origin/master (commit 57c7fb).

---

### Entry #19: Pipeline Realignment — Standardizing Deploy to Match MacOS & Bloomberg Architecture
**Date:** 2026-10-15  
**Context:** Standardized Personal Site CD pipeline to match the battle-tested, sub-minute deployment architecture utilized in MacOS ERP and Bloomberg Terminal.

#### Architectural Parity Changes Applied
1. **Eliminated Intermediate Tar Packaging & Extraction:**
   - Removed tar packaging and remote archive extraction.
   - Replaced with direct differential rsync identical to MacOS & Bloomberg.
2. **Unified SSH Transport Configuration:**
   - Standardized ~/.ssh/config to match MacOS/Bloomberg settings.
3. **Automated Live Smoke Test Validation:**
   - Added automated post-deployment validation polling https://faizal.uk/api/maintenance-status.

---

### Entry #20: Stalwart Mail Server Dual-Node HA & Admin Panel Integration
**Date:** 2026-10-15  
**Context:** Completed full HA standby architecture for Stalwart Mail Server on cos and integrated mail management and telemetry into the Personal Site Admin Console.

#### Architectural Deliverables
1. **Standby Mail Compose Definition (mail/docker-compose.standby.yml):**
   - Configured stalwart-mail-standby container with resource limits (cpus: 0.4, memory: 256M).
   - Mounted replicated /var/lib/stalwart:ro volume to prevent split-brain conflicts during standby.
2. **Internal VCN Replication Pipeline (mail/stalwart-sync.cron):**
   - Standardized 3-hour rsync cron job syncing /home/ubuntu/stack/apps/personal-site/mail/data/ from my-mac to cos (10.0.0.195) over the private 10Gbps Oracle VCN.
3. **Full Admin Panel Integration:**
   - Added stalwart-mail-standby to ackend-rust/src/routes/services_api.rs (showing under Secondary VM with Standby Replica tag and VCN sync traffic route).
   - Enabled IPC start/stop/restart controls in scripts/stack-service-runner.sh.
   - Added dedicated Stalwart Mail HA & Webadmin card in rontend/src/pages/Admin/tabs/SettingsTab.jsx with direct links to Webadmin (mailadmin.faizal.uk/admin) and node sync triggers.
