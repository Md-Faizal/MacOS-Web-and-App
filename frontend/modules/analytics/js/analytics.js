/**
 * AnalyticsApp - An analytics application built with AppWindow
 * Refactored to use multi-file architecture for better maintainability.
 */

const log = (typeof window !== 'undefined' && window.MacOSLogger)
  ? window.MacOSLogger.createScope('Analytics:Core')
  : { debug: () => {}, info: () => {}, warn: console.warn.bind(console), error: console.error.bind(console) };

class AnalyticsApp extends AppWindow {
  get viewContainer() {
    return this.activePanel || this.rootViewContainer;
  }
  set viewContainer(val) {
    this.rootViewContainer = val;
  }

  getOrCreateSubviewPanel(viewName) {
    if (!this._subviewPanels) this._subviewPanels = new Map();
    let panel = this._subviewPanels.get(viewName);
    if (!panel) {
      panel = document.createElement('div');
      panel.className = `analytics-subview-panel analytics-subview-${viewName}`;
      panel.style.width = '100%';
      panel.style.height = '100%';
      panel.style.display = 'none';
      panel.style.flexDirection = 'column';
      panel.style.overflow = 'auto';
      if (this.rootViewContainer) {
        this.rootViewContainer.appendChild(panel);
      }
      this._subviewPanels.set(viewName, panel);
    }
    return panel;
  }

  constructor(containerId, callbacks = {}, params = null) {
    const width = window.innerWidth;
    let config = { appId: 'analytics', appName: 'Analytics', containerId: containerId, callbacks: callbacks };
    
    if (width < 768) {
      const mobileSizes = AppWindow.calculateMobileSizing();
      config = { ...config, width: mobileSizes.width, height: mobileSizes.height };
    } else if (width < 1024) {
      config = { ...config, width: '550px', height: '500px' };
    } else {
      config = { ...config, width: '600px', height: '500px' };
    }
    
    super(config);
    this.window.classList.add('analytics-window');

    this.currentView = 'dashboard';
    this.currentCustomerId = null;
    this.initialParams = params;
    this.customers = [];
    
    // View Instances
    this.dashboardView = null;
    this.profileView = null;
    this.salesView = null;
    this.productsView = null;
    this.orderView = null;
    this.agingView = null;
    this.compView = null;
    this.complianceView = null;

    this.setupAnalyticsUI();
  }

  async setupAnalyticsUI() {
    this.buildAnalyticsLayout();
    this.setupHeaderControls();
    this.setupAnalyticsEventListeners();
    
    // Load initial data
    await this.refreshCustomerList();
    
    if (this.initialParams && this.initialParams.customerId) {
        this.switchView('customer-profile', this.initialParams.initialCustomerId || this.initialParams.customerId);
    } else {
      this.switchView('dashboard');
    }

    window.currentAnalyticsApp = this;

    if (typeof window !== 'undefined' && window.CoreDataBus) {
      this._dataBusBillingUnsub = window.CoreDataBus.subscribeDomain('billing:', (data) => {
        log.debug('[AnalyticsApp] Billing event received, refreshing active view & insights:', data?.domain, data?.action);
        this.refreshCustomerList().catch(() => {});
        if (this._subviewPanels) {
          this._subviewPanels.forEach((panel, name) => {
            if (name !== this.currentView) {
              delete panel.dataset.rendered;
            }
          });
        }
        // Active view immediate live re-render
        if (this.currentView === 'dashboard') {
          this.dashboardView?.render?.();
        } else if (this.currentView === 'customer-aging') {
          this.agingView?.render?.();
        } else if (this.currentView === 'sales-reports') {
          this.salesView?.render?.();
        } else if (this.currentView === 'compliance') {
          this.complianceView?.loadReportData?.();
        } else if (this.currentView === 'customer-profile' && this.currentCustomerId) {
          this.profileView?.render?.(this.currentCustomerId);
        }
      });

      this._dataBusContactsUnsub = window.CoreDataBus.subscribeDomain('contacts:', () => {
        log.debug('[AnalyticsApp] Contact event received, refreshing customer list');
        this.refreshCustomerList().catch(() => {});
      });

      this._dataBusOrdersUnsub = window.CoreDataBus.subscribeDomain('orders:', () => {
        log.debug('[AnalyticsApp] Order event received, refreshing order insights');
        if (this.currentView === 'order-analytics') {
          this.orderView?.render?.();
        }
      });
    }
  }

