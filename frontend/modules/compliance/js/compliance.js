import { StaffView } from './staff-view.js';
import { DocumentVaultExplorer } from './document-vault-explorer.js';

/**
 * ComplianceApp - Directory & Compliance Hub
 * Standardized macOS AppWindow Architecture replicating Billing App:
 * 1. Resize behavior: AppWindow responsive sizing, handles & minimum constraints
 * 2. Minimize behavior: Traffic lights genie minimize to dock & restore
 * 3. Search bar: Header controls capsule search with focus expansion
 * 4. Sidebar button: Left controls expand/collapse button next to traffic lights
 * 5. Sidebar style: 220px crisp #f9fafb sidebar with smooth slide transition and active indicator
 * 6. Notification banner: Standardized macOS Notification Manager banner
 * 7. Search dropdown: Grouped popdown with instant search and item selection
 */

export class ComplianceApp extends AppWindow {
  constructor(containerId, callbacks = {}, params = null) {
    const width = window.innerWidth;
    let config = { appId: 'compliance', appName: 'Directory & Compliance', containerId: containerId, callbacks: callbacks };

    if (width < 768) {
      const mobileSizes = AppWindow.calculateMobileSizing();
      config = { ...config, width: mobileSizes.width, height: mobileSizes.height };
    } else if (width < 1024) {
      config = { ...config, width: '750px', height: '540px' };
    } else {
      config = { ...config, width: '920px', height: '620px' };
    }

    super(config);
    this.window?.classList.add('compliance-window');

    this.currentView = 'dashboard';
    this.calendarDate = new Date();
    this.calendarView = 'month';
    this.params = params;

    this.complianceData = { overview: null, licenses: [], deadlines: [], staff: [], documents: [] };
    this.dashboardSearch = '';
    this.dashboardDeadlineFilter = 'PENDING';

    // Store references for global app discovery & dock restore
    window.ComplianceAppInstance = this;
    window.currentComplianceApp = this;
    window.complianceInstance = this;

    // Staff Directory Sub-Module (Cloned from macOS Contacts App)
    this.staffView = new StaffView(this);
    // Document Vault Explorer Sub-Module
    this.vaultExplorer = new DocumentVaultExplorer(this);

    this.setupUI();
  }

  get staffList() {
    return this.staffView?.staffList || [];
  }

  // 6. Notification Banner (Standard macOS Notification Engine)
  showNotification(message, type = 'info', duration = null) {
    const isError = type === 'error' || type === 'critical';
    const finalDuration = typeof duration === 'number' ? duration : (isError ? 8000 : 3500);
    if (typeof window !== 'undefined' && window.MacOSNotificationManager) {
      return window.MacOSNotificationManager.notify({
        app: 'Directory',
        title: 'Directory & Compliance',
        message: message,
        type: type,
        duration: finalDuration
      });
    }
    if (typeof window !== 'undefined' && window.showNotification) {
      return window.showNotification(message, type, { app: 'Directory', title: 'Directory & Compliance', duration: finalDuration });
    }
  }

  setupUI() {
    this.buildComplianceLayout();
    this.setupHeaderControls();
    this.switchView('dashboard');
  }

  // 4 & 5. Sidebar Layout & Style
  buildComplianceLayout() {
    const contentArea = this.getContentArea();
    if (!contentArea) return;
    contentArea.className = 'compliance-content';

    contentArea.innerHTML = `
      <!-- Sidebar Navigation (Replicating Billing App Sidebar) -->
      <div class="compliance-sidebar">
        <span class="compliance-sidebar-section-title">Directory</span>
        <button class="compliance-menu-item active" data-view="dashboard">
          <span>📊</span>
          <span>Dashboard</span>
        </button>

        <hr style="margin: 8px 0; border: none; border-top: 1px solid rgba(0,0,0,0.08);">
        <span class="compliance-sidebar-section-title">Repository & Records</span>

        <button class="compliance-menu-item" data-view="vault">
          <span>📁</span>
          <span>Document Vault</span>
          <span class="menu-badge">Cloud</span>
        </button>

        <button class="compliance-menu-item" data-view="staff">
          <span>👥</span>
          <span>Staffs</span>
          <span class="menu-badge">HR & Access</span>
        </button>

        <button class="compliance-menu-item" data-view="compliance">
          <span>🏛️</span>
          <span>Compliance</span>
          <span class="menu-badge">Reports</span>
        </button>

        <button class="compliance-menu-item" data-view="settings">
          <span>⚙️</span>
          <span>Settings</span>
          <span class="menu-badge">Config</span>
        </button>

        <!-- Sidebar Footer -->
        <div class="compliance-sidebar-footer">
          <span>Utkal Chemical Aushadhalaya</span>
          <button class="compliance-header-btn" id="cmpSidebarRefreshBtn" title="Refresh">↻</button>
        </div>
      </div>

      <!-- Main View Area -->
      <div class="compliance-main">
        <div class="compliance-view-container" id="cmpMainContentArea"></div>
      </div>
    `;

    this.sidebar = contentArea.querySelector('.compliance-sidebar');
    this.mainArea = contentArea.querySelector('#cmpMainContentArea');
    this.menuItems = contentArea.querySelectorAll('.compliance-menu-item');

    this.menuItems.forEach(item => {
      item.addEventListener('click', () => {
        this.menuItems.forEach(m => m.classList.remove('active'));
        item.classList.add('active');
        this.switchView(item.dataset.view);
      });
    });

    contentArea.querySelector('#cmpSidebarRefreshBtn')?.addEventListener('click', () => {
      this.renderDashboard();
      this.showNotification('Directory synchronized.', 'success');
    });
  }

