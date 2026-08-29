/**
 * BillingDashboard - Dashboard view for billing application
 * Manages key metrics, sales data, top performers, and payment reminders
 * Theme: Ledger (Black/White with Courier New monospace font)
 */

class BillingDashboard {
  constructor(billingApp) {
    this.billingApp = billingApp;
    this.viewContainer = billingApp.viewContainer;
    this.injectDashboardStyles();

    // Load persisted filters for Key Metrics
    this.metricsPreset = localStorage.getItem('dashboard_metrics_preset') || 'all';
    this.metricsStartDateVal = localStorage.getItem('dashboard_metrics_start') || '';
    this.metricsEndDateVal = localStorage.getItem('dashboard_metrics_end') || '';

    // Load persisted filters for Average Bill Chart
    this.avgChartPreset = localStorage.getItem('dashboard_avg_preset') || '30-days';
    this.avgStartDateVal = localStorage.getItem('dashboard_avg_start') || '';
    this.avgEndDateVal = localStorage.getItem('dashboard_avg_end') || '';

    // Load widget layout config
    const savedLayout = localStorage.getItem('dashboard_widget_layout');
    if (savedLayout) {
      try {
        this.widgetLayout = JSON.parse(savedLayout);
      } catch (e) {
        this.setDefaultLayout();
      }
    } else {
      this.setDefaultLayout();
    }
  }

  setDefaultLayout() {
    this.widgetLayout = [
      { id: 'key-metrics', title: '█ Key Metrics', visible: true },
      { id: 'order-metrics', title: '█ Order Metrics', visible: true },
      { id: 'sales-analytics', title: '📊 Sales Analytics', visible: true },
      { id: 'top-performers', title: '★ Top Performers', visible: true },
      { id: 'payment-reminders', title: '⚠️ Payment Reminders', visible: true }
    ];
  }

  get billingData() {
    return this.billingApp.billingData || { bills: [], payments: [], contacts: [], reminders: [] };
  }

