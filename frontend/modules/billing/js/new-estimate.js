const log = (typeof window !== 'undefined' && window.MacOSLogger) ? window.MacOSLogger.createScope('Billing:Estimate') : { debug: () => {}, info: () => {}, warn: console.warn.bind(console), error: console.error.bind(console) };

class EstimateEditor {
  constructor(billingApp) {
    this.billingApp = billingApp;
    this.currentEstimateProducts = [];
    this.customerType = 'registered';
    this.selectedCustomer = null;
    this.selectedCustomerId = null;
    this.customerSnapshot = null;
    this.allContacts = [];
    this.cachedProducts = [];
    this.selectedIndex = -1;
    this.isDropdownOpen = false;
    this.dropdownProducts = [];
    this.currentProduct = null;
    this.isVariantModalOpen = false;
    this.isSelectingVariant = false;
    this.variantsToSelect = [];
    this.editingEstimateId = null;
    this.historyEstimates = [];
    this.selectedHistoryCustomer = '';
    this.historyStatusFilter = 'all';
    this.historyDateFilter = 'all';
    this.historyCustomerSort = 'name-asc';
    this.isEditing = false;
    this.isEstimateDirty = false;
  }

  selectHistoryCustomer(customerKey) {
    this.selectedHistoryCustomer = customerKey === this.selectedHistoryCustomer ? '' : customerKey;
    this.renderHistorySidebar();
    this.renderHistoryRows();
    if (window.matchMedia?.('(max-width: 620px)').matches) {
      this.viewContainer.querySelector('.estimate-workspace')?.classList.add('estimate-sidebar-hidden');
    }
  }

  get viewContainer() {
    return this._viewContainer || (this.billingApp?.getOrCreateSubviewPanel ? this.billingApp.getOrCreateSubviewPanel('estimate') : this.billingApp.viewContainer);
  }

  set viewContainer(val) {
    this._viewContainer = val;
  }

  showNotification(message, type = 'info') {
    if (this.billingApp?.showNotification) {
      return this.billingApp.showNotification(message, type);
    }
    if (typeof window !== 'undefined' && window.MacOSNotificationManager) {
      return window.MacOSNotificationManager.notify({
        app: 'Billing',
        title: 'Estimate',
        message: message,
        type: type
      });
    }
    alert(message);
  }