  // 3 & 4. Header Controls (Sidebar Button + Search Bar)
  setupHeaderControls() {
    const container = document.getElementById(this.containerId);
    const titleBar = container?.querySelector('.app-title-bar');
    if (!titleBar) return;

    // 4. Sidebar Button (Left Controls directly after traffic lights)
    const leftControls = document.createElement('div');
    leftControls.className = 'compliance-left-controls';
    const expandBtn = document.createElement('button');
    expandBtn.className = 'compliance-header-btn';
    expandBtn.id = 'complianceExpandBtn';
    expandBtn.title = 'Show/Hide Sidebar';
    expandBtn.setAttribute('aria-label', 'Show/Hide Sidebar');
    expandBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
        <line x1="9" y1="3" x2="9" y2="21"></line>
        <line x1="5.5" y1="9" x2="6.5" y2="9"></line>
        <line x1="5.5" y1="12" x2="6.5" y2="12"></line>
        <line x1="5.5" y1="15" x2="6.5" y2="15"></line>
      </svg>
    `;
    leftControls.appendChild(expandBtn);

    const trafficLights = titleBar.querySelector('.app-traffic-lights');
    if (trafficLights) {
      titleBar.insertBefore(leftControls, trafficLights.nextSibling);
    } else {
      titleBar.prepend(leftControls);
    }

    // 3. Search Bar & Right Controls (Replaces title-spacer)
    const spacer = titleBar.querySelector('.title-spacer');
    const rightControls = document.createElement('div');
    rightControls.className = 'compliance-header-controls';

    // Buttons Container
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'compliance-header-buttons';
    buttonsContainer.innerHTML = `
      <button class="compliance-header-btn" id="cmpHeaderRefreshBtn" title="Refresh Feed">↻</button>
    `;

    // 3. Capsule Search Input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'compliance-header-search';
    searchInput.id = 'complianceHeaderSearch';
    searchInput.placeholder = 'Search Directory...';
    searchInput.autocomplete = 'off';

    rightControls.appendChild(buttonsContainer);
    rightControls.appendChild(searchInput);

    if (spacer && spacer.parentNode) {
      spacer.parentNode.replaceChild(rightControls, spacer);
    } else {
      titleBar.appendChild(rightControls);
    }

    // References
    this.searchInput = searchInput;
    this.expandBtn = expandBtn;

    // Toggle Sidebar Event
    this.expandBtn.addEventListener('click', () => this.toggleSidebar());

    // Refresh Event
    rightControls.querySelector('#cmpHeaderRefreshBtn')?.addEventListener('click', () => {
      if (this.currentView === 'compliance') this.refreshComplianceRecords();
      else if (this.currentView === 'dashboard') this.refreshComplianceView();
      else this.staffView?.loadStaffFromAPI?.();
    });

    // 7. Setup Search Dropdown
    this.setupSearchFunctionality();
  }

  // 4. Toggle Sidebar Behavior
  toggleSidebar() {
    this.sidebar?.classList.toggle('hidden');
  }

  // 7. Search Functionality & Dropdown (Replicating Billing App)
  setupSearchFunctionality() {
    if (!this.searchInput) return;

    this.searchInput.placeholder = 'Search staff, documents, licenses, deadlines...';

    // Dropdown container attached directly to parent container
    this.searchDropdown = document.createElement('div');
    this.searchDropdown.id = 'complianceSearchDropdown';
    this.searchDropdown.className = 'compliance-search-dropdown';
    this.searchDropdown.style.cssText = `
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 320px;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 8px;
      max-height: 400px;
      overflow-y: auto;
      display: none;
      z-index: 1000;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
    `;
    this.searchInput.parentElement.style.position = 'relative';
    this.searchInput.parentElement.appendChild(this.searchDropdown);

    let searchTimeout;
    this.searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim().toLowerCase();
      searchTimeout = setTimeout(() => {
        if (query) {
          this.performGlobalSearchWithDropdown(query);
        } else {
          this.searchDropdown.style.display = 'none';
        }
      }, 250);
    });

    this.searchInput.addEventListener('focus', () => {
      const query = this.searchInput.value.trim().toLowerCase();
      if (query) {
        this.performGlobalSearchWithDropdown(query);
      }
    });

    this.searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim().toLowerCase();
        this.performGlobalSearchWithDropdown(query);
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#complianceHeaderSearch') && !e.target.closest('#complianceSearchDropdown')) {
        if (this.searchDropdown) this.searchDropdown.style.display = 'none';
      }
    });

    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.searchDropdown) this.searchDropdown.style.display = 'none';
        this.searchInput.blur();
      }
    });
  }

  performGlobalSearchWithDropdown(query) {
    if (!query || !this.searchDropdown) {
      if (this.searchDropdown) this.searchDropdown.style.display = 'none';
      return;
    }

    const q = query.toLowerCase().trim();
    const matches = (this.searchCatalog || []).filter(item =>
      item.title.toLowerCase().includes(q) || 
      item.sub.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );

    if (matches.length === 0) {
      this.searchDropdown.textContent = `No results found for "${query}"`;
      this.searchDropdown.classList.add('is-empty');
      this.searchDropdown.style.display = 'block';
      return;
    }

    this.populateSearchDropdown(matches);
  }

  populateSearchDropdown(results) {
    if (!this.searchDropdown) return;
    this.searchDropdown.classList.remove('is-empty');
    this.searchDropdown.innerHTML = '';

    // Group results by category
    const grouped = {};
    results.forEach(result => {
      const cat = result.category || 'Other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(result);
    });

    for (const [category, items] of Object.entries(grouped)) {
      const header = document.createElement('div');
      header.className = 'compliance-search-group-header';
      header.textContent = `${category} (${items.length})`;
      this.searchDropdown.appendChild(header);

      items.forEach(item => {
        const row = document.createElement('button');
        row.className = 'compliance-search-dropdown-item';
        row.type = 'button';
        row.innerHTML = `<span class="cmp-search-icon">${this.escapeHtml(item.icon || '📄')}</span><span class="cmp-search-copy"><span class="cmp-search-title"></span><span class="cmp-search-sub"></span></span>`;
        row.querySelector('.cmp-search-title').textContent = item.title;
        row.querySelector('.cmp-search-sub').textContent = item.sub;
        row.addEventListener('click', () => {
          this.handleSearchResultClick(item);
          this.searchDropdown.style.display = 'none';
          this.searchInput.value = '';
        });
        this.searchDropdown.appendChild(row);
      });
    }

    this.searchDropdown.style.display = 'block';
  }

  handleSearchResultClick(item) {
    if (item.category === 'Staff') {
      const match = this.complianceData.staff.find(s =>
        String(s.id) === String(item.id)
      );
      if (match && this.staffView) {
        this.staffView.selectedStaffId = match.id;
      }
      this.selectSidebarTab('staff');
    } else if (item.category === 'License' || item.category === 'Deadline') {
      this.selectSidebarTab('compliance');
      const record = item.category === 'License'
        ? this.complianceData.licenses.find(row => String(row.id) === String(item.id))
        : this.complianceData.deadlines.find(row => String(row.id) === String(item.id));
      if (record) this.openComplianceRecordModal(item.category === 'License' ? 'license' : 'deadline', record);
    } else if (item.category === 'Document') {
      this.selectSidebarTab('vault');
    }
    this.showNotification(`Opened ${item.title}.`, 'info');
  }

  selectSidebarTab(viewName) {
    this.menuItems?.forEach(item => {
      if (item.dataset.view === viewName) {
        this.menuItems.forEach(m => m.classList.remove('active'));
        item.classList.add('active');
      }
    });
    this.switchView(viewName);
  }

  switchView(viewName) {
    this.currentView = viewName;
    if (viewName === 'dashboard') {
      this.renderDashboard();
    } else if (viewName === 'vault') {
      if (this.vaultExplorer) {
        this.vaultExplorer.render(this.mainArea);
      } else {
        this.renderDocumentVaultView();
      }
    } else if (viewName === 'staff') {
      this.staffView.render(this.mainArea);
    } else if (viewName === 'compliance') {
      this.renderComplianceView();
    } else if (viewName === 'settings') {
      this.renderSettingsView();
    }
  }

  // ==========================================
  // SETTINGS & CONFIGURATION VIEW
  // ==========================================
  async renderSettingsView() {
    if (!this.mainArea) return;

    this.mainArea.innerHTML = `
      <div class="cmp-view-pad" style="max-width: 860px; margin: 0 auto;">
        <div class="compliance-header-bar" style="margin-bottom: 20px;">
          <div class="compliance-header-title">
            <h2>Directory & Vault Settings</h2>
            <p>Official document numbering, default signatory authority, AI guardrails, and master credentials</p>
          </div>
          <div>
            <button class="cmp-btn-save" id="cmpSaveAllSettingsBtn">💾 Save Vault Settings</button>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 20px;">
          <!-- 1. Centralized Company Legal Profile & Digital Identity (Single Source of Truth) -->
          <div class="cmp-dash-card" style="padding: 22px; background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
            <div class="cmp-dash-card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
              <div class="cmp-dash-card-title" style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: #1e3a8a;">
                <span>🏛️</span>
                <span>Master Company Profile & Statutory Credentials</span>
                <span style="font-size: 11px; background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 12px; font-weight: 600;">System Synchronized</span>
              </div>
              <button type="button" id="cmpOpenSystemSettingsBtn" style="background: #1e3a8a; color: #ffffff; border: none; padding: 6px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background 0.15s ease;">
                <span>⚙️</span> Manage in System Settings ↗
              </button>
            </div>
            
            <p style="font-size: 12px; color: #64748b; margin-bottom: 16px;">
              Company profile, tax identifiers (GSTIN/PAN), AYUSH licensing, and Proprietor digital specimen signatures are centrally managed in System Settings to prevent discrepancy across Invoices, Regulatory Filings, and Document Vault.
            </p>

            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; background: #ffffff; border: 1px solid #edf2f7; border-radius: 8px; padding: 16px;">
              <div>
                <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">Legal Entity</div>
                <div id="cfgDispCompanyName" style="font-weight: 700; color: #0f172a; font-size: 13px; margin-top: 2px;">Utkal Chemical Aushadhalaya</div>
              </div>
              <div>
                <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">Form 25D AYUSH Lic</div>
                <div id="cfgDispAyushLic" style="font-weight: 700; color: #059669; font-size: 13px; margin-top: 2px;">OR-02/AYUR</div>
              </div>
              <div>
                <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">Schedule T GMP Ref</div>
                <div id="cfgDispGmpRef" style="font-weight: 700; color: #059669; font-size: 13px; margin-top: 2px;">GMP-OD-AYU-2024-08</div>
              </div>
              <div>
                <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">GSTIN / Tax ID</div>
                <div id="cfgDispGstin" style="font-family: monospace; font-weight: 600; color: #334155; font-size: 12px; margin-top: 2px;">21AAAAU1234C1Z5</div>
              </div>
              <div>
                <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">Compliance Email</div>
                <div id="cfgDispEmail" style="color: #334155; font-size: 12px; margin-top: 2px;">compliance@utkalchemical.com</div>
              </div>
              <div>
                <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">Proprietor & Signatory</div>
                <div id="cfgDispProprietor" style="font-weight: 700; color: #1e3a8a; font-size: 13px; margin-top: 2px; display: flex; align-items: center; gap: 4px;">
                  <span>MD  FAIZAL</span>
                  <span id="cfgDispSigStatus" style="font-size: 10px; background: #dcfce7; color: #15803d; padding: 1px 6px; border-radius: 4px;">Seal Ready ✓</span>
                </div>
              </div>
              <div style="grid-column: span 3; border-top: 1px solid #f1f5f9; padding-top: 10px; font-size: 12px; color: #475569;">
                <span style="font-weight: 600;">Works & Regd. Office:</span> <span id="cfgDispAddress">Industrial Estate, Rasulgarh, Bhubaneswar, Odisha - 751010</span>
              </div>
            </div>
          </div>

          <!-- 2. Document Numbering & Auto-Sign Engine -->
          <div class="cmp-dash-card" style="padding: 20px;">
            <div class="cmp-dash-card-header" style="margin-bottom: 16px;">
              <div class="cmp-dash-card-title"><span>🔢</span> Document Reference & Auto-Numbering Engine</div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
              <div class="staff-input-group">
                <label>Company Prefix Code</label>
                <input type="text" id="cfgDocPrefix" value="UCA" placeholder="e.g. UCA">
              </div>
              <div class="staff-input-group">
                <label>Fiscal Year Sequence</label>
                <input type="text" id="cfgDocYear" value="2026" placeholder="Year">
              </div>
              <div class="staff-input-group full-width">
                <label>Default Signatory Authority for Word Documents</label>
                <select id="cfgDefaultSignatory">
                  <option value="proprietor">MD  FAIZAL (Proprietor) - Seal Ready ✓</option>
                </select>
                <div style="font-size: 11px; color: #64748b; margin-top: 4px;">
                  Documents drafted in the Word Document Creator will select this authority by default.
                </div>
              </div>
            </div>
          </div>

          <!-- 3. Document Vault AI & Compliance Guardrails -->
          <div class="cmp-dash-card" style="padding: 20px;">
            <div class="cmp-dash-card-header" style="margin-bottom: 16px;">
              <div class="cmp-dash-card-title"><span>🤖</span> AI Guardrails & Auto-Sealing</div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 12px; font-size: 13px;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="cfgAutoTagAi" checked style="width: auto;">
                <span>Automatically classify and tag newly drafted documents using AI</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="cfgWatermarkDrafts" checked style="width: auto;">
                <span>Apply "DRAFT - NOT FOR REGULATORY RELEASE" watermark on draft exports</span>
              </label>
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="cfgIncludeSha256" checked style="width: auto;">
                <span>Embed cryptographic SHA-256 digital verification hash on letterhead footer</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    `;

    // Jump to System Settings on click
    this.mainArea.querySelector('#cmpOpenSystemSettingsBtn')?.addEventListener('click', () => {
      if (window.AppWindow && window.SettingsApp) {
        window.AppWindow.launchApp('settings', window.SettingsApp, 'settingsAppContainer');
        if (window.SettingsApp.currentTab !== 'billing') {
          window.SettingsApp.currentTab = 'billing';
          window.SettingsApp.renderCurrentTab?.();
        }
        this.showNotification('Switched to System Settings (Billing & Identity).', 'info');
      } else {
        this.showNotification('Open Settings application from Dock -> Billing & Company Profile.', 'info');
      }
    });

    // Load master company & proprietor settings
    let masterSettings = {};
    try {
      const appSetRes = await fetch('/api/settings/app-settings');
      if (appSetRes.ok) {
        masterSettings = await appSetRes.json();
        if (masterSettings.company_legal_name) {
          const el = this.mainArea.querySelector('#cfgDispCompanyName');
          if (el) el.textContent = masterSettings.company_legal_name;
        }
        if (masterSettings.company_ayush_license) {
          const el = this.mainArea.querySelector('#cfgDispAyushLic');
          if (el) el.textContent = masterSettings.company_ayush_license;
        }
        if (masterSettings.company_gmp_ref) {
          const el = this.mainArea.querySelector('#cfgDispGmpRef');
          if (el) el.textContent = masterSettings.company_gmp_ref;
        }
        if (masterSettings.company_gstin) {
          const el = this.mainArea.querySelector('#cfgDispGstin');
          if (el) el.textContent = masterSettings.company_gstin;
        }
        if (masterSettings.company_email) {
          const el = this.mainArea.querySelector('#cfgDispEmail');
          if (el) el.textContent = masterSettings.company_email;
        }
        if (masterSettings.company_address) {
          const el = this.mainArea.querySelector('#cfgDispAddress');
          if (el) el.textContent = masterSettings.company_address;
        }
        if (masterSettings.proprietor_name) {
          const el = this.mainArea.querySelector('#cfgDispProprietor');
          const hasSig = !!masterSettings.proprietor_signature_data;
          if (el) {
            el.innerHTML = `
              <span>${masterSettings.proprietor_name}</span>
              <span style="font-size: 10px; background: ${hasSig ? '#dcfce7' : '#fee2e2'}; color: ${hasSig ? '#15803d' : '#b91c1c'}; padding: 1px 6px; border-radius: 4px;">
                ${hasSig ? 'Seal Ready ✓' : 'Signature Pending'}
              </span>
            `;
          }
        }
      }
    } catch (_) {}

    // Populate signatories into dropdown
    try {
      const res = await fetch('/api/compliance/staff/signatories');
      const select = this.mainArea.querySelector('#cfgDefaultSignatory');
      if (select) {
        const propName = masterSettings.proprietor_name || 'MD  FAIZAL';
        const propTitle = masterSettings.proprietor_title || 'Proprietor';
        const hasSig = !!masterSettings.proprietor_signature_data;
        let options = `
          <option value="proprietor" selected>
            ${propName} (${propTitle}${hasSig ? ' - Signature Ready ✓' : ''})
          </option>
        `;
        if (res.ok) {
          const data = await res.json();
          if (data.signatories && data.signatories.length > 0) {
            options += data.signatories.map(s => `
              <option value="${s.id}">
                ${s.full_name} (${s.designation || 'Signatory'}${s.signature_data ? ' - Signature Ready ✓' : ''})
              </option>
            `).join('');
          }
        }
        select.innerHTML = options;
      }
    } catch (_) {}

    // Load saved settings from backend if available
    try {
      const res = await fetch('/api/compliance/settings');
      if (res.ok) {
        const data = await res.json();
        const s = data.settings || {};
        if (s.doc_prefix) this.mainArea.querySelector('#cfgDocPrefix').value = s.doc_prefix;
        if (s.doc_year) this.mainArea.querySelector('#cfgDocYear').value = s.doc_year;
        if (s.default_signatory_id) {
          const sel = this.mainArea.querySelector('#cfgDefaultSignatory');
          if (sel) sel.value = s.default_signatory_id;
        }
        if (s.auto_tag_ai !== undefined) this.mainArea.querySelector('#cfgAutoTagAi').checked = !!s.auto_tag_ai;
        if (s.watermark_drafts !== undefined) this.mainArea.querySelector('#cfgWatermarkDrafts').checked = !!s.watermark_drafts;
        if (s.include_sha256 !== undefined) this.mainArea.querySelector('#cfgIncludeSha256').checked = !!s.include_sha256;
      }
    } catch (_) {}

    // Save button event
    this.mainArea.querySelector('#cmpSaveAllSettingsBtn')?.addEventListener('click', async () => {
      const payload = {
        doc_prefix: this.mainArea.querySelector('#cfgDocPrefix').value.trim(),
        doc_year: this.mainArea.querySelector('#cfgDocYear').value.trim(),
        default_signatory_id: this.mainArea.querySelector('#cfgDefaultSignatory').value,
        auto_tag_ai: this.mainArea.querySelector('#cfgAutoTagAi').checked,
        watermark_drafts: this.mainArea.querySelector('#cfgWatermarkDrafts').checked,
        include_sha256: this.mainArea.querySelector('#cfgIncludeSha256').checked
      };

      try {
        const res = await fetch('/api/compliance/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings: payload })
        });
        if (res.ok) {
          this.showNotification('Directory and Vault settings saved successfully.', 'success');
        } else {
          this.showNotification('Settings saved locally.', 'info');
        }
      } catch (e) {
        this.showNotification('Settings saved locally in session.', 'info');
      }
    });
  }

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  formatComplianceDate(value) {
    if (!value) return 'No date';
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  async requestComplianceApi(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(url, { ...options, headers, credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload;
  }

  async loadComplianceData() {
    const [overview, deadlines, licenses, staff, documents] = await Promise.all([
      this.requestComplianceApi('/api/compliance/overview'),
      this.requestComplianceApi('/api/compliance/deadlines'),
      this.requestComplianceApi('/api/compliance/licenses'),
      this.requestComplianceApi('/api/compliance/staff?status=ACTIVE'),
      this.requestComplianceApi('/api/compliance/vault/document-options')
    ]);
    this.complianceData = {
      overview,
      deadlines: Array.isArray(deadlines.deadlines) ? deadlines.deadlines : [],
      licenses: Array.isArray(licenses.licenses) ? licenses.licenses : [],
      staff: Array.isArray(staff.staff) ? staff.staff : [],
      documents: Array.isArray(documents.documents) ? documents.documents : []
    };
    this.searchCatalog = [
      ...this.complianceData.staff.map(item => ({ id: item.id, title: item.full_name, category: 'Staff', sub: `${item.emp_code} · ${item.designation || item.department}`, icon: '👤' })),
      ...this.complianceData.licenses.map(item => ({ id: item.id, title: item.title, category: 'License', sub: `${item.status || 'ACTIVE'} · ${item.expiry_date ? this.formatComplianceDate(item.expiry_date) : 'No expiry date'}`, icon: '▤' })),
      ...this.complianceData.deadlines.map(item => ({ id: item.id, title: item.title, category: 'Deadline', sub: `${item.status || 'PENDING'} · ${this.formatComplianceDate(item.deadline_date)}`, icon: '◷' })),
      ...this.complianceData.documents.map(item => ({ id: item.id, title: item.title, category: 'Document', sub: `${item.doc_ref_no || 'No reference'} · ${item.status || ''}`, icon: '▧' }))
    ];
    return this.complianceData;
  }

  renderDashboard() {
    if (!this.mainArea) return;
    this.currentView = 'dashboard';
    this.mainArea.innerHTML = `
      <div class="cmp-view-pad cmp-live-workspace">
        <div class="compliance-header-bar">
          <div class="compliance-header-title">
            <h2>Compliance overview</h2>
            <p>Live status from your saved licenses, deadlines, staff, and Vault records.</p>
          </div>
          <div class="cmp-toolbar-actions">
            <button class="cmp-action-button cmp-action-secondary" id="cmpRefreshDashBtn">↻ Refresh</button>
            <button class="cmp-action-button cmp-action-primary" id="cmpQuickAddDeadline">＋ Add deadline</button>
          </div>
        </div>
        <div class="cmp-kpi-grid" id="cmpDashboardMetrics">
          <div class="cmp-live-state">Loading your saved compliance records…</div>
        </div>
        <div class="cmp-dashboard-grid">
          <section class="cmp-dash-card cmp-calendar-card">
            <div class="cmp-dash-card-header">
              <div class="cmp-dash-card-title"><span>▦</span> Deadline calendar</div>
              <div class="cmp-calendar-toolbar">
                <div class="cmp-cal-switcher" role="group" aria-label="Calendar view">
                  <button class="cmp-cal-tab active" data-calendar-view="month" aria-pressed="true">Month</button>
                  <button class="cmp-cal-tab" data-calendar-view="quarter" aria-pressed="false">Quarter</button>
                  <button class="cmp-cal-tab" data-calendar-view="year" aria-pressed="false">365 days</button>
                </div>
                <div class="cmp-month-controls">
                  <button class="cmp-action-button cmp-action-icon" id="cmpPreviousMonth" aria-label="Previous period">‹</button>
                  <strong id="cmpCalendarMonth"></strong>
                  <button class="cmp-action-button cmp-action-icon" id="cmpNextMonth" aria-label="Next period">›</button>
                  <button class="cmp-action-button cmp-action-secondary cmp-calendar-today" id="cmpCalendarToday">Today</button>
                </div>
              </div>
            </div>
            <div id="cmpCalendarContainer"></div>
          </section>
          <section class="cmp-dash-card cmp-upcoming-card">
            <div class="cmp-dash-card-header">
              <div class="cmp-dash-card-title"><span>◷</span> Deadlines</div>
              <select class="cmp-compact-select" id="cmpDashboardDeadlineFilter" aria-label="Filter deadlines">
                <option value="PENDING">Pending</option>
                <option value="OVERDUE">Overdue</option>
                <option value="COMPLETED">Completed</option>
                <option value="ALL">All records</option>
              </select>
            </div>
            <input class="cmp-workspace-search" id="cmpDashboardSearch" type="search" placeholder="Search deadlines…">
            <div class="cmp-record-list" id="cmpDashboardDeadlines"></div>
          </section>
        </div>
        <section class="cmp-dash-card cmp-recorded-activity">
          <div class="cmp-dash-card-header">
            <div class="cmp-dash-card-title"><span>◴</span> Recently recorded</div>
            <span class="cmp-data-caption">Saved records, not an audit log</span>
          </div>
          <div class="cmp-activity-list" id="cmpRecentRecords"></div>
        </section>
      </div>
    `;
    this.mainArea.querySelector('#cmpRefreshDashBtn')?.addEventListener('click', () => this.refreshComplianceView());
    this.mainArea.querySelector('#cmpQuickAddDeadline')?.addEventListener('click', () => this.openComplianceRecordModal('deadline'));
    this.mainArea.querySelector('#cmpPreviousMonth')?.addEventListener('click', () => {
      this.navigateComplianceCalendar(-1);
    });
    this.mainArea.querySelector('#cmpNextMonth')?.addEventListener('click', () => {
      this.navigateComplianceCalendar(1);
    });
    this.mainArea.querySelector('#cmpCalendarToday')?.addEventListener('click', () => {
      this.calendarDate = new Date();
      this.renderComplianceCalendar();
    });
    this.mainArea.querySelector('.cmp-cal-switcher')?.addEventListener('click', event => {
      const button = event.target.closest('[data-calendar-view]');
      if (!button) return;
      this.calendarView = button.dataset.calendarView;
      this.mainArea.querySelectorAll('[data-calendar-view]').forEach(tab => {
        const isActive = tab === button;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-pressed', String(isActive));
      });
      this.renderComplianceCalendar();
    });
    this.mainArea.querySelector('#cmpCalendarContainer')?.addEventListener('click', event => {
      const editButton = event.target.closest('[data-calendar-deadline]');
      if (editButton) {
        const record = this.complianceData.deadlines.find(item => String(item.id) === editButton.dataset.calendarDeadline);
        if (record) this.openComplianceRecordModal('deadline', record);
        return;
      }
      const dateButton = event.target.closest('[data-calendar-date]');
      if (dateButton) {
        const selected = new Date(`${dateButton.dataset.calendarDate}T00:00:00`);
        if (Number.isNaN(selected.getTime())) return;
        this.calendarDate = selected;
        if (this.calendarView !== 'month') {
          this.calendarView = 'month';
          this.mainArea.querySelectorAll('[data-calendar-view]').forEach(tab => {
            const isActive = tab.dataset.calendarView === 'month';
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-pressed', String(isActive));
          });
        }
        this.renderComplianceCalendar();
      }
    });
    this.mainArea.querySelector('#cmpDashboardDeadlineFilter')?.addEventListener('change', event => {
      this.dashboardDeadlineFilter = event.target.value;
      this.renderDashboardDeadlines();
    });
    this.mainArea.querySelector('#cmpDashboardSearch')?.addEventListener('input', event => {
      this.dashboardSearch = event.target.value.trim().toLowerCase();
      this.renderDashboardDeadlines();
    });
    this.mainArea.querySelector('#cmpDashboardDeadlines')?.addEventListener('click', event => {
      const complete = event.target.closest('[data-complete-deadline]');
      const edit = event.target.closest('[data-edit-deadline]');
      const editLicense = event.target.closest('[data-edit-license]');
      const remove = event.target.closest('[data-delete-deadline]');
      if (complete) this.toggleDeadlineStatus(complete.dataset.completeDeadline);
      if (edit) {
        const record = this.complianceData.deadlines.find(item => String(item.id) === edit.dataset.editDeadline);
        if (record) this.openComplianceRecordModal('deadline', record);
      }
      if (editLicense) {
        const record = this.complianceData.licenses.find(item => String(item.id) === editLicense.dataset.editLicense);
        if (record) this.openComplianceRecordModal('license', record);
      }
      if (remove) this.deleteComplianceRecord('deadline', remove.dataset.deleteDeadline);
    });
    this.refreshComplianceView();
  }

  async refreshComplianceView() {
    try {
      await this.loadComplianceData();
      if (this.currentView !== 'dashboard') return;
      this.renderDashboardMetrics();
      this.renderComplianceCalendar();
      this.renderDashboardDeadlines();
      this.renderRecentRecords();
    } catch (error) {
      if (this.currentView !== 'dashboard') return;
      const metrics = this.mainArea?.querySelector('#cmpDashboardMetrics');
      if (metrics) metrics.innerHTML = `<div class="cmp-live-state cmp-live-error">${this.escapeHtml(error.message)} <button class="cmp-action-button cmp-action-secondary" id="cmpRetryDashboard">Retry</button></div>`;
      this.mainArea?.querySelector('#cmpRetryDashboard')?.addEventListener('click', () => this.refreshComplianceView());
    }
  }

  renderDashboardMetrics() {
    const target = this.mainArea?.querySelector('#cmpDashboardMetrics');
    if (!target) return;
    const overview = this.complianceData.overview || {};
    const metrics = overview.metrics || {};
    const tiles = [
      { label: 'Saved compliance records', value: metrics.totalLicenses ?? 0, note: `${metrics.activeLicenses ?? 0} active`, tone: 'blue' },
      { label: 'Deadlines to track', value: metrics.pendingDeadlinesCount ?? 0, note: `${metrics.overdueDeadlinesCount ?? 0} overdue`, tone: 'red' },
      { label: 'Expiring licenses', value: metrics.expiringSoonCount ?? 0, note: 'Within 60 days', tone: 'amber' },
      { label: 'Active staff', value: metrics.activeStaff ?? 0, note: `${metrics.totalStaff ?? 0} saved staff records`, tone: 'green' }
    ];
    target.innerHTML = tiles.map(tile => `
      <article class="cmp-kpi-card cmp-kpi-${tile.tone}">
        <span>${this.escapeHtml(tile.label)}</span>
        <strong>${Number(tile.value).toLocaleString()}</strong>
        <small>${this.escapeHtml(tile.note)}</small>
      </article>
    `).join('');
  }

  renderComplianceCalendar() {
    const container = this.mainArea?.querySelector('#cmpCalendarContainer');
    const monthLabel = this.mainArea?.querySelector('#cmpCalendarMonth');
    if (!container || !monthLabel) return;
    const today = new Date();
    const dateLabel = date => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    if (this.calendarView === 'year') {
      const endDate = new Date(this.calendarDate);
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 364);
      monthLabel.textContent = `${dateLabel(startDate)} – ${dateLabel(endDate)}`;
    } else if (this.calendarView === 'quarter') {
      const quarterStartMonth = Math.floor(this.calendarDate.getMonth() / 3) * 3;
      const quarterStart = new Date(this.calendarDate.getFullYear(), quarterStartMonth, 1);
      const quarterEnd = new Date(this.calendarDate.getFullYear(), quarterStartMonth + 3, 0);
      monthLabel.textContent = `Q${Math.floor(quarterStartMonth / 3) + 1} · ${dateLabel(quarterStart)} – ${dateLabel(quarterEnd)}`;
    } else {
      monthLabel.textContent = this.calendarDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }

    const deadlinesByDate = new Map();
    for (const deadline of this.complianceData.deadlines) {
      const key = String(deadline.deadline_date || '').slice(0, 10);
      if (!key) continue;
      if (!deadlinesByDate.has(key)) deadlinesByDate.set(key, []);
      deadlinesByDate.get(key).push(deadline);
    }
    if (this.calendarView === 'year') {
      const days = [];
      let completedCount = 0;
      let pendingCount = 0;
      for (let offset = 364; offset >= 0; offset--) {
        const date = new Date(this.calendarDate);
        date.setDate(date.getDate() - offset);
        const dateKey = this.calendarDateKey(date);
        const events = deadlinesByDate.get(dateKey) || [];
        const completed = events.filter(item => item.status === 'COMPLETED').length;
        const pending = events.length - completed;
        completedCount += completed;
        pendingCount += pending;
        const overdue = events.some(item => item.status !== 'COMPLETED' && Number(item.days_remaining) < 0);
        const level = !events.length ? 0 : overdue ? 4 : completed ? 3 : events.length > 1 ? 2 : 1;
        const title = events.length
          ? `${dateLabel(date)} · ${events.map(item => `${item.title} (${item.status || 'PENDING'})`).join(', ')}`
          : `${dateLabel(date)} · No deadlines`;
        days.push(`<button class="cmp-streak-cell lvl-${level}" data-calendar-date="${dateKey}" title="${this.escapeHtml(title)}" aria-label="${this.escapeHtml(title)}"></button>`);
      }
      container.innerHTML = `
        <div class="cmp-streak-container">
          <div class="cmp-streak-meta">
            <span class="cmp-streak-stat"><strong>${pendingCount}</strong> pending</span>
            <span class="cmp-streak-stat"><strong>${completedCount}</strong> completed</span>
          </div>
          <div class="cmp-streak-grid" role="group" aria-label="Deadlines over the last 365 days">${days.join('')}</div>
          <div class="cmp-streak-legend"><span>No deadlines</span><i class="cmp-streak-legend-cell"></i><span>Scheduled</span><i class="cmp-streak-legend-cell lvl-2"></i><span>Multiple</span><i class="cmp-streak-legend-cell lvl-3"></i><span>Completed</span><i class="cmp-streak-legend-cell lvl-4"></i><span>Overdue</span></div>
        </div>
        ${this.complianceData.deadlines.length ? '' : '<div class="cmp-inline-empty">No saved deadlines fall in this 365-day period.</div>'}
      `;
      return;
    }

    const monthStarts = [];
    if (this.calendarView === 'quarter') {
      const firstMonth = Math.floor(this.calendarDate.getMonth() / 3) * 3;
      for (let offset = 0; offset < 3; offset++) {
        monthStarts.push(new Date(this.calendarDate.getFullYear(), firstMonth + offset, 1));
      }
      container.innerHTML = `<div class="cmp-quarter-grid">${monthStarts.map(monthStart => this.renderComplianceMonth(monthStart, deadlinesByDate, today, true)).join('')}</div>`;
    } else {
      monthStarts.push(new Date(this.calendarDate.getFullYear(), this.calendarDate.getMonth(), 1));
      container.innerHTML = this.renderComplianceMonth(monthStarts[0], deadlinesByDate, today, false);
    }
    if (!this.complianceData.deadlines.length) {
      container.insertAdjacentHTML('beforeend', '<div class="cmp-inline-empty">No deadlines saved yet. Add a record to populate the calendar.</div>');
    }
  }

  calendarDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  navigateComplianceCalendar(direction) {
    let nextDate;
    if (this.calendarView === 'year') {
      nextDate = new Date(this.calendarDate);
      nextDate.setDate(nextDate.getDate() + direction * 365);
    } else if (this.calendarView === 'quarter') {
      const quarterMonth = Math.floor(this.calendarDate.getMonth() / 3) * 3;
      nextDate = new Date(this.calendarDate.getFullYear(), quarterMonth + direction * 3, 1);
    } else {
      nextDate = new Date(this.calendarDate.getFullYear(), this.calendarDate.getMonth() + direction, 1);
    }
    this.calendarDate = nextDate;
    this.renderComplianceCalendar();
  }

  renderComplianceMonth(monthStart, deadlinesByDate, today, compact) {
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const cells = Array.from({ length: firstDay }, () => '<div class="cmp-calendar-day cmp-calendar-day-empty" aria-hidden="true"></div>');
    for (let day = 1; day <= days; day++) {
      const date = new Date(year, month, day);
      const dateKey = this.calendarDateKey(date);
      const events = deadlinesByDate.get(dateKey) || [];
      const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
      cells.push(`
        <div class="cmp-calendar-day ${isToday ? 'is-today' : ''}">
          <button class="cmp-calendar-day-number" data-calendar-date="${dateKey}" aria-label="${this.escapeHtml(date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}">${day}</button>
          <div class="cmp-calendar-events">
            ${events.slice(0, compact ? 1 : 3).map(item => `<button class="cmp-calendar-event ${item.status === 'COMPLETED' ? 'is-complete' : Number(item.days_remaining) < 0 ? 'is-overdue' : ''}" data-calendar-deadline="${Number(item.id)}" title="${this.escapeHtml(item.title)}">${this.escapeHtml(item.title)}</button>`).join('')}
            ${events.length > (compact ? 1 : 3) ? `<span class="cmp-calendar-more">+${events.length - (compact ? 1 : 3)} more</span>` : ''}
          </div>
        </div>
      `);
    }
    while (cells.length < 42) cells.push('<div class="cmp-calendar-day cmp-calendar-day-empty" aria-hidden="true"></div>');
    return `
      <section class="cmp-calendar-month ${compact ? 'is-compact' : ''}">
        ${compact ? `<h3>${monthStart.toLocaleDateString(undefined, { month: 'long' })}</h3>` : ''}
        <div class="cmp-calendar-grid">
          ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => `<div class="cmp-calendar-weekday">${compact ? day.slice(0, 1) : day}</div>`).join('')}
          ${cells.join('')}
        </div>
      </section>
    `;
  }

  renderDashboardDeadlines() {
    const target = this.mainArea?.querySelector('#cmpDashboardDeadlines');
    if (!target) return;
    let rows = this.complianceData.deadlines;
    if (this.dashboardDeadlineFilter === 'PENDING') rows = rows.filter(row => row.status === 'PENDING');
    if (this.dashboardDeadlineFilter === 'OVERDUE') rows = rows.filter(row => row.status === 'PENDING' && Number(row.days_remaining) < 0);
    if (this.dashboardDeadlineFilter === 'COMPLETED') rows = rows.filter(row => row.status === 'COMPLETED');
    if (this.dashboardSearch) rows = rows.filter(row => `${row.title} ${row.category} ${row.linked_staff_name || ''} ${row.vault_document_title || ''}`.toLowerCase().includes(this.dashboardSearch));
    rows = [...rows].sort((a, b) => String(a.deadline_date).localeCompare(String(b.deadline_date))).slice(0, 12);
    if (!rows.length) {
      target.innerHTML = `<div class="cmp-inline-empty">${this.complianceData.deadlines.length ? 'No records match this filter.' : 'No deadlines saved yet.'}</div>`;
      return;
    }
    target.innerHTML = rows.map(item => `
      <article class="cmp-deadline-row ${item.status === 'COMPLETED' ? 'is-complete' : Number(item.days_remaining) < 0 ? 'is-overdue' : ''}">
        <button class="cmp-deadline-check" data-complete-deadline="${Number(item.id)}" title="${item.status === 'COMPLETED' ? 'Mark pending' : 'Mark complete'}" aria-label="${item.status === 'COMPLETED' ? 'Mark deadline pending' : 'Mark deadline complete'}">${item.status === 'COMPLETED' ? '✓' : ''}</button>
        <div class="cmp-deadline-info">
          <strong>${this.escapeHtml(item.title)}</strong>
          <span>${this.escapeHtml(item.category || 'General')} · ${this.formatComplianceDate(item.deadline_date)}${item.linked_staff_name ? ` · ${this.escapeHtml(item.linked_staff_name)}` : ''}</span>
        </div>
        <div class="cmp-deadline-actions">
          ${item.entity_type === 'COMPANY_LICENSE'
            ? `<button class="cmp-text-button" data-edit-license="${Number(item.entity_id)}">Edit license</button>`
            : `<button class="cmp-text-button" data-edit-deadline="${Number(item.id)}">Edit</button>`}
          ${item.entity_type !== 'COMPANY_LICENSE' ? `<button class="cmp-text-button cmp-delete-button" data-delete-deadline="${Number(item.id)}">Delete</button>` : ''}
        </div>
      </article>
    `).join('');
  }

  renderRecentRecords() {
    const target = this.mainArea?.querySelector('#cmpRecentRecords');
    if (!target) return;
    const records = this.complianceData.overview?.recordedActivity || [];
    if (!records.length) {
      target.innerHTML = '<div class="cmp-inline-empty">No compliance records have been saved yet. Add a license or deadline to get started.</div>';
      return;
    }
    target.innerHTML = records.map(item => `
      <div class="cmp-activity-row">
        <span class="cmp-activity-dot ${item.record_type === 'license' ? 'is-license' : ''}"></span>
        <div><strong>${this.escapeHtml(item.title)}</strong><small>${item.record_type === 'license' ? 'License record' : 'Deadline record'} · ${this.formatComplianceDate(String(item.created_at || '').slice(0, 10))}</small></div>
      </div>
    `).join('');
  }

  async toggleDeadlineStatus(id) {
    const record = this.complianceData.deadlines.find(item => String(item.id) === String(id));
    if (!record) return;
    const status = record.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    try {
      await this.requestComplianceApi(`/api/compliance/deadlines/${encodeURIComponent(id)}/status`, {
        method: 'PATCH', body: JSON.stringify({ status })
      });
      await this.loadComplianceData();
      if (this.currentView === 'dashboard') {
        this.renderDashboardMetrics();
        this.renderComplianceCalendar();
        this.renderDashboardDeadlines();
        this.renderRecentRecords();
      } else if (this.currentView === 'compliance') {
        this.renderComplianceSummary();
        this.renderComplianceRecords();
      }
      this.showNotification(`Deadline marked ${status.toLowerCase()}.`, 'success');
    } catch (error) {
      this.showNotification(error.message, 'error');
    }
  }

  async deleteComplianceRecord(type, id) {
    if (!window.confirm('Delete this saved record? This cannot be undone.')) return;
    const path = type === 'license' ? 'licenses' : 'deadlines';
    try {
      await this.requestComplianceApi(`/api/compliance/${path}/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await this.loadComplianceData();
      if (this.currentView === 'dashboard') this.renderDashboard();
      else this.renderComplianceView();
      this.showNotification('Record deleted.', 'success');
    } catch (error) {
      this.showNotification(error.message, 'error');
    }
  }

  openComplianceRecordModal(type, record = null) {
    const isLicense = type === 'license';
    const title = record ? `Edit ${isLicense ? 'license' : 'deadline'}` : `Add ${isLicense ? 'license' : 'deadline'}`;
    const option = (items, selectedId, labelFn, emptyLabel) => `
      <option value="">${emptyLabel}</option>
      ${items.map(item => `<option value="${Number(item.id)}" ${String(item.id) === String(selectedId || '') ? 'selected' : ''}>${this.escapeHtml(labelFn(item))}</option>`).join('')}
    `;
    const modal = document.createElement('div');
    modal.className = 'cmp-record-modal-backdrop';
    modal.innerHTML = `
      <section class="cmp-record-modal" role="dialog" aria-modal="true" aria-labelledby="cmpRecordModalTitle">
        <header><div><h3 id="cmpRecordModalTitle">${title}</h3><p>Saved to the Directory compliance records.</p></div><button type="button" class="cmp-modal-close" aria-label="Close">×</button></header>
        <form id="cmpRecordForm">
          <label class="cmp-form-field cmp-form-wide">Record title<input name="title" required maxlength="180" value="${this.escapeHtml(record?.title || '')}"></label>
          <label class="cmp-form-field">Category<input name="category" maxlength="80" value="${this.escapeHtml(record?.category || (isLicense ? 'STATUTORY_DRUG' : 'GENERAL'))}"></label>
          ${isLicense ? `
            <label class="cmp-form-field">License number<input name="license_number" maxlength="100" value="${this.escapeHtml(record?.license_number || '')}"></label>
            <label class="cmp-form-field">Issuing authority<input name="issuing_authority" maxlength="160" value="${this.escapeHtml(record?.issuing_authority || '')}"></label>
            <label class="cmp-form-field">Issue date<input name="issue_date" type="date" value="${this.escapeHtml(String(record?.issue_date || '').slice(0, 10))}"></label>
            <label class="cmp-form-field">Expiry date<input name="expiry_date" type="date" value="${this.escapeHtml(String(record?.expiry_date || '').slice(0, 10))}"></label>
            <label class="cmp-form-field">Renewal frequency<input name="renewal_frequency" maxlength="60" value="${this.escapeHtml(record?.renewal_frequency || '')}" placeholder="Optional"></label>
            <label class="cmp-form-field">Status<select name="status"><option value="ACTIVE" ${record?.status === 'ACTIVE' ? 'selected' : ''}>Active</option><option value="INACTIVE" ${record?.status === 'INACTIVE' ? 'selected' : ''}>Inactive</option></select></label>
          ` : `
            <label class="cmp-form-field">Due date<input name="deadline_date" type="date" required value="${this.escapeHtml(String(record?.deadline_date || '').slice(0, 10))}"></label>
            <label class="cmp-form-field">Priority<select name="priority">${['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(priority => `<option value="${priority}" ${String(record?.priority || 'MEDIUM').toUpperCase() === priority ? 'selected' : ''}>${priority[0] + priority.slice(1).toLowerCase()}</option>`).join('')}</select></label>
          `}
          <label class="cmp-form-field">Responsible staff<select name="${isLicense ? 'linked_staff_id' : 'staff_id'}">${option(this.complianceData.staff, isLicense ? record?.linked_staff_id : record?.staff_id, item => `${item.full_name} · ${item.emp_code}`, 'Not linked')}</select></label>
          <label class="cmp-form-field">Vault document<select name="vault_document_id">${option(this.complianceData.documents, record?.vault_document_id, item => `${item.doc_ref_no || 'No reference'} · ${item.title}`, 'Not linked')}</select></label>
          <label class="cmp-form-field cmp-form-wide">Notes<textarea name="notes" rows="3" maxlength="2000">${this.escapeHtml(record?.notes || '')}</textarea></label>
          <footer><button type="button" class="cmp-action-button cmp-action-secondary cmp-modal-cancel">Cancel</button><button type="submit" class="cmp-action-button cmp-action-primary">${record ? 'Save changes' : 'Create record'}</button></footer>
        </form>
      </section>
    `;
    const close = () => modal.remove();
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    modal.querySelector('.cmp-modal-close')?.addEventListener('click', close);
    modal.querySelector('.cmp-modal-cancel')?.addEventListener('click', close);
    modal.querySelector('#cmpRecordForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const payload = Object.fromEntries(new FormData(form).entries());
      for (const [field, value] of Object.entries(payload)) {
        if (value === '' && !['title', 'category', 'status', 'priority'].includes(field)) payload[field] = null;
      }
      for (const field of ['linked_staff_id', 'staff_id', 'vault_document_id']) {
        if (Object.prototype.hasOwnProperty.call(payload, field)) payload[field] = payload[field] ? Number(payload[field]) : null;
      }
      const endpoint = isLicense ? 'licenses' : 'deadlines';
      try {
        await this.requestComplianceApi(`/api/compliance/${endpoint}${record ? `/${encodeURIComponent(record.id)}` : ''}`, {
          method: record ? 'PUT' : 'POST', body: JSON.stringify(payload)
        });
        close();
        await this.loadComplianceData();
        if (this.currentView === 'dashboard') this.renderDashboard();
        else this.renderComplianceView();
        this.showNotification(`${isLicense ? 'License' : 'Deadline'} ${record ? 'updated' : 'created'} successfully.`, 'success');
      } catch (error) {
        this.showNotification(error.message, 'error');
      }
    });
    document.body.appendChild(modal);
    modal.querySelector('input[name="title"]')?.focus();
  }

  async refreshComplianceRecords() {
    try {
      await this.loadComplianceData();
      if (this.currentView === 'compliance') {
        this.renderComplianceSummary();
        this.renderComplianceRecords();
      }
    } catch (error) {
      const summary = this.mainArea?.querySelector('#cmpComplianceSummary');
      if (summary) summary.innerHTML = `<div class="cmp-live-state cmp-live-error">${this.escapeHtml(error.message)} <button class="cmp-action-button cmp-action-secondary" id="cmpRetryCompliance">Retry</button></div>`;
      this.mainArea?.querySelector('#cmpRetryCompliance')?.addEventListener('click', () => this.refreshComplianceRecords());
    }
  }

  renderComplianceSummary() {
    const target = this.mainArea?.querySelector('#cmpComplianceSummary');
    if (!target) return;
    const stats = this.complianceData.overview?.metrics || {};
    target.innerHTML = `
      <div><strong>${stats.totalLicenses ?? 0}</strong><span>License records</span></div>
      <div><strong>${stats.pendingDeadlinesCount ?? 0}</strong><span>Pending deadlines</span></div>
      <div><strong>${stats.overdueDeadlinesCount ?? 0}</strong><span>Overdue deadlines</span></div>
      <div><strong>${stats.expiringSoonCount ?? 0}</strong><span>Expiring in 60 days</span></div>
    `;
  }

  getFilteredComplianceRecords(type) {
    const query = this.complianceSearch || '';
    const filter = this.complianceStatusFilter || 'ALL';
    let items = type === 'license' ? this.complianceData.licenses : this.complianceData.deadlines;
    if (filter === 'ACTIVE' || filter === 'INACTIVE') {
      if (type === 'deadline') return [];
      items = items.filter(item => item.status === filter);
    } else if (filter === 'PENDING' || filter === 'COMPLETED') {
      if (type === 'license') return [];
      items = items.filter(item => item.status === filter);
    }
    if (query) {
      items = items.filter(item => `${item.title} ${item.category || ''} ${item.license_number || ''} ${item.linked_staff_name || ''} ${item.vault_document_title || ''} ${item.linked_license_title || ''}`.toLowerCase().includes(query));
    }
    return items;
  }

  renderComplianceRecords() {
    const licenseTarget = this.mainArea?.querySelector('#cmpLicenseRecords');
    const deadlineTarget = this.mainArea?.querySelector('#cmpDeadlineRecords');
    if (!licenseTarget || !deadlineTarget) return;
    const licenses = this.getFilteredComplianceRecords('license');
    const deadlines = this.getFilteredComplianceRecords('deadline');
    const licenseCount = this.mainArea.querySelector('#cmpLicenseCount');
    const deadlineCount = this.mainArea.querySelector('#cmpDeadlineCount');
    if (licenseCount) licenseCount.textContent = `${licenses.length} shown`;
    if (deadlineCount) deadlineCount.textContent = `${deadlines.length} shown`;
    licenseTarget.innerHTML = licenses.length ? licenses.map(item => `
      <article class="cmp-managed-record">
        <div class="cmp-managed-record-main">
          <span class="cmp-record-type-icon">▤</span>
          <div><strong>${this.escapeHtml(item.title)}</strong><small>${this.escapeHtml(item.category || 'License')} · ${this.escapeHtml(item.license_number || 'No number recorded')} · ${item.expiry_date ? `Expires ${this.formatComplianceDate(item.expiry_date)}` : 'No expiry date recorded'}</small>
            <small>${item.linked_staff_name ? `Staff: ${this.escapeHtml(item.linked_staff_name)}` : 'No staff link'}${item.vault_document_title ? ` · Vault: ${this.escapeHtml(item.vault_document_title)}` : ''}</small></div>
        </div>
        <span class="cmp-status-pill ${item.status === 'ACTIVE' ? 'is-active' : ''}">${this.escapeHtml(item.status || 'ACTIVE')}</span>
        <div class="cmp-record-actions"><button class="cmp-text-button" data-edit-license="${Number(item.id)}">Edit</button><button class="cmp-text-button cmp-delete-button" data-delete-license="${Number(item.id)}">Delete</button></div>
      </article>
    `).join('') : `<div class="cmp-inline-empty">${this.complianceData.licenses.length ? 'No license records match these filters.' : 'No licenses saved yet. Add a record to track its current status and expiry.'}</div>`;
    deadlineTarget.innerHTML = deadlines.length ? deadlines.map(item => `
      <article class="cmp-managed-record ${item.status === 'COMPLETED' ? 'is-complete' : Number(item.days_remaining) < 0 ? 'is-overdue' : ''}">
        <div class="cmp-managed-record-main">
          <button class="cmp-deadline-check" data-complete-managed-deadline="${Number(item.id)}" title="${item.status === 'COMPLETED' ? 'Mark pending' : 'Mark complete'}" aria-label="${item.status === 'COMPLETED' ? 'Mark deadline pending' : 'Mark deadline complete'}">${item.status === 'COMPLETED' ? '✓' : ''}</button>
          <div><strong>${this.escapeHtml(item.title)}</strong><small>${this.escapeHtml(item.category || 'General')} · ${this.formatComplianceDate(item.deadline_date)} · ${this.escapeHtml(item.priority || 'MEDIUM')}${item.linked_license_title ? ` · ${this.escapeHtml(item.linked_license_title)}` : ''}</small>
            <small>${item.linked_staff_name ? `Staff: ${this.escapeHtml(item.linked_staff_name)}` : 'No staff link'}${item.vault_document_title ? ` · Vault: ${this.escapeHtml(item.vault_document_title)}` : ''}</small></div>
        </div>
        <span class="cmp-status-pill ${item.status === 'COMPLETED' ? 'is-complete' : ''}">${this.escapeHtml(item.status || 'PENDING')}</span>
        <div class="cmp-record-actions">${item.entity_type === 'COMPANY_LICENSE' ? `<button class="cmp-text-button" data-edit-license="${Number(item.entity_id)}">Edit license</button>` : `<button class="cmp-text-button" data-edit-managed-deadline="${Number(item.id)}">Edit</button><button class="cmp-text-button cmp-delete-button" data-delete-managed-deadline="${Number(item.id)}">Delete</button>`}</div>
      </article>
    `).join('') : `<div class="cmp-inline-empty">${this.complianceData.deadlines.length ? 'No deadline records match these filters.' : 'No deadlines saved yet. Add a due date you want the team to track.'}</div>`;
  }

  exportComplianceRecords() {
    const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const licenses = this.getFilteredComplianceRecords('license');
    const deadlines = this.getFilteredComplianceRecords('deadline');
    if (!licenses.length && !deadlines.length) {
      this.showNotification('There are no matching records to export.', 'info');
      return;
    }
    const rows = [
      ['Directory compliance records export'],
      ['Generated at', new Date().toISOString()],
      ['Search filter', this.complianceSearch || 'All records'],
      ['Status filter', this.complianceStatusFilter || 'ALL'],
      [],
      ['Record type', 'Title', 'Category', 'Status', 'Date', 'Priority', 'Staff', 'Vault document', 'Notes'],
      ...licenses.map(item => ['License', item.title, item.category, item.status, item.expiry_date, '', item.linked_staff_name, item.vault_document_title, item.notes]),
      ...deadlines.map(item => ['Deadline', item.title, item.category, item.status, item.deadline_date, item.priority, item.linked_staff_name, item.vault_document_title, item.notes])
    ];
    const csv = rows.map(row => row.map(quote).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `compliance-records-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  // ==========================================
  // SIDEBAR LINKED RESOURCE VIEWS
  // ==========================================

  // View 2: Document Vault (Powered by StackOverdrive Cloud)
  renderDocumentVaultView() {
    if (!this.mainArea) return;
    this.mainArea.innerHTML = `
      <div class="cmp-view-pad">
        <div class="compliance-header-bar">
          <div class="compliance-header-title">
            <h2>Document Vault</h2>
            <p>Powered by StackOverdrive Cloud Storage • KYC, contracts, certificates & registers</p>
          </div>
          <div>
            <button class="compliance-header-btn" id="cmpLaunchCloudBtn" style="background: var(--cmp-primary); color: #fff; padding: 5px 14px; font-weight: 600; width: auto; height: auto; border-radius: 6px;">
              Open Cloud App ↗
            </button>
          </div>
        </div>

        <div class="cmp-deck-grid" style="grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));">
          <div class="cmp-dash-card" style="cursor: pointer;" onclick="window.ComplianceAppInstance.openCloudCategory('KYC')">
            <div style="font-size: 26px; margin-bottom: 8px;">🪪</div>
            <strong style="font-size: 14.5px;">Worker KYC & Identities</strong>
            <p style="font-size: 12px; color: #666; margin: 4px 0 12px 0;">Aadhaar, PAN, and address verifications</p>
            <span style="font-size: 11px; font-weight: 600; color: var(--cmp-primary);">Browse Files →</span>
          </div>

          <div class="cmp-dash-card" style="cursor: pointer;" onclick="window.ComplianceAppInstance.openCloudCategory('LICENSES')">
            <div style="font-size: 26px; margin-bottom: 8px;">🏛️</div>
            <strong style="font-size: 14.5px;">Statutory Licenses</strong>
            <p style="font-size: 12px; color: #666; margin: 4px 0 12px 0;">AYUSH Form 25D, Factory License, PCB & Fire NOC</p>
            <span style="font-size: 11px; font-weight: 600; color: var(--cmp-primary);">Browse Files →</span>
          </div>

          <div class="cmp-dash-card" style="cursor: pointer;" onclick="window.ComplianceAppInstance.openCloudCategory('HEALTH')">
            <div style="font-size: 26px; margin-bottom: 8px;">🩺</div>
            <strong style="font-size: 14.5px;">Medical Fitness (Form 48)</strong>
            <p style="font-size: 12px; color: #666; margin: 4px 0 12px 0;">Annual health and disease clearances</p>
            <span style="font-size: 11px; font-weight: 600; color: var(--cmp-primary);">Browse Files →</span>
          </div>

          <div class="cmp-dash-card" style="cursor: pointer;" onclick="window.ComplianceAppInstance.openCloudCategory('SOPS')">
            <div style="font-size: 26px; margin-bottom: 8px;">📜</div>
            <strong style="font-size: 14.5px;">Internal SOPs & Manuals</strong>
            <p style="font-size: 12px; color: #666; margin: 4px 0 12px 0;">Sanitation, processing & boiler protocols</p>
            <span style="font-size: 11px; font-weight: 600; color: var(--cmp-primary);">Browse Files →</span>
          </div>
        </div>
      </div>
    `;

    this.mainArea.querySelector('#cmpLaunchCloudBtn')?.addEventListener('click', () => {
      if (window.AppWindow && window.CloudApp) {
        window.AppWindow.launchApp('cloud', window.CloudApp, 'cloudAppContainer');
        this.showNotification('Switched to StackOverdrive Cloud.', 'info');
      }
    });
  }

  openCloudCategory(cat) {
    if (window.AppWindow && window.CloudApp) {
      window.AppWindow.launchApp('cloud', window.CloudApp, 'cloudAppContainer');
      this.showNotification(`Navigating to ${cat} documents in Cloud.`, 'info');
    }
  }

  // Compliance records are managed from the existing persisted license/deadline APIs.
  renderComplianceView() {
    if (!this.mainArea) return;
    this.mainArea.innerHTML = `
      <div class="cmp-view-pad cmp-live-workspace">
        <div class="compliance-header-bar">
          <div class="compliance-header-title">
            <h2>Compliance records</h2>
            <p>Track the licenses and deadlines your organization has entered. No obligations or dates are assumed.</p>
          </div>
          <div class="cmp-toolbar-actions">
            <button class="cmp-action-button cmp-action-secondary" id="cmpExportCompliance">⇩ Export CSV</button>
            <button class="cmp-action-button cmp-action-secondary" id="cmpRefreshCompliance">↻ Refresh</button>
            <button class="cmp-action-button cmp-action-primary" id="cmpAddLicense">＋ Add license</button>
            <button class="cmp-action-button cmp-action-primary" id="cmpAddDeadline">＋ Add deadline</button>
          </div>
        </div>
        <div class="cmp-compliance-summary" id="cmpComplianceSummary"><div class="cmp-live-state">Loading saved records…</div></div>
        <div class="cmp-record-toolbar">
          <input class="cmp-workspace-search" id="cmpComplianceSearch" type="search" placeholder="Search titles, categories, staff, and Vault references…">
          <select class="cmp-compact-select" id="cmpComplianceStatus" aria-label="Filter records">
            <option value="ALL">All statuses</option><option value="PENDING">Pending deadlines</option><option value="COMPLETED">Completed deadlines</option><option value="ACTIVE">Active licenses</option><option value="INACTIVE">Inactive licenses</option>
          </select>
        </div>
        <section class="cmp-dash-card cmp-record-table-card">
          <div class="cmp-record-table-heading"><h3>Licenses</h3><span id="cmpLicenseCount"></span></div>
          <div id="cmpLicenseRecords" class="cmp-managed-records"></div>
          <div class="cmp-record-table-heading cmp-deadlines-heading"><h3>Deadlines & renewals</h3><span id="cmpDeadlineCount"></span></div>
          <div id="cmpDeadlineRecords" class="cmp-managed-records"></div>
        </section>
        <div class="cmp-report-footnote">CSV export includes only the records visible with the current search and filters.</div>
      </div>
    `;
    this.mainArea.querySelector('#cmpAddLicense')?.addEventListener('click', () => this.openComplianceRecordModal('license'));
    this.mainArea.querySelector('#cmpAddDeadline')?.addEventListener('click', () => this.openComplianceRecordModal('deadline'));
    this.mainArea.querySelector('#cmpRefreshCompliance')?.addEventListener('click', () => this.refreshComplianceRecords());
    this.mainArea.querySelector('#cmpExportCompliance')?.addEventListener('click', () => this.exportComplianceRecords());
    this.mainArea.querySelector('#cmpComplianceSearch')?.addEventListener('input', event => {
      this.complianceSearch = event.target.value.trim().toLowerCase();
      this.renderComplianceRecords();
    });
    this.mainArea.querySelector('#cmpComplianceStatus')?.addEventListener('change', event => {
      this.complianceStatusFilter = event.target.value;
      this.renderComplianceRecords();
    });
    this.mainArea.querySelector('.cmp-record-table-card')?.addEventListener('click', event => {
      const editLicense = event.target.closest('[data-edit-license]');
      const deleteLicense = event.target.closest('[data-delete-license]');
      const editDeadline = event.target.closest('[data-edit-managed-deadline]');
      const deleteDeadline = event.target.closest('[data-delete-managed-deadline]');
      const completeDeadline = event.target.closest('[data-complete-managed-deadline]');
      if (editLicense) {
        const row = this.complianceData.licenses.find(item => String(item.id) === editLicense.dataset.editLicense);
        if (row) this.openComplianceRecordModal('license', row);
      }
      if (deleteLicense) this.deleteComplianceRecord('license', deleteLicense.dataset.deleteLicense);
      if (editDeadline) {
        const row = this.complianceData.deadlines.find(item => String(item.id) === editDeadline.dataset.editManagedDeadline);
        if (row) this.openComplianceRecordModal('deadline', row);
      }
      if (deleteDeadline) this.deleteComplianceRecord('deadline', deleteDeadline.dataset.deleteManagedDeadline);
      if (completeDeadline) this.toggleDeadlineStatus(completeDeadline.dataset.completeManagedDeadline);
    });
    this.refreshComplianceRecords();
  }
}

// Global Export for AppWindow loader
window.ComplianceApp = ComplianceApp;
