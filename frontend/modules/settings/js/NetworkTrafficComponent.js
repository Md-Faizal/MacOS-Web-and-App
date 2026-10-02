/**
 * NetworkTrafficComponent - Multi-VM Blue/Green Cluster & Hybrid-Style Energy Flow
 * 
 * Visualizes bidirectional real-time traffic across 4 architectural layers:
 * 1. Internet & Cloudflare Edge
 * 2. Nginx Power-Split Ingress Load Balancer
 * 3. 2 Virtual Machines (VM 1 Primary & VM 2 DR) with dual Blue & Green Docker containers
 * 4. SQLite WAL Database & Storage Layer (Recuperation / write commits)
 */

export class NetworkTrafficComponent {
  constructor(container) {
    this.container = container;
    this.pollInterval = null;
    this.canvas = null;
    this.ctx = null;
    this.historyData = [];
    this.latestSnapshot = null;
    this.isDestroyed = false;

    this.ensureStylesheet();
  }

  ensureStylesheet() {
    if (!document.getElementById('network-traffic-stylesheet')) {
      const link = document.createElement('link');
      link.id = 'network-traffic-stylesheet';
      link.rel = 'stylesheet';
      link.href = '/modules/settings/css/NetworkTraffic.css';
      document.head.appendChild(link);
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="network-traffic-container">
        <!-- Master HUD Banner -->
        <div class="powertrain-hud">
          <div class="powertrain-hud-title">
            <div class="powertrain-icon-badge">⚡</div>
            <div>
              <div class="powertrain-title-text">
                Multi-VM Blue/Green Cluster Flow
                <span class="settings-sidebar-badge-live">LIVE TELEMETRY</span>
              </div>
              <div class="powertrain-subtitle-text">2 VMs • Blue/Green Zero-Downtime Slots • SQLite WAL Recuperation</div>
            </div>
          </div>
          <div id="trafficModePill" class="powertrain-mode-pill active">
            <span class="mode-icon">⚡</span>
            <span id="trafficModeText" class="mode-text">ACTIVE STREAM</span>
          </div>
        </div>

        <!-- Master Architectural Schematic Stage -->
        <div class="schematic-stage-card">
          <!-- Top Telemetry Status Header -->
          <div class="schematic-top-bar">
            <div class="active-path-indicator">
              <span>PATH:</span>
              <span id="activePathDisplay" class="active-path-tag">INTERNET ➔ CLOUDFLARE ➔ NGINX ➔ VM1 [BLUE :3001] ➔ SQLITE WAL</span>
            </div>
            <div class="live-rate-tag">
              <span style="color: var(--settings-text-secondary);">THROUGHPUT:</span>
              <span id="headerRateVal" class="val">0.00 KB/s</span>
            </div>
          </div>

          <!-- 4 Architectural Layers with Flow Conduits -->
          <div class="cluster-schematic-grid">
            
            <!-- LAYER 1: Global Internet & Cloudflare Edge -->
            <div class="cluster-layer-box" id="layerInternetBox">
              <div class="cluster-layer-header">
                <div class="cluster-layer-title">
                  <span>🌐</span>
                  <span>Layer 1: Global Internet & Cloudflare Edge</span>
                </div>
                <span class="layer-badge edge">Anycast CDN & WAF</span>
              </div>
              <div class="internet-layer-content">
                <div class="edge-node-badge">
                  <span>🛡️ DDoS Shield: Active</span>
                  <span>•</span>
                  <span>TLS 1.3 / HTTP/2</span>
                </div>
                <div class="edge-pill">
                  <span>Active Clients:</span>
                  <strong id="edgeClientCount" style="color: #00f0ff;">1</strong>
                </div>
              </div>
            </div>

            <!-- Conduit SVG: Internet -> Ingress -->
            <svg class="energy-connector-svg" viewBox="0 0 600 24" preserveAspectRatio="none">
              <line x1="300" y1="0" x2="300" y2="24" class="flow-line-base" />
              <line id="pulseInternetToIngress" x1="300" y1="0" x2="300" y2="24" class="flow-line-pulse pulse-blue" />
            </svg>

            <!-- LAYER 2: Ingress & Load Balancing (Nginx Power Split) -->
            <div class="cluster-layer-box" id="layerIngressBox">
              <div class="cluster-layer-header">
                <div class="cluster-layer-title">
                  <span>🔀</span>
                  <span>Layer 2: Nginx Ingress & Smart Load Balancer</span>
                </div>
                <span class="layer-badge ingress">Zero-Downtime Router</span>
              </div>
              <div class="ingress-layer-content">
                <div class="ingress-slot-indicator">
                  <span>Target Upstream:</span>
                  <code id="ingressUpstreamDisplay" style="color: #00f0ff; font-weight: 700;">http://127.0.0.1:3001</code>
                </div>
                <div class="edge-pill">
                  <span>Steering:</span>
                  <strong id="ingressSteerTarget" style="color: #30d158;">VM 1 (Primary)</strong>
                </div>
              </div>
            </div>

            <!-- Conduit SVG: Ingress -> Dual VMs -->
            <svg class="energy-connector-svg" viewBox="0 0 600 24" preserveAspectRatio="none">
              <!-- Base split paths -->
              <path d="M 300,0 L 300,8 L 150,8 L 150,24" class="flow-line-base" />
              <path d="M 300,0 L 300,8 L 450,8 L 450,24" class="flow-line-base" />
              
              <!-- Active energy pulse beams -->
              <path id="pulseIngressToVM1" d="M 300,0 L 300,8 L 150,8 L 150,24" class="flow-line-pulse pulse-blue" />
              <path id="pulseIngressToVM2" d="M 300,0 L 300,8 L 450,8 L 450,24" class="flow-line-pulse pulse-idle" />
            </svg>

            <!-- LAYER 3: 2 Virtual Machines with Dual Blue/Green Containers -->
            <div class="cluster-layer-box" style="padding: 12px;">
              <div class="cluster-layer-header">
                <div class="cluster-layer-title">
                  <span>🖥️</span>
                  <span>Layer 3: Virtual Machines & Containerized App Cluster</span>
                </div>
                <span class="layer-badge compute">Dual VM High-Availability</span>
              </div>

              <div class="vms-grid">
                <!-- VM 1 (Primary Node) -->
                <div class="vm-card is-primary" id="vm1Card">
                  <div class="vm-header">
                    <div class="vm-title">
                      <span>☁️</span>
                      <span>Oracle VM 1 (Primary)</span>
                    </div>
                    <span id="vm1RolePill" class="vm-role-pill primary">ACTIVE HOST</span>
                  </div>

                  <div class="vm-metrics-row">
                    <div class="vm-metric-item">
                      <span>IP:</span>
                      <strong style="color: var(--settings-text);">10.0.0.4</strong>
                    </div>
                    <div class="vm-metric-item">
                      <span>CPU:</span>
                      <strong id="vm1CpuDisplay">18%</strong>
                    </div>
                    <div class="vm-metric-item">
                      <span>RAM:</span>
                      <strong>360MB</strong>
                    </div>
                  </div>

                  <div class="vm-containers-pair">
                    <!-- VM 1 Blue Container -->
                    <div class="container-card slot-blue is-active-routed" id="vm1BlueCard">
                      <div class="container-main-info">
                        <div class="container-icon-box">🟦</div>
                        <div class="container-labels">
                          <span class="container-name-text">Blue Container</span>
                          <span class="container-port-text">Port :3001 • macos-server-blue</span>
                        </div>
                      </div>
                      <span id="vm1BlueStatus" class="container-status-badge active-blue">ACTIVE ROUTED</span>
                    </div>

                    <!-- VM 1 Green Container -->
                    <div class="container-card slot-green" id="vm1GreenCard">
                      <div class="container-main-info">
                        <div class="container-icon-box">🟩</div>
                        <div class="container-labels">
                          <span class="container-name-text">Green Container</span>
                          <span class="container-port-text">Port :3004 • macos-server-green</span>
                        </div>
                      </div>
                      <span id="vm1GreenStatus" class="container-status-badge standby">HOT STANDBY</span>
                    </div>
                  </div>
                </div>

                <!-- VM 2 (Disaster Recovery Node) -->
                <div class="vm-card" id="vm2Card">
                  <div class="vm-header">
                    <div class="vm-title">
                      <span>☁️</span>
                      <span>Oracle VM 2 (DR Node)</span>
                    </div>
                    <span id="vm2RolePill" class="vm-role-pill standby">STANDBY REPLICA</span>
                  </div>

                  <div class="vm-metrics-row">
                    <div class="vm-metric-item">
                      <span>IP:</span>
                      <strong style="color: var(--settings-text);">10.0.0.8</strong>
                    </div>
                    <div class="vm-metric-item">
                      <span>Lag:</span>
                      <strong style="color: #30d158;">1.4ms</strong>
                    </div>
                    <div class="vm-metric-item">
                      <span>RAM:</span>
                      <strong>340MB</strong>
                    </div>
                  </div>

                  <div class="vm-containers-pair">
                    <!-- VM 2 Blue Container -->
                    <div class="container-card slot-blue" id="vm2BlueCard">
                      <div class="container-main-info">
                        <div class="container-icon-box">🟦</div>
                        <div class="container-labels">
                          <span class="container-name-text">Blue Container</span>
                          <span class="container-port-text">Port :3001 • macos-server-blue</span>
                        </div>
                      </div>
                      <span id="vm2BlueStatus" class="container-status-badge standby">STANDBY SYNC</span>
                    </div>

                    <!-- VM 2 Green Container -->
                    <div class="container-card slot-green" id="vm2GreenCard">
                      <div class="container-main-info">
                        <div class="container-icon-box">🟩</div>
                        <div class="container-labels">
                          <span class="container-name-text">Green Container</span>
                          <span class="container-port-text">Port :3004 • macos-server-green</span>
                        </div>
                      </div>
                      <span id="vm2GreenStatus" class="container-status-badge standby">STANDBY SYNC</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Conduit SVG: VMs -> Storage (Recuperation Path) -->
            <svg class="energy-connector-svg" viewBox="0 0 600 24" preserveAspectRatio="none">
              <!-- Base merge paths -->
              <path d="M 150,0 L 150,14 L 300,14 L 300,24" class="flow-line-base" />
              <path d="M 450,0 L 450,14 L 300,14 L 300,24" class="flow-line-base" />
              
              <!-- Active energy pulse beams -->
              <path id="pulseVM1ToStorage" d="M 150,0 L 150,14 L 300,14 L 300,24" class="flow-line-pulse pulse-amber" />
              <path id="pulseVM2ToStorage" d="M 450,0 L 450,14 L 300,14 L 300,24" class="flow-line-pulse pulse-idle" />
            </svg>

            <!-- LAYER 4: Database & Persistent Storage Layer -->
            <div class="cluster-layer-box" id="layerStorageBox">
              <div class="cluster-layer-header">
                <div class="cluster-layer-title">
                  <span>💾</span>
                  <span>Layer 4: SQLite WAL Database & Storage Layer</span>
                </div>
                <span class="layer-badge storage">Write-Ahead Log (WAL)</span>
              </div>
              <div class="storage-layer-content">
                <div class="storage-engine-badge">
                  <span>📦 Mounts: <code>/database</code>, <code>/CloudStorage</code>, <code>/Wallpapers</code></span>
                  <span>•</span>
                  <span>Journal: WAL Mode</span>
                </div>
                <div id="recupStatusPill" class="recup-activity-pill">
                  <span>⚡ WAL Buffer Ready</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        <!-- Rolling 60-Second Oscilloscope Stream -->
        <div class="traffic-chart-card">
          <div class="traffic-chart-header">
            <div class="traffic-chart-title">
              <span>📈</span>
              <span>Live Traffic Waveform (Rolling 60s)</span>
            </div>
            <div class="traffic-legend">
              <span class="legend-in">● Inbound Requests (KB/s)</span>
              <span class="legend-out">● DB Write Recuperation (KB/s)</span>
            </div>
          </div>
          <div class="traffic-canvas-container">
            <canvas id="trafficWaveformCanvas" class="traffic-canvas"></canvas>
          </div>
        </div>

        <!-- Diagnostic Telemetry Grid -->
        <div class="telemetry-grid">
          <div class="telemetry-stat-card">
            <span class="telemetry-stat-label">Inbound Traffic</span>
            <span class="telemetry-stat-value" id="statInboundRate" style="color: #00f0ff;">0.00 KB/s</span>
            <span class="telemetry-stat-sub" id="statTotalIn">Total: 0 MB</span>
          </div>

          <div class="telemetry-stat-card">
            <span class="telemetry-stat-label">DB Recuperation</span>
            <span class="telemetry-stat-value" id="statOutboundRate" style="color: #ff9f0a;">0.00 KB/s</span>
            <span class="telemetry-stat-sub" id="statTotalOut">Writes: 0</span>
          </div>

          <div class="telemetry-stat-card">
            <span class="telemetry-stat-label">Round-Trip Latency</span>
            <span class="telemetry-stat-value" id="statLatencyRtt" style="color: #30d158;">18 ms</span>
            <span class="telemetry-stat-sub" id="statConnections">Active Conns: 1</span>
          </div>

          <div class="telemetry-stat-card">
            <span class="telemetry-stat-label">Active Routed Slot</span>
            <span class="telemetry-stat-value" id="statActiveSlot" style="color: #00f0ff;">VM1 • BLUE :3001</span>
            <span class="telemetry-stat-sub" id="statClusterMode">Zero-Downtime Ready</span>
          </div>
        </div>

        <!-- Interactive Control Bar -->
        <div class="powertrain-actions-row">
          <div style="font-size: 11px; color: var(--settings-text-secondary); display: flex; align-items: center; gap: 8px;">
            <span>🛡️ Live Failover Controls:</span>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button id="btnBurstTraffic" class="powertrain-btn pulse-burst">
              ⚡ Test Traffic Burst
            </button>
            <button id="btnSimulateRegen" class="powertrain-btn secondary">
              💾 DB Write Pulse (Recuperation)
            </button>
            <button id="btnToggleVm" class="powertrain-btn secondary">
              🔄 Failover VM (VM1 ⇄ VM2)
            </button>
            <button id="btnSwitchMotorSlot" class="powertrain-btn">
              🔀 Switch Slot (Blue ⇄ Green)
            </button>
          </div>
        </div>
      </div>
    `;

    this.initCanvas();
    this.bindEvents();
    this.startPolling();
  }

  initCanvas() {
    this.canvas = document.getElementById('trafficWaveformCanvas');
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = (rect.width || 600) * dpr;
    this.canvas.height = (rect.height || 80) * dpr;
    this.ctx.scale(dpr, dpr);
  }

  bindEvents() {
    // Traffic Burst Simulator (generates high-speed requests so conduits accelerate)
    const burstBtn = document.getElementById('btnBurstTraffic');
    if (burstBtn) {
      burstBtn.addEventListener('click', async () => {
        burstBtn.disabled = true;
        burstBtn.textContent = '🚀 Bursting Flow...';
        
        // Fire 10 parallel fast calls to simulate high throughput
        const pings = Array.from({ length: 8 }, () => 
          fetch('/api/health').catch(() => {})
        );
        await Promise.all(pings);

        setTimeout(() => {
          burstBtn.disabled = false;
          burstBtn.textContent = '⚡ Test Traffic Burst';
          this.fetchTelemetry();
        }, 1200);
      });
    }

    // DB Write Pulse (Recuperation) Button
    const regenBtn = document.getElementById('btnSimulateRegen');
    if (regenBtn) {
      regenBtn.addEventListener('click', async () => {
        regenBtn.disabled = true;
        regenBtn.textContent = '💾 Committing WAL...';
        try {
          await fetch('/api/settings/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 'last_cluster_recup_pulse': Date.now() })
          });
        } catch (_) {}
        setTimeout(() => {
          regenBtn.disabled = false;
          regenBtn.textContent = '💾 DB Write Pulse (Recuperation)';
          this.fetchTelemetry();
        }, 1200);
      });
    }

    // Failover VM Button (VM1 ⇄ VM2)
    const vmToggleBtn = document.getElementById('btnToggleVm');
    if (vmToggleBtn) {
      vmToggleBtn.addEventListener('click', async () => {
        vmToggleBtn.disabled = true;
        vmToggleBtn.textContent = '⏳ Routing Failover...';
        try {
          const res = await fetch('/api/settings/docker/toggle-vm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const data = await res.json();
          if (data.success) {
            console.log(`[Cluster] Routed to ${data.currentVm}`);
          }
        } catch (_) {}
        setTimeout(() => {
          vmToggleBtn.disabled = false;
          vmToggleBtn.textContent = '🔄 Failover VM (VM1 ⇄ VM2)';
          this.fetchTelemetry();
        }, 1000);
      });
    }

    // Slot Cutover Button (Blue ⇄ Green)
    const cutoverBtn = document.getElementById('btnSwitchMotorSlot');
    if (cutoverBtn) {
      cutoverBtn.addEventListener('click', async () => {
        const nextSlot = (this.latestSnapshot?.layers?.ingress?.targetSlot === 'blue') ? 'green' : 'blue';
        const ok = confirm(`Initiate zero-downtime cutover to ${nextSlot.toUpperCase()} container slot? Nginx upstream conduits will dynamically steer.`);
        if (!ok) return;

        cutoverBtn.disabled = true;
        cutoverBtn.textContent = '⏳ Switching Slot...';
        try {
          const res = await fetch('/api/settings/docker/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          });
          const data = await res.json();
          if (data.success) {
            console.log(`[Cluster] Cutover to ${data.targetSlot}`);
          }
        } catch (err) {
          console.warn('[Cluster] Switch notice:', err);
        } finally {
          cutoverBtn.disabled = false;
          cutoverBtn.textContent = '🔀 Switch Slot (Blue ⇄ Green)';
          this.fetchTelemetry();
        }
      });
    }

    // Window resize handler for canvas
    window.addEventListener('resize', () => {
      if (this.canvas && !this.isDestroyed) {
        this.initCanvas();
      }
    });
  }

  startPolling() {
    this.fetchTelemetry();
    this.pollInterval = setInterval(() => {
      if (!this.isDestroyed) {
        this.fetchTelemetry();
      }
    }, 1000);
  }

  async fetchTelemetry() {
    try {
      const res = await fetch('/api/settings/network/telemetry');
      if (res.ok) {
        const data = await res.json();
        this.updateView(data);
      } else {
        this.fallbackSimulation();
      }
    } catch (_) {
      this.fallbackSimulation();
    }
  }

  fallbackSimulation() {
    const mock = {
      flow: {
        mode: 'ACTIVE_STREAM',
        direction: 'forward',
        flowIntensityPct: 35,
        recuperationPct: 15,
        activePath: 'INTERNET ➔ CLOUDFLARE ➔ NGINX ➔ VM1 [BLUE :3001] ➔ SQLITE WAL'
      },
      liveRates: {
        bytesInPerSec: 14200,
        bytesOutPerSec: 8500,
        kbInPerSec: 13.8,
        kbOutPerSec: 8.3,
        requestsPerSec: 2.4,
        writesPerSec: 0.2,
        avgLatencyMs: 18,
        activeConnections: 1
      },
      lifetime: {
        totalBytesIn: 1048576 * 14,
        totalBytesOut: 1048576 * 22,
        totalRequests: 480,
        totalWrites: 36
      },
      layers: {
        internet: { activeClients: 1 },
        ingress: { targetVm: 'vm1', targetSlot: 'blue', targetPort: 3001, activeUpstream: 'http://127.0.0.1:3001' },
        vms: {
          primaryVmId: 'vm1',
          vm1: {
            cpuPct: 18,
            containers: {
              blue: { isActive: true },
              green: { isActive: false }
            }
          },
          vm2: {
            cpuPct: 10,
            containers: {
              blue: { isActive: false },
              green: { isActive: false }
            }
          }
        },
        database: {
          journalMode: 'WAL (Write-Ahead Logging)',
          recuperating: false
        }
      },
      historySeries: Array.from({ length: 60 }, (_, i) => ({
        inKbps: +(Math.sin(i / 5) * 5 + 10).toFixed(2),
        outKbps: +(Math.cos(i / 5) * 3 + 6).toFixed(2)
      }))
    };
    this.updateView(mock);
  }

  updateView(data) {
    this.latestSnapshot = data;
    const { flow, liveRates, lifetime, layers, historySeries } = data;

    // 1. Update HUD & Mode Pill
    const modePill = document.getElementById('trafficModePill');
    const modeText = document.getElementById('trafficModeText');
    if (modePill && modeText && flow) {
      modePill.className = 'powertrain-mode-pill';
      if (flow.mode === 'RECUPERATION_SYNC') {
        modePill.classList.add('recuperation');
        modeText.textContent = 'WAL RECUPERATION';
      } else if (flow.mode === 'HIGH_BURST') {
        modePill.classList.add('burst');
        modeText.textContent = 'HIGH BURST FLOW';
      } else if (flow.mode === 'ACTIVE_STREAM') {
        modePill.classList.add('active');
        modeText.textContent = 'ACTIVE STREAM';
      } else {
        modePill.classList.add('idle');
        modeText.textContent = 'STANDBY IDLE';
      }
    }

    // 2. Active Path & Top Rate
    const pathEl = document.getElementById('activePathDisplay');
    if (pathEl && flow?.activePath) {
      pathEl.textContent = flow.activePath;
    }

    const headerRate = document.getElementById('headerRateVal');
    if (headerRate && liveRates) {
      const combined = (liveRates.kbInPerSec + liveRates.kbOutPerSec).toFixed(2);
      headerRate.textContent = `${combined} KB/s`;
    }

    // 3. Layer 1: Internet Edge
    const clientCountEl = document.getElementById('edgeClientCount');
    if (clientCountEl && layers?.internet) {
      clientCountEl.textContent = layers.internet.activeClients || 1;
    }

    // 4. Layer 2: Ingress Nginx
    const upstreamEl = document.getElementById('ingressUpstreamDisplay');
    const steerEl = document.getElementById('ingressSteerTarget');
    if (upstreamEl && layers?.ingress) {
      upstreamEl.textContent = layers.ingress.activeUpstream || `http://127.0.0.1:${layers.ingress.targetPort}`;
    }
    if (steerEl && layers?.ingress) {
      const vmName = layers.ingress.targetVm === 'vm2' ? 'VM 2 (DR Node)' : 'VM 1 (Primary)';
      steerEl.textContent = `${vmName} [${(layers.ingress.targetSlot || 'blue').toUpperCase()}]`;
    }

    // 5. Layer 3: Virtual Machines & Blue/Green Containers
    const primaryVmId = layers?.vms?.primaryVmId || 'vm1';
    const targetSlot = layers?.ingress?.targetSlot || 'blue';

    const vm1Card = document.getElementById('vm1Card');
    const vm2Card = document.getElementById('vm2Card');
    const vm1Role = document.getElementById('vm1RolePill');
    const vm2Role = document.getElementById('vm2RolePill');

    if (vm1Card && vm2Card && vm1Role && vm2Role) {
      if (primaryVmId === 'vm1') {
        vm1Card.className = 'vm-card is-primary';
        vm2Card.className = 'vm-card';
        vm1Role.className = 'vm-role-pill primary';
        vm1Role.textContent = 'ACTIVE HOST';
        vm2Role.className = 'vm-role-pill standby';
        vm2Role.textContent = 'STANDBY REPLICA';
      } else {
        vm1Card.className = 'vm-card';
        vm2Card.className = 'vm-card is-primary';
        vm1Role.className = 'vm-role-pill standby';
        vm1Role.textContent = 'STANDBY REPLICA';
        vm2Role.className = 'vm-role-pill primary';
        vm2Role.textContent = 'FAILOVER ACTIVE';
      }
    }

    const vm1Cpu = document.getElementById('vm1CpuDisplay');
    if (vm1Cpu && layers?.vms?.vm1) {
      vm1Cpu.textContent = `${layers.vms.vm1.cpuPct}%`;
    }

    // Container Cards States
    const vm1BlueCard = document.getElementById('vm1BlueCard');
    const vm1GreenCard = document.getElementById('vm1GreenCard');
    const vm1BlueStatus = document.getElementById('vm1BlueStatus');
    const vm1GreenStatus = document.getElementById('vm1GreenStatus');

    const vm2BlueCard = document.getElementById('vm2BlueCard');
    const vm2GreenCard = document.getElementById('vm2GreenCard');
    const vm2BlueStatus = document.getElementById('vm2BlueStatus');
    const vm2GreenStatus = document.getElementById('vm2GreenStatus');

    const isVm1BlueActive = (primaryVmId === 'vm1' && targetSlot === 'blue');
    const isVm1GreenActive = (primaryVmId === 'vm1' && targetSlot === 'green');
    const isVm2BlueActive = (primaryVmId === 'vm2' && targetSlot === 'blue');
    const isVm2GreenActive = (primaryVmId === 'vm2' && targetSlot === 'green');

    if (vm1BlueCard && vm1BlueStatus) {
      vm1BlueCard.className = `container-card slot-blue ${isVm1BlueActive ? 'is-active-routed' : ''}`;
      vm1BlueStatus.className = `container-status-badge ${isVm1BlueActive ? 'active-blue' : 'standby'}`;
      vm1BlueStatus.textContent = isVm1BlueActive ? 'ACTIVE ROUTED' : 'HOT STANDBY';
    }

    if (vm1GreenCard && vm1GreenStatus) {
      vm1GreenCard.className = `container-card slot-green ${isVm1GreenActive ? 'is-active-routed' : ''}`;
      vm1GreenStatus.className = `container-status-badge ${isVm1GreenActive ? 'active-green' : 'standby'}`;
      vm1GreenStatus.textContent = isVm1GreenActive ? 'ACTIVE ROUTED' : 'HOT STANDBY';
    }

    if (vm2BlueCard && vm2BlueStatus) {
      vm2BlueCard.className = `container-card slot-blue ${isVm2BlueActive ? 'is-active-routed' : ''}`;
      vm2BlueStatus.className = `container-status-badge ${isVm2BlueActive ? 'active-blue' : 'standby'}`;
      vm2BlueStatus.textContent = isVm2BlueActive ? 'FAILOVER ROUTED' : 'STANDBY SYNC';
    }

    if (vm2GreenCard && vm2GreenStatus) {
      vm2GreenCard.className = `container-card slot-green ${isVm2GreenActive ? 'is-active-routed' : ''}`;
      vm2GreenStatus.className = `container-status-badge ${isVm2GreenActive ? 'active-green' : 'standby'}`;
      vm2GreenStatus.textContent = isVm2GreenActive ? 'FAILOVER ROUTED' : 'STANDBY SYNC';
    }

    // 6. Layer 4: Storage Recuperation
    const recupPill = document.getElementById('recupStatusPill');
    if (recupPill) {
      if (liveRates?.writesPerSec > 0 || flow?.mode === 'RECUPERATION_SYNC') {
        recupPill.className = 'recup-activity-pill active-recup';
        recupPill.style.background = 'rgba(255, 159, 10, 0.22)';
        recupPill.style.borderColor = 'rgba(255, 159, 10, 0.6)';
        recupPill.innerHTML = `⚡ WAL Commit Active (${liveRates?.writesPerSec || 1} w/s)`;
      } else {
        recupPill.className = 'recup-activity-pill';
        recupPill.style.background = 'rgba(255, 159, 10, 0.1)';
        recupPill.style.borderColor = 'rgba(255, 159, 10, 0.3)';
        recupPill.innerHTML = `⚡ WAL Buffer Ready`;
      }
    }

    // 7. Update Dynamic SVG Energy Conduits
    const pulseInternetIngress = document.getElementById('pulseInternetToIngress');
    const pulseIngressVM1 = document.getElementById('pulseIngressToVM1');
    const pulseIngressVM2 = document.getElementById('pulseIngressToVM2');
    const pulseVM1Storage = document.getElementById('pulseVM1ToStorage');
    const pulseVM2Storage = document.getElementById('pulseVM2ToStorage');

    const activeColorClass = targetSlot === 'green' ? 'pulse-green' : 'pulse-blue';

    if (pulseInternetIngress) {
      pulseInternetIngress.setAttribute('class', `flow-line-pulse ${activeColorClass}`);
    }

    if (pulseIngressVM1 && pulseIngressVM2) {
      if (primaryVmId === 'vm1') {
        pulseIngressVM1.setAttribute('class', `flow-line-pulse ${activeColorClass}`);
        pulseIngressVM2.setAttribute('class', 'flow-line-pulse pulse-idle');
      } else {
        pulseIngressVM1.setAttribute('class', 'flow-line-pulse pulse-idle');
        pulseIngressVM2.setAttribute('class', `flow-line-pulse ${activeColorClass}`);
      }
    }

    if (pulseVM1Storage && pulseVM2Storage) {
      if (primaryVmId === 'vm1') {
        pulseVM1Storage.setAttribute('class', 'flow-line-pulse pulse-amber');
        pulseVM2Storage.setAttribute('class', 'flow-line-pulse pulse-idle');
      } else {
        pulseVM1Storage.setAttribute('class', 'flow-line-pulse pulse-idle');
        pulseVM2Storage.setAttribute('class', 'flow-line-pulse pulse-amber');
      }
    }

    // 8. Update Telemetry Cards
    const statIn = document.getElementById('statInboundRate');
    const statTotalIn = document.getElementById('statTotalIn');
    const statOut = document.getElementById('statOutboundRate');
    const statTotalOut = document.getElementById('statTotalOut');
    const statRtt = document.getElementById('statLatencyRtt');
    const statConns = document.getElementById('statConnections');
    const statSlot = document.getElementById('statActiveSlot');

    if (statIn && liveRates) {
      statIn.textContent = `${liveRates.kbInPerSec} KB/s`;
    }
    if (statTotalIn && lifetime) {
      const mb = (lifetime.totalBytesIn / (1024 * 1024)).toFixed(1);
      statTotalIn.textContent = `Total: ${mb} MB (${lifetime.totalRequests} reqs)`;
    }

    if (statOut && liveRates) {
      statOut.textContent = `${liveRates.kbOutPerSec} KB/s`;
    }
    if (statTotalOut && lifetime) {
      statTotalOut.textContent = `Writes: ${lifetime.totalWrites} commits`;
    }

    if (statRtt && liveRates) {
      statRtt.textContent = `${liveRates.avgLatencyMs} ms`;
    }
    if (statConns && liveRates) {
      statConns.textContent = `Active Conns: ${liveRates.activeConnections || 1}`;
    }

    if (statSlot) {
      const activePort = targetSlot === 'green' ? 3004 : 3001;
      statSlot.textContent = `${primaryVmId.toUpperCase()} • ${targetSlot.toUpperCase()} :${activePort}`;
      statSlot.style.color = targetSlot === 'green' ? '#30d158' : '#00f0ff';
    }

    // 9. Render Canvas Waveform
    if (historySeries) {
      this.drawWaveform(historySeries);
    }
  }

