/**
 * WorkersListView.js
 * Renders the active and archived workers grid, filter pills, and quick actions.
 */
export class WorkersListView {
  constructor(coordinator) {
    this.coordinator = coordinator;
  }

  render(container, users, workerFilter = 'all') {
    let filteredWorkers = users.filter(u => u.status !== 'pending');
    if (workerFilter === 'active') {
      filteredWorkers = filteredWorkers.filter(u => u.status === 'active' || u.status === 'suspended');
    } else if (workerFilter === 'pending_deletion') {
      filteredWorkers = filteredWorkers.filter(u => u.status === 'pending_deletion');
    } else if (workerFilter === 'deleted') {
      filteredWorkers = filteredWorkers.filter(u => u.status === 'deleted');
    }

    const pendingDeletions = users.filter(u => u.status === 'pending_deletion');
    const totalCount = users.filter(u => u.status !== 'pending').length;
    const activeCount = users.filter(u => u.status === 'active' || u.status === 'suspended').length;
    const deletedCount = users.filter(u => u.status === 'deleted').length;

    const filterHeaderHtml = `
      <div style="grid-column: 1/-1; display: flex; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; align-items: center;">
        <button class="worker-filter-pill ${workerFilter === 'all' ? 'active' : ''}" data-filter="all">All (${totalCount})</button>
        <button class="worker-filter-pill ${workerFilter === 'active' ? 'active' : ''}" data-filter="active">Active (${activeCount})</button>
        <button class="worker-filter-pill ${workerFilter === 'pending_deletion' ? 'active' : ''}" data-filter="pending_deletion" style="${pendingDeletions.length ? 'border-color: #ff9500; color: #ff9500;' : ''}">Pending Deletion (${pendingDeletions.length})</button>
        <button class="worker-filter-pill ${workerFilter === 'deleted' ? 'active' : ''}" data-filter="deleted">Deleted History (${deletedCount})</button>
      </div>
    `;

    if (filteredWorkers.length === 0) {
      container.innerHTML = filterHeaderHtml + `
        <div style="grid-column: 1/-1; padding: 36px 0; text-align: center; color: var(--wa-text-muted);">
          <div style="font-size: 28px; margin-bottom: 8px;">👷</div>
          <div style="font-weight: 600; font-size: 14px;">No workers match the selected filter</div>
          <div style="font-size: 12px; margin-top: 4px;">Select another category or invite new workers to your store.</div>
        </div>
      `;
    } else {
      container.innerHTML = filterHeaderHtml + filteredWorkers.map(user => {
        const isDeleted = user.status === 'deleted';
        const isPendingDeletion = user.status === 'pending_deletion';
        const deletedDate = user.deleted_at ? new Date(user.deleted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const requestedDate = user.deletion_requested_at ? new Date(user.deletion_requested_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

        const platform = (user.last_client_type || (user.last_device_type?.includes('PWA') ? 'pwa' : (user.last_device_type?.includes('Android') ? 'android' : (user.last_platform || '')))).toLowerCase();
        const platformBadge = platform === 'pwa' 
          ? '<span class="worker-platform-badge pwa">📱 PWA</span>'
          : (platform === 'android' || platform === 'native_android')
          ? '<span class="worker-platform-badge android">🤖 Android</span>'
          : platform === 'web'
          ? '<span class="worker-platform-badge web">💻 Web</span>'
          : '';

        const isGoogle = Boolean(user.google_id || user.google_email);
        const providerPill = isGoogle 
          ? '<span class="wa-provider-pill google" title="Google OAuth Worker">🌐 Google</span>'
          : '<span class="wa-provider-pill local" title="Local Credentials Worker">🔑 Local</span>';

        const userLocal = user.email;
        const userGoogle = user.google_email;
        const hasBothDifferent = Boolean(userLocal && userGoogle && userLocal.toLowerCase() !== userGoogle.toLowerCase());

        return `
          <div class="worker-card ${isDeleted ? 'deleted-card' : ''} ${isPendingDeletion ? 'pending-deletion-card' : ''}" data-id="${user.id}">
            <div class="worker-card-header">
              <img src="${user.google_picture || '/assets/Images/DefaultUser.png'}" class="worker-avatar" alt="Avatar" onerror="this.src='/assets/Images/DefaultUser.png'">
              <div class="worker-info">
                <div style="display: flex; align-items: center; gap: 6px; justify-content: space-between;">
                  <h4 class="worker-name" title="${this.escape(user.full_name || user.google_email || user.username)}">${this.escape(user.full_name || user.google_email || user.username)}</h4>
                  ${providerPill}
                </div>
                ${hasBothDifferent ? `
                  <div class="worker-emails-dual" style="display:flex; flex-direction:column; gap:2px; margin-top:2px;">
                    <div class="worker-email" style="display:flex; align-items:center; gap:4px; font-size:11px;" title="Local Email: ${this.escape(userLocal)}">
                      <span style="font-size:10px; opacity:0.8;">🔑</span>
                      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escape(userLocal)}</span>
                    </div>
                    <div class="worker-email" style="display:flex; align-items:center; gap:4px; font-size:11px; color:var(--wa-wire-google);" title="Google Email: ${this.escape(userGoogle)}">
                      <span style="font-size:10px; opacity:0.8;">🌐</span>
                      <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escape(userGoogle)}</span>
                    </div>
                  </div>
                ` : `
                  <p class="worker-email" title="${this.escape(userGoogle || userLocal || 'No email')}">${this.escape(userGoogle || userLocal || 'No email')}</p>
                `}
              </div>
            </div>
            
            ${isPendingDeletion ? `
              <div class="deletion-alert-box">
                <div class="deletion-alert-title">⚠️ Deletion Requested ${requestedDate ? `(${requestedDate})` : ''}</div>
                <div class="deletion-alert-reason">Reason: ${this.escape(user.deletion_reason || 'Not specified')}</div>
              </div>
              <div style="display: flex; gap: 8px; margin-top: 4px;">
                <button class="btn-primary btn-approve-del" data-id="${user.id}" style="background: var(--wa-danger); font-size: 11px; padding: 6px 10px; flex: 1;">Approve Deletion</button>
                <button class="btn-secondary btn-reject-del" data-id="${user.id}" style="font-size: 11px; padding: 6px 10px; flex: 1;">Reject</button>
              </div>
            ` : isDeleted ? `
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                <div style="display: flex; gap: 6px; align-items: center;">
                  <span class="worker-status deleted">Deleted ${deletedDate}</span>
                  ${platformBadge}
                </div>
                <button class="btn-view-history" data-id="${user.id}" style="background: transparent; border: none; color: var(--wa-accent); font-size: 11.5px; font-weight: 600; cursor: pointer; text-decoration: underline;">Lifecycle History</button>
              </div>
            ` : `
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                <div style="display: flex; gap: 6px; align-items: center;">
                  <span class="worker-status ${user.status}">${user.status}</span>
                  ${platformBadge}
                </div>
                <span style="font-size: 11.5px; color: var(--wa-text-muted); font-weight: 500;">${this.escape(user.role)}</span>
              </div>
            `}
          </div>
        `;
      }).join('');

      // Bind filter pill events
      container.querySelectorAll('.worker-filter-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.coordinator.setWorkerFilter(btn.dataset.filter);
        });
      });

      // Bind card clicks
      container.querySelectorAll('.worker-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          const user = users.find(u => u.id === card.dataset.id);
          if (user && user.status === 'deleted') {
            this.coordinator.openWorkerHistoryModal(card.dataset.id);
          } else {
            this.coordinator.openWorkerEditModal(card.dataset.id);
          }
        });
      });

      // Bind approve/reject deletion
      container.querySelectorAll('.btn-approve-del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm('Approve worker account deletion? This will revoke all sessions and purge personal data while preserving business records.')) {
            await this.coordinator.approveWorkerDeletion(btn.dataset.id);
          }
        });
      });

      container.querySelectorAll('.btn-reject-del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.coordinator.rejectWorkerDeletion(btn.dataset.id);
        });
      });

      container.querySelectorAll('.btn-view-history').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.coordinator.openWorkerHistoryModal(btn.dataset.id);
        });
      });
    }
  }

  escape(value) {
    return String(value || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }
}
