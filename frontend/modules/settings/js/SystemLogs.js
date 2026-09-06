/**
 * SystemLogsComponent - Dedicated Industrial-Standard System & Error Logs Console
 *
 * Features:
 * - Live Telemetry Summary Cards (Crashes, Errors 24h, Total Logs, Resolved Status)
 * - Real-time Filtering (Search keyword, Log Level, Platform, Resolution Status)
 * - Auto-refresh polling (10s toggle) & manual refresh
 * - Detailed Inspection Drawer (Stack Trace with 1-click copy, Breadcrumbs Timeline, Hardware Telemetry)
 * - Lifecycle Actions (Mark as Resolved, Ignore, Re-open, Bulk Action, Purge)
 * - Export in CSV and JSON formats
 */

export class SystemLogsComponent {
  constructor(container) {
    this.container = container;
    this.logs = [];
    this.stats = null;
    this.total = 0;
    this.limit = 50;
    this.offset = 0;
    this.activeFilterLevel = 'ALL';
    this.activeFilterPlatform = 'all';
    this.activeFilterStatus = 'all';
    this.searchQuery = '';
    this.autoRefreshInterval = null;
    this.selectedLog = null;
    this.isLoading = false;

    // Ensure dedicated CSS stylesheet is attached to document
    this.ensureStylesheet();
  }

  ensureStylesheet() {
    if (!document.getElementById('systemlogs-stylesheet')) {
      const link = document.createElement('link');
      link.id = 'systemlogs-stylesheet';
      link.rel = 'stylesheet';
      link.href = '/frontend/modules/settings/css/SystemLogs.css';
      document.head.appendChild(link);
    }
  }

  async render() {
    this.container.innerHTML = `
      <div class="systemlogs-container">
        <!-- Telemetry Metric Cards -->
        <div class="systemlogs-stats-grid" id="syslogStatsGrid">
          <div class="systemlogs-stat-card">
            <div class="systemlogs-stat-icon crashes">💥</div>
            <div class="systemlogs-stat-info">
              <span class="systemlogs-stat-value" id="syslogStatCrashes">0</span>
              <span class="systemlogs-stat-label">Unresolved Crashes</span>
            </div>
          </div>
          <div class="systemlogs-stat-card">
            <div class="systemlogs-stat-icon errors">⚠️</div>
            <div class="systemlogs-stat-info">
              <span class="systemlogs-stat-value" id="syslogStatErrors">0</span>
              <span class="systemlogs-stat-label">Errors (24h)</span>
            </div>
          </div>
          <div class="systemlogs-stat-card">
            <div class="systemlogs-stat-icon total">📋</div>
            <div class="systemlogs-stat-info">
              <span class="systemlogs-stat-value" id="syslogStatTotal">0</span>
              <span class="systemlogs-stat-label">Total Logged</span>
            </div>
          </div>
          <div class="systemlogs-stat-card">
            <div class="systemlogs-stat-icon resolved">✅</div>
            <div class="systemlogs-stat-info">
              <span class="systemlogs-stat-value" id="syslogStatResolved">0</span>
              <span class="systemlogs-stat-label">Resolved Issues</span>
            </div>
          </div>
        </div>

        <!-- Toolbar & Filter Controls -->
        <div class="systemlogs-toolbar">
          <div class="systemlogs-filter-group">
            <input type="text" class="systemlogs-search-input" id="syslogSearchInput" placeholder="🔍 Search message, stack, user...">
            
            <select class="systemlogs-select" id="syslogLevelSelect">
              <option value="ALL">All Levels</option>
              <option value="CRASH">💥 CRASH</option>
              <option value="ERROR">🔴 ERROR</option>
              <option value="WARN">🟡 WARN</option>
              <option value="INFO">🔵 INFO</option>
              <option value="DEBUG">⚪ DEBUG</option>
            </select>

            <select class="systemlogs-select" id="syslogPlatformSelect">
              <option value="all">All Platforms</option>
              <option value="android">🤖 Android</option>
              <option value="web">💻 Web</option>
              <option value="backend">⚙️ Backend</option>
            </select>

            <select class="systemlogs-select" id="syslogStatusSelect">
              <option value="all">All Status</option>
              <option value="open">Active (Open)</option>
              <option value="resolved">Resolved</option>
              <option value="ignored">Ignored</option>
            </select>
          </div>

          <div class="systemlogs-filter-group">
            <button class="systemlogs-btn" id="syslogRefreshBtn" title="Refresh logs">🔄 Refresh</button>
            <button class="systemlogs-btn" id="syslogExportBtn" title="Export logs">📥 Export</button>
            <button class="systemlogs-btn" id="syslogPurgeResolvedBtn" title="Clear resolved/ignored logs">🧹 Clear Resolved</button>
            <button class="systemlogs-btn danger" id="syslogPurgeAllBtn" title="Purge all logs">🗑️ Clear All</button>
          </div>
        </div>

        <!-- Logs Table -->
        <div class="systemlogs-table-wrapper">
          <table class="systemlogs-table">
            <thead>
              <tr>
                <th style="width: 140px;">Timestamp</th>
                <th style="width: 90px;">Level</th>
                <th style="width: 100px;">Platform</th>
                <th style="width: 140px;">Client / User</th>
                <th>Message</th>
                <th style="width: 90px; text-align: center;">Status</th>
                <th style="width: 80px; text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody id="syslogTableBody">
              <tr><td colspan="7" style="text-align: center; padding: 30px; color: var(--settings-text-tertiary);">Loading logs telemetry...</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Detail Drawer / Modal Container -->
        <div id="syslogDetailModal" class="systemlogs-modal-overlay" style="display: none;"></div>
      </div>
    `;

    this.bindEvents();
    await Promise.all([this.fetchStats(), this.fetchLogs()]);
  }

