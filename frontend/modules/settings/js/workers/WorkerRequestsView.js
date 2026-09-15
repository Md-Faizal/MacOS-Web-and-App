/**
 * WorkerRequestsView.js
 * Renders pending access requests and 5-digit verification code lookup.
 */
export class WorkerRequestsView {
  constructor(coordinator) {
    this.coordinator = coordinator;
  }

  render(container, pendingRequests) {
    if (!pendingRequests || pendingRequests.length === 0) {
      container.innerHTML = `
        <div style="padding: 36px 0; text-align: center; color: var(--wa-text-muted);">
          <div style="font-size: 28px; margin-bottom: 8px;">⏳</div>
          <div style="font-weight: 600; font-size: 14px;">No Pending Access Requests</div>
          <div style="font-size: 12px; margin-top: 4px;">When a worker submits a registration code, their request will appear here for review.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = pendingRequests.map(user => {
      const isGoogle = Boolean(user.google_id || user.google_email);
      const providerPill = isGoogle 
        ? '<span class="wa-provider-pill google">🌐 Google</span>'
        : '<span class="wa-provider-pill local">🔑 Local</span>';

      const userLocal = user.email;
      const userGoogle = user.google_email;
      const hasBothDifferent = Boolean(userLocal && userGoogle && userLocal.toLowerCase() !== userGoogle.toLowerCase());

      return `
        <div class="request-item">
          <div class="request-info">
            <img src="${user.google_picture || '/assets/Images/DefaultUser.png'}" class="worker-avatar" alt="Avatar" onerror="this.src='/assets/Images/DefaultUser.png'">
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-weight: 600; font-size: 14px; color: var(--wa-text-primary);">${this.escape(user.full_name || user.google_email || user.username)}</span>
                ${providerPill}
              </div>
              ${hasBothDifferent ? `
                <div style="display:flex; flex-direction:column; gap:2px; margin-top:2px;">
                  <span style="font-size:11.5px; color:var(--wa-text-muted); display:flex; align-items:center; gap:4px;" title="Local Email: ${this.escape(userLocal)}">
                    <span>🔑</span> ${this.escape(userLocal)}
                  </span>
                  <span style="font-size:11.5px; color:var(--wa-wire-google); display:flex; align-items:center; gap:4px;" title="Google Email: ${this.escape(userGoogle)}">
                    <span>🌐</span> ${this.escape(userGoogle)}
                  </span>
                </div>
              ` : `
                <div style="font-size: 12px; color: var(--wa-text-muted); margin-top: 1px;">${this.escape(userGoogle || userLocal || 'No email')}</div>
              `}
              <div style="font-size: 11.5px; margin-top: 5px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <span class="request-code-badge">Code: ${this.escape(user.invite_code || 'N/A')}</span>
                <span style="color: var(--wa-text-muted);">Requested: ${new Date(user.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </div>
          </div>
          <div class="request-actions" style="display: flex; gap: 8px; align-items: center; flex-shrink: 0;">
            <button class="btn-secondary btn-deny" data-id="${user.id}" style="color: var(--wa-danger); border-color: rgba(255, 59, 48, 0.3);">Deny</button>
            <button class="btn-primary btn-review" data-id="${user.id}">Review & Approve</button>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.btn-deny').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Deny this access request? The request will be permanently deleted.')) {
          await this.coordinator.denyWorkerRequest(btn.dataset.id);
        }
      });
    });

    container.querySelectorAll('.btn-review').forEach(btn => {
      btn.addEventListener('click', () => {
        this.coordinator.openWorkerEditModal(btn.dataset.id, true);
      });
    });
  }

  escape(value) {
    return String(value || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }
}