  formatDate(date) {
    if (!date) return '';
    if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${year}-${month}-${day}`;
  }

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  normalizeCollection(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload) return [];
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
    if (Array.isArray(payload.products)) return payload.products;
    if (Array.isArray(payload.contacts)) return payload.contacts;
    return [];
  }

  render(initialData = null) {
    if (!initialData && this.isEditing && this.viewContainer?.querySelector('.estimate-form-wrapper')) return;
    if (!initialData || initialData.mode === 'history') {
      this.renderHistory();
      return;
    }

    const estimate = initialData.estimate || initialData;
    this.isEditing = true;
    this.isEstimateDirty = false;
    this.currentProduct = null;
    this.isDropdownOpen = false;
    this.editingEstimateId = estimate.id || null;
    this.customerType = estimate.customer_id ? 'registered' : (estimate.party_name ? 'unregistered' : 'registered');
    this.selectedCustomer = estimate.customer_id
      ? this.allContacts.find(contact => String(contact.id) === String(estimate.customer_id)) || null
      : null;
    this.selectedCustomerId = estimate.customer_id || null;
    this.customerSnapshot = {
      name: estimate.customer_name || estimate.party_name || '',
      phone: estimate.phone || '',
      address: estimate.address || '',
      gstin: estimate.gstin || '',
      licence_no: estimate.licence_no || estimate.dl_no || '',
      pan: estimate.pan || ''
    };
    this.currentEstimateProducts = Array.isArray(estimate.products)
      ? JSON.parse(JSON.stringify(estimate.products))
      : [];
    const todayDate = new Date();
    const today = this.formatDate(todayDate);
    const defaultExpiry = new Date(todayDate);
    defaultExpiry.setDate(defaultExpiry.getDate() + 7);
    const validUntilDate = this.formatDate(defaultExpiry);
    const estimateDate = this.escapeHtml(this.formatDate(estimate.estimate_date) || today);
    const validUntil = this.escapeHtml(this.formatDate(estimate.valid_until) || validUntilDate);
    const subject = this.escapeHtml(estimate.subject || '');
    const registeredCustomerName = this.escapeHtml(estimate.customer_name || estimate.party_name || '');
    const walkInName = this.escapeHtml(estimate.customer_id ? '' : estimate.party_name || '');
    const phone = this.escapeHtml(estimate.phone || '');
    const gstin = this.escapeHtml(estimate.gstin || '');
    const address = this.escapeHtml(estimate.address || '');
    const licenceNo = this.escapeHtml(estimate.licence_no || '');
    const pan = this.escapeHtml(estimate.pan || '');
    const isRegistered = this.customerType === 'registered';

    this.viewContainer.innerHTML = `
      <div class="bill-form-wrapper estimate-form-wrapper">
        <!-- HEADER -->
        <div class="bill-header" style="border-left: 4px solid #d97706;">
          <div class="bill-header-left">
            <div class="bill-header-icon" style="background: rgba(217, 119, 6, 0.1); color: #d97706;">📄</div>
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <h1 class="bill-header-title">Estimate</h1>
              </div>
            </div>
          </div>
          <div class="bill-header-stats">
            <div class="bill-header-stat">
              <span class="bill-header-stat-label">Estimate Total</span>
              <span class="bill-header-stat-value" id="estHeaderTotal" style="color: #d97706;">₹0.00</span>
            </div>
            <div class="bill-header-stat">
              <span class="bill-header-stat-label">Items</span>
              <span class="bill-header-stat-value" id="estHeaderItems">0</span>
            </div>
          </div>
        </div>

        <!-- 2-COLUMN CONTENT -->
        <div class="bill-content-wrapper">
          <!-- LEFT PANEL: FORM + PRODUCTS -->
          <div class="bill-form-panel">
            <!-- 1. Customer & Estimate Metadata -->
            <div class="bill-form-section">
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-bottom: 8px;">
                <h3 class="bill-section-title" style="margin: 0;">Customer & Details</h3>
                <!-- Customer Type Toggle -->
                <div class="estimate-customer-toggle-group">
                  <button type="button" class="estimate-toggle-btn ${isRegistered ? 'active' : ''}" id="estToggleRegistered">Registered</button>
                  <button type="button" class="estimate-toggle-btn ${isRegistered ? '' : 'active'}" id="estToggleUnregistered">Walk-in</button>
                </div>
              </div>

              <!-- Metadata row (Estimate No, Dates, Validity) -->
              <div class="form-row" style="margin-bottom: 12px;">
                <div class="form-group">
                  <label>Estimate Date</label>
                  <input type="date" id="estDate" class="form-input" value="${estimateDate}">
                </div>
                <div class="form-group">
                  <label>Valid Until</label>
                  <input type="date" id="estValidUntil" class="form-input" value="${validUntil}">
                </div>
                <div class="form-group" style="flex: 1.5;">
                  <label>Subject</label>
                  <input type="text" id="estSubject" class="form-input" value="${subject}">
                </div>
              </div>

              <!-- Registered Customer Section (Auto-populated from Contacts DB) -->
              <div id="estRegisteredCustomerSection" style="display: ${isRegistered ? 'block' : 'none'};">
                <div class="form-row">
                  <div class="form-group" style="flex: 1;">
                    <label>Customer Name</label>
                    <div style="position: relative;">
                      <input type="text" id="estCustomerName" list="estCustomerDatalist" class="form-input" value="${isRegistered ? registeredCustomerName : ''}" placeholder="Select customer" autocomplete="off">
                      <datalist id="estCustomerDatalist"></datalist>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Unregistered Customer Section (Walk-in) -->
              <div id="estUnregisteredCustomerSection" style="display: ${isRegistered ? 'none' : 'block'};">
                <div class="form-row">
                  <div class="form-group" style="flex: 2;">
                    <label>Customer Name <span style="color:#ef4444;">*</span></label>
                    <input type="text" id="estUnregName" class="form-input" value="${walkInName}" placeholder="Customer name">
                  </div>
                  <div class="form-group">
                    <label>Phone Number</label>
                    <input type="tel" id="estUnregPhone" class="form-input" value="${isRegistered ? '' : phone}">
                  </div>
                  <div class="form-group">
                    <label>GSTIN (Optional)</label>
                    <input type="text" id="estUnregGstin" class="form-input" value="${isRegistered ? '' : gstin}">
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group" style="flex: 1;">
                    <label>Address / City</label>
                    <input type="text" id="estUnregAddress" class="form-input" value="${isRegistered ? '' : address}">
                  </div>
                </div>
              </div>

              <!-- Duplex Option -->
              <div style="margin-top: 10px; display: flex; align-items: center; gap: 8px;">
                <input type="checkbox" id="estDuplexPrint" ${estimate.duplex_print === true || Number(estimate.duplex_print) === 1 ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;">
                <label for="estDuplexPrint" style="cursor: pointer; font-size: 12px; color: #374151; font-weight: 500;">
                  Include estimate back-page (company UPI QR, bank details, estimate terms, and registered-customer portal)
                </label>
              </div>
            </div>

            <!-- 2. Product Input Section (Auto-populated from Product DB) -->
            <div class="bill-form-section">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <h3 class="bill-section-title" style="margin: 0;">2. Add Product</h3>
                <div id="estProductGoldIndicator" style="display: none; padding: 4px 10px; border-radius: 4px; font-weight: 600; font-size: 11px;"></div>
              </div>

              <div class="form-row" style="margin-top: 10px;">
                <div class="form-group product-search-group" style="flex: 2.5;">
                  <label>Product Name</label>
                  <input type="text" id="estProductName" class="form-input" placeholder="Start typing product name..." autocomplete="off">
                  <div id="estSearchDropdown" class="search-dropdown-container" style="display: none;"></div>
                </div>

                <div class="form-group">
                  <label>Pack Size</label>
                  <div class="pack-input-wrapper">
                    <input type="text" id="estProductPack" class="form-input" placeholder="e.g. 100">
                    <select id="estProductPackUnit" class="form-input pack-unit-select">
                      <option value="">Unit</option>
                      <option value="GM">GM</option>
                      <option value="ML">ML</option>
                      <option value="TAB">TAB</option>
                      <option value="GENERIC">Generic</option>
                    </select>
                  </div>
                </div>

                <div class="form-group">
                  <label>Batch No.</label>
                  <input type="text" id="estProductBatch" class="form-input" placeholder="Batch #">
                </div>

                <div class="form-group">
                  <label>MRP (₹)</label>
                  <input type="number" id="estProductMRP" class="form-input" placeholder="0.00" step="0.01">
                </div>

                <div class="form-group">
                  <label>Rate (₹)</label>
                  <input type="number" id="estProductRate" class="form-input" placeholder="0.00" step="0.01">
                </div>
              </div>

              <div class="form-row" style="margin-top: 8px;">
                <div class="form-group">
                  <label>Quantity</label>
                  <input type="number" id="estProductQty" class="form-input" placeholder="1" min="1" value="1" style="font-weight: 600;">
                </div>

                <div class="form-group">
                  <label>Discount 1 (%)</label>
                  <input type="number" id="estProductDis1" class="form-input" placeholder="0" step="0.01" value="0">
                </div>

                <div class="form-group">
                  <label>Discount 2 (%)</label>
                  <input type="number" id="estProductDis2" class="form-input" placeholder="0" step="0.01" value="0">
                </div>

                <div class="form-group">
                  <label>Scheme</label>
                  <select id="estProductScheme" class="form-input">
                    <option value="">No Scheme</option>
                    <option value="5+1">5+1 Free</option>
                    <option value="10+1">10+1 Free</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div class="form-group" id="estCustomSchemeContainer" style="display: none;">
                  <label>Custom Scheme</label>
                  <input type="text" id="estCustomSchemeValue" class="form-input" placeholder="e.g. 3+1">
                </div>

                <div class="form-group">
                  <label>Tax (%)</label>
                  <select id="estProductTax" class="form-input">
                    <option value="0">0%</option>
                    <option value="5" selected>5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                  </select>
                </div>

                <button type="button" id="estGstReverseBtn" class="gst-reverse-btn" style="margin-top: 24px; padding: 7px 12px; font-size: 11px; height: 35px;">↩️ GST Reverse</button>
                <input type="hidden" id="estGstReverseCheckbox" value="false">
              </div>

              <div class="form-actions" style="margin-top: 12px; display: flex; gap: 10px;">
                <button type="button" id="estAddProductBtn" class="btn btn-primary" style="background: #d97706; border-color: #b45309; padding: 8px 20px; font-weight: 600;">+ Add Product</button>
              </div>
            </div>

            <!-- 3. Products List Section -->
            <div class="product-list-section">
              <div class="product-list-header">
                <h3 class="product-list-title">
                  Products
                  <span class="product-count" id="estProductCountBadge">0</span>
                </h3>
              </div>
              <div class="product-list-wrapper" id="estProductListTable">
                <p style="padding: 24px; text-align: center; color: #9ca3af; font-size: 13px;">No products added.</p>
              </div>
            </div>
          </div>

          <!-- RIGHT PANEL: ESTIMATE SUMMARY -->
          <div class="bill-summary-panel">
            <div class="bill-summary">
              <h3 class="bill-summary-title" style="color: #d97706;">Estimate Summary</h3>

              <div class="summary-item">
                <span class="summary-item-label">Product Count</span>
                <span class="summary-item-value" id="estSummaryCount">0</span>
              </div>
              <div class="summary-item">
                <span class="summary-item-label">Total Quantity</span>
                <span class="summary-item-value" id="estSummaryQty">0</span>
              </div>

              <div class="summary-divider"></div>

              <div class="summary-item">
                <span class="summary-item-label">Subtotal</span>
                <span class="summary-item-value" id="estSummarySubtotal">₹0.00</span>
              </div>
              <div class="summary-item">
                <span class="summary-item-label">Total Discount</span>
                <span class="summary-item-value" id="estSummaryDiscount">₹0.00</span>
              </div>
              <div class="summary-item">
                <span class="summary-item-label">SGST</span>
                <span class="summary-item-value" id="estSummarySGST">₹0.00</span>
              </div>
              <div class="summary-item">
                <span class="summary-item-label">CGST</span>
                <span class="summary-item-value" id="estSummaryCGST">₹0.00</span>
              </div>
              <div class="summary-item">
                <span class="summary-item-label">Rounding Off</span>
                <span class="summary-item-value" id="estSummaryRounding">₹0.00</span>
              </div>

              <div class="summary-divider"></div>

              <div class="summary-total" style="background: rgba(217, 119, 6, 0.08); border-left: 4px solid #d97706; padding: 12px; border-radius: 6px;">
                <div class="summary-total-label" style="color: #b45309;">Grand Total</div>
                <div class="summary-total-value" id="estSummaryGrandTotal" style="color: #d97706; font-size: 20px;">₹0.00</div>
              </div>
            </div>

            <div class="bill-actions-section" style="margin-top: 16px; display: flex; flex-direction: column; gap: 8px;">
              <button type="button" id="estSaveBtn" class="bill-action-btn btn-convert-bill">Make Estimate</button>
              <button type="button" id="estPreviewBtn" class="bill-action-btn btn-estimate-preview">View Estimate</button>
              <button type="button" id="estClearAllBtn" class="bill-action-btn secondary">Clear All</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners();
    this.renderProductList();
    this.populateContactsList();
    this.populateProductsList();
    this.updateEstimateSummary();
  }

  async renderHistory() {
    this.editingEstimateId = null;
    this.isEditing = false;
    this.isEstimateDirty = false;
    this.selectedHistoryCustomer = '';
    this.historyStatusFilter = 'all';
    this.historyDateFilter = 'all';
    this.historyCustomerSort = 'name-asc';
    const estimateLoadingMarkup = window.MacOSLoader
      ? window.MacOSLoader.create('Loading Estimates...', 'Syncing with server', 'sm', true)
      : '<div class="macos-loader-container compact"><div class="macos-circular-loader sm" aria-hidden="true"></div><p class="macos-loader-title">Loading Estimates...</p><p class="macos-loader-subtitle">Syncing with server</p></div>';
    this.viewContainer.innerHTML = `
      <div class="estimate-workspace">
        <header class="estimate-workspace-header">
          <div class="estimate-workspace-brand">◆ ESTIMATES <span>|</span> QUOTATIONS</div>
          <div class="estimate-workspace-stats">
            <div><span>TOTAL ESTIMATES</span><strong id="estimateStatTotal">0</strong></div>
            <div><span>VALID</span><strong id="estimateStatValid">0</strong></div>
            <div><span>EXPIRED</span><strong id="estimateStatExpired">0</strong></div>
            <div><span>ESTIMATED VALUE</span><strong id="estimateStatValue">₹0.00</strong></div>
          </div>
          <div class="estimate-workspace-controls">
            <button type="button" id="estimateSidebarToggle" class="estimate-dark-button">☰ LIST</button>
            <select id="estimateDateFilter" aria-label="Filter estimates by date">
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="this-month">This Month</option>
              <option value="last-3">Last 3 Months</option>
              <option value="year">This Year</option>
            </select>
            <button type="button" id="newEstimateBtn" class="estimate-new-button">＋ New Estimate</button>
          </div>
        </header>
        <div class="estimate-workspace-body">
          <aside class="estimate-customer-sidebar orders-sidebar" id="estimateCustomerSidebar">
            <div class="estimate-sidebar-controls">
              <input type="search" id="estimateHistorySearch" class="orders-sidebar-search" placeholder="Search estimates or customers">
              <select id="estimateCustomerSort" class="orders-sidebar-sort" aria-label="Sort customers">
                <option value="name-asc">Name (A-Z)</option>
                <option value="name-desc">Name (Z-A)</option>
                <option value="recent">Most Recent</option>
                <option value="total-desc">Most Estimates</option>
              </select>
            </div>
            <div id="estimateCustomerList" class="estimate-customer-list orders-list"></div>
          </aside>
          <main class="estimate-history-main" id="estimateHistoryMain">
            <div class="estimate-history-title">
              <div>
                <h1 id="estimateHistoryTitle">All Estimates</h1>
                <p id="estimateHistoryMetrics">Loading estimates...</p>
              </div>
              <div class="estimate-status-filters" role="group" aria-label="Estimate status">
                <button type="button" data-estimate-status="all" class="active">All</button>
                <button type="button" data-estimate-status="valid">Valid</button>
                <button type="button" data-estimate-status="expired">Expired</button>
              </div>
            </div>
            <div id="estimateHistoryList" class="estimate-history-list" role="status" aria-live="polite">
              ${estimateLoadingMarkup}
            </div>
          </main>
        </div>
        <dialog class="estimate-validity-dialog" id="estimateValidityDialog" aria-labelledby="estimateValidityTitle">
          <form method="dialog" class="estimate-validity-dialog-content">
            <h2 id="estimateValidityTitle">Extend Estimate Validity</h2>
            <p>Select how many days to add after the current expiry date (or today if already expired).</p>
            <label for="estimateValidityDays">Extension duration</label>
            <select id="estimateValidityDays">
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30" selected>30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
              <option value="custom">Custom duration</option>
            </select>
            <label class="estimate-validity-custom" for="estimateValidityCustomDays" hidden>Custom days (1-3650)</label>
            <input id="estimateValidityCustomDays" type="number" min="1" max="3650" step="1" value="30" hidden>
            <div class="estimate-validity-dialog-actions">
              <button type="button" data-estimate-validity-cancel>Cancel</button>
              <button type="button" data-estimate-validity-confirm>Extend</button>
            </div>
          </form>
        </dialog>
      </div>
    `;
    if (window.matchMedia?.('(max-width: 620px)').matches) {
      this.viewContainer.querySelector('.estimate-workspace')?.classList.add('estimate-sidebar-hidden');
    }

    this.viewContainer.querySelector('#newEstimateBtn')?.addEventListener('click', () => this.render({ mode: 'new' }));
    this.viewContainer.querySelector('#estimateHistorySearch')?.addEventListener('input', event => {
      this.renderHistoryRows();
      this.filterHistorySidebar(event.target.value);
    });
    this.viewContainer.querySelector('#estimateCustomerSort')?.addEventListener('change', event => {
      this.historyCustomerSort = event.target.value;
      this.renderHistorySidebar();
    });
    this.viewContainer.querySelector('#estimateDateFilter')?.addEventListener('change', event => {
      this.historyDateFilter = event.target.value;
      this.renderHistoryRows();
    });
    this.viewContainer.querySelector('#estimateSidebarToggle')?.addEventListener('click', () => {
      this.viewContainer.querySelector('.estimate-workspace')?.classList.toggle('estimate-sidebar-hidden');
    });
    const validityDialog = this.viewContainer.querySelector('#estimateValidityDialog');
    const validityDaysSelect = this.viewContainer.querySelector('#estimateValidityDays');
    const customDaysInput = this.viewContainer.querySelector('#estimateValidityCustomDays');
    const customDaysLabel = this.viewContainer.querySelector('label[for="estimateValidityCustomDays"]');
    let cursorElements = [];
    validityDialog?.addEventListener('close', () => {
      cursorElements.forEach(element => document.body.appendChild(element));
      cursorElements = [];
    });
    validityDaysSelect?.addEventListener('change', () => {
      const showCustom = validityDaysSelect.value === 'custom';
      if (customDaysInput) customDaysInput.hidden = !showCustom;
      if (customDaysLabel) customDaysLabel.hidden = !showCustom;
    });
    this.viewContainer.querySelector('[data-estimate-validity-cancel]')?.addEventListener('click', () => validityDialog?.close());
    this.viewContainer.querySelector('[data-estimate-validity-confirm]')?.addEventListener('click', () => {
      const estimate = this.historyEstimates.find(item => String(item.id) === String(this.pendingValidityEstimateId));
      if (!estimate || !validityDaysSelect) return;
      const duration = validityDaysSelect.value === 'custom' ? customDaysInput?.value : validityDaysSelect.value;
      const days = Number(duration);
      if (!Number.isInteger(days) || days < 1 || days > 3650) {
        this.showNotification('Enter a whole number of days from 1 to 3650.', 'error');
        customDaysInput?.focus();
        return;
      }
      validityDialog?.close();
      this.changeEstimateValidity(estimate, 'extend', days);
    });
    validityDialog?.addEventListener('click', event => {
      if (event.target === validityDialog) validityDialog.close();
    });
    this.viewContainer.querySelector('.estimate-status-filters')?.addEventListener('click', event => {
      const button = event.target.closest('[data-estimate-status]');
      if (!button) return;
      this.historyStatusFilter = button.dataset.estimateStatus;
      this.viewContainer.querySelectorAll('[data-estimate-status]').forEach(filter => {
        filter.classList.toggle('active', filter === button);
      });
      this.renderHistoryRows();
    });
    this.viewContainer.querySelector('#estimateCustomerList')?.addEventListener('click', event => {
      const customer = event.target.closest('[data-estimate-customer]');
      if (!customer) return;
      this.selectHistoryCustomer(customer.dataset.estimateCustomer);
    });
    this.viewContainer.querySelector('#estimateCustomerList')?.addEventListener('keydown', event => {
      if ((event.key !== 'Enter' && event.key !== ' ') || !event.target.matches('[data-estimate-customer]')) return;
      event.preventDefault();
      this.selectHistoryCustomer(event.target.dataset.estimateCustomer);
    });
    this.viewContainer.querySelector('#estimateHistoryList')?.addEventListener('click', event => {
      const button = event.target.closest('[data-estimate-action]');
      if (!button) return;
      const estimate = this.historyEstimates.find(item => String(item.id) === button.dataset.estimateId);
      if (!estimate) return;

      switch (button.dataset.estimateAction) {
        case 'view':
          this.previewEstimate(estimate);
          break;
        case 'edit':
          this.render(estimate);
          break;
        case 'export':
          this.exportEstimate(estimate);
          break;
        case 'bill':
          this.convertToBill(estimate);
          break;
        case 'order':
          this.convertToOrder(estimate);
          break;
        case 'extend-validity':
          this.pendingValidityEstimateId = estimate.id;
          if (validityDaysSelect) validityDaysSelect.value = '30';
          if (customDaysInput) customDaysInput.hidden = true;
          if (customDaysLabel) customDaysLabel.hidden = true;
          validityDialog?.showModal();
          cursorElements = ['macos-cursor', 'macos-cursor-dot', 'macos-cursor-ring']
            .map(id => document.getElementById(id))
            .filter(Boolean);
          cursorElements.forEach(element => validityDialog?.appendChild(element));
          break;
        case 'expire':
          this.changeEstimateValidity(estimate, 'expire');
          break;
        case 'delete':
          this.deleteEstimate(estimate);
          break;
        default:
          break;
      }
    });

    try {
      const response = await this.billingApp.api.getEstimates({ forceRefresh: true });
      this.historyEstimates = this.normalizeCollection(response);
      this.renderHistorySidebar();
      this.renderHistoryRows();
    } catch (error) {
      log.error('Failed to load estimates:', error);
      const list = this.viewContainer.querySelector('#estimateHistoryList');
      if (list) list.innerHTML = `<div class="estimate-history-error">${this.escapeHtml(error.message || 'Unable to load estimates.')}</div>`;
    }
  }

  renderHistoryRows(query = '') {
    const list = this.viewContainer.querySelector('#estimateHistoryList');
    if (!list) return;
    const searchInput = this.viewContainer.querySelector('#estimateHistorySearch');
    const term = String(query || searchInput?.value || '').trim().toLowerCase();
    const today = this.formatDate(new Date());
    const date = new Date();
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const threeMonthsAgo = new Date(date.getFullYear(), date.getMonth() - 2, 1);
    const yearStart = new Date(date.getFullYear(), 0, 1);
    const estimates = this.historyEstimates.filter(estimate => {
      const customerKey = this.getHistoryCustomerKey(estimate);
      const matchesCustomer = !this.selectedHistoryCustomer || customerKey === this.selectedHistoryCustomer;
      const matchesSearch = !term || [
        estimate.estimate_no,
        estimate.party_name,
        estimate.subject
      ].some(value => String(value || '').toLowerCase().includes(term));
      const valid = !estimate.valid_until || this.formatDate(estimate.valid_until) >= today;
      const matchesStatus = this.historyStatusFilter === 'all'
        || (this.historyStatusFilter === 'valid' ? valid : !valid);
      const estimateDate = new Date(`${this.formatDate(estimate.estimate_date) || today}T00:00:00`);
      const matchesDate = this.historyDateFilter === 'all'
        || (this.historyDateFilter === 'today' && this.formatDate(estimateDate) === today)
        || (this.historyDateFilter === 'this-month' && estimateDate >= monthStart)
        || (this.historyDateFilter === 'last-3' && estimateDate >= threeMonthsAgo)
        || (this.historyDateFilter === 'year' && estimateDate >= yearStart);
      return matchesCustomer && matchesSearch && matchesStatus && matchesDate;
    }).sort((a, b) => {
      const dateDiff = new Date(b.estimate_date || 0) - new Date(a.estimate_date || 0);
      return dateDiff || Number(b.id || 0) - Number(a.id || 0);
    });

    const filteredTotal = estimates.reduce((total, estimate) => total + Number(estimate.grand_total || 0), 0);
    const title = this.viewContainer.querySelector('#estimateHistoryTitle');
    const metrics = this.viewContainer.querySelector('#estimateHistoryMetrics');
    const selectedCustomer = this.getHistoryCustomers().find(customer => customer.key === this.selectedHistoryCustomer);
    if (title) title.textContent = selectedCustomer ? selectedCustomer.name : 'All Estimates';
    if (metrics) metrics.textContent = `${estimates.length} estimate${estimates.length === 1 ? '' : 's'} · ₹${filteredTotal.toFixed(2)} total`;

    if (!estimates.length) {
      list.innerHTML = `<div class="estimate-history-empty">${this.historyEstimates.length ? 'No matching estimates.' : 'No estimates yet.'}</div>`;
      return;
    }

    list.innerHTML = `
      <div class="estimate-history-cards">
        ${estimates.map(estimate => {
          const isValid = !estimate.valid_until || this.formatDate(estimate.valid_until) >= today;
          const validUntilDate = this.formatDate(estimate.valid_until);
          const daysRemaining = validUntilDate
            ? Math.round((Date.parse(`${validUntilDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
            : null;
          const validityMessage = !Number.isFinite(daysRemaining)
            ? 'No expiry date'
            : daysRemaining > 0
              ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left`
              : daysRemaining === 0
                ? 'Expires today'
                : `Expired ${Math.abs(daysRemaining)} day${daysRemaining === -1 ? '' : 's'} ago`;
          return `
            <article class="estimate-record-card ledger-bill-record" style="padding: 12px; background: #ffffff; border: 1px solid ${isValid ? '#000000' : '#9ca3af'}; border-radius: 2px; margin-bottom: 8px; font-family: 'Courier New', monospace;">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 6px;">
                <div style="font-weight: 700; color: #000000; font-size: 12px; letter-spacing: 0.3px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span>${this.escapeHtml(estimate.estimate_no)}</span>
                  ${estimate.subject ? `<span style="font-size: 10px; color: #666666; font-weight: 500;">${this.escapeHtml(estimate.subject)}</span>` : ''}
                </div>
                <div style="font-size: 10px; font-weight: 800; color: #000000; background: transparent; padding: 2px 4px; border: 1px solid ${isValid ? '#d97706' : '#9ca3af'}; border-radius: 2px; text-transform: uppercase; letter-spacing: 0.4px; white-space: nowrap;">${isValid ? 'VALID' : 'EXPIRED'}</div>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 11px; color: #333333; margin-bottom: 4px; gap: 10px;">
                <span>█ ${this.escapeHtml(this.formatDate(estimate.estimate_date) || '-')}</span>
                <span style="font-weight: 700; color: #000000;">₹${Number(estimate.grand_total || 0).toFixed(2)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 10px; color: #666666; letter-spacing: 0.2px;">
                <span>◆ ${this.escapeHtml(estimate.party_name)}</span>
                <span class="estimate-validity-left">Valid until: ${this.escapeHtml(validUntilDate || '-')} · ${this.escapeHtml(validityMessage)}</span>
              </div>
              <div class="estimate-history-actions">
                <button type="button" data-estimate-action="view" data-estimate-id="${estimate.id}">View</button>
                <button type="button" data-estimate-action="export" data-estimate-id="${estimate.id}">Export</button>
                <button type="button" data-estimate-action="edit" data-estimate-id="${estimate.id}">Edit</button>
                <button type="button" data-estimate-action="bill" data-estimate-id="${estimate.id}">Make Bill</button>
                <button type="button" data-estimate-action="order" data-estimate-id="${estimate.id}" ${estimate.customer_id ? '' : 'title="Register or link this customer first"'}>Make Order</button>
                <button type="button" data-estimate-action="extend-validity" data-estimate-id="${estimate.id}" title="Choose how many days to extend validity">Extend Validity</button>
                ${isValid ? `<button type="button" data-estimate-action="expire" data-estimate-id="${estimate.id}" title="Expire this estimate immediately">Expire now</button>` : ''}
                <button type="button" data-estimate-action="delete" data-estimate-id="${estimate.id}">Delete</button>
              </div>
            </article>
          `;
        }).join('')}
      </div>
    `;
  }

  getHistoryCustomerKey(estimate) {
    if (estimate.customer_id) return `customer:${estimate.customer_id}`;
    return `walkin:${String(estimate.party_name || 'Walk-in').trim().toLowerCase()}`;
  }

  getHistoryCustomers() {
    const customers = new Map();
    this.historyEstimates.forEach(estimate => {
      const key = this.getHistoryCustomerKey(estimate);
      const existing = customers.get(key) || {
        key,
        name: estimate.party_name || 'Walk-in',
        count: 0,
        total: 0,
        recent: ''
      };
      existing.count += 1;
      existing.total += Number(estimate.grand_total || 0);
      const date = this.formatDate(estimate.estimate_date);
      if (date > existing.recent) existing.recent = date;
      customers.set(key, existing);
    });
    const sorted = [...customers.values()];
    if (this.historyCustomerSort === 'name-desc') sorted.sort((a, b) => b.name.localeCompare(a.name));
    else if (this.historyCustomerSort === 'recent') sorted.sort((a, b) => b.recent.localeCompare(a.recent));
    else if (this.historyCustomerSort === 'total-desc') sorted.sort((a, b) => b.count - a.count);
    else sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }

  renderHistorySidebar() {
    const customerList = this.viewContainer.querySelector('#estimateCustomerList');
    if (!customerList) return;
    const searchTerm = String(this.viewContainer.querySelector('#estimateHistorySearch')?.value || '').trim().toLowerCase();
    const customers = this.getHistoryCustomers();
    const allCount = this.historyEstimates.length;
    const allPendingCount = this.historyEstimates.filter(estimate => !estimate.valid_until || this.formatDate(estimate.valid_until) >= this.formatDate(new Date())).length;
    customerList.innerHTML = [{
      key: '',
      name: 'All Customers',
      count: allCount,
      pendingCount: allPendingCount,
      statusText: allCount ? `${allPendingCount} Valid Estimate${allPendingCount === 1 ? '' : 's'}` : 'No Estimates'
    }, ...customers.map(customer => {
      const matching = this.historyEstimates.filter(estimate => this.getHistoryCustomerKey(estimate) === customer.key);
      const pendingCount = matching.filter(estimate => !estimate.valid_until || this.formatDate(estimate.valid_until) >= this.formatDate(new Date())).length;
      return {
        ...customer,
        pendingCount,
        statusText: customer.count ? `${pendingCount} Valid Estimate${pendingCount === 1 ? '' : 's'}` : 'No Estimates'
      };
    })].map(customer => {
      const isActive = customer.key === this.selectedHistoryCustomer;
      const statusColor = customer.pendingCount > 0 ? '#facc15' : customer.count > 0 ? '#4ade80' : '#888888';
      return `
        <div class="estimate-customer-item orders-customer-item ${isActive ? 'active' : ''}" data-estimate-customer="${this.escapeHtml(customer.key)}" role="button" tabindex="0" aria-pressed="${isActive}">
          <div class="estimate-customer-item-header">
            <div class="estimate-customer-item-name">${this.escapeHtml(customer.name)}</div>
            <div class="estimate-customer-item-count">${customer.count}</div>
          </div>
          <div class="estimate-customer-item-total">
            <span class="${customer.total < 0 ? 'credit' : ''}">₹${Number(customer.total || 0).toFixed(0)}</span>
          </div>
          <div class="estimate-customer-item-status" style="--estimate-status-color:${statusColor}">● ${this.escapeHtml(customer.statusText)}</div>
        </div>
      `;
    }).join('');

    const totals = this.historyEstimates.reduce((result, estimate) => {
      result.total += Number(estimate.grand_total || 0);
      if (!estimate.valid_until || this.formatDate(estimate.valid_until) >= this.formatDate(new Date())) result.valid += 1;
      else result.expired += 1;
      return result;
    }, { total: 0, valid: 0, expired: 0 });
    const statTotal = this.viewContainer.querySelector('#estimateStatTotal');
    const statValid = this.viewContainer.querySelector('#estimateStatValid');
    const statExpired = this.viewContainer.querySelector('#estimateStatExpired');
    const statValue = this.viewContainer.querySelector('#estimateStatValue');
    if (statTotal) statTotal.textContent = this.historyEstimates.length;
    if (statValid) statValid.textContent = totals.valid;
    if (statExpired) statExpired.textContent = totals.expired;
    if (statValue) statValue.textContent = `₹${totals.total.toFixed(2)}`;
    this.filterHistorySidebar(searchTerm);
  }

  filterHistorySidebar(query = '') {
    const term = String(query).trim().toLowerCase();
    this.viewContainer.querySelectorAll('.estimate-customer-item[data-estimate-customer]').forEach(item => {
      const isAllCustomers = item.dataset.estimateCustomer === '';
      item.hidden = !isAllCustomers && term !== '' && !item.textContent.toLowerCase().includes(term);
    });
  }

  async persistEstimate(payload, estimateId = this.editingEstimateId) {
    const result = estimateId
      ? await this.billingApp.api.updateEstimate(estimateId, payload)
      : await this.billingApp.api.createEstimate(payload);
    const estimate = result.estimate || result;
    if (!estimate.id) throw new Error('Estimate save did not return an estimate ID.');
    this.editingEstimateId = estimate.id;
    this.isEstimateDirty = false;
    return estimate;
  }

  hasUnsavedChanges() {
    return this.isEditing && this.isEstimateDirty;
  }

  backToHistory() {
    if (this.hasUnsavedChanges() && !confirm('Discard unsaved estimate changes?')) return;
    this.renderHistory();
  }

  async saveEstimate() {
    try {
      const estimate = await this.persistEstimate(this.getEstimatePayload());
      this.showNotification(`Saved ${estimate.estimate_no}.`, 'success');
      await this.renderHistory();
    } catch (error) {
      log.error('Save estimate failed:', error);
      this.showNotification(error.message || 'Unable to save estimate.', 'error');
    }
  }

  async changeEstimateValidity(estimate, action, selectedDays = '30') {
    const today = this.formatDate(new Date());
    let validUntil;
    let extensionDays = 0;
    if (action === 'expire') {
      if (!confirm(`Expire estimate ${estimate.estimate_no} now?`)) return;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      validUntil = this.formatDate(yesterday);
    } else {
      extensionDays = Number(selectedDays);
      if (!Number.isInteger(extensionDays) || extensionDays < 1 || extensionDays > 3650) {
        this.showNotification('Enter a whole number of days from 1 to 3650.', 'error');
        return;
      }
      const currentExpiry = this.formatDate(estimate.valid_until);
      const startDate = currentExpiry && currentExpiry > today ? currentExpiry : today;
      const extendedDate = new Date(`${startDate}T00:00:00`);
      extendedDate.setDate(extendedDate.getDate() + extensionDays);
      validUntil = this.formatDate(extendedDate);
    }

    try {
      const result = await this.billingApp.api.updateEstimateValidity(estimate.id, validUntil);
      const updatedEstimate = result.estimate || result;
      this.historyEstimates = this.historyEstimates.map(item =>
        String(item.id) === String(updatedEstimate.id) ? updatedEstimate : item
      );
      this.renderHistorySidebar();
      this.renderHistoryRows();
      this.showNotification(
        action === 'expire'
          ? `Expired ${estimate.estimate_no}.`
          : `Extended ${estimate.estimate_no} by ${extensionDays} days through ${this.formatDate(updatedEstimate.valid_until)}.`,
        'success'
      );
    } catch (error) {
      log.error(`Unable to ${action} estimate validity:`, error);
      this.showNotification(error.message || 'Unable to update estimate validity.', 'error');
    }
  }

  async deleteEstimate(estimate) {
    if (!confirm(`Delete estimate ${estimate.estimate_no}?`)) return;
    try {
      await this.billingApp.api.deleteEstimate(estimate.id);
      this.showNotification(`Deleted ${estimate.estimate_no}.`, 'success');
      this.historyEstimates = this.historyEstimates.filter(item => String(item.id) !== String(estimate.id));
      this.renderHistorySidebar();
      this.renderHistoryRows(this.viewContainer.querySelector('#estimateHistorySearch')?.value || '');
    } catch (error) {
      log.error('Delete estimate failed:', error);
      this.showNotification(error.message || 'Unable to delete estimate.', 'error');
    }
  }

  setupEventListeners() {
    const container = this.viewContainer;

    // Toggle customer type
    const btnReg = container.querySelector('#estToggleRegistered');
    const btnUnreg = container.querySelector('#estToggleUnregistered');
    const secReg = container.querySelector('#estRegisteredCustomerSection');
    const secUnreg = container.querySelector('#estUnregisteredCustomerSection');

    btnReg?.addEventListener('click', () => {
      this.customerType = 'registered';
      this.isEstimateDirty = true;
      btnReg.classList.add('active');
      btnUnreg.classList.remove('active');
      secReg.style.display = 'block';
      secUnreg.style.display = 'none';
      const custName = container.querySelector('#estCustomerName')?.value.trim();
      if (custName) this.onCustomerSelected(custName);
    });

    btnUnreg?.addEventListener('click', () => {
      this.customerType = 'unregistered';
      this.isEstimateDirty = true;
      btnUnreg.classList.add('active');
      btnReg.classList.remove('active');
      secReg.style.display = 'none';
      secUnreg.style.display = 'block';
      this.selectedCustomer = null;
      this.selectedCustomerId = null;
    });

    // Registered customer selection
    const customerInput = container.querySelector('#estCustomerName');
    customerInput?.addEventListener('input', (e) => this.onCustomerSelected(e.target.value));
    customerInput?.addEventListener('change', (e) => this.onCustomerSelected(e.target.value));

    // Product search autocomplete
    const prodNameInput = container.querySelector('#estProductName');
    const searchDropdown = container.querySelector('#estSearchDropdown');

    prodNameInput?.addEventListener('input', (e) => this.handleProductSearch(e.target.value));
    prodNameInput?.addEventListener('focus', (e) => {
      if (e.target.value.trim().length > 0) this.handleProductSearch(e.target.value);
    });

    prodNameInput?.addEventListener('keydown', (e) => this.handleProductKeyDown(e));

    // Close dropdown on outside click
    if (this.documentClickHandler) {
      document.removeEventListener('click', this.documentClickHandler);
    }
    this.documentClickHandler = (e) => {
      if (!prodNameInput?.contains(e.target) && !searchDropdown?.contains(e.target)) {
        if (searchDropdown) searchDropdown.style.display = 'none';
        this.isDropdownOpen = false;
      }
    };
    document.addEventListener('click', this.documentClickHandler);

    // Scheme change listener
    const schemeSelect = container.querySelector('#estProductScheme');
    const customSchemeContainer = container.querySelector('#estCustomSchemeContainer');
    schemeSelect?.addEventListener('change', () => {
      if (customSchemeContainer) {
        customSchemeContainer.style.display = schemeSelect.value === 'custom' ? 'block' : 'none';
      }
    });

    // Reverse GST button
    const gstReverseBtn = container.querySelector('#estGstReverseBtn');
    const gstReverseCheckbox = container.querySelector('#estGstReverseCheckbox');
    gstReverseBtn?.addEventListener('click', () => {
      const active = gstReverseBtn.classList.toggle('active');
      if (gstReverseCheckbox) gstReverseCheckbox.value = active ? 'true' : 'false';
      this.recalculateRateFromMRP();
    });

    // MRP change triggers rate recalculation
    container.querySelector('#estProductMRP')?.addEventListener('input', () => {
      this.recalculateRateFromMRP();
    });

    container.querySelector('#estProductTax')?.addEventListener('change', () => {
      this.recalculateRateFromMRP();
    });

    // Add Product button
    container.querySelector('#estAddProductBtn')?.addEventListener('click', () => this.addProductToEstimate());

    // Preview Estimate button
    container.querySelector('#estPreviewBtn')?.addEventListener('click', () => this.previewEstimate());

    container.querySelector('#estSaveBtn')?.addEventListener('click', () => this.saveEstimate());
    container.addEventListener('input', event => {
      if (event.target.matches('input, select, textarea')) this.isEstimateDirty = true;
    });
    container.addEventListener('change', event => {
      if (event.target.matches('input, select, textarea')) this.isEstimateDirty = true;
    });

    // Clear All button
    container.querySelector('#estClearAllBtn')?.addEventListener('click', () => {
      if (confirm('Clear estimate fields and products?')) {
        this.render({ mode: 'new' });
      }
    });
  }

  recalculateRateFromMRP() {
    const container = this.viewContainer;
    const mrp = parseFloat(container.querySelector('#estProductMRP')?.value) || 0;
    const rateInput = container.querySelector('#estProductRate');
    const isReverse = container.querySelector('#estGstReverseCheckbox')?.value === 'true';
    const taxPer = parseFloat(container.querySelector('#estProductTax')?.value) || 0;

    if (!rateInput || mrp <= 0) return;

    if (isReverse && taxPer > 0) {
      // Calculate rate excluding tax: Rate = MRP / (1 + Tax / 100)
      const baseRate = mrp / (1 + taxPer / 100);
      rateInput.value = baseRate.toFixed(2);
    } else {
      if (!rateInput.value || parseFloat(rateInput.value) <= 0 || isReverse === false) {
        rateInput.value = mrp.toFixed(2);
      }
    }
  }

  async populateContactsList() {
    try {
      const scoped = this.billingApp?.getScopedBillingData ? this.billingApp.getScopedBillingData() : null;
      if (scoped && scoped.contacts && scoped.contacts.length > 0) {
        this.allContacts = scoped.contacts;
      } else {
        const resp = await fetch('/api/contacts');
        if (resp.ok) {
          const data = await resp.json();
          this.allContacts = this.normalizeCollection(data);
        }
      }

      const datalist = this.viewContainer.querySelector('#estCustomerDatalist');
      if (datalist && this.allContacts.length > 0) {
        datalist.innerHTML = this.allContacts
          .filter(c => c && c.name)
          .map(c => `<option value="${this.escapeHtml(c.name)}"></option>`)
          .join('');
      }
      if (this.selectedCustomerId) {
        const contact = this.allContacts.find(item => String(item.id) === String(this.selectedCustomerId));
        if (contact) {
          const input = this.viewContainer.querySelector('#estCustomerName');
          if (input) input.value = contact.name;
          this.onCustomerSelected(contact.name);
        }
      }
    } catch (e) {
      log.warn('Failed to load contacts for estimate:', e);
    }
  }

  async populateProductsList() {
    try {
      if (this.billingApp?.cachedProducts && this.billingApp.cachedProducts.length > 0) {
        this.cachedProducts = this.billingApp.cachedProducts;
      } else {
        const resp = await fetch('/api/products');
        if (resp.ok) {
          const data = await resp.json();
          this.cachedProducts = this.normalizeCollection(data);
        }
      }
    } catch (e) {
      log.warn('Failed to load products for estimate:', e);
    }
  }

  onCustomerSelected(name) {
    const term = String(name || '').trim().toLowerCase();
    const contact = this.allContacts.find(c => c.name && c.name.toLowerCase() === term);
    const container = this.viewContainer;

    if (contact) {
      this.selectedCustomer = contact;
      this.selectedCustomerId = contact.id;
      this.customerSnapshot = {
        name: contact.name || '',
        phone: contact.phone || contact.mobile || '',
        gstin: contact.gstin || '',
        address: [contact.address, contact.city, contact.state].filter(Boolean).join(', '),
        licence_no: contact.licence_no || contact.dl_no || '',
        pan: contact.pan || ''
      };
      const phoneEl = container.querySelector('#estRegPhone');
      const gstinEl = container.querySelector('#estRegGstin');
      const addrEl = container.querySelector('#estRegAddress');
      const licEl = container.querySelector('#estRegLicence');
      const panEl = container.querySelector('#estRegPan');

      if (phoneEl) phoneEl.value = contact.phone || contact.mobile || '';
      if (gstinEl) gstinEl.value = contact.gstin || '';
      if (addrEl) addrEl.value = [contact.address, contact.city, contact.state].filter(Boolean).join(', ') || '';
      if (licEl) licEl.value = contact.licence_no || contact.dl_no || '';
      if (panEl) panEl.value = contact.pan || '';

      // If a product is currently open in form, load this customer's preference memory
      if (this.currentProduct && this.currentProduct.name) {
        this.loadProductMemoryFromAPI(this.currentProduct.name, contact.name);
      }
    } else {
      this.selectedCustomer = null;
      this.selectedCustomerId = null;
      this.customerSnapshot = null;
      ['#estRegPhone', '#estRegGstin', '#estRegAddress', '#estRegLicence', '#estRegPan'].forEach(selector => {
        const field = container.querySelector(selector);
        if (field) field.value = '';
      });
    }
  }

  handleProductSearch(query) {
    const term = query.trim().toLowerCase();
    const dropdown = this.viewContainer.querySelector('#estSearchDropdown');
    if (!dropdown) return;

    if (!term || term.length < 1) {
      dropdown.style.display = 'none';
      this.isDropdownOpen = false;
      this.selectedIndex = -1;
      return;
    }

    let matches = [];
    if (window.SuiteCoreBridge?.isWasmLoaded?.()) {
      try {
        matches = window.SuiteCoreBridge.searchCatalog(term, this.cachedProducts, { limit: 10, min_score: 25 });
      } catch (error) {
        log.warn('Catalog search fallback:', error);
      }
    }
    if (!matches.length) {
      matches = this.cachedProducts.filter(product =>
        (product.name && product.name.toLowerCase().includes(term)) ||
        (product.generic_name && product.generic_name.toLowerCase().includes(term)) ||
        (product.code && product.code.toLowerCase().includes(term))
      ).slice(0, 10);
    }

    this.dropdownProducts = matches;

    if (matches.length === 0) {
      dropdown.innerHTML = '<div style="padding: 10px; color: #9ca3af; font-size: 12px;">No products found.</div>';
      dropdown.style.display = 'block';
      this.isDropdownOpen = true;
      return;
    }

    dropdown.innerHTML = matches.map((p, idx) => {
      const isGold = (p.isGold === true || p.is_gold === true || p.is_gold === 1 || p.is_gold === '1') ||
                     (p.classification && String(p.classification).toLowerCase() === 'gold') ||
                     (p.category && String(p.category).toLowerCase() === 'gold');
      const badgeHtml = isGold ? `<span style="background: #fff8e6; color: #b45309; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; border: 1px solid #fde68a;">GOLD</span>` : '';
      const packStr = p.pack_value ? `${p.pack_value} ${p.pack_type || ''}` : (p.pack_size || p.pack || 'Standard');
      const mrpStr = p.mrp ? `₹${parseFloat(p.mrp).toFixed(2)}` : 'MRP N/A';
      const batchStr = p.batch_no || (p.batches && p.batches[0]?.batch_no) || 'Default';

      return `
        <div class="search-dropdown-item" data-idx="${idx}" style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid rgba(0,0,0,0.05); display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 600; font-size: 13px; color: #1f2937; display: flex; align-items: center; gap: 6px;">
              ${this.escapeHtml(p.name)} ${badgeHtml}
            </div>
            <div style="display: flex; gap: 10px; font-size: 11px; color: #6b7280; margin-top: 2px;">
              <span>Pack: ${this.escapeHtml(packStr)}</span>
              <span>Batch: ${this.escapeHtml(batchStr)}</span>
              ${p.hsn_code ? `<span>HSN: ${this.escapeHtml(p.hsn_code)}</span>` : ''}
              ${p.gst_percent !== undefined ? `<span>GST: ${this.escapeHtml(p.gst_percent)}%</span>` : ''}
            </div>
          </div>
          <div style="text-align: right; font-weight: 700; font-size: 13px; color: #059669;">
            ${mrpStr}
          </div>
        </div>
      `;
    }).join('');

    dropdown.style.display = 'block';
    this.isDropdownOpen = true;
    this.selectedIndex = -1;

    dropdown.querySelectorAll('.search-dropdown-item').forEach((item, i) => {
      item.addEventListener('click', () => {
        this.selectProductFromDropdown(matches[i]);
      });
    });
  }

  handleProductKeyDown(e) {
    if (!this.isDropdownOpen || !this.dropdownProducts.length) return;
    const dropdown = this.viewContainer.querySelector('#estSearchDropdown');
    const items = dropdown?.querySelectorAll('.search-dropdown-item') || [];

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
      this.updateDropdownSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this.updateDropdownSelection(items);
    } else if (e.key === 'Enter') {
      if (this.selectedIndex >= 0 && this.dropdownProducts[this.selectedIndex]) {
        e.preventDefault();
        this.selectProductFromDropdown(this.dropdownProducts[this.selectedIndex]);
      } else if (this.dropdownProducts.length > 0) {
        e.preventDefault();
        this.selectProductFromDropdown(this.dropdownProducts[0]);
      }
    } else if (e.key === 'Escape') {
      this.hideSearchDropdown();
    }
  }

  updateDropdownSelection(items) {
    items.forEach((item, idx) => {
      if (idx === this.selectedIndex) {
        item.style.background = '#fef3c7';
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.style.background = 'transparent';
      }
    });
  }

  hideSearchDropdown() {
    const dropdown = this.viewContainer.querySelector('#estSearchDropdown');
    if (dropdown) {
      dropdown.style.display = 'none';
      this.isDropdownOpen = false;
      this.selectedIndex = -1;
    }
  }

  selectProductFromDropdown(product) {
    const productNameInput = this.viewContainer.querySelector('#estProductName');
    if (productNameInput) productNameInput.value = product.name;
    this.currentProduct = product;
    this.hideSearchDropdown();
    this.fillProductFormFields(product, true);
  }

  updateFormGoldIndicator(product) {
    const indicator = this.viewContainer.querySelector('#estProductGoldIndicator');
    if (!indicator) return;

    if (!product) {
      indicator.style.display = 'none';
      return;
    }

    const isGold = (product.isGold === true || product.is_gold === true || product.is_gold === 1 || product.is_gold === '1') ||
                   (product.classification && String(product.classification).toLowerCase() === 'gold') ||
                   (product.category && String(product.category).toLowerCase() === 'gold');

    indicator.textContent = isGold ? '🔶 GOLD PRODUCT' : '⚪ STANDARD PRODUCT';
    indicator.style.display = 'block';
    if (isGold) {
      indicator.style.background = '#fff8e6';
      indicator.style.color = '#b45309';
      indicator.style.border = '1px solid #fde68a';
    } else {
      indicator.style.background = '#f1f5f9';
      indicator.style.color = '#475569';
      indicator.style.border = '1px solid #cbd5e1';
    }
  }

  normalizePackType(packType) {
    if (!packType) return '';
    const norm = packType.trim().toUpperCase();
    if (norm.includes('GM') || norm.includes('GRAM')) return 'GM';
    if (norm.includes('ML') || norm.includes('MILL')) return 'ML';
    if (norm.includes('TAB') || norm.includes('TABLET')) return 'TAB';
    if (norm.includes('GENERIC') || norm.includes('GEN')) return 'GENERIC';
    if (['GM', 'ML', 'TAB', 'GENERIC'].includes(norm)) return norm;
    return '';
  }

  fillProductFormFields(product, loadPreferences = true) {
    this.updateFormGoldIndicator(product);

    // Check multiple variants or multiple batches in single variant
    const variantCount = (product.variants && Array.isArray(product.variants)) ? product.variants.length : 0;
    const hasMultipleBatchesInSingleVariant = (variantCount === 1 && product.variants[0].batches && product.variants[0].batches.length > 1);

    if (variantCount > 1 || hasMultipleBatchesInSingleVariant) {
      if (this.isSelectingVariant) return;
      this.showVariantSelector(product.variants, product.name);
      return;
    }

    if (variantCount === 1) {
      const variant = product.variants[0];
      const batch = variant.batches?.[0] || null;
      product.variant_id = variant.id || variant.variant_id || null;
      product.batch_id = batch?.id || batch?.batch_id || null;
      product.batch_no = batch?.batch_no || batch?.batchNo || product.batch_no || '';
      product.exp_date = batch?.exp_date || product.exp_date || '';
    }

    const container = this.viewContainer;
    const packInput = container.querySelector('#estProductPack');
    const packUnitSelect = container.querySelector('#estProductPackUnit');
    const batchInput = container.querySelector('#estProductBatch');
    const mrpInput = container.querySelector('#estProductMRP');
    const rateInput = container.querySelector('#estProductRate');
    const taxSelect = container.querySelector('#estProductTax');

    // Pack auto-fill
    if (product.pack_value) {
      if (packInput) packInput.value = product.pack_value;
      if (packUnitSelect && product.pack_type) packUnitSelect.value = this.normalizePackType(product.pack_type);
    } else if (product.pack) {
      const match = String(product.pack).match(/^([\d.]+)\s*(.*)$/);
      if (match) {
        if (packInput) packInput.value = match[1];
        if (packUnitSelect && match[2]) packUnitSelect.value = this.normalizePackType(match[2]);
      } else {
        if (packInput) packInput.value = product.pack;
      }
    }

    // Batch auto-fill
    if (product.batch_no) {
      if (batchInput) batchInput.value = product.batch_no;
    } else if (product.variants && product.variants[0]?.batches && product.variants[0].batches[0]) {
      const b0 = product.variants[0].batches[0];
      if (batchInput) batchInput.value = b0.batch_no || b0.batchNo || 'EST-BATCH';
      if (b0.mrp && mrpInput) mrpInput.value = b0.mrp;
    }

    // MRP auto-fill
    if (product.mrp && mrpInput) {
      mrpInput.value = product.mrp;
    }

    // Tax auto-fill from product master
    if (taxSelect && product.gst_percent !== undefined) {
      taxSelect.value = String(product.gst_percent);
    }

    // Recalculate rate from MRP
    this.recalculateRateFromMRP();

    // Query customer preference memory from DB
    if (loadPreferences) {
      const custName = this.customerType === 'registered' 
        ? container.querySelector('#estCustomerName')?.value.trim()
        : container.querySelector('#estUnregName')?.value.trim();

      if (custName) {
        this.loadProductMemoryFromAPI(product.name, custName);
      }
    }

    // Focus on quantity
    const qtyInput = container.querySelector('#estProductQty');
    if (qtyInput) {
      qtyInput.focus();
      qtyInput.select();
    }
  }

  showVariantSelector(variants, productName = '') {
    if (this.isVariantModalOpen) return;
    this.isVariantModalOpen = true;

    const existing = document.getElementById('variantSelectorModal');
    if (existing) {
      const previousImageUrl = existing.querySelector('img')?.src;
      if (previousImageUrl?.startsWith('blob:')) URL.revokeObjectURL(previousImageUrl);
      existing.remove();
    }

    const normalizedVariants = variants.map(v => {
      if (typeof v === 'object' && v !== null && (v.pack_size_value !== undefined || v.pack_size_type !== undefined || v.batches !== undefined)) {
        return v;
      }
      return {
        pack_size_value: v.pack_size_value || v.packValue || v.pack || '',
        pack_size_type: v.pack_size_type || v.packType || '',
        batches: v.batches || []
      };
    });

    const modalHtml = `
      <div id="variantSelectorModal" class="variant-modal-overlay">
        <div class="variant-modal" style="max-width: 500px;">
          <div class="variant-modal-header" style="background: #fafaf9; border-bottom: 1px solid #e5e7eb; padding: 14px 18px;">
            <h3 style="margin:0; font-size: 15px; font-weight: 700; color: #1c1917;">Select Variant / Batch for ${this.escapeHtml(productName)}</h3>
            <button class="variant-modal-close" id="estVariantCloseBtn" style="border:none;background:none;font-size:22px;cursor:pointer;">×</button>
          </div>
          <div class="variant-modal-body" style="padding: 16px; max-height: 380px; overflow-y: auto;">
            <div class="variant-list">
              ${normalizedVariants.map((v, idx) => `
                <div class="variant-group" style="margin-bottom: 14px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px;">
                  <div class="variant-pack-header" style="font-weight: 700; font-size: 13px; color: #374151; margin-bottom: 8px;">
                    Pack: ${this.escapeHtml(v.pack_size_value)} ${this.escapeHtml(v.pack_size_type || '')}
                  </div>
                  ${v.batches && v.batches.length > 0 ? `
                    <div class="variant-batches-list" style="display: flex; flex-direction: column; gap: 6px;">
                      ${v.batches.map((batch, batchIdx) => `
                        <label class="variant-batch-label" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #f8fafc; border-radius: 6px; cursor: pointer; border: 1px solid #e2e8f0;">
                          <div style="display: flex; align-items: center; gap: 8px;">
                            <input type="radio" name="estVariantOption" value="${idx}" data-batch-index="${batchIdx}" ${idx === 0 && batchIdx === 0 ? 'checked' : ''} />
                            <span class="batch-no" style="font-weight: 600; color: #1e293b;">Batch: ${this.escapeHtml(batch.batchNo || batch.batch_no)}</span>
                            ${batch.exp_date ? `<span style="font-size: 11px; color: #64748b;">(Exp: ${this.escapeHtml(batch.exp_date)})</span>` : ''}
                          </div>
                          <span class="batch-mrp" style="font-weight: 700; color: #059669;">₹${Number(batch.mrp || 0).toFixed(2)}</span>
                        </label>
                      `).join('')}
                    </div>
                  ` : `
                    <div style="color: #94a3b8; font-size: 12px;">No batches available.</div>
                  `}
                </div>
              `).join('')}
            </div>
          </div>
          <div class="variant-modal-footer" style="padding: 12px 18px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 8px;">
            <button class="variant-modal-btn cancel" id="estVariantCancelBtn" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #d1d5db; background: white; cursor: pointer;">Cancel</button>
            <button class="variant-modal-btn confirm" id="estVariantConfirmBtn" style="padding: 8px 18px; border-radius: 6px; border: none; background: #d97706; color: white; font-weight: 600; cursor: pointer;">Select Variant</button>
          </div>
        </div>
      </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    this.viewContainer.appendChild(div.firstElementChild);
    this.variantsToSelect = normalizedVariants;

    const closeModal = () => {
      document.getElementById('variantSelectorModal')?.remove();
      this.isVariantModalOpen = false;
    };

    document.getElementById('estVariantCloseBtn')?.addEventListener('click', closeModal);
    document.getElementById('estVariantCancelBtn')?.addEventListener('click', closeModal);
    document.getElementById('estVariantConfirmBtn')?.addEventListener('click', () => {
      const selected = document.querySelector('input[name="estVariantOption"]:checked');
      if (selected) {
        const vIdx = parseInt(selected.value, 10);
        const bIdx = parseInt(selected.getAttribute('data-batch-index') || '0', 10);
        this.selectVariant(vIdx, bIdx);
      }
      closeModal();
    });
  }

  selectVariant(vIdx, bIdx) {
    if (vIdx < 0 || vIdx >= this.variantsToSelect.length) return;
    this.isSelectingVariant = true;
    try {
      const variant = this.variantsToSelect[vIdx];
      const batch = variant.batches && variant.batches[bIdx] ? variant.batches[bIdx] : null;

      const container = this.viewContainer;
      const packInput = container.querySelector('#estProductPack');
      const packUnitSelect = container.querySelector('#estProductPackUnit');
      const batchInput = container.querySelector('#estProductBatch');
      const mrpInput = container.querySelector('#estProductMRP');
      const rateInput = container.querySelector('#estProductRate');

      const packVal = variant.pack_size_value || variant.pack_value || variant.pack;
      const packType = variant.pack_size_type || variant.pack_type;

      if (packInput && packVal) packInput.value = packVal;
      if (packUnitSelect && packType) packUnitSelect.value = this.normalizePackType(packType);

      if (batch) {
        if (batchInput) batchInput.value = batch.batchNo || batch.batch_no || '';
        if (mrpInput && batch.mrp) mrpInput.value = batch.mrp;
        if (rateInput && batch.mrp) rateInput.value = batch.mrp;
        if (this.currentProduct) {
          this.currentProduct.variant_id = variant.id || variant.variant_id || null;
          this.currentProduct.batch_id = batch.id || batch.batch_id || null;
          this.currentProduct.batch_no = batch.batchNo || batch.batch_no;
          this.currentProduct.mrp = batch.mrp;
          this.currentProduct.exp_date = batch.exp_date || '';
        }
      } else if (this.currentProduct) {
        this.currentProduct.variant_id = variant.id || variant.variant_id || null;
        this.currentProduct.batch_id = null;
      }

      this.recalculateRateFromMRP();

      // Load customer preference memory
      const custName = this.customerType === 'registered' 
        ? container.querySelector('#estCustomerName')?.value.trim()
        : container.querySelector('#estUnregName')?.value.trim();

      if (custName && this.currentProduct) {
        this.loadProductMemoryFromAPI(this.currentProduct.name, custName);
      }

      // Focus quantity
      const qtyInput = container.querySelector('#estProductQty');
      if (qtyInput) {
        qtyInput.focus();
        qtyInput.select();
      }
    } finally {
      setTimeout(() => { this.isSelectingVariant = false; }, 100);
    }
  }

  async loadProductMemoryFromAPI(productName, customerName) {
    if (!productName || !customerName) return;
    try {
      const res = await fetch(`/api/billing/preference/${encodeURIComponent(customerName)}/${encodeURIComponent(productName)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.status === 'success' && json.data) {
          const pref = json.data;
          const container = this.viewContainer;

          if (pref.disc1 !== undefined && pref.disc1 !== null && pref.disc1 !== '') {
            const d1 = container.querySelector('#estProductDis1');
            if (d1) d1.value = pref.disc1;
          }
          if (pref.disc2 !== undefined && pref.disc2 !== null && pref.disc2 !== '') {
            const d2 = container.querySelector('#estProductDis2');
            if (d2) d2.value = pref.disc2;
          }
          if (pref.scheme !== undefined && pref.scheme !== null && pref.scheme !== '') {
            const sc = container.querySelector('#estProductScheme');
            if (sc) {
              sc.value = pref.scheme;
              const customSc = container.querySelector('#estCustomSchemeContainer');
              if (customSc) customSc.style.display = pref.scheme === 'custom' ? 'block' : 'none';
            }
          }
          if (pref.tax !== undefined && pref.tax !== null && pref.tax !== '') {
            const tx = container.querySelector('#estProductTax');
            if (tx) tx.value = pref.tax;
          }
          if (pref.gst_reverse !== undefined && pref.gst_reverse !== null) {
            const chk = container.querySelector('#estGstReverseCheckbox');
            const btn = container.querySelector('#estGstReverseBtn');
            const isRev = Boolean(pref.gst_reverse);
            if (chk) chk.value = isRev ? 'true' : 'false';
            if (btn) {
              if (isRev) btn.classList.add('active');
              else btn.classList.remove('active');
            }
            this.recalculateRateFromMRP();
          }

          log.debug(`Loaded DB preference for ${customerName} • ${productName}:`, pref);
        }
      }
    } catch (e) {
      log.warn('Could not load customer product preference:', e);
    }
  }

