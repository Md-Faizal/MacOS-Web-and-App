export class AdminComponent {
  constructor(container) {
    this.container = container;
    this.users = [];
    this.notifications = [];
    this.auditLogs = [];
    this.eventSource = null;
    this.currentTab = 'workers';
    
    // Available desktop apps for workers
    this.APP_LIST = [
      { id: 'billing', name: 'Billing', icon: '💰', desc: 'Create bills, receive payments, print invoices' },
      { id: 'products', name: 'Product List', icon: '🛍️', desc: 'Product catalog, batches, variants, pricing' },
      { id: 'contacts', name: 'Contacts', icon: '👥', desc: 'Customer & supplier accounts, ledger' },
      { id: 'analytics', name: 'Analytics', icon: '📊', desc: 'Sales trends, customer profiling, financial reports' },
      { id: 'notes', name: 'Notes', icon: '📝', desc: 'Personal notes and customer scratchpad' },
      { id: 'calendar', name: 'Calendar', icon: '📅', desc: 'Schedules, appointments, follow-ups' },
      { id: 'cloud', name: 'Cloud Files', icon: '☁️', desc: 'Document cloud backups, invoice exports' },
      { id: 'calculator', name: 'Calculator', icon: '🧮', desc: 'Standard business calculator utility' },
      { id: 'ai-vision', name: 'AI Camera', icon: '📸', desc: 'AI smart scanner and image recognition' },
      { id: 'settings', name: 'Settings', icon: '⚙️', desc: 'Worker profile & wallpaper settings' }
    ];
    this.DEFAULT_APPS = ['billing', 'products', 'contacts', 'analytics'];
  }

  async render() {
    this.container.innerHTML = `
      <div class="admin-container">
        <div class="admin-header">
          <h2 class="admin-title">Worker Access</h2>
          <div class="admin-tabs">
            <button class="admin-tab active" data-tab="workers">Workers</button>
            <button class="admin-tab" data-tab="requests">Requests <span id="requestsCount" style="background:#ff3b30;color:white;border-radius:10px;padding:2px 6px;font-size:10px;margin-left:4px;display:none;">0</span></button>
            <button class="admin-tab" data-tab="audit">Audit Log</button>
          </div>
        </div>

        <div class="admin-content">
          <!-- Active Workers Tab -->
          <div id="tab-workers" class="admin-view active">
            <div id="workersGrid" class="worker-grid">Loading workers...</div>
          </div>

          <!-- Pending Requests Tab -->
          <div id="tab-requests" class="admin-view">
            <div class="form-group" style="max-width: 400px; margin-bottom: 24px;">
              <label class="form-label">5-Digit Approval Code</label>
              <div style="display:flex; gap:12px;">
                <input class="form-input" id="adminApprovalCode" placeholder="e.g. 54321" maxlength="5" autocomplete="off" style="font-family:monospace; font-size:15px; letter-spacing:2px;">
                <button class="btn-primary" id="btnManualApprove">Verify</button>
              </div>
              <p style="font-size:12px; color:rgba(255,255,255,0.5); margin-top:8px;">Enter the 5-digit code provided by the worker to locate their pending request.</p>
            </div>
            <h3 style="font-size: 16px; margin-bottom: 16px;">Pending Requests</h3>
            <div id="requestsList" class="request-list"></div>
          </div>

          <!-- Audit Logs Tab -->
          <div id="tab-audit" class="admin-view">
            <div class="audit-table-wrapper">
              <table class="audit-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Module</th>
                    <th>Resource</th>
                  </tr>
                </thead>
                <tbody id="auditTableBody">
                  <tr><td colspan="5" style="text-align:center; padding: 24px;">Loading audit logs...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Worker Edit Modal -->
        <div id="workerEditModal" class="admin-modal-overlay">
          <div class="admin-modal" style="max-width: 600px;">
            <div class="modal-header">
              <h3 class="modal-title" id="modalWorkerName">Edit Worker</h3>
              <button class="modal-close" id="closeModalBtn">×</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">Account Status</label>
                <select id="modalWorkerStatus" class="form-input">
                  <option value="active">Active (Access Granted)</option>
                  <option value="suspended">Suspended (Access Revoked)</option>
                </select>
              </div>

              <div class="form-group">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                  <label class="form-label" style="margin-bottom:0;">App Permissions (Home Screen & Dock)</label>
                  <div style="display:flex; gap:6px;">
                    <button type="button" class="btn-preset-pill" id="btnPresetDefault">Default (4 Apps)</button>
                    <button type="button" class="btn-preset-pill" id="btnSelectAllApps">Select All</button>
                    <button type="button" class="btn-preset-pill" id="btnClearAllApps">Clear</button>
                  </div>
                </div>
                <p style="font-size:11.5px; opacity:0.65; margin-bottom:10px;">Select which applications will render on this worker's home desktop, dock, and launchpad.</p>
                <div class="apps-toggle-grid" id="modalAppsToggleGrid"></div>
              </div>

              <div class="form-group">
                <label class="form-label">Shared Customers (Contact IDs)</label>
                <input type="text" id="modalContactIds" class="form-input" placeholder="e.g. 1, 5, 12 (Leave blank for default private)">
                <p style="font-size:11px; opacity:0.6; margin-top:6px;">Comma-separated Contact IDs shared with this worker (e.g., Dacca). These customers will serve as the primary calculations for this worker and will be excluded from your master books by default.</p>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-danger" id="modalDeleteBtn" style="margin-right: auto;">Delete Worker</button>
              <button class="btn-primary" style="background: rgba(255,255,255,0.1); color: inherit;" id="modalCancelBtn">Cancel</button>
              <button class="btn-primary" id="modalSaveBtn">Save Changes</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.setupListeners();
    await this.refresh();
    
    if (this.eventSource) this.eventSource.close();
    this.eventSource = new EventSource('/api/realtime/events');
    this.eventSource.onmessage = () => this.refresh(false);
  }

  setupListeners() {
    // Tab switching
    this.container.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.container.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
        this.container.querySelectorAll('.admin-view').forEach(v => v.classList.remove('active'));
        
        e.target.classList.add('active');
        this.currentTab = e.target.dataset.tab;
        this.container.querySelector(`#tab-${this.currentTab}`).classList.add('active');

        if (this.currentTab === 'audit') {
          this.loadAuditLogs();
        }
      });
    });

    // Modal close
    const closeModal = () => {
      this.container.querySelector('#workerEditModal').classList.remove('show');
      this.editingUserId = null;
    };
    this.container.querySelector('#closeModalBtn').addEventListener('click', closeModal);
    this.container.querySelector('#modalCancelBtn').addEventListener('click', closeModal);

    // Save Changes
    this.container.querySelector('#modalSaveBtn').addEventListener('click', async () => {
      if (!this.editingUserId) return;
      await this.saveWorkerPermissions(this.editingUserId);
      closeModal();
    });

    // Delete
    this.container.querySelector('#modalDeleteBtn').addEventListener('click', async () => {
      if (!this.editingUserId) return;
      if (confirm('Are you sure you want to permanently delete and archive this worker? This will revoke all credentials.')) {
        await this.approveWorkerDeletion(this.editingUserId);
        closeModal();
      }
    });

    // Status change listener
    this.container.querySelector('#modalWorkerStatus').addEventListener('change', async (e) => {
      if (!this.editingUserId) return;
      await this.changeWorkerStatus(this.editingUserId, e.target.value);
    });
  }

  async refresh(full = true) {
    try {
      const [usersRes] = await Promise.all([
        fetch('/api/admin/users')
      ]);
      
      if (!usersRes.ok) {
        this.container.innerHTML = '<div style="padding: 24px;">Owner access required.</div>';
        return;
      }

      const data = await usersRes.json();
      this.users = data.users || [];
      
      this.renderUsers();
      
      if (full && this.currentTab === 'audit') {
        await this.loadAuditLogs();
      }
    } catch (err) {
      console.error('Failed to refresh admin data:', err);
    }
  }

  renderUsers() {
    if (!this.workerFilter) this.workerFilter = 'all';

    let filteredWorkers = this.users.filter(u => u.status !== 'pending');
    if (this.workerFilter === 'active') {
      filteredWorkers = filteredWorkers.filter(u => u.status === 'active' || u.status === 'suspended');
    } else if (this.workerFilter === 'pending_deletion') {
      filteredWorkers = filteredWorkers.filter(u => u.status === 'pending_deletion');
    } else if (this.workerFilter === 'deleted') {
      filteredWorkers = filteredWorkers.filter(u => u.status === 'deleted');
    }

    const pendingRequests = this.users.filter(u => u.status === 'pending');
    const pendingDeletions = this.users.filter(u => u.status === 'pending_deletion');

    // Update badge
    const badge = this.container.querySelector('#requestsCount');
    if (pendingRequests.length > 0) {
      badge.textContent = pendingRequests.length;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }

    // Render Active / Filtered Workers
    const grid = this.container.querySelector('#workersGrid');
    const filterHeaderHtml = `
      <div style="grid-column: 1/-1; display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;">
        <button class="worker-filter-pill ${this.workerFilter === 'all' ? 'active' : ''}" data-filter="all">All (${this.users.filter(u => u.status !== 'pending').length})</button>
        <button class="worker-filter-pill ${this.workerFilter === 'active' ? 'active' : ''}" data-filter="active">Active (${this.users.filter(u => u.status === 'active' || u.status === 'suspended').length})</button>
        <button class="worker-filter-pill ${this.workerFilter === 'pending_deletion' ? 'active' : ''}" data-filter="pending_deletion" style="${pendingDeletions.length ? 'border-color: #ff9500; color: #ff9500;' : ''}">Pending Deletion (${pendingDeletions.length})</button>
        <button class="worker-filter-pill ${this.workerFilter === 'deleted' ? 'active' : ''}" data-filter="deleted">Deleted History (${this.users.filter(u => u.status === 'deleted').length})</button>
      </div>
    `;

    if (filteredWorkers.length === 0) {
      grid.innerHTML = filterHeaderHtml + '<div style="color:rgba(255,255,255,0.5); grid-column: 1/-1; padding: 18px 0;">No workers match the selected filter.</div>';
    } else {
      grid.innerHTML = filterHeaderHtml + filteredWorkers.map(user => {
        const isDeleted = user.status === 'deleted';
        const isPendingDeletion = user.status === 'pending_deletion';
        const deletedDate = user.deleted_at ? new Date(user.deleted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const requestedDate = user.deletion_requested_at ? new Date(user.deletion_requested_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

        return `
        <div class="worker-card ${isDeleted ? 'deleted-card' : ''} ${isPendingDeletion ? 'pending-deletion-card' : ''}" data-id="${user.id}">
          <div class="worker-card-header">
            <img src="${user.google_picture || '/assets/Images/DefaultUser.png'}" class="worker-avatar" alt="Avatar">
            <div class="worker-info">
              <h4 class="worker-name">${this.escape(user.full_name || user.google_email || user.username)}</h4>
              <p class="worker-email">${this.escape(user.google_email || user.email)}</p>
            </div>
          </div>
          
          ${isPendingDeletion ? `
            <div style="background: rgba(255, 149, 0, 0.12); border: 1px solid rgba(255, 149, 0, 0.3); border-radius: 8px; padding: 8px 10px; margin: 4px 0; font-size: 11px;">
              <div style="font-weight: 600; color: #ff9500; margin-bottom: 2px;">⚠️ Deletion Requested ${requestedDate ? `(${requestedDate})` : ''}</div>
              <div style="color: rgba(255,255,255,0.7); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Reason: ${this.escape(user.deletion_reason || 'Not specified')}</div>
            </div>
            <div style="display:flex; gap:8px; margin-top: 4px;">
              <button class="btn-primary btn-approve-del" data-id="${user.id}" style="background: #ff3b30; font-size: 11px; padding: 6px 10px; flex: 1;">Approve Deletion</button>
              <button class="btn-primary btn-reject-del" data-id="${user.id}" style="background: rgba(255,255,255,0.15); font-size: 11px; padding: 6px 10px; flex: 1;">Reject</button>
            </div>
          ` : isDeleted ? `
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="worker-status deleted" style="background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.6);">Deleted ${deletedDate}</span>
              <button class="btn-view-history" data-id="${user.id}" style="background: transparent; border: none; color: #007aff; font-size: 11px; cursor: pointer; text-decoration: underline;">Lifecycle History</button>
            </div>
          ` : `
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="worker-status ${user.status}">${user.status}</span>
              <span style="font-size:11px; color:rgba(255,255,255,0.4)">${user.role}</span>
            </div>
          `}
        </div>
      `;
      }).join('');

      // Filter pill listeners
      grid.querySelectorAll('.worker-filter-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.workerFilter = btn.dataset.filter;
          this.renderUsers();
        });
      });

      // Add click listeners to cards (except action buttons)
      grid.querySelectorAll('.worker-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('button')) return;
          this.openWorkerEditModal(card.dataset.id);
        });
      });

      // Approve/Reject deletion listeners
      grid.querySelectorAll('.btn-approve-del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm('Approve worker account deletion? This will revoke all sessions and purge personal data while preserving business records.')) {
            await this.approveWorkerDeletion(btn.dataset.id);
          }
        });
      });

      grid.querySelectorAll('.btn-reject-del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.rejectWorkerDeletion(btn.dataset.id);
        });
      });

      grid.querySelectorAll('.btn-view-history').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.openWorkerHistoryModal(btn.dataset.id);
        });
      });
    }

    // Render 5-Digit code badge for requests
    const list = this.container.querySelector('#requestsList');
    if (pendingRequests.length === 0) {
      list.innerHTML = '<div style="color:rgba(255,255,255,0.5);">No pending access requests.</div>';
    } else {
      list.innerHTML = pendingRequests.map(user => `
        <div class="request-item">
          <div style="display:flex; align-items:center; gap:16px;">
            <img src="${user.google_picture || '/assets/Images/DefaultUser.png'}" style="width:48px;height:48px;border-radius:24px;background:rgba(255,255,255,0.1); object-fit:cover;">
            <div>
              <div style="font-weight:600; font-size:15px;">${this.escape(user.full_name || user.google_email)}</div>
              <div style="font-size:13px; color:rgba(255,255,255,0.6);">${this.escape(user.google_email || user.email)}</div>
              <div style="font-size:12px; color:#0a84ff; font-weight:700; font-family:monospace; margin-top:4px;">5-Digit Code: <span style="background:rgba(10,132,255,0.15); border:1px solid rgba(10,132,255,0.3); padding:2px 8px; border-radius:6px;">${user.invite_code}</span></div>
            </div>
          </div>
          <div class="request-actions">
            <button class="btn-danger btn-deny" data-id="${user.id}">Deny</button>
            <button class="btn-primary btn-approve" data-id="${user.id}">Review & Approve</button>
          </div>
        </div>
      `).join('');

      list.querySelectorAll('.btn-approve').forEach(btn => {
        btn.addEventListener('click', () => {
          const user = pendingRequests.find(u => u.id === btn.dataset.id);
          this.container.querySelector('#adminApprovalCode').value = user.invite_code;
          this.openWorkerEditModal(user.id, true);
        });
      });
      list.querySelectorAll('.btn-deny').forEach(btn => {
        btn.addEventListener('click', () => this.deleteWorker(btn.dataset.id));
      });
    }
  }

  async approveWorkerDeletion(userId) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/approve-deletion`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Worker account deletion approved.');
        this.refresh();
      } else {
        alert(data.error || 'Failed to approve deletion.');
      }
    } catch (e) {
      alert('Network error while approving deletion.');
    }
  }

  async rejectWorkerDeletion(userId) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/reject-deletion`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Deletion request rejected.');
        this.refresh();
      } else {
        alert(data.error || 'Failed to reject deletion.');
      }
    } catch (e) {
      alert('Network error while rejecting deletion.');
    }
  }

  async openWorkerHistoryModal(userId) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/history`);
      const data = await res.json();
      const history = data.history || [];

      let content = `
        <div style="font-size: 13px; line-height: 1.5; color: rgba(255,255,255,0.85);">
          ${history.length === 0 ? '<p>No historical lifecycle entries recorded for this worker.</p>' : history.map((item, idx) => `
            <div style="border-left: 2px solid #007aff; padding-left: 12px; margin-bottom: 16px;">
              <div style="font-weight: 600; color: #fff;">Lifecycle Cycle #${history.length - idx}</div>
              <div>Joined: ${item.joined_at ? new Date(item.joined_at).toLocaleString() : 'N/A'}</div>
              ${item.deleted_at ? `<div style="color:#ff3b30;">Deleted: ${new Date(item.deleted_at).toLocaleString()}</div>` : '<div style="color:#34c759;">Status: Active</div>'}
              ${item.deletion_reason ? `<div style="font-size: 11px; color: rgba(255,255,255,0.6);">Reason: ${this.escape(item.deletion_reason)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `;

      const historyModal = document.createElement('div');
      historyModal.className = 'admin-modal-overlay show';
      historyModal.innerHTML = `
        <div class="admin-modal" style="max-width: 480px;">
          <div class="modal-header">
            <h3 class="modal-title">Worker Lifecycle History</h3>
            <button class="modal-close">×</button>
          </div>
          <div class="modal-body">${content}</div>
          <div class="modal-footer">
            <button class="btn-primary modal-close-btn">Close</button>
          </div>
        </div>
      `;
      document.body.appendChild(historyModal);
      const close = () => historyModal.remove();
      historyModal.querySelector('.modal-close').onclick = close;
      historyModal.querySelector('.modal-close-btn').onclick = close;
    } catch (e) {
      alert('Unable to load history.');
    }
  }

  async loadAuditLogs() {
    try {
      const res = await fetch('/api/admin/audit');
      const data = await res.json();
      
      const tbody = this.container.querySelector('#auditTableBody');
      if (!data.logs || data.logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 24px; color:rgba(255,255,255,0.5)">No activity found.</td></tr>';
        return;
      }

      tbody.innerHTML = data.logs.map(log => {
        const user = this.users.find(u => u.id === log.user_id) || { full_name: 'Unknown User' };
        const date = new Date(log.created_at).toLocaleString();
        
        return `
          <tr>
            <td style="color:rgba(255,255,255,0.6); font-size:12px;">${date}</td>
            <td style="font-weight:500;">${this.escape(user.full_name)}</td>
            <td><span class="audit-action-badge">${this.escape(log.action)}</span></td>
            <td style="text-transform:capitalize;">${this.escape(log.module)}</td>
            <td>${this.escape(log.resource_name || log.resource_id || '-')}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    }
  }

  async openWorkerEditModal(userId, isPending = false) {
    this.editingUserId = userId;
    this.isApproving = isPending;
    const user = this.users.find(u => u.id === userId);
    if (!user) return;
    
    const modal = this.container.querySelector('#workerEditModal');
    this.container.querySelector('#modalWorkerName').textContent = isPending ? `Approve ${user.full_name}` : `Edit ${user.full_name}`;
    
    const statusSelect = this.container.querySelector('#modalWorkerStatus');
    if (isPending) {
      statusSelect.parentElement.style.display = 'none';
      this.container.querySelector('#modalSaveBtn').textContent = 'Approve Worker';
      this.container.querySelector('#modalDeleteBtn').style.display = 'none';
    } else {
      statusSelect.parentElement.style.display = 'block';
      statusSelect.value = user.status;
      this.container.querySelector('#modalSaveBtn').textContent = 'Save Changes';
      this.container.querySelector('#modalDeleteBtn').style.display = 'block';
    }

    // Load current permissions & contact IDs
    let allowedApps = isPending ? [...this.DEFAULT_APPS] : [];
    let contactIds = [];
    
    try {
      const res = await fetch(`/api/admin/users/${userId}/permissions`);
      if (res.ok) {
        const data = await res.json();
        contactIds = data.contactIds || [];
        if (data.allowedApps && data.allowedApps.length > 0) {
          allowedApps = data.allowedApps;
        } else if (isPending) {
          allowedApps = [...this.DEFAULT_APPS];
        }
      }
    } catch (err) {
      console.error('Failed to load permissions:', err);
    }

    this.container.querySelector('#modalContactIds').value = contactIds.join(', ');

    // Render modern App Permissions Grid
    const grid = this.container.querySelector('#modalAppsToggleGrid');
    grid.innerHTML = this.APP_LIST.map(app => {
      const isActive = allowedApps.includes(app.id);
      return `
        <div class="app-toggle-card ${isActive ? 'active' : ''}" data-app-id="${app.id}">
          <div class="app-toggle-icon">${app.icon}</div>
          <div class="app-toggle-info">
            <div class="app-toggle-title">${this.escape(app.name)}</div>
            <div class="app-toggle-desc">${this.escape(app.desc)}</div>
          </div>
          <div class="app-toggle-switch"></div>
        </div>
      `;
    }).join('');

    // Toggle card click
    grid.querySelectorAll('.app-toggle-card').forEach(card => {
      card.addEventListener('click', () => {
        card.classList.toggle('active');
      });
    });

    // Preset buttons
    this.container.querySelector('#btnPresetDefault').onclick = () => {
      grid.querySelectorAll('.app-toggle-card').forEach(card => {
        if (this.DEFAULT_APPS.includes(card.dataset.appId)) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });
    };

    this.container.querySelector('#btnSelectAllApps').onclick = () => {
      grid.querySelectorAll('.app-toggle-card').forEach(card => card.classList.add('active'));
    };

    this.container.querySelector('#btnClearAllApps').onclick = () => {
      grid.querySelectorAll('.app-toggle-card').forEach(card => card.classList.remove('active'));
    };

    modal.classList.add('show');
  }

  async saveWorkerPermissions(userId) {
    const contactIdsStr = this.container.querySelector('#modalContactIds').value;
    const contactIds = contactIdsStr.split(',').map(v => Number(v.trim())).filter(n => !isNaN(n) && n > 0);
    
    // Collect active apps from grid
    const grid = this.container.querySelector('#modalAppsToggleGrid');
    const allowedApps = Array.from(grid.querySelectorAll('.app-toggle-card.active')).map(c => c.dataset.appId);

    const payload = { allowedApps, contactIds };
    
    let endpoint = `/api/admin/users/${userId}/permissions`;
    let method = 'PUT';

    if (this.isApproving) {
      endpoint = `/api/admin/users/${userId}/approve`;
      method = 'POST';
      // Verify 5-digit code
      const code = this.container.querySelector('#adminApprovalCode').value.trim();
      const user = this.users.find(u => u.id === userId);
      if (code.toUpperCase() !== String(user.invite_code).toUpperCase()) {
        alert('Invalid 5-digit approval code.');
        return;
      }
    }

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }
      
      await this.refresh();
    } catch (err) {
      alert(err.message);
    }
  }

  async changeWorkerStatus(userId, status) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Failed to update status');
      
      // Update local state temporarily for snappy UI
      const user = this.users.find(u => u.id === userId);
      if (user) user.status = status;
      this.renderUsers();
    } catch (err) {
      alert(err.message);
    }
  }

  async deleteWorker(userId) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete worker');
      await this.refresh();
    } catch (err) {
      alert(err.message);
    }
  }

  escape(value) {
    return String(value || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }
}
