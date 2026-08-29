export class AdminComponent {
  constructor(container) {
    this.container = container;
    this.users = [];
    this.notifications = [];
    this.auditLogs = [];
    this.eventSource = null;
    this.currentTab = 'workers';
    this.allContacts = [];
    this.selectedContactIds = [];
    this.functionalOverrides = {};
    
    // Available desktop apps for workers with proposed functional permissions
    this.APP_LIST = [
      { 
        id: 'billing', 
        name: 'Billing', 
        icon: '💰', 
        desc: 'Create bills, receive payments, print invoices',
        options: [
          { key: 'allow_discounts', label: 'Allow Item & Invoice Discounts', desc: 'Worker can apply price discounts on bills', default: true },
          { key: 'allow_credit_sales', label: 'Allow Credit Sales (Unpaid Due)', desc: 'Worker can issue invoices with pending balances', default: true },
          { key: 'allow_void_bill', label: 'Allow Voiding / Deleting Bills', desc: 'Worker can cancel and delete invoices', default: false },
          { key: 'allow_orders', label: 'Allow Creating Draft Orders', desc: 'Worker can place pending customer orders', default: true }
        ]
      },
      { 
        id: 'products', 
        name: 'Product List', 
        icon: '🛍️', 
        desc: 'Product catalog, batches, variants, pricing',
        options: [
          { key: 'view_cost_price', label: 'View Wholesale Cost & Margins', desc: 'Show wholesale buying cost on products', default: false },
          { key: 'edit_prices', label: 'Edit Product Catalog Prices', desc: 'Worker can change standard selling rates', default: false },
          { key: 'manage_inventory', label: 'Adjust Inventory & Batches', desc: 'Worker can alter physical stock quantities', default: false }
        ]
      },
      { 
        id: 'contacts', 
        name: 'Contacts', 
        icon: '👥', 
        desc: 'Customer & supplier accounts, ledger',
        isContactPicker: true
      },
      { 
        id: 'analytics', 
        name: 'Analytics', 
        icon: '📊', 
        desc: 'Sales trends, customer profiling, financial reports',
        options: [
          { key: 'view_profit_margins', label: 'View Profit & Gross Margins', desc: 'Display profit calculations and net yield', default: false },
          { key: 'view_customer_aging', label: 'View Customer Aging Reports', desc: 'Show 30/60/90+ days overdue analysis', default: true },
          { key: 'limit_30_days', label: 'Limit View to Past 30 Days', desc: 'Restrict analytics historical window', default: false }
        ]
      },
      { 
        id: 'notes', 
        name: 'Notes', 
        icon: '📝', 
        desc: 'Personal notes and customer scratchpad',
        options: [
          { key: 'view_shared_notes', label: 'Access Shared Store Notes', desc: 'Worker can read general store memos', default: true }
        ]
      },
      { 
        id: 'calendar', 
        name: 'Calendar', 
        icon: '📅', 
        desc: 'Schedules, appointments, follow-ups',
        options: [
          { key: 'view_store_schedule', label: 'View Store Calendar & Deadlines', desc: 'Show appointments and follow-up alerts', default: true }
        ]
      },
      { 
        id: 'cloud', 
        name: 'Cloud Files', 
        icon: '☁️', 
        desc: 'Document cloud backups, invoice exports',
        options: [
          { key: 'allow_uploads', label: 'Allow Uploading New Files', desc: 'Worker can upload documents and invoice scans', default: true }
        ]
      },
      { 
        id: 'calculator', 
        name: 'Calculator', 
        icon: '🧮', 
        desc: 'Standard business calculator utility',
        options: [
          { key: 'standard_mode', label: 'Standard Calculator Mode', desc: 'Allow normal calculation operations', default: true }
        ]
      },
      { 
        id: 'ai-vision', 
        name: 'AI Camera', 
        icon: '📸', 
        desc: 'AI smart scanner and image recognition',
        options: [
          { key: 'enable_ocr', label: 'Enable Smart Invoice Scanning', desc: 'Worker can scan bills with device camera', default: true }
        ]
      },
      { 
        id: 'settings', 
        name: 'Settings', 
        icon: '⚙️', 
        desc: 'Worker profile & wallpaper settings',
        options: [
          { key: 'allow_wallpapers', label: 'Allow Customizing Wallpaper', desc: 'Worker can pick desktop wallpapers', default: true }
        ]
      }
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
          <div class="admin-modal" style="max-width: 620px;">
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
                  <label class="form-label" style="margin-bottom:0;">App Permissions & Functional Overrides</label>
                  <div style="display:flex; gap:6px;">
                    <button type="button" class="btn-preset-pill" id="btnPresetDefault">Default (4 Apps)</button>
                    <button type="button" class="btn-preset-pill" id="btnSelectAllApps">Select All</button>
                    <button type="button" class="btn-preset-pill" id="btnClearAllApps">Clear</button>
                  </div>
                </div>
                <p style="font-size:11.5px; opacity:0.65; margin-bottom:10px;">Select which applications will render on this worker's home desktop, and click ➔ on any app to configure granular functional rules or shared contacts.</p>
                <div class="apps-toggle-grid" id="modalAppsToggleGrid"></div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-danger" id="modalDeleteBtn" style="margin-right: auto;">Delete Worker</button>
              <button class="btn-primary" style="background: rgba(255,255,255,0.1); color: inherit;" id="modalCancelBtn">Cancel</button>
              <button class="btn-primary" id="modalSaveBtn">Save Changes</button>
            </div>
          </div>
        </div>

        <!-- UI Contact Picker Sub-Modal -->
        <div id="contactPickerModal" class="admin-modal-overlay" style="z-index: 110;">
          <div class="admin-modal" style="max-width: 580px; max-height: 85vh;">
            <div class="modal-header">
              <div>
                <h3 class="modal-title">Shared Contacts</h3>
                <p style="font-size: 11px; opacity: 0.6; margin: 2px 0 0 0;" id="contactPickerSubtitle">Select customers shared with this worker</p>
              </div>
              <button class="modal-close" id="closeContactPickerBtn">×</button>
            </div>
            <div class="modal-body" style="padding: 16px 20px;">
              <div style="margin-bottom: 12px;">
                <input class="form-input contact-picker-search" id="contactPickerSearch" placeholder="🔍 Search customers by name, phone, email, GSTIN...">
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 11.5px;">
                <div style="font-weight: 600; color: #007aff;" id="contactSelectionSummary">0 Selected</div>
                <div style="display: flex; gap: 8px;">
                  <button type="button" class="btn-preset-pill" id="btnSelectAllContacts">Select All</button>
                  <button type="button" class="btn-preset-pill" id="btnClearAllContacts">Clear All</button>
                </div>
              </div>
              <div class="contact-picker-list" id="contactPickerList">
                <div style="text-align: center; padding: 24px; color: rgba(255,255,255,0.5);">Loading contacts...</div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-primary" id="btnApplyContacts">Done</button>
            </div>
          </div>
        </div>

        <!-- Per-App Functional Settings Sub-Modal -->
        <div id="appFunctionalSettingsModal" class="admin-modal-overlay" style="z-index: 110;">
          <div class="admin-modal" style="max-width: 520px;">
            <div class="modal-header">
              <div>
                <h3 class="modal-title" id="appFunctionalTitle">App Permissions</h3>
                <p style="font-size: 11px; opacity: 0.6; margin: 2px 0 0 0;">Configure granular business rules for this worker</p>
              </div>
              <button class="modal-close" id="closeFunctionalModalBtn">×</button>
            </div>
            <div class="modal-body" style="padding: 16px 20px;">
              <div id="appFunctionalOptionsList" style="display: flex; flex-direction: column; gap: 10px;"></div>
            </div>
            <div class="modal-footer">
              <button class="btn-primary" id="btnApplyFunctionalSettings">Done</button>
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

    // 5-Digit Manual Approve code input & button
    const approveCodeInput = this.container.querySelector('#adminApprovalCode');
    const approveBtn = this.container.querySelector('#btnManualApprove');

    if (approveCodeInput && approveBtn) {
      const handleVerifyCode = () => {
        const code = approveCodeInput.value.trim().toUpperCase();
        if (!code || code.length !== 5) {
          alert('Please enter a valid 5-digit verification code.');
          return;
        }

        const pending = this.users.find(u => u.status === 'pending' && String(u.invite_code).toUpperCase() === code);
        if (pending) {
          this.openWorkerEditModal(pending.id, true);
        } else {
          alert(`No pending access request found with code: ${code}`);
        }
      };

      approveBtn.addEventListener('click', handleVerifyCode);
      approveCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleVerifyCode();
      });
    }

    // Sub-modal listeners: Contact Picker
    const closeContactPicker = () => {
      this.container.querySelector('#contactPickerModal').classList.remove('show');
      this.updateContactsBadge();
    };
    this.container.querySelector('#closeContactPickerBtn').addEventListener('click', closeContactPicker);
    this.container.querySelector('#btnApplyContacts').addEventListener('click', closeContactPicker);

    // Sub-modal listeners: Functional Settings
    const closeFunctionalModal = () => {
      this.container.querySelector('#appFunctionalSettingsModal').classList.remove('show');
    };
    this.container.querySelector('#closeFunctionalModalBtn').addEventListener('click', closeFunctionalModal);
    this.container.querySelector('#btnApplyFunctionalSettings').addEventListener('click', closeFunctionalModal);
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

      const usersData = await usersRes.json();
      this.users = Array.isArray(usersData) ? usersData : (usersData.users || []);
      this.renderUsers();
      if (this.currentTab === 'audit' && full) {
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
        const requestedDate = user.deletion_requested_at ? new Date(user.deletion_requested_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

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
          <div class="request-info">
            <img src="${user.google_picture || '/assets/Images/DefaultUser.png'}" class="worker-avatar" alt="Avatar">
            <div>
              <div style="font-weight: 600;">${this.escape(user.full_name || user.google_email)}</div>
              <div style="font-size: 11px; opacity: 0.6;">${this.escape(user.google_email)}</div>
              <div style="font-size: 11px; margin-top: 4px;">
                <span style="font-family:monospace; background:rgba(0,122,255,0.2); border: 1px solid rgba(0,122,255,0.4); color:#007aff; padding:2px 6px; border-radius:4px; font-weight:700; letter-spacing:1px;">Code: ${user.invite_code || 'N/A'}</span>
                <span style="opacity: 0.5; margin-left: 6px;">Requested: ${new Date(user.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          <button class="btn-primary btn-review" data-id="${user.id}">Review & Approve</button>
        </div>
      `).join('');

      list.querySelectorAll('.btn-review').forEach(btn => {
        btn.addEventListener('click', () => {
          this.openWorkerEditModal(btn.dataset.id, true);
        });
      });
    }
  }

  async loadAuditLogs() {
    try {
      const res = await fetch('/api/admin/audit');
      if (!res.ok) return;
      const auditData = await res.json();
      const logs = Array.isArray(auditData) ? auditData : (auditData.logs || []);
      
      const tbody = this.container.querySelector('#auditTableBody');
      if (logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 24px;">No audit events recorded yet.</td></tr>';
        return;
      }

      tbody.innerHTML = logs.map(log => {
        const time = new Date(log.created_at).toLocaleString();
        return `
          <tr>
            <td style="font-size: 11px; white-space: nowrap;">${time}</td>
            <td>${this.escape(log.username || log.user_id || 'System')}</td>
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

  async fetchAllContacts() {
    try {
      const res = await fetch('/api/contacts');
      if (res.ok) {
        const data = await res.json();
        this.allContacts = Array.isArray(data) ? data : (data.contacts || data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch contacts for picker:', err);
    }
  }

  updateContactsBadge() {
    const badge = this.container.querySelector('#contactsCountBadge');
    if (badge) {
      const count = this.selectedContactIds.length;
      badge.textContent = count > 0 ? `${count} shared` : 'Private';
      badge.style.background = count > 0 ? 'rgba(0, 122, 255, 0.2)' : 'rgba(255, 255, 255, 0.1)';
      badge.style.color = count > 0 ? '#007aff' : 'rgba(255, 255, 255, 0.6)';
    }
  }

  async openContactPickerModal() {
    if (!this.allContacts || this.allContacts.length === 0) {
      await this.fetchAllContacts();
    }

    const modal = this.container.querySelector('#contactPickerModal');
    const searchInput = this.container.querySelector('#contactPickerSearch');
    const list = this.container.querySelector('#contactPickerList');
    const summary = this.container.querySelector('#contactSelectionSummary');

    searchInput.value = '';

    const renderList = (filtered) => {
      summary.textContent = `${this.selectedContactIds.length} of ${this.allContacts.length} Selected`;

      if (filtered.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding: 24px; color:rgba(255,255,255,0.5);">No contacts found matching filter.</div>';
        return;
      }

      list.innerHTML = filtered.map(c => {
        const isSelected = this.selectedContactIds.includes(c.id);
        const initial = (c.name || 'C').charAt(0).toUpperCase();
        return `
          <div class="contact-picker-item ${isSelected ? 'selected' : ''}" data-id="${c.id}">
            <input type="checkbox" class="contact-checkbox" ${isSelected ? 'checked' : ''}>
            <div class="contact-avatar">${initial}</div>
            <div class="contact-picker-details">
              <div class="contact-picker-name">
                ${this.escape(c.name)}
                <span class="contact-type-tag">${this.escape(c.type || 'Customer')}</span>
                ${c.exclude_from_stats ? '<span class="badge-excluded" title="Excluded from Master Stats">🚫 Excluded</span>' : ''}
              </div>
              <div class="contact-picker-sub">${this.escape(c.phone || c.email || c.address || 'No phone/email')}</div>
            </div>
          </div>
        `;
      }).join('');

      // Row click toggles selection
      list.querySelectorAll('.contact-picker-item').forEach(item => {
        item.addEventListener('click', (e) => {
          const contactId = Number(item.dataset.id);
          const checkbox = item.querySelector('.contact-checkbox');
          
          if (this.selectedContactIds.includes(contactId)) {
            this.selectedContactIds = this.selectedContactIds.filter(id => id !== contactId);
            item.classList.remove('selected');
            if (checkbox) checkbox.checked = false;
          } else {
            this.selectedContactIds.push(contactId);
            item.classList.add('selected');
            if (checkbox) checkbox.checked = true;
          }
          summary.textContent = `${this.selectedContactIds.length} of ${this.allContacts.length} Selected`;
        });
      });
    };

    // Live search
    searchInput.oninput = () => {
      const q = searchInput.value.toLowerCase().trim();
      const filtered = this.allContacts.filter(c => 
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q)) ||
        (c.gstin && c.gstin.toLowerCase().includes(q))
      );
      renderList(filtered);
    };

    // Preset select/clear all
    this.container.querySelector('#btnSelectAllContacts').onclick = () => {
      this.selectedContactIds = this.allContacts.map(c => c.id);
      renderList(this.allContacts);
    };

    this.container.querySelector('#btnClearAllContacts').onclick = () => {
      this.selectedContactIds = [];
      renderList(this.allContacts);
    };

    renderList(this.allContacts);
    modal.classList.add('show');
  }

  openAppFunctionalSettingsModal(appId) {
    const app = this.APP_LIST.find(a => a.id === appId);
    if (!app || !app.options || app.options.length === 0) return;

    const modal = this.container.querySelector('#appFunctionalSettingsModal');
    this.container.querySelector('#appFunctionalTitle').textContent = `${app.name} Functional Overrides`;
    const list = this.container.querySelector('#appFunctionalOptionsList');

    if (!this.functionalOverrides[appId]) {
      this.functionalOverrides[appId] = {};
    }

    list.innerHTML = app.options.map(opt => {
      const isEnabled = this.functionalOverrides[appId][opt.key] !== undefined
        ? Boolean(this.functionalOverrides[appId][opt.key])
        : Boolean(opt.default);

      return `
        <div class="functional-option-row" data-opt-key="${opt.key}" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:12px 14px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); cursor:pointer;">
          <div style="flex:1; margin-right:12px;">
            <div style="font-weight:600; font-size:13px; margin-bottom:2px;">${this.escape(opt.label)}</div>
            <div style="font-size:11px; opacity:0.6;">${this.escape(opt.desc)}</div>
          </div>
          <div class="app-toggle-switch ${isEnabled ? 'active' : ''}" style="pointer-events:none;"></div>
        </div>
      `;
    }).join('');

    list.querySelectorAll('.functional-option-row').forEach(row => {
      row.addEventListener('click', () => {
        const key = row.dataset.optKey;
        const sw = row.querySelector('.app-toggle-switch');
        const nowActive = !sw.classList.contains('active');
        if (nowActive) {
          sw.classList.add('active');
        } else {
          sw.classList.remove('active');
        }
        this.functionalOverrides[appId][key] = nowActive;
      });
    });

    modal.classList.add('show');
  }

  async openWorkerEditModal(userId, isPending = false) {
    this.editingUserId = userId;
    this.isApproving = isPending;
    const user = this.users.find(u => u.id === userId);
    if (!user) return;
    
    const modal = this.container.querySelector('#workerEditModal');
    this.container.querySelector('#modalWorkerName').textContent = isPending ? `Approve ${user.full_name || user.google_email}` : `Edit ${user.full_name || user.google_email}`;
    
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
    this.selectedContactIds = [];
    this.functionalOverrides = {};
    
    try {
      const res = await fetch(`/api/admin/users/${userId}/permissions`);
      if (res.ok) {
        const data = await res.json();
        this.selectedContactIds = data.contactIds || [];
        this.functionalOverrides = data.functionalOverrides || {};
        if (data.allowedApps && data.allowedApps.length > 0) {
          allowedApps = data.allowedApps;
        } else if (isPending) {
          allowedApps = [...this.DEFAULT_APPS];
        }
      }
    } catch (err) {
      console.error('Failed to load permissions:', err);
    }

    // Render modern App Permissions Grid with drill-down configure button
    const grid = this.container.querySelector('#modalAppsToggleGrid');
    grid.innerHTML = this.APP_LIST.map(app => {
      const isActive = allowedApps.includes(app.id);
      const isContacts = app.id === 'contacts';
      const contactsBadgeText = isContacts ? (this.selectedContactIds.length > 0 ? `${this.selectedContactIds.length} shared` : 'Private') : '';

      return `
        <div class="app-toggle-card ${isActive ? 'active' : ''}" data-app-id="${app.id}">
          <div class="app-toggle-icon">${app.icon}</div>
          <div class="app-toggle-info">
            <div class="app-toggle-title">
              ${this.escape(app.name)}
              ${isContacts ? `<span class="app-card-badge" id="contactsCountBadge">${contactsBadgeText}</span>` : ''}
            </div>
            <div class="app-toggle-desc">${this.escape(app.desc)}</div>
          </div>
          <div class="app-card-actions">
            <button type="button" class="app-configure-btn" data-app-id="${app.id}" title="${isContacts ? 'Select Shared Contacts' : 'Configure App Overrides'}">➔</button>
            <div class="app-toggle-switch"></div>
          </div>
        </div>
      `;
    }).join('');

    // Toggle card click
    grid.querySelectorAll('.app-toggle-card').forEach(card => {
      card.addEventListener('click', (e) => {
        // If clicking configure button, don't toggle app active state
        if (e.target.closest('.app-configure-btn')) return;
        card.classList.toggle('active');
      });
    });

    // Configure button click (Drilldown)
    grid.querySelectorAll('.app-configure-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const appId = btn.dataset.appId;
        if (appId === 'contacts') {
          this.openContactPickerModal();
        } else {
          this.openAppFunctionalSettingsModal(appId);
        }
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
    // Collect active apps from grid
    const grid = this.container.querySelector('#modalAppsToggleGrid');
    const allowedApps = Array.from(grid.querySelectorAll('.app-toggle-card.active')).map(c => c.dataset.appId);

    const payload = { 
      allowedApps, 
      contactIds: this.selectedContactIds,
      functionalOverrides: this.functionalOverrides
    };
    
    let endpoint = `/api/admin/users/${userId}/permissions`;
    let method = 'PUT';

    if (this.isApproving) {
      endpoint = `/api/admin/users/${userId}/approve`;
      method = 'POST';
      // Verify 5-digit code
      const code = this.container.querySelector('#adminApprovalCode').value.trim();
      const user = this.users.find(u => u.id === userId);
      if (code && user.invite_code && code.toUpperCase() !== String(user.invite_code).toUpperCase()) {
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