  handleDeepLink(params) {
    if (params && params.customerId) {
        this.switchView('customer-profile', params.customerId);
    }
  }

  buildAnalyticsLayout() {
    const contentArea = this.getContentArea();
    contentArea.style.display = 'flex';
    contentArea.style.overflow = 'hidden';
    contentArea.style.height = '100%';

    contentArea.innerHTML = `
      <div class="analytics-sidebar">
        <span class="analytics-sidebar-header">BI Reporting</span>
        <button class="analytics-menu-item active" data-view="dashboard">📊 Dashboard</button>
        <button class="analytics-menu-item" data-view="sales">📈 Sales Reports</button>
        <button class="analytics-menu-item" data-view="comparative">⚖️ Comparative Analysis</button>
        <button class="analytics-menu-item" data-view="orders">🚚 Order Funnel</button>
        <button class="analytics-menu-item" data-view="aging">👥 AR Aging & RFM</button>
        <button class="analytics-menu-item" data-view="products">📦 Product Velocity</button>
        <button class="analytics-menu-item" data-view="compliance">📜 AYUSH & GST Reports</button>
        
        <hr style="margin: 8px 0; border: none; border-top: 1px solid rgba(0,0,0,0.08);">
        
        <span class="analytics-sidebar-header">Customer Insights</span>
        <div class="analytics-customer-list">
          <div class="loading-spinner">Loading customers...</div>
        </div>
      </div>
      <div class="analytics-main">
        <div class="analytics-view-container">
          <!-- Content dynamic injection -->
        </div>
      </div>
    `;

    this.sidebar = contentArea.querySelector('.analytics-sidebar');
    this.sidebarList = contentArea.querySelector('.analytics-customer-list');
    this.rootViewContainer = contentArea.querySelector('.analytics-view-container');
    this._subviewPanels = new Map();
    this.activePanel = null;
  }

  setupHeaderControls() {
    const container = document.getElementById(this.containerId);
    const titleBar = container.querySelector('.app-title-bar');
    if (!titleBar) return;
    
    const leftControls = document.createElement('div');
    leftControls.className = 'analytics-left-controls';
    const expandBtn = document.createElement('button');
    expandBtn.className = 'analytics-header-btn';
    expandBtn.id = 'expandBtn';
    expandBtn.title = 'Show/Hide Sidebar';
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
    }
    
    const spacer = titleBar.querySelector('.title-spacer');
    const rightControls = document.createElement('div');
    rightControls.className = 'analytics-header-controls';
    
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'analytics-header-buttons';
    buttonsContainer.innerHTML = `
      <button class="analytics-header-btn" id="analyticsRefreshBtn" title="Refresh Data">↻</button>
      <button class="analytics-header-btn" id="analyticsPrintBtn" title="Print Report">⎙</button>
    `;
    
    const headerSearch = document.createElement('input');
    headerSearch.type = 'text';
    headerSearch.className = 'analytics-header-search';
    headerSearch.id = 'headerSearch';
    headerSearch.placeholder = 'Search Customers';
    
    rightControls.appendChild(buttonsContainer);
    rightControls.appendChild(headerSearch);
    
    if (spacer) {
      spacer.parentNode.replaceChild(rightControls, spacer);
    }
    