  /**
   * Render the main dashboard view with dynamic widget layout order and Drag & Drop Customisation
   */
  async render() {
    // Reload layout configuration from localStorage to ensure it is fresh
    const savedLayout = localStorage.getItem('dashboard_widget_layout');
    if (savedLayout) {
      try {
        this.widgetLayout = JSON.parse(savedLayout);
      } catch (e) {
        this.setDefaultLayout();
      }
    } else {
      this.setDefaultLayout();
    }

    // Build the "Re-add widgets" panel if in edit mode and there are hidden widgets
    let readdPanelHTML = '';
    if (window.dashboardEditMode) {
      const hiddenWidgets = this.widgetLayout.filter(w => !w.visible);
      if (hiddenWidgets.length > 0) {
        const buttons = hiddenWidgets.map(w => `
          <button class="topbar-action-btn" onclick="window.currentDashboard.readdWidget('${w.id}')" style="padding: 4px 10px; font-size: 10px; margin-right: 8px; border: 1px solid #10b981; color: #10b981; background: transparent; cursor: pointer; border-radius: 4px; height: auto; min-width: auto;">
            + Add ${w.title.replace(/[^\w\s⚠️📊★█]/g, '').trim()}
          </button>
        `).join('');
        readdPanelHTML = `
          <div class="readd-widgets-panel" style="padding: 14px; background: rgba(255, 255, 255, 0.02); border: 2px dashed rgba(255, 255, 255, 0.15); border-radius: 6px; margin-bottom: 20px; font-family: 'Courier New', monospace;">
            <div style="font-size: 10px; font-weight: bold; color: #888888; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">✙ Re-add Removed Tiles</div>
            <div style="display: flex; flex-wrap: wrap; gap: 8px;">
              ${buttons}
            </div>
          </div>
        `;
      }
    }

    const sectionsHTML = this.widgetLayout
      .map(widget => {
        if (!widget.visible) return '';
        const editModeWrapperStyle = window.dashboardEditMode
          ? 'border: 2px dashed rgba(255, 255, 255, 0.25); border-radius: 6px; padding: 16px; margin-bottom: 24px; cursor: move; position: relative; transition: all 0.2s ease; background: rgba(255,255,255,0.01);'
          : '';

        const removeButtonHTML = window.dashboardEditMode
          ? `<button class="remove-widget-btn" onclick="window.currentDashboard.removeWidget('${widget.id}')" style="margin-left: 12px; background: transparent; border: 1px solid #ef4444; color: #ef4444; font-size: 9px; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-family: 'Courier New', monospace; text-transform: uppercase; font-weight: bold; transition: all 0.2s ease; min-width: auto; height: auto;">✕ Remove</button>`
          : '';

        switch (widget.id) {
          case 'key-metrics':
            return `
              <div class="dashboard-widget-wrapper" data-widget-id="key-metrics" style="${editModeWrapperStyle}">
                <div class="section-header-flex" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                  <div style="display: flex; align-items: center;">
                    <h3 style="font-size: 11px; font-weight: 900; color: #ffffff; margin: 0; text-transform: uppercase; letter-spacing: 0.8px; opacity: 0.7; display: flex; align-items: center; gap: 8px;">█ Key Metrics</h3>
                    ${removeButtonHTML}
                  </div>
                  <div class="metrics-filter-bar">
                    <span class="filter-label">Period:</span>
                    <select id="metricsPreset" class="metrics-select" onchange="window.currentDashboard.handlePresetChange(this.value)">
                      <option value="all">All Time</option>
                      <option value="this-month">This Month</option>
                      <option value="last-month">Last Month</option>
                      <option value="this-quarter">This Quarter</option>
                      <option value="this-year">This Year</option>
                      <option value="custom">Custom Range</option>
                    </select>
                    <div id="metricsCustomInputs" class="custom-date-inputs" style="display: none;">
                      <input type="date" id="metricsStart" class="date-input" onchange="window.currentDashboard.handleCustomDateChange()">
                      <span class="date-sep">to</span>
                      <input type="date" id="metricsEnd" class="date-input" onchange="window.currentDashboard.handleCustomDateChange()">
                    </div>
                  </div>
                </div>
                <div class="dashboard-cards-grid" id="dashboardStats" style="margin-top: 12px;"></div>
              </div>
            `;
          case 'order-metrics':
            return `
              <div class="dashboard-widget-wrapper" data-widget-id="order-metrics" style="${editModeWrapperStyle}">
                <div style="display: flex; align-items: center; margin: 20px 0 12px 0;">
                  <h3 style="font-size: 11px; font-weight: 900; color: #ffffff; margin: 0; text-transform: uppercase; letter-spacing: 0.8px; opacity: 0.7; display: flex; align-items: center; gap: 8px;">█ Order Metrics</h3>
                  ${removeButtonHTML}
                </div>
                <div class="dashboard-cards-grid" id="dashboardOrderStats"></div>
              </div>
            `;
          case 'sales-analytics':
            return `
              <div class="dashboard-widget-wrapper" data-widget-id="sales-analytics" style="${editModeWrapperStyle}">
                <div style="display: flex; align-items: center; margin: 20px 0 12px 0;">
                  <h3 style="font-size: 11px; font-weight: 900; color: #ffffff; margin: 0; text-transform: uppercase; letter-spacing: 0.8px; opacity: 0.7;">📊 Sales Analytics</h3>
                  ${removeButtonHTML}
                </div>
                <div class="chart-wrapper" id="dashboardCharts"></div>
              </div>
            `;
          case 'top-performers':
            return `
              <div class="dashboard-widget-wrapper" data-widget-id="top-performers" style="${editModeWrapperStyle}">
                <div style="display: flex; align-items: center; margin: 20px 0 12px 0;">
                  <h3 style="font-size: 11px; font-weight: 900; color: #ffffff; margin: 0; text-transform: uppercase; letter-spacing: 0.8px; opacity: 0.7;">★ Top Performers</h3>
                  ${removeButtonHTML}
                </div>
                <div class="dashboard-cards-grid" id="dashboardPerformers"></div>
              </div>
            `;
          case 'payment-reminders':
            return `
              <div class="dashboard-widget-wrapper" data-widget-id="payment-reminders" style="${editModeWrapperStyle}">
                <div style="display: flex; align-items: center; margin: 20px 0 12px 0;">
                  <h3 style="font-size: 11px; font-weight: 900; color: #ffffff; margin: 0; text-transform: uppercase; letter-spacing: 0.8px; opacity: 0.7;">⚠️ Payment Reminders</h3>
                  ${removeButtonHTML}
                </div>
                <div class="reminders-container" id="dashboardReminders"></div>
              </div>
            `;
          default:
            return '';
        }
      })
      .join('');

    this.viewContainer.innerHTML = `
      <div class="dashboard-container">
        <div class="dashboard-topbar">
          <div class="topbar-left">
            <div class="topbar-title">◆ DASHBOARD</div>
          </div>

          <div class="topbar-ticker" id="topbarTicker" aria-live="polite"></div>

          <div class="topbar-right" id="topbarActions"></div>
        </div>

        <div class="dashboard-content">
          ${readdPanelHTML}
          ${sectionsHTML}
        </div>
      </div>
    `;

    await this.renderDashboard();
    this.updateTopBar();
    this.setupTopbarScrollListener();
    if (!this.topbarInterval) {
      this.topbarInterval = setInterval(() => this.updateTopBar(), 1000);
    }

    // Attach HTML5 native drag and drop listeners
    if (window.dashboardEditMode) {
      const wrappers = this.viewContainer.querySelectorAll('.dashboard-widget-wrapper');
      wrappers.forEach(wrapper => {
        wrapper.setAttribute('draggable', 'true');

        wrapper.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', wrapper.getAttribute('data-widget-id'));
          wrapper.style.opacity = '0.4';
          wrapper.style.border = '2px dashed #ffffff';
        });

        wrapper.addEventListener('dragend', (e) => {
          wrapper.style.opacity = '1';
          wrappers.forEach(w => {
            w.style.borderTop = 'none';
            w.style.borderBottom = 'none';
            w.style.border = '2px dashed rgba(255, 255, 255, 0.25)';
          });
        });

        wrapper.addEventListener('dragover', (e) => {
          e.preventDefault();
          const rect = wrapper.getBoundingClientRect();
          const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
          wrappers.forEach(w => {
            w.style.borderTop = 'none';
            w.style.borderBottom = 'none';
            w.style.border = '2px dashed rgba(255, 255, 255, 0.25)';
          });
          if (next) {
            wrapper.style.borderBottom = '4px solid #ffffff';
          } else {
            wrapper.style.borderTop = '4px solid #ffffff';
          }
        });

        wrapper.addEventListener('dragleave', (e) => {
          wrapper.style.borderTop = 'none';
          wrapper.style.borderBottom = 'none';
          wrapper.style.border = '2px dashed rgba(255, 255, 255, 0.25)';
        });

        wrapper.addEventListener('drop', (e) => {
          e.preventDefault();
          const dragId = e.dataTransfer.getData('text/plain');
          const dropId = wrapper.getAttribute('data-widget-id');
          if (dragId === dropId) return;

          const dragIndex = this.widgetLayout.findIndex(w => w.id === dragId);
          const dropIndex = this.widgetLayout.findIndex(w => w.id === dropId);

          if (dragIndex !== -1 && dropIndex !== -1) {
            const [removed] = this.widgetLayout.splice(dragIndex, 1);
            this.widgetLayout.splice(dropIndex, 0, removed);
            localStorage.setItem('dashboard_widget_layout', JSON.stringify(this.widgetLayout));
            this.animateFLIP('.dashboard-content', '.dashboard-widget-wrapper', () => this.render());
          }
        });
      });
    }
  }

  toggleEditMode() {
    window.dashboardEditMode = !window.dashboardEditMode;
    this.render();
  }

  removeWidget(widgetId) {
    const widget = this.widgetLayout.find(w => w.id === widgetId);
    if (widget) {
      widget.visible = false;
      localStorage.setItem('dashboard_widget_layout', JSON.stringify(this.widgetLayout));
      this.render();
    }
  }

  readdWidget(widgetId) {
    const widget = this.widgetLayout.find(w => w.id === widgetId);
    if (widget) {
      widget.visible = true;
      localStorage.setItem('dashboard_widget_layout', JSON.stringify(this.widgetLayout));
      this.render();
    }
  }

  /**
   * Update the dynamic top bar with current time and date
   */
  updateTopBar() {
    const container = document.getElementById('topbarActions');
    if (!container) return;

    // Single toggle button to open quick actions sidebar and customize layout reordering
    container.innerHTML = `
      <button id="customizeLayoutBtn" class="topbar-action-btn" style="margin-right: 8px; border-color: ${window.dashboardEditMode ? '#10b981' : '#ffffff'}; color: ${window.dashboardEditMode ? '#10b981' : '#ffffff'};" onclick="window.currentDashboard.toggleEditMode()">
        <span>${window.dashboardEditMode ? '✔' : '⚙'}</span><span>${window.dashboardEditMode ? ' Save Layout' : ' Customize Layout'}</span>
      </button>
      <button id="quickActionsBtn" class="topbar-action-btn" aria-expanded="false" onclick="window.currentDashboard.toggleQuickActionsSidebar(true)">
        <span>☰</span><span> Quick Actions</span>
      </button>
    `;

    // Prepare sidebar content
    const actions = [
      { label: '+ Make Bill', action: 'makeBill', icon: '✎' },
      { label: '✏ Edit Bill', action: 'editBill', icon: '✏' },
      { label: '💰 Make Payment', action: 'makePayment', icon: '✓' },
      { label: '📋 Payment List', action: 'paymentsList', icon: '▲' },
      { label: '🧾 New Orders', action: 'ordersView', icon: '█' },
      { label: '📊 Ledger View', action: 'ledgerView', icon: '█' },
      { label: '📈 Analytics', action: 'analytics', icon: '◆' }
    ];

    this.renderQuickActionsSidebar(actions);
  }

  /**
   * Render quick actions sidebar markup (creates DOM once)
   */
  renderQuickActionsSidebar(actions = []) {
    if (document.getElementById('quickActionsSidebar')) return;

    const container = this.viewContainer || document.body;

    const overlay = document.createElement('div');
    overlay.id = 'quickActionsOverlay';
    overlay.className = 'quickactions-overlay';
    overlay.onclick = () => window.currentDashboard.toggleQuickActionsSidebar(false);

    const aside = document.createElement('aside');
    aside.id = 'quickActionsSidebar';
    aside.className = 'quickactions-sidebar';
    aside.setAttribute('role', 'dialog');
    aside.setAttribute('aria-hidden', 'true');

    const header = document.createElement('div');
    header.className = 'qa-header';
    header.innerHTML = `<h3>Quick Actions</h3><button class="qa-close" aria-label="Close" onclick="window.currentDashboard.toggleQuickActionsSidebar(false)">✕</button>`;

    const list = document.createElement('div');
    list.className = 'qa-actions';
    list.innerHTML = actions.map(a => `
      <button class="qa-action-btn" onclick="window.currentBillingApp.navigationHandler('${a.action}')">
        <span class="qa-icon">${a.icon}</span>
        <span class="qa-label">${a.label}</span>
      </button>
    `).join('');

    aside.appendChild(header);
    aside.appendChild(list);

    container.appendChild(overlay);
    container.appendChild(aside);
  }

  /**
   * Toggle quick actions sidebar open/close
   */
  toggleQuickActionsSidebar(open = true) {
    const aside = document.getElementById('quickActionsSidebar');
    const overlay = document.getElementById('quickActionsOverlay');
    const btn = document.getElementById('quickActionsBtn');
    if (!aside || !overlay) return;

    if (open) {
      aside.classList.add('open');
      overlay.classList.add('visible');
      aside.setAttribute('aria-hidden', 'false');
      if (btn) btn.setAttribute('aria-expanded', 'true');
    } else {
      aside.classList.remove('open');
      overlay.classList.remove('visible');
      aside.setAttribute('aria-hidden', 'true');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  }

  /**
   * Main render function to populate all dashboard sections
   */
  async renderDashboard() {
    try {
      window.currentBillingApp = this.billingApp;
      window.currentDashboard = this;  // Store dashboard instance for method calls

      // Ensure data is fresh
      if (this.billingApp.apiEnabled) {
        await this.billingApp.loadBillingDataFromAPI();
      }

      // Initialize filter values in DOM
      const presetEl = document.getElementById('metricsPreset');
      if (presetEl) {
        presetEl.value = this.metricsPreset;
        this.updateCustomInputsVisibility();
      }
      const startEl = document.getElementById('metricsStart');
      const endEl = document.getElementById('metricsEnd');
      if (startEl && this.metricsStartDateVal) startEl.value = this.metricsStartDateVal;
      if (endEl && this.metricsEndDateVal) endEl.value = this.metricsEndDateVal;

      // Render topbar actions
      this.renderTopbarActions();

      // Render key statistics
      this.renderKeyStatistics();

      // Render order statistics
      this.renderOrderStatistics();

      // Render sales metrics
      this.renderSalesMetrics();

      // Render top performers
      await this.renderTopPerformers();

      // Render reminders
      this.renderReminders();

      // Render and start topbar ticker
      this.renderTopbarTicker();
    } catch (error) {
      console.error('Error rendering dashboard:', error);
      this.viewContainer.innerHTML = `<div style="padding: 24px; color: #ef4444;">Error loading dashboard: ${error.message}</div>`;
    }
  }

  updateCustomInputsVisibility() {
    const customDiv = document.getElementById('metricsCustomInputs');
    if (customDiv) {
      customDiv.style.display = this.metricsPreset === 'custom' ? 'flex' : 'none';
    }
  }

  parseDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return dateStr;

    // Check if numeric timestamp
    if (typeof dateStr === 'number') return new Date(dateStr);
    if (typeof dateStr === 'string' && !isNaN(dateStr) && !isNaN(Number(dateStr))) {
      return new Date(Number(dateStr));
    }

    let s = String(dateStr).trim();
    // Replace space with T for SQLite datetime
    if (s.includes(' ') && !s.includes('T')) {
      s = s.replace(' ', 'T');
    }

    // Slash/dash formatted local dates
    if ((s.includes('/') || s.includes('-')) && !s.includes('T')) {
      const parts = s.split(/[\/\-]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          const year = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const day = parseInt(parts[2], 10);
          return new Date(year, month, day);
        } else {
          // DD/MM/YYYY or MM/DD/YYYY
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          return new Date(year, month, day);
        }
      }
    }

    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
    return null;
  }

  handlePresetChange(preset) {
    this.metricsPreset = preset;
    localStorage.setItem('dashboard_metrics_preset', preset);
    this.updateCustomInputsVisibility();

    if (preset !== 'custom') {
      this.metricsStartDateVal = '';
      this.metricsEndDateVal = '';
      localStorage.removeItem('dashboard_metrics_start');
      localStorage.removeItem('dashboard_metrics_end');
    } else {
      const startEl = document.getElementById('metricsStart');
      const endEl = document.getElementById('metricsEnd');
      if (startEl && endEl && !startEl.value && !endEl.value) {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        this.metricsStartDateVal = thirtyDaysAgo.toISOString().split('T')[0];
        this.metricsEndDateVal = now.toISOString().split('T')[0];
        startEl.value = this.metricsStartDateVal;
        endEl.value = this.metricsEndDateVal;
        localStorage.setItem('dashboard_metrics_start', this.metricsStartDateVal);
        localStorage.setItem('dashboard_metrics_end', this.metricsEndDateVal);
      }
    }
    this.renderKeyStatistics();
    this.renderOrderStatistics();
  }

  handleCustomDateChange() {
    const startEl = document.getElementById('metricsStart');
    const endEl = document.getElementById('metricsEnd');
    if (startEl && endEl) {
      this.metricsStartDateVal = startEl.value;
      this.metricsEndDateVal = endEl.value;
      localStorage.setItem('dashboard_metrics_start', this.metricsStartDateVal);
      localStorage.setItem('dashboard_metrics_end', this.metricsEndDateVal);
      this.renderKeyStatistics();
      this.renderOrderStatistics();
    }
  }

  getMetricsDateRange() {
    const now = new Date();
    let startDate = null;
    let endDate = null;

    switch (this.metricsPreset) {
      case 'this-month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case 'last-month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      case 'this-quarter':
        const currentQuarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
        endDate = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0, 23, 59, 59, 999);
        break;
      case 'this-year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      case 'custom':
        if (this.metricsStartDateVal) {
          startDate = this.parseDate(this.metricsStartDateVal);
          if (startDate) startDate.setHours(0, 0, 0, 0);
        }
        if (this.metricsEndDateVal) {
          endDate = this.parseDate(this.metricsEndDateVal);
          if (endDate) endDate.setHours(23, 59, 59, 999);
        }
        break;
      default:
        break;
    }
    return { startDate, endDate };
  }

  formatDateRangeText(startDate, endDate, earliestBillDate) {
    const formatD = (d) => {
      if (!d) return '';
      const options = { day: '2-digit', month: 'short', year: 'numeric' };
      return d.toLocaleDateString('en-IN', options);
    };

    if (!startDate && !endDate) {
      const start = earliestBillDate ? formatD(earliestBillDate) : 'Beginning';
      const end = formatD(new Date());
      return `From ${start} to ${end}`;
    }

    const start = startDate ? formatD(startDate) : (earliestBillDate ? formatD(earliestBillDate) : 'Beginning');
    const end = endDate ? formatD(endDate) : formatD(new Date());
    return `From ${start} to ${end}`;
  }

  isWorkerUser() {
    return (window.currentUserData?.role || sessionStorage.getItem('macos_user_role') || localStorage.getItem('macos_user_role')) === 'worker';
  }

  formatINR(value) {
    return '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  /**
   * Render topbar ticker - cycles concise stats and reminders text
   */
  renderTopbarTicker() {
    const tickerEl = document.getElementById('topbarTicker');
    if (!tickerEl) return;
    // Build enhanced items: totals, counts, top performer, avg, overdue payment reminders
    // Filter data to exclude customers marked for exclusion (unless worker)
    const isWorker = this.isWorkerUser();
    const excludedContactIds = isWorker ? new Set() : new Set(
      (this.billingData.contacts || [])
        .filter(c => c.exclude_from_stats === 1)
        .map(c => c.id)
    );

    const contacts = this.billingData.contacts || [];
    const payments = this.billingData.payments || [];
    const bills = ((this.billingData && Array.isArray(this.billingData.bills)) ? this.billingData.bills : [])
      .filter(b => !excludedContactIds.has(b.customer_id));
    const reminders = ((this.billingData && Array.isArray(this.billingData.reminders)) ? this.billingData.reminders : [])
      .filter(r => {
        const contact = contacts.find(c => c.name === (r.customer || r.name));
        return !contact || (contact.exclude_from_stats !== 1 && contact.exclude_from_stats !== '1');
      });

    const statsBills = bills.filter(b => {
      const contact = contacts.find(c => c.id === b.customer_id); // Use customer_id for bills
      return !contact || (contact.exclude_from_stats !== 1 && contact.exclude_from_stats !== '1');
    });
    const statsPayments = payments.filter(p => {
      const contact = contacts.find(c => c.id === p.customer_id); // Use customer_id for payments
      return !contact || (contact.exclude_from_stats !== 1 && contact.exclude_from_stats !== '1');
    });

    // Compute simple aggregates using FIFO settlement to determine unpaid invoices
    const totalBills = statsBills.length;
    const totalRevenue = statsBills.reduce((s, b) => s + (Number(b.amount) || Number(b.total) || 0), 0);

    // Group bills and payments by customer_id
    const customerBills = {};
    const customerPayments = {};

    statsBills.forEach(b => {
      if (!customerBills[b.customer_id]) customerBills[b.customer_id] = [];
      customerBills[b.customer_id].push(b);
    });

    statsPayments.forEach(p => {
      if (!customerPayments[p.customer_id]) customerPayments[p.customer_id] = [];
      customerPayments[p.customer_id].push(p);
    });

    const contactMap = {};
    contacts.forEach(c => {
      contactMap[c.id] = c;
    });

    let unpaidCount = 0;

    Object.keys(customerBills).forEach(custId => {
      const cBills = customerBills[custId];
      const cPayments = customerPayments[custId] || [];
      const contact = contactMap[custId];
      const openingBalance = contact ? parseFloat(contact.opening_balance || 0) : 0;

      // Sort chronologically
      const sortedBills = [...cBills].sort((a, b) => {
        const dateA = this.parseDate(a.bill_date || a.created_at);
        const dateB = this.parseDate(b.bill_date || b.created_at);
        return (dateA || 0) - (dateB || 0);
      });

      const sortedPayments = [...cPayments].sort((a, b) => {
        const dateA = this.parseDate(a.payment_date || a.created_at);
        const dateB = this.parseDate(b.payment_date || b.created_at);
        return (dateA || 0) - (dateB || 0);
      });

      const pQueue = sortedPayments.map(p => ({
        id: p.id,
        total: parseFloat(p.amount || p.credit_amount || 0),
        remaining: parseFloat(p.amount || p.credit_amount || 0)
      }));

      let availableCredit = 0;
      let debtToSettleFirst = 0;

      if (openingBalance < 0) {
        availableCredit = Math.abs(openingBalance);
      } else {
        debtToSettleFirst = openingBalance;
      }

      while (debtToSettleFirst > 0 && pQueue.length > 0) {
        const p = pQueue[0];
        const consumed = Math.min(debtToSettleFirst, p.remaining);
        debtToSettleFirst -= consumed;
        p.remaining -= consumed;
        if (p.remaining <= 0) pQueue.shift();
      }

      sortedBills.forEach(bill => {
        const billAmount = parseFloat(bill.total || 0);
        let remainingToSettle = billAmount;

        if (availableCredit > 0) {
          const consumed = Math.min(remainingToSettle, availableCredit);
          remainingToSettle -= consumed;
          availableCredit -= consumed;
        }

        while (remainingToSettle > 0 && pQueue.length > 0) {
          const p = pQueue[0];
          const consumed = Math.min(remainingToSettle, p.remaining);
          remainingToSettle -= consumed;
          p.remaining -= consumed;
          if (p.remaining <= 0) pQueue.shift();
        }

        if (remainingToSettle > 0.01) {
          unpaidCount++;
        }
      });
    });

    const avgBill = totalBills ? (totalRevenue / totalBills) : 0;

    // Last payment
    let lastPaymentText = 'No payments';
    try {
      const paid = bills.filter(b => b.paid && (b.paidDate || b.date)).sort((a, c) => new Date(c.paidDate || c.date) - new Date(a.paidDate || a.date));
      if (paid.length) {
        const p = paid[0];
        lastPaymentText = `${p.customer || p.name || 'Customer'} ₹${(Number(p.amount || p.total) || 0).toFixed(0)}`;
      }
    } catch (e) { /* ignore */ }

    // Top performer
    let topPerformerText = 'No top performer';
    if (bills.length) {
      const map = {};
      bills.forEach(b => { const who = b.customer || b.name || 'Unknown'; map[who] = (map[who] || 0) + (Number(b.amount || b.total) || 0); });
      const top = Object.entries(map).sort((a, b) => b[1] - a[1])[0];
      if (top) topPerformerText = `${top[0]} ₹${(top[1] || 0).toFixed(0)}`;
    }

    const items = [];
    items.push({ text: `<strong>Total Revenue:</strong> ₹${totalRevenue.toFixed(0)}`, target: 'charts' });
    items.push({ text: `<strong>Total Bills:</strong> ${totalBills}`, target: 'stats' });
    items.push({ text: `<strong>Unpaid Invoices:</strong> ${unpaidCount}`, target: 'reminders' });
    items.push({ text: `<strong>Avg Bill:</strong> ₹${avgBill.toFixed(0)}`, target: 'charts' });
    items.push({ text: `<strong>Last Payment:</strong> ${lastPaymentText}`, target: 'reminders' });
    items.push({ text: `<strong>Top Performer:</strong> ${topPerformerText}`, target: 'performers' });

    // Add existing reminders array entries
    reminders.slice(0, 2).forEach(r => {
      const who = r.customer || r.name || 'Customer';
      const amount = r.amount ? `₹${Number(r.amount).toFixed(0)}` : '';
      const due = r.dueDate ? `${r.dueDate}` : (r.daysDue ? `${r.daysDue}d` : 'due soon');
      items.push({ text: `<strong>Reminder:</strong> ${who} ${amount} ${due}`.trim(), target: 'reminders' });
    });

    // Add overdue bills (payment reminders) from getOverdueBills()
    try {
      const overdue = (typeof this.getOverdueBills === 'function') ? this.getOverdueBills() : [];
      overdue.slice(0, 4).forEach(b => {
        const who = b.customer || b.customer_name || 'Customer';
        const amount = b.remaining ? `₹${Number(b.remaining).toFixed(0)}` : (b.amount ? `₹${Number(b.amount).toFixed(0)}` : '');
        const days = b.daysOverdue || 0;
        items.push({ text: `<strong>PAYMENT DUE:</strong> ${who} ${amount} • ${days}d overdue`, target: 'reminders', action: { type: 'pay', customer: who, billId: b.billId || b.reference_no } });
      });
    } catch (e) { /* ignore */ }

    if (!items.length) items.push({ text: '<strong>No active stats or reminders</strong>', target: null });

    // Instance state
    this._tickerItems = items;
    this._tickerIndex = 0;

    // Clear previous interval if any
    if (this._tickerIntervalId) { clearInterval(this._tickerIntervalId); this._tickerIntervalId = null; }

    // Render initial
    tickerEl.innerHTML = `<span class="ticker-item">${this._tickerItems[this._tickerIndex].text}</span>`;
    tickerEl.style.cursor = 'pointer';

    const showNext = () => {
      const current = tickerEl.querySelector('.ticker-item');
      if (!current) return;
      current.classList.add('fade-out');
      setTimeout(() => {
        this._tickerIndex = (this._tickerIndex + 1) % this._tickerItems.length;
        tickerEl.innerHTML = `<span class="ticker-item">${this._tickerItems[this._tickerIndex].text}</span>`;
      }, 250);
    };

    // Start interval
    this._tickerIntervalId = setInterval(() => showNext(), 4000);

    // Pause/resume on hover
    tickerEl.addEventListener('mouseenter', () => {
      if (this._tickerIntervalId) { clearInterval(this._tickerIntervalId); this._tickerIntervalId = null; }
    });
    tickerEl.addEventListener('mouseleave', () => {
      if (!this._tickerIntervalId) this._tickerIntervalId = setInterval(() => showNext(), 4000);
    });

    // Click to either navigate or trigger payment action
    tickerEl.addEventListener('click', () => {
      const item = this._tickerItems[this._tickerIndex];
      if (!item) return;
      // If action defined, perform it
      if (item.action && item.action.type === 'pay') {
        if (window.currentBillingApp && typeof window.currentBillingApp.navigationHandler === 'function') {
          window.currentBillingApp.navigationHandler('makePayment', item.action.customer || item.action.billId || '');
        }
        // pause ticker
        if (this._tickerIntervalId) { clearInterval(this._tickerIntervalId); this._tickerIntervalId = null; }
        return;
      }
      // Otherwise scroll to section
      if (item.target) {
        const map = { stats: 'dashboardStats', charts: 'dashboardCharts', reminders: 'dashboardReminders', performers: 'dashboardPerformers' };
        const elId = map[item.target];
        const targetEl = elId ? document.getElementById(elId) : null;
        if (targetEl) {
          const contentEl = document.querySelector('.dashboard-content');
          if (contentEl) {
            // Scroll only the content area, not the whole window
            const offsetTop = targetEl.offsetTop - contentEl.offsetTop;
            contentEl.scrollTo({ top: offsetTop, behavior: 'smooth' });
          }
        }
        if (this._tickerIntervalId) { clearInterval(this._tickerIntervalId); this._tickerIntervalId = null; }
      }
    });
  }

  /**
   * Setup scroll listener for topbar hide/show functionality
   */
  setupTopbarScrollListener() {
    const topbar = document.querySelector('.dashboard-topbar');
    const content = document.querySelector('.dashboard-content');

    if (!topbar || !content) return;

    let lastScrollTop = 0;

    content.addEventListener('scroll', () => {
      const currentScroll = content.scrollTop;

      // Hide topbar when scrolling down more than 50px
      if (currentScroll > lastScrollTop && currentScroll > 50) {
        topbar.classList.add('hidden');
      } else {
        topbar.classList.remove('hidden');
      }

      lastScrollTop = currentScroll;
    });
  }

  /**
   * Render topbar action buttons
   */
  renderTopbarActions() {
    const container = document.getElementById('topbarActions');

    const actions = [
      {
        label: '+ Make Bill',
        action: 'makeBill',
        icon: '✎'
      },
      {
        label: '✏ Edit Bill',
        action: 'editBill',
        icon: '✏'
      },
      {
        label: '💰 Payment',
        action: 'makePayment',
        icon: '✓'
      },
      {
        label: '📋 Payments',
        action: 'paymentsList',
        icon: '▲'
      },
      {
        label: '📊 Ledger',
        action: 'ledgerView',
        icon: '█'
      },
      {
        label: '📈 Analytics',
        action: 'analytics',
        icon: '◆'
      }
    ];

    container.innerHTML = actions.map(action => `
      <button class="topbar-action-btn" onclick="window.currentBillingApp.navigationHandler('${action.action}')">
        <span>${action.icon}</span>
        <span>${action.label}</span>
      </button>
    `).join('');
  }

  /**
   * Render quick shortcut buttons to navigate to other sections
   */
  renderQuickShortcuts() {
    const container = document.getElementById('dashboardShortcuts');

    const shortcuts = [
      {
        label: '+ Make Bill',
        action: 'makeBill',
        icon: '✎',
        primary: true
      },
      {
        label: '✏ Edit Bill',
        action: 'editBill',
        icon: '✏'
      },
      {
        label: '💰 Make Payment',
        action: 'makePayment',
        icon: '✓'
      },
      {
        label: '📋 Payment List',
        action: 'paymentsList',
        icon: '▲'
      },
      {
        label: '📊 Ledger View',
        action: 'ledgerView',
        icon: '█'
      },
      {
        label: '📈 Analytics',
        action: 'analytics',
        icon: '◆'
      }
    ];

    container.innerHTML = shortcuts.map(shortcut => `
      <button class="shortcut-btn ${shortcut.primary ? 'primary' : ''}" onclick="window.currentBillingApp.navigationHandler('${shortcut.action}')">
        <span>${shortcut.icon}</span>
        <span>${shortcut.label}</span>
      </button>
    `).join('');
  }


  /**
   * Generic helper: renders stat cards into a container with Edit Mode support.
   * When window.dashboardEditMode is true:
   *  - Each card has a dashed border and an ✕ Remove button
   *  - Cards are draggable for reordering via HTML5 DnD
   *  - A "Re-add Cards" tray appears at the start of the container for hidden cards
   * Layout (order + visibility) is persisted in localStorage under `storageKey`.
   *
   * @param {HTMLElement} container - the DOM element to render into
   * @param {Array<{id:string,label:string,value:string,subtext:string,icon:string,highlight:boolean}>} allStats
   * @param {string} storageKey - unique localStorage key for this tile's card layout
   */
  /** Helper to load and normalize card layout configuration */
  getCardLayout(storageKey, defaultIds = []) {
    let cardLayout;
    try {
      const saved = localStorage.getItem(storageKey);
      cardLayout = saved ? JSON.parse(saved) : null;
    } catch (e) {
      cardLayout = null;
    }
    if (!cardLayout || !Array.isArray(cardLayout) || cardLayout.length === 0) {
      cardLayout = defaultIds.map(id => ({ id, visible: true }));
    } else {
      // Merge: ensure any new cards are added
      const existingIds = new Set(cardLayout.map(c => c.id));
      defaultIds.forEach(id => {
        if (!existingIds.has(id)) cardLayout.push({ id, visible: true });
      });
    }
    return cardLayout;
  }

  /** Performs a smooth FLIP animation for element lists */
  animateFLIP(containerSelector, itemSelector, actionFn) {
    const container = document.querySelector(containerSelector);
    if (!container) {
      actionFn();
      return;
    }

    const items = Array.from(container.querySelectorAll(itemSelector));
    const firstRects = items.map(el => {
      const id = el.getAttribute('data-widget-id') || el.getAttribute('data-card-id');
      return { id, rect: el.getBoundingClientRect() };
    });

    actionFn();

    requestAnimationFrame(() => {
      const newContainer = document.querySelector(containerSelector);
      if (!newContainer) return;
      const newItems = Array.from(newContainer.querySelectorAll(itemSelector));

      newItems.forEach(el => {
        const id = el.getAttribute('data-widget-id') || el.getAttribute('data-card-id');
        const first = firstRects.find(r => r.id === id);
        if (!first) return;

        const last = el.getBoundingClientRect();
        const dx = first.rect.left - last.left;
        const dy = first.rect.top - last.top;

        if (dx !== 0 || dy !== 0) {
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          el.style.transition = 'none';
          el.offsetHeight; // force reflow
          el.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
          el.style.transform = '';
        }
      });
    });
  }

  /**
   * Generic helper: renders stat cards into a container with Edit Mode support.
   * When window.dashboardEditMode is true:
   *  - Each card has a dashed border and an ✕ Remove button
   *  - Cards are draggable for reordering via HTML5 DnD
   *  - A "Re-add Cards" tray appears at the start of the container for hidden cards
   * Layout (order + visibility) is persisted in localStorage under `storageKey`.
   *
   * @param {HTMLElement} container - the DOM element to render into
   * @param {Array<{id:string,label:string,value:string,subtext:string,icon:string,highlight:boolean}>} allStats
   * @param {string} storageKey - unique localStorage key for this tile's card layout
   */
  renderCardsWithEditMode(container, allStats, storageKey) {
    const defaultIds = allStats.map(s => s.id);
    const cardLayout = this.getCardLayout(storageKey, defaultIds);

    // Apply the cardLayout order to allStats
    const orderedStats = [];
    cardLayout.forEach(cl => {
      const stat = allStats.find(s => s.id === cl.id);
      if (stat) orderedStats.push({ ...stat, visible: cl.visible });
    });

    const editMode = !!window.dashboardEditMode;

    // Build re-add tray for hidden cards (only in edit mode)
    let readdTrayHTML = '';
    if (editMode) {
      const hiddenCards = orderedStats.filter(s => !s.visible);
      if (hiddenCards.length > 0) {
        const btnHTML = hiddenCards.map(s => `
          <button onclick="window.currentDashboard.readdCard('${storageKey}', '${s.id}', ${JSON.stringify(defaultIds).replace(/"/g, '&quot;')})"
            style="padding: 3px 9px; font-size: 9px; background: transparent; border: 1px solid #10b981;
                   color: #10b981; cursor: pointer; border-radius: 4px; font-family: 'Courier New', monospace;
                   font-weight: bold; white-space: nowrap; height: auto; min-width: auto;">
            + ${s.label}
          </button>`).join('');
        readdTrayHTML = `
          <div style="grid-column: 1/-1; padding: 10px 12px; background: rgba(255,255,255,0.02);
                      border: 1.5px dashed rgba(255,255,255,0.12); border-radius: 6px;
                      font-family: 'Courier New', monospace; margin-bottom: 4px;">
            <div style="font-size: 9px; font-weight: bold; color: #555; text-transform: uppercase;
                        letter-spacing: 0.5px; margin-bottom: 6px;">✙ Restore cards</div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">${btnHTML}</div>
          </div>`;
      }
    }

    // Render visible cards
    const visibleCards = orderedStats.filter(s => s.visible);
    const cardStyle = editMode
      ? 'border: 2px dashed rgba(255,255,255,0.25); position: relative; cursor: move; transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);'
      : '';

    const removeBtn = (id) => editMode
      ? `<button onclick="window.currentDashboard.removeCard('${storageKey}', '${id}', ${JSON.stringify(defaultIds).replace(/"/g, '&quot;')})"
            style="position: absolute; top: 6px; right: 6px; background: transparent;
                   border: 1px solid #ef4444; color: #ef4444; font-size: 8px; padding: 2px 6px;
                   border-radius: 3px; cursor: pointer; font-family: 'Courier New', monospace;
                   font-weight: bold; z-index: 10; min-width: auto; height: auto;">✕</button>`
      : '';

    const cardsHTML = visibleCards.map(stat => `
      <div class="floating-card ${stat.highlight ? 'dark' : ''}"
           data-card-id="${stat.id}"
           data-storage-key="${storageKey}"
           style="${cardStyle}"
           ${editMode ? `draggable="true"
             ondragstart="event.dataTransfer.setData('card-drag','${stat.id}|${storageKey}'); this.style.opacity='0.4';"
             ondragend="this.style.opacity='1'; this.style.borderColor='rgba(255,255,255,0.25)';"
             ondragover="event.preventDefault(); this.style.borderColor='#ffffff';"
             ondragleave="this.style.borderColor='rgba(255,255,255,0.25)';"
             ondrop="event.preventDefault(); this.style.borderColor='rgba(255,255,255,0.25)'; window.currentDashboard.dropCard(event, '${stat.id}', '${storageKey}', ${JSON.stringify(defaultIds).replace(/"/g, '&quot;')});"` : ''}>
        ${removeBtn(stat.id)}
        <div class="card-header">
          <span class="card-icon">${stat.icon}</span>
          <span class="card-title">${stat.label}</span>
        </div>
        <div class="card-value">${stat.value}</div>
        <div class="card-subtext">${stat.subtext}</div>
        ${stat.rangeText ? `<div class="card-date-range" style="font-size: 9px; opacity: 0.65; margin-top: 6px; font-family: 'Courier New', monospace;">${stat.rangeText}</div>` : ''}
      </div>`).join('');

    container.innerHTML = readdTrayHTML + cardsHTML;
  }

  /** Remove an individual card from a tile and persist */
  removeCard(storageKey, cardId, defaultIds) {
    let cardLayout = this.getCardLayout(storageKey, defaultIds);
    const entry = cardLayout.find(c => c.id === cardId);
    if (entry) entry.visible = false;
    localStorage.setItem(storageKey, JSON.stringify(cardLayout));
    this.animateFLIP('#' + (storageKey === 'dashboard_key_metrics_cards' ? 'dashboardStats' : 'dashboardOrderStats'), '.floating-card', () => this.renderDashboard());
  }

  /** Re-add a previously removed card in a tile and persist */
  readdCard(storageKey, cardId, defaultIds) {
    let cardLayout = this.getCardLayout(storageKey, defaultIds);
    const entry = cardLayout.find(c => c.id === cardId);
    if (entry) entry.visible = true;
    localStorage.setItem(storageKey, JSON.stringify(cardLayout));
    this.animateFLIP('#' + (storageKey === 'dashboard_key_metrics_cards' ? 'dashboardStats' : 'dashboardOrderStats'), '.floating-card', () => this.renderDashboard());
  }

  /** Handle card drop reorder */
  dropCard(event, targetId, storageKey, defaultIds) {
    const raw = event.dataTransfer.getData('card-drag');
    if (!raw) return;
    const [dragId, dragKey] = raw.split('|');
    if (dragKey !== storageKey || dragId === targetId) return;

    let cardLayout = this.getCardLayout(storageKey, defaultIds);
    const dragIndex = cardLayout.findIndex(c => c.id === dragId);
    const dropIndex = cardLayout.findIndex(c => c.id === targetId);
    if (dragIndex === -1 || dropIndex === -1) return;

    const [removed] = cardLayout.splice(dragIndex, 1);
    cardLayout.splice(dropIndex, 0, removed);
    localStorage.setItem(storageKey, JSON.stringify(cardLayout));
    this.animateFLIP('#' + (storageKey === 'dashboard_key_metrics_cards' ? 'dashboardStats' : 'dashboardOrderStats'), '.floating-card', () => this.renderDashboard());
  }

  /**
   * Render key statistics cards with floating effect
   */
  renderKeyStatistics() {

    const container = document.getElementById('dashboardStats');
    if (!container) return;

    // Filter data to exclude customers marked for exclusion (unless worker)
    const isWorker = this.isWorkerUser();
    const excludedContactIds = isWorker ? new Set() : new Set(
      (this.billingData.contacts || [])
        .filter(c => c.exclude_from_stats === 1)
        .map(c => c.id)
    );

    const bills = (this.billingData.bills || []).filter(b => !excludedContactIds.has(b.customer_id));
    const payments = (this.billingData.payments || []).filter(p => !excludedContactIds.has(p.customer_id));
    const contacts = (this.billingData.contacts || []).filter(c => isWorker || c.exclude_from_stats !== 1);

    // Calculate dynamic range
    const { startDate, endDate } = this.getMetricsDateRange();

    // Find earliest bill date for all-time label helper
    let earliestBillDate = null;
    bills.forEach(b => {
      const date = this.parseDate(b.bill_date || b.created_at);
      if (date && (!earliestBillDate || date < earliestBillDate)) {
        earliestBillDate = date;
      }
    });

    const filteredBills = bills.filter(b => {
      const date = this.parseDate(b.bill_date || b.created_at);
      return date && (!startDate || date >= startDate) && (!endDate || date <= endDate);
    });

    const filteredPayments = payments.filter(p => {
      const date = this.parseDate(p.payment_date || p.created_at);
      return date && (!startDate || date >= startDate) && (!endDate || date <= endDate);
    });

    // Calculate metrics
    // Total Opening Balance = sum of all filtered customer opening balances
    const totalOpeningBalance = contacts.reduce((sum, c) => sum + (c.opening_balance || 0), 0);

    // Only include opening balance for "All Time" preset
    const includeOpeningBalance = (this.metricsPreset === 'all');
    const activeOpeningBalance = includeOpeningBalance ? totalOpeningBalance : 0;

    // Total Billed = sum of all invoices in range + opening balance
    const totalBilled = filteredBills.reduce((sum, b) => sum + (b.total || 0), 0) + activeOpeningBalance;

    // Total Collected = sum of all payments in range + sum of all credit notes in range
    const totalPaid = filteredPayments.reduce((sum, p) => {
      if (p.type === 'CREDIT_NOTE') {
        return sum + (p.credit_amount || 0);
      } else {
        return sum + (p.amount || 0);
      }
    }, 0);

    const totalDue = Math.max(0, totalBilled - totalPaid);
    const totalOverdue = this.calculateOverdueBills(filteredBills, filteredPayments);
    const totalCustomers = this.getUniqueCustomers(filteredBills, filteredPayments).length;
    const totalBills = filteredBills.length;

    const rangeText = this.formatDateRangeText(startDate, endDate, earliestBillDate);

    const stats = [
      {
        id: 'total-billed',
        label: 'Total Billed',
        value: this.formatINR(totalBilled),
        subtext: `${totalBills} bills`,
        icon: '💰',
        highlight: false,
        rangeText
      },
      {
        id: 'total-paid',
        label: 'Total Collected',
        value: this.formatINR(totalPaid),
        subtext: `${filteredPayments.length} payments`,
        icon: '✓',
        highlight: false,
        rangeText
      },
      {
        id: 'amount-due',
        label: 'Amount Due',
        value: this.formatINR(totalDue),
        subtext: 'To be collected',
        icon: '⏱',
        highlight: true,
        rangeText
      },
      {
        id: 'overdue-amount',
        label: 'Overdue Amount',
        value: this.formatINR(totalOverdue),
        subtext: 'Beyond 30 days',
        icon: '⚠',
        highlight: true,
        rangeText
      },
      {
        id: 'active-customers',
        label: 'Active Customers',
        value: totalCustomers,
        subtext: 'Unique customers',
        icon: '👥',
        highlight: false,
        rangeText
      },
      {
        id: 'collection-rate',
        label: 'Collection Rate',
        value: `${totalBilled > 0 ? ((totalPaid / totalBilled) * 100).toFixed(1) : 0}%`,
        subtext: 'Payment ratio',
        icon: '📈',
        highlight: false,
        rangeText
      }
    ];

    this.renderCardsWithEditMode(container, stats, 'dashboard_key_metrics_cards');
  }

  /**
   * Render sales metrics with switchable chart visualization
   */
  renderSalesMetrics() {
    const container = document.getElementById('dashboardCharts');
    if (!container) return;

    // Filter data to exclude customers marked for exclusion (unless worker)
    const isWorker = this.isWorkerUser();
    const excludedContactIds = isWorker ? new Set() : new Set(
      (this.billingData.contacts || [])
        .filter(c => c.exclude_from_stats === 1)
        .map(c => c.id)
    );

    const bills = (this.billingData.bills || []).filter(b => !excludedContactIds.has(b.customer_id));
    const payments = (this.billingData.payments || []).filter(p => !excludedContactIds.has(p.customer_id));
    const contacts = (this.billingData.contacts || []).filter(c => isWorker || c.exclude_from_stats !== 1);

    const metrics = this.calculateSalesMetrics(bills, payments, contacts);

    // Store current view (default to monthly)
    window.currentSalesView = window.currentSalesView || 'monthly';

    const now = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Current Monthly Label
    const currentMonthLabel = `${months[now.getMonth()]} ${now.getFullYear()}`;

    // Current Quarterly Label
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const currentQuarterLabel = `${months[qStartMonth]}-${months[qStartMonth + 2]} ${now.getFullYear()}`;

    // Current Yearly Label (financial year format: e.g., 2026-2027)
    const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    const currentYearlyLabel = `${fyStart}-${fyStart + 1}`;

    const salesData = {
      monthly: {
        title: 'Monthly Sales',
        periodLabel: currentMonthLabel,
        value: this.formatINR(metrics.monthlySales),
        change: metrics.monthlyChange,
        icon: '📅',
        type: 'monthly'
      },
      quarterly: {
        title: 'Quarterly Sales',
        periodLabel: currentQuarterLabel,
        value: this.formatINR(metrics.quarterlySales),
        change: metrics.quarterlyChange,
        icon: '📊',
        type: 'quarterly'
      },
      yearly: {
        title: 'Yearly Sales',
        periodLabel: currentYearlyLabel,
        value: this.formatINR(metrics.yearlySales),
        change: metrics.yearlyChange,
        icon: '📈',
        type: 'yearly'
      }
    };

    const currentMetric = salesData[window.currentSalesView];
    const changeClass = currentMetric.change > 0 ? 'positive' : (currentMetric.change < 0 ? 'negative' : 'neutral');
    const changeSign = currentMetric.change > 0 ? '↑' : (currentMetric.change < 0 ? '↓' : '→');

    // Create switchable sales card
    let html = `
      <div class="floating-card chart-card sales-switchable-card">
        <div class="card-header">
          <span class="card-icon">${currentMetric.icon}</span>
          <span class="card-title">${currentMetric.title}</span>
        </div>
        
        <div class="sales-period-switcher">
          <button class="period-btn ${window.currentSalesView === 'monthly' ? 'active' : ''}" onclick="window.currentDashboard.switchSalesPeriod('monthly')">Monthly</button>
          <button class="period-btn ${window.currentSalesView === 'quarterly' ? 'active' : ''}" onclick="window.currentDashboard.switchSalesPeriod('quarterly')">Quarterly</button>
          <button class="period-btn ${window.currentSalesView === 'yearly' ? 'active' : ''}" onclick="window.currentDashboard.switchSalesPeriod('yearly')">Yearly</button>
        </div>

        <div class="card-value">${currentMetric.value}</div>
        <div class="card-period-label" style="font-size: 10px; color: #888888; margin-top: -4px; margin-bottom: 8px; font-family: 'Courier New', monospace; text-transform: uppercase;">Period: ${currentMetric.periodLabel}</div>
        <div class="card-change ${changeClass}">
          ${changeSign} ${Math.abs(currentMetric.change).toFixed(1)}% from previous period
        </div>
        <div class="chart-container" id="sales-main-chart"></div>
      </div>
    `;

    // Add average bill card separately with its controls
    const avgChangeClass = metrics.avgChange > 0 ? 'positive' : (metrics.avgChange < 0 ? 'negative' : 'neutral');
    const avgChangeSign = metrics.avgChange > 0 ? '↑' : (metrics.avgChange < 0 ? '↓' : '→');
    const avgPreset = this.avgChartPreset || '30-days';

    html += `
      <div class="floating-card chart-card avg-bill-card">
        <div class="card-header" style="display: flex; flex-direction: column; align-items: stretch; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="card-icon">💵</span>
              <span class="card-title">Average Bill</span>
            </div>
            <select id="avgChartPreset" class="metrics-select" style="font-size: 10px; padding: 2px 4px;" onchange="window.currentDashboard.handleAvgPresetChange(this.value)">
              <option value="7-days">Last 7 Days</option>
              <option value="30-days">Last 30 Days</option>
              <option value="90-days">Last 90 Days</option>
              <option value="this-year">This Year</option>
              <option value="all-time">All Time</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div id="avgCustomInputs" class="custom-date-inputs" style="display: ${avgPreset === 'custom' ? 'flex' : 'none'}; justify-content: flex-end; gap: 4px;">
            <input type="date" id="avgStart" class="date-input" style="font-size: 10px; padding: 2px 4px;" onchange="window.currentDashboard.handleAvgCustomDateChange()">
            <span class="date-sep" style="font-size: 10px;">to</span>
            <input type="date" id="avgEnd" class="date-input" style="font-size: 10px; padding: 2px 4px;" onchange="window.currentDashboard.handleAvgCustomDateChange()">
          </div>
        </div>
        <div class="card-value" id="avgBillValue">${this.formatINR(metrics.averageBill)}</div>
        <div class="card-change ${avgChangeClass}" id="avgBillChange">
          ${avgChangeSign} ${Math.abs(metrics.avgChange).toFixed(1)}% from previous
        </div>
        <div class="card-date-range" id="avgBillDateRange" style="font-size: 9px; opacity: 0.65; margin-top: 4px; font-family: 'Courier New', monospace;"></div>
        <div class="chart-container" id="chart-avg"></div>
      </div>

      <div class="floating-card chart-card order-throughput-card">
        <div class="card-header">
          <span class="card-icon">📦</span>
          <span class="card-title">Order Stage Throughput</span>
        </div>
        <div class="chart-container" id="chart-order-throughput" style="margin-top: 15px; height: 180px;"></div>
      </div>

      <div class="floating-card chart-card payment-methods-card">
        <div class="card-header">
          <span class="card-icon">💳</span>
          <span class="card-title">Payment Methods Split</span>
        </div>
        <div class="chart-container" id="chart-payment-methods" style="margin-top: 15px; height: 180px;"></div>
      </div>
    `;

    container.innerHTML = html;

    // Initialize average chart selectors and values in DOM
    const avgPresetEl = document.getElementById('avgChartPreset');
    if (avgPresetEl) {
      avgPresetEl.value = this.avgChartPreset;
      const customDiv = document.getElementById('avgCustomInputs');
      if (customDiv) customDiv.style.display = this.avgChartPreset === 'custom' ? 'flex' : 'none';
    }
    const avgStartEl = document.getElementById('avgStart');
    const avgEndEl = document.getElementById('avgEnd');
    if (avgStartEl && this.avgStartDateVal) avgStartEl.value = this.avgStartDateVal;
    if (avgEndEl && this.avgEndDateVal) avgEndEl.value = this.avgEndDateVal;

    // Render charts if Chart.js is available
    if (typeof Chart !== 'undefined') {
      const orders = (this.billingData.orders || []).filter(o => !excludedContactIds.has(o.customer_id));
      this.renderSalesCharts(bills);
      this.updateAverageBillSection();
      this.renderDoughnutCharts(bills, payments, orders);
    }
  }

  renderSalesCharts(bills) {
    const chartEl = document.getElementById('sales-main-chart');
    if (!chartEl) return;

    chartEl.innerHTML = '';
    const ctx = document.createElement('canvas');
    chartEl.appendChild(ctx);

    const viewType = window.currentSalesView || 'monthly';
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();

    let labels = [];
    let data = [];
    let datasetLabel = '';

    switch (viewType) {
      case 'monthly':
        datasetLabel = 'Monthly Sales';
        for (let i = 5; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const m = d.getMonth();
          const y = d.getFullYear();
          labels.push(`${monthNames[m]} ${y}`);

          const total = bills.reduce((sum, b) => {
            const bDate = this.parseDate(b.bill_date || b.created_at);
            if (bDate && bDate.getMonth() === m && bDate.getFullYear() === y) {
              return sum + (b.total || 0);
            }
            return sum;
          }, 0);
          data.push(total);
        }
        break;

      case 'quarterly':
        datasetLabel = 'Quarterly Sales';
        const currentQ = Math.floor(now.getMonth() / 3);
        const currentY = now.getFullYear();

        for (let i = 3; i >= 0; i--) {
          let q = currentQ - i;
          let y = currentY;
          while (q < 0) {
            q += 4;
            y -= 1;
          }
          const startMonthIdx = q * 3;
          labels.push(`${monthNames[startMonthIdx]}-${monthNames[startMonthIdx + 2]} ${y}`);

          const total = bills.reduce((sum, b) => {
            const bDate = this.parseDate(b.bill_date || b.created_at);
            if (!bDate) return sum;
            const bQ = Math.floor(bDate.getMonth() / 3);
            const bY = bDate.getFullYear();
            if (bQ === q && bY === y) {
              return sum + (b.total || 0);
            }
            return sum;
          }, 0);
          data.push(total);
        }
        break;

      case 'yearly':
        datasetLabel = 'Yearly Sales';
        const currentFYStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

        for (let i = 2; i >= 0; i--) {
          const fyStart = currentFYStart - i;
          labels.push(`${fyStart}-${fyStart + 1}`);

          const total = bills.reduce((sum, b) => {
            const bDate = this.parseDate(b.bill_date || b.created_at);
            if (!bDate) return sum;
            const bMonth = bDate.getMonth();
            const bYear = bDate.getFullYear();
            const bFY = bMonth >= 3 ? bYear : bYear - 1;
            if (bFY === fyStart) {
              return sum + (b.total || 0);
            }
            return sum;
          }, 0);
          data.push(total);
        }
        break;
    }

    const pointsMetadata = [];
    for (let i = 0; i < data.length; i++) {
      const val = data[i];
      const prevVal = i > 0 ? data[i - 1] : null;
      const change = (prevVal !== null && prevVal > 0) ? ((val - prevVal) / prevVal) * 100 : 0;
      pointsMetadata.push({
        label: labels[i],
        value: val,
        change: change,
        hasPrev: prevVal !== null
      });
    }

    const chartConfig = {
      type: viewType === 'quarterly' ? 'bar' : (viewType === 'yearly' ? 'bar' : 'line'),
      data: {
        labels: labels,
        datasets: [{
          label: datasetLabel,
          data: data,
          borderColor: '#000000',
          backgroundColor: viewType === 'line' ? 'rgba(0, 0, 0, 0.05)' : (context) => {
            const chart = context.chart;
            const index = context.dataIndex;
            const isSelected = chart.selectedPeriodIndex !== undefined
              ? index === chart.selectedPeriodIndex
              : index === (context.dataset.data.length - 1);
            return isSelected ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.3)';
          },
          tension: 0.3,
          fill: true,
          borderRadius: 4,
          pointRadius: (context) => {
            const chart = context.chart;
            const index = context.dataIndex;
            const isSelected = chart.selectedPeriodIndex !== undefined
              ? index === chart.selectedPeriodIndex
              : index === (context.dataset.data.length - 1);
            return isSelected ? 7 : 4;
          },
          pointBackgroundColor: (context) => {
            const chart = context.chart;
            const index = context.dataIndex;
            const isSelected = chart.selectedPeriodIndex !== undefined
              ? index === chart.selectedPeriodIndex
              : index === (context.dataset.data.length - 1);
            return isSelected ? '#000000' : '#888888';
          },
          pointHoverRadius: 9
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (event, elements, chart) => {
          if (elements && elements.length > 0) {
            const index = elements[0].index;
            chart.selectedPeriodIndex = index;

            const meta = pointsMetadata[index];

            const valEl = document.querySelector('.sales-switchable-card .card-value');
            const labelEl = document.querySelector('.sales-switchable-card .card-period-label');
            const changeEl = document.querySelector('.sales-switchable-card .card-change');

            if (valEl) valEl.innerText = this.formatINR(meta.value);
            if (labelEl) labelEl.innerText = `Period: ${meta.label}`;
            if (changeEl) {
              if (!meta.hasPrev) {
                changeEl.className = 'card-change neutral';
                changeEl.innerText = '→ No previous period data';
              } else {
                const changeClass = meta.change > 0 ? 'positive' : (meta.change < 0 ? 'negative' : 'neutral');
                const changeSign = meta.change > 0 ? '↑' : (meta.change < 0 ? '↓' : '→');
                changeEl.className = `card-change ${changeClass}`;
                changeEl.innerText = `${changeSign} ${Math.abs(meta.change).toFixed(1)}% from previous period`;
              }
            }

            chart.update();
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                let label = context.dataset.label || '';
                if (label) label += ': ';
                if (context.parsed.y !== null) {
                  label += '₹' + Number(context.parsed.y).toLocaleString('en-IN', { maximumFractionDigits: 0 });
                }
                return label;
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: '#888888',
              font: { family: 'Courier New', size: 9 },
              callback: function (value) {
                return '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 });
              }
            },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          },
          x: {
            ticks: {
              color: '#888888',
              font: { family: 'Courier New', size: 9 }
            },
            grid: { display: false }
          }
        }
      }
    };

    try {
      new Chart(ctx, chartConfig);
    } catch (e) {
      console.error('Chart render error:', e);
    }
  }

  /**
   * Render Order stage throughput and Payment methods breakdown doughnut charts
   */
  renderDoughnutCharts(bills, payments, orders) {
    const throughputEl = document.getElementById('chart-order-throughput');
    const paymentMethodsEl = document.getElementById('chart-payment-methods');

    if (throughputEl && typeof Chart !== 'undefined') {
      const stage1 = orders.filter(o => o.current_stage === 'stage1').length;
      const stage2 = orders.filter(o => o.current_stage === 'stage2').length;
      const stage3 = orders.filter(o => o.current_stage === 'stage3' || o.status === 'complete').length;

      throughputEl.innerHTML = '';
      const ctx = document.createElement('canvas');
      throughputEl.appendChild(ctx);

      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Draft (Stage 1)', 'Quality Check (Stage 2)', 'Completed (Stage 3)'],
          datasets: [{
            data: [stage1, stage2, stage3],
            backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.1)'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: {
                color: '#888888',
                font: { family: 'Courier New', size: 9 }
              }
            }
          }
        }
      });
    }

    if (paymentMethodsEl && typeof Chart !== 'undefined') {
      const mediumMap = {};
      payments.forEach(p => {
        const medium = p.payment_medium || 'Other';
        mediumMap[medium] = (mediumMap[medium] || 0) + (p.amount || p.credit_amount || 0);
      });

      const labels = Object.keys(mediumMap);
      const data = Object.values(mediumMap);

      paymentMethodsEl.innerHTML = '';
      const ctx = document.createElement('canvas');
      paymentMethodsEl.appendChild(ctx);

      const colorPalette = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

      new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: labels.map((_, i) => colorPalette[i % colorPalette.length]),
            borderWidth: 1,
            borderColor: 'rgba(255, 255, 255, 0.1)'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: {
                color: '#888888',
                font: { family: 'Courier New', size: 9 }
              }
            },
            tooltip: {
              callbacks: {
                label: function (context) {
                  let label = context.label || '';
                  if (label) label += ': ';
                  if (context.parsed !== null) {
                    label += '₹' + Number(context.parsed).toLocaleString('en-IN', { maximumFractionDigits: 0 });
                  }
                  return label;
                }
              }
            }
          }
        }
      });
    }
  }

  updateAverageBillSection() {
    const isWorker = this.isWorkerUser();
    const excludedContactIds = isWorker ? new Set() : new Set(
      (this.billingData.contacts || [])
        .filter(c => c.exclude_from_stats === 1)
        .map(c => c.id)
    );
    const bills = (this.billingData.bills || []).filter(b => !excludedContactIds.has(b.customer_id));
    const contacts = (this.billingData.contacts || []).filter(c => isWorker || c.exclude_from_stats !== 1);
    const totalOpeningBalance = contacts.reduce((sum, c) => sum + (c.opening_balance || 0), 0);

    const { startDate, endDate } = this.getAvgDateRange();

    const filteredBills = bills.filter(b => {
      const date = this.parseDate(b.bill_date || b.created_at);
      return date && (!startDate || date >= startDate) && (!endDate || date <= endDate);
    });

    const includeOpening = (this.avgChartPreset === 'all-time');
    const totalAmt = filteredBills.reduce((sum, b) => sum + (b.total || 0), 0) + (includeOpening ? totalOpeningBalance : 0);
    const count = filteredBills.length;
    const averageBill = count > 0 ? totalAmt / count : 0;

    const valEl = document.getElementById('avgBillValue');
    if (valEl) valEl.innerText = this.formatINR(averageBill);

    const dateRangeEl = document.getElementById('avgBillDateRange');
    if (dateRangeEl) {
      let earliestBillDate = null;
      bills.forEach(b => {
        const date = this.parseDate(b.bill_date || b.created_at);
        if (date && (!earliestBillDate || date < earliestBillDate)) earliestBillDate = date;
      });
      dateRangeEl.innerText = this.formatDateRangeText(startDate, endDate, earliestBillDate);
    }

    this.renderAverageChart(filteredBills);
  }

  renderAverageChart(filteredBills) {
    const chartEl = document.getElementById('chart-avg');
    if (!chartEl) return;

    chartEl.innerHTML = '';
    const ctx = document.createElement('canvas');
    chartEl.appendChild(ctx);

    if (!filteredBills || filteredBills.length === 0) {
      ctx.style.display = 'none';
      chartEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #888; font-size: 10px; font-family: \'Courier New\', monospace;">No data in range</div>';
      return;
    }

    const grouped = {};
    filteredBills.forEach(b => {
      const date = new Date(b.bill_date || b.created_at);
      const dateStr = date.toISOString().split('T')[0];
      if (!grouped[dateStr]) grouped[dateStr] = [];
      grouped[dateStr].push(b.total || 0);
    });

    const sortedDates = Object.keys(grouped).sort();

    const labels = sortedDates.map(dStr => {
      const date = new Date(dStr);
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    });

    const data = sortedDates.map(dStr => {
      const totals = grouped[dStr];
      const sum = totals.reduce((a, b) => a + b, 0);
      return sum / totals.length;
    });

    const chartConfig = {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Daily Average',
          data: data,
          borderColor: '#000000',
          backgroundColor: 'rgba(0, 0, 0, 0.05)',
          tension: 0.2,
          fill: true,
          pointRadius: Math.min(6, Math.max(2, 12 / sortedDates.length)),
          pointBackgroundColor: '#000000'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (context) {
                return 'Avg: ' + '₹' + Number(context.parsed.y).toLocaleString('en-IN', { maximumFractionDigits: 0 });
              }
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              color: '#888888',
              font: { family: 'Courier New', size: 9 },
              callback: function (value) {
                return '₹' + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 });
              }
            },
            grid: { color: 'rgba(255, 255, 255, 0.05)' }
          },
          x: {
            ticks: {
              color: '#888888',
              font: { family: 'Courier New', size: 9 }
            },
            grid: { display: false }
          }
        }
      }
    };

    try {
      new Chart(ctx, chartConfig);
    } catch (e) {
      console.error('Average Chart render error:', e);
    }
  }

  handleAvgPresetChange(preset) {
    this.avgChartPreset = preset;
    localStorage.setItem('dashboard_avg_preset', preset);

    const customDiv = document.getElementById('avgCustomInputs');
    if (customDiv) {
      customDiv.style.display = preset === 'custom' ? 'flex' : 'none';
    }

    if (preset !== 'custom') {
      this.avgStartDateVal = '';
      this.avgEndDateVal = '';
      localStorage.removeItem('dashboard_avg_start');
      localStorage.removeItem('dashboard_avg_end');
    } else {
      const startEl = document.getElementById('avgStart');
      const endEl = document.getElementById('avgEnd');
      if (startEl && endEl && !startEl.value && !endEl.value) {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        this.avgStartDateVal = thirtyDaysAgo.toISOString().split('T')[0];
        this.avgEndDateVal = now.toISOString().split('T')[0];
        startEl.value = this.avgStartDateVal;
        endEl.value = this.avgEndDateVal;
        localStorage.setItem('dashboard_avg_start', this.avgStartDateVal);
        localStorage.setItem('dashboard_avg_end', this.avgEndDateVal);
      }
    }
    this.updateAverageBillSection();
  }

  handleAvgCustomDateChange() {
    const startEl = document.getElementById('avgStart');
    const endEl = document.getElementById('avgEnd');
    if (startEl && endEl) {
      this.avgStartDateVal = startEl.value;
      this.avgEndDateVal = endEl.value;
      localStorage.setItem('dashboard_avg_start', this.avgStartDateVal);
      localStorage.setItem('dashboard_avg_end', this.avgEndDateVal);
      this.updateAverageBillSection();
    }
  }

  getAvgDateRange() {
    const now = new Date();
    let startDate = null;
    let endDate = null;

    switch (this.avgChartPreset) {
      case '7-days':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30-days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90-days':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case 'this-year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        if (this.avgStartDateVal) {
          startDate = new Date(this.avgStartDateVal);
          startDate.setHours(0, 0, 0, 0);
        }
        if (this.avgEndDateVal) {
          endDate = new Date(this.avgEndDateVal);
          endDate.setHours(23, 59, 59, 999);
        }
        break;
      default:
        break;
    }
    return { startDate, endDate };
  }

  switchSalesPeriod(period) {
    window.currentSalesView = period;
    this.renderSalesMetrics();
  }

  /**
   * Calculate monthly trend data
   */
  calculateMonthlyTrend(bills) {
    const months = {};
    bills.forEach(bill => {
      const date = new Date(bill.date || new Date());
      const month = `${date.getFullYear()}-${date.getMonth()}`;
      months[month] = (months[month] || 0) + (bill.total || 0);
    });
    return Object.values(months).slice(-12);
  }

  /**
   * Render top performing products and customers
   */
  async renderTopPerformers() {
    const container = document.getElementById('dashboardPerformers');
    if (!container) return;

    const contacts = this.billingData.contacts || [];
    const bills = this.billingData.bills || [];
    const payments = this.billingData.payments || [];
    const orders = this.billingData.orders || [];

    // Filter contacts marked for exclusion (unless worker)
    const isWorker = this.isWorkerUser();
    const excludedContactIds = isWorker ? new Set() : new Set(
      contacts.filter(c => c.exclude_from_stats === 1).map(c => c.id)
    );

    const filteredBills = bills.filter(b => !excludedContactIds.has(b.customer_id));
    const filteredPayments = payments.filter(p => !excludedContactIds.has(p.customer_id));
    const filteredOrders = orders.filter(o => !excludedContactIds.has(o.customer_id));
    const filteredContacts = contacts.filter(c => isWorker || c.exclude_from_stats !== 1);

    // Get date range
    const { startDate, endDate } = this.getMetricsDateRange();

    const periodBills = filteredBills.filter(b => {
      const date = this.parseDate(b.bill_date || b.created_at);
      return date && (!startDate || date >= startDate) && (!endDate || date <= endDate);
    });

    const periodOrders = filteredOrders.filter(o => {
      const date = this.parseDate(o.order_date || o.created_at);
      return date && (!startDate || date >= startDate) && (!endDate || date <= endDate);
    });

    // 1. Calculate Top Products by quantity and revenue in selected period
    const productMap = {};
    periodBills.forEach(bill => {
      const items = bill.items || [];
      items.forEach(item => {
        const name = item.product_name || item.name || 'Unknown';
        if (!productMap[name]) {
          productMap[name] = { name, quantity: 0, revenue: 0 };
        }
        productMap[name].quantity += item.quantity || 0;
        productMap[name].revenue += item.total || (item.quantity || 0) * (item.price || 0);
      });
    });
    const topProducts = Object.values(productMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Calculate customer outstanding balances using FIFO settlement
    const billBalances = this.calculateBillSettlement(filteredBills, filteredPayments, filteredContacts);

    // 2. Calculate Top Customers in selected period
    const customerMap = {};
    periodBills.forEach(bill => {
      const cId = bill.customer_id;
      const cName = bill.customer_name || bill.customer || 'Unknown';
      if (!customerMap[cId]) {
        customerMap[cId] = { id: cId, name: cName, ordersCount: 0, billed: 0, balance: 0 };
      }
      customerMap[cId].billed += bill.total || 0;
    });

    periodOrders.forEach(order => {
      const cId = order.customer_id;
      const cName = order.customer_name || 'Unknown';
      if (!customerMap[cId]) {
        customerMap[cId] = { id: cId, name: cName, ordersCount: 0, billed: 0, balance: 0 };
      }
      customerMap[cId].ordersCount += 1;
    });

    // Add remaining balances for each customer based on FIFO
    Object.keys(customerMap).forEach(cId => {
      const customerBillsList = filteredBills.filter(b => b.customer_id == cId);
      let customerDue = 0;
      customerBillsList.forEach(b => {
        customerDue += billBalances[b.id] || 0;
      });
      // Add opening balance if positive
      const contact = filteredContacts.find(c => c.id == cId);
      const opening = contact ? parseFloat(contact.opening_balance || 0) : 0;
      if (opening > 0) {
        const paymentsTotal = filteredPayments.filter(p => p.customer_id == cId).reduce((s, p) => s + (p.amount || p.credit_amount || 0), 0);
        const billsTotal = customerBillsList.reduce((s, b) => s + (b.total || 0), 0);
        customerDue = Math.max(0, billsTotal + opening - paymentsTotal);
      }
      customerMap[cId].balance = customerDue;
    });

    const topCustomers = Object.values(customerMap)
      .sort((a, b) => b.billed - a.billed)
      .slice(0, 5);

    // Render Products Table
    const productsRows = topProducts.length > 0 ? topProducts.map((p, idx) => `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding: 8px 4px; font-weight: bold; color: #ffffff;">#${idx + 1} ${p.name}</td>
        <td style="padding: 8px 4px; text-align: center; color: #aaaaaa;">${p.quantity}</td>
        <td style="padding: 8px 4px; text-align: right; color: #10b981; font-weight: bold;">₹${p.revenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
      </tr>
    `).join('') : `<tr><td colspan="3" style="padding: 16px; text-align: center; color: #666666;">No data in range</td></tr>`;

    // Render Customers Table
    const customersRows = topCustomers.length > 0 ? topCustomers.map((c, idx) => `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding: 8px 4px; font-weight: bold; color: #ffffff;">#${idx + 1} ${c.name}</td>
        <td style="padding: 8px 4px; text-align: center; color: #aaaaaa;">${c.ordersCount}</td>
        <td style="padding: 8px 4px; text-align: right; color: #ffffff;">₹${c.billed.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
        <td style="padding: 8px 4px; text-align: right; color: ${c.balance > 0 ? '#f59e0b' : '#aaaaaa'}; font-weight: ${c.balance > 0 ? 'bold' : 'normal'};">₹${c.balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
      </tr>
    `).join('') : `<tr><td colspan="4" style="padding: 16px; text-align: center; color: #666666;">No data in range</td></tr>`;

    let html = `
      <div class="floating-card dark">
        <div class="card-header">
          <span class="card-icon">📦</span>
          <span class="card-title">Top Selling Products</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-family: 'Courier New', monospace; font-size: 11px; margin-top: 10px;">
          <thead>
            <tr style="border-bottom: 2px solid #000000; text-align: left;">
              <th style="padding: 6px 4px; color: #888888;">PRODUCT</th>
              <th style="padding: 6px 4px; text-align: center; color: #888888; width: 60px;">QTY</th>
              <th style="padding: 6px 4px; text-align: right; color: #888888; width: 90px;">REVENUE</th>
            </tr>
          </thead>
          <tbody>
            ${productsRows}
          </tbody>
        </table>
      </div>

      <div class="floating-card dark">
        <div class="card-header">
          <span class="card-icon">👥</span>
          <span class="card-title">Top Performing Customers</span>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-family: 'Courier New', monospace; font-size: 11px; margin-top: 10px;">
          <thead>
            <tr style="border-bottom: 2px solid #000000; text-align: left;">
              <th style="padding: 6px 4px; color: #888888;">CUSTOMER</th>
              <th style="padding: 6px 4px; text-align: center; color: #888888; width: 60px;">ORDERS</th>
              <th style="padding: 6px 4px; text-align: right; color: #888888; width: 90px;">BILLED</th>
              <th style="padding: 6px 4px; text-align: right; color: #888888; width: 90px;">DUE BALANCE</th>
            </tr>
          </thead>
          <tbody>
            ${customersRows}
          </tbody>
        </table>
      </div>
    `;

    container.innerHTML = html;
  }

  /**
   * Render payment reminders with modern card layout
   */
  renderReminders() {
    const container = document.getElementById('dashboardReminders');
    if (!container) return;

    const overdueBills = this.getOverdueBills();

    if (overdueBills.length === 0) {
      container.innerHTML = '<div class="no-reminders">✓ All payments are up to date!</div>';
      return;
    }

    // Group bills by severity
    // Critical: daysOverdue > 30 (which means it's > 60 days old from invoice date)
    // Warning: daysOverdue <= 30 (which is between 30 and 60 days old from invoice date)
    const criticalBills = overdueBills.filter(b => b.daysOverdue > 30);
    const warningBills = overdueBills.filter(b => b.daysOverdue <= 30);

    // Sort both descending by days overdue
    criticalBills.sort((a, b) => b.daysOverdue - a.daysOverdue);
    warningBills.sort((a, b) => b.daysOverdue - a.daysOverdue);

    const renderBillItem = (bill, severity) => {
      return `
        <div class="reminder-item ${severity}">
          <div class="reminder-content">
            <div class="reminder-customer">${bill.customer}</div>
            <div class="reminder-details">Bill #${bill.billId} • ${bill.billDate}</div>
            <div class="reminder-meta">
              <span class="reminder-amount">${this.formatINR(bill.amount)} due</span>
              <span class="reminder-days-badge">${bill.daysOverdue + 30} days overdue</span>
            </div>
          </div>
          <div class="reminder-actions">
            <button class="reminder-pay-btn" onclick="window.currentBillingApp.navigationHandler('makePayment', '${bill.customer}')">
              Pay Now
            </button>
          </div>
        </div>
      `;
    };

    const criticalHTML = criticalBills.length > 0
      ? criticalBills.map(b => renderBillItem(b, 'critical')).join('')
      : '<div class="reminder-empty-state">✓ No critical overdue items</div>';

    const warningHTML = warningBills.length > 0
      ? warningBills.map(b => renderBillItem(b, 'warning')).join('')
      : '<div class="reminder-empty-state">✓ No warning overdue items</div>';

    container.innerHTML = `
      <div class="reminders-sections">
        <div class="reminders-col critical-col">
          <h4>🚨 CRITICAL OVERDUE (>60 days)</h4>
          <div class="reminders-list" style="display: flex; flex-direction: column; gap: 8px;">
            ${criticalHTML}
          </div>
        </div>
        <div class="reminders-col warning-col">
          <h4>⚠️ WARNING OVERDUE (30-60 days)</h4>
          <div class="reminders-list" style="display: flex; flex-direction: column; gap: 8px;">
            ${warningHTML}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Calculate overdue bills
   */
  calculateOverdueBills(bills, payments) {
    // Group by customer_id
    const customerBills = {};
    const customerPayments = {};

    bills.forEach(b => {
      if (!customerBills[b.customer_id]) customerBills[b.customer_id] = [];
      customerBills[b.customer_id].push(b);
    });

    payments.forEach(p => {
      if (!customerPayments[p.customer_id]) customerPayments[p.customer_id] = [];
      customerPayments[p.customer_id].push(p);
    });

    // Get contacts to look up opening balance
    const contacts = this.billingData.contacts || [];
    const contactMap = {};
    contacts.forEach(c => {
      contactMap[c.id] = c;
    });

    const now = new Date();
    let totalOverdue = 0;

    Object.keys(customerBills).forEach(custId => {
      const cBills = customerBills[custId];
      const cPayments = customerPayments[custId] || [];
      const contact = contactMap[custId];
      const openingBalance = contact ? parseFloat(contact.opening_balance || 0) : 0;

      const sortedBills = [...cBills].sort((a, b) => {
        const dateA = this.parseDate(a.bill_date || a.created_at);
        const dateB = this.parseDate(b.bill_date || b.created_at);
        return (dateA || 0) - (dateB || 0);
      });

      const sortedPayments = [...cPayments].sort((a, b) => {
        const dateA = this.parseDate(a.payment_date || a.created_at);
        const dateB = this.parseDate(b.payment_date || b.created_at);
        return (dateA || 0) - (dateB || 0);
      });

      const pQueue = sortedPayments.map(p => ({
        id: p.id,
        total: parseFloat(p.amount || p.credit_amount || 0),
        remaining: parseFloat(p.amount || p.credit_amount || 0)
      }));

      let availableCredit = 0;
      let debtToSettleFirst = 0;

      if (openingBalance < 0) {
        availableCredit = Math.abs(openingBalance);
      } else {
        debtToSettleFirst = openingBalance;
      }

      while (debtToSettleFirst > 0 && pQueue.length > 0) {
        const p = pQueue[0];
        const consumed = Math.min(debtToSettleFirst, p.remaining);
        debtToSettleFirst -= consumed;
        p.remaining -= consumed;
        if (p.remaining <= 0) pQueue.shift();
      }

      sortedBills.forEach(bill => {
        const billAmount = parseFloat(bill.total || 0);
        let remainingToSettle = billAmount;

        if (availableCredit > 0) {
          const consumed = Math.min(remainingToSettle, availableCredit);
          remainingToSettle -= consumed;
          availableCredit -= consumed;
        }

        while (remainingToSettle > 0 && pQueue.length > 0) {
          const p = pQueue[0];
          const consumed = Math.min(remainingToSettle, p.remaining);
          remainingToSettle -= consumed;
          p.remaining -= consumed;
          if (p.remaining <= 0) pQueue.shift();
        }

        if (remainingToSettle > 0.01) {
          const billDate = this.parseDate(bill.bill_date || bill.created_at);
          if (billDate) {
            const daysAgo = Math.floor((now - billDate) / (1000 * 60 * 60 * 24));
            if (daysAgo > 30) {
              totalOverdue += remainingToSettle;
            }
          }
        }
      });
    });

    return totalOverdue;
  }

  /**
   * Reusable chronological FIFO settlement calculator.
   * Returns a map of billId -> remaining balance.
   */
  calculateBillSettlement(bills, payments, contacts) {
    const customerBills = {};
    const customerPayments = {};

    bills.forEach(b => {
      if (!customerBills[b.customer_id]) customerBills[b.customer_id] = [];
      customerBills[b.customer_id].push(b);
    });

    payments.forEach(p => {
      if (!customerPayments[p.customer_id]) customerPayments[p.customer_id] = [];
      customerPayments[p.customer_id].push(p);
    });

    const contactMap = {};
    contacts.forEach(c => {
      contactMap[c.id] = c;
    });

    const billBalances = {};

    Object.keys(customerBills).forEach(custId => {
      const cBills = customerBills[custId];
      const cPayments = customerPayments[custId] || [];
      const contact = contactMap[custId];
      const openingBalance = contact ? parseFloat(contact.opening_balance || 0) : 0;

      const sortedBills = [...cBills].sort((a, b) => {
        const dateA = this.parseDate(a.bill_date || a.created_at);
        const dateB = this.parseDate(b.bill_date || b.created_at);
        return (dateA || 0) - (dateB || 0);
      });

      const sortedPayments = [...cPayments].sort((a, b) => {
        const dateA = this.parseDate(a.payment_date || a.created_at);
        const dateB = this.parseDate(b.payment_date || b.created_at);
        return (dateA || 0) - (dateB || 0);
      });

      const pQueue = sortedPayments.map(p => ({
        id: p.id,
        total: parseFloat(p.amount || p.credit_amount || 0),
        remaining: parseFloat(p.amount || p.credit_amount || 0)
      }));

      let availableCredit = 0;
      let debtToSettleFirst = 0;

      if (openingBalance < 0) {
        availableCredit = Math.abs(openingBalance);
      } else {
        debtToSettleFirst = openingBalance;
      }

      while (debtToSettleFirst > 0 && pQueue.length > 0) {
        const p = pQueue[0];
        const consumed = Math.min(debtToSettleFirst, p.remaining);
        debtToSettleFirst -= consumed;
        p.remaining -= consumed;
        if (p.remaining <= 0) pQueue.shift();
      }

      sortedBills.forEach(bill => {
        const billAmount = parseFloat(bill.total || 0);
        let remainingToSettle = billAmount;

        if (availableCredit > 0) {
          const consumed = Math.min(remainingToSettle, availableCredit);
          remainingToSettle -= consumed;
          availableCredit -= consumed;
        }

        while (remainingToSettle > 0 && pQueue.length > 0) {
          const p = pQueue[0];
          const consumed = Math.min(remainingToSettle, p.remaining);
          remainingToSettle -= consumed;
          p.remaining -= consumed;
          if (p.remaining <= 0) pQueue.shift();
        }

        billBalances[bill.id] = remainingToSettle;
      });
    });

    return billBalances;
  }

  /**
   * Render order statistics cards on the dashboard
   */
  renderOrderStatistics() {
    const container = document.getElementById('dashboardOrderStats');
    if (!container) return;

    const contacts = this.billingData.contacts || [];
    const bills = this.billingData.bills || [];
    const payments = this.billingData.payments || [];
    const orders = this.billingData.orders || [];

    // Filter contacts marked for exclusion
    const excludedContactIds = new Set(
      contacts.filter(c => c.exclude_from_stats === 1).map(c => c.id)
    );

    const filteredBills = bills.filter(b => !excludedContactIds.has(b.customer_id));
    const filteredPayments = payments.filter(p => !excludedContactIds.has(p.customer_id));
    const filteredOrders = orders.filter(o => !excludedContactIds.has(o.customer_id));

    // Get date range
    const { startDate, endDate } = this.getMetricsDateRange();

    let earliestOrderDate = null;
    filteredOrders.forEach(o => {
      const date = this.parseDate(o.order_date || o.created_at);
      if (date && (!earliestOrderDate || date < earliestOrderDate)) {
        earliestOrderDate = date;
      }
    });

    const rangeText = this.formatDateRangeText(startDate, endDate, earliestOrderDate);

    // Apply date range filter to orders
    const periodOrders = filteredOrders.filter(o => {
      const date = this.parseDate(o.order_date || o.created_at);
      return date && (!startDate || date >= startDate) && (!endDate || date <= endDate);
    });

    const totalOrders = periodOrders.length;

    // 1. Fulfilled orders: current_stage === 'stage3' or complete status
    const fulfilledOrders = periodOrders.filter(o => o.status === 'complete' || o.current_stage === 'stage3');
    const fulfilledCount = fulfilledOrders.length;

    // Calculate bill settlement status for all customer bills
    const billBalances = this.calculateBillSettlement(filteredBills, filteredPayments, contacts);

    // Calculate item-level fulfillment and order payment values
    let totalOrderedQty = 0;
    let totalDeliveredQty = 0;
    let totalOrderedValue = 0;
    let totalDeliveredValue = 0;
    let totalLostValue = 0;
    let totalPaidOnOrders = 0;

    periodOrders.forEach(o => {
      let orderOrderedQty = 0;
      let orderDeliveredQty = 0;
      let orderLostVal = 0;

      if (o.items && o.items.length > 0) {
        o.items.forEach(item => {
          const qty = parseInt(item.quantity || 0);
          const recQty = (o.current_stage === 'stage3' || o.status === 'complete') ? parseInt(item.received_quantity || 0) : 0;
          const price = parseFloat(item.unit_price || 0);

          orderOrderedQty += qty;
          orderDeliveredQty += recQty;
          orderLostVal += Math.max(0, qty - recQty) * price;
        });
      } else {
        // Fallback for orders without items details
        orderOrderedQty = 1;
        const isDelivered = o.current_stage === 'stage3' || o.status === 'complete';
        orderDeliveredQty = isDelivered ? 1 : 0;
        const fallbackVal = parseFloat(o.total_amount || 0);
        orderLostVal = isDelivered ? 0 : fallbackVal;
      }

      totalOrderedQty += orderOrderedQty;
      totalDeliveredQty += orderDeliveredQty;
      totalLostValue += orderLostVal;

      // Use o.total_amount (accurate invoice value) as the delivered value if completed
      const orderDeliveredVal = (o.current_stage === 'stage3' || o.status === 'complete') ? parseFloat(o.total_amount || 0) : 0;
      totalDeliveredValue += orderDeliveredVal;

      if (o.bill_reference) {
        const matchingBill = filteredBills.find(b => b.invoice_no === o.bill_reference);
        if (matchingBill) {
          const remaining = billBalances[matchingBill.id] !== undefined ? billBalances[matchingBill.id] : matchingBill.total;
          const paidOnOrder = Math.max(0, matchingBill.total - remaining);
          totalPaidOnOrders += paidOnOrder;
        }
      }
    });

    totalOrderedValue = totalDeliveredValue + totalLostValue;
    const fulfillmentQtyRatio = totalOrderedQty > 0 ? (totalDeliveredQty / totalOrderedQty) * 100 : 0;
    const settlementPaidRatio = totalDeliveredValue > 0 ? (totalPaidOnOrders / totalDeliveredValue) * 100 : 0;

    // 5. Pending/Work In Progress
    const stage1Count = periodOrders.filter(o => o.current_stage === 'stage1').length;
    const stage2Count = periodOrders.filter(o => o.current_stage === 'stage2').length;
    const pendingCount = stage1Count + stage2Count;

    // 6. Total Order Value & Avg Order Value
    const avgOrderValue = totalOrders > 0 ? totalOrderedValue / totalOrders : 0;

    // 7. Average Fulfillment Speed (order_date to delivery_date)
    let totalDays = 0;
    let countWithDate = 0;
    fulfilledOrders.forEach(o => {
      const orderDate = this.parseDate(o.order_date || o.created_at);
      const deliveryDate = this.parseDate(o.delivery_date);
      if (orderDate && deliveryDate) {
        const diffDays = (deliveryDate - orderDate) / (1000 * 60 * 60 * 24);
        if (diffDays >= 0) {
          totalDays += diffDays;
          countWithDate++;
        }
      }
    });
    const avgFulfillmentTimeText = countWithDate > 0 ? `${(totalDays / countWithDate).toFixed(1)} Days` : 'N/A';

    // 8. Receivables Aging Buckets
    let outstanding0to30 = 0;
    let outstanding31to60 = 0;
    let outstanding61Plus = 0;
    const now = new Date();

    filteredBills.forEach(bill => {
      const remaining = billBalances[bill.id];
      if (remaining && remaining > 0.01) {
        const billDate = this.parseDate(bill.bill_date || bill.created_at);
        if (billDate) {
          const daysAgo = Math.floor((now - billDate) / (1000 * 60 * 60 * 24));
          if (daysAgo <= 30) {
            outstanding0to30 += remaining;
          } else if (daysAgo <= 60) {
            outstanding31to60 += remaining;
          } else {
            outstanding61Plus += remaining;
          }
        }
      }
    });
    const totalAgingOutstanding = outstanding0to30 + outstanding31to60 + outstanding61Plus;

    const stats = [
      {
        id: 'total-orders',
        label: 'Total Orders',
        value: totalOrders,
        subtext: `${fulfilledCount} fulfilled, ${pendingCount} pending`,
        icon: '🧾',
        highlight: false,
        rangeText
      },
      {
        id: 'order-fulfillment',
        label: 'Order Fulfillment',
        value: `${fulfillmentQtyRatio.toFixed(1)}%`,
        subtext: `${totalDeliveredQty} of ${totalOrderedQty} items delivered`,
        icon: '📦',
        highlight: fulfillmentQtyRatio < 80 && totalOrderedQty > 0,
        rangeText
      },
      {
        id: 'order-settlement',
        label: 'Order Settlement',
        value: `${settlementPaidRatio.toFixed(1)}%`,
        subtext: `₹${totalPaidOnOrders.toFixed(0)} of ₹${totalDeliveredValue.toFixed(0)} collected`,
        icon: '💳',
        highlight: settlementPaidRatio < 80 && totalDeliveredValue > 0,
        rangeText
      },
      {
        id: 'pending-orders',
        label: 'Pending Orders',
        value: pendingCount,
        subtext: `${stage1Count} draft, ${stage2Count} quality check`,
        icon: '⏳',
        highlight: pendingCount > 0,
        rangeText
      },
      {
        id: 'total-order-value',
        label: 'Total Order Value',
        value: this.formatINR(totalOrderedValue),
        subtext: `From ${totalOrders} orders`,
        icon: '💰',
        highlight: false,
        rangeText
      },
      {
        id: 'avg-order-value',
        label: 'Avg Order Value',
        value: this.formatINR(avgOrderValue),
        subtext: 'Per order average',
        icon: '📊',
        highlight: false,
        rangeText
      },
      {
        id: 'fulfillment-value',
        label: 'Fulfillment Value',
        value: this.formatINR(totalDeliveredValue),
        subtext: 'Billed/delivered items value',
        icon: '📦',
        highlight: false,
        rangeText
      },
      {
        id: 'settlement-value',
        label: 'Settled Order Value',
        value: this.formatINR(totalPaidOnOrders),
        subtext: 'Amount collected from delivered orders',
        icon: '💳',
        highlight: false,
        rangeText
      },
      {
        id: 'unsettled-value',
        label: 'Unsettled Order Value',
        value: this.formatINR(totalDeliveredValue - totalPaidOnOrders),
        subtext: 'Outstanding receivables from orders',
        icon: '⚠️',
        highlight: (totalDeliveredValue - totalPaidOnOrders) > 0,
        rangeText
      },
      {
        id: 'unfulfilled-value',
        label: 'Unavailable Items Loss',
        value: this.formatINR(totalLostValue),
        subtext: `${totalOrderedQty - totalDeliveredQty} items unavailable (loss)`,
        icon: '⏳',
        highlight: totalLostValue > 0,
        rangeText
      },
      {
        id: 'fulfillment-speed',
        label: 'Fulfillment Speed',
        value: avgFulfillmentTimeText,
        subtext: 'Avg order-to-delivery time',
        icon: '⚡',
        highlight: false,
        rangeText
      },
      {
        id: 'receivables-aging',
        label: 'Receivables Aging',
        value: this.formatINR(totalAgingOutstanding),
        subtext: `0-30d: ₹${outstanding0to30.toFixed(0)} | 31-60d: ₹${outstanding31to60.toFixed(0)} | 61d+: ₹${outstanding61Plus.toFixed(0)}`,
        icon: '⏳',
        highlight: outstanding61Plus > 0,
        rangeText
      }
    ];

    this.renderCardsWithEditMode(container, stats, 'dashboard_order_metrics_cards');
  }

  /**
   * Get unique customers from bills and payments
   */
  getUniqueCustomers(bills, payments) {
    const customers = new Set();
    bills.forEach(b => customers.add(b.customer_name || b.customer || 'Unknown'));
    payments.forEach(p => customers.add(p.customer_name || p.customer || 'Unknown'));
    return Array.from(customers);
  }

  /**
   * Calculate sales metrics for different time periods
   */
  calculateSalesMetrics(bills, payments = [], contacts = []) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const currentQuarter = Math.floor(currentMonth / 3);

    // Current period calculations - strictly from invoice totals (no opening balance)
    const currentMonthBills = bills.filter(b => {
      const date = this.parseDate(b.bill_date || b.created_at);
      return date && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });
    const monthlySales = currentMonthBills.reduce((sum, b) => sum + (b.total || 0), 0);

    const lastMonthBills = bills.filter(b => {
      const date = this.parseDate(b.bill_date || b.created_at);
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      return date && date.getMonth() === lastMonth && date.getFullYear() === lastYear;
    });
    const lastMonthSales = lastMonthBills.reduce((sum, b) => sum + (b.total || 0), 0);

    const currentQuarterBills = bills.filter(b => {
      const date = this.parseDate(b.bill_date || b.created_at);
      return date && Math.floor(date.getMonth() / 3) === currentQuarter && date.getFullYear() === currentYear;
    });
    const quarterlySales = currentQuarterBills.reduce((sum, b) => sum + (b.total || 0), 0);

    const lastQuarterBills = bills.filter(b => {
      const date = this.parseDate(b.bill_date || b.created_at);
      const lastQuarter = currentQuarter === 0 ? 3 : currentQuarter - 1;
      const lastYear = currentQuarter === 0 ? currentYear - 1 : currentYear;
      return date && Math.floor(date.getMonth() / 3) === lastQuarter && date.getFullYear() === lastYear;
    });
    const lastQuarterSales = lastQuarterBills.reduce((sum, b) => sum + (b.total || 0), 0);

    const currentYearBills = bills.filter(b => {
      const date = this.parseDate(b.bill_date || b.created_at);
      return date && date.getFullYear() === currentYear;
    });
    const yearlySales = currentYearBills.reduce((sum, b) => sum + (b.total || 0), 0);

    const lastYearBills = bills.filter(b => {
      const date = this.parseDate(b.bill_date || b.created_at);
      return date && date.getFullYear() === currentYear - 1;
    });
    const lastYearSales = lastYearBills.reduce((sum, b) => sum + (b.total || 0), 0);

    // Calculate average bill (strictly from bills data)
    const totalBilledAmount = bills.reduce((sum, b) => sum + (b.total || 0), 0);
    const averageBill = bills.length > 0 ? totalBilledAmount / bills.length : 0;
    const recentAverage = bills.slice(-10).length > 0 ? bills.slice(-10).reduce((sum, b) => sum + (b.total || 0), 0) / bills.slice(-10).length : 0;

    return {
      monthlySales,
      monthlyChange: lastMonthSales > 0 ? ((monthlySales - lastMonthSales) / lastMonthSales) * 100 : 0,
      quarterlySales,
      quarterlyChange: lastQuarterSales > 0 ? ((quarterlySales - lastQuarterSales) / lastQuarterSales) * 100 : 0,
      yearlySales,
      yearlyChange: lastYearSales > 0 ? ((yearlySales - lastYearSales) / lastYearSales) * 100 : 0,
      averageBill,
      avgChange: recentAverage > 0 && averageBill > 0 ? ((recentAverage - averageBill) / averageBill) * 100 : 0
    };
  }

  /**
   * Get top performing products
   */
  getTopProducts(bills, limit = 5) {
    const productMap = {};

    bills.forEach(bill => {
      const items = bill.items || [];
      items.forEach(item => {
        const name = item.product_name || item.name || 'Unknown';
        if (!productMap[name]) {
          productMap[name] = { name, total: 0, count: 0 };
        }
        productMap[name].total += item.total || (item.quantity || 0) * (item.price || 0);
        productMap[name].count += item.quantity || 0;
      });
    });

    return Object.values(productMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }

  /**
   * Get top performing customers
   */
  getTopCustomers(bills, limit = 5) {
    const customerMap = {};

    bills.forEach(bill => {
      const name = bill.customer_name || bill.customer || 'Unknown';
      if (!customerMap[name]) {
        customerMap[name] = { name, total: 0, count: 0 };
      }
      customerMap[name].total += bill.total || 0;
      customerMap[name].count += 1;
    });

    return Object.values(customerMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }

  /**
   * Get overdue bills for reminders
   */
  getOverdueBills() {
    const isWorker = this.isWorkerUser();
    const excludedContactIds = isWorker ? new Set() : new Set(
      (this.billingData.contacts || [])
        .filter(c => c.exclude_from_stats === 1)
        .map(c => c.id)
    );

    const bills = (this.billingData.bills || []).filter(b => !excludedContactIds.has(b.customer_id));
    const payments = (this.billingData.payments || []).filter(p => !excludedContactIds.has(p.customer_id));
    const contacts = (this.billingData.contacts || []).filter(c => isWorker || c.exclude_from_stats !== 1);
    const now = new Date();

    // Map contacts by ID for easy opening balance lookup
    const contactMap = {};
    contacts.forEach(c => {
      contactMap[c.id] = c;
    });

    // Group bills and payments by customer_id
    const customerBills = {};
    const customerPayments = {};

    bills.forEach(b => {
      if (!customerBills[b.customer_id]) customerBills[b.customer_id] = [];
      customerBills[b.customer_id].push(b);
    });

    payments.forEach(p => {
      if (!customerPayments[p.customer_id]) customerPayments[p.customer_id] = [];
      customerPayments[p.customer_id].push(p);
    });

    const overdueList = [];

    // For each customer, calculate settlements chronologically
    Object.keys(customerBills).forEach(custId => {
      const cBills = customerBills[custId];
      const cPayments = customerPayments[custId] || [];
      const contact = contactMap[custId];
      const openingBalance = contact ? parseFloat(contact.opening_balance || 0) : 0;

      // Run FIFO settlement algorithm
      const sortedBills = [...cBills].sort((a, b) => {
        const dateA = this.parseDate(a.bill_date || a.created_at);
        const dateB = this.parseDate(b.bill_date || b.created_at);
        return (dateA || 0) - (dateB || 0);
      });

      const sortedPayments = [...cPayments].sort((a, b) => {
        const dateA = this.parseDate(a.payment_date || a.created_at);
        const dateB = this.parseDate(b.payment_date || b.created_at);
        return (dateA || 0) - (dateB || 0);
      });

      const pQueue = sortedPayments.map(p => ({
        id: p.id,
        total: parseFloat(p.amount || p.credit_amount || 0),
        remaining: parseFloat(p.amount || p.credit_amount || 0),
        date: this.parseDate(p.payment_date || p.created_at)
      }));

      let availableCredit = 0;
      let debtToSettleFirst = 0;

      if (openingBalance < 0) {
        availableCredit = Math.abs(openingBalance);
      } else {
        debtToSettleFirst = openingBalance;
      }

      while (debtToSettleFirst > 0 && pQueue.length > 0) {
        const p = pQueue[0];
        const consumed = Math.min(debtToSettleFirst, p.remaining);
        debtToSettleFirst -= consumed;
        p.remaining -= consumed;
        if (p.remaining <= 0) pQueue.shift();
      }

      sortedBills.forEach(bill => {
        const billAmount = parseFloat(bill.total || 0);
        let remainingToSettle = billAmount;

        if (availableCredit > 0) {
          const consumed = Math.min(remainingToSettle, availableCredit);
          remainingToSettle -= consumed;
          availableCredit -= consumed;
        }

        while (remainingToSettle > 0 && pQueue.length > 0) {
          const p = pQueue[0];
          const consumed = Math.min(remainingToSettle, p.remaining);
          remainingToSettle -= consumed;
          p.remaining -= consumed;
          if (p.remaining <= 0) pQueue.shift();
        }

        // If not settled (remaining balance > 0.01)
        if (remainingToSettle > 0.01) {
          const billDate = this.parseDate(bill.bill_date || bill.created_at);
          if (billDate) {
            const daysAgo = Math.floor((now - billDate) / (1000 * 60 * 60 * 24));
            // Overdue if older than 30 days from invoice date
            if (daysAgo > 30) {
              const key = bill.reference_no || `bill-${bill.created_at}`;
              overdueList.push({
                ...bill,
                remaining: remainingToSettle,
                billId: bill.reference_no || bill.invoice_no || `bill-${bill.id}`,
                customer: bill.customer_name || bill.customer || 'Unknown',
                amount: remainingToSettle, // Correct remaining amount
                billDate: billDate.toLocaleDateString(),
                daysOverdue: daysAgo - 30
              });
            }
          }
        }
      });
    });

    return overdueList;
  }

  /**
   * Inject CSS styles for dashboard
   */
  injectDashboardStyles() {
    if (document.getElementById('billing-dashboard-styles')) return;

    const link = document.createElement('link');
    link.id = 'billing-dashboard-styles';
    link.rel = 'stylesheet';
    link.href = '/modules/billing/css/dashboard.css';
    // document.head.appendChild(link); /* Disabled for Vite */
  }
}

// Make globally available
window.BillingDashboard = BillingDashboard;

