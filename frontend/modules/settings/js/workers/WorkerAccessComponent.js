/**
 * WorkerAccessComponent.js
 * Main Coordinator for the Worker Access module in Settings.
 * Orchestrates:
 * - WorkersListView (Workers tab)
 * - WorkerRequestsView (Pending Requests & 5-digit verification)
 * - AccountsBoardView (Visual Node-Graph & SVG Wire Board)
 * - WorkerAuditView (Audit Logs)
 * - WorkerModals (Permissions, Contact Picker, Overrides, Lifecycle)
 */

import { WorkersListView } from './WorkersListView.js';
import { WorkerRequestsView } from './WorkerRequestsView.js';
import { AccountsBoardView } from './AccountsBoardView.js';
import { WorkerAuditView } from './WorkerAuditView.js';
import { WorkerModals } from './WorkerModals.js';

export class WorkerAccessComponent {
  constructor(container) {
    this.container = container;
    this.users = [];
    this.currentTab = 'workers';
    this.workerFilter = 'all';
    this.eventSource = null;

    // Sub-views
    this.workersListView = new WorkersListView(this);
    this.requestsView = new WorkerRequestsView(this);
    this.boardView = new AccountsBoardView(this);
    this.auditView = new WorkerAuditView(this);
    this.modals = new WorkerModals(this);

    // Available desktop apps for workers with proposed functional permissions
    this.APP_LIST = [
      { 
        id: 'billing', 
        name: 'Billing & POS', 
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
        name: 'Product Catalog', 
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
        name: 'Contacts & CRM', 
        icon: '👥', 
        desc: 'Customer & supplier accounts, ledger scoping',
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
        <!-- Header -->
        <div class="admin-header">
          <div class="admin-title-area">
            <h2 class="admin-title">Worker Access</h2>
          </div>
          <div class="admin-tabs">
            <button class="admin-tab ${this.currentTab === 'workers' ? 'active' : ''}" data-tab="workers">
              <span>👷 Workers</span>
            </button>
            <button class="admin-tab ${this.currentTab === 'requests' ? 'active' : ''}" data-tab="requests">
              <span>⏳ Requests</span>
              <span id="requestsCount" class="admin-tab-badge" style="display:none;">0</span>
            </button>
            <button class="admin-tab ${this.currentTab === 'board' ? 'active' : ''}" data-tab="board">
              <span>🕸️ Relationship Board</span>
            </button>
            <button class="admin-tab ${this.currentTab === 'audit' ? 'active' : ''}" data-tab="audit">
              <span>📜 Audit Log</span>
            </button>
          </div>
        </div>

        <!-- Main Content Area -->
        <div class="admin-content">
          <!-- 1. Workers Tab -->
          <div id="tab-workers" class="admin-view ${this.currentTab === 'workers' ? 'active' : ''}">
            <!-- Global Admin Worker Badge Preference -->
            <div class="admin-badge-pref-card">
              <div>
                <div class="admin-badge-pref-title">
                  <span>👷</span> <span>Show Worker Activity Badges</span>
                </div>
                <div class="admin-badge-pref-desc">Display visual indicators on contacts, products, bills, payments, and orders created or edited by workers (Admin view only).</div>
              </div>
              <label class="macos-admin-switch" title="Toggle visual badges across the OS">
                <input type="checkbox" id="adminToggleWorkerBadges">
                <span class="macos-admin-slider"></span>
              </label>
            </div>

            <div id="workersGrid" class="worker-grid">Loading workers...</div>
          </div>

          <!-- 2. Pending Requests Tab -->
          <div id="tab-requests" class="admin-view ${this.currentTab === 'requests' ? 'active' : ''}">
            <div class="request-verify-box">
              <label class="form-label">5-Digit Approval Code Verification</label>
              <div style="display:flex; gap:10px;">
                <input class="form-input" id="adminApprovalCode" placeholder="e.g. 54321" maxlength="5" autocomplete="off" style="font-family:monospace; font-size:15px; letter-spacing:2.5px; text-transform:uppercase;">
                <button class="btn-primary" id="btnManualApprove">Verify Code</button>
              </div>
              <p style="font-size:11.5px; color:var(--wa-text-muted); margin:8px 0 0 0;">Enter the 5-digit verification code provided by the worker to immediately locate and approve their pending access request.</p>
            </div>
            <h3 style="font-size:15px; font-weight:700; margin: 0 0 14px 0; color:var(--wa-text-primary);">Pending Access Requests</h3>
            <div id="requestsList" class="request-list"></div>
          </div>

          <!-- 3. Relationship Board Tab (New Visual Graph Canvas) -->
          <div id="tab-board" class="admin-view ${this.currentTab === 'board' ? 'active' : ''}">
            <div id="boardContainer" style="height:100%; width:100%;"></div>
          </div>

          <!-- 4. Audit Log Tab -->
          <div id="tab-audit" class="admin-view ${this.currentTab === 'audit' ? 'active' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; gap: 8px;" id="auditPlatformFilters">
                <button class="worker-filter-pill active" data-platform="all">All Platforms</button>
                <button class="worker-filter-pill" data-platform="pwa">📱 PWA</button>
                <button class="worker-filter-pill" data-platform="android">🤖 Android App</button>
                <button class="worker-filter-pill" data-platform="web">💻 Web</button>
              </div>
            </div>
            <div class="audit-table-wrapper">
              <table class="audit-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Platform</th>
                    <th>Action</th>
                    <th>Module</th>
                    <th>Resource</th>
                  </tr>
                </thead>
                <tbody id="auditTableBody">
                  <tr><td colspan="6" style="text-align:center; padding: 24px; color:var(--wa-text-muted);">Loading audit logs...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Worker Edit Modal -->
        <div id="workerEditModal" class="admin-modal-overlay">
          <div class="admin-modal" style="max-width: 620px;">
            <div class="modal-header">
              <div>
                <h3 class="modal-title" id="modalWorkerName">Edit Worker</h3>
                <div id="modalWorkerEmails" style="font-size:12px; color:var(--wa-text-muted); margin-top:3px;"></div>
              </div>
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
                <p style="font-size:11.5px; color:var(--wa-text-muted); margin-bottom:10px;">Select which applications will render on this worker's home desktop, and click ➔ on any app to configure granular functional rules or shared contacts.</p>
                <div class="apps-toggle-grid" id="modalAppsToggleGrid"></div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-danger" id="modalDeleteBtn" style="margin-right: auto;">Delete Worker</button>
              <button class="btn-secondary" id="modalCancelBtn">Cancel</button>
              <button class="btn-primary" id="modalSaveBtn">Save Changes</button>
            </div>
          </div>
        </div>

        <!-- Contact Picker Sub-Modal -->
        <div id="contactPickerModal" class="admin-modal-overlay" style="z-index: 110;">
          <div class="admin-modal" style="max-width: 580px; max-height: 85vh;">
            <div class="modal-header">
              <div>
                <h3 class="modal-title">Shared Contacts</h3>
                <p style="font-size: 11px; color:var(--wa-text-muted); margin: 2px 0 0 0;" id="contactPickerSubtitle">Select customers shared with this worker</p>
              </div>
              <button class="modal-close" id="closeContactPickerBtn">×</button>
            </div>
            <div class="modal-body" style="padding: 16px 20px;">
              <div style="margin-bottom: 12px;">
                <input class="form-input contact-picker-search" id="contactPickerSearch" placeholder="🔍 Search customers by name, phone, email, GSTIN...">
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 11.5px;">
                <div style="font-weight: 700; color: var(--wa-accent);" id="contactSelectionSummary">0 Selected</div>
                <div style="display: flex; gap: 8px;">
                  <button type="button" class="btn-preset-pill" id="btnSelectAllContacts">Select All</button>
                  <button type="button" class="btn-preset-pill" id="btnClearAllContacts">Clear All</button>
                </div>
              </div>
              <div class="contact-picker-list" id="contactPickerList">
                <div style="text-align: center; padding: 24px; color: var(--wa-text-muted);">Loading contacts...</div>
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
                <p style="font-size: 11px; color:var(--wa-text-muted); margin: 2px 0 0 0;">Configure granular business rules for this worker</p>
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

        <!-- Worker Lifecycle History Modal -->
        <div id="workerHistoryModal" class="admin-modal-overlay" style="z-index: 120;">
          <div class="admin-modal" style="max-width: 560px; max-height: 85vh;">
            <div class="modal-header">
              <div>
                <h3 class="modal-title" id="workerHistoryModalTitle">Lifecycle History</h3>
                <p style="font-size: 11px; color:var(--wa-text-muted); margin: 2px 0 0 0;" id="workerHistoryModalSubtitle">Audit events and timeline</p>
              </div>
              <button class="modal-close" id="closeWorkerHistoryBtn">×</button>
            </div>
            <div class="modal-body" style="padding: 16px 20px;">
              <div id="workerHistoryTimeline" class="lifecycle-timeline" style="display: flex; flex-direction: column; gap: 10px; max-height: 400px; overflow-y: auto;">
                <div style="text-align: center; padding: 24px; color: var(--wa-text-muted);">Loading history...</div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn-primary" id="btnCloseWorkerHistory">Close</button>
            </div>
          </div>
        </div>

      </div>
    `;

    this.setupListeners();
    this.modals.setupListeners(this.container);
    await this.refresh();

    // Setup realtime event stream
    if (this.eventSource) this.eventSource.close();
    try {
      this.eventSource = new EventSource('/api/realtime/events');
      this.eventSource.onmessage = () => this.refresh(false);
    } catch (_) {}
  }

  setupListeners() {
    // Tab switching
    this.container.querySelectorAll('.admin-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const targetTab = e.currentTarget.dataset.tab;
        this.switchTab(targetTab);
      });
    });

    // Worker Badge Visibility Toggle
    const toggleBadges = this.container.querySelector('#adminToggleWorkerBadges');
    if (toggleBadges) {
      const isEnabled = localStorage.getItem('macos_show_worker_badges') !== 'false';
      toggleBadges.checked = isEnabled;
      this.updateBadgeSliderStyle(toggleBadges);

      toggleBadges.addEventListener('change', async (e) => {
        const val = e.target.checked;
        this.updateBadgeSliderStyle(toggleBadges);
        localStorage.setItem('macos_show_worker_badges', val ? 'true' : 'false');
        if (val) {
          document.body.classList.remove('hide-worker-badges');
          document.documentElement.removeAttribute('data-hide-worker-badges');
        } else {
          document.body.classList.add('hide-worker-badges');
          document.documentElement.setAttribute('data-hide-worker-badges', 'true');
        }

        try {
          await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ setting_key: 'showWorkerBadges', setting_value: val })
          });
        } catch (_) {}

        window.dispatchEvent(new CustomEvent('worker-badges-toggle-changed', { detail: { enabled: val } }));
      });
    }

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
  }

  switchTab(tabName) {
    this.currentTab = tabName;
    this.container.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    this.container.querySelectorAll('.admin-view').forEach(v => v.classList.remove('active'));

    const tabBtn = this.container.querySelector(`.admin-tab[data-tab="${tabName}"]`);
    const viewEl = this.container.querySelector(`#tab-${tabName}`);

    if (tabBtn) tabBtn.classList.add('active');
    if (viewEl) viewEl.classList.add('active');

    if (tabName === 'audit') {
      this.auditView.loadAndRender(this.container);
    } else if (tabName === 'board') {
      const boardContainer = this.container.querySelector('#boardContainer');
      if (boardContainer) {
        this.boardView.render(boardContainer);
      }
    }
  }

  updateBadgeSliderStyle(input) {
    const slider = input?.parentElement?.querySelector('.macos-admin-slider');
    if (!slider) return;
    if (input.checked) {
      slider.style.backgroundColor = 'var(--wa-accent)';
      slider.innerHTML = '<span style="position: absolute; content: \'\'; height: 20px; width: 20px; left: 22px; bottom: 2px; background-color: white; transition: .25s; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.25);"></span>';
    } else {
      slider.style.backgroundColor = 'rgba(120, 120, 128, 0.32)';
      slider.innerHTML = '<span style="position: absolute; content: \'\'; height: 20px; width: 20px; left: 2px; bottom: 2px; background-color: white; transition: .25s; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.25);"></span>';
    }
  }

  async refresh(full = true) {
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) {
        this.container.innerHTML = '<div style="padding: 24px; color:var(--wa-text-primary);">Owner access required.</div>';
        return;
      }

      const usersData = await res.json();
      this.users = Array.isArray(usersData) ? usersData : (usersData.users || []);

      // Render Workers List View
      const workersGrid = this.container.querySelector('#workersGrid');
      if (workersGrid) {
        this.workersListView.render(workersGrid, this.users, this.workerFilter);
      }

      // Render Requests View & Update badge
      const pendingRequests = this.users.filter(u => u.status === 'pending');
      const badge = this.container.querySelector('#requestsCount');
      if (badge) {
        if (pendingRequests.length > 0) {
          badge.textContent = pendingRequests.length;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      }

      const requestsList = this.container.querySelector('#requestsList');
      if (requestsList) {
        this.requestsView.render(requestsList, pendingRequests);
      }

      // If currently on board, refresh board
      if (this.currentTab === 'board' && full) {
        const boardContainer = this.container.querySelector('#boardContainer');
        if (boardContainer) this.boardView.render(boardContainer);
      } else if (this.currentTab === 'audit' && full) {
        this.auditView.loadAndRender(this.container);
      }
    } catch (err) {
      console.error('Failed to refresh worker access data:', err);
    }
  }

  setWorkerFilter(filter) {
    this.workerFilter = filter;
    const workersGrid = this.container.querySelector('#workersGrid');
    if (workersGrid) {
      this.workersListView.render(workersGrid, this.users, this.workerFilter);
    }
  }

  openWorkerEditModal(userId, isPending = false) {
    this.modals.openWorkerEditModal(this.container, userId, isPending);
  }

  openWorkerHistoryModal(userId) {
    this.modals.openWorkerHistoryModal(this.container, userId);
  }

  async changeWorkerStatus(userId, status) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Failed to update status');

      const user = this.users.find(u => u.id === userId);
      if (user) user.status = status;
      const workersGrid = this.container.querySelector('#workersGrid');
      if (workersGrid) {
        this.workersListView.render(workersGrid, this.users, this.workerFilter);
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async approveWorkerDeletion(userId) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/approve-deletion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        const delRes = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
        if (!delRes.ok) {
          const data = await delRes.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to delete worker');
        }
      }
      await this.refresh();
    } catch (err) {
      console.error('Approve worker deletion error:', err);
      alert(err.message || 'Failed to delete worker');
    }
  }

  async rejectWorkerDeletion(userId) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/reject-deletion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to reject deletion request');
      }
      await this.refresh();
    } catch (err) {
      console.error('Reject worker deletion error:', err);
      alert(err.message || 'Failed to reject deletion');
    }
  }

  async denyWorkerRequest(userId) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to deny access request');
      }
      await this.refresh();
    } catch (err) {
      console.error('Deny request error:', err);
      alert(err.message || 'Failed to deny request');
    }
  }
}
