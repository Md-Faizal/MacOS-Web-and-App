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
      { user: 'DM', name: 'Dr. Debabrata Mishra', action: 'Approved and signed off Schedule T BMR Batch #UC-2026-08', time: '14m ago', color: '#10b981' },
      { user: 'AT', name: 'Vaidya Ananya Tripathy', action: 'Uploaded Analytical CoA for Dashamularishta herb batch', time: '1h ago', color: '#3b82f6' },
      { user: 'AD', name: 'System Admin', action: 'Updated worker access permissions for priyanka@utkalchemical.com', time: '3h ago', color: '#8b5cf6' },
      { user: 'RB', name: 'Ramesh Barik', action: 'Completed boiler sanitization log under SOP-MFG-004', time: 'Yesterday', color: '#f59e0b' },
      { user: 'FA', name: 'Finance / Accounts', action: 'Generated HSN Table 12 CSV via Rust Vector Engine', time: '2d ago', color: '#06b6d4' }
    ];

    this.searchCatalog = [
      { title: 'Dr. Debabrata Mishra', category: 'Staff', sub: 'Chief Ayurvedic Medical Officer (BAMS-OR-4521)', icon: '🩺' },
      { title: 'Vaidya Ananya Tripathy', category: 'Staff', sub: 'QC Head & Approved Chemist (QC-784)', icon: '⚗️' },
      { title: 'Ramesh Chandra Barik', category: 'Staff', sub: 'Senior Boiler Operator (Factory)', icon: '🏭' },
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
    // Holy Bible Document Vault Explorer Sub-Module
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
    }
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