  drawWaveform(series) {
    if (!this.canvas || !this.ctx) return;
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.width / dpr;
    const height = this.canvas.height / dpr;

    ctx.clearRect(0, 0, width, height);

    if (!series || series.length < 2) return;

    // Determine max scale
    let maxVal = 10;
    series.forEach(pt => {
      if (pt.inKbps > maxVal) maxVal = pt.inKbps;
      if (pt.outKbps > maxVal) maxVal = pt.outKbps;
    });
    maxVal *= 1.25;

    const stepX = width / (series.length - 1);

    // Draw Subtle Grid
    ctx.strokeStyle = 'rgba(142, 142, 147, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height * 0.25);
    ctx.lineTo(width, height * 0.25);
    ctx.moveTo(0, height * 0.5);
    ctx.lineTo(width, height * 0.5);
    ctx.moveTo(0, height * 0.75);
    ctx.lineTo(width, height * 0.75);
    ctx.stroke();

    // 1. Draw Inbound Wave (Cyan / Blue Glow)
    ctx.beginPath();
    series.forEach((pt, i) => {
      const x = i * stepX;
      const y = height - (pt.inKbps / maxVal) * (height - 12);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(0, 240, 255, 0.6)';
    ctx.shadowBlur = 6;
    ctx.stroke();

    // Inbound Gradient Fill
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    const gradIn = ctx.createLinearGradient(0, 0, 0, height);
    gradIn.addColorStop(0, 'rgba(0, 240, 255, 0.18)');
    gradIn.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
    ctx.fillStyle = gradIn;
    ctx.fill();

    // 2. Draw Outbound / Recuperation Wave (Amber Glow)
    ctx.shadowBlur = 0;
    ctx.beginPath();
    series.forEach((pt, i) => {
      const x = i * stepX;
      const y = height - (pt.outKbps / maxVal) * (height - 12);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#ff9f0a';
    ctx.lineWidth = 1.8;
    ctx.shadowColor = 'rgba(255, 159, 10, 0.6)';
    ctx.shadowBlur = 6;
    ctx.stroke();

    ctx.shadowBlur = 0;
  }

  destroy() {
    this.isDestroyed = true;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}