  addProductToEstimate() {
    const container = this.viewContainer;
    const name = container.querySelector('#estProductName')?.value.trim();
    if (!name) {
      this.showNotification('Please select or enter a product name', 'error');
      return;
    }

    const mrp = parseFloat(container.querySelector('#estProductMRP')?.value) || 0;
    const rate = parseFloat(container.querySelector('#estProductRate')?.value) || mrp;
    const qty = parseInt(container.querySelector('#estProductQty')?.value, 10) || 1;
    const dis1 = parseFloat(container.querySelector('#estProductDis1')?.value) || 0;
    const dis2 = parseFloat(container.querySelector('#estProductDis2')?.value) || 0;
    const taxPer = parseFloat(container.querySelector('#estProductTax')?.value) || 0;
    const scheme = container.querySelector('#estProductScheme')?.value || '';
    const customScheme = container.querySelector('#estCustomSchemeValue')?.value || '';
    const pack = container.querySelector('#estProductPack')?.value.trim() || '';
    const packUnit = container.querySelector('#estProductPackUnit')?.value || '';
    const fullPack = pack ? `${pack} ${packUnit}`.trim() : (this.currentProduct?.pack || '');
    const batch = container.querySelector('#estProductBatch')?.value.trim() || '';
    const isReverse = container.querySelector('#estGstReverseCheckbox')?.value === 'true';

    // Calculate line item totals using BillCalculator
    let lineItem;
    if (typeof window !== 'undefined' && window.BillCalculator) {
      lineItem = window.BillCalculator.calculateLineItem({
        qty,
        rate,
        mrp,
        dis1,
        dis2,
        scheme: scheme === 'custom' ? customScheme : scheme,
        tax_percent: taxPer,
        gst_reverse: isReverse
      });
    } else {
      const gross = qty * rate;
      const d1Val = gross * (dis1 / 100);
      const d2Val = (gross - d1Val) * (dis2 / 100);
      const totalDis = d1Val + d2Val;
      const taxable = gross - totalDis;
      const taxAmount = taxable * (taxPer / 100);
      const finalAmount = taxable + taxAmount;
      lineItem = {
        amount: gross,
        discount_amount: totalDis,
        taxable_amount: taxable,
        tax_amount: taxAmount,
        sgst_amount: taxAmount / 2,
        cgst_amount: taxAmount / 2,
        final_amount: finalAmount,
        free_qty: 0
      };
    }

    const productEntry = {
      product_id: this.currentProduct?.id || null,
      variant_id: this.currentProduct?.variant_id || null,
      batch_id: this.currentProduct?.batch_id || null,
      name,
      hsn: this.currentProduct?.hsn_code || '30049011',
      mfg: this.currentProduct?.mfg || '',
      pack: fullPack,
      pack_value: pack || this.currentProduct?.pack_value || '',
      pack_type: packUnit || this.currentProduct?.pack_type || '',
      batch_no: batch,
      exp_date: this.currentProduct?.exp_date || '',
      qty,
      free: lineItem.free_qty || 0,
      scheme: scheme === 'custom' ? customScheme : scheme,
      mrp,
      rate,
      amount: lineItem.amount || (qty * rate),
      dis1,
      dis2,
      discount_amount: lineItem.discount_amount || 0,
      sgst_per: taxPer / 2,
      sgst_val: lineItem.sgst_amount || 0,
      cgst_per: taxPer / 2,
      cgst_val: lineItem.cgst_amount || 0,
      gstTotal: taxPer,
      gst_percent: taxPer,
      final_amt: lineItem.final_amount || lineItem.amount,
      gst_reverse: isReverse,
      is_gold: (this.currentProduct?.is_gold || 0)
    };

    this.currentEstimateProducts.push(productEntry);
    this.isEstimateDirty = true;
    this.clearProductForm();
    this.renderProductList();
    this.updateEstimateSummary();
    this.showNotification(`Added ${name}.`, 'success');
  }

