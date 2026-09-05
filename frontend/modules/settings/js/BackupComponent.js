/**
 * BACKUP & DISASTER RECOVERY COMPONENT
 * Configuration and Snapshot Manager for Settings > General tab
 */

export class BackupComponent {
  constructor(container) {
    this.container = container;
    this.config = {
      enabled: 'false',
      interval: 'daily',
      retentionCount: '7',
      compress: 'true',
      r2Enabled: 'false',
      r2AccountId: '',
      r2AccessKeyId: '',
      r2SecretAccessKey: '',
      r2SecretAccessKeyMasked: '',
      r2BucketName: '',
      r2CustomEndpoint: '',
      r2ApkMirror: 'false',
      lastBackupAt: '',
      lastBackupStatus: 'idle',
      lastBackupError: ''
    };
    this.backups = [];
    this.isLoading = false;
  }

  async render() {
    this.container.innerHTML = `
      <div class="backup-config-container">
        <!-- Status & Actions Card -->
        <div class="backup-card">
          <div class="backup-card-header">
            <div class="backup-card-title">
              <span>🛡️ System State & Instant Snapshot</span>
            </div>
            <div id="backupStatusPill" class="backup-status-pill idle">Idle</div>
          </div>
          <div style="font-size: 12px; color: var(--settings-text-secondary); line-height: 1.5;">
            Automatic snapshots secure your live SQLite database (including Customers, Invoices, Cloud Files, and App Credentials) with zero downtime.
          </div>
          <div id="backupLastMeta" style="font-size: 11px; color: var(--settings-text-tertiary);">
            Last Backup: Never
          </div>
          <div style="display: flex; gap: 10px; margin-top: 4px;">
            <button id="backupSnapshotNowBtn" class="storage-btn primary" style="flex: 1; padding: 7px 12px;">
              ⚡ Snapshot & Sync Now
            </button>
            <button id="backupRefreshBtn" class="storage-btn" style="padding: 7px 12px;">
              🔄 Refresh
            </button>
          </div>
        </div>

        <!-- Schedule & Retention Card -->
        <div class="backup-card">
          <div class="backup-card-header">
            <div class="backup-card-title">
              <span>⏰ Automated Snapshot Schedule</span>
            </div>
          </div>

          <div class="backup-toggle-row">
            <label style="font-size: 12px; font-weight: 500;">Enable Automatic Snapshots</label>
            <input type="checkbox" id="backupEnabledToggle" style="cursor: pointer; width: 16px; height: 16px;" />
          </div>

          <div class="backup-grid-2">
            <div class="backup-field">
              <label>Snapshot Frequency</label>
              <select id="backupIntervalSelect" class="backup-select">
                <option value="hourly">Hourly</option>
                <option value="6h">Every 6 Hours</option>
                <option value="12h">Every 12 Hours</option>
                <option value="daily">Daily (Recommended)</option>
              </select>
            </div>
            <div class="backup-field">
              <label>Retained Local Snapshots</label>
              <select id="backupRetentionSelect" class="backup-select">
                <option value="3">Keep last 3 snapshots</option>
                <option value="7">Keep last 7 snapshots (Recommended)</option>
                <option value="14">Keep last 14 snapshots</option>
                <option value="30">Keep last 30 snapshots</option>
              </select>
            </div>
          </div>

          <div class="backup-toggle-row">
            <label style="font-size: 12px; font-weight: 500;">GZIP Compression (.db.gz, ~85% disk reduction)</label>
            <input type="checkbox" id="backupCompressToggle" checked style="cursor: pointer; width: 16px; height: 16px;" />
          </div>
        </div>

        <!-- Cloudflare R2 / S3 Storage Card -->
        <div class="backup-card">
          <div class="backup-card-header">
            <div class="backup-card-title">
              <span>☁️ Cloudflare R2 Offsite Backup</span>
            </div>
            <button id="backupTestR2Btn" class="storage-btn" style="font-size: 11px; padding: 4px 10px;">
              🔍 Test Connection
            </button>
          </div>
          <div style="font-size: 12px; color: var(--settings-text-secondary);">
            Mirror database snapshots to Cloudflare R2 object storage for offsite disaster recovery (Free tier: 10GB storage, zero egress fees).
          </div>

          <div class="backup-toggle-row">
            <label style="font-size: 12px; font-weight: 500;">Sync Snapshots to Cloudflare R2</label>
            <input type="checkbox" id="backupR2EnabledToggle" style="cursor: pointer; width: 16px; height: 16px;" />
          </div>

          <div class="backup-toggle-row" style="margin-top: 4px;">
            <label style="font-size: 12px; font-weight: 500;">Mirror Android App Releases to Cloudflare R2 (Backup CDN)</label>
            <input type="checkbox" id="backupR2ApkMirrorToggle" style="cursor: pointer; width: 16px; height: 16px;" />
          </div>

          <div class="backup-grid-2">
            <div class="backup-field">
              <label>Cloudflare Account ID</label>
              <input type="text" id="backupR2AccountId" class="backup-input" placeholder="e.g. 7a3f890b..." />
            </div>
            <div class="backup-field">
              <label>R2 Bucket Name</label>
              <input type="text" id="backupR2BucketName" class="backup-input" placeholder="e.g. macos-db-backups" />
            </div>
            <div class="backup-field">
              <label>Access Key ID</label>
              <input type="text" id="backupR2AccessKeyId" class="backup-input" placeholder="e.g. 5d92e8a1..." />
            </div>
            <div class="backup-field">
              <label>Secret Access Key</label>
              <input type="password" id="backupR2SecretAccessKey" class="backup-input" placeholder="Enter secret key..." />
            </div>
          </div>

          <div class="backup-field" style="margin-top: 4px;">
            <label>Custom Endpoint (Optional, leave blank for standard Cloudflare R2)</label>
            <input type="text" id="backupR2CustomEndpoint" class="backup-input" placeholder="https://<account_id>.r2.cloudflarestorage.com" />
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 6px;">
            <button id="backupSaveConfigBtn" class="storage-btn primary" style="padding: 7px 16px;">
              💾 Save Configuration
            </button>
          </div>
        </div>

        <!-- Snapshots List Card -->
        <div class="backup-card" style="margin-bottom: 20px;">
          <div class="backup-card-header">
            <div class="backup-card-title">
              <span>📜 Available Snapshots</span>
            </div>
            <span id="backupSnapshotCount" style="font-size: 11px; color: var(--settings-text-tertiary);">0 snapshots</span>
          </div>

          <div id="backupSnapshotsList" class="backup-history-list">
            <div style="text-align: center; color: var(--settings-text-tertiary); padding: 12px;">
              Loading snapshots...
            </div>
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    await this.loadConfig();
    await this.loadSnapshots();
  }

  bindEvents() {
    const saveBtn = this.container.querySelector('#backupSaveConfigBtn');
    const snapshotNowBtn = this.container.querySelector('#backupSnapshotNowBtn');
    const refreshBtn = this.container.querySelector('#backupRefreshBtn');
    const testR2Btn = this.container.querySelector('#backupTestR2Btn');

    saveBtn?.addEventListener('click', () => this.saveConfig());
    snapshotNowBtn?.addEventListener('click', () => this.triggerInstantSnapshot());
    refreshBtn?.addEventListener('click', () => {
      this.loadConfig();
      this.loadSnapshots();
    });
    testR2Btn?.addEventListener('click', () => this.testR2Connection());
  }

  async loadConfig() {
    try {
      const res = await fetch('/api/settings/backup-config');
      const data = await res.json();
      if (data.success && data.config) {
        this.config = data.config;
        this.populateConfigUI();
      }
    } catch (err) {
      console.error('[BackupComponent] Load config failed:', err);
    }
  }

  populateConfigUI() {
    const enabledEl = this.container.querySelector('#backupEnabledToggle');
    const intervalEl = this.container.querySelector('#backupIntervalSelect');
    const retentionEl = this.container.querySelector('#backupRetentionSelect');
    const compressEl = this.container.querySelector('#backupCompressToggle');
    const r2EnabledEl = this.container.querySelector('#backupR2EnabledToggle');
    const r2AccountEl = this.container.querySelector('#backupR2AccountId');
    const r2BucketEl = this.container.querySelector('#backupR2BucketName');
    const r2AccessKeyEl = this.container.querySelector('#backupR2AccessKeyId');
    const r2SecretEl = this.container.querySelector('#backupR2SecretAccessKey');
    const r2EndpointEl = this.container.querySelector('#backupR2CustomEndpoint');
    const statusPill = this.container.querySelector('#backupStatusPill');
    const lastMetaEl = this.container.querySelector('#backupLastMeta');

    if (enabledEl) enabledEl.checked = this.config.enabled === 'true';
    if (intervalEl) intervalEl.value = this.config.interval || 'daily';
    if (retentionEl) retentionEl.value = this.config.retentionCount || '7';
    if (compressEl) compressEl.checked = this.config.compress !== 'false';
    if (r2EnabledEl) r2EnabledEl.checked = this.config.r2Enabled === 'true';
    const r2ApkMirrorEl = this.container.querySelector('#backupR2ApkMirrorToggle');
    if (r2ApkMirrorEl) r2ApkMirrorEl.checked = this.config.r2ApkMirror === 'true';
    if (r2AccountEl) r2AccountEl.value = this.config.r2AccountId || '';
    if (r2BucketEl) r2BucketEl.value = this.config.r2BucketName || '';
    if (r2AccessKeyEl) r2AccessKeyEl.value = this.config.r2AccessKeyId || '';
    if (r2SecretEl) r2SecretEl.value = this.config.r2SecretAccessKeyMasked || '';
    if (r2EndpointEl) r2EndpointEl.value = this.config.r2CustomEndpoint || '';

    // Status pill
    if (statusPill) {
      const st = this.config.lastBackupStatus || 'idle';
      statusPill.className = `backup-status-pill ${st}`;
      statusPill.textContent = st.toUpperCase();
    }

    if (lastMetaEl) {
      if (this.config.lastBackupAt) {
        const d = new Date(this.config.lastBackupAt).toLocaleString();
        lastMetaEl.textContent = `Last successful snapshot: ${d}`;
      } else {
        lastMetaEl.textContent = 'Last successful snapshot: None recorded';
      }
    }
  }

  async saveConfig() {
    const saveBtn = this.container.querySelector('#backupSaveConfigBtn');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    try {
      const payload = {
        enabled: this.container.querySelector('#backupEnabledToggle')?.checked ? 'true' : 'false',
        interval: this.container.querySelector('#backupIntervalSelect')?.value || 'daily',
        retentionCount: this.container.querySelector('#backupRetentionSelect')?.value || '7',
        compress: this.container.querySelector('#backupCompressToggle')?.checked ? 'true' : 'false',
        r2Enabled: this.container.querySelector('#backupR2EnabledToggle')?.checked ? 'true' : 'false',
        r2ApkMirror: this.container.querySelector('#backupR2ApkMirrorToggle')?.checked ? 'true' : 'false',
        r2AccountId: this.container.querySelector('#backupR2AccountId')?.value?.trim() || '',
        r2BucketName: this.container.querySelector('#backupR2BucketName')?.value?.trim() || '',
        r2AccessKeyId: this.container.querySelector('#backupR2AccessKeyId')?.value?.trim() || '',
        r2SecretAccessKey: this.container.querySelector('#backupR2SecretAccessKey')?.value?.trim() || '',
        r2CustomEndpoint: this.container.querySelector('#backupR2CustomEndpoint')?.value?.trim() || ''
      };

      const res = await fetch('/api/settings/backup-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert('Backup configuration saved successfully.');
        await this.loadConfig();
      } else {
        const err = await res.json();
        alert(`Failed to save configuration: ${err.error || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Network error saving configuration.');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save Configuration';
      }
    }
  }

  async testR2Connection() {
    const testBtn = this.container.querySelector('#backupTestR2Btn');
    if (testBtn) {
      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
    }

    try {
      const payload = {
        r2AccountId: this.container.querySelector('#backupR2AccountId')?.value?.trim() || '',
        r2BucketName: this.container.querySelector('#backupR2BucketName')?.value?.trim() || '',
        r2AccessKeyId: this.container.querySelector('#backupR2AccessKeyId')?.value?.trim() || '',
        r2SecretAccessKey: this.container.querySelector('#backupR2SecretAccessKey')?.value?.trim() || '',
        r2CustomEndpoint: this.container.querySelector('#backupR2CustomEndpoint')?.value?.trim() || ''
      };

      const res = await fetch('/api/settings/backup/test-r2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        alert(`✓ Cloudflare R2 Connection Test Successful!\n${data.message || 'Connected to bucket.'}`);
      } else {
        alert(`✗ Connection test failed: ${data.error || 'Could not access R2 bucket'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Network error during R2 connection test.');
    } finally {
      if (testBtn) {
        testBtn.disabled = false;
        testBtn.textContent = '🔍 Test Connection';
      }
    }
  }

  async triggerInstantSnapshot() {
    const btn = this.container.querySelector('#backupSnapshotNowBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Creating Snapshot & Uploading...';
    }

    try {
      const res = await fetch('/api/settings/db/backup', { method: 'POST' });
      const data = await res.json();

      if (res.ok && data.success) {
        let msg = `Snapshot created: ${data.filename} (${(data.sizeBytes / 1024).toFixed(1)} KB)`;
        if (data.cloudSynced) {
          msg += '\n✓ Successfully uploaded to Cloudflare R2 offsite backup!';
        }
        alert(msg);
        await this.loadConfig();
        await this.loadSnapshots();
      } else {
        alert(`Snapshot failed: ${data.error || 'Server error'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Network error while initiating snapshot.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '⚡ Snapshot & Sync Now';
      }
    }
  }

  async loadSnapshots() {
    const listEl = this.container.querySelector('#backupSnapshotsList');
    const countEl = this.container.querySelector('#backupSnapshotCount');
    if (!listEl) return;

    try {
      const res = await fetch('/api/settings/db/backups');
      const data = await res.json();
      this.backups = data.backups || [];

      if (countEl) {
        countEl.textContent = `${this.backups.length} snapshot${this.backups.length === 1 ? '' : 's'}`;
      }

      if (this.backups.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; color: var(--settings-text-tertiary); padding: 12px;">
            No snapshots created yet. Click "Snapshot & Sync Now" above.
          </div>
        `;
        return;
      }

      listEl.innerHTML = this.backups.map(b => {
        const d = new Date(b.createdAt).toLocaleString();
        const sizeStr = (b.sizeBytes / 1024).toFixed(1) + ' KB';
        const isGzip = b.isGzip || b.filename.endsWith('.gz');
        return `
          <div class="backup-history-item">
            <div style="display: flex; flex-direction: column; gap: 3px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span style="font-weight: 600;">${b.filename}</span>
                ${isGzip ? '<span style="font-size: 9px; padding: 1px 5px; background: rgba(52,199,89,0.15); color: #34c759; border-radius: 4px;">GZIP</span>' : ''}
              </div>
              <span style="font-size: 10px; color: var(--settings-text-tertiary);">
                📅 ${d} | 💾 ${sizeStr}
              </span>
            </div>
            <div style="display: flex; gap: 6px;">
              <button class="storage-btn primary" data-restore-snap="${b.filename}" style="padding: 4px 10px; font-size: 11px;">
                Restore
              </button>
              <button class="storage-btn danger" data-delete-snap="${b.filename}" style="padding: 4px 10px; font-size: 11px;">
                Delete
              </button>
            </div>
          </div>
        `;
      }).join('');

      // Bind restore listeners
      listEl.querySelectorAll('[data-restore-snap]').forEach(btn => {
        btn.addEventListener('click', () => {
          const fn = btn.getAttribute('data-restore-snap');
          this.confirmRestore(fn);
        });
      });

      // Bind delete listeners
      listEl.querySelectorAll('[data-delete-snap]').forEach(btn => {
        btn.addEventListener('click', () => {
          const fn = btn.getAttribute('data-delete-snap');
          this.deleteSnapshot(fn);
        });
      });

    } catch (err) {
      console.error(err);
      listEl.innerHTML = `
        <div style="text-align: center; color: #ff3b30; padding: 12px;">
          Failed to fetch snapshots list.
        </div>
      `;
    }
  }

  async confirmRestore(filename) {
    const ok = confirm(`⚠️ Warning: Are you sure you want to restore database from snapshot "${filename}"?\n\nThis will replace the active database. Current unbacked changes will be overwritten!`);
    if (!ok) return;

    try {
      const res = await fetch('/api/settings/db/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });

      if (res.ok) {
        alert('Database restored successfully from snapshot!');
        this.loadSnapshots();
      } else {
        const err = await res.json();
        alert(`Restore failed: ${err.error || 'Server error'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Network error restoring snapshot.');
    }
  }

  async deleteSnapshot(filename) {
    const ok = confirm(`Delete snapshot "${filename}" permanently?`);
    if (!ok) return;

    try {
      const res = await fetch('/api/settings/db/backup', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });

      if (res.ok) {
        this.loadSnapshots();
      } else {
        const err = await res.json();
        alert(`Delete failed: ${err.error || 'Server error'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Network error deleting snapshot.');
    }
  }
}