    this.headerSearch = headerSearch;
    headerSearch.addEventListener('input', (e) => this.filterCustomers(e.target.value));
  }

  setupAnalyticsEventListeners() {
    const expandBtn = document.getElementById('expandBtn');
    expandBtn?.addEventListener('click', () => {
      this.sidebar.classList.toggle('hidden');
    });

    this.sidebar.addEventListener('click', (e) => {
      const item = e.target.closest('.analytics-sidebar-item, .analytics-menu-item');
      if (!item) return;

      this.sidebar.querySelectorAll('.analytics-sidebar-item, .analytics-menu-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      if (item.dataset.view) {
        this.switchView(item.dataset.view);
      } else if (item.dataset.id) {
        this.switchView('customer-profile', item.dataset.id);
      }
    });

    document.getElementById('analyticsRefreshBtn')?.addEventListener('click', () => this.refreshAllData());
    document.getElementById('analyticsPrintBtn')?.addEventListener('click', () => window.print());
  }

  isExcludedCustomer(contact) {
    if (!contact) return false;
    return contact.exclude_from_stats === 1 || contact.exclude_from_stats === '1' || contact.exclude_from_stats === true;
  }

  normalizeContactsList(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.data?.items)) return payload.data.items;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  }

  async refreshCustomerList() {
    try {
      const resp = await fetch('/api/contacts');
      const payload = await resp.json();
      const list = this.normalizeContactsList(payload);
      this.customers = list.filter(c => (!c.type || c.type === 'Customer' || c.type === 'customer') && !this.isExcludedCustomer(c));
      this.renderCustomerList(this.customers);
    } catch (err) {
      console.error('Failed to load customers:', err);
      if (this.sidebarList) {
        this.sidebarList.innerHTML = '<div style="padding:20px; text-align:center; opacity:0.5; font-size:12px;">Unable to load customers</div>';
      }
    }
  }

  renderCustomerList(customers) {
    if (!this.sidebarList) return;

    const list = Array.isArray(customers) ? customers : [];

    if (list.length === 0) {
      this.sidebarList.innerHTML = '<div style="padding:20px; text-align:center; opacity:0.5; font-size:12px;">No customers found</div>';
      return;
    }

    this.sidebarList.innerHTML = list.map(c => `
      <button class="analytics-sidebar-item" data-id="${c.id}">
        <span class="customer-item-name">${c.name}</span>
        <span class="customer-item-sales">ID: ${c.id} • ${c.active || 'INACTIVE'}</span>
      </button>
    `).join('');
  }

  filterCustomers(query) {
    const filtered = this.customers.filter(c => 
      c.name.toLowerCase().includes(query.toLowerCase()) || 
      c.id.toString().includes(query)
    );
    this.renderCustomerList(filtered);
  }

  async switchView(view, id = null) {
    this.currentView = view;
    this.currentCustomerId = id;

    // Highlight active sidebar item
    if (this.sidebar) {
      this.sidebar.querySelectorAll('.analytics-menu-item').forEach(item => {
        if (item.dataset.view === view) item.classList.add('active');
        else item.classList.remove('active');
      });
    }

    const targetPanel = this.getOrCreateSubviewPanel(view);
    if (this._subviewPanels) {
      this._subviewPanels.forEach((panel, name) => {
        panel.style.display = (name === view) ? 'flex' : 'none';
      });
    }
    this.activePanel = targetPanel;

    const needsRender = !targetPanel.dataset.rendered || (view === 'customer-profile' && targetPanel.dataset.customerId !== String(id));

    if (needsRender) {
      switch(view) {
        case 'dashboard':
          if (!this.dashboardView) this.dashboardView = new AnalyticsDashboard(this);
          this.dashboardView.viewContainer = targetPanel;
          await this.dashboardView.render();
          break;
        case 'customer-profile':
          if (!this.profileView) this.profileView = new CustomerProfileView(this);
          this.profileView.viewContainer = targetPanel;
          targetPanel.dataset.customerId = String(id);
          await this.profileView.render(id);
          break;
        case 'sales':
          if (!this.salesView) this.salesView = new SalesReportsView(this);
          this.salesView.viewContainer = targetPanel;
          await this.salesView.render();
          break;
        case 'comparative':
          if (!this.compView) this.compView = new ComparativeAnalyticsView(this);
          this.compView.viewContainer = targetPanel;
          await this.compView.render();
          break;
        case 'orders':
          if (!this.orderView) this.orderView = new OrderAnalyticsView(this);
          this.orderView.viewContainer = targetPanel;
          await this.orderView.render();
          break;
        case 'aging':
          if (!this.agingView) this.agingView = new CustomerAgingView(this);
          this.agingView.viewContainer = targetPanel;
          await this.agingView.render();
          break;
        case 'products':
          if (!this.productsView) this.productsView = new ProductMetricsView(this);
          this.productsView.viewContainer = targetPanel;
          await this.productsView.render();
          break;
        case 'compliance':
          if (!this.complianceView) {
            const ViewClass = window.ComplianceReportsView || (await import('/modules/analytics/js/compliance-reports.js')).ComplianceReportsView;
            this.complianceView = new ViewClass(this);
          }
          this.complianceView.viewContainer = targetPanel;
          await this.complianceView.render();
          break;
      }
      targetPanel.dataset.rendered = 'true';
    }
  }

  async refreshAllData() {
    await this.refreshCustomerList();
    this.switchView(this.currentView, this.currentCustomerId);
  }
}

window.AnalyticsApp = AnalyticsApp;
