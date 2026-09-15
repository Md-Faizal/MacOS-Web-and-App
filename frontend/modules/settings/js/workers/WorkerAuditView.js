/**
 * WorkerAuditView.js
 * Renders the audit log view, platform filters, and activity history table.
 */
export class WorkerAuditView {
  constructor(coordinator) {
    this.coordinator = coordinator;
    this.auditPlatformFilter = 'all';
  }

  async loadAndRender(container) {
    const tbody = container.querySelector('#auditTableBody');
    if (!tbody) return;

    try {
      const res = await fetch('/api/admin/audit');
      if (!res.ok) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 28px; color: var(--wa-danger);">Failed to load audit events.</td></tr>';
        return;
      }

      const auditData = await res.json();
      const logs = Array.isArray(auditData) ? auditData : (auditData.logs || []);

      if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 32px; color: var(--wa-text-muted);">No audit events recorded yet.</td></tr>';
        return;
      }

      const renderTable = () => {
        const filter = this.auditPlatformFilter || 'all';
        const filtered = filter === 'all' 
          ? logs 
          : logs.filter(l => (l.platform || 'web').toLowerCase() === filter);

        if (filtered.length === 0) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 32px; color: var(--wa-text-muted);">No audit events recorded for this platform filter.</td></tr>';
          return;
        }

        tbody.innerHTML = filtered.map(log => {
          const time = new Date(log.created_at).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
          });
          const userLabel = log.display_name || log.username || log.email || (log.user_id === 'admin' ? 'Admin' : log.user_id) || 'System';
          const p = (log.platform || 'web').toLowerCase();
          const pBadge = p === 'pwa'
            ? '<span class="worker-platform-badge pwa">📱 PWA</span>'
            : (p === 'android' || p === 'native_android')
            ? '<span class="worker-platform-badge android">🤖 Android</span>'
            : '<span class="worker-platform-badge web">💻 Web</span>';

          return `
            <tr>
              <td style="font-size: 11.5px; white-space: nowrap; color: var(--wa-text-muted);">${time}</td>
              <td style="font-weight: 600; color: var(--wa-text-primary);">${this.escape(userLabel)}</td>
              <td>${pBadge}</td>
              <td><span class="audit-action-badge">${this.escape(log.action)}</span></td>
              <td style="text-transform: capitalize; color: var(--wa-text-secondary); font-weight: 500;">${this.escape(log.module)}</td>
              <td style="color: var(--wa-text-muted);">${this.escape(log.resource_name || log.resource_id || '-')}</td>
            </tr>
          `;
        }).join('');
      };

      renderTable();

      const filterContainer = container.querySelector('#auditPlatformFilters');
      if (filterContainer) {
        filterContainer.querySelectorAll('.worker-filter-pill').forEach(btn => {
          btn.onclick = () => {
            filterContainer.querySelectorAll('.worker-filter-pill').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.auditPlatformFilter = btn.dataset.platform;
            renderTable();
          };
        });
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 28px; color: var(--wa-danger);">Error connecting to audit service.</td></tr>';
    }
  }

  escape(value) {
    return String(value || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }
}