  clearProductForm() {
    const container = this.viewContainer;
    const nameInput = container.querySelector('#estProductName');
    if (nameInput) nameInput.value = '';
    const packInput = container.querySelector('#estProductPack');
    if (packInput) packInput.value = '';
    const packUnitSelect = container.querySelector('#estProductPackUnit');
    if (packUnitSelect) packUnitSelect.value = '';
    const batchInput = container.querySelector('#estProductBatch');
    if (batchInput) batchInput.value = '';
    const mrpInput = container.querySelector('#estProductMRP');
    if (mrpInput) mrpInput.value = '';
    const rateInput = container.querySelector('#estProductRate');
    if (rateInput) rateInput.value = '';
    const qtyInput = container.querySelector('#estProductQty');
    if (qtyInput) qtyInput.value = '1';
    const dis1Input = container.querySelector('#estProductDis1');
    if (dis1Input) dis1Input.value = '0';
    const dis2Input = container.querySelector('#estProductDis2');
    if (dis2Input) dis2Input.value = '0';
    const schemeSelect = container.querySelector('#estProductScheme');
    if (schemeSelect) schemeSelect.value = '';
    const customSchemeContainer = container.querySelector('#estCustomSchemeContainer');
    if (customSchemeContainer) customSchemeContainer.style.display = 'none';
    const gstBtn = container.querySelector('#estGstReverseBtn');
    if (gstBtn) gstBtn.classList.remove('active');
    const gstChk = container.querySelector('#estGstReverseCheckbox');
    if (gstChk) gstChk.value = 'false';
    const taxSelect = container.querySelector('#estProductTax');
    if (taxSelect) taxSelect.value = '5';

    this.updateFormGoldIndicator(null);
    this.currentProduct = null;
  }

