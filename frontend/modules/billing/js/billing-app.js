/**
 * BillingApp - A billing application built with AppWindow
 * Extends the standardized AppWindow for billing functionality
 * Features: Create bills, edit bills, manage invoices, view history
 * 
 * Dependencies:
 * - ledger.js - Ledger view functionality (LedgerView class)
 * - ledger.css - Ledger styling
 */
 
/**
 * BillingAPI - Handles communication with the Go backend
 */
export class BillingAPI {
  constructor(baseURL = '/api') {
    this.baseURL = baseURL;
    // Use a default API key for development
    this.apiKey = 'test-api-key-1234';
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
      ...options.headers
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API Request Failed (${endpoint}):`, error);
      throw error;
    }
  }

  // Products
  async getProducts() {
    return this.request('/products');
  }

  async createProduct(product) {
    return this.request('/products', {
      method: 'POST',
      body: JSON.stringify(product)
    });
  }

  async getProduct(id) {
    return this.request(`/products/${id}`);
  }

  async updateProduct(id, product) {
    return this.request(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(product)
    });
  }

  async deleteProduct(id) {
    return this.request(`/products/${id}`, {
      method: 'DELETE'
    });
  }

  // Bills (Transactions)
  async getBills() {
    return this.request('/billing');
  }

  async createBill(bill) {
    return this.request('/billing', {
      method: 'POST',
      body: JSON.stringify(bill)
    });
  }

  async getBill(id) {
    return this.request(`/billing/${id}`);
  }

  async updateBill(id, bill) {
    return this.request(`/billing/${id}`, {
      method: 'PUT',
      body: JSON.stringify(bill)
    });
  }

  async deleteBill(id) {
    return this.request(`/billing/${id}`, {
      method: 'DELETE'
    });
  }

  // Payments
  async getPayments() {
    return this.request('/billing/invoices/payments');
  }

  async getTotalCollected() {
    return this.request('/billing/invoices/payments/total-collected');
  }

  async getCustomerOutstanding(customerName) {
    return this.request(`/billing/invoices/customers/outstanding?customer_name=${encodeURIComponent(customerName)}`);
  }

  async createPayment(payment) {
    return this.request('/billing/payments', {
      method: 'POST',
      body: JSON.stringify(payment)
    });
  }

  async deletePayment(id) {
    return this.request(`/billing/payments/${id}`, {
      method: 'DELETE'
    });
  }

  // Credit Notes
  async getCreditNotes() {
    return this.request('/billing/creditnotes');
  }

  async createCreditNote(creditNote) {
    return this.request('/billing/creditnotes', {
      method: 'POST',
      body: JSON.stringify(creditNote)
    });
  }

  // Contacts
  async getContacts() {
    return this.request('/contacts');
  }

  // Categories
  async getCategories() {
    return this.request('/products/categories');
  }

  async createCategory(category) {
    return this.request('/products/categories', {
      method: 'POST',
      body: JSON.stringify(category)
    });
  }

  async getCategory(id) {
    return this.request(`/products/categories/${id}`);
  }

  async updateCategory(id, category) {
    return this.request(`/products/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(category)
    });
  }

  async deleteCategory(id) {
    return this.request(`/products/categories/${id}`, {
      method: 'DELETE'
    });
  }

  // Variants
  async getVariants(productId) {
    return this.request(`/products/${productId}/variants`);
  }

  async createVariant(productId, variant) {
    return this.request(`/products/${productId}/variants`, {
      method: 'POST',
      body: JSON.stringify(variant)
    });
  }

  async updateVariant(variantId, variant) {
    return this.request(`/products/variants/${variantId}`, {
      method: 'PUT',
      body: JSON.stringify(variant)
    });
  }

  async deleteVariant(variantId) {
    return this.request(`/products/variants/${variantId}`, {
      method: 'DELETE'
    });
  }

  // Batches
  async getBatches(variantId) {
    return this.request(`/products/variants/${variantId}/batches`);
  }

  async createBatch(variantId, batch) {
    return this.request(`/products/variants/${variantId}/batches`, {
      method: 'POST',
      body: JSON.stringify(batch)
    });
  }

  async updateBatch(batchId, batch) {
    return this.request(`/products/batches/${batchId}`, {
      method: 'PUT',
      body: JSON.stringify(batch)
    });
  }

  async deleteBatch(batchId) {
    return this.request(`/products/batches/${batchId}`, {
      method: 'DELETE'
    });
  }

  // Invoices
  async getInvoice(id) {
    return this.request(`/billing/invoices/${id}`);
  }

  async updateInvoice(id, invoiceData) {
    return this.request(`/billing/invoices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(invoiceData)
    });
  }

  // Health Check
  async health() {
    return this.request('/health');
  }
}

export class BillingApp extends AppWindow {
  constructor(containerId, callbacks = {}, params = null) {
    const width = window.innerWidth;
    let config = { appId: 'billing', appName: 'Billing', containerId: containerId, callbacks: callbacks };
    
    if (width < 768) {
      const mobileSizes = AppWindow.calculateMobileSizing();
      config = { ...config, width: mobileSizes.width, height: mobileSizes.height };
    } else if (width < 1024) {
      config = { ...config, width: '550px', height: '500px' };
    } else {
      config = { ...config, width: '600px', height: '500px' };
    }
    
    super(config);

    this.billingData = this.loadBillingData();
    this.api = new BillingAPI(); // Initialize API client
    this.apiEnabled = false; // Will be set to true when backend is ready
    this.currentView = 'dashboard';
    this.currentBillId = null;
    this.initialParams = params;
    
    // Initialize BillEditor for create/edit operations
    this.billEditor = null;
    
    this.setupBillingUI();
    
    // Listen for tab focus/visibility change to immediately refresh data
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.ensureDataUpToDate();
      }
    });
    window.addEventListener('focus', () => {
      this.ensureDataUpToDate();
    });

    // Listen for worker badge toggle
    window.addEventListener('worker-badges-toggle-changed', () => {
      if (this.currentViewInstance && typeof this.currentViewInstance.render === 'function') {
        this.currentViewInstance.render();
      }
    });

    this.checkBackendConnection();
  }

  isWorkerUser() {
    return (window.currentUserData?.role || sessionStorage.getItem('macos_user_role') || localStorage.getItem('macos_user_role')) === 'worker';
  }

  isExcluded(contact) {
    if (!contact) return false;
    return contact.exclude_from_stats === 1 || contact.exclude_from_stats === '1' || contact.exclude_from_stats === true;
  }

  getScopedBillingData() {
    const isWorker = this.isWorkerUser();
    const allContacts = this.billingData?.contacts || [];
    const allBills = this.billingData?.bills || [];
    const allPayments = this.billingData?.payments || [];
    const allOrders = this.billingData?.orders || [];

    const excludedContactIds = new Set(
      allContacts.filter(c => this.isExcluded(c)).map(c => c.id).filter(Boolean)
    );
    const excludedContactNames = new Set(
      allContacts.filter(c => this.isExcluded(c)).map(c => c.name).filter(Boolean)
    );

    if (!isWorker) {
      // Admin/Owner: Full access to all contacts, bills, payments, and orders for UI & interaction
      return {
        contacts: allContacts,
        bills: allBills,
        payments: allPayments,
        orders: allOrders,
        allContacts,
        statsContacts: allContacts.filter(c => !this.isExcluded(c)),
        statsBills: allBills.filter(b => !excludedContactIds.has(b.customer_id) && !excludedContactNames.has(b.customer_name)),
        statsPayments: allPayments.filter(p => !excludedContactIds.has(p.customer_id) && !excludedContactNames.has(p.customer_name)),
        statsOrders: allOrders.filter(o => !excludedContactIds.has(o.customer_id) && !excludedContactNames.has(o.customer_name)),
        excludedContactIds,
        excludedContactNames,
        rawBills: allBills,
        rawPayments: allPayments,
        rawOrders: allOrders
      };
    }

    // Worker: Strictly scoped to accessible contacts
    const accessibleContactIds = new Set(allContacts.map(c => c.id).filter(Boolean));
    const accessibleContactNames = new Set(allContacts.map(c => c.name).filter(Boolean));

    const bills = allBills.filter(b => 
      (b.customer_id && accessibleContactIds.has(b.customer_id)) || 
      (b.customer_name && accessibleContactNames.has(b.customer_name))
    );

    const payments = allPayments.filter(p => 
      (p.customer_id && accessibleContactIds.has(p.customer_id)) || 
      (p.customer_name && accessibleContactNames.has(p.customer_name))
    );

    const orders = allOrders.filter(o => 
      (o.customer_id && accessibleContactIds.has(o.customer_id)) || 
      (o.customer_name && accessibleContactNames.has(o.customer_name))
    );

    return {
      contacts: allContacts,
      bills,
      payments,
      orders,
      allContacts,
      statsContacts: allContacts.filter(c => !this.isExcluded(c)),
      statsBills: bills.filter(b => !excludedContactIds.has(b.customer_id) && !excludedContactNames.has(b.customer_name)),
      statsPayments: payments.filter(p => !excludedContactIds.has(p.customer_id) && !excludedContactNames.has(p.customer_name)),
      statsOrders: orders.filter(o => !excludedContactIds.has(o.customer_id) && !excludedContactNames.has(o.customer_name)),
      excludedContactIds,
      excludedContactNames,
      rawBills: allBills,
      rawPayments: allPayments,
      rawOrders: allOrders
    };
  }

  async checkBackendConnection() {
    try {
      const health = await this.api.health();
      if (health.status === 'healthy') {
        this.apiEnabled = true;
        console.log('✅ Backend connected successfully');
        // Load billing data from API when backend is available
        try {
          await this.loadBillingDataFromAPI();
          console.log('✅ Billing data loaded from API');
        } catch (e) {
          console.warn('⚠ Failed to load billing data from API:', e.message);
        }
      }
    } catch (error) {
      console.error('❌ Backend unavailable, cannot continue:', error.message);
      this.apiEnabled = false;
      alert('Error: Billing system requires backend API connection. Please ensure the server is running.');
      return;
    }

    // Render the dashboard with API data
    this.renderDashboard();
    
    // If we're not on dashboard, only refresh views that don't have active user input
    const inputViews = ['create', 'edit', 'payment-credit'];
    if (this.currentView && this.currentView !== 'dashboard' && !inputViews.includes(this.currentView)) {
      this.refreshCurrentView();
    }

    // Handle initial deep link after data is loaded
    if (this.initialParams) {
      setTimeout(() => {
        this.handleDeepLink(this.initialParams);
        this.initialParams = null; // Clear after use
      }, 500); // Small delay to ensure everything is initialized
    }
  }

  handleDeepLink(params) {
    if (!params) return;

    const supportedViews = ['orders', 'ledger', 'create', 'payment-credit'];
    if (params.view && supportedViews.includes(params.view)) {
      this.switchView(params.view, params);
    }
  }

  refreshCurrentView() {
    // Re-render the current view with the newly loaded data
    if (this.currentView) {
      console.log(`🔄 Refreshing view: ${this.currentView}`);
      this.renderView(this.currentView);
    }
  }

  setupBillingUI() {
    console.log('[SETUP] setupBillingUI called - checking for dependencies...');
    console.log('[SETUP]   BillEditor type:', typeof BillEditor);
    console.log('[SETUP]   EditBillsPayments type:', typeof EditBillsPayments);
    
    if (typeof BillEditor === 'undefined') {
      const error = 'BillEditor class not found. Ensure new-bill.js is loaded.';
      console.error('[SETUP] ERROR: ' + error);
      throw new Error(error);
    }
    if (typeof EditBillsPayments === 'undefined') {
      const error = 'EditBillsPayments class not found. Ensure edit-bills-payments.js is loaded.';
      console.error('[SETUP] ERROR: ' + error);
      throw new Error(error);
    }
    if (typeof OrdersView === 'undefined') {
      const error = 'OrdersView class not found. Ensure new-order.js is loaded.';
      console.error('[SETUP] ERROR: ' + error);
      throw new Error(error);
    }
    if (typeof LedgerView === 'undefined') {
      const error = 'LedgerView class not found. Ensure ledger.js is loaded.';
      console.error('[SETUP] ERROR: ' + error);
      throw new Error(error);
    }
    if (typeof BillingDashboard === 'undefined') {
      const error = 'BillingDashboard class not found. Ensure dashboard.js is loaded.';
      console.error('[SETUP] ERROR: ' + error);
      throw new Error(error);
    }
    if (typeof PaymentCreditNote === 'undefined') {
      const error = 'PaymentCreditNote class not found. Ensure payment-credit-note.js is loaded.';
      console.error('[SETUP] ERROR: ' + error);
      throw new Error(error);
    }
    if (typeof HistoryView === 'undefined') {
      const error = 'HistoryView class not found. Ensure history.js is loaded.';
      console.error('[SETUP] ERROR: ' + error);
      throw new Error(error);
    }

    console.log('[SETUP] All dependencies found - proceeding with setup');

    // Inject billing-specific styles
    this.injectBillingStyles();

    // Build the billing UI
    this.buildBillingLayout();

    // Initialize BillEditor for bill creation
    this.billEditor = new BillEditor(this);

    // Initialize EditBillsPayments for bill editing
    this.editBillsPayments = new EditBillsPayments(this);

    // Add custom header controls
    this.setupHeaderControls();

    // Setup billing-specific event listeners
    this.setupBillingEventListeners();

    // NOTE: renderDashboard() is deferred until after checkBackendConnection() completes
    // This ensures the first view renders with fresh API data if available

    // Store reference for home.html
    window.currentBillingApp = this;
  }

  buildBillingLayout() {
    const contentArea = this.getContentArea();
    contentArea.innerHTML = `
      <!-- Sidebar Navigation -->
      <div class="billing-sidebar">
        <button class="billing-menu-item active" data-view="dashboard">📊 Dashboard</button>
        <hr style="margin: 8px 0; border: none; border-top: 1px solid rgba(0,0,0,0.1);">
        <span style="display: block; padding: 8px 12px; font-size: 11px; font-weight: 600; color: #999; text-transform: uppercase;">Ledger</span>
        <button class="billing-menu-item" data-view="ledger">📈 Ledger</button>
        <button class="billing-menu-item" data-view="orders">🧾 New Orders</button>
        <span style="display: block; padding: 8px 12px; font-size: 11px; font-weight: 600; color: #999; text-transform: uppercase;">Transactions</span>
        <button class="billing-menu-item" data-view="create">➕ New Bill</button>
        <button class="billing-menu-item" data-view="edit">✏️ Edit Bills/Payments</button>
        <button class="billing-menu-item" data-view="payment-credit">💳 Payment/Credit Note</button>
        <span style="display: block; padding: 8px 12px; font-size: 11px; font-weight: 600; color: #999; text-transform: uppercase;">Archives</span>
        <button class="billing-menu-item" data-view="history">📚 History</button>
      </div>

      <!-- Main View -->
      <div class="billing-main">
        <div class="billing-view-container">
          <div class="billing-empty-state">
            <div>
              <p style="margin: 0 0 8px 0; font-size: 18px;">💳</p>
              <p style="margin: 0;">BillingDashboard</p>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #bca3af;">Manage your company bills and invoices</p>
            </div>
          </div>
        </div>
      </div>
    `;

    // Setup element references
    this.sidebar = contentArea.querySelector('.billing-sidebar');
    this.mainView = contentArea.querySelector('.billing-main');
    this.viewContainer = contentArea.querySelector('.billing-view-container');
    this.menuItems = contentArea.querySelectorAll('.billing-menu-item');
  }

  setupHeaderControls() {
    const container = document.getElementById(this.containerId);
    const titleBar = container.querySelector('.app-title-bar');
    
    if (!titleBar) return;
    
    // Create left controls group (after traffic lights)
    const leftControls = document.createElement('div');
    leftControls.className = 'billing-left-controls';
    const expandBtn = document.createElement('button');
    expandBtn.className = 'billing-header-btn';
    expandBtn.id = 'billingExpandBtn';
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
    
    // Insert left controls after traffic lights
    const trafficLights = titleBar.querySelector('.app-traffic-lights');
    titleBar.insertBefore(leftControls, trafficLights.nextSibling);
    
    // Create right controls group (replace title-spacer)
    const spacer = titleBar.querySelector('.title-spacer');
    const rightControls = document.createElement('div');
    rightControls.className = 'billing-header-controls';
    
    // Create buttons container (Edit, Add)
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'billing-header-buttons';
    buttonsContainer.innerHTML = `
      <button class="billing-header-btn edit-btn-text" id="billingEditBtn" title="Edit Bill">Edit</button>
      <button class="billing-header-btn" id="billingAddBtn" title="Add Bill">+</button>
    `;
    
    // Create search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'billing-header-search';
    searchInput.id = 'billingHeaderSearch';
    searchInput.placeholder = 'Search bills';
    
    rightControls.appendChild(buttonsContainer);
    rightControls.appendChild(searchInput);
    
    // Replace spacer with right controls
    spacer.parentNode.replaceChild(rightControls, spacer);
    
    // Store references
    this.searchInput = searchInput;
    this.expandBtn = expandBtn;
    
    // Setup sidebar toggle functionality
    this.expandBtn.addEventListener('click', () => this.toggleSidebar());
    
    // Setup header button listeners
    const editBtn = document.getElementById('billingEditBtn');
    const addBtn = document.getElementById('billingAddBtn');
    
    if (editBtn) {
      editBtn.addEventListener('click', () => this.switchView('edit'));
    }
    
    if (addBtn) {
      addBtn.addEventListener('click', () => this.switchView('create'));
    }

    // Setup search functionality
    if (this.searchInput) {
      this.setupSearchFunctionality();
    }
  }

  setupSearchFunctionality() {
    if (!this.searchInput) return;

    // Set unified placeholder
    this.searchInput.placeholder = 'Search bills, payments, credits, orders...';

    // Create dropdown for search results FIRST
    this.searchDropdown = document.createElement('div');
    this.searchDropdown.id = 'billingSearchDropdown';
    this.searchDropdown.className = 'search-dropdown';
    this.searchDropdown.style.cssText = `
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      right: 0;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      max-height: 400px;
      overflow-y: auto;
      display: none;
      z-index: 1000;
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    `;
    this.searchInput.parentElement.style.position = 'relative';
    this.searchInput.parentElement.appendChild(this.searchDropdown);

    // Debounce search input to avoid too many calls
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
      }, 300);
    });

    // Handle Enter key for instant search
    this.searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        clearTimeout(searchTimeout);
        const query = e.target.value.trim().toLowerCase();
        this.performGlobalSearchWithDropdown(query);
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#billingHeaderSearch') && !e.target.closest('#billingSearchDropdown')) {
        this.searchDropdown.style.display = 'none';
      }
    });
  }

  performGlobalSearch(query) {
    if (!query) {
      this.clearGlobalSearch();
      return;
    }

    // Search in all bills, payments, and credit notes across the system
    const results = this.searchAllBillsPaymentsCredits(query);
    
    if (results.length > 0) {
      // Navigate to ledger view and apply search filter
      this.switchView('ledger');
      // After view renders, apply the search
      setTimeout(() => {
        this.applyLedgerSearchFilter(query);
      }, 500);
    } else {
      // Show no results message
      this.showNoResultsMessage(query);
    }
  }

  async performGlobalSearchWithDropdown(query) {
    if (!query || !this.searchDropdown) {
      if (this.searchDropdown) {
        this.searchDropdown.style.display = 'none';
      }
      this.clearGlobalSearch();
      return;
    }

    try {
      // If products not loaded yet, fetch them now
      if (!this.billingData || !this.billingData.products || this.billingData.products.length === 0) {
        try {
          const prods = await this.api.getProducts();
          if (this.billingData) {
            this.billingData.products = Array.isArray(prods)
              ? prods
              : (Array.isArray(prods?.items)
                ? prods.items
                : (Array.isArray(prods?.data?.items)
                  ? prods.data.items
                  : (Array.isArray(prods?.data) ? prods.data : [])));
          }
        } catch (e) {
          console.warn('Could not fetch products on demand for search:', e.message);
        }
      }

      // Search in all bills, payments, credit notes, and products
      const results = this.searchAllBillsPaymentsCredits(query);
      
      // Populate dropdown with results
      this.populateSearchDropdown(results);
      
      if (results.length === 0) {
        this.searchDropdown.innerHTML = `<div style="padding: 12px 16px; color: #999; text-align: center;">No results found</div>`;
        this.searchDropdown.style.display = 'block';
      }
    } catch (error) {
      console.error('Global search dropdown error:', error);
      if (this.searchDropdown) {
        this.searchDropdown.innerHTML = `<div style="padding: 12px 16px; color: #d9534f; text-align: center;">Search error</div>`;
        this.searchDropdown.style.display = 'block';
      }
    }
  }

  populateSearchDropdown(results) {
    try {
      if (!this.searchDropdown) {
        console.warn('Search dropdown not initialized');
        return;
      }

      this.searchDropdown.innerHTML = '';
      
      if (results.length === 0) {
        return;
      }

      // Group results by type
      const grouped = {
        product: [],
        bill: [],
        payment: [],
        credit: [],
        order: []
      };

      results.forEach(result => {
        if (result && result.type) {
          grouped[result.type].push(result);
        }
      });

      // Add products
      if (grouped.product.length > 0) {
        const prodHeader = document.createElement('div');
        prodHeader.style.cssText = 'padding: 8px 16px; background: #f5f5f5; font-weight: bold; font-size: 11px; color: #666; text-transform: uppercase;';
        prodHeader.textContent = `Products (${grouped.product.length})`;
        this.searchDropdown.appendChild(prodHeader);

        grouped.product.forEach(result => {
          const item = this.createDropdownItem(result, 'product');
          if (item) this.searchDropdown.appendChild(item);
        });
      }

      // Add bills
      if (grouped.bill.length > 0) {
        const billHeader = document.createElement('div');
        billHeader.style.cssText = 'padding: 8px 16px; background: #f5f5f5; font-weight: bold; font-size: 11px; color: #666; text-transform: uppercase;';
        billHeader.textContent = 'Bills';
        this.searchDropdown.appendChild(billHeader);

        grouped.bill.forEach(result => {
          const item = this.createDropdownItem(result, 'bill');
          if (item) this.searchDropdown.appendChild(item);
        });
      }

      // Add payments
      if (grouped.payment.length > 0) {
        const payHeader = document.createElement('div');
        payHeader.style.cssText = 'padding: 8px 16px; background: #f5f5f5; font-weight: bold; font-size: 11px; color: #666; text-transform: uppercase; margin-top: 8px;';
        payHeader.textContent = 'Payments';
        this.searchDropdown.appendChild(payHeader);

        grouped.payment.forEach(result => {
          const item = this.createDropdownItem(result, 'payment');
          if (item) this.searchDropdown.appendChild(item);
        });
      }

      // Add credit notes
      if (grouped.credit.length > 0) {
        const creditHeader = document.createElement('div');
        creditHeader.style.cssText = 'padding: 8px 16px; background: #f5f5f5; font-weight: bold; font-size: 11px; color: #666; text-transform: uppercase; margin-top: 8px;';
        creditHeader.textContent = 'Credit Notes';
        this.searchDropdown.appendChild(creditHeader);

        grouped.credit.forEach(result => {
          const item = this.createDropdownItem(result, 'credit');
          if (item) this.searchDropdown.appendChild(item);
        });
      }

      // Add orders
      if (grouped.order.length > 0) {
        const orderHeader = document.createElement('div');
        orderHeader.style.cssText = 'padding: 8px 16px; background: #f5f5f5; font-weight: bold; font-size: 11px; color: #666; text-transform: uppercase; margin-top: 8px;';
        orderHeader.textContent = 'Orders';
        this.searchDropdown.appendChild(orderHeader);

        grouped.order.forEach(result => {
          const item = this.createDropdownItem(result, 'order');
          if (item) this.searchDropdown.appendChild(item);
        });
      }

      this.searchDropdown.style.display = 'block';
    } catch (error) {
      console.error('Populate dropdown error:', error);
    }
  }

  createDropdownItem(result, type) {
    try {
      if (!result || !result.data) return null;

      const item = document.createElement('div');
      item.style.cssText = `
        padding: 12px 16px;
        border-bottom: 1px solid #f0f0f0;
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 13px;
      `;
      item.onmouseover = () => item.style.backgroundColor = '#f9f9f9';
      item.onmouseout = () => item.style.backgroundColor = 'transparent';

      const data = result.data;
      let displayText = '';
      let secondaryText = '';

      if (type === 'product') {
        const prod = data;
        const variantCount = (prod.variants && Array.isArray(prod.variants)) ? prod.variants.length : 0;
        const variantsList = (prod.variants && Array.isArray(prod.variants)) ? prod.variants.map(v => v.packSize || `${v.pack_size_value || ''} ${v.pack_size_type || ''}`).join(', ') : '';
        
        let min = Infinity, max = -Infinity, found = false;
        if (prod.variants && Array.isArray(prod.variants)) {
          prod.variants.forEach(v => {
            if (v.batches && Array.isArray(v.batches)) {
              v.batches.forEach(b => {
                const mrp = parseFloat(b.mrp || 0);
                if (mrp > 0) {
                  if (mrp < min) min = mrp;
                  if (mrp > max) max = mrp;
                  found = true;
                }
              });
            }
          });
        }
        const priceDisplay = found ? (min === max ? `₹${min.toFixed(2)}` : `₹${min.toFixed(2)} - ₹${max.toFixed(2)}`) : (prod.mrp ? `₹${parseFloat(prod.mrp).toFixed(2)}` : '');

        displayText = `${prod.name}${prod.odia_name ? ` (${prod.odia_name})` : ''}`;
        secondaryText = `Category: ${prod.category_name || prod.category || 'N/A'} | ${variantCount} variant(s)${variantsList ? ` (${variantsList})` : ''}${priceDisplay ? ` | ${priceDisplay}` : ''}`;
        if (result.matchedDetails) {
          secondaryText += ` | 🔍 ${result.matchedDetails}`;
        }
      } else if (type === 'bill') {
        displayText = `${data.customer_name || 'Unknown'}`;
        secondaryText = `Invoice: ${data.invoice_no || 'N/A'} | ₹${data.total || '0'}`;
      } else if (type === 'payment') {
        displayText = `${data.customer_name || 'Unknown'}`;
        secondaryText = `Payment: ${data.reference_number || data.reference || 'N/A'} | ₹${data.amount || '0'}`;
      } else if (type === 'credit') {
        displayText = `${data.customer_name || 'Unknown'}`;
        secondaryText = `Credit: ${data.reference_number || data.reference || 'N/A'} | ₹${data.credit_amount || data.amount || '0'}`;
      } else if (type === 'order') {
        displayText = `${data.customer_name || 'Unknown'}`;
        secondaryText = `Order: ${data.order_number || data.id || 'N/A'} | Status: ${data.status || 'Pending'}`;
      }

      item.innerHTML = `
        <div style="font-weight: 500; color: #222;">${displayText}</div>
        <div style="font-size: 12px; color: #999; margin-top: 2px;">${secondaryText}</div>
      `;

      item.addEventListener('click', () => {
        this.handleDropdownItemClick(result, type);
      });

      return item;
    } catch (error) {
      console.error('Create dropdown item error:', error);
      return null;
    }
  }

  handleDropdownItemClick(result, type) {
    try {
      // Close dropdown
      if (this.searchDropdown) {
        this.searchDropdown.style.display = 'none';
      }
      if (this.searchInput) {
        this.searchInput.value = '';
      }

      if (type === 'product') {
        const prodId = result.data.id;
        const productAppIcon = document.querySelector('[data-app="product-list"], [data-page="product-list"]');
        if (productAppIcon) {
          productAppIcon.click();
        }
        setTimeout(() => {
          if (window.currentProductApp) {
            window.currentProductApp.switchView('all');
            setTimeout(() => {
              const card = document.querySelector(`[data-product-id="${prodId}"]`);
              if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.style.transition = 'all 0.3s ease';
                card.style.borderColor = '#0071e3';
                card.style.boxShadow = '0 0 0 3px rgba(0, 113, 227, 0.3)';
                setTimeout(() => {
                  card.style.borderColor = '';
                  card.style.boxShadow = '';
                }, 3000);
              }
            }, 300);
          }
        }, 300);
        return;
      }

      // For orders, navigate to orders view
      if (type === 'order') {
        this.switchView('orders');
      } else {
        // For bills, payments, credits - navigate to ledger
        this.switchView('ledger');
      }

      // Scroll to and highlight the item (wait longer for view to load)
      setTimeout(() => {
        this.navigateToItem(result, type);
      }, 1500);
    } catch (error) {
      console.error('Handle dropdown click error:', error);
    }
  }

  navigateToItem(result, type) {
    try {
      // Close billing app sidebar on mobile after opening a search result
      if (window.innerWidth < 768) {
        if (this.sidebar && !this.sidebar.classList.contains('hidden')) {
          this.sidebar.classList.add('hidden');
        }
      }
      
      if (!result || !result.data) return;

      const data = result.data;
      let selector = '';
      let targetElement = null;

      if (type === 'bill') {
        selector = `[data-bill-id="${data.id}"], .ledger-bill-record[data-invoice="${data.invoice_no}"]`;
        targetElement = document.querySelector(selector);
      } else if (type === 'payment') {
        selector = `[data-payment-id="${data.id}"]`;
        targetElement = document.querySelector(selector);
      } else if (type === 'credit') {
        selector = `[data-payment-id="${data.id}"]`;
        targetElement = document.querySelector(selector);
      } else if (type === 'order') {
        selector = `[data-order-id="${data.id}"], .orders-order-record[data-order-id="${data.id}"]`;
        targetElement = document.querySelector(selector);
      }

      // If specific element not found, try clicking the customer in sidebar
      if (!targetElement) {
        const customerName = data.customer_name;
        const sidebarItems = document.querySelectorAll('#ledgerSidebarList .ledger-sidebar-item');
        sidebarItems.forEach(item => {
          if (item.textContent.includes(customerName)) {
            targetElement = item;
          }
        });
      }

      // If element still not found, poll for it (ledger might be loading)
      if (!targetElement) {
        this.pollAndHighlightElement(selector, data.customer_name);
        return;
      }

      // Scroll and highlight
      this.highlightElement(targetElement);
    } catch (error) {
      console.error('Navigate to item error:', error);
    }
  }

  pollAndHighlightElement(selector, customerName, maxAttempts = 20, interval = 500) {
    let attempts = 0;
    
    const poll = () => {
      attempts++;
      let targetElement = null;

      // Try selector first
      if (selector) {
        targetElement = document.querySelector(selector);
      }

      // If not found, try customer name as fallback
      if (!targetElement && customerName) {
        const sidebarItems = document.querySelectorAll('#ledgerSidebarList .ledger-sidebar-item');
        for (const item of sidebarItems) {
          if (item.textContent.includes(customerName)) {
            targetElement = item;
            break;
          }
        }
      }

      if (targetElement) {
        // Element found, highlight it
        this.highlightElement(targetElement);
      } else if (attempts < maxAttempts) {
        // Keep polling
        setTimeout(poll, interval);
      } else {
        console.warn('Could not find element after polling for', (maxAttempts * interval / 1000).toFixed(1), 'seconds');
      }
    };

    poll();
  }

  highlightElement(element) {
    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.style.backgroundColor = '#d4f1d4';
      // Longer highlight duration (5 seconds) to ensure visibility
      setTimeout(() => {
        element.style.backgroundColor = '';
      }, 5000);
    } catch (error) {
      console.error('Highlight element error:', error);
    }
  }

  searchAllBillsPaymentsCredits(query) {
    const results = [];
    const q = query.toLowerCase().trim();

    try {
      // Search in products
      const products = (this.billingData && this.billingData.products) ? this.billingData.products : [];
      products.forEach(product => {
        const name = (product.name || '').toLowerCase();
        const odia = (product.odia_name || '').toLowerCase();
        const cat = (product.category_name || product.category || '').toLowerCase();
        const cls = (product.classification || '').toLowerCase();

        let matched = false;
        let matchedDetails = '';

        if (name.includes(q) || odia.includes(q)) {
          matched = true;
        } else if (cat.includes(q)) {
          matched = true;
          matchedDetails = `Category: ${product.category_name || product.category}`;
        } else if (cls.includes(q)) {
          matched = true;
          matchedDetails = `Type: ${product.classification || 'Non-Gold'}`;
        }

        if (product.variants && Array.isArray(product.variants)) {
          for (const v of product.variants) {
            const pack = (v.packSize || `${v.pack_size_value || ''} ${v.pack_size_type || ''}`).toLowerCase();
            if (pack.includes(q)) {
              matched = true;
              matchedDetails = `Pack: ${v.packSize || `${v.pack_size_value || ''} ${v.pack_size_type || ''}`}`;
              break;
            }
            if (v.batches && Array.isArray(v.batches)) {
              for (const b of v.batches) {
                const bNo = (b.batchNo || b.batch_no || '').toLowerCase();
                const mrp = (b.mrp !== undefined && b.mrp !== null) ? b.mrp.toString() : '';
                if (bNo.includes(q)) {
                  matched = true;
                  matchedDetails = `Batch: ${b.batchNo || b.batch_no} | ₹${b.mrp}`;
                  break;
                }
                if (mrp.includes(q)) {
                  matched = true;
                  matchedDetails = `MRP: ₹${b.mrp} (${v.packSize || v.pack_size_value || ''})`;
                  break;
                }
              }
            }
            if (matched) break;
          }
        }

        if (matched) {
          results.push({ type: 'product', data: product, matchedDetails });
        }
      });

      // Search in bills
      if (this.billingData && this.billingData.bills) {
        this.billingData.bills.forEach(bill => {
          const text = `${bill.customer_name || ''} ${bill.invoice_no || ''} ${bill.reference_no || ''} ${bill.total || ''}`.toLowerCase();
          if (text.includes(q)) {
            results.push({ type: 'bill', data: bill });
          }
        });
      }

      // Search in payments AND credit notes (both stored in billingData.payments)
      if (this.billingData && this.billingData.payments) {
        this.billingData.payments.forEach(transaction => {
          // Build search text with all relevant fields including credit_amount
          const text = `${transaction.customer_name || ''} ${transaction.reference_number || ''} ${transaction.reference || ''} ${transaction.amount || ''} ${transaction.credit_amount || ''} ${transaction.payment_medium || ''} ${transaction.reason || ''}`.toLowerCase();
          
          if (text.includes(query)) {
            // Determine type based on transaction type field
            if (transaction.type === 'PAYMENT') {
              results.push({ type: 'payment', data: transaction });
            } else if (transaction.type === 'CREDIT_NOTE') {
              results.push({ type: 'credit', data: transaction });
            }
          }
        });
      }

      // Search in orders if available
      if (this.billingData && this.billingData.orders && Array.isArray(this.billingData.orders)) {
        this.billingData.orders.forEach(order => {
          const text = `${order.customer_name || ''} ${order.order_number || order.id || ''} ${order.reference_number || ''} ${order.status || ''}`.toLowerCase();
          if (text.includes(query)) {
            results.push({ type: 'order', data: order });
          }
        });
      }
    } catch (error) {
      console.warn('Global search error:', error);
    }

    return results;
  }

  applyLedgerSearchFilter(query) {
    try {
      // Get all ledger items
      const sidebarItems = document.querySelectorAll('#ledgerSidebarList .ledger-sidebar-item');
      const billRecords = document.querySelectorAll('.ledger-bill-record, [data-bill-id]');
      const paymentRecords = document.querySelectorAll('.ledger-payment-record, [data-payment-id]');
      const creditNoteRecords = document.querySelectorAll('[data-credit-note-id], .credit-note-item');

      let visibleCount = 0;

      // Filter sidebar items (customers)
      sidebarItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        const shouldShow = text.includes(query);
        item.style.display = shouldShow ? 'block' : 'none';
        if (shouldShow) visibleCount++;
      });

      // Filter bill records
      billRecords.forEach(item => {
        const text = item.textContent.toLowerCase();
        const shouldShow = text.includes(query);
        item.style.display = shouldShow ? 'block' : 'none';
        if (shouldShow) visibleCount++;
      });

      // Filter payment records
      paymentRecords.forEach(item => {
        const text = item.textContent.toLowerCase();
        const shouldShow = text.includes(query);
        item.style.display = shouldShow ? 'block' : 'none';
        if (shouldShow) visibleCount++;
      });

      // Filter credit note records
      creditNoteRecords.forEach(item => {
        const text = item.textContent.toLowerCase();
        const shouldShow = text.includes(query);
        item.style.display = shouldShow ? 'block' : 'none';
        if (shouldShow) visibleCount++;
      });

      // Show "no results" message if nothing found
      const container = document.querySelector('.billing-view-container');
      if (container && visibleCount === 0 && query) {
        let noResults = container.querySelector('.search-no-results');
        if (!noResults) {
          noResults = document.createElement('div');
          noResults.className = 'search-no-results';
          noResults.style.cssText = 'padding: 40px 20px; text-align: center; color: #999; font-size: 12px;';
          container.appendChild(noResults);
        }
        noResults.textContent = `No bills, payments, or credits matching "${query}"`;
        noResults.style.display = 'block';
      } else if (container) {
        const noResults = container.querySelector('.search-no-results');
        if (noResults) {
          noResults.style.display = 'none';
        }
      }
    } catch (error) {
      console.warn('Ledger search filter error:', error);
    }
  }

  showNoResultsMessage(query) {
    try {
      const container = document.querySelector('.billing-view-container');
      if (container) {
        let noResults = container.querySelector('.search-no-results');
        if (!noResults) {
          noResults = document.createElement('div');
          noResults.className = 'search-no-results';
          noResults.style.cssText = 'padding: 40px 20px; text-align: center; color: #999; font-size: 12px;';
          container.appendChild(noResults);
        }
        noResults.textContent = `No bills, payments, or credits matching "${query}"`;
        noResults.style.display = 'block';
      }
    } catch (error) {
      console.warn('Show no results error:', error);
    }
  }

  clearGlobalSearch() {
    try {
      // Clear search input
      if (this.searchInput) {
        this.searchInput.value = '';
      }

      // Hide dropdown
      if (this.searchDropdown) {
        this.searchDropdown.style.display = 'none';
      }

      // Show all ledger items
      const allItems = document.querySelectorAll(
        '.ledger-sidebar-item, .ledger-bill-record, .ledger-payment-record, ' +
        '[data-bill-id], [data-payment-id], [data-credit-note-id], .credit-note-item'
      );
      
      allItems.forEach(item => {
        item.style.display = 'block';
        item.style.backgroundColor = '';
      });

      // Remove "no results" message
      const noResults = document.querySelector('.search-no-results');
      if (noResults) {
        noResults.style.display = 'none';
      }
    } catch (error) {
      console.warn('Clear global search error:', error);
    }
  }

  toggleSidebar() {
    this.sidebar?.classList.toggle('hidden');
  }

  setupBillingEventListeners() {
    // Menu item click handlers
    this.menuItems.forEach(item => {
      item.addEventListener('click', () => this.switchView(item.dataset.view));
    });
  }

  switchView(viewName, params = null) {
    // Stop polling for the previous view if it exists
    if (this.currentViewInstance && typeof this.currentViewInstance.stopPolling === 'function') {
      this.currentViewInstance.stopPolling();
    }

    this.currentView = viewName;
    
    // Clear search when switching away from ledger, or if search is manually cleared
    if (this.searchInput) {
      // If switching to a non-ledger page, clear search
      if (viewName !== 'ledger' && viewName !== 'existing' && this.searchInput.value) {
        this.searchInput.value = '';
        this.clearGlobalSearch();
      }
      // If search box is empty and we're on ledger, ensure items are visible
      else if (this.searchInput.value === '') {
        this.clearGlobalSearch();
      }
    }
    
    // Update active menu item
    this.menuItems.forEach(item => {
      item.classList.remove('active');
      if (item.dataset.view === viewName) {
        item.classList.add('active');
      }
    });

    // Render view
    this.renderView(viewName, params);
  }

  renderView(viewName, params = null) {
    let viewInstance = null;

    switch(viewName) {
      case 'orders':
        viewInstance = new OrdersView(this);
        if (params) viewInstance.params = params;
        viewInstance.render();
        break;
      case 'create':
        if (params && params.customerName) {
          this.billEditor.renderCreateBillView({ customer_name: params.customerName });
        } else {
          this.billEditor.renderCreateBillView();
        }
        break;
      case 'ledger':
      case 'existing':  // Keep for backward compatibility
        viewInstance = new LedgerView(this);
        if (params) viewInstance.params = params;
        viewInstance.render();
        break;
      case 'ledger-detail':
        this.renderLedgerDetailView();
        break;
      case 'edit':
        this.editBillsPayments.renderEditBillListView();
        break;
      case 'payment-credit':
        this.renderPaymentCreditNoteView(params);
        break;
      case 'history':
        this.renderHistoryView();
        break;
      case 'dashboard':
      default:
        this.renderDashboard();
    }

    // Store current view instance and start polling if it supports it
    this.currentViewInstance = viewInstance;
    if (viewInstance && typeof viewInstance.startPolling === 'function') {
      viewInstance.startPolling();
    }
  }

  renderDashboard() {
    const dashboard = new BillingDashboard(this);
    dashboard.render();
  }

  renderPaymentCreditNoteView(params = null) {
    // Use the new PaymentCreditNote module
    const paymentCreditNote = new PaymentCreditNote(this);
    paymentCreditNote.render(params).catch(err => console.error('Error rendering payment/credit note view:', err));
  }

  renderHistoryView() {
    // Use the new HistoryView module
    const history = new HistoryView(this);
    history.render();
  }

  async ensureDataUpToDate() {
    if (!this.apiEnabled) return;
    
    // Don't auto-refresh if user is inside views that have active text inputs/forms
    const inputViews = ['create', 'edit', 'payment-credit'];
    if (inputViews.includes(this.currentView)) return;

    try {
      console.log('🔄 Page active/focused. Ensuring billing data is up to date...');
      await this.loadBillingDataFromAPI();
      
      // Re-render the active view with fresh data
      if (this.currentViewInstance && typeof this.currentViewInstance.render === 'function') {
        this.currentViewInstance.render();
      } else if (this.currentView === 'dashboard') {
        this.renderDashboard();
      }
    } catch (e) {
      console.warn('Background updater check failed:', e);
    }
  }

  loadBillingData() {
    // Return initial empty structure - will be populated by loadBillingDataFromAPI
    return {
      bills: [],
      payments: [],
      creditNotes: []
    };
  }

  async loadBillingDataFromAPI() {
    if (!this.apiEnabled) throw new Error('API not enabled');

    const normalizeCollection = (payload, fallback = []) => {
      if (Array.isArray(payload)) return payload;
      if (!payload) return fallback;
      if (Array.isArray(payload.items)) return payload.items;
      if (Array.isArray(payload.data)) return payload.data;
      if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
      if (payload.data && Array.isArray(payload.data.data)) return payload.data.data;
      if (Array.isArray(payload.contacts)) return payload.contacts;
      if (Array.isArray(payload.transactions)) return payload.transactions;
      if (Array.isArray(payload.payments)) return payload.payments;
      return fallback;
    };

    try {
      // Fetch bills with error handling
      let billsResponse = [];
      try {
        const resp = await this.api.getBills();
        billsResponse = resp;
      } catch (billsErr) {
        console.error('Error fetching bills:', billsErr.message);
      }

      // Fetch payments with error handling
      let paymentsResponse = [];
      try {
        const resp = await this.api.getPayments();
        paymentsResponse = resp;
      } catch (paymentsErr) {
        console.warn('Warning: Error fetching payments:', paymentsErr.message);
        paymentsResponse = { data: [], success: false };
      }

      // Fetch contacts with error handling
      let contactsResponse = [];
      try {
        const resp = await this.api.getContacts();
        contactsResponse = resp;
      } catch (contactsErr) {
        console.warn('Warning: Error fetching contacts:', contactsErr.message);
        contactsResponse = { data: [], success: false };
      }

      // Fetch orders with error handling
      let ordersResponse = [];
      try {
        const resp = await fetch('/api/billing/orders');
        if (resp.ok) {
          const data = await resp.json();
          ordersResponse = normalizeCollection(data, []);
        }
      } catch (ordersErr) {
        console.warn('Warning: Error fetching orders:', ordersErr.message);
        ordersResponse = [];
      }

      // Fetch products with error handling
      let productsResponse = [];
      try {
        const resp = await this.api.getProducts();
        productsResponse = normalizeCollection(resp, []);
      } catch (prodErr) {
        console.warn('Warning: Error fetching products for billing search:', prodErr.message);
        productsResponse = [];
      }

      const bills = normalizeCollection(billsResponse, []);
      const payments = normalizeCollection(paymentsResponse, []);
      const contacts = normalizeCollection(contactsResponse, []);

      // normalize to billingData structure expected by ledger
      this.billingData = {
        bills: bills.map(b => ({
          id: b.id,
          reference_no: b.reference_no,  // Use reference_no from API
          invoice_no: b.invoice_no,
          customer_id: b.customer_id,
          customer_name: b.customer_name || 'Unknown',
          bill_date: b.invoice_date || b.created_at,
          invoice_date: b.invoice_date || b.created_at,
          created_at: b.created_at,
          created_by_role: b.created_by_role,
          created_by_name: b.created_by_name,
          last_edited_by_role: b.last_edited_by_role,
          last_edited_by_name: b.last_edited_by_name,

          total: b.grand_total || b.total || 0,
          subtotal: b.subtotal || 0,
          total_discount: b.total_discount || 0,
          total_gst: b.total_gst || 0,
          discount: b.discount || 0,
          tax: b.tax || 0,
          status: b.status || 'pending',
          notes: b.notes,
          items: b.items || []
        })),
        payments: payments.map(p => ({
          id: p.id,
          payment_id: p.id,
          invoice_id: p.invoice_id,
          bill_id: p.invoice_id,
          customer_id: p.customer_id,
          amount: p.amount,
          type: p.type,
          method: p.payment_medium,
          payment_medium: p.payment_medium,
          reason: p.reason,
          credit_amount: p.credit_amount,
          reference_number: p.reference_number,
          payment_date: p.payment_date,
          notes: p.notes,
          attachment_data: p.attachment_data,
          created_at: p.created_at,
          created_by_role: p.created_by_role,
          created_by_name: p.created_by_name,
          last_edited_by_role: p.last_edited_by_role,
          last_edited_by_name: p.last_edited_by_name,
          customer_name: p.customer_name || 'Unknown'
        })),
        orders: ordersResponse.map(o => {
          // Always use customer_id to look up customer name from contacts
          let customerName = 'Unknown';
          if (o.customer_id && contacts.length > 0) {
            const contact = contacts.find(c => c.id === o.customer_id);
            customerName = contact ? contact.name : 'Unknown';
          }
          return {
            id: o.id,
            order_number: o.order_number,
            customer_id: o.customer_id,
            customer_name: customerName,
            status: o.current_stage || o.status || 'pending',
            current_stage: o.current_stage || 'stage1',
            bill_reference: o.bill_reference || '',
            total_amount: o.total_amount || 0,
            order_date: o.order_date || o.created_at,
            delivery_date: o.delivery_date || '',
            created_at: o.created_at,
            created_by_role: o.created_by_role,
            created_by_name: o.created_by_name,
            last_edited_by_role: o.last_edited_by_role,
            last_edited_by_name: o.last_edited_by_name,
            reference_number: o.reference_number,
            items: o.items || []
          };
        }),
        contacts: contacts.map(c => ({
          id: c.id,
          name: c.name,
          opening_balance: c.opening_balance || 0,
          exclude_from_stats: c.exclude_from_stats || 0,
          created_by_role: c.created_by_role,
          created_by_name: c.created_by_name,
          last_edited_by_role: c.last_edited_by_role,
          last_edited_by_name: c.last_edited_by_name
        })),
        products: productsResponse,
        history: [],
        settings: {}
      };

      this.saveBillingData();
      return this.billingData;
    } catch (err) {
      console.error('Failed to load billing data from API:', err.message);
      throw err;
    }
  }

  saveBillingData() {
    // Data is kept in memory only - no localStorage persistence
    // All data is managed via API endpoints
  }

  /**
   * Delete a bill with confirmation
   */
  async deleteBill(billId) {
    const confirmed = confirm('Are you sure you want to delete this bill? This action cannot be undone.');
    if (!confirmed) return;

    console.log('Deleting bill:', billId);

    try {
      // Delete bill via API using fetch
      const response = await fetch(`/api/billing/${billId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to delete: ${response.statusText}`);
      }

      console.log(`✓ Bill ${data.deleted?.invoice_no || billId} deleted successfully`);
      
      // Show success with invoice details
      const msg = data.deleted?.invoice_no 
        ? `✓ Invoice ${data.deleted.invoice_no} deleted successfully` 
        : '✓ Bill deleted successfully';
      alert(msg);

      // Reload billing data from API
      if (this.loadBillingDataFromAPI) {
        await this.loadBillingDataFromAPI();
      }

      // Refresh the current view in real-time
      const viewToRefresh = this.currentView;
      if (viewToRefresh) {
        this.switchView(viewToRefresh);
      }
    } catch (error) {
      console.error('Error deleting bill:', error);
      alert(`✗ Error: ${error.message}`);
    }
  }

  /**
   * Delete a payment with confirmation
   */
  async deletePayment(paymentId) {
    const confirmed = confirm('Are you sure you want to delete this payment? This action cannot be undone.');
    if (!confirmed) return;

    console.log('Deleting payment:', paymentId);

    try {
      // Delete payment via API using fetch
      const response = await fetch(`/api/billing/payments/${paymentId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to delete: ${response.statusText}`);
      }

      console.log(`✓ Payment deleted successfully`);
      alert('✓ Payment deleted successfully');

      // Reload billing data from API
      if (this.loadBillingDataFromAPI) {
        await this.loadBillingDataFromAPI();
      }

      // Refresh the current view in real-time
      const viewToRefresh = this.currentView;
      if (viewToRefresh) {
        this.switchView(viewToRefresh);
      }
    } catch (error) {
      console.error('Error deleting payment:', error);
      alert(`✗ Error: ${error.message}`);
    }
  }

  /**
   * Navigation handler for quick shortcut buttons in dashboard
   */
  navigationHandler(action, param = null) {
    switch(action) {
      case 'makeBill':
        this.switchView('create');
        break;
      case 'editBill':
        this.switchView('edit');
        break;
      case 'makePayment':
        this.switchView('payment-credit');
        // Scroll to payment tab if customer is provided
        if (param) {
          setTimeout(() => {
            const customerInput = document.getElementById('paymentCustomerName');
            if (customerInput) customerInput.value = param;
          }, 100);
        }
        break;
      case 'paymentsList':
        this.switchView('payment-credit');
        // Switch to payment tab if exists
        setTimeout(() => {
          const paymentTab = document.querySelector('[data-tab="payment"]');
          if (paymentTab) paymentTab.click();
        }, 100);
        break;
      case 'ledgerView':
        this.switchView('ledger');
        break;
      case 'ordersView':
        this.switchView('orders');
        break;
      case 'analytics':
        this.switchView('dashboard');
        break;
      default:
        console.warn('Unknown action:', action);
    }
  }

  injectBillingStyles() {
    if (document.getElementById('billing-app-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'billing-app-styles';
    styles.textContent = `
      @keyframes billingFadeInUp {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes billingPulseGreen {
        0% { background-color: transparent; }
        30% { background-color: rgba(34, 197, 94, 0.15); }
        100% { background-color: transparent; }
      }
      @keyframes billingPulseGold {
        0% { background-color: transparent; }
        30% { background-color: rgba(234, 179, 8, 0.15); }
        100% { background-color: transparent; }
      }
      @keyframes billingStatPulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); color: #fff; }
        100% { transform: scale(1); }
      }
      
      .animate-fade-in { animation: billingFadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      .animate-pulse-green { animation: billingPulseGreen 1.5s ease; }
      .animate-pulse-gold { animation: billingPulseGold 1.5s ease; }
      .animate-stat-change { display: inline-block; animation: billingStatPulse 0.4s ease; }
      
      /* Global helper classes */
      .highlight-new { border-left: 4px solid #22c55e !important; }
      .highlight-updated { border-left: 4px solid #eab308 !important; }
      
      :root {
        --billing-primary: #1db954;
        --billing-success: #22c55e;
        --billing-warning: #f59e0b;
        --billing-danger: #ef4444;
      }

      .billing-sidebar {
        width: 220px;
        border-right: 1px solid rgba(0, 0, 0, 0.08);
        overflow-y: auto;
        background: #f9fafb;
        display: flex;
        flex-direction: column;
        border-radius: 0 0 0 12px;
      }

      .billing-menu-item {
        padding: 12px 16px;
        border: none;
        background: transparent;
        color: #666;
        font-size: 13px;
        cursor: pointer;
        border-left: 3px solid transparent;
        transition: all 0.2s ease;
        text-align: left;
        font-family: inherit;
      }

      .billing-menu-item:hover {
        background: rgba(29, 185, 84, 0.1);
        color: var(--billing-primary);
      }

      .billing-menu-item.active {
        background: rgba(29, 185, 84, 0.1);
        color: var(--billing-primary);
        font-weight: 600;
        border-left-color: var(--billing-primary);
      }

      /* ===== MAIN VIEW AREA ===== */
      .billing-main {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .billing-header {
        padding: 16px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        background: #fafbfc;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .billing-header-info {
        flex: 1;
      }

      .billing-header-title {
        font-size: 16px;
        font-weight: 600;
        color: #1f2937;
        margin: 0;
      }

      .billing-header-subtitle {
        font-size: 12px;
        color: #999;
        margin: 4px 0 0 0;
      }

      .billing-header-actions {
        display: flex;
        gap: 8px;
      }

      .billing-action-btn {
        padding: 6px 12px;
        border: none;
        background: linear-gradient(135deg, var(--billing-primary) 0%, #1aa34a 100%);
        color: white;
        font-size: 12px;
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.2s ease;
        font-weight: 500;
      }

      .billing-action-btn:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(29, 185, 84, 0.3);
      }

      .billing-action-btn:active {
        transform: translateY(0);
      }

      .billing-view-container {
        flex: 1;
        overflow-y: auto;
        background: linear-gradient(135deg, rgba(29, 185, 84, 0.02) 0%, rgba(34, 197, 94, 0.02) 100%);
      }

      .billing-empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        color: #9ca3af;
        font-size: 14px;
        text-align: center;
        padding: 2rem;
      }

      /* ===== SCROLLBAR STYLING ===== */
      .billing-sidebar::-webkit-scrollbar,
      .billing-view-container::-webkit-scrollbar {
        width: 8px;
      }

      .billing-sidebar::-webkit-scrollbar-track,
      .billing-view-container::-webkit-scrollbar-track {
        background: transparent;
      }

      .billing-sidebar::-webkit-scrollbar-thumb,
      .billing-view-container::-webkit-scrollbar-thumb {
        background: rgba(0, 0, 0, 0.1);
        border-radius: 4px;
      }

      .billing-sidebar::-webkit-scrollbar-thumb:hover,
      .billing-view-container::-webkit-scrollbar-thumb:hover {
        background: rgba(0, 0, 0, 0.15);
      }

      /* Disable mouse wheel scroll on number inputs */
      input[type="number"] {
        -moz-appearance: textfield;
      }

      input[type="number"]::-webkit-outer-spin-button,
      input[type="number"]::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }

      /* View Orders Badge */
      .view-orders-badge {
        background: rgba(29, 185, 84, 0.1);
        color: var(--billing-primary);
        border: 1px solid rgba(29, 185, 84, 0.2);
        padding: 6px 14px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      }
      .view-orders-badge:hover {
        background: rgba(29, 185, 84, 0.2);
        transform: translateY(-1px);
        box-shadow: 0 4px 8px rgba(29, 185, 84, 0.2);
      }

      /* Order Selection Modal */
      .order-selection-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 10px 0;
      }
      .order-selection-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px;
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 10px;
        transition: all 0.2s;
      }
      .order-selection-item:hover {
        background: #f0f4f8;
        border-color: #bbdefb;
        transform: scale(1.01);
      }
      .order-selection-info {
        flex: 1;
      }
      .order-selection-info .order-id {
        font-weight: 700;
        color: #1f2937;
        font-size: 14px;
      }
      .order-selection-info .order-date {
        font-size: 11px;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-top: 2px;
      }
      .order-selection-info .order-meta {
        font-size: 13px;
        color: #4b5563;
        margin-top: 6px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .select-order-btn {
        padding: 8px 16px;
        font-size: 13px;
        white-space: nowrap;
      }
    `;

    document.head.appendChild(styles);

    // Disable mouse wheel scroll on number inputs
    this.disableNumberInputScrollWheel();
  }

  disableNumberInputScrollWheel() {
    document.addEventListener('wheel', (e) => {
      if (e.target.type === 'number') {
        e.preventDefault();
      }
    }, { passive: false });
  }

  // Export bill as PDF
  async exportBill(billId) {
    try {
      // Show loading indicator
      const loadingId = 'pdf-export-loading-' + Date.now();
      const loadingDiv = document.createElement('div');
      loadingDiv.id = loadingId;
      loadingDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.3);z-index:9999;';
      loadingDiv.innerHTML = '<p>🔄 Generating PDF...</p>';
      document.body.appendChild(loadingDiv);

      // Normalize billId - could be invoice_no or reference_no
      const invoiceNo = String(billId).trim();

      if (!invoiceNo) {
        throw new Error('Bill ID is required');
      }

      // Use relative path so it works with Vite dev proxy and production server
      const API_BASE = window.BILLING_API_BASE || '';
      const response = await fetch(`${API_BASE}/api/billing/export-invoice-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ invoiceNo: invoiceNo })
      });

      if (!response.ok) {
        // Try to parse JSON error, fallback to text (avoid JSON parse errors when server returns HTML)
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const error = await response.json();
          throw new Error(error.details || error.error || 'Failed to generate PDF');
        } else {
          const txt = await response.text();
          throw new Error(txt || 'Failed to generate PDF');
        }
      }

      // Download PDF via JSON (base64)
      const data = await response.json();
      const fileName = data.fileName || `invoice-${invoiceNo}.pdf`;
      
      // Convert base64 to Blob
      const blob = await (await fetch(`data:application/pdf;base64,${data.pdf}`)).blob();

      // Get customer name for directory mapping
      const bill = (this.billingData.bills || []).find(b => b.id == billId || b.invoice_no == billId);
      const customerName = bill ? (bill.customer_name || bill.customer) : null;

      // Use the new LedgerFileUtils to handle Save-As and Per-Customer folders
      const result = await window.LedgerFileUtils.exportToLocation(customerName, fileName, blob);

      // Remove loading indicator
      const loadingEl = document.getElementById(loadingId);
      if (loadingEl) loadingEl.remove();

      if (result.success && !result.cancelled) {
        // Show success notification
        const toastId = 'pdf-success-' + Date.now();
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#4CAF50;color:white;padding:16px;border-radius:4px;z-index:9999;font-weight:600;';
        
        let message = `✓ ${fileName} saved successfully`;
        if (result.folder) message = `✓ Saved to ${result.folder}/${fileName}`;
        else if (result.fallback) message = `✓ ${fileName} downloaded successfully`;
        
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => { if (document.getElementById(toastId)) document.getElementById(toastId).remove(); }, 4000);
      }
    } catch (error) {
      // Remove loading indicator
      const loadingEl = document.querySelector('[id^="pdf-export-loading-"]');
      if (loadingEl) loadingEl.remove();

      console.error('PDF Export Error:', error);
      const errorId = 'pdf-error-' + Date.now();
      const errorDiv = document.createElement('div');
      errorDiv.id = errorId;
      errorDiv.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#f44336;color:white;padding:16px;border-radius:4px;z-index:9999;font-weight:600;';
      errorDiv.textContent = `✗ Error: ${error.message}`;
      document.body.appendChild(errorDiv);
      setTimeout(() => {
        const el = document.getElementById(errorId);
        if (el) el.remove();
      }, 5000);
    }
  }

  // Print document (invoice, payment, credit note, opening balance)
  async printDocument(type, documentId) {
    try {
      const docId = String(documentId).trim();
      if (!docId) throw new Error('Document ID is required');
      
      const API_BASE = window.BILLING_API_BASE || '';
      let endpoint = '';
      
      if (type === 'invoice') {
        endpoint = `/api/billing/print-invoice-pdf?invoiceNo=${encodeURIComponent(docId)}`;
      } else if (type === 'payment' || type === 'credit-note') {
        endpoint = `/api/billing/print-payment-pdf?paymentId=${encodeURIComponent(docId)}`;
      } else if (type === 'opening-balance') {
        endpoint = `/api/billing/print-opening-balance?customerName=${encodeURIComponent(docId)}`;
      } else {
        throw new Error('Invalid document type requested for printing');
      }

      const printUrl = `${API_BASE}${endpoint}`;
      const w = window.open(printUrl, '_blank');
      
      if (!w) {
        throw new Error('Print window blocked - please allow popups');
      }

    } catch (error) {
      console.error('PDF Print Error:', error);
      const errorId = 'pdf-print-error-' + Date.now();
      const errorDiv = document.createElement('div');
      errorDiv.id = errorId;
      errorDiv.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#f44336;color:white;padding:16px;border-radius:4px;z-index:9999;font-weight:600;';
      errorDiv.textContent = `✗ Error: ${error.message}`;
      document.body.appendChild(errorDiv);
      setTimeout(() => { const el = document.getElementById(errorId); if (el) el.remove(); }, 5000);
    }
  }

  // View bill as PDF in preview modal
  async viewBill(billId) {
    try {
      // Show loading indicator
      const loadingId = 'pdf-preview-loading-' + Date.now();
      const loadingDiv = document.createElement('div');
      loadingDiv.id = loadingId;
      loadingDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.3);z-index:9999;';
      loadingDiv.innerHTML = '<p>🔄 Loading PDF...</p>';
      document.body.appendChild(loadingDiv);

      // Normalize billId
      const invoiceNo = String(billId).trim();

      if (!invoiceNo) {
        throw new Error('Bill ID is required');
      }

      // Call API
      // Use relative path so it works with Vite dev proxy and production server
      const API_BASE = window.BILLING_API_BASE || '';
      const response = await fetch(`${API_BASE}/api/billing/preview-invoice-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ invoiceNo: invoiceNo })
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const error = await response.json();
          throw new Error(error.details || error.error || 'Failed to load PDF');
        } else {
          const txt = await response.text();
          throw new Error(txt || 'Failed to load PDF');
        }
      }

      // Create blob URL from image response
      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);

      // Remove loading indicator
      const loadingEl = document.getElementById(loadingId);
      if (loadingEl) loadingEl.remove();

      // Create and display preview modal
      const modalId = 'pdf-preview-modal-' + Date.now();
      const modal = document.createElement('div');
      modal.id = modalId;
      // Use very large z-index values and ensure the inner panel is also fixed
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:2147483646;pointer-events:auto;';

      modal.innerHTML = `
        <div style="position:fixed;top:5%;left:5%;width:90%;height:90%;background:white;border-radius:8px;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,0.6);z-index:2147483647;">
          <div style="padding:16px;border-bottom:1px solid rgba(0,0,0,0.1);display:flex;justify-content:space-between;align-items:center;">
            <h3 style="margin:0;font-size:16px;font-weight:600;">Invoice ${invoiceNo}</h3>
            <button id="close-pdf-modal" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;">&times;</button>
          </div>
          <div style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;background:#f5f5f5;">
            <img id="invoice-preview-img" src="${imageUrl}" style="max-width:100%;max-height:100%;object-fit:contain;" />
          </div>
          <div style="padding:12px;border-top:1px solid rgba(0,0,0,0.1);background:#fafbfc;display:flex;gap:8px;justify-content:flex-end;">
            <button id="download-pdf-btn" style="padding:8px 16px;background:#4CAF50;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;">📥 Download</button>
            <button id="close-pdf-btn" style="padding:8px 16px;background:#999;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;">Close</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);

      // Close modal handlers
      const closeHandler = () => {
        modal.remove();
        URL.revokeObjectURL(imageUrl);
      };
      
      document.getElementById('close-pdf-modal').addEventListener('click', closeHandler);
      document.getElementById('close-pdf-btn').addEventListener('click', closeHandler);
      
      // Close on outside click
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeHandler();
      });

      // Download button - trigger download of the original PDF
      document.getElementById('download-pdf-btn').addEventListener('click', () => {
        // Call the export endpoint to download PDF instead
        this.exportBill(invoiceNo);
      });

      // Interaction: zoom (hold 'z' + wheel), pan (hold 'z' + right-drag), double-click reset
      (function setupPreviewInteractions() {
        const img = document.getElementById('invoice-preview-img');
        if (!img) return;

        const modalEl = document.getElementById(modalId);
        let scale = 1;
        let minScale = 0.2;
        let maxScale = 5;
        let translate = { x: 0, y: 0 };
        let isPanning = false;
        let lastPointer = { x: 0, y: 0 };
        let zPressed = false;

        const applyTransform = () => {
          img.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${scale})`;
          img.style.transformOrigin = 'center center';
        };

        // Keys
        window.addEventListener('keydown', (e) => {
          if (e.key === 'z' || e.key === 'Z') zPressed = true;
        });
        window.addEventListener('keyup', (e) => {
          if (e.key === 'z' || e.key === 'Z') zPressed = false;
        });

        // Wheel -> zoom when Z held
        modalEl.addEventListener('wheel', (ev) => {
          if (!zPressed) return;
          ev.preventDefault();
          const delta = -ev.deltaY;
          const factor = delta > 0 ? 1.12 : 0.88;
          const prevScale = scale;
          scale = Math.min(maxScale, Math.max(minScale, scale * factor));

          // zoom towards pointer
          const rect = img.getBoundingClientRect();
          const offsetX = ev.clientX - rect.left - rect.width / 2;
          const offsetY = ev.clientY - rect.top - rect.height / 2;
          translate.x -= offsetX * (scale / prevScale - 1);
          translate.y -= offsetY * (scale / prevScale - 1);

          applyTransform();
        }, { passive: false });

        // Prevent context menu when panning enabled
        modalEl.addEventListener('contextmenu', (ev) => {
          if (zPressed) ev.preventDefault();
        });

        // Pointer events for pan (right button) when Z held
        modalEl.addEventListener('pointerdown', (ev) => {
          if (!(zPressed && ev.button === 2)) return;
          ev.preventDefault();
          isPanning = true;
          lastPointer.x = ev.clientX;
          lastPointer.y = ev.clientY;
          modalEl.setPointerCapture(ev.pointerId);
          img.style.cursor = 'grabbing';
        });

        modalEl.addEventListener('pointermove', (ev) => {
          if (!isPanning) return;
          ev.preventDefault();
          const dx = ev.clientX - lastPointer.x;
          const dy = ev.clientY - lastPointer.y;
          lastPointer.x = ev.clientX;
          lastPointer.y = ev.clientY;
          translate.x += dx;
          translate.y += dy;
          applyTransform();
        });

        modalEl.addEventListener('pointerup', (ev) => {
          if (!isPanning) return;
          isPanning = false;
          try { modalEl.releasePointerCapture(ev.pointerId); } catch (e) {}
          img.style.cursor = 'auto';
        });

        // Double click resets
        img.addEventListener('dblclick', (ev) => {
          ev.preventDefault();
          scale = 1;
          translate.x = 0;
          translate.y = 0;
          applyTransform();
        });

        // Ensure initial styles
        img.style.transition = 'transform 120ms ease-out';
        img.style.willChange = 'transform';
        img.style.cursor = 'auto';
        applyTransform();
      })();

    } catch (error) {
      // Remove loading indicator
      const loadingEl = document.querySelector('[id^="pdf-preview-loading-"]');
      if (loadingEl) loadingEl.remove();

      console.error('PDF Preview Error:', error);
      const errorId = 'pdf-preview-error-' + Date.now();
      const errorDiv = document.createElement('div');
      errorDiv.id = errorId;
      errorDiv.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#f44336;color:white;padding:16px;border-radius:4px;z-index:9999;font-weight:600;';
      errorDiv.textContent = `✗ Error: ${error.message}`;
      document.body.appendChild(errorDiv);
      setTimeout(() => {
        const el = document.getElementById(errorId);
        if (el) el.remove();
      }, 5000);
    }
  }

  async editBill(billId) {
    try {
      // Switch to edit view first (shows the edit list)
      this.switchView('edit');
      
      // Then let EditBillsPayments handle opening the specific bill for editing
      // This will fetch the bill data and open it in the editor
      if (this.editBillsPayments && this.editBillsPayments.handleEditItemSelection) {
        // Give the view time to render before opening the bill
        setTimeout(async () => {
          this.editBillsPayments.handleEditItemSelection(billId, 'bill');
        }, 100);
      }
    } catch (error) {
      console.error('Error editing bill:', error);
      alert('Failed to load bill for editing: ' + error.message);
    }
  }

  async editPayment(paymentId) {
    try {
      // Find the payment in the current data or fetch all payments
      let paymentData = null;
      
      // Try to find in current data first
      if (this.billingData && this.billingData.payments) {
        paymentData = this.billingData.payments.find(p => p.id == paymentId);
      }

      // If not found, fetch all payments using API
      if (!paymentData) {
        const allPayments = await this.api.getPayments();
        paymentData = allPayments.find(p => p.id == paymentId);
      }

      if (!paymentData) {
        alert('Payment not found');
        return;
      }

      // Switch to payment-credit view
      this.switchView('payment-credit');

      // Render the payment edit form with prefilled data
      setTimeout(() => {
        this.editBillsPayments.renderEditPaymentView(paymentData);
      }, 100);
    } catch (error) {
      console.error('Error editing payment:', error);
      alert('Failed to load payment for editing: ' + error.message);
    }
  }

  // Export payment/credit note as PDF
  async exportPayment(paymentId) {
    try {
      const loadingId = 'pdf-export-loading-' + Date.now();
      const loadingDiv = document.createElement('div');
      loadingDiv.id = loadingId;
      loadingDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.3);z-index:9999;';
      loadingDiv.innerHTML = '<p>🔄 Generating PDF...</p>';
      document.body.appendChild(loadingDiv);

      const API_BASE = window.BILLING_API_BASE || '';
      const response = await fetch(`${API_BASE}/api/billing/export-payment-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: paymentId })
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const error = await response.json();
          throw new Error(error.details || error.error || 'Failed to generate PDF');
        } else {
          const txt = await response.text();
          throw new Error(txt || 'Failed to generate PDF');
        }
      }

      // Download PDF via JSON (base64)
      const data = await response.json();
      const fileName = data.fileName || `payment-${paymentId}.pdf`;
      
      // Convert base64 to Blob
      const blob = await (await fetch(`data:application/pdf;base64,${data.pdf}`)).blob();

      // Get customer name for directory mapping
      const payment = (this.billingData.payments || []).find(p => p.id == paymentId);
      const customerName = payment ? (payment.customer_name || payment.customer) : null;

      // Use the new LedgerFileUtils to handle Save-As and Per-Customer folders
      const result = await window.LedgerFileUtils.exportToLocation(customerName, fileName, blob);

      const loadingEl = document.getElementById(loadingId);
      if (loadingEl) loadingEl.remove();

      if (result.success && !result.cancelled) {
        // Show success notification
        const toastId = 'pdf-success-' + Date.now();
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#4CAF50;color:white;padding:16px;border-radius:4px;z-index:9999;font-weight:600;';
        
        let message = `✓ ${fileName} saved successfully`;
        if (result.folder) message = `✓ Saved to ${result.folder}/${fileName}`;
        else if (result.fallback) message = `✓ ${fileName} downloaded successfully`;
        
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => { if (document.getElementById(toastId)) document.getElementById(toastId).remove(); }, 4000);
      }

    } catch (error) {
      const loadingEl = document.querySelector('[id^="pdf-export-loading-"]');
      if (loadingEl) loadingEl.remove();

      console.error('Payment PDF Export Error:', error);
      const errorId = 'pdf-error-' + Date.now();
      const errorDiv = document.createElement('div');
      errorDiv.id = errorId;
      errorDiv.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#f44336;color:white;padding:16px;border-radius:4px;z-index:9999;font-weight:600;';
      errorDiv.textContent = `✗ Error: ${error.message}`;
      document.body.appendChild(errorDiv);
      setTimeout(() => {
        const el = document.getElementById(errorId);
        if (el) el.remove();
      }, 5000);
    }
  }



  // View payment/credit note PDF in preview modal
  async viewPaymentDetail(paymentId) {
    try {
      const loadingId = 'pdf-preview-loading-' + Date.now();
      const loadingDiv = document.createElement('div');
      loadingDiv.id = loadingId;
      loadingDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.3);z-index:9999;';
      loadingDiv.innerHTML = '<p>🔄 Loading PDF...</p>';
      document.body.appendChild(loadingDiv);

      const API_BASE = window.BILLING_API_BASE || '';
      const response = await fetch(`${API_BASE}/api/billing/preview-payment-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: paymentId })
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const error = await response.json();
          throw new Error(error.details || error.error || 'Failed to load PDF');
        } else {
          const txt = await response.text();
          throw new Error(txt || 'Failed to load PDF');
        }
      }

      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);

      const loadingEl = document.getElementById(loadingId);
      if (loadingEl) loadingEl.remove();

      const modalId = 'pdf-preview-modal-' + Date.now();
      const modal = document.createElement('div');
      modal.id = modalId;
      modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:2147483646;pointer-events:auto;';

      modal.innerHTML = `
        <div style="position:fixed;top:5%;left:5%;width:90%;height:90%;background:white;border-radius:8px;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,0.6);z-index:2147483647;">
          <div style="padding:16px;border-bottom:1px solid rgba(0,0,0,0.1);display:flex;justify-content:space-between;align-items:center;">
            <h3 style="margin:0;font-size:16px;font-weight:600;">Payment ${paymentId}</h3>
            <button id="close-pdf-modal" style="background:none;border:none;font-size:24px;cursor:pointer;color:#666;">&times;</button>
          </div>
          <div style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;background:#f5f5f5;">
            <img id="payment-preview-img" src="${imageUrl}" style="max-width:100%;max-height:100%;object-fit:contain;" />
          </div>
          <div style="padding:12px;border-top:1px solid rgba(0,0,0,0.1);background:#fafbfc;display:flex;gap:8px;justify-content:flex-end;">
            <button id="download-payment-btn" style="padding:8px 16px;background:#4CAF50;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;">📥 Download</button>
            <button id="close-payment-btn" style="padding:8px 16px;background:#999;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600;">Close</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);

      const closeHandler = () => {
        modal.remove();
        URL.revokeObjectURL(imageUrl);
      };

      document.getElementById('close-pdf-modal').onclick = closeHandler;
      document.getElementById('close-payment-btn').onclick = closeHandler;
      document.getElementById('download-payment-btn').onclick = () => {
        const a = document.createElement('a');
        a.href = imageUrl;
        a.download = `payment-${paymentId}.json`;
        a.click();
      };

      modal.onclick = (e) => {
        if (e.target === modal) closeHandler();
      };

      // Interaction: zoom (hold 'z' + wheel), pan (hold 'z' + right-drag), double-click reset
      (function setupPreviewInteractions() {
        const img = document.getElementById('payment-preview-img');
        if (!img) return;

        const modalEl = document.getElementById(modalId);
        let scale = 1;
        let minScale = 0.2;
        let maxScale = 5;
        let translate = { x: 0, y: 0 };
        let isPanning = false;
        let lastPointer = { x: 0, y: 0 };
        let zPressed = false;

        const applyTransform = () => {
          img.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${scale})`;
          img.style.transformOrigin = 'center center';
        };

        // Keys
        window.addEventListener('keydown', (e) => {
          if (e.key === 'z' || e.key === 'Z') zPressed = true;
        });
        window.addEventListener('keyup', (e) => {
          if (e.key === 'z' || e.key === 'Z') zPressed = false;
        });

        // Wheel -> zoom when Z held
        modalEl.addEventListener('wheel', (ev) => {
          if (!zPressed) return;
          ev.preventDefault();
          const delta = -ev.deltaY;
          const factor = delta > 0 ? 1.12 : 0.88;
          const prevScale = scale;
          scale = Math.min(maxScale, Math.max(minScale, scale * factor));

          // zoom towards pointer
          const rect = img.getBoundingClientRect();
          const offsetX = ev.clientX - rect.left - rect.width / 2;
          const offsetY = ev.clientY - rect.top - rect.height / 2;
          translate.x -= offsetX * (scale / prevScale - 1);
          translate.y -= offsetY * (scale / prevScale - 1);

          applyTransform();
        }, { passive: false });

        // Prevent context menu when panning enabled
        modalEl.addEventListener('contextmenu', (ev) => {
          if (zPressed) ev.preventDefault();
        });

        // Pointer events for pan (right button) when Z held
        modalEl.addEventListener('pointerdown', (ev) => {
          if (!(zPressed && ev.button === 2)) return;
          ev.preventDefault();
          isPanning = true;
          lastPointer.x = ev.clientX;
          lastPointer.y = ev.clientY;
          modalEl.setPointerCapture(ev.pointerId);
          img.style.cursor = 'grabbing';
        });

        modalEl.addEventListener('pointermove', (ev) => {
          if (!isPanning) return;
          ev.preventDefault();
          const dx = ev.clientX - lastPointer.x;
          const dy = ev.clientY - lastPointer.y;
          lastPointer.x = ev.clientX;
          lastPointer.y = ev.clientY;
          translate.x += dx;
          translate.y += dy;
          applyTransform();
        });

        modalEl.addEventListener('pointerup', (ev) => {
          if (!isPanning) return;
          isPanning = false;
          try { modalEl.releasePointerCapture(ev.pointerId); } catch (e) {}
          img.style.cursor = 'auto';
        });

        // Double click resets
        img.addEventListener('dblclick', (ev) => {
          ev.preventDefault();
          scale = 1;
          translate.x = 0;
          translate.y = 0;
          applyTransform();
        });

        // Ensure initial styles
        img.style.transition = 'transform 120ms ease-out';
        img.style.willChange = 'transform';
        img.style.cursor = 'auto';
        applyTransform();
      })();

    } catch (error) {
      const loadingEl = document.querySelector('[id^="pdf-preview-loading-"]');
      if (loadingEl) loadingEl.remove();

      console.error('Payment PDF Preview Error:', error);
      const errorId = 'pdf-preview-error-' + Date.now();
      const errorDiv = document.createElement('div');
      errorDiv.id = errorId;
      errorDiv.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#f44336;color:white;padding:16px;border-radius:4px;z-index:9999;font-weight:600;';
      errorDiv.textContent = `✗ Error: ${error.message}`;
      document.body.appendChild(errorDiv);
      setTimeout(() => {
        const el = document.getElementById(errorId);
        if (el) el.remove();
      }, 5000);
    }
  }

  // Alias for backward compatibility
  viewBillDetail(billId) {
    return this.viewBill(billId);
  }
}

// Ensure global availability
window.BillingApp = BillingApp;



