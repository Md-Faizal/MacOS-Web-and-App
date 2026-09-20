/**
 * WorkerModals.js
 * Manages all dialogs and sub-modals for Worker Access:
 * - WorkerEditModal (permissions, apps grid, presets, status)
 * - ContactPickerModal (scoped customers picker)
 * - AppFunctionalSettingsModal (granular business rules)
 * - WorkerLifecycleHistoryModal (timeline & audit trail)
 */
export class WorkerModals {
  constructor(coordinator) {
    this.coordinator = coordinator;
    this.editingUserId = null;
    this.isApproving = false;
    this.selectedContactIds = [];
    this.functionalOverrides = {};
    this.allContacts = [];
    this.portalRoot = null;
    this.mainContainer = null;
    this._onKeyDown = null;
  }

  getRoot(container) {
    if (container && container.querySelector && container.querySelector('#workerEditModal')) {
      return container;
    }
    return this.portalRoot || document.getElementById('workerAccessModalsPortal') || document;
  }

  getMain(container) {
    if (this.mainContainer) return this.mainContainer;
    if (this.coordinator?.container) return this.coordinator.container;
    return container || document;
  }

  // Bind top-level modal events
  setupListeners(portalElement, mainContainer) {
    const root = portalElement || document.getElementById('workerAccessModalsPortal') || document;
    this.portalRoot = root;
    this.mainContainer = mainContainer || this.coordinator?.container || document;

    // Edit Modal close buttons
    const closeModal = () => {
      root.querySelector('#workerEditModal')?.classList.remove('show');
      this.editingUserId = null;
    };
    root.querySelector('#closeModalBtn')?.addEventListener('click', closeModal);
    root.querySelector('#modalCancelBtn')?.addEventListener('click', closeModal);

    // Save Changes button
    root.querySelector('#modalSaveBtn')?.addEventListener('click', async () => {
      if (!this.editingUserId) return;
      await this.saveWorkerPermissions(root, this.editingUserId);
      closeModal();
    });

    // Delete / Deny button
    root.querySelector('#modalDeleteBtn')?.addEventListener('click', async () => {
      if (!this.editingUserId) return;
      if (this.isApproving) {
        if (confirm('Are you sure you want to deny this access request?')) {
          await this.coordinator.denyWorkerRequest(this.editingUserId);
          closeModal();
        }
      } else {
        if (confirm('Are you sure you want to permanently delete and archive this worker? This will revoke all credentials.')) {
          await this.coordinator.approveWorkerDeletion(this.editingUserId);
          closeModal();
        }
      }
    });

    // Status change listener
    root.querySelector('#modalWorkerStatus')?.addEventListener('change', async (e) => {
      if (!this.editingUserId) return;
      await this.coordinator.changeWorkerStatus(this.editingUserId, e.target.value);
    });

    // Contact Picker Sub-Modal close
    const closeContactPicker = () => {
      root.querySelector('#contactPickerModal')?.classList.remove('show');
      this.updateContactsBadge(root);
    };
    root.querySelector('#closeContactPickerBtn')?.addEventListener('click', closeContactPicker);
    root.querySelector('#btnApplyContacts')?.addEventListener('click', closeContactPicker);

    // Functional Settings Sub-Modal close
    const closeFunctionalModal = () => {
      root.querySelector('#appFunctionalSettingsModal')?.classList.remove('show');
    };
    root.querySelector('#closeFunctionalModalBtn')?.addEventListener('click', closeFunctionalModal);
    root.querySelector('#btnApplyFunctionalSettings')?.addEventListener('click', closeFunctionalModal);

    // Worker Lifecycle History Sub-Modal close
    const closeHistoryModal = () => {
      root.querySelector('#workerHistoryModal')?.classList.remove('show');
    };
    root.querySelector('#closeWorkerHistoryBtn')?.addEventListener('click', closeHistoryModal);
    root.querySelector('#btnCloseWorkerHistory')?.addEventListener('click', closeHistoryModal);

    // Backdrop click dismissal for all modal overlays
    root.querySelectorAll('.admin-modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('show');
          if (overlay.id === 'workerEditModal') {
            this.editingUserId = null;
          } else if (overlay.id === 'contactPickerModal') {
            this.updateContactsBadge(root);
          }
        }
      });
    });

    // Global Escape key listener to close top-most active dialog
    if (this._onKeyDown) {
      window.removeEventListener('keydown', this._onKeyDown);
    }
    this._onKeyDown = (e) => {
      if (e.key === 'Escape') {
        const contactPicker = root.querySelector('#contactPickerModal.show');
        if (contactPicker) {
          contactPicker.classList.remove('show');
          this.updateContactsBadge(root);
          return;
        }
        const functionalModal = root.querySelector('#appFunctionalSettingsModal.show');
        if (functionalModal) {
          functionalModal.classList.remove('show');
          return;
        }
        const editModal = root.querySelector('#workerEditModal.show');
        if (editModal) {
          editModal.classList.remove('show');
          this.editingUserId = null;
          return;
        }
        const historyModal = root.querySelector('#workerHistoryModal.show');
        if (historyModal) {
          historyModal.classList.remove('show');
          return;
        }
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
  }

  async openWorkerEditModal(container, userId, isPending = false) {
    this.editingUserId = userId;
    this.isApproving = isPending;
    const user = this.coordinator.users.find(u => u.id === userId);
    if (!user) return;

    const root = this.getRoot(container);
    const modal = root.querySelector('#workerEditModal');
    const titleEl = root.querySelector('#modalWorkerName');
    if (titleEl) {
      titleEl.textContent = isPending 
        ? `Approve ${user.full_name || user.google_email || user.username}` 
        : `Edit ${user.full_name || user.google_email || user.username}`;
    }

    const emailSubEl = root.querySelector('#modalWorkerEmails');
    if (emailSubEl) {
      const userLocal = user.email;
      const userGoogle = user.google_email;
      const hasBothDifferent = Boolean(userLocal && userGoogle && userLocal.toLowerCase() !== userGoogle.toLowerCase());
      if (hasBothDifferent) {
        emailSubEl.innerHTML = `
          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
            <span style="display:flex; align-items:center; gap:4px;" title="Local Registration Email">
              <span>🔑</span> <strong>Local:</strong> ${userLocal}
            </span>
            <span style="display:flex; align-items:center; gap:4px; color:var(--wa-wire-google);" title="Google OAuth Email">
              <span>🌐</span> <strong>Google:</strong> ${userGoogle}
            </span>
          </div>
        `;
      } else {
        emailSubEl.textContent = userGoogle || userLocal || 'No email registered';
      }
    }

    const statusSelect = root.querySelector('#modalWorkerStatus');
    const deleteBtn = root.querySelector('#modalDeleteBtn');
    const saveBtn = root.querySelector('#modalSaveBtn');

    if (isPending) {
      if (statusSelect) {
        const parent = statusSelect.closest('.modal-status-inline') || statusSelect.parentElement;
        if (parent) parent.style.display = 'none';
      }
      if (saveBtn) saveBtn.textContent = 'Approve Worker';
      if (deleteBtn) {
        deleteBtn.style.display = 'block';
        deleteBtn.textContent = 'Deny Request';
      }
    } else {
      if (statusSelect) {
        const parent = statusSelect.closest('.modal-status-inline') || statusSelect.parentElement;
        if (parent) parent.style.display = 'inline-flex';
        statusSelect.value = user.status;
      }
      if (saveBtn) saveBtn.textContent = 'Save Changes';
      if (deleteBtn) {
        deleteBtn.style.display = 'block';
        deleteBtn.textContent = 'Delete Worker';
      }
    }

    // Load current permissions & contact IDs
    let allowedApps = isPending ? [...this.coordinator.DEFAULT_APPS] : [];
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
          allowedApps = [...this.coordinator.DEFAULT_APPS];
        }
      }
    } catch (err) {
      console.error('Failed to load permissions:', err);
    }

    // Render modern App Permissions Grid
    const grid = root.querySelector('#modalAppsToggleGrid');
    grid.innerHTML = this.coordinator.APP_LIST.map(app => {
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

    grid.querySelectorAll('.app-toggle-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.app-configure-btn')) return;
        card.classList.toggle('active');
      });
    });

    grid.querySelectorAll('.app-configure-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const appId = btn.dataset.appId;
        if (appId === 'contacts') {
          this.openContactPickerModal(root);
        } else {
          this.openAppFunctionalSettingsModal(root, appId);
        }
      });
    });

    // Preset buttons
    root.querySelector('#btnPresetDefault').onclick = () => {
      grid.querySelectorAll('.app-toggle-card').forEach(card => {
        if (this.coordinator.DEFAULT_APPS.includes(card.dataset.appId)) {
          card.classList.add('active');
        } else {
          card.classList.remove('active');
        }
      });
    };

    root.querySelector('#btnSelectAllApps').onclick = () => {
      grid.querySelectorAll('.app-toggle-card').forEach(card => card.classList.add('active'));
    };

    root.querySelector('#btnClearAllApps').onclick = () => {
      grid.querySelectorAll('.app-toggle-card').forEach(card => card.classList.remove('active'));
    };

    modal.classList.add('show');
  }

  async saveWorkerPermissions(container, userId) {
    const root = this.getRoot(container);
    const main = this.getMain(container);
    const grid = root.querySelector('#modalAppsToggleGrid');
    const allowedApps = Array.from(grid?.querySelectorAll('.app-toggle-card.active') || []).map(c => c.dataset.appId);

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
      const codeInput = main.querySelector('#adminApprovalCode') || document.querySelector('#adminApprovalCode');
      const code = codeInput ? codeInput.value.trim() : '';
      const user = this.coordinator.users.find(u => u.id === userId);
      if (code && user?.invite_code && code.toUpperCase() !== String(user.invite_code).toUpperCase()) {
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
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save worker permissions');
      }
      
      await this.coordinator.refresh();
    } catch (err) {
      alert(err.message);
    }
  }

  updateContactsBadge(container) {
    const root = this.getRoot(container);
    const badge = root.querySelector('#contactsCountBadge');
    if (badge) {
      const count = this.selectedContactIds.length;
      badge.textContent = count > 0 ? `${count} shared` : 'Private';
    }
  }

  async openContactPickerModal(container) {
    const root = this.getRoot(container);
    if (!this.allContacts || this.allContacts.length === 0) {
      try {
        const res = await fetch('/api/contacts');
        if (res.ok) {
          const data = await res.json();
          const normalizeCollection = payload => {
            if (Array.isArray(payload)) return payload;
            if (!payload) return [];
            if (Array.isArray(payload.items)) return payload.items;
            if (Array.isArray(payload.data)) return payload.data;
            if (Array.isArray(payload.data?.items)) return payload.data.items;
            if (Array.isArray(payload.contacts)) return payload.contacts;
            return [];
          };
          this.allContacts = normalizeCollection(data);
        }
      } catch (err) {
        console.error('Failed to fetch contacts:', err);
      }
    }

    const modal = root.querySelector('#contactPickerModal');
    const searchInput = root.querySelector('#contactPickerSearch');
    const list = root.querySelector('#contactPickerList');
    const summary = root.querySelector('#contactSelectionSummary');

    if (searchInput) searchInput.value = '';

    const renderList = (filtered) => {
      if (summary) summary.textContent = `${this.selectedContactIds.length} of ${this.allContacts.length} Selected`;

      if (!filtered || filtered.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--wa-text-muted);">No contacts found matching filter.</div>';
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

      list.querySelectorAll('.contact-picker-item').forEach(item => {
        item.addEventListener('click', () => {
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
          if (summary) summary.textContent = `${this.selectedContactIds.length} of ${this.allContacts.length} Selected`;
        });
      });
    };

    if (searchInput) {
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
    }

    const btnSelectAll = root.querySelector('#btnSelectAllContacts');
    if (btnSelectAll) {
      btnSelectAll.onclick = () => {
        this.selectedContactIds = this.allContacts.map(c => c.id);
        renderList(this.allContacts);
      };
    }

    const btnClearAll = root.querySelector('#btnClearAllContacts');
    if (btnClearAll) {
      btnClearAll.onclick = () => {
        this.selectedContactIds = [];
        renderList(this.allContacts);
      };
    }

    renderList(this.allContacts);
    modal?.classList.add('show');
  }

  openAppFunctionalSettingsModal(container, appId) {
    const root = this.getRoot(container);
    const app = this.coordinator.APP_LIST.find(a => a.id === appId);
    if (!app || !app.options || app.options.length === 0) return;

    const modal = root.querySelector('#appFunctionalSettingsModal');
    const titleEl = root.querySelector('#appFunctionalTitle');
    if (titleEl) titleEl.textContent = `${app.name} Functional Overrides`;
    const list = root.querySelector('#appFunctionalOptionsList');

    if (!this.functionalOverrides[appId]) {
      this.functionalOverrides[appId] = {};
    }

    list.innerHTML = app.options.map(opt => {
      const isEnabled = this.functionalOverrides[appId][opt.key] !== undefined
        ? Boolean(this.functionalOverrides[appId][opt.key])
        : Boolean(opt.default);

      return `
        <div class="functional-option-row" data-opt-key="${opt.key}" style="display:flex; justify-content:space-between; align-items:center; background: var(--wa-card-bg); padding:12px 14px; border-radius:10px; border:1px solid var(--wa-card-border); cursor:pointer;">
          <div style="flex:1; margin-right:12px;">
            <div style="font-weight:600; font-size:13px; margin-bottom:2px; color: var(--wa-text-primary);">${this.escape(opt.label)}</div>
            <div style="font-size:11.5px; color: var(--wa-text-muted);">${this.escape(opt.desc)}</div>
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
        sw.classList.toggle('active', nowActive);
        this.functionalOverrides[appId][key] = nowActive;
      });
    });

    modal?.classList.add('show');
  }

  async openWorkerHistoryModal(container, userId) {
    const root = this.getRoot(container);
    const modal = root.querySelector('#workerHistoryModal');
    if (!modal) return;

    let user = this.coordinator.users.find(u => u.id === userId) || {};
    const titleEl = root.querySelector('#workerHistoryModalTitle');
    const subtitleEl = root.querySelector('#workerHistoryModalSubtitle');
    const timelineEl = root.querySelector('#workerHistoryTimeline');

    if (titleEl) titleEl.textContent = `Lifecycle: ${user.full_name || user.google_email || user.username || 'Worker'}`;
    if (subtitleEl) subtitleEl.textContent = user.google_email || user.email || 'Audit Records and Lifecycle Timeline';
    if (timelineEl) timelineEl.innerHTML = '<div style="text-align:center; padding:24px; color:var(--wa-text-muted);">Loading lifecycle events...</div>';

    modal.classList.add('show');

    try {
      const res = await fetch(`/api/admin/users/${userId}/history`);
      const data = res.ok ? await res.json() : { user: null, history: [], auditLogs: [] };
      if (data.user) {
        user = { ...user, ...data.user };
      }
      const historyList = data.history || [];
      const auditLogs = data.auditLogs || [];

      const formatDate = (d) => {
        if (!d) return 'N/A';
        try {
          return new Date(d).toLocaleString(undefined, { 
            month: 'short', day: 'numeric', year: 'numeric', 
            hour: '2-digit', minute: '2-digit' 
          });
        } catch (_) {
          return d;
        }
      };

      const overviewHtml = `
        <div class="lifecycle-overview-card">
          <div class="lifecycle-overview-header">
            <div>
              <div class="lifecycle-user-name">${this.escape(user.full_name || user.google_email || user.username || 'Worker')}</div>
              <div class="lifecycle-user-email">${this.escape(user.google_email || user.email || '')}</div>
            </div>
            <span class="worker-status ${user.status || 'deleted'}">${this.escape(user.status || 'deleted')}</span>
          </div>

          <div class="lifecycle-meta-grid">
            <div>
              <span class="lifecycle-meta-label">Joined / Registered</span>
              <span class="lifecycle-meta-value">${formatDate(user.created_at || (historyList[0]?.joined_at))}</span>
            </div>
            <div>
              <span class="lifecycle-meta-label">Approval Date</span>
              <span class="lifecycle-meta-value">${user.approved_at ? formatDate(user.approved_at) : (user.status === 'pending' ? 'Pending Approval' : 'N/A')}</span>
            </div>
            ${user.deletion_requested_at ? `
              <div style="grid-column: 1/-1;">
                <span class="lifecycle-meta-label">Deletion Requested</span>
                <span class="lifecycle-meta-value" style="color: var(--wa-warning);">${formatDate(user.deletion_requested_at)}</span>
              </div>
            ` : ''}
            ${user.deleted_at || user.status === 'deleted' ? `
              <div>
                <span class="lifecycle-meta-label">Deleted / Denied Date</span>
                <span class="lifecycle-meta-value" style="color: var(--wa-danger);">${formatDate(user.deleted_at || historyList.find(h => h.deleted_at)?.deleted_at)}</span>
              </div>
              <div style="grid-column: 1/-1;">
                <span class="lifecycle-meta-label">Deletion Reason</span>
                <span class="lifecycle-meta-value">${this.escape(user.deletion_reason || historyList.find(h => h.deletion_reason)?.deletion_reason || 'Worker account deleted by owner')}</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;

      const timelineEvents = [];

      if (user.created_at || historyList.find(h => h.joined_at)) {
        timelineEvents.push({
          time: user.created_at || historyList.find(h => h.joined_at)?.joined_at,
          title: 'Account Registered & Access Requested',
          desc: 'Worker registered credentials and submitted access application.',
          icon: '📥'
        });
      }

      if (user.approved_at || historyList.find(h => h.approved_at)) {
        timelineEvents.push({
          time: user.approved_at || historyList.find(h => h.approved_at)?.approved_at,
          title: 'Access Request Approved',
          desc: 'Owner approved access request and assigned app permissions.',
          icon: '✅'
        });
      }

      if (user.deletion_requested_at) {
        timelineEvents.push({
          time: user.deletion_requested_at,
          title: 'Worker Requested Deletion',
          desc: `Worker submitted account deletion request: "${user.deletion_reason || 'Not specified'}"`,
          icon: '⚠️'
        });
      }

      historyList.forEach(h => {
        if (h.status === 'deleted' || h.deleted_at) {
          timelineEvents.push({
            time: h.deleted_at || h.created_at,
            title: 'Account Deleted & Archived',
            desc: h.deletion_reason || user.deletion_reason || 'Worker account deleted by owner',
            icon: '🗑️'
          });
        }
      });

      timelineEvents.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));

      const timelineHtml = `
        <div class="lifecycle-section-title">Lifecycle Timeline</div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${timelineEvents.map(ev => `
            <div class="lifecycle-event-card">
              <div style="font-size: 18px; line-height: 1;">${ev.icon}</div>
              <div style="flex: 1; min-width: 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                  <span class="lifecycle-event-title">${this.escape(ev.title)}</span>
                  <span class="lifecycle-event-time">${formatDate(ev.time)}</span>
                </div>
                <div class="lifecycle-event-desc">${this.escape(ev.desc)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      let auditHtml = '';
      if (auditLogs.length > 0) {
        auditHtml = `
          <div class="lifecycle-section-title" style="margin-top: 16px;">Recent Audit Activity (${auditLogs.length})</div>
          <div style="display: flex; flex-direction: column; gap: 6px; max-height: 150px; overflow-y: auto;">
            ${auditLogs.map(log => `
              <div class="lifecycle-audit-item">
                <span style="color: var(--wa-accent); font-weight: 500;">${this.escape(log.action)} (${this.escape(log.module || 'app')})</span>
                <span style="color: var(--wa-text-muted);">${formatDate(log.created_at)}</span>
              </div>
            `).join('')}
          </div>
        `;
      }

      timelineEl.innerHTML = overviewHtml + timelineHtml + auditHtml;
    } catch (err) {
      console.error('Error fetching worker history:', err);
      timelineEl.innerHTML = `<div style="text-align:center; padding:24px; color:var(--wa-danger);">Failed to load lifecycle history: ${this.escape(err.message)}</div>`;
    }
  }

  escape(value) {
    return String(value || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }
}