  renderProductList() {
    const listTable = this.viewContainer.querySelector('#estProductListTable');
    const badge = this.viewContainer.querySelector('#estProductCountBadge');
    if (badge) badge.textContent = String(this.currentEstimateProducts.length);

    if (!listTable) return;

    if (this.currentEstimateProducts.length === 0) {
      listTable.innerHTML = '<div class="empty-products-message">No products added yet.</div>';
      return;
    }

    listTable.innerHTML = `
      <div class="product-cards-container">
        ${this.currentEstimateProducts.map((product, index) => {
          const name = this.escapeHtml(product.name || product.product_name || 'Product');
          const pack = this.escapeHtml(product.pack || product.pack_value || '-');
          const batch = this.escapeHtml(product.batch_no || product.batch || '-');
          const qty = Number(product.qty || product.quantity || 0);
          const mrp = Number(product.mrp || 0);
          const rate = Number(product.rate || 0);
          const discount1 = Number(product.dis1 || product.discount_1_percent || 0);
          const discount2 = Number(product.dis2 || product.discount_2_percent || 0);
          const tax = Number(product.gstTotal ?? product.gst_percent ?? 0);
          const amount = Number(product.amount || 0);
          const total = Number(product.final_amt || product.final_amount || 0);
          const free = Number(product.free || product.free_qty || 0);
          const isGold = Boolean(product.is_gold || product.isGold);
          const cardClass = isGold ? 'product-card gold' : 'product-card';
          const badgeClass = isGold ? 'product-card-badge gold' : 'product-card-badge';
          return `
            <div class="${cardClass}" data-estimate-index="${index}">
              <div class="product-card-index">${index + 1}</div>
              <div class="product-card-main">
                <div class="product-card-name">
                  ${name}
                  <span class="${badgeClass}">${isGold ? '🔶 GOLD' : '⚪ NON-GOLD'}</span>
                  <span class="gst-reverse-badge ${product.gst_reverse ? 'active' : ''}" data-estimate-reverse="${index}" role="button" tabindex="0" title="Toggle GST Reverse">↩️ GST Reverse ${product.gst_reverse ? 'ON' : 'OFF'}</span>
                </div>
                <div class="product-card-details">
                  ${this.renderEstimateProductField(index, 'batch', 'Batch', batch)}
                  ${this.renderEstimateProductField(index, 'pack', 'Pack', pack)}
                  ${this.renderEstimateProductField(index, 'qty', 'Qty', String(qty))}
                  ${this.renderEstimateProductField(index, 'scheme', 'Free / Scheme', product.scheme || String(free))}
                  ${this.renderEstimateProductField(index, 'mrp', 'MRP', `₹${mrp.toFixed(2)}`)}
                  ${this.renderEstimateProductField(index, 'rate', 'Rate', `₹${rate.toFixed(2)}`)}
                  ${this.renderEstimateProductField(index, 'amount', 'Amount', `₹${amount.toFixed(2)}`, false)}
                  ${this.renderEstimateProductField(index, 'disc1', 'D1%', `${discount1.toFixed(1)}%`)}
                  ${this.renderEstimateProductField(index, 'disc2', 'D2%', `${discount2.toFixed(1)}%`)}
                  ${this.renderEstimateProductField(index, 'gstTotal', 'Tax%', `${tax.toFixed(1)}%`)}
                  ${this.renderEstimateProductField(index, 'total', 'Final', `₹${total.toFixed(2)}`, false)}
                </div>
              </div>
              <div class="product-card-actions">
                <button type="button" class="btn-delete btn-del-prod" data-idx="${index}" aria-label="Remove ${name}">Delete</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    listTable.onclick = event => {
      const deleteButton = event.target.closest('.btn-del-prod');
      if (deleteButton) {
        const index = Number(deleteButton.dataset.idx);
        this.currentEstimateProducts.splice(index, 1);
        this.isEstimateDirty = true;
        this.renderProductList();
        this.updateEstimateSummary();
        return;
      }
      const reverseButton = event.target.closest('[data-estimate-reverse]');
      if (reverseButton) {
        const index = Number(reverseButton.dataset.estimateReverse);
        const product = this.currentEstimateProducts[index];
        if (!product) return;
        const updatedProduct = { ...product, gst_reverse: !product.gst_reverse };
        try {
          this.recalculateEstimateProduct(updatedProduct);
        } catch (error) {
          log.error('Unable to recalculate estimate product:', error);
          this.showNotification(error.message || 'Unable to recalculate this product.', 'error');
          return;
        }
        this.currentEstimateProducts[index] = updatedProduct;
        this.isEstimateDirty = true;
        this.renderProductList();
        this.updateEstimateSummary();
        return;
      }
      const field = event.target.closest('.product-detail-item[data-editable="true"]');
      if (field) this.editEstimateProductField(field);
    };
    listTable.onkeydown = event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-estimate-reverse]')) {
        event.preventDefault();
        event.target.click();
      } else if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('.product-detail-item[data-editable="true"]')) {
        event.preventDefault();
        this.editEstimateProductField(event.target.closest('.product-detail-item[data-editable="true"]'));
      }
    };
  }

  renderEstimateProductField(index, field, label, value, editable = true) {
    return `
      <div class="product-detail-item" data-field="${field}" data-estimate-index="${index}" ${editable ? 'data-editable="true" role="button" tabindex="0" style="cursor:pointer;"' : ''}>
        <div class="product-detail-label">${label}</div>
        <div class="product-detail-value">${this.escapeHtml(value)}</div>
      </div>
    `;
  }

  editEstimateProductField(field) {
    const index = Number(field.dataset.estimateIndex);
    const product = this.currentEstimateProducts[index];
    const fieldName = field.dataset.field;
    const valueElement = field.querySelector('.product-detail-value');
    if (!product || !valueElement || field.dataset.editing === 'true') return;

    const numericFields = ['qty', 'mrp', 'rate', 'disc1', 'disc2', 'gstTotal'];
    const input = document.createElement('input');
    input.type = numericFields.includes(fieldName) ? 'number' : 'text';
    input.className = 'edit-input';
    const fieldValues = {
      qty: product.qty ?? product.quantity ?? 1,
      batch: product.batch_no ?? product.batch ?? '',
      pack: product.pack ?? product.pack_value ?? '',
      scheme: product.scheme ?? String(product.free ?? product.free_qty ?? ''),
      disc1: product.dis1 ?? product.discount_1_percent ?? 0,
      disc2: product.dis2 ?? product.discount_2_percent ?? 0,
      gstTotal: product.gstTotal ?? product.gst_percent ?? 0
    };
    input.value = String(fieldValues[fieldName] ?? product[fieldName] ?? '');
    if (input.type === 'number') {
      input.step = fieldName === 'qty' ? '1' : '0.01';
      input.min = fieldName === 'qty' ? '1' : '0';
    }

    field.dataset.editing = 'true';
    valueElement.replaceChildren(input);
    input.focus();
    input.select();
    let saved = false;
    const save = () => {
      if (saved) return;
      saved = true;
      let value = input.value.trim();
      if (numericFields.includes(fieldName)) {
        const numericValue = Number(value);
        if (!value || !Number.isFinite(numericValue) || numericValue < 0 || (fieldName === 'qty' && numericValue < 1)) {
          this.showNotification('Enter a valid value for this product field.', 'error');
          this.renderProductList();
          return;
        }
        value = fieldName === 'qty' ? Math.trunc(numericValue) : numericValue;
      }
      const updatedProduct = { ...product };
      if (fieldName === 'scheme') updatedProduct.scheme = value;
      else if (fieldName === 'batch') {
        updatedProduct.batch_no = value;
        updatedProduct.batch = value;
      } else if (fieldName === 'pack') {
        updatedProduct.pack = value;
      } else if (fieldName === 'disc1') {
        updatedProduct.dis1 = value;
        updatedProduct.discount_1_percent = value;
      } else if (fieldName === 'disc2') {
        updatedProduct.dis2 = value;
        updatedProduct.discount_2_percent = value;
      } else if (fieldName === 'gstTotal') {
        updatedProduct.gstTotal = value;
        updatedProduct.gst_percent = value;
      } else updatedProduct[fieldName] = value;
      try {
        this.recalculateEstimateProduct(updatedProduct);
      } catch (error) {
        log.error('Unable to recalculate estimate product:', error);
        this.showNotification(error.message || 'Unable to recalculate this product.', 'error');
        this.renderProductList();
        return;
      }
      this.currentEstimateProducts[index] = updatedProduct;
      this.isEstimateDirty = true;
      this.renderProductList();
      this.updateEstimateSummary();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      } else if (event.key === 'Escape') {
        saved = true;
        this.renderProductList();
      }
    });
  }

  recalculateEstimateProduct(product) {
    const calculator = window.BillCalculator;
    if (!calculator?.calculateLineItem) {
      throw new Error('Bill calculation engine is unavailable.');
    }
    const line = calculator.calculateLineItem({
      rate: product.rate,
      mrp: product.mrp,
      qty: product.qty || product.quantity,
      disc1: product.dis1 ?? product.discount_1_percent ?? 0,
      discount_1_percent: product.dis1 ?? product.discount_1_percent ?? 0,
      disc2: product.dis2 ?? product.discount_2_percent ?? 0,
      discount_2_percent: product.dis2 ?? product.discount_2_percent ?? 0,
      gstTotal: product.gstTotal ?? product.gst_percent ?? 0,
      scheme: product.scheme || '',
      gst_reverse: Boolean(product.gst_reverse)
    });
    product.amount = line.amount;
    product.discount_amount = line.discount_1_amount + line.discount_2_amount;
    product.dis1 = line.discount_1_percent;
    product.dis2 = line.discount_2_percent;
    product.discount_1_percent = line.discount_1_percent;
    product.discount_2_percent = line.discount_2_percent;
    product.sgst_val = line.sgst_amount;
    product.cgst_val = line.cgst_amount;
    product.sgst_per = line.gst_percent / 2;
    product.cgst_per = line.gst_percent / 2;
    product.gstTotal = line.gst_percent;
    product.gst_percent = line.gst_percent;
    product.free = calculator.calculateFreeItems(product.qty || product.quantity, product.scheme || '');
    product.final_amt = line.final_amount;
    product.final_amount = line.final_amount;
  }

  updateEstimateSummary() {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalSGST = 0;
    let totalCGST = 0;
    let totalQty = 0;

    for (const p of this.currentEstimateProducts) {
      subtotal += Number(p.amount) || 0;
      totalDiscount += Number(p.discount_amount) || 0;
      totalSGST += Number(p.sgst_val) || 0;
      totalCGST += Number(p.cgst_val) || 0;
      totalQty += Number(p.qty || p.quantity) || 0;
    }

    const unroundedGrand = subtotal - totalDiscount + totalSGST + totalCGST;
    const roundedGrand = Math.round(unroundedGrand);
    const roundOff = roundedGrand - unroundedGrand;

    const container = this.viewContainer;
    const setTxt = (id, val) => {
      const el = container.querySelector(id);
      if (el) el.textContent = val;
    };

    setTxt('#estHeaderTotal', `₹${roundedGrand.toFixed(2)}`);
    setTxt('#estHeaderItems', String(this.currentEstimateProducts.length));
    setTxt('#estSummaryCount', String(this.currentEstimateProducts.length));
    setTxt('#estSummaryQty', String(totalQty));
    setTxt('#estSummarySubtotal', `₹${subtotal.toFixed(2)}`);
    setTxt('#estSummaryDiscount', `₹${totalDiscount.toFixed(2)}`);
    setTxt('#estSummarySGST', `₹${totalSGST.toFixed(2)}`);
    setTxt('#estSummaryCGST', `₹${totalCGST.toFixed(2)}`);
    setTxt('#estSummaryRounding', `${roundOff >= 0 ? '+' : ''}${roundOff.toFixed(2)}`);
    setTxt('#estSummaryGrandTotal', `₹${roundedGrand.toFixed(2)}`);

    this.calculatedSummary = {
      total_amount: subtotal,
      total_discount: totalDiscount,
      total_sgst: totalSGST,
      total_cgst: totalCGST,
      round_off: roundOff,
      grand_total: roundedGrand
    };
  }

  getEstimatePayload() {
    const container = this.viewContainer;
    const estimateDate = container.querySelector('#estDate')?.value || this.formatDate(new Date());
    const validUntil = container.querySelector('#estValidUntil')?.value || null;
    const subject = container.querySelector('#estSubject')?.value.trim() || '';
    const duplexPrint = !!container.querySelector('#estDuplexPrint')?.checked;

    let party_name = '';
    let phone = '';
    let gstin = '';
    let address = '';
    let licence_no = '';
    let pan = '';
    let customer_id = null;

    if (this.customerType === 'registered') {
      party_name = container.querySelector('#estCustomerName')?.value.trim() || '';
      if (!this.selectedCustomerId) {
        throw new Error('Select a registered customer from the list.');
      }
      const customer = this.selectedCustomer || this.customerSnapshot || {};
      phone = customer.phone || customer.mobile || '';
      gstin = customer.gstin || '';
      address = [customer.address, customer.city, customer.state].filter(Boolean).join(', ');
      licence_no = customer.licence_no || customer.dl_no || '';
      pan = customer.pan || '';
      customer_id = this.selectedCustomerId;
    } else {
      party_name = container.querySelector('#estUnregName')?.value.trim() || '';
      phone = container.querySelector('#estUnregPhone')?.value.trim() || '';
      gstin = container.querySelector('#estUnregGstin')?.value.trim() || '';
      address = container.querySelector('#estUnregAddress')?.value.trim() || '';
      customer_id = null;
    }

    if (!party_name) {
      throw new Error('Customer name is required.');
    }

    if (this.currentEstimateProducts.length === 0) {
      throw new Error('Please add at least one product to the estimate.');
    }

    const summary = this.calculatedSummary || {
      total_amount: 0,
      total_discount: 0,
      total_sgst: 0,
      total_cgst: 0,
      round_off: 0,
      grand_total: 0
    };

    return {
      estimate_date: estimateDate,
      valid_until: validUntil,
      subject: subject,
      duplex_print: duplexPrint,
      customer_id: customer_id,
      party_name: party_name,
      phone: phone,
      gstin: gstin,
      address: address,
      licence_no: licence_no,
      pan: pan,
      products: this.currentEstimateProducts,
      total_amount: summary.total_amount,
      total_discount: summary.total_discount,
      total_sgst: summary.total_sgst,
      total_cgst: summary.total_cgst,
      round_off: summary.round_off,
      grand_total: summary.grand_total,
      terms: [
        'Prices and product availability are subject to change after the validity date.',
        'Goods supplied against an approved purchase order are subject to the terms of sale.',
        'Subject to local jurisdiction only.'
      ]
    };
  }

  async previewEstimate(savedEstimate = null) {
    try {
      const payload = savedEstimate || this.getEstimatePayload();
      let ledgerView = this.billingApp?._subviewInstances?.get('ledger');
      if (!ledgerView && window.currentLedgerView?.billingApp === this.billingApp) {
        ledgerView = window.currentLedgerView;
      }
      if (ledgerView) {
        await ledgerView.viewDocument('estimate', payload);
      } else if (typeof window.LedgerView === 'function' && typeof window.LedgerView.previewEstimate === 'function') {
        await window.LedgerView.previewEstimate(this.billingApp, payload);
      } else {
        throw new Error('Ledger PDF viewer is unavailable');
      }
    } catch (e) {
      log.error('Preview estimate failed:', e);
      this.showNotification(e.message, 'error');
    }
  }

  async exportEstimate(savedEstimate = null) {
    try {
      const payload = savedEstimate || this.getEstimatePayload();

      const resp = await fetch('/api/billing/export-estimate-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(err.error || 'Failed to export estimate PDF');
      }

      const result = await resp.json();
      if (!result.pdf) throw new Error('No PDF data returned');

      // Trigger browser download via base64 data URI
      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${result.pdf}`;
      link.download = result.fileName || `${payload.estimate_no}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      this.showNotification(`Downloaded ${result.fileName || payload.estimate_no}.`, 'success');
    } catch (e) {
      log.error('Export estimate failed:', e);
      this.showNotification(e.message, 'error');
    }
  }

  async convertToBill(savedEstimate = null) {
    try {
      const payload = savedEstimate || this.getEstimatePayload();
      const estimate = await this.persistEstimate(payload, savedEstimate?.id || this.editingEstimateId);
      const productsToTransfer = JSON.parse(JSON.stringify(estimate.products || payload.products));
      const partyName = estimate.party_name || payload.party_name;

      if (!this.billingApp) throw new Error('Billing app is unavailable.');
      this.billingApp.switchView('create');
      const billEditor = this.billingApp.billEditor;
      if (!billEditor) throw new Error('New Bill view is unavailable.');

      const customerInput = document.getElementById('customerName');
      if (!customerInput) throw new Error('New Bill customer field is unavailable.');
      customerInput.value = partyName;
      customerInput.dispatchEvent(new Event('input', { bubbles: true }));
      customerInput.dispatchEvent(new Event('change', { bubbles: true }));

      billEditor.currentBillProducts = productsToTransfer;
      billEditor.renderProductList?.();
      billEditor.updateBillSummary?.();
      this.showNotification(`Estimate ${estimate.estimate_no} loaded into New Bill.`, 'success');
    } catch (e) {
      log.error('Convert to bill failed:', e);
      this.showNotification(`Conversion failed: ${e.message}`, 'error');
    }
  }

  async convertToOrder(savedEstimate = null) {
    try {
      const payload = savedEstimate || this.getEstimatePayload();
      if (!payload.customer_id) {
        this.showNotification('Register or link this customer before creating an order.', 'error');
        return;
      }

      const estimate = await this.persistEstimate(payload, savedEstimate?.id || this.editingEstimateId);
      const items = (estimate.products || payload.products).map(product => ({
        product_id: product.product_id || product.id || null,
        variant_id: product.variant_id || null,
        batch_id: product.batch_id || null,
        quantity: Number(product.qty || product.quantity || 1),
        unit_price: Number(product.rate || product.unit_price || product.mrp || 0)
      }));
      const orderTotal = items.reduce((total, item) => total + item.quantity * item.unit_price, 0);
      const order = await this.billingApp.api.createOrder({
        customer_id: estimate.customer_id,
        order_date: estimate.estimate_date,
        order_notes: `Created from estimate ${estimate.estimate_no}`,
        total_amount: orderTotal,
        items
      });

      this.showNotification(`Created order ${order.order_number || ''} from ${estimate.estimate_no}.`, 'success');
      this.billingApp.switchView('orders');
    } catch (error) {
      log.error('Create order from estimate failed:', error);
      this.showNotification(error.message || 'Unable to create order.', 'error');
    }
  }
}

// Export to global scope
if (typeof window !== 'undefined') {
  window.EstimateEditor = EstimateEditor;
}

export default EstimateEditor;