  bindEvents() {
    const searchInput = this.container.querySelector('#syslogSearchInput');
    const levelSelect = this.container.querySelector('#syslogLevelSelect');
    const platformSelect = this.container.querySelector('#syslogPlatformSelect');
    const statusSelect = this.container.querySelector('#syslogStatusSelect');
    const refreshBtn = this.container.querySelector('#syslogRefreshBtn');
    const exportBtn = this.container.querySelector('#syslogExportBtn');
    const purgeResolvedBtn = this.container.querySelector('#syslogPurgeResolvedBtn');
    const purgeAllBtn = this.container.querySelector('#syslogPurgeAllBtn');

    let debounceTimer;
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.searchQuery = e.target.value.trim();
        this.fetchLogs();
      }, 300);
    });

    levelSelect?.addEventListener('change', (e) => {
      this.activeFilterLevel = e.target.value;
      this.fetchLogs();
    });

    platformSelect?.addEventListener('change', (e) => {
      this.activeFilterPlatform = e.target.value;
      this.fetchLogs();
    });

    statusSelect?.addEventListener('change', (e) => {
      this.activeFilterStatus = e.target.value;
      this.fetchLogs();
    });

    refreshBtn?.addEventListener('click', () => {
      this.fetchStats();
      this.fetchLogs();
    });

    exportBtn?.addEventListener('click', () => {
      this.showExportMenu();
    });

    purgeResolvedBtn?.addEventListener('click', () => {
      this.handlePurgeResolved();
    });

    purgeAllBtn?.addEventListener('click', () => {
      this.handlePurgeAll();
    });
  }

  async fetchStats() {
    try {
      const res = await fetch('/api/logs/stats');
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && data.stats) {
        this.stats = data.stats;
        this.updateStatsUI(data.stats);
      }
    } catch (err) {
      console.warn('[SystemLogs] Failed to fetch stats:', err);
    }
  }

  updateStatsUI(stats) {
    const crashesEl = this.container.querySelector('#syslogStatCrashes');
    const errorsEl = this.container.querySelector('#syslogStatErrors');
    const totalEl = this.container.querySelector('#syslogStatTotal');
    const resolvedEl = this.container.querySelector('#syslogStatResolved');

    if (crashesEl) crashesEl.textContent = stats.unresolvedCrashes || 0;
    if (errorsEl) errorsEl.textContent = stats.errorsLast24h || 0;
    if (totalEl) totalEl.textContent = stats.total || 0;
    if (resolvedEl) resolvedEl.textContent = stats.byStatus?.resolved || 0;
  }

  async fetchLogs() {
    if (this.isLoading) return;
    this.isLoading = true;

    const tbody = this.container.querySelector('#syslogTableBody');
    if (tbody && this.logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: var(--settings-text-tertiary);">Querying logs...</td></tr>`;
    }

    try {
      const params = new URLSearchParams();
      params.append('limit', this.limit);
      params.append('offset', this.offset);
      if (this.activeFilterLevel !== 'ALL') params.append('level', this.activeFilterLevel);
      if (this.activeFilterPlatform !== 'all') params.append('platform', this.activeFilterPlatform);
      if (this.activeFilterStatus !== 'all') params.append('status', this.activeFilterStatus);
      if (this.searchQuery) params.append('search', this.searchQuery);

      const res = await fetch(`/api/logs?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      this.logs = data.logs || [];
      this.total = data.total || 0;
      this.renderTableRows();
    } catch (err) {
      console.error('[SystemLogs] Failed to fetch logs:', err);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: #ff3b30;">Failed to load logs: ${err.message}</td></tr>`;
      }
    } finally {
      this.isLoading = false;
    }
  }

  renderTableRows() {
    const tbody = this.container.querySelector('#syslogTableBody');
    if (!tbody) return;

    if (this.logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 36px 12px; color: var(--settings-text-tertiary);">
            No logs match the selected filters.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.logs.map(log => {
      const level = (log.level || 'INFO').toLowerCase();
      const plat = (log.platform || 'android').toLowerCase();
      const platformIcon = plat === 'android' ? '🤖' : plat === 'backend' ? '⚙️' : plat === 'pwa' ? '📱' : '💻';
      const status = log.status || 'open';
      const formattedDate = new Date(log.createdAt).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      const clientLabel = this.escape(log.userName || log.userId || log.deviceId || 'Anonymous');
      const messagePreview = this.escape(log.message || 'No message provided');

      return `
        <tr class="systemlogs-row" data-id="${log.id}">
          <td style="font-family: monospace; font-size: 11px; white-space: nowrap; color: var(--settings-text-secondary);">${formattedDate}</td>
          <td><span class="systemlogs-badge ${level}">${log.level}</span></td>
          <td><span class="systemlogs-platform">${platformIcon} ${log.platform || 'android'}</span></td>
          <td style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 140px;">${clientLabel}</td>
          <td style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${messagePreview}
          </td>
          <td style="text-align: center;">
            <span class="systemlogs-status-pill ${status}">${status}</span>
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="systemlogs-btn btn-inspect-log" data-id="${log.id}" style="padding: 3px 8px; font-size: 11px;">Inspect</button>
          </td>
        </tr>
      `;
    }).join('');

    // Row click listeners
    tbody.querySelectorAll('.systemlogs-row').forEach(row => {
      row.addEventListener('click', (e) => {
        const id = parseInt(row.dataset.id, 10);
        const log = this.logs.find(l => l.id === id);
        if (log) this.openDetailModal(log);
      });
    });

    tbody.querySelectorAll('.btn-inspect-log').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        const log = this.logs.find(l => l.id === id);
        if (log) this.openDetailModal(log);
      });
    });
  }

  openDetailModal(log) {
    this.selectedLog = log;
    const modalEl = this.container.querySelector('#syslogDetailModal');
    if (!modalEl) return;

    const level = (log.level || 'INFO').toLowerCase();
    const formattedDate = new Date(log.createdAt).toLocaleString();
    const breadcrumbs = Array.isArray(log.breadcrumbs) ? log.breadcrumbs : [];
    const metadata = log.metadata && typeof log.metadata === 'object' ? log.metadata : {};

    modalEl.innerHTML = `
      <div class="systemlogs-modal">
        <div class="systemlogs-modal-header">
          <div class="systemlogs-modal-title">
            <span class="systemlogs-badge ${level}">${log.level}</span>
            <span>Issue #${log.id} • ${log.platform?.toUpperCase() || 'CLIENT'}</span>
            <span class="systemlogs-status-pill ${log.status || 'open'}">${log.status || 'open'}</span>
          </div>
          <button class="systemlogs-btn" id="modalCloseBtn" style="padding: 4px 8px;">✕</button>
        </div>

        <div class="systemlogs-modal-body">
          <!-- Main Message Box -->
          <div>
            <div class="systemlogs-section-title">Message & Diagnostic</div>
            <div class="systemlogs-message-box">
              ${this.escape(log.message || 'No message')}
            </div>
            <div style="font-size: 11px; color: var(--settings-text-tertiary); margin-top: 6px;">
              Recorded: ${formattedDate} • Hash: <code>${log.errorHash || 'N/A'}</code>
            </div>
          </div>

          <!-- Stack Trace -->
          ${log.stack ? `
            <div>
              <div class="systemlogs-section-title">
                <span>Stack Trace</span>
                <button class="systemlogs-btn" id="copyStackBtn" style="padding: 2px 8px; font-size: 10px;">📋 Copy Stack</button>
              </div>
              <div class="systemlogs-stack-container" id="stackContent">${this.escape(log.stack)}</div>
            </div>
          ` : ''}

          <!-- Breadcrumbs Timeline -->
          ${breadcrumbs.length > 0 ? `
            <div>
              <div class="systemlogs-section-title">User Journey & Breadcrumbs (${breadcrumbs.length})</div>
              <div class="systemlogs-breadcrumbs-timeline">
                ${breadcrumbs.slice(-10).map((crumb, idx) => `
                  <div class="systemlogs-crumb-item">
                    <span class="systemlogs-crumb-time">${new Date(crumb.timestamp || Date.now()).toLocaleTimeString()}</span>
                    <span style="font-weight: 600; text-transform: uppercase; font-size: 10px; opacity: 0.7;">[${this.escape(crumb.category || 'action')}]</span>
                    <span>${this.escape(crumb.message || '')}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <!-- Device & System Telemetry -->
          <div>
            <div class="systemlogs-section-title">Device & Environment Telemetry</div>
            <div class="systemlogs-telemetry-grid">
              <div class="systemlogs-telemetry-card">
                <strong>User / Email</strong>
                ${this.escape(log.userName || log.userId || 'Anonymous')}
              </div>
              <div class="systemlogs-telemetry-card">
                <strong>Device Hardware</strong>
                ${this.escape(metadata.brand ? `${metadata.brand} ${metadata.model}` : (log.deviceId || 'Unknown Device'))}
              </div>
              <div class="systemlogs-telemetry-card">
                <strong>OS & Version</strong>
                ${this.escape(log.osVersion || metadata.android_version || 'Unknown OS')}
              </div>
              <div class="systemlogs-telemetry-card">
                <strong>App Build Version</strong>
                ${this.escape(log.appVersion || '1.0.0')}
              </div>
              <div class="systemlogs-telemetry-card">
                <strong>Available Memory</strong>
                ${this.escape(metadata.free_ram_mb ? `${metadata.free_ram_mb} MB Free / ${metadata.total_ram_mb || 0} MB` : 'N/A')}
              </div>
              <div class="systemlogs-telemetry-card">
                <strong>Network Connection</strong>
                ${this.escape(metadata.network_type || 'Active')}
              </div>
            </div>
          </div>
        </div>

        <div class="systemlogs-modal-footer">
          <div style="display: flex; gap: 8px;">
            <button class="systemlogs-btn" id="modalCopyJsonBtn">📄 Copy JSON</button>
            <button class="systemlogs-btn danger" id="modalDeleteBtn">🗑️ Delete</button>
          </div>
          <div style="display: flex; gap: 8px;">
            ${log.status !== 'resolved' ? `
              <button class="systemlogs-btn primary" id="modalResolveBtn">✓ Mark as Resolved</button>
            ` : `
              <button class="systemlogs-btn" id="modalReopenBtn">↩ Re-open Issue</button>
            `}
          </div>
        </div>
      </div>
    `;

    modalEl.style.display = 'flex';

    // Modal listeners
    modalEl.querySelector('#modalCloseBtn')?.addEventListener('click', () => {
      modalEl.style.display = 'none';
    });

    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) modalEl.style.display = 'none';
    });

    modalEl.querySelector('#copyStackBtn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(log.stack || '');
      const btn = modalEl.querySelector('#copyStackBtn');
      if (btn) btn.textContent = '✓ Copied!';
      setTimeout(() => { if (btn) btn.textContent = '📋 Copy Stack'; }, 1500);
    });

    modalEl.querySelector('#modalCopyJsonBtn')?.addEventListener('click', () => {
      navigator.clipboard.writeText(JSON.stringify(log, null, 2));
      const btn = modalEl.querySelector('#modalCopyJsonBtn');
      if (btn) btn.textContent = '✓ Copied JSON';
      setTimeout(() => { if (btn) btn.textContent = '📄 Copy JSON'; }, 1500);
    });

    modalEl.querySelector('#modalResolveBtn')?.addEventListener('click', async () => {
      await this.updateLogStatus(log.id, 'resolved');
      modalEl.style.display = 'none';
    });

    modalEl.querySelector('#modalReopenBtn')?.addEventListener('click', async () => {
      await this.updateLogStatus(log.id, 'open');
      modalEl.style.display = 'none';
    });

    modalEl.querySelector('#modalDeleteBtn')?.addEventListener('click', async () => {
      if (confirm(`Delete issue log #${log.id}?`)) {
        await this.deleteLog(log.id);
        modalEl.style.display = 'none';
      }
    });
  }

  async updateLogStatus(id, status) {
    try {
      const res = await fetch(`/api/logs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        await Promise.all([this.fetchStats(), this.fetchLogs()]);
      }
    } catch (err) {
      alert(`Failed to update log status: ${err.message}`);
    }
  }

  async deleteLog(id) {
    try {
      const res = await fetch(`/api/logs?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await Promise.all([this.fetchStats(), this.fetchLogs()]);
      }
    } catch (err) {
      alert(`Failed to delete log: ${err.message}`);
    }
  }

  async handlePurgeResolved() {
    if (confirm('Clear all resolved and ignored logs from database?')) {
      try {
        const res = await fetch('/api/logs?clearResolved=true', { method: 'DELETE' });
        const data = await res.json();
        alert(`Purged ${data.deletedCount || 0} resolved logs.`);
        await Promise.all([this.fetchStats(), this.fetchLogs()]);
      } catch (err) {
        alert(`Failed to purge logs: ${err.message}`);
      }
    }
  }

  async handlePurgeAll() {
    if (confirm('⚠️ WARNING: Delete ALL system and error logs? This will wipe all recorded logs across all platforms.')) {
      try {
        const res = await fetch('/api/logs?all=true', { method: 'DELETE' });
        const data = await res.json();
        alert(`Successfully cleared ${data.deletedCount || 0} logs.`);
        await Promise.all([this.fetchStats(), this.fetchLogs()]);
      } catch (err) {
        alert(`Failed to clear logs: ${err.message}`);
      }
    }
  }

  showExportMenu() {
    const choice = confirm('Download logs as CSV?\n(Click OK for CSV, Cancel for JSON)');
    const format = choice ? 'csv' : 'json';
    const params = new URLSearchParams();
    params.append('format', format);
    if (this.activeFilterLevel !== 'ALL') params.append('level', this.activeFilterLevel);
    if (this.activeFilterPlatform !== 'all') params.append('platform', this.activeFilterPlatform);
    if (this.activeFilterStatus !== 'all') params.append('status', this.activeFilterStatus);
    if (this.searchQuery) params.append('search', this.searchQuery);

    window.open(`/api/logs/export?${params.toString()}`, '_blank');
  }

  escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
