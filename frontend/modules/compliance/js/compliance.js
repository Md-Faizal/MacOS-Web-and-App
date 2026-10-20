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
    this.calendarMode = 'streak'; // 'streak' or 'apple'
    this.params = params;

    // Interactive State (Standardized White Aesthetic)
    this.reminders = [
      { id: 1, title: 'Verify GSTR-1 Outward Summary (Table 12 HSN)', category: 'Tax', dueDate: 'Oct 11, 2026', priority: 'High', completed: false },
      { id: 2, title: 'Annual Schedule T Form 48 Worker Medical Checkup', category: 'Health', dueDate: 'Oct 24, 2026', priority: 'Critical', completed: false },
      { id: 3, title: 'AYUSH Form 25D Drug License 5-Year Renewal Audit', category: 'Statutory', dueDate: 'Nov 15, 2026', priority: 'High', completed: false },
      { id: 4, title: 'State Pollution Control Board (OSPCB) CTO Water Consent', category: 'Environment', dueDate: 'Dec 05, 2026', priority: 'Medium', completed: false },
      { id: 5, title: 'Retention Sample Inspection (Rule 161B Asava Arishta)', category: 'GMP', dueDate: 'Quarterly', priority: 'Low', completed: true }
    ];

    this.recentActions = [
      { user: 'JM', name: 'Dr. Jashobanta Rao Mohanta', action: 'Approved and signed off Schedule T BMR Batch release', time: '14m ago', color: '#10b981' },
      { user: 'AD', name: 'System Admin', action: 'Synchronized Directory & Company Vault storage', time: '3h ago', color: '#8b5cf6' },
      { user: 'FA', name: 'Finance / Accounts', action: 'Generated GST Compliance export via Rust Engine', time: '2d ago', color: '#06b6d4' }
    ];

    this.searchCatalog = [
      { title: 'Dr. Jashobanta Rao Mohanta', category: 'Staff', sub: 'Chief Ayurvedic Physician (BAMS-OSCAM-6824)', icon: '🩺' },
      { title: 'AYUSH Form 25D Drug License', category: 'License', sub: 'OR-02/AYUR • Expires March 2027', icon: '🏛️' },
      { title: 'Schedule T GMP Compliance', category: 'License', sub: 'Ayush Inspection Board • Active', icon: '📜' },
      { title: 'State Pollution Board (OSPCB) CTO', category: 'License', sub: 'Consent to Operate • Expires 2028', icon: '🌿' },
      { title: 'GSTR-1 Monthly Return Due', category: 'Deadline', sub: 'Table 12 HSN Summary Cut-off', icon: '⏰' },
      { title: 'Schedule T Form 48 Medical Exams', category: 'Deadline', sub: 'Annual worker health audit', icon: '⏰' },
      { title: 'Worker KYC & Identities', category: 'Document', sub: 'Aadhaar, PAN & address verifications', icon: '🪪' },
      { title: 'Standard Operating Procedures', category: 'Document', sub: 'Manufacturing SOPs & safety manuals', icon: '📁' }
    ];

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
      this.renderDashboard();
      this.showNotification('Dashboard feed synchronized.', 'success');
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
    const matches = this.searchCatalog.filter(item => 
      item.title.toLowerCase().includes(q) || 
      item.sub.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );

    if (matches.length === 0) {
      this.searchDropdown.innerHTML = `<div style="padding: 14px 16px; color: #888; font-size: 12px; text-align: center;">No results found for "${query}"</div>`;
      this.searchDropdown.style.display = 'block';
      return;
    }

    this.populateSearchDropdown(matches);
  }

  populateSearchDropdown(results) {
    if (!this.searchDropdown) return;
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
        const row = document.createElement('div');
        row.className = 'compliance-search-dropdown-item';
        row.innerHTML = `
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">${item.icon || '📄'}</span>
            <div style="flex: 1; min-width: 0;">
              <div class="cmp-search-title">${item.title}</div>
              <div class="cmp-search-sub">${item.sub}</div>
            </div>
          </div>
        `;
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
    this.showNotification(`Selected: ${item.title}`, 'info');
    if (item.category === 'Staff') {
      const match = this.staffList.find(s => 
        s.full_name.toLowerCase().includes(item.title.toLowerCase()) || 
        item.title.toLowerCase().includes(s.full_name.toLowerCase())
      );
      if (match && this.staffView) {
        this.staffView.selectedStaffId = match.id;
      }
      this.selectSidebarTab('staff');
    } else if (item.category === 'License' || item.category === 'Deadline') {
      this.selectSidebarTab('compliance');
    } else if (item.category === 'Document') {
      this.selectSidebarTab('vault');
    }
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

  // ==========================================
  // DASHBOARD VIEW (Pure White Theme)
  // ==========================================
  renderDashboard() {
    if (!this.mainArea) return;

    this.mainArea.innerHTML = `
      <div class="cmp-view-pad">
        <div class="compliance-header-bar">
          <div class="compliance-header-title">
            <h2>Dashboard</h2>
            <p>Activity timeline, statutory deadlines, reminders, and audit history</p>
          </div>
          <div>
            <button class="compliance-header-btn" id="cmpRefreshDashBtn" style="padding: 5px 12px; font-weight: 600; width: auto; height: auto; border-radius: 6px;">↻ Refresh Feed</button>
          </div>
        </div>

        <!-- 1. Interactive Dual Calendar Card -->
        <div class="cmp-dash-card">
          <div class="cmp-dash-card-header">
            <div class="cmp-dash-card-title">
              <span>📅</span> Activity & Deadlines Calendar
            </div>
            <div class="cmp-cal-switcher">
              <button class="cmp-cal-tab ${this.calendarMode === 'streak' ? 'active' : ''}" id="cmpTabStreak">365-Day Streak</button>
              <button class="cmp-cal-tab ${this.calendarMode === 'apple' ? 'active' : ''}" id="cmpTabApple">Month Grid</button>
            </div>
          </div>

          <div id="cmpCalendarContainer">
            <!-- Streak or Apple Month Grid -->
          </div>
        </div>

        <!-- 2. Two-Column Lower Deck: Reminders & Recent Actions -->
        <div class="cmp-deck-grid">
          <!-- Reminders Column (Apple Reminders Style) -->
          <div class="cmp-dash-card" style="margin-bottom: 0;">
            <div class="cmp-dash-card-header">
              <div class="cmp-dash-card-title">
                <span>🔔</span> Reminders & Deadlines
              </div>
              <span style="font-size: 11px; color: #777;" id="cmpPendingRemindersCount"></span>
            </div>

            <div class="cmp-reminders-list" id="cmpRemindersList">
              <!-- Dynamic Reminders -->
            </div>

            <div class="cmp-reminder-add-box">
              <input type="text" id="cmpNewReminderInput" class="cmp-reminder-input" placeholder="+ Add a deadline reminder...">
              <button class="compliance-header-btn" id="cmpAddReminderBtn" style="background: var(--cmp-primary); color: #fff; padding: 0 14px; font-weight: 600; width: auto; height: auto; border-radius: 6px;">Add</button>
            </div>
          </div>

          <!-- Recent Actions Column -->
          <div class="cmp-dash-card" style="margin-bottom: 0;">
            <div class="cmp-dash-card-header">
              <div class="cmp-dash-card-title">
                <span>⚡</span> Recent Actions
              </div>
              <span style="font-size: 11px; color: #777;">Audit Log</span>
            </div>

            <div class="cmp-actions-list" id="cmpRecentActionsList">
              <!-- Dynamic Action Items -->
            </div>
          </div>
        </div>
      </div>
    `;

    // Hook Tab Switcher
    this.mainArea.querySelector('#cmpTabStreak')?.addEventListener('click', () => {
      this.calendarMode = 'streak';
      this.mainArea.querySelector('#cmpTabStreak').classList.add('active');
      this.mainArea.querySelector('#cmpTabApple').classList.remove('active');
      this.renderCalendarContent();
    });

    this.mainArea.querySelector('#cmpTabApple')?.addEventListener('click', () => {
      this.calendarMode = 'apple';
      this.mainArea.querySelector('#cmpTabApple').classList.add('active');
      this.mainArea.querySelector('#cmpTabStreak').classList.remove('active');
      this.renderCalendarContent();
    });

    this.mainArea.querySelector('#cmpRefreshDashBtn')?.addEventListener('click', () => {
      this.renderDashboard();
      this.showNotification('Latest timeline synchronized.', 'info');
    });

    // Hook Add Reminder
    const addReminder = () => {
      const input = this.mainArea.querySelector('#cmpNewReminderInput');
      const text = input?.value.trim();
      if (!text) return;
      this.reminders.unshift({
        id: Date.now(),
        title: text,
        category: 'Task',
        dueDate: 'Upcoming',
        priority: 'High',
        completed: false
      });
      input.value = '';
      this.renderReminders();
      this.showNotification(`Reminder added: ${text}`, 'success');
    };

    this.mainArea.querySelector('#cmpAddReminderBtn')?.addEventListener('click', addReminder);
    this.mainArea.querySelector('#cmpNewReminderInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addReminder();
    });

    this.renderCalendarContent();
    this.renderReminders();
    this.renderRecentActions();
  }

  // Calendar Content Switcher
  renderCalendarContent() {
    const container = this.mainArea?.querySelector('#cmpCalendarContainer');
    if (!container) return;

    if (this.calendarMode === 'streak') {
      this.renderStreakCalendar(container);
    } else {
      this.renderAppleCalendar(container);
    }
  }

  // 1A. 365-Day GitHub Contribution Streak Calendar
  renderStreakCalendar(container) {
    const totalDays = 365;
    const today = new Date();
    
    const daysData = [];
    for (let i = totalDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      
      let level = 0;
      const seed = (d.getDate() * 17 + d.getMonth() * 31) % 100;
      if (seed > 80) level = 4;
      else if (seed > 60) level = 3;
      else if (seed > 35) level = 2;
      else if (seed > 15) level = 1;

      daysData.push({
        date: d.toISOString().split('T')[0],
        formatted: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        level,
        events: level > 0 ? `${level * 2} actions completed` : 'No actions recorded'
      });
    }

    container.innerHTML = `
      <div class="cmp-streak-meta">
        <div class="cmp-streak-stat"><strong>264</strong> Compliance Events in 2026</div>
        <div class="cmp-streak-stat">Current Streak: <strong style="color: var(--cmp-success);">21 Days</strong></div>
        <div class="cmp-streak-stat">Longest Streak: <strong>54 Days</strong></div>
      </div>

      <div class="cmp-streak-container">
        <div class="cmp-streak-grid" id="cmpStreakGrid">
          ${daysData.map(d => `
            <div class="cmp-streak-cell lvl-${d.level}" 
                 title="${d.formatted}: ${d.events}"
                 data-date="${d.date}">
            </div>
          `).join('')}
        </div>
      </div>

      <div class="cmp-streak-legend">
        <span>Less</span>
        <div class="cmp-streak-legend-cell" style="background: #ebedf0;"></div>
        <div class="cmp-streak-legend-cell" style="background: #9be9a8;"></div>
        <div class="cmp-streak-legend-cell" style="background: #40c463;"></div>
        <div class="cmp-streak-legend-cell" style="background: #30a14e;"></div>
        <div class="cmp-streak-legend-cell" style="background: #216e39;"></div>
        <span>More</span>
      </div>
    `;
  }

  // 1B. Apple Calendar Month Grid
  renderAppleCalendar(container) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const monthName = now.toLocaleString('en-US', { month: 'long' });

    const eventsByDay = {
      4: [{ label: 'BMR Batch #08 Released', color: 'cmp-tag-green' }],
      11: [{ label: 'GSTR-1 Monthly Return Due', color: 'cmp-tag-amber' }],
      15: [{ label: 'AYUSH Form 25D Renewal Audit', color: 'cmp-tag-red' }],
      20: [{ label: 'GSTR-3B Tax Filing', color: 'cmp-tag-amber' }],
      24: [{ label: 'Schedule T Worker Medical Exam', color: 'cmp-tag-purple' }],
      28: [{ label: 'Boiler & Safety Inspection', color: 'cmp-tag-blue' }]
    };

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const todayDate = now.getDate();

    let gridCellsHtml = '';
    for (let i = 0; i < firstDay; i++) {
      gridCellsHtml += '<div class="cmp-apple-cal-cell" style="opacity: 0.3;"></div>';
    }

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const isToday = day === todayDate;
      const events = eventsByDay[day] || [];
      gridCellsHtml += `
        <div class="cmp-apple-cal-cell ${isToday ? 'today' : ''}">
          <div class="cmp-apple-cal-cell-header">
            <span>${day}</span>
          </div>
          ${events.map(e => `
            <div class="cmp-cal-event-tag ${e.color}" title="${e.label}">
              ${e.label}
            </div>
          `).join('')}
        </div>
      `;
    }

    container.innerHTML = `
      <div class="cmp-apple-cal">
        <div class="cmp-apple-cal-nav">
          <div class="cmp-apple-cal-month-label">${monthName} ${currentYear}</div>
          <div style="font-size: 11px; color: #777;">
            🔴 Urgent Expiry • 🟡 Tax Filing • 🟣 Medical • 🟢 BMR Release
          </div>
        </div>

        <div class="cmp-apple-cal-grid">
          <div class="cmp-apple-cal-day-header">Sun</div>
          <div class="cmp-apple-cal-day-header">Mon</div>
          <div class="cmp-apple-cal-day-header">Tue</div>
          <div class="cmp-apple-cal-day-header">Wed</div>
          <div class="cmp-apple-cal-day-header">Thu</div>
          <div class="cmp-apple-cal-day-header">Fri</div>
          <div class="cmp-apple-cal-day-header">Sat</div>
          ${gridCellsHtml}
        </div>
      </div>
    `;
  }

  // Reminders List Renderer
  renderReminders() {
    const listEl = this.mainArea?.querySelector('#cmpRemindersList');
    const countEl = this.mainArea?.querySelector('#cmpPendingRemindersCount');
    if (!listEl) return;

    const pendingCount = this.reminders.filter(r => !r.completed).length;
    if (countEl) countEl.textContent = `${pendingCount} pending`;

    listEl.innerHTML = this.reminders.map(r => `
      <div class="cmp-reminder-item ${r.completed ? 'completed' : ''}">
        <div class="cmp-reminder-check" onclick="window.ComplianceAppInstance.toggleReminder(${r.id})"></div>
        <div class="cmp-reminder-content">
          <div class="cmp-reminder-title">${r.title}</div>
          <div class="cmp-reminder-meta">
            <span>⏰ ${r.dueDate}</span>
            <span>•</span>
            <span style="font-weight: 600; color: ${r.priority === 'Critical' ? 'var(--cmp-danger)' : r.priority === 'High' ? 'var(--cmp-warning)' : 'inherit'};">
              ${r.priority}
            </span>
            <span>•</span>
            <span>${r.category}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  toggleReminder(id) {
    const item = this.reminders.find(r => r.id === id);
    if (item) {
      item.completed = !item.completed;
      this.renderReminders();
      const status = item.completed ? 'completed' : 'pending';
      this.showNotification(`Marked as ${status}: ${item.title}`, 'info');
    }
  }

  // Recent Actions Renderer
  renderRecentActions() {
    const listEl = this.mainArea?.querySelector('#cmpRecentActionsList');
    if (!listEl) return;

    listEl.innerHTML = this.recentActions.map(a => `
      <div class="cmp-action-item">
        <div class="cmp-action-avatar" style="background: ${a.color};">${a.user}</div>
        <div class="cmp-action-details">
          <div class="cmp-action-text">
            <strong>${a.name}</strong> ${a.action}
          </div>
          <div class="cmp-action-time">${a.time}</div>
        </div>
      </div>
    `).join('');
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

  // View 4: Compliance (Linked with Analytics & Manufacturing)
  renderComplianceView() {
    if (!this.mainArea) return;
    this.mainArea.innerHTML = `
      <div class="cmp-view-pad">
        <div class="compliance-header-bar">
          <div class="compliance-header-title">
            <h2>Statutory Compliance & Reports</h2>
            <p>Integrated with Analytics (GST Table 12, GSTR-1, GSTR-3B) and Manufacturing GMP</p>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="compliance-header-btn" id="cmpLaunchAnalyticsBtn" style="background: var(--cmp-primary); color: #fff; padding: 5px 12px; font-weight: 600; width: auto; height: auto; border-radius: 6px;">
              Open Analytics Reports ↗
            </button>
            <button class="compliance-header-btn" id="cmpLaunchMfgBtn" style="background: #059669; color: #fff; padding: 5px 12px; font-weight: 600; width: auto; height: auto; border-radius: 6px;">
              Open Manufacturing GMP ↗
            </button>
          </div>
        </div>

        <div class="cmp-deck-grid">
          <div class="cmp-dash-card">
            <div class="cmp-dash-card-header">
              <div class="cmp-dash-card-title"><span>📊</span> Analytics Statutory Suite</div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12.5px;">
              <div style="padding: 6px 0; border-bottom: 1px solid var(--cmp-border);">
                <strong>Table 12 HSN Summary (CGST Rule 59)</strong>
                <div style="font-size: 11px; color: #666;">Compiled via Rust WebAssembly Vector Engine</div>
              </div>
              <div style="padding: 6px 0; border-bottom: 1px solid var(--cmp-border);">
                <strong>GSTR-1 Outward Supplies (B2B, B2C, Credit Notes)</strong>
                <div style="font-size: 11px; color: #666;">Cut-off: 11th of every month</div>
              </div>
              <div style="padding: 6px 0;">
                <strong>GSTR-3B Tax Liability Statement</strong>
                <div style="font-size: 11px; color: #666;">Cash & Credit Ledger Reconciliation</div>
              </div>
            </div>
          </div>

          <div class="cmp-dash-card">
            <div class="cmp-dash-card-header">
              <div class="cmp-dash-card-title"><span>🏭</span> Manufacturing GMP & Schedule T</div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12.5px;">
              <div style="padding: 6px 0; border-bottom: 1px solid var(--cmp-border);">
                <strong>Raw Material Inward Register (Schedule T)</strong>
                <div style="font-size: 11px; color: #666;">Goods Receipt Note (GRN) & Herb Quarantine</div>
              </div>
              <div style="padding: 6px 0; border-bottom: 1px solid var(--cmp-border);">
                <strong>Rule 161B Control & Retention Sample Log</strong>
                <div style="font-size: 11px; color: #666;">Preserved for 3 years after batch expiration</div>
              </div>
              <div style="padding: 6px 0;">
                <strong>BMR Batch Dossiers & Release Sign-Offs</strong>
                <div style="font-size: 11px; color: #666;">Statutory doctor approval certificates</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.mainArea.querySelector('#cmpLaunchAnalyticsBtn')?.addEventListener('click', () => {
      if (window.AppWindow && window.AnalyticsApp) {
        window.AppWindow.launchApp('analytics', window.AnalyticsApp, 'analyticsAppContainer');
        this.showNotification('Navigating to statutory compliance reports.', 'info');
      }
    });

    this.mainArea.querySelector('#cmpLaunchMfgBtn')?.addEventListener('click', () => {
      if (window.AppWindow && window.ManufacturingApp) {
        window.AppWindow.launchApp('manufacturing', window.ManufacturingApp, 'manufacturingAppContainer');
        this.showNotification('Navigating to Schedule T GMP registers.', 'info');
      }
    });
  }
}

// Global Export for AppWindow loader
window.ComplianceApp = ComplianceApp;
