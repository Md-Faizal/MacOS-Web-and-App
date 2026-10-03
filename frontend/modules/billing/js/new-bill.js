const log = (typeof window !== 'undefined' && window.MacOSLogger) ? window.MacOSLogger.createScope('Billing:NewBill') : { debug: () => {}, info: () => {}, warn: console.warn.bind(console), error: console.error.bind(console) };

/**
 * BillEditor Class
 * Handles NEW bill/invoice creation only
 * 
 * Uses BillCalculator for consistent calculation logic across all billing pages.
 * 
 * Methods focused on bill CREATION lifecycle:
 * - renderCreateBillView() - Main form for creating bills
 * - setupCreateBillListeners() - Wire up form event handlers
 * - populateContactsList() - Load customers into datalist
 * - populateProductsList() - Load products into datalist
 * - autoFillProductDetails() - Auto-fill MRP, pack, batch on product select
 * - fillProductFormFields() - Helper to fill product form
 * - showVariantSelector() - Show variant selection UI
 * - autoFillVariantDetails() - Fill variant-specific fields
 * - initializeClearButtons() - Add ✕ buttons to input fields
 * - addProductToBill() - Add product to current bill
 * - clearProductForm() - Reset product form fields
 * - renderProductList() - Display products in bill
 * - setupProductListListeners() - Handle product edit/delete
 * - editProductField() - Inline edit of product in bill
 * - deleteProductFromBill() - Remove product from bill
 * - calculateProductDetails() - Uses BillCalculator.calculateLineItem()
 * - calculateFreeItems() - Parse scheme (e.g., 5+1)
 * - calculateProductTotal() - Total per product
 * - updateBillSummary() - Uses BillCalculator.calculateBillSummary()
 * - makeBill() - Save created bill to database
 * - clearBillForm() - Reset entire bill form
 * - saveProductMemory() - Save customer product preferences to API
 * - saveProductMemoryToAPI() - POST preferences to API
 * - loadProductMemoryForCustomer() - Load saved preferences from API
 * - loadProductMemoryFromAPI() - Fetch preferences from API
 * - setDefaultPreferenceValues() - Apply default values if not found
 * - recalculateProductFields() - Recalc on field change
 * - handleProductDatabaseUpdate() - Ask user about permanent DB updates
 * - checkAndHandleBatchUpdate() - Check if batch exists
 * - createNewBatchInDatabase() - Create new batch in product DB
 * - updateProductDatabase() - Update product DB fields
 * 
 * NOTE: This class uses BillCalculator (shared/bill-calculator.js) for:
 * - Line item calculations (amount, discounts, taxes)
 * - Bill summary calculations (totals, rounding)
 * - Format conversions (frontend to database)
 * 
 * NOTE: Edit, View, Delete, and Export operations are handled in:
 * - edit-bills-payments.js for editing existing bills
 * - ledger.js for viewing, deleting, and exporting records
 */

/**
 * BillEditor Class
 * Handles NEW bill/invoice creation only
 */

class BillEditor {
  constructor(billingApp) {
    this.billingApp = billingApp;
    this.currentBillProducts = [];
    this.editBillProducts = [];
    this.currentProduct = null;
    this.currentEditProduct = null;
    this.editingBillId = null;  // Track if we're editing an existing bill
    this.billDataToEdit = null;  // Store the bill data being edited
    this.isSelectingVariant = false;  // Flag to prevent variant modal re-open glitch
    this.isVariantModalOpen = false;  // Flag to check if variant modal is currently visible
    this.autoFillDebounceTimer = null;  // Debounce timer for autoFillProductDetails
    this.allContacts = []; // Store full contact objects for ID lookup
    this.orderCheckDebounceTimer = null; // Debounce timer for checkCustomerOrders
    this.selectedIndex = -1; // Index for dropdown keyboard navigation
    this.isDropdownOpen = false; // Track dropdown state
    this.cachedProducts = []; // Local cache for instant Rust WASM fuzzy product search
  }

  // Proxy properties to billingApp for convenience
  get viewContainer() {
    return this.billingApp.viewContainer;
  }

  get billingData() {
    return this.billingApp.billingData;
  }

  get api() {
    return this.billingApp.api;
  }

  get apiEnabled() {
    return this.billingApp.apiEnabled;
  }

  switchView(view) {
    this.billingApp.switchView(view);
  }

  /**
   * Format a date for <input type="date"> (YYYY-MM-DD)
   * Ensures local time is used to avoid UTC shifts
   */
  formatDateForInput(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Format a date for <input type="datetime-local"> (YYYY-MM-DDTHH:mm)
   * Ensures local time is used to avoid UTC shifts
   */
  formatDateTimeForInput(dateInput) {
    if (!dateInput) return '';
    
    let date;
    if (dateInput instanceof Date) {
      date = dateInput;
    } else if (typeof dateInput === 'string') {
      const str = dateInput.trim();
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str)) {
        return str.slice(0, 16);
      }
      // Match DD-MM-YYYY or DD/MM/YYYY with optional time
      const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
      if (dmy) {
        const day = parseInt(dmy[1], 10);
        const month = parseInt(dmy[2], 10) - 1;
        const year = parseInt(dmy[3], 10);
        const hours = dmy[4] ? parseInt(dmy[4], 10) : 12;
        const mins = dmy[5] ? parseInt(dmy[5], 10) : 0;
        date = new Date(year, month, day, hours, mins);
      } else {
        // Match YYYY-MM-DD or SQLite YYYY-MM-DD HH:mm:ss
        const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
        if (ymd) {
          const year = parseInt(ymd[1], 10);
          const month = parseInt(ymd[2], 10) - 1;
          const day = parseInt(ymd[3], 10);
          const hours = ymd[4] ? parseInt(ymd[4], 10) : 12;
          const mins = ymd[5] ? parseInt(ymd[5], 10) : 0;
          date = new Date(year, month, day, hours, mins);
        } else {
          date = new Date(str);
        }
      }
    } else {
      date = new Date(dateInput);
    }

    if (!date || isNaN(date.getTime())) return '';
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }


  renderCreateBillView(billDataToEdit = null) {
    // If editing, store the bill data and ID
    if (billDataToEdit) {
      this.editingBillId = billDataToEdit.id || billDataToEdit.bill_id;
      this.billDataToEdit = billDataToEdit;
      this.currentBillProducts = JSON.parse(JSON.stringify(billDataToEdit.products || []));
      log.debug('📋 Edit mode - Bill data received:', {
        id: this.editingBillId,
        customer: billDataToEdit.customer_name,
        productsCount: this.currentBillProducts.length,
        products: this.currentBillProducts
      });
    } else {
      this.editingBillId = null;
      this.billDataToEdit = null;
      this.currentBillProducts = [];
    }

    const isEditMode = !!(billDataToEdit && (billDataToEdit.id || billDataToEdit.bill_id || billDataToEdit.invoice_id));
    const sectionTitle = isEditMode ? '1. Edit Bill Information' : '1. Bill Information';
    const buttonText = isEditMode ? '✓ Update Bill' : '✓ Make Bill';
    const buttonId = 'makeBillBtn';

    this.viewContainer.innerHTML = `
      <div class="bill-form-wrapper">
        <!-- PROFESSIONAL HEADER -->
        <div class="bill-header">
          <div class="bill-header-left">
            <div class="bill-header-icon">📋</div>
            <div>
              <h1 class="bill-header-title">${sectionTitle}</h1>
              <div class="bill-header-subtitle">Professional Billing System</div>
            </div>
          </div>
          <div class="bill-header-stats">
            <div class="bill-header-stat">
              <span class="bill-header-stat-label">Grand Total</span>
              <span class="bill-header-stat-value" id="headerTotal">₹0.00</span>
            </div>
            <div class="bill-header-stat">
              <span class="bill-header-stat-label">Items</span>
              <span class="bill-header-stat-value" id="headerItems">0</span>
            </div>
          </div>
        </div>

        <!-- 2-COLUMN CONTENT -->
        <div class="bill-content-wrapper">
          <!-- LEFT PANEL: FORM + PRODUCTS -->
          <div class="bill-form-panel">
            <!-- 1. Bill Information -->
            <div class="bill-form-section">
              <h3 class="bill-section-title">Customer & Bill</h3>
              <div class="form-row">
                <div class="form-group">
                  <label>Bill Date & Time</label>
                  <input type="datetime-local" id="billDateTime" class="form-input">
                </div>
                <div class="form-group">
                  <label>Customer Name</label>
                  <input type="text" id="customerName" list="contactsList" class="form-input" placeholder="Enter customer name">
                  <datalist id="contactsList"></datalist>
                  <div id="customerOrdersContainer" style="display: none; margin-top: 5px;"></div>
                </div>
              </div>
            </div>

            <!-- 2. Product Input Section -->
            <div class="bill-form-section">
              <h3 class="bill-section-title">Add Product</h3>
              <div id="productGoldIndicator" style="display: none; padding: 8px; background: #e6f4ea; border-radius: 4px; font-weight: 600; font-size: 11px; color: #34a853; border: 1px solid #d4edda;"></div>
              
              <div class="form-row">
                <div class="form-group product-search-group">
                  <label>Product Name</label>
                  <input type="text" id="productName" class="form-input" placeholder="Start typing to search..." autocomplete="off">
                  <div id="searchDropdown" class="search-dropdown-container" style="display: none;"></div>
                </div>
                
                <div class="form-group">
                  <label>Pack Size</label>
                  <div class="pack-input-wrapper">
                    <input type="text" id="productPack" class="form-input" placeholder="e.g., 500">
                    <select id="productPackUnit" class="form-input pack-unit-select">
                      <option value="">Unit</option>
                      <option value="GM">GM</option>
                      <option value="ML">ML</option>
                      <option value="TAB">TAB</option>
                      <option value="GENERIC">Generic</option>
                    </select>
                  </div>
                </div>
                
                <div class="form-group">
                  <label>Batch No</label>
                  <input type="text" id="productBatch" class="form-input" placeholder="Batch #">
                </div>
                
                <div class="form-group">
                  <label>MRP</label>
                  <input type="number" id="productMRP" class="form-input" placeholder="0.00" step="0.01">
                </div>
                
                <div class="form-group">
                  <label>Quantity</label>
                  <input type="number" id="productQty" class="form-input" placeholder="1" step="1">
                </div>
                
                <div class="form-group">
                  <label>Discount 1 (%)</label>
                  <input type="number" id="productDisc1" class="form-input" placeholder="0" step="0.01">
                </div>
                
                <div class="form-group">
                  <label>Discount 2 (%)</label>
                  <input type="number" id="productDisc2" class="form-input" placeholder="0" step="0.01">
                </div>
                
                <div class="form-group">
                  <label>Scheme</label>
                  <select id="productScheme" class="form-input">
                    <option value="">No Scheme</option>
                    <option value="5+1">5+1 Free</option>
                    <option value="10+1">10+1 Free</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>

                <div class="form-group" id="customSchemeContainer" style="display: none;">
                  <label>Custom Scheme</label>
                  <input type="text" id="customSchemeValue" class="form-input" placeholder="e.g., 3+1">
                </div>
                
                <div class="form-group">
                  <label>Tax (%)</label>
                  <select id="productTax" class="form-input">
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="12">12%</option>
                    <option value="18">18%</option>
                  </select>
                </div>

                <button type="button" id="gstReverseBtn" class="gst-reverse-btn">↩️ GST Reverse</button>
                <input type="hidden" id="gstReverseCheckbox" value="false">
              </div>

              <div class="form-actions">
                <button id="addProductBtn" class="btn btn-primary">+ Add Product</button>
              </div>
            </div>

            <!-- 3. PRODUCTS LIST - BELOW FORM -->
            <div class="product-list-section" id="productListSection">
              <div class="product-list-header">
                <h3 class="product-list-title">
                  Products Added
                  <span class="product-count" id="productCountBadge">0</span>
                </h3>
              </div>
              <div class="product-list-wrapper" id="productListTable">
                <!-- Products render here -->
              </div>
            </div>
          </div>

          <!-- RIGHT PANEL: SUMMARY -->
          <div class="bill-summary-panel">
            <div class="bill-summary" id="summaryDiv">
              <h3 class="bill-summary-title">Summary</h3>
              
              <div class="summary-item">
                <span class="summary-item-label">Product Count</span>
                <span class="summary-item-value" id="summaryProductCount">0</span>
              </div>
              <div class="summary-item">
                <span class="summary-item-label">Total Quantity</span>
                <span class="summary-item-value" id="summaryTotalQty">0</span>
              </div>

              <div class="summary-divider"></div>

              <div class="summary-item">
                <span class="summary-item-label">Subtotal</span>
                <span class="summary-item-value" id="summarySubtotal">₹0.00</span>
              </div>
              <div class="summary-item">
                <span class="summary-item-label">Discount</span>
                <span class="summary-item-value" id="summaryDiscount">₹0.00</span>
              </div>
              <div class="summary-item">
                <span class="summary-item-label">SGST (Incl)</span>
                <span class="summary-item-value" id="summarySGST">₹0.00</span>
              </div>
              <div class="summary-item">
                <span class="summary-item-label">CGST (Incl)</span>
                <span class="summary-item-value" id="summaryCGST">₹0.00</span>
              </div>
              <div class="summary-item">
                <span class="summary-item-label">Taxable Amount</span>
                <span class="summary-item-value" id="summaryTaxable">₹0.00</span>
              </div>
              <div class="summary-item">
                <span class="summary-item-label">Grand Total (Unrounded)</span>
                <span class="summary-item-value" id="summaryGrandTotalUnrounded">₹0.00</span>
              </div>
              <div class="summary-item">
                <span class="summary-item-label">Rounding Off</span>
                <span class="summary-item-value" id="summaryRoundingOff">₹0.00</span>
              </div>

              <div class="summary-divider"></div>

              <div class="summary-total">
                <div class="summary-total-label">Grand Total</div>
                <div class="summary-total-value" id="summaryGrandTotal">₹0.00</div>
              </div>
            </div>

            <div class="bill-actions-section">
              <button id="makeBillBtn" class="bill-action-btn">${buttonText}</button>
              <button id="billListBtn" class="bill-action-btn secondary">View Bills</button>
              ${isEditMode ? '<button id="backToEditListBtn" class="bill-action-btn secondary">Back to List</button>' : '<button id="clearAllBtn" class="bill-action-btn secondary">Clear All</button>'}
            </div>
          </div>
        </div>
      </div>
    `;

    // Set bill date/time
    const billDateTime = document.getElementById('billDateTime');
    if (isEditMode && billDataToEdit) {
      // Editing: prefill with existing bill data (strictly prioritize invoice_date)
      const billDate = billDataToEdit.invoice_date || billDataToEdit.bill_date || billDataToEdit.created_at;
      
      if (billDateTime) {
        const formattedDate = this.formatDateTimeForInput(billDate);
        if (formattedDate) {
          billDateTime.value = formattedDate;
        } else {
          billDateTime.value = this.formatDateTimeForInput(new Date());
        }

        // Use setTimeout to ensure DOM is ready and any competing scripts cannot overwrite it
        setTimeout(() => {
          if (formattedDate && billDateTime.value !== formattedDate) {
            billDateTime.value = formattedDate;
          }
        }, 100);
      }
      
      const customerNameInput = document.getElementById('customerName');
      const customerNameValue = billDataToEdit.customer_name || billDataToEdit.customer || '';
      
      if (customerNameInput) {
        customerNameInput.value = customerNameValue;
        log.debug('✅ Customer name set in edit mode:', {
          customerName: customerNameValue,
          inputElement: customerNameInput.id,
          displayValue: customerNameInput.value
        });
      } else {
        log.warn('⚠️ customerName input element not found');
      }
    } else {
      // Creating new: use current date/time
      if (billDateTime) {
        billDateTime.value = this.formatDateTimeForInput(new Date());
      }
      this.currentBillProducts = [];

      // Pre-fill customer name if provided (deep link support)
      if (billDataToEdit && billDataToEdit.customer_name) {
        setTimeout(() => {
          const customerNameInput = document.getElementById('customerName');
          if (customerNameInput) {
            customerNameInput.value = billDataToEdit.customer_name;
            log.debug('✅ Customer name pre-filled from params:', billDataToEdit.customer_name);
          }
        }, 100);
      }
    }

    // Populate contacts and products lists
    this.populateContactsList();
    this.populateProductsList();

    // Setup event listeners
    this.setupCreateBillListeners();

    // In edit mode, log the customer name for debugging
    if (isEditMode && billDataToEdit) {
      log.debug('📦 Edit mode initialized - customer:', billDataToEdit.customer_name);
      log.debug('📦 Edit mode - products count:', this.currentBillProducts.length);
    }

    // Store reference to this module for global access (for modals, etc)
    window.currentBillEditor = this;

    // Initialize clear buttons
    this.initializeClearButtons();

    // Render product list
    setTimeout(() => {
      if (isEditMode && this.currentBillProducts.length > 0) {
        // Edit mode with existing products
        log.debug('📝 Rendering existing products for edit mode:', this.currentBillProducts.length);
        this.renderProductList();
        this.updateBillSummary();
      } else if (!isEditMode) {
        // New bill mode - show empty products message
        log.debug('📝 Showing empty products message for new bill mode');
        this.renderProductList();
      }
    }, 300);
  }

  initializeClearButtons() {
    // Add clear button functionality to inputs
    const inputIds = [
      'billDateTime', 'customerName', 'productName', 'productPack', 
      'productBatch', 'productQty', 'productDisc1', 'productDisc2', 
      'customSchemeValue', 'productMRP'
    ];

    inputIds.forEach(id => {
      const input = document.getElementById(id);
      if (input && !input.parentElement.classList.contains('input-clear-wrapper')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'input-clear-wrapper';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'clear-btn';
        clearBtn.onclick = (e) => {
          e.preventDefault();
          input.value = '';
          input.focus();
          // Dispatch input event so listeners are triggered immediately
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        wrapper.appendChild(clearBtn);
      }
    });
  }

  async populateContactsList() {
    const datalist = document.getElementById('contactsList');
    if (!datalist) return;
    datalist.innerHTML = '';

    const scoped = this.billingApp?.getScopedBillingData ? this.billingApp.getScopedBillingData() : null;
    if (scoped && scoped.contacts && scoped.contacts.length > 0) {
      this.allContacts = scoped.contacts;
      this.allContacts.forEach(customer => {
        if (customer && customer.name) {
          const option = document.createElement('option');
          option.value = customer.name;
          datalist.appendChild(option);
        }
      });
      return;
    }

    // Load from API
    if (this.apiEnabled) {
      try {
        const response = await fetch('/api/contacts');
        if (response.ok) {
          const result = await response.json();
          const normalizeCollection = payload => {
            if (Array.isArray(payload)) return payload;
            if (!payload) return [];
            if (Array.isArray(payload.items)) return payload.items;
            if (Array.isArray(payload.data)) return payload.data;
            if (Array.isArray(payload.data?.items)) return payload.data.items;
            return [];
          };
          const customers = normalizeCollection(result);
          this.allContacts = customers;
          
          if (this.allContacts.length > 0) {
            this.allContacts.forEach(customer => {
              if (customer && customer.name) {
                const option = document.createElement('option');
                option.value = customer.name;
                datalist.appendChild(option);
              }
            });
          }
        }
      } catch (error) {
        log.error('Error loading contacts:', error);
      }
    }
  }

  normalizeProducts(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload) return [];
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
    if (payload.data && Array.isArray(payload.data.data)) return payload.data.data;
    if (Array.isArray(payload.products)) return payload.products;
    return [];
  }

  async populateProductsList() {
    // Datalist is retired. Search is now real-time via custom dropdown.
  }

  setupCreateBillListeners() {
    const addBtn = document.getElementById('addProductBtn');
    const makeBtn = document.getElementById('makeBillBtn');
    const listBtn = document.getElementById('billListBtn');
    const clearBtn = document.getElementById('clearAllBtn');
    const backBtn = document.getElementById('backToEditListBtn');
    const schemeSelect = document.getElementById('productScheme');
    const customSchemeContainer = document.getElementById('customSchemeContainer');
    const productNameInput = document.getElementById('productName');
    const customerNameInput = document.getElementById('customerName');
    const gstReverseBtn = document.getElementById('gstReverseBtn');

    addBtn?.addEventListener('click', () => this.addProductToBill());
    makeBtn?.addEventListener('click', () => this.makeBill());
    listBtn?.addEventListener('click', () => this.switchView('existing'));
    clearBtn?.addEventListener('click', () => this.clearBillForm());
    
    backBtn?.addEventListener('click', () => {
      // Return to edit bills list view
      this.billingApp.editBillsPayments.renderEditBillListView();
    });

    // GST Reverse button toggle
    gstReverseBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      const gstCheckbox = document.getElementById('gstReverseCheckbox');
      if (gstCheckbox) {
        const currentState = gstCheckbox.value === 'true';
        const newState = !currentState;
        gstCheckbox.value = newState.toString();
        gstReverseBtn.classList.toggle('active');
      }
    });

    // Handle scheme custom input
    schemeSelect?.addEventListener('change', (e) => {
      if (e.target.value === 'custom') {
        customSchemeContainer.style.display = 'flex';
      } else {
        customSchemeContainer.style.display = 'none';
      }
    });

    // Handle customer name change
    customerNameInput?.addEventListener('input', () => this.checkCustomerOrders());
    customerNameInput?.addEventListener('change', () => {
      this.loadProductMemoryForCustomer();
      this.checkCustomerOrders();
    });
    customerNameInput?.addEventListener('blur', () => {
      this.loadProductMemoryForCustomer();
      this.checkCustomerOrders();
    });

    // --- REAL-TIME SEARCH DROPDOWN LISTENERS ---
    productNameInput?.addEventListener('input', (e) => {
      this.handleProductSearchInput(e.target.value);
    });

    productNameInput?.addEventListener('keydown', (e) => {
      this.handleProductSearchKeydown(e);
    });

    productNameInput?.addEventListener('blur', () => {
      // Small delay to allow clicking on dropdown results
      setTimeout(() => this.hideSearchDropdown(), 200);
    });

    productNameInput?.addEventListener('focus', (e) => {
      if (e.target.value.trim().length > 0) {
        this.handleProductSearchInput(e.target.value);
      }
    });
  }

  handleProductSearchInput(query) {
    if (this.autoFillDebounceTimer) clearTimeout(this.autoFillDebounceTimer);

    const trimmedQuery = (query || '').trim();

    if (!trimmedQuery || trimmedQuery.length < 1) {
      this.hideSearchDropdown();
      this.clearProductDetailsFields();
      return;
    }

    // Instant Client-Side Rust WASM Fuzzy Search (<0.2ms)
    if (this.cachedProducts && this.cachedProducts.length > 0 && typeof window !== 'undefined' && window.SuiteCoreBridge && window.SuiteCoreBridge.isWasmLoaded()) {
      try {
        const instantMatches = window.SuiteCoreBridge.searchCatalog(trimmedQuery, this.cachedProducts, { limit: 25, min_score: 25.0 });
        if (instantMatches && instantMatches.length > 0) {
          this.renderSearchDropdown(instantMatches);
        }
      } catch (err) {
        log.warn('[NewBill] WASM instant search fallback:', err);
      }
    }

    this.autoFillDebounceTimer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/products?search=${encodeURIComponent(trimmedQuery)}`);
        if (response.ok) {
          const result = await response.json();
          const products = this.normalizeProducts(result);
          this.renderSearchDropdown(products);

          // Populate cache in background if empty
          if (!this.cachedProducts || this.cachedProducts.length === 0) {
            this.preloadProductsCatalog();
          }
        }
      } catch (error) {
        log.error('Error fetching real-time products:', error);
      }
    }, 200);
  }

  async preloadProductsCatalog() {
    if (this.cachedProducts && this.cachedProducts.length > 0) return;
    try {
      const response = await fetch('/api/products');
      if (response.ok) {
        const result = await response.json();
        this.cachedProducts = this.normalizeProducts(result);
      }
    } catch (_) {}
  }

  calculateProductPriceRange(product) {
    let min = Infinity;
    let max = -Infinity;
    let found = false;

    if (product.variants && Array.isArray(product.variants)) {
      product.variants.forEach(variant => {
        if (variant.batches && Array.isArray(variant.batches)) {
          variant.batches.forEach(batch => {
            const mrp = parseFloat(batch.mrp || 0);
            if (mrp > 0) {
              if (mrp < min) min = mrp;
              if (mrp > max) max = mrp;
              found = true;
            }
          });
        }
      });
    }

    if (!found) {
      // Fallback to top-level MRP if no batches found
      const fallbackMrp = parseFloat(product.mrp || 0);
      return `₹${fallbackMrp.toFixed(2)}`;
    }

    if (min === max) {
      return `₹${min.toFixed(2)}`;
    }

    return `₹${min.toFixed(2)} - ₹${max.toFixed(2)}`;
  }

  renderSearchDropdown(products) {
    const dropdown = document.getElementById('searchDropdown');
    if (!dropdown) return;

    if (!Array.isArray(products) || products.length === 0) {
      dropdown.innerHTML = '<div class="search-dropdown-empty">No products found</div>';
      dropdown.style.display = 'block';
      this.isDropdownOpen = true;
      this.selectedIndex = -1;
      return;
    }

    this.isDropdownOpen = true;
    this.selectedIndex = -1;
    this.dropdownProducts = products;

    dropdown.innerHTML = products.map((product, idx) => {
      const variantCount = (product.variants && Array.isArray(product.variants)) ? product.variants.length : 0;
      const hasMultipleVariants = variantCount > 1;
      const priceDisplay = this.calculateProductPriceRange(product);
      
      return `
        <div class="dropdown-item" data-index="${idx}">
          <div class="item-main">
            <span class="item-name">${product.name}</span>
            <span class="item-meta">${product.category_name || ''}</span>
          </div>
          <div class="item-details">
            <span class="item-mrp">${priceDisplay}</span>
            ${hasMultipleVariants ? `<span class="item-variants-badge">${variantCount} Variants</span>` : `<span class="item-pack">${product.pack || ''}</span>`}
          </div>
        </div>
      `;
    }).join('');

    dropdown.style.display = 'block';

    // Add click listeners to items
    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        const index = parseInt(item.getAttribute('data-index'));
        this.selectProductFromDropdown(this.dropdownProducts[index]);
      });
    });
  }

  handleProductSearchKeydown(e) {
    if (!this.isDropdownOpen) return;

    const dropdown = document.getElementById('searchDropdown');
    const items = dropdown.querySelectorAll('.dropdown-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
      this.updateDropdownSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
      this.updateDropdownSelection(items);
    } else if (e.key === 'Enter') {
      if (this.selectedIndex >= 0 && this.dropdownProducts && this.dropdownProducts[this.selectedIndex]) {
        e.preventDefault();
        this.selectProductFromDropdown(this.dropdownProducts[this.selectedIndex]);
      } else if (this.dropdownProducts && this.dropdownProducts.length > 0) {
        e.preventDefault();
        const inputVal = (document.getElementById('productName')?.value || '').trim().toLowerCase();
        const exactMatch = this.dropdownProducts.find(p => (p.name || '').toLowerCase() === inputVal);
        this.selectProductFromDropdown(exactMatch || this.dropdownProducts[0]);
      }
    } else if (e.key === 'Escape') {
      this.hideSearchDropdown();
    }
  }

  updateDropdownSelection(items) {
    items.forEach((item, idx) => {
      if (idx === this.selectedIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  selectProductFromDropdown(product) {
    const productNameInput = document.getElementById('productName');
    if (productNameInput) {
      productNameInput.value = product.name;
    }
    this.currentProduct = product;
    this.fillProductFormFields(product);
    this.hideSearchDropdown();
  }

  hideSearchDropdown() {
    const dropdown = document.getElementById('searchDropdown');
    if (dropdown) {
      dropdown.style.display = 'none';
      this.isDropdownOpen = false;
      this.selectedIndex = -1;
    }
  }

  clearProductDetailsFields() {
    // Clear all product detail fields except product name
    const ids = ['productPack', 'productPackUnit', 'productBatch', 'productMRP', 'productQty', 'productDisc1', 'productDisc2', 'productScheme', 'customSchemeValue', 'productTax', 'gstReverseCheckbox'];
    ids.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.value = (id === 'productTax') ? '0' : (id === 'gstReverseCheckbox') ? 'false' : '';
      }
    });
    
    const gstReverseBtn = document.getElementById('gstReverseBtn');
    if (gstReverseBtn) {
      gstReverseBtn.classList.remove('active');
    }
    
    const customSchemeContainer = document.getElementById('customSchemeContainer');
    if (customSchemeContainer) {
      customSchemeContainer.style.display = 'none';
    }
    
    // Clear gold indicator
    this.updateFormGoldIndicator(null);
    
    this.currentProduct = null;
    log.debug('🧹 Product details cleared');
  }

  updateFormGoldIndicator(product) {
    const goldIndicator = document.getElementById('productGoldIndicator');
    if (!goldIndicator) return;

    if (!product) {
      goldIndicator.style.display = 'none';
      goldIndicator.textContent = '';
      return;
    }

    const isGold = (product.isGold === true || product.is_gold === true || product.is_gold === 1 || product.is_gold === '1') ||
                   (product.classification && String(product.classification).toLowerCase() === 'gold') ||
                   (product.category && String(product.category).toLowerCase() === 'gold');

    goldIndicator.textContent = isGold ? '🔶 GOLD' : '⚪ NON-GOLD';
    goldIndicator.style.display = 'block';
    if (isGold) {
      goldIndicator.style.background = '#fff8e6';
      goldIndicator.style.color = '#b45309';
      goldIndicator.style.borderColor = '#fde68a';
    } else {
      goldIndicator.style.background = '#f1f5f9';
      goldIndicator.style.color = '#475569';
      goldIndicator.style.borderColor = '#cbd5e1';
    }
  }

  fillProductFormFields(product) {
    // Show gold/non-gold indicator immediately
    this.updateFormGoldIndicator(product);

    // Check if product has MULTIPLE variants or SINGLE variant with MULTIPLE batches
    // If so, show variant/batch selector modal
    const variantCount = (product.variants && Array.isArray(product.variants)) ? product.variants.length : 0;
    const hasMultipleBatchesInSingleVariant = (variantCount === 1 && product.variants[0].batches && product.variants[0].batches.length > 1);

    if (variantCount > 1 || hasMultipleBatchesInSingleVariant) {
      if (this.isSelectingVariant) {
        log.debug(' Greenland skipping modal re-open');
        return;
      }
      log.debug('📦 Multiple options detected, showing selector modal:', {
        name: product.name,
        variantCount: variantCount,
        singleVariantBatches: hasMultipleBatchesInSingleVariant ? product.variants[0].batches.length : 0
      });
      this.showVariantSelector(product.variants, product.name);
      return;  // Don't fill form yet - wait for variant selection
    }

    // Fill in product details from API response
    // Handle separate pack_value and pack_type
    const packUnitSelect = document.getElementById('productPackUnit');
    
    // Mapping function to normalize pack types from API to database values (GM, ML, TAB, GENERIC)
    const normalizePackType = (packType) => {
      if (!packType) return '';
      
      const normalized = packType.trim().toUpperCase();
      
      // Map various API values to database values
      if (normalized.includes('GM') || normalized.includes('GRAM')) return 'GM';
      if (normalized.includes('ML') || normalized.includes('MILL')) return 'ML';
      if (normalized.includes('TAB') || normalized.includes('TABLET')) return 'TAB';
      if (normalized.includes('GENERIC') || normalized.includes('GEN')) return 'GENERIC';
      
      // If exact match found, return it (GM, ML, TAB, GENERIC)
      if (['GM', 'ML', 'TAB', 'GENERIC'].includes(normalized)) return normalized;
      
      return '';
    };
    
    if (product.pack_value) {
      document.getElementById('productPack').value = product.pack_value;
      if (product.pack_type) {
        // Normalize and set the pack_type value
        const packTypeNormalized = normalizePackType(product.pack_type);
        packUnitSelect.value = packTypeNormalized;
        
        // NEW: Also enrich currentProduct master info to avoid false positive change detection
        if (this.currentProduct) {
          this.currentProduct.pack_size_value = product.pack_value;
          this.currentProduct.pack_size_type = packTypeNormalized;
        }
      }
    } else if (product.pack) {
      // Fallback: if only combined pack exists, try to split it
      // This handles cases where pack comes as "16.0 TAB" or similar
      const packMatch = product.pack.match(/^([\d.]+)\s*(.*)$/);
      if (packMatch) {
        document.getElementById('productPack').value = packMatch[1];
        if (packMatch[2]) {
          // Normalize the parsed pack type
          const packTypeNormalized = normalizePackType(packMatch[2]);
          log.debug('🔍 Setting pack type from parsed pack:', {
            original: packMatch[2],
            normalized: packTypeNormalized
          });
          packUnitSelect.value = packTypeNormalized;
          
          // NEW: Also enrich currentProduct master info to avoid false positive change detection
          if (this.currentProduct) {
            this.currentProduct.pack_size_value = packMatch[1];
            this.currentProduct.pack_size_type = packTypeNormalized;
          }
        }
      } else {
        document.getElementById('productPack').value = product.pack;
      }
    }
    
    // Log the final pack type value
    log.debug('✅ Pack type set to:', packUnitSelect.value, 'Available options:', Array.from(packUnitSelect.options).map(o => o.value));

    if (product.batch_no) {
      document.getElementById('productBatch').value = product.batch_no;
    }
    if (product.mrp) {
      document.getElementById('productMRP').value = product.mrp;
    }

    // Set single variant / batch IDs on currentProduct if available
    if (variantCount === 1 && product.variants && product.variants[0]) {
      const v0 = product.variants[0];
      if (this.currentProduct) {
        this.currentProduct.variant_id = v0.id;
        if (v0.batches && v0.batches.length === 1) {
          this.currentProduct.batch_id = v0.batches[0].id;
        }
      }
    }

    // Load preferences for this customer + product
    const customerNameElement = document.getElementById('customerName');
    if (customerNameElement) {
      const customerName = customerNameElement.value.trim();
      if (customerName) {
        this.loadProductMemoryFromAPI(product.name, customerName);
      }
    }
  }

  showVariantSelector(variants, productName = '') {
    // Don't show if modal is already open
    if (this.isVariantModalOpen) {
      log.debug('🚫 Variant modal already open, skipping duplicate creation');
      return;
    }

    // Mark modal as open
    this.isVariantModalOpen = true;

    // Remove any existing variant modal
    let existingModal = document.getElementById('variantSelectorModal');
    if (existingModal) {
      existingModal.remove();
    }

    // Normalize variants - handle both array and object formats
    const normalizedVariants = variants.map((v, idx) => {
      // If variant is already an object with pack_size_value/pack_size_type, use as-is
      if (typeof v === 'object' && v !== null && (v.pack_size_value !== undefined || v.pack_size_type !== undefined || v.batches !== undefined)) {
        return v;
      }
      
      // If variant is an array-like structure, map to object
      // Expected structure: [id, product_id, pack_size_value, pack_size_type, ...]
      if (Array.isArray(v) && v.length >= 4) {
        return {
          id: v[0],
          product_id: v[1],
          pack_size_value: v[2],
          pack_size_type: v[3],
          batches: v.batches || []
        };
      }
      
      // Try to extract from object keys regardless of naming
      return {
        pack_size_value: v.pack_size_value || v['2'] || v.packValue,
        pack_size_type: v.pack_size_type || v['3'] || v.packType,
        batches: v.batches || []
      };
    });

    log.debug('📦 Normalized variants:', normalizedVariants.slice(0, 1));

    const modalHtml = `
      <div id="variantSelectorModal" class="variant-modal-overlay">
        <div class="variant-modal">
          <div class="variant-modal-header">
            <h3>📦 Select Product Variant</h3>
            <button class="variant-modal-close" id="variant-close-btn">×</button>
          </div>
          <div class="variant-modal-body">
            <div class="variant-list">
              ${normalizedVariants.map((v, idx) => `
                <div class="variant-group">
                  <div class="variant-pack-header">
                    <strong>${v.pack_size_value}${v.pack_size_type ? ' ' + v.pack_size_type : ''}:</strong>
                  </div>
                  ${v.batches && v.batches.length > 0 ? `
                    <div class="variant-batches-list">
                      ${v.batches.map((batch, batchIdx) => `
                        <div class="variant-batch-item">
                          <input type="radio" id="variant-${idx}-batch-${batchIdx}" name="variantOption" value="${idx}" data-batch-index="${batchIdx}" class="variant-radio" />
                          <label for="variant-${idx}-batch-${batchIdx}" class="variant-batch-label">
                            <span class="batch-no">${batch.batchNo || batch.batch_no}</span>
                            <span class="batch-mrp">₹${parseFloat(batch.mrp || 0).toFixed(2)}</span>
                          </label>
                        </div>
                      `).join('')}
                    </div>
                  ` : `
                    <div class="variant-no-batches">No batches available</div>
                  `}
                </div>
              `).join('')}
            </div>
          </div>
          <div class="variant-modal-footer">
            <button class="variant-modal-btn cancel" id="variant-cancel-btn">✗ Cancel</button>
            <button class="variant-modal-btn confirm" id="variant-confirm-btn">✓ Select</button>
          </div>
        </div>
      </div>
    `;

    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHtml;
    this.viewContainer.appendChild(modalDiv.firstElementChild);

    // Store variants for selection
    this.variantsToSelect = normalizedVariants;

    // Add event listeners with proper context
    const closeModal = () => {
      const modal = document.getElementById('variantSelectorModal');
      if (modal) modal.remove();
      this.isVariantModalOpen = false;  // Clear flag when modal closes
    };

    const closeBtn = document.getElementById('variant-close-btn');
    const cancelBtn = document.getElementById('variant-cancel-btn');
    const confirmBtn = document.getElementById('variant-confirm-btn');

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        this.selectVariant();
      });
    }

    // Close on overlay click
    const overlay = document.getElementById('variantSelectorModal');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
    }
  }

  selectVariant() {
    const selectedRadio = document.querySelector('input[name="variantOption"]:checked');
    if (selectedRadio) {
      const idx = parseInt(selectedRadio.value);
      const batchIdx = parseInt(selectedRadio.getAttribute('data-batch-index') || '0');
      
      if (idx >= 0 && idx < this.variantsToSelect.length) {
        // Set flag to prevent modal re-opening
        this.isSelectingVariant = true;
        try {
          const selectedVariant = this.variantsToSelect[idx];
          
          // CRITICAL: Store the selected variant ID in currentProduct
          if (this.currentProduct) {
            this.currentProduct.variant_id = selectedVariant.id || null;
            
            // NEW: Update master reference with selected batch/variant info
            // This ensures future comparisons and database updates use the correct baseline
            const selectedBatch = selectedVariant.batches && selectedVariant.batches[batchIdx] ? selectedVariant.batches[batchIdx] : null;
            if (selectedBatch) {
              this.currentProduct.batch_id = selectedBatch.id || null;
              this.currentProduct.mrp = selectedBatch.mrp;
              this.currentProduct.batch_no = selectedBatch.batch_no || selectedBatch.batchNo;
            }
            this.currentProduct.pack_size_value = selectedVariant.pack_size_value;
            this.currentProduct.pack_size_type = selectedVariant.pack_size_type;

            log.debug('✅ Updated master reference (currentProduct) for selected batch:', {
              batch_no: this.currentProduct.batch_no,
              mrp: this.currentProduct.mrp,
              variant_id: selectedVariant.id
            });
          }
          
          this.autoFillVariantDetails(selectedVariant, batchIdx);
          const modal = document.getElementById('variantSelectorModal');
          if (modal) modal.remove();
          this.isVariantModalOpen = false;  // Clear modal open flag
        } finally {
          // Clear flag after a brief moment to allow form fields to settle
          setTimeout(() => {
            this.isSelectingVariant = false;
          }, 100);
        }
      }
    } else {
      alert('Please select a variant');
    }
  }

  autoFillVariantDetails(variant, batchIdx = 0) {
    // Normalize pack type mapping function
    const normalizePackType = (packType) => {
      if (!packType) return '';
      
      const normalized = packType.trim().toUpperCase();
      
      // Map various API values to database values
      if (normalized.includes('GM') || normalized.includes('GRAM')) return 'GM';
      if (normalized.includes('ML') || normalized.includes('MILL')) return 'ML';
      if (normalized.includes('TAB') || normalized.includes('TABLET')) return 'TAB';
      if (normalized.includes('GENERIC') || normalized.includes('GEN')) return 'GENERIC';
      
      // If exact match found, return it (GM, ML, TAB, GENERIC)
      if (['GM', 'ML', 'TAB', 'GENERIC'].includes(normalized)) return normalized;
      
      return '';
    };

    // Extract pack values from variant (try multiple field names)
    const packValue = variant.pack_size_value || variant.pack_value || variant.pack || variant.packValue;
    const packType = variant.pack_size_type || variant.pack_type || variant.packType;
    
    if (packValue) {
      document.getElementById('productPack').value = packValue;
      if (packType) {
        const packTypeNormalized = normalizePackType(packType);
        document.getElementById('productPackUnit').value = packTypeNormalized;
      }
    }

    // Get specific batch based on selection
    if (variant.batches && variant.batches.length > batchIdx) {
      const batch = variant.batches[batchIdx];
      document.getElementById('productBatch').value = batch.batchNo || batch.batch_no || '';
      document.getElementById('productMRP').value = batch.mrp || '';
    } else if (variant.batches && variant.batches.length > 0) {
      // Fallback to first batch if idx not found
      const batch = variant.batches[0];
      document.getElementById('productBatch').value = batch.batchNo || batch.batch_no || '';
      document.getElementById('productMRP').value = batch.mrp || '';
    } else {
      document.getElementById('productBatch').value = '';
      document.getElementById('productMRP').value = '';
    }

    // Show gold indicator for current product if available
    this.updateFormGoldIndicator(this.currentProduct);

    // Load customer-product memory (disc1, disc2, scheme, tax)
    this.loadProductMemoryForCustomer();
  }



  saveProductMemory(productName, customerName, disc1, disc2, scheme, tax, gst_reverse) {
    if (!customerName.trim()) return; // Don't save if no customer
    this.saveProductMemoryToAPI(productName, customerName, disc1, disc2, scheme, tax, gst_reverse);
  }

  async saveProductMemoryToAPI(productName, customerName, disc1, disc2, scheme, tax, gst_reverse) {
    try {
      const response = await fetch('/api/billing/preference', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          customerName: customerName,
          productName: productName,
          disc1: disc1,
          disc2: disc2,
          scheme: scheme,
          tax: tax,
          gst_reverse: gst_reverse
        })
      });

      if (response.ok) {
        const result = await response.json();
      } else {

      }
    } catch (error) {

    }
  }

  loadProductMemoryForCustomer() {
    const productNameElement = document.getElementById('productName');
    const customerNameElement = document.getElementById('customerName');
    
    if (!productNameElement || !customerNameElement) return;
    
    const productName = productNameElement.value.trim();
    const customerName = customerNameElement.value.trim();

    if (!productName || !customerName) return;

    // Try to load from API first
    this.loadProductMemoryFromAPI(productName, customerName);
  }

  async loadProductMemoryFromAPI(productName, customerName) {
    try {
      const apiUrl = `/api/billing/preference/${encodeURIComponent(customerName)}/${encodeURIComponent(productName)}`;
      
      const response = await fetch(apiUrl);
      
      if (response.ok) {
        const result = await response.json();
        
        if (result.status === 'success' && result.data) {
          const memory = result.data;
          
          // Auto-fill with saved values ONLY if they exist
          if (memory.disc1 !== undefined && memory.disc1 !== null && memory.disc1 !== '') {
            document.getElementById('productDisc1').value = memory.disc1;
          }
          if (memory.disc2 !== undefined && memory.disc2 !== null && memory.disc2 !== '') {
            document.getElementById('productDisc2').value = memory.disc2;
          }
          if (memory.scheme !== undefined && memory.scheme !== null && memory.scheme !== '') {
            document.getElementById('productScheme').value = memory.scheme;
          }
          if (memory.tax !== undefined && memory.tax !== null && memory.tax !== '') {
            document.getElementById('productTax').value = memory.tax;
          }
          if (memory.gst_reverse !== undefined && memory.gst_reverse !== null) {
            const gstCheckbox = document.getElementById('gstReverseCheckbox');
            const gstBtn = document.getElementById('gstReverseBtn');
            if (gstCheckbox) {
              gstCheckbox.value = memory.gst_reverse ? 'true' : 'false';
              if (gstBtn) {
                if (memory.gst_reverse) gstBtn.classList.add('active');
                else gstBtn.classList.remove('active');
              }
            }
          }

          // Show custom scheme field if needed
          if (memory.scheme === 'custom') {
            document.getElementById('customSchemeContainer').style.display = 'flex';
          }
        }
      }
    } catch (error) {
      log.error('Error loading preferences from API:', error);
    }

    // If API call fails or returns no data, use defaults
    this.setDefaultPreferenceValues();
  }



  setDefaultPreferenceValues() {
    // Set default values when no preference is found
    const disc1Input = document.getElementById('productDisc1');
    const disc2Input = document.getElementById('productDisc2');
    const schemeSelect = document.getElementById('productScheme');
    const taxSelect = document.getElementById('productTax');
    
    if (disc1Input && disc1Input.value === '') disc1Input.value = '0';
    if (disc2Input && disc2Input.value === '') disc2Input.value = '0';
    if (schemeSelect && schemeSelect.value === '') schemeSelect.value = '';
    if (taxSelect && taxSelect.value === '') taxSelect.value = '0';
  }

  checkCustomerOrders() {
    if (this.orderCheckDebounceTimer) {
      clearTimeout(this.orderCheckDebounceTimer);
    }

    const customerNameInput = document.getElementById('customerName');
    const customerName = customerNameInput?.value.trim();
    const container = document.getElementById('customerOrdersContainer');
    
    if (!customerName || !container) {
      if (container) container.style.display = 'none';
      return;
    }

    this.orderCheckDebounceTimer = setTimeout(async () => {
      // Find customer ID from cached contacts
      const customer = this.allContacts.find(c => c.name.toLowerCase() === customerName.toLowerCase());
      
      if (!customer || !customer.id) {
        container.style.display = 'none';
        return;
      }

      try {
        const response = await fetch(`/api/billing/orders?customer_id=${customer.id}`);
        if (response.ok) {
          const result = await response.json();
          const orders = result.data || [];
          
          if (orders.length > 0) {
            container.innerHTML = `
              <button type="button" id="viewCustomerOrdersBtn" class="view-orders-badge" style="width: 100%; margin-top: 10px; display: flex; justify-content: center; align-items: center; gap: 8px; padding: 12px;">
                <span style="font-size: 18px;">📋</span> View ${orders.length} Orders for this Customer
              </button>
            `;
            container.style.display = 'block';
            
            document.getElementById('viewCustomerOrdersBtn').onclick = (e) => {
              e.preventDefault();
              this.showCustomerOrdersModal(orders, customerName);
            };
          } else {
            container.style.display = 'none';
          }
        }
      } catch (error) {
        log.error('Error checking customer orders:', error);
        container.style.display = 'none';
      }
    }, 500);
  }

  showCustomerOrdersModal(orders, customerName) {
    // Remove existing modal if any
    const existingModal = document.getElementById('customerOrdersModal');
    if (existingModal) existingModal.remove();

    const sortedOrders = [...orders].sort((a, b) => {
      const isPendingA = a.status !== 'completed' && a.status !== 'cancelled';
      const isPendingB = b.status !== 'completed' && b.status !== 'cancelled';
      if (isPendingA && !isPendingB) return -1;
      if (!isPendingA && isPendingB) return 1;
      return new Date(b.order_date) - new Date(a.order_date);
    });

    const getStageLabel = (stage) => {
      const labels = {
        'stage1': 'Order Entry',
        'stage2': 'Quality Check (QC)',
        'stage3': 'Billing/Dispatch'
      };
      return labels[stage] || stage || 'Unknown';
    };

    const getStatusBadge = (status) => {
      const s = (status || 'pending').toLowerCase();
      let bg = '#e5e7eb', color = '#374151';
      if (s === 'completed') { bg = '#dcfce7'; color = '#166534'; }
      else if (s === 'cancelled') { bg = '#fee2e2'; color = '#991b1b'; }
      else if (s === 'pending') { bg = '#fef9c3'; color = '#854d0e'; }
      return `<span style="padding: 2px 8px; border-radius: 12px; font-size: 10px; font-weight: 600; background: ${bg}; color: ${color}; text-transform: uppercase;">${s}</span>`;
    };

    const modalHtml = `
      <div id="customerOrdersModal" class="variant-modal-overlay">
        <div class="variant-modal" style="max-width: 650px; width: 95%;">
          <div class="variant-modal-header">
            <h3>📦 Order History: ${customerName}</h3>
            <button class="variant-modal-close" id="orders-close-btn">×</button>
          </div>
          <div class="variant-modal-body" style="max-height: 500px; overflow-y: auto; padding: 20px; background: #f8fafc;">
            <p style="font-size: 13px; color: #666; margin-bottom: 20px;">Detailed list of all past and pending orders for this customer.</p>
            <div class="orders-selection-list">
              ${sortedOrders.map(order => `
                <div class="order-selection-item" style="padding: 18px; margin-bottom: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; display: flex; justify-content: space-between; align-items: flex-start; gap: 15px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                  <div class="order-selection-info" style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
                      <span style="font-weight: 700; font-size: 15px; color: #1f2937;">#${order.order_number || order.id}</span>
                      ${getStatusBadge(order.status)}
                    </div>
                    <div style="font-size: 11px; color: #6b7280; font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                      📅 ${new Date(order.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} | 🏷️ ${getStageLabel(order.current_stage)}
                    </div>
                    ${order.order_notes ? `<div style="font-size: 12px; color: #4b5563; font-style: italic; background: #f9fafb; padding: 6px 10px; border-radius: 4px; border-left: 3px solid #d1d5db; margin: 8px 0;">"${order.order_notes.length > 80 ? order.order_notes.substring(0, 80) + '...' : order.order_notes}"</div>` : ''}
                    <div class="order-meta" style="font-size: 12px; display: flex; gap: 15px; color: #374151;">
                      <span><strong>${order.items?.length || 0}</strong> Items</span>
                      <span><strong>${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(order.total_amount || 0)}</strong> Total</span>
                    </div>
                  </div>
                  <div class="order-selection-actions" style="display: flex; flex-direction: column; gap: 8px;">
                    <button class="btn view-details-btn" style="background: var(--billing-primary); color: white; white-space: nowrap; padding: 8px 12px; border-radius: 6px;" data-id="${order.id}">👁️ Details</button>
                    ${order.status === 'pending' || order.status === 'stage1' || order.status === 'stage2' ? `<span style="font-size: 10px; color: #059669; font-weight: 700; text-align: center;">PENDING</span>` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="variant-modal-footer">
            <button class="variant-modal-btn cancel" id="orders-cancel-btn" style="padding: 10px 20px;">Close</button>
          </div>
        </div>
      </div>
    `;

    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHtml;
    // Append to viewContainer to keep it "inside" the app
    this.viewContainer.appendChild(modalDiv.firstElementChild);

    // Event listeners
    const closeModal = () => {
      const modal = document.getElementById('customerOrdersModal');
      if (modal) modal.remove();
    };

    document.getElementById('orders-close-btn').onclick = closeModal;
    document.getElementById('orders-cancel-btn').onclick = closeModal;

    // View Details buttons
    document.querySelectorAll('.view-details-btn').forEach(btn => {
      btn.onclick = () => {
        const orderId = btn.getAttribute('data-id');
        const order = orders.find(o => o.id == orderId);
        if (order) {
          this.showOrderDetailsModal(order, customerName);
        }
      };
    });
  }

  showOrderDetailsModal(order, customerName) {
    const existingModal = document.getElementById('customerOrdersModal');
    if (existingModal) existingModal.remove();

    const orderNumber = order.order_number || order.id;
    
    const getStageLabel = (stage) => {
      const labels = { 'stage1': 'Order Entry', 'stage2': 'Quality Check (QC)', 'stage3': 'Billing/Dispatch' };
      return labels[stage] || stage || 'Unknown';
    };

    const getStatusStyle = (status) => {
      const s = (status || 'pending').toLowerCase();
      if (s === 'completed') return 'background: #dcfce7; color: #166534; border: 1px solid #bdf0cc;';
      if (s === 'cancelled') return 'background: #fee2e2; color: #991b1b; border: 1px solid #fecaca;';
      return 'background: #fef9c3; color: #854d0e; border: 1px solid #fef08a;';
    };

    const modalHtml = `
      <div id="customerOrdersModal" class="variant-modal-overlay">
        <div class="variant-modal" style="max-width: 850px; width: 95%; border: 1px solid #e2e8f0; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);">
          <div class="variant-modal-header" style="background: #1f2937; color: white; padding: 15px 20px;">
            <div style="display: flex; align-items: center; gap: 15px;">
              <h3 style="margin: 0;">📦 Order Details: #${orderNumber}</h3>
              <span style="padding: 3px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; ${getStatusStyle(order.status)}">
                ${order.status}
              </span>
            </div>
            <button class="variant-modal-close" id="details-close-btn" style="color: white; font-size: 24px; opacity: 0.8;">×</button>
          </div>
          
          <div class="variant-modal-body" style="max-height: 600px; overflow-y: auto; padding: 25px; background: #fff;">
            <!-- Order Header Info -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 25px; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #f1f5f9;">
              <div>
                <label style="display: block; font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">Customer</label>
                <div style="font-size: 14px; font-weight: 600; color: #1e293b;">${customerName}</div>
              </div>
              <div>
                <label style="display: block; font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">Order Date</label>
                <div style="font-size: 14px; color: #1e293b;">${new Date(order.order_date).toLocaleDateString()} ${new Date(order.order_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
              </div>
              <div>
                <label style="display: block; font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">Current Stage</label>
                <div style="font-size: 14px; color: #1e293b;">${getStageLabel(order.current_stage)}</div>
              </div>
              <div>
                <label style="display: block; font-size: 10px; color: #64748b; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">Delivery Date</label>
                <div style="font-size: 14px; color: #1e293b;">${order.delivery_date ? new Date(order.delivery_date).toLocaleDateString() : 'Not Delivered'}</div>
              </div>
            </div>

            <!-- Notes Section -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
              <div style="background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px; border-radius: 4px;">
                <label style="display: block; font-size: 11px; color: #92400e; font-weight: 700; margin-bottom: 6px;">📝 Order Notes</label>
                <div style="font-size: 13px; color: #451a03; line-height: 1.4;">${order.order_notes || 'No notes provided for this order.'}</div>
              </div>
              <div style="background: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 12px; border-radius: 4px;">
                <label style="display: block; font-size: 11px; color: #075985; font-weight: 700; margin-bottom: 6px;">🛡️ QC Notes ${order.qc_date ? `<small>(${new Date(order.qc_date).toLocaleDateString()})</small>` : ''}</label>
                <div style="font-size: 13px; color: #0c4a6e; line-height: 1.4;">${order.qc_notes || 'Order has not reached QC stage yet or no notes recorded.'}</div>
              </div>
            </div>
            
            <!-- Items Table -->
            <div style="border: 1px solid #e2e8f0; border-radius: 8px; overflow-x: auto; -webkit-overflow-scrolling: touch;">
              <table class="bill-items-table" style="width: 100%; min-width: 700px; border-collapse: collapse; font-size: 13px;">
                <thead style="background: #f1f5f9; border-bottom: 2px solid #e2e8f0;">
                  <tr>
                    <th style="padding: 12px; text-align: left; color: #475569;">#</th>
                    <th style="padding: 12px; text-align: left; color: #475569;">Product / Batch Details</th>
                    <th style="padding: 12px; text-align: right; color: #475569;">MRP</th>
                    <th style="padding: 12px; text-align: right; color: #475569;">Rate</th>
                    <th style="padding: 12px; text-align: center; color: #475569;">Ordered</th>
                    <th style="padding: 12px; text-align: center; color: #475569;">Picked</th>
                    <th style="padding: 12px; text-align: right; color: #475569;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${order.items.map((item, idx) => {
                    const isNotReceived = (item.received_quantity || 0) < 1;
                    const strikeStyle = isNotReceived ? 'text-decoration: line-through; text-decoration-color: #ef4444; opacity: 0.7;' : '';
                    return `
                    <tr style="border-bottom: 1px solid #f1f5f9; vertical-align: middle; ${isNotReceived ? 'background: #fafafa;' : ''}">
                      <td style="padding: 12px; color: #94a3b8; font-weight: 600; ${strikeStyle}">${idx + 1}</td>
                      <td style="padding: 12px; ${strikeStyle}">
                        <div style="font-weight: 700; color: #1e293b; font-size: 14px;">${item.product_name}</div>
                        <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
                          ${item.pack_size_value || ''} ${item.pack_size_type || ''} | 
                          <span style="font-weight: 600;">Batch: ${item.batch_no || 'N/A'}</span>
                          ${item.exp_date ? ` | Exp: ${new Date(item.exp_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}` : ''}
                        </div>
                      </td>
                      <td style="padding: 12px; text-align: right; color: #64748b; ${strikeStyle}">₹${parseFloat(item.mrp || 0).toFixed(2)}</td>
                      <td style="padding: 12px; text-align: right; font-weight: 600; color: #1e293b; ${strikeStyle}">₹${parseFloat(item.unit_price || 0).toFixed(2)}</td>
                      <td style="padding: 12px; text-align: center; font-weight: 600; ${strikeStyle}">${item.qty || item.quantity}</td>
                      <td style="padding: 12px; text-align: center;">
                        <span style="padding: 2px 8px; border-radius: 4px; background: ${item.received_quantity >= (item.qty || item.quantity) ? '#dcfce7' : '#fee2e2'}; color: ${item.received_quantity >= (item.qty || item.quantity) ? '#166534' : '#991b1b'}; font-weight: 700;">
                          ${item.received_quantity || 0}
                        </span>
                      </td>
                      <td style="padding: 12px; text-align: right; font-weight: 700; color: #1e293b; ${strikeStyle}">
                        ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(item.line_total || (item.unit_price * (item.quantity || 1)))}
                      </td>
                    </tr>
                  `;}).join('')}
                </tbody>
                <tfoot style="background: #f8fafc; border-top: 2px solid #e2e8f0;">
                  <tr>
                    <td colspan="6" style="padding: 15px; text-align: right; font-weight: 700; color: #475569;">Grand Total:</td>
                    <td style="padding: 15px; text-align: right; font-size: 16px; font-weight: 800; color: #1e293b;">
                      ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(order.total_amount || 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
          
          <div class="variant-modal-footer" style="padding: 15px 25px; border-top: 1px solid #f1f5f9;">
            <button class="variant-modal-btn cancel" id="details-back-btn" style="padding: 10px 20px;">← Back to List</button>
            <div style="flex: 1;"></div>
            ${order.status === 'completed' 
              ? `<span style="color: #64748b; font-size: 13px; font-weight: 600;">✓ This order has already been processed.</span>`
              : `<button class="btn" id="confirm-import-btn" style="background: var(--billing-primary); color: white; padding: 10px 25px; border-radius: 6px; font-weight: 700; font-size: 14px;">✓ Import to Current Bill</button>`
            }
          </div>
        </div>
      </div>
    `;

    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHtml;
    this.viewContainer.appendChild(modalDiv.firstElementChild);

    const closeModal = () => {
      const modal = document.getElementById('customerOrdersModal');
      if (modal) modal.remove();
    };

    document.getElementById('details-close-btn').onclick = closeModal;
    document.getElementById('details-back-btn').onclick = () => {
      const container = document.getElementById('customerOrdersContainer');
      const badge = document.getElementById('viewCustomerOrdersBtn');
      if (badge) badge.click();
      else closeModal();
    };

    const confirmBtn = document.getElementById('confirm-import-btn');
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        this.importOrderIntoBill(order);
        closeModal();
      };
    }
  }

  async showMissingPreferenceModal(productName, customerName, item = {}) {
    // Extract metadata for display
    const mrpStr = item.mrp ? `₹${parseFloat(item.mrp).toFixed(2)}` : 'N/A';
    const variantStr = item.pack_size_value ? `${item.pack_size_value}${item.pack_size_type || ''}` : 'No Variant';
    const batchStr = item.batch_no || item.batch || 'N/A';

    return new Promise((resolve) => {
      // Remove existing modal if any
      const existingModal = document.getElementById('missingPreferenceModal');
      if (existingModal) existingModal.remove();

      const modalHtml = `
        <div id="missingPreferenceModal" class="variant-modal-overlay" style="z-index: 20000;">
          <div class="variant-modal" style="max-width: 450px; width: 90%; border: 2px solid var(--billing-primary);">
            <div class="variant-modal-header" style="background: var(--billing-primary); color: white;">
              <h3>⚙️ Set Product Preference</h3>
              <button class="variant-modal-close" id="pref-close-btn" style="color: white;">×</button>
            </div>
            <div class="variant-modal-body" style="padding: 20px;">
              <div style="background: rgba(255, 255, 255, 0.1); padding: 12px; border-radius: 6px; margin-bottom: 20px; border: 1px solid rgba(255, 255, 255, 0.2);">
                <div style="font-weight: 700; color: white; margin-bottom: 4px; font-size: 15px;">${productName}</div>
                <div style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; color: #64748b; font-weight: 600;">
                  <span>📋 Batch: ${batchStr}</span>
                  <span>📦 Variant: ${variantStr}</span>
                  <span>🏷️ MRP: ${mrpStr}</span>
                </div>
              </div>
              <p style="font-size: 13px; margin-bottom: 20px; color: #475569;">
                Preferences for this customer (<strong>${customerName}</strong>) are not set. Please provide them to continue import.
              </p>
              
              <div class="form-group" style="margin-bottom: 15px;">
                <label style="display: block; font-size: 12px; margin-bottom: 5px; font-weight: 600;">Discount 1 (%)</label>
                <input type="number" id="prefDisc1" class="form-input" value="0" step="0.01" style="width: 100%;">
              </div>
              
              <div class="form-group" style="margin-bottom: 15px;">
                <label style="display: block; font-size: 12px; margin-bottom: 5px; font-weight: 600;">Discount 2 (%)</label>
                <input type="number" id="prefDisc2" class="form-input" value="0" step="0.01" style="width: 100%;">
              </div>
              
              <div class="form-group" style="margin-bottom: 15px;">
                <label style="display: block; font-size: 12px; margin-bottom: 5px; font-weight: 600;">Tax (%)</label>
                <select id="prefTax" class="form-input" style="width: 100%;">
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                </select>
              </div>

              <div class="form-group" style="margin-bottom: 15px;">
                <label style="display: block; font-size: 12px; margin-bottom: 5px; font-weight: 600;">Scheme</label>
                <select id="prefScheme" class="form-input" style="width: 100%;">
                  <option value="">No Scheme</option>
                  <option value="5+1">5+1 Free</option>
                  <option value="10+1">10+1 Free</option>
                </select>
              </div>

              <div class="form-group" style="display: flex; flex-direction: column; gap: 8px; margin-top: 15px;">
                <label style="font-size: 12px; font-weight: 600;">Tax Calculation</label>
                <button type="button" id="prefGstReverseBtn" class="gst-reverse-btn" style="width: 100%; display: flex; justify-content: center; align-items: center; gap: 8px; height: 38px;">↩️ GST Reverse</button>
                <input type="hidden" id="prefGstReverse" value="false">
              </div>
            </div>
            <div class="variant-modal-footer">
              <button class="variant-modal-btn cancel" id="pref-skip-btn">Use Defaults</button>
              <button class="btn" id="pref-save-btn" style="background: var(--billing-primary); color: white; padding: 10px 20px;">Save & Import</button>
            </div>
          </div>
        </div>
      `;

      const modalDiv = document.createElement('div');
      modalDiv.innerHTML = modalHtml;
      this.viewContainer.appendChild(modalDiv.firstElementChild);

      const closeModal = (pref = null) => {
        const modal = document.getElementById('missingPreferenceModal');
        if (modal) modal.remove();
        resolve(pref);
      };

      document.getElementById('pref-close-btn').onclick = () => closeModal();
      
      const gstReverseBtn = document.getElementById('prefGstReverseBtn');
      const gstReverseInput = document.getElementById('prefGstReverse');
      
      gstReverseBtn.onclick = (e) => {
        e.preventDefault();
        const newState = gstReverseInput.value !== 'true';
        gstReverseInput.value = newState.toString();
        gstReverseBtn.classList.toggle('active', newState);
      };

      document.getElementById('pref-skip-btn').onclick = () => {
        closeModal({
          disc1: 0,
          disc2: 0,
          tax: 0,
          scheme: '',
          gst_reverse: false
        });
      };

      document.getElementById('pref-save-btn').onclick = async () => {
        const disc1 = parseFloat(document.getElementById('prefDisc1').value) || 0;
        const disc2 = parseFloat(document.getElementById('prefDisc2').value) || 0;
        const tax = parseFloat(document.getElementById('prefTax').value) || 0;
        const scheme = document.getElementById('prefScheme').value;
        const gstReverse = gstReverseInput.value === 'true';

        const prefObj = {
          disc1,
          disc2,
          tax,
          scheme,
          gst_reverse: gstReverse
        };

        // Save to API
        await this.saveProductMemoryToAPI(productName, customerName, disc1, disc2, scheme, tax, gstReverse);
        
        closeModal(prefObj);
      };
    });
  }

  async importOrderIntoBill(order) {
    // Check if current bill has products
    if (this.currentBillProducts.length > 0) {
      if (!confirm('This will replace the current items in your bill. Continue?')) {
        return;
      }
    }

    const customerName = document.getElementById('customerName')?.value.trim();
    if (!customerName) {
      alert('Please ensure customer name is set.');
      return;
    }

    log.debug(`📦 Importing ${order.items?.length || 0} items from order #${order.order_number || order.id}`);

    // Show loading state if many items
    const loadingOverlay = document.createElement('div');
    loadingOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
    loadingOverlay.innerHTML = '<div style="background:white;padding:20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">🔄 Applying customer preferences...</div>';
    document.body.appendChild(loadingOverlay);

    try {
      // Clear current products
      this.currentBillProducts = [];

      // Map order items to bill items and fetch preferences for each
      if (order.items && Array.isArray(order.items)) {
        for (const item of order.items) {
          // Use robust received quantity calculation (snake_case)
          const rec = (item.received_quantity !== undefined && item.received_quantity !== null) ? item.received_quantity : (item.received_qty !== undefined ? item.received_qty : 0);
          
          // Bug 1 Fix: Skip unreceived products
          if (rec < 1) {
            log.debug(`🚫 Skipping unreceived product: ${item.product_name || 'Unknown'}`);
            continue;
          }

          // Bug 2 Fix: Use actual received quantity
          const qty = rec;
          
          // Fetch preference for this customer and product
          let preference = null;
          try {
            const pName = (item.product_name || '').trim();
            const url = `/api/billing/preference/${encodeURIComponent(customerName)}/${encodeURIComponent(pName)}`;
            log.debug(`🔍 Checking preference for: ${pName} at ${url}`);
            
            const prefRes = await fetch(url);
            if (prefRes.ok) {
              const prefData = await prefRes.json();
              log.debug(`📦 Preference result for ${pName}:`, prefData);
              preference = prefData.data;
            } else {
              log.warn(`⚠️ Preference API failed for ${pName}: ${prefRes.status}`);
            }
          } catch (prefErr) {
            log.warn(`Could not load preference for ${item.product_name}:`, prefErr);
          }

          // If preference is missing (null or empty data), show modal to ask user
          // Ensure we don't pop up for empty objects if API returns one
          const hasPref = preference && Object.keys(preference).length > 0;
          
          if (!hasPref) {
            log.debug(`❓ No preference found for ${item.product_name}, opening fallback modal...`);
            // Hide loading overlay while modal is open
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            
            preference = await this.showMissingPreferenceModal(item.product_name, customerName, item);
            
            // Show loading overlay again
            if (loadingOverlay) loadingOverlay.style.display = 'flex';
            
            // If still no preference (modal cancelled), use defaults
            if (!preference) {
              preference = { disc1: 0, disc2: 0, tax: 0, scheme: '', gst_reverse: false };
            }
          }

          const pName = (item.product_name || '').trim();
          
          // Fetch full product info from API for metadata consistency (isGold, variants, etc)
          let productInfo = null;
          try {
            const prodRes = await fetch(`/api/products?search=${encodeURIComponent(pName)}`);
            if (prodRes.ok) {
              const prodData = await prodRes.json();
              const products = this.normalizeProducts(prodData);
              if (Array.isArray(products)) {
                productInfo = products.find(p => p.name.toLowerCase() === pName.toLowerCase());
              }
            }
          } catch (err) {
            log.warn(`Could not fetch metadata for ${pName}:`, err);
          }

          const itemData = {
            name: productInfo ? productInfo.name : item.product_name,
            product_id: productInfo ? productInfo.id : (item.product_id || null),
            variant_id: item.variant_id || (productInfo ? productInfo.variant_id : null),
            batch_id: item.batch_id || (productInfo ? productInfo.batch_id : null),
            pack_value: item.pack_size_value || (productInfo ? productInfo.pack_size_value : ''),
            pack_type: item.pack_size_type || (productInfo ? productInfo.pack_size_type : ''),
            batch: item.batch_no || '',
            mrp: item.mrp || (productInfo ? productInfo.mrp : 0),
            qty: qty,
            disc1: preference.disc1,
            disc2: preference.disc2,
            scheme: preference.scheme,
            tax: preference.tax,
            gst_reverse: preference.gst_reverse,
            isGold: productInfo ? (productInfo.is_gold || productInfo.isGold || false) : (item.is_gold || item.isGold || false)
          };

          // Use the unified addProductToBill method with suppression
          this.addProductToBill(itemData, true);
        }
      }

      // Refresh UI once after all items added
      this.renderProductList();
      this.updateBillSummary();
      
      // Scroll to product list
      document.querySelector('.bill-items-table')?.scrollIntoView({ behavior: 'smooth' });
      
    } catch (err) {
      log.error('Import Error:', err);
      alert('Failed to import order items. Please check the logs.');
    } finally {
      loadingOverlay.remove();
    }
  }

  async addProductToBill(itemData = null, suppressRefresh = false) {
    const schemeValue = itemData ? itemData.scheme : document.getElementById('productScheme').value;
    let scheme = schemeValue;
    
    if (schemeValue === 'custom') {
      scheme = itemData ? itemData.scheme : document.getElementById('customSchemeValue').value;
      if (!scheme && !itemData) {
        alert('Please enter custom scheme value (e.g., 3+1)');
        return;
      }
    }

    const mrp = itemData ? parseFloat(itemData.mrp || 0) : parseFloat((parseFloat(document.getElementById('productMRP').value) || 0).toFixed(2));
    const disc1Pct = itemData ? parseFloat(itemData.disc1 || 0) : parseFloat((parseFloat(document.getElementById('productDisc1').value) || 0).toFixed(2));
    const qty = itemData ? parseFloat(itemData.qty || 0) : parseFloat((parseFloat(document.getElementById('productQty').value) || 0).toFixed(2));
    const disc2Pct = itemData ? parseFloat(itemData.disc2 || 0) : parseFloat((parseFloat(document.getElementById('productDisc2').value) || 0).toFixed(2));
    const gstPct = itemData ? parseFloat(itemData.tax || 0) : parseFloat((parseFloat(document.getElementById('productTax').value) || 0).toFixed(2));

    const product = {
      id: Math.floor(Date.now() + Math.random() * 1000),
      name: itemData ? itemData.name : document.getElementById('productName').value,
      product_id: itemData ? itemData.product_id : (this.currentProduct?.id || null),
      variant_id: itemData ? itemData.variant_id : (this.currentProduct?.variant_id || null),
      batch_id: itemData ? itemData.batch_id : (this.currentProduct?.batch_id || null),
      pack_value: itemData ? itemData.pack_value : document.getElementById('productPack').value,
      pack_type: itemData ? itemData.pack_type : (document.getElementById('productPackUnit').value || ''),
      pack: itemData ? `${itemData.pack_value || ''} ${itemData.pack_type || ''}`.trim() : (document.getElementById('productPack').value + ' ' + (document.getElementById('productPackUnit').value || '')).trim(),
      batch: itemData ? itemData.batch : document.getElementById('productBatch').value,
      exp: itemData ? (itemData.exp || '') : '',
      mrp: mrp,
      rate: mrp,
      qty: qty,
      free: this.calculateFreeItems(qty, scheme),
      disc1: disc1Pct,
      disc2: disc2Pct,
      scheme: scheme,
      sgst: parseFloat((gstPct / 2).toFixed(2)),
      cgst: parseFloat((gstPct / 2).toFixed(2)),
      gstTotal: gstPct,
      gst_percent: gstPct,
      isGold: (itemData && (itemData.isGold === true || itemData.is_gold === true || itemData.is_gold === 1 || String(itemData.classification).toLowerCase() === 'gold')) ||
              (this.currentProduct && (this.currentProduct.isGold === true || this.currentProduct.is_gold === true || this.currentProduct.is_gold === 1 || String(this.currentProduct.classification).toLowerCase() === 'gold')) ||
              false,
      gst_reverse: itemData ? (itemData.gst_reverse || false) : (document.getElementById('gstReverseCheckbox')?.value === 'true'),
      has_multiple_variants: itemData ? true : (this.currentProduct?.variants && Array.isArray(this.currentProduct.variants) && this.currentProduct.variants.length > 1)
    };

    // Validate product
    if (!product.name || product.qty === 0 || product.mrp === 0) {
      alert('Please fill in Product Name, Quantity, and MRP');
      return;
    }

    // Check for differences with Master Product if added from form (not via itemData)
    if (!itemData && this.currentProduct) {
      const masterProduct = this.currentProduct;
      const changes = [];

      // Compare MRP
      if (parseFloat(product.mrp) !== parseFloat(masterProduct.mrp || 0)) {
        changes.push('mrp');
      }

      // Compare Pack
      const masterPackValue = masterProduct.pack_size_value || masterProduct.pack_value || '';
      if (String(product.pack_value) !== String(masterPackValue)) {
        changes.push('pack');
      }

      // Compare Batch
      if (String(product.batch) !== String(masterProduct.batch_no || '')) {
        changes.push('batch');
      }

      if (changes.length > 0) {
        log.debug('🔍 Change detection triggered for:', changes);
        // For multiple changes, we'll ask for the first one that matters most (MRP > Pack > Batch)
        const priorityField = changes[0]; 
        const oldValue = priorityField === 'mrp' ? masterProduct.mrp : 
                        (priorityField === 'pack' ? masterPackValue : masterProduct.batch_no);
        const newValue = product[priorityField === 'pack' ? 'pack_value' : priorityField];

        const updateType = await this.showProductMasterUpdateModal(product, priorityField, oldValue, newValue);
        
        if (updateType === 'cancel') {
          return; // Skip adding the product
        }
        
        if (updateType === 'update-db') {
          // FIX: Pass 'product' (the new one) instead of 'masterProduct' (the old reference)
          // This ensures the correct batch number and variant ID are sent to the API
          await this.updateProductDatabase(product, priorityField, newValue);
        }
      }
    }

    log.debug('📝 DUPLICATE CHECK - New Product Object:', {
      name: product.name,
      variant_id: product.variant_id,
      batch: product.batch,
      pack_value: product.pack_value,
      product_id: product.product_id
    });

    log.debug('📝 DUPLICATE CHECK - Existing Products in Bill:', 
      this.currentBillProducts.map((p, idx) => ({
        idx,
        name: p.name,
        variant_id: p.variant_id,
        batch: p.batch,
        pack_value: p.pack_value,
        product_id: p.product_id
      }))
    );

    // Check if product with same name, variant, and batch already exists
    log.debug('📦 [DUPLICATE CHECK START] Total products in bill:', this.currentBillProducts.length);
    log.debug('📦 [NEW PRODUCT TO ADD]:', JSON.stringify({ name: product.name, batch: product.batch, variant: product.variant_id }, null, 2));

    const existingProductIndex = this.currentBillProducts.findIndex((p, idx) => {
      // Super-aggressive normalization: remove all non-alphanumeric characters for "fuzzy" match
      const normalize = (str) => (str || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
      
      const nameA = normalize(p.name);
      const nameB = normalize(product.name);
      const nameMatch = nameA === nameB;
      
      const batchA = normalize(p.batch);
      const batchB = normalize(product.batch);
      const batchMatch = batchA === batchB;
      
      const normalizeVariant = (v) => (v === undefined || v === null || v === 'null' || v === '') ? null : String(v);
      const vA = normalizeVariant(p.variant_id);
      const vB = normalizeVariant(product.variant_id);
      const variantMatch = (vA === null || vB === null) ? true : (vA === vB);
      
      const isMatch = nameMatch && variantMatch && batchMatch;
      
      log.debug(`   └─ Aggressive Match with #${idx+1}:`, {
        matches: { name: nameMatch, batch: batchMatch, variant: variantMatch },
        FINAL_MATCH: isMatch,
        strings: { A: `${nameA}|${batchA}`, B: `${nameB}|${batchB}` }
      });
      
      return isMatch;
    });

    if (existingProductIndex !== -1) {
      // Product already exists - show modal
      this.showDuplicateProductModal(product, existingProductIndex);
      return;
    }

    // Save memory for this product-customer combination (async, no await needed)
    const customerNameInput = document.getElementById('customerName');
    const customerName = customerNameInput ? customerNameInput.value.trim() : '';
    this.saveProductMemory(product.name, customerName, product.disc1, product.disc2, product.scheme, product.gstTotal, product.gst_reverse);

    this.currentBillProducts.push(product);
    
    if (!itemData) this.clearProductForm();
    
    if (!suppressRefresh) {
      this.renderProductList();
      this.updateBillSummary();
    }
  }

  showDuplicateProductModal(newProduct, existingProductIndex) {
    log.debug('📱 Showing duplicate product modal for:', {
      newProduct: newProduct.name,
      existingIndex: existingProductIndex,
      existingProduct: this.currentBillProducts[existingProductIndex]?.name
    });
    
    const existingProduct = this.currentBillProducts[existingProductIndex];
    
    const modalHtml = `
      <div class="duplicate-product-modal-overlay">
        <div class="duplicate-product-modal">
          <div class="duplicate-modal-header">
            <h3>🔄 Product Already Added</h3>
            <button class="duplicate-modal-close">×</button>
          </div>
          <div class="duplicate-modal-body">
            <div class="duplicate-product-info">
              <div class="product-match-item">
                <span class="product-match-label">Product:</span>
                <span class="product-match-value">${newProduct.name}</span>
              </div>
              <div class="product-match-item">
                <span class="product-match-label">Current Qty:</span>
                <span class="product-match-value">${existingProduct.qty}</span>
              </div>
              <div class="product-match-item">
                <span class="product-match-label">New Qty Add:</span>
                <span class="product-match-value">${newProduct.qty}</span>
              </div>
              <div class="product-match-item" style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px; margin-top: 8px;">
                <span class="product-match-label">Total Qty:</span>
                <span class="product-match-value" style="color: var(--highlight);">${existingProduct.qty + newProduct.qty}</span>
              </div>
            </div>
          </div>
          <div class="duplicate-modal-footer">
            <button class="duplicate-modal-btn cancel">✗ Don't Add</button>
            <button class="duplicate-modal-btn confirm">✓ Increase Qty</button>
          </div>
        </div>
      </div>
    `;

    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHtml;
    const overlay = modalDiv.firstElementChild;
    this.viewContainer.appendChild(overlay);

    // Attach event listeners using class selectors
    const closeBtn = overlay.querySelector('.duplicate-modal-close');
    const cancelBtn = overlay.querySelector('.duplicate-modal-btn.cancel');
    const confirmBtn = overlay.querySelector('.duplicate-modal-btn.confirm');

    const closeModal = () => {
      overlay.remove();
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    confirmBtn.addEventListener('click', () => {
      closeModal();
      this.mergeProductQuantity(existingProductIndex, newProduct.qty);
    });

    // Close on backdrop click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal();
      }
    });
  }

  mergeProductQuantity(existingProductIndex, additionalQty) {
    const existingProduct = this.currentBillProducts[existingProductIndex];
    existingProduct.qty = parseFloat((existingProduct.qty + additionalQty).toFixed(2));
    
    // Recalculate free items
    existingProduct.free = this.calculateFreeItems(existingProduct.qty, existingProduct.scheme);

    this.clearProductForm();
    this.renderProductList();
    this.updateBillSummary();
  }

  clearProductForm() {
    document.getElementById('productName').value = '';
    document.getElementById('productPack').value = '';
    document.getElementById('productPackUnit').value = '';
    document.getElementById('productBatch').value = '';
    document.getElementById('productMRP').value = '';
    document.getElementById('productQty').value = '';
    document.getElementById('productDisc1').value = '';
    document.getElementById('productDisc2').value = '';
    document.getElementById('productScheme').value = '';
    document.getElementById('customSchemeValue').value = '';
    document.getElementById('productTax').value = '0';
    document.getElementById('gstReverseCheckbox').value = 'false';
    document.getElementById('gstReverseBtn').classList.remove('active');
    document.getElementById('customSchemeContainer').style.display = 'none';
    document.getElementById('productName').focus();
  }

  renderProductList() {
    const listSection = document.getElementById('productListSection');
    const listTable = document.getElementById('productListTable');
    const countBadge = document.getElementById('productCountBadge');

    log.debug('🎯 renderProductList called with', this.currentBillProducts.length, 'products');

    // Ensure DOM elements exist before proceeding
    if (!listTable) {
      log.error('❌ Product list table element not found in DOM');
      return;
    }

    if (this.currentBillProducts.length === 0) {
      listTable.innerHTML = '<div class="empty-products-message">No products added yet. Add a product to get started.</div>';
      if (countBadge) countBadge.textContent = '0';
      return;
    }

    let html = '';
    this.currentBillProducts.forEach((product, index) => {
      const normalized = {
        id: product.id || product.product_id || index,
        name: product.name || product.product_name || 'Unknown',
        pack: product.pack || product.pack_value || '',
        batch: product.batch || product.batch_no || '',
        exp: product.exp || product.exp_date || '',
        qty: parseFloat((parseFloat(product.qty || 1)).toFixed(2)),
        free: parseFloat((parseFloat(product.free || 0)).toFixed(2)),
        mrp: parseFloat((parseFloat(product.mrp || product.rate || 0)).toFixed(2)),
        rate: parseFloat((parseFloat(product.rate !== undefined && product.rate !== null && !isNaN(product.rate) && Number(product.rate) > 0 ? product.rate : (product.mrp || 0))).toFixed(2)),
        disc1: parseFloat((parseFloat(product.disc1 || product.discount_1_percent || 0)).toFixed(2)),
        disc2: parseFloat((parseFloat(product.disc2 || product.discount_2_percent || 0)).toFixed(2)),
        sgst: parseFloat((parseFloat(product.sgst || 0)).toFixed(2)),
        cgst: parseFloat((parseFloat(product.cgst || 0)).toFixed(2)),
        gstTotal: parseFloat((parseFloat(product.gstTotal || product.gst_percent || 0)).toFixed(2)),
        isGold: product.isGold === true || product.is_gold === true || product.is_gold === 1 || String(product.classification).toLowerCase() === 'gold' || String(product.category).toLowerCase() === 'gold',
        gst_reverse: product.gst_reverse || false
      };

      const calculations = this.calculateProductDetails(normalized);
      
      // Use calculated values from BillCalculator which properly handles GST Reverse
      // Keep full precision during calculations
      const baseRateForDisplay = calculations.rate; // This is the rate after GST Reverse (base rate)
      const rateAfterDisc1Calculation = calculations.discounted_rate; // This is rate after disc1% is applied
      const qty = parseFloat(normalized.qty || 1);
      
      // Calculate with full precision, only round for display
      const amountBeforeDisc = baseRateForDisplay * qty;
      const amountAfterDisc1 = calculations.amount - calculations.discount_1_amount;
      const rateAfterDisc1 = amountAfterDisc1 / qty;
      const amountAfterDisc2 = amountAfterDisc1 - calculations.discount_2_amount;
      const rateAfterDisc2 = amountAfterDisc2 / qty;
      const taxValue = calculations.gst_amount;
      const cardClass = normalized.isGold ? 'product-card gold' : 'product-card';
      const badgeClass = normalized.isGold ? 'product-card-badge gold' : 'product-card-badge';

      html += `
        <div class="${cardClass}" data-product-id="${normalized.id}" data-original-mrp="${normalized.mrp}">
          <div class="product-card-index">${index + 1}</div>
          
          <div class="product-card-main">
            <div class="product-card-name">
              ${normalized.name}
              <span class="${badgeClass}">${normalized.isGold ? '🔶 GOLD' : '⚪ NON-GOLD'}</span>
              <span class="gst-reverse-badge ${normalized.gst_reverse ? 'active' : ''}" data-product-id="${normalized.id}" role="button" tabindex="0" title="Click to toggle GST Reverse">↩️ ${normalized.gst_reverse ? 'GST Reverse ON' : 'GST Reverse OFF'}</span>
            </div>
            
            <div class="product-card-details">
              <div class="product-detail-item">
                <div class="product-detail-label">Batch</div>
                <div class="product-detail-value">${normalized.batch}</div>
              </div>
              
              <div class="product-detail-item" data-field="pack" data-product-id="${product.id || product.product_id}" data-has-variants="${product.has_multiple_variants ? 'true' : 'false'}" style="cursor: ${product.has_multiple_variants ? 'pointer' : 'default'};">
                <div class="product-detail-label">Pack</div>
                <div class="product-detail-value">${normalized.pack}</div>
              </div>
              
              <div class="product-detail-item" data-field="qty" data-editable="true" style="cursor: pointer;">
                <div class="product-detail-label">Qty</div>
                <div class="product-detail-value">${normalized.qty}</div>
              </div>
              
              <div class="product-detail-item" data-field="scheme" data-editable="true" style="cursor: pointer;">
                <div class="product-detail-label">Free</div>
                <div class="product-detail-value">${normalized.free}</div>
              </div>
              
              <div class="product-detail-item" data-field="mrp" data-editable="true" style="cursor: pointer;">
                <div class="product-detail-label">MRP</div>
                <div class="product-detail-value">₹${normalized.mrp.toFixed(2)}</div>
              </div>
              
              <div class="product-detail-item">
                <div class="product-detail-label">Rate</div>
                <div class="product-detail-value">₹${rateAfterDisc1Calculation.toFixed(2)}</div>
              </div>
              
              <div class="product-detail-item">
                <div class="product-detail-label">Amount</div>
                <div class="product-detail-value" style="color: #1a73e8; font-weight: 800;">₹${(rateAfterDisc1Calculation * normalized.qty).toFixed(2)}</div>
              </div>
              
              <div class="product-detail-item" data-field="disc1" data-editable="true" style="cursor: pointer;">
                <div class="product-detail-label">D1%</div>
                <div class="product-detail-value">${normalized.disc1.toFixed(1)}</div>
              </div>
              
              <div class="product-detail-item">
                <div class="product-detail-label">After D1</div>
                <div class="product-detail-value">₹${rateAfterDisc1.toFixed(2)}</div>
              </div>
              
              <div class="product-detail-item" data-field="disc2" data-editable="true" style="cursor: pointer;">
                <div class="product-detail-label">D2%</div>
                <div class="product-detail-value">${normalized.disc2.toFixed(1)}</div>
              </div>
              
              <div class="product-detail-item">
                <div class="product-detail-label">After D2</div>
                <div class="product-detail-value">₹${rateAfterDisc2.toFixed(2)}</div>
              </div>
              
              <div class="product-detail-item" data-field="gstTotal" data-editable="true" style="cursor: pointer;">
                <div class="product-detail-label">Tax%</div>
                <div class="product-detail-value">${normalized.gstTotal.toFixed(1)}</div>
              </div>
              
              <div class="product-detail-item">
                <div class="product-detail-label">Tax Val</div>
                <div class="product-detail-value">₹${taxValue.toFixed(2)}</div>
              </div>
              
              <div class="product-detail-item">
                <div class="product-detail-label">Final</div>
                <div class="product-detail-value" style="color: #34a853; font-weight: 800;">₹${(amountAfterDisc2 + taxValue).toFixed(2)}</div>
              </div>
            </div>
          </div>
          
          <div class="product-card-actions">
            <button class="btn-delete" data-product-id="${normalized.id}">Delete</button>
          </div>
        </div>
      `;
    });

    listTable.innerHTML = html;
    if (countBadge) countBadge.textContent = this.currentBillProducts.length;

    // Setup edit and delete listeners
    this.setupProductListListeners();
  }

  async showVariantSelectorFromProductCard(packField) {
    try {
      const productCard = packField.closest('.product-card');
      const productId = parseInt(productCard.dataset.productId);
      const product = this.currentBillProducts.find(p => p.id === productId);

      if (!product) {
        log.error('❌ Product not found in bill:', { productId });
        return;
      }

      log.debug('📦 Opening variant selector from product card:', { 
        name: product.name || product.product_name,
        variants: product.variants?.length || 0
      });

      // If product already has variants data, use it directly
      if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
        this.showVariantSelectorForCardEdit(product.variants, product.name || product.product_name, productId);
        return;
      }

      // Otherwise, fetch product details from API to get variants
      const response = await fetch(`/api/products?search=${encodeURIComponent(product.name || product.product_name)}`);
      if (response.ok) {
        const result = await response.json();
        const products = this.normalizeProducts(result);
        
        if (Array.isArray(products) && products.length > 0) {
          const fullProduct = products.find(p => p.name.toLowerCase() === (product.name || product.product_name).toLowerCase());
          if (fullProduct && fullProduct.variants && fullProduct.variants.length > 0) {
            this.showVariantSelectorForCardEdit(fullProduct.variants, fullProduct.name, productId);
            return;
          }
        }
      }

      log.warn('⚠️ No variants found for product:', product.name);
      alert('This product has no variants available');
    } catch (error) {
      log.error('Error opening variant selector:', error);
    }
  }

  showVariantSelectorForCardEdit(variants, productName, productId) {
    // Remove any existing variant modal
    let existingModal = document.getElementById('variantSelectorModal');
    if (existingModal) {
      existingModal.remove();
    }

    // Mark modal as open
    this.isVariantModalOpen = true;

    // Normalize variants
    const normalizedVariants = variants.map((v, idx) => {
      if (typeof v === 'object' && v !== null && (v.pack_size_value !== undefined || v.pack_size_type !== undefined || v.batches !== undefined)) {
        return v;
      }
      
      if (Array.isArray(v) && v.length >= 4) {
        return {
          id: v[0],
          product_id: v[1],
          pack_size_value: v[2],
          pack_size_type: v[3],
          batches: v.batches || []
        };
      }
      
      return {
        pack_size_value: v.pack_size_value || v['2'] || v.packValue,
        pack_size_type: v.pack_size_type || v['3'] || v.packType,
        batches: v.batches || []
      };
    });

    const modalHtml = `
      <div id="variantSelectorModal" class="variant-modal-overlay">
        <div class="variant-modal">
          <div class="variant-modal-header">
            <h3>📦 Select Product Variant</h3>
            <button class="variant-modal-close" id="variant-close-btn">×</button>
          </div>
          <div class="variant-modal-body">
            <div class="variant-list">
              ${normalizedVariants.map((v, idx) => `
                <div class="variant-group">
                  <div class="variant-pack-header">
                    <strong>${v.pack_size_value}${v.pack_size_type ? ' ' + v.pack_size_type : ''}:</strong>
                  </div>
                  ${v.batches && v.batches.length > 0 ? `
                    <div class="variant-batches-list">
                      ${v.batches.map((batch, batchIdx) => `
                        <div class="variant-batch-item">
                          <input type="radio" id="variant-${idx}-batch-${batchIdx}" name="variantOption" value="${idx}" data-batch-index="${batchIdx}" class="variant-radio" />
                          <label for="variant-${idx}-batch-${batchIdx}" class="variant-batch-label">
                            <span class="batch-no">${batch.batchNo || batch.batch_no}</span>
                            <span class="batch-mrp">₹${parseFloat(batch.mrp || 0).toFixed(2)}</span>
                          </label>
                        </div>
                      `).join('')}
                    </div>
                  ` : `
                    <div class="variant-no-batches">No batches available</div>
                  `}
                </div>
              `).join('')}
            </div>
          </div>
          <div class="variant-modal-footer">
            <button class="variant-modal-btn cancel" id="variant-cancel-btn">✗ Cancel</button>
            <button class="variant-modal-btn confirm" id="variant-confirm-btn">✓ Select</button>
          </div>
        </div>
      </div>
    `;

    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHtml;
    this.viewContainer.appendChild(modalDiv.firstElementChild);

    // Store variants and product ID for selection
    this.variantsToSelectFromCard = normalizedVariants;
    this.selectedProductIdForCard = productId;

    // Add event listeners
    const closeModal = () => {
      const modal = document.getElementById('variantSelectorModal');
      if (modal) modal.remove();
      this.isVariantModalOpen = false;
    };

    const closeBtn = document.getElementById('variant-close-btn');
    const cancelBtn = document.getElementById('variant-cancel-btn');
    const confirmBtn = document.getElementById('variant-confirm-btn');

    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        this.selectVariantFromCard();
      });
    }

    const overlay = document.getElementById('variantSelectorModal');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
    }
  }

  selectVariantFromCard() {
    const selectedRadio = document.querySelector('input[name="variantOption"]:checked');
    if (selectedRadio) {
      const idx = parseInt(selectedRadio.value);
      if (idx >= 0 && idx < this.variantsToSelectFromCard.length) {
        const variant = this.variantsToSelectFromCard[idx];
        const product = this.currentBillProducts.find(p => p.id === this.selectedProductIdForCard);

        if (product) {
          // Update product with selected variant details
          product.variant_id = variant.id || null;
          product.pack_size_value = variant.pack_size_value;
          product.pack_size_type = variant.pack_size_type;
          product.pack = `${variant.pack_size_value}${variant.pack_size_type ? ' ' + variant.pack_size_type : ''}`;

          // Update batch and MRP from first available batch
          if (variant.batches && variant.batches.length > 0) {
            const batch = variant.batches[0];
            product.batch = batch.batch_no || batch.batchNo || '';
            product.batch_no = batch.batch_no || batch.batchNo || '';
            product.mrp = batch.mrp || product.mrp;
          }

          log.debug('✅ Variant selected from card:', { productId: product.id, pack: product.pack, variant_id: product.variant_id });

          const modal = document.getElementById('variantSelectorModal');
          if (modal) modal.remove();
          this.isVariantModalOpen = false;

          // Re-render the product list to show updated pack
          this.renderProductList();
          this.updateBillSummary();
          
          // Check for conflicts after variant change
          this.checkAndResolveConflict(product.id);
        }
      }
    } else {
      alert('Please select a variant');
    }
  }

  setupProductListListeners() {
    const listTable = document.getElementById('productListTable');
    
    if (!listTable) return;

    // Clone node to remove all existing event listeners
    const newListTable = listTable.cloneNode(true);
    listTable.parentNode.replaceChild(newListTable, listTable);
    
    const updatedListTable = document.getElementById('productListTable');

    // Use event delegation for all interactions
    updatedListTable.addEventListener('click', (e) => {
      // Check if clicked element is the pack field - only if product has multiple variants
      const packField = e.target.closest('.product-detail-item[data-field="pack"]');
      if (packField && packField.dataset.hasVariants === 'true') {
        e.stopPropagation();
        // Open variant selector for pack field clicks (only for multi-variant products)
        this.showVariantSelectorFromProductCard(packField);
        return;
      }

      // Check if clicked element is in an editable field (but not pack)
      const editableItem = e.target.closest('.product-detail-item[data-editable="true"]');
      if (editableItem) {
        e.stopPropagation(); // Prevent triggering card click
        this.editProductField(editableItem);
        return;
      }

      // Check if clicked element is a GST Reverse badge
      const gstBadge = e.target.closest('.gst-reverse-badge');
      if (gstBadge) {
        e.stopPropagation();
        const productId = parseInt(gstBadge.dataset.productId);
        this.toggleGSTReverse(productId);
        return;
      }

      // Check if clicked element is a delete button
      const deleteBtn = e.target.closest('.btn-delete');
      if (deleteBtn) {
        e.stopPropagation();
        const productId = parseInt(deleteBtn.dataset.productId);
        this.deleteProductFromBill(productId);
        return;
      }
    });

    log.debug('✅ Product list listeners reset');
  }

  editProductField(field) {
    if (!field) {
      log.error('❌ editProductField called with null/invalid field');
      return;
    }

    const fieldName = field.dataset.field;
    const card = field.closest('.product-card');
    const productId = parseInt(card.dataset.productId);
    const product = this.currentBillProducts.find(p => p.id === productId);

    if (!product) {
      log.error('❌ Product not found:', { productId, fieldName });
      return;
    }

    // Special case for scheme selection modal
    if (fieldName === 'scheme') {
      this.showSchemeSelectorModal(product);
      return;
    }

    log.debug('✏️ Editing field:', { fieldName, productId, currentValue: product[fieldName] });

    const currentValue = product[fieldName];
    const input = document.createElement('input');
    input.type = (fieldName === 'qty' || fieldName === 'mrp' || fieldName === 'disc1' || fieldName === 'disc2' || fieldName === 'gstTotal') ? 'number' : 'text';
    input.step = (fieldName === 'qty' || fieldName === 'mrp') ? '0.01' : '0.1';
    input.value = currentValue;
    input.className = 'edit-input';
    input.style.cssText = 'width: 100%; padding: 4px 6px; border: 2px solid #fcd34d; border-radius: 2px; font-size: 12px; font-weight: 600; font-family: inherit;';

    const valueDiv = field.querySelector('.product-detail-value');
    if (!valueDiv) {
      log.error('❌ Value div not found in field');
      return;
    }

    const originalHTML = valueDiv.innerHTML;
    valueDiv.innerHTML = '';
    valueDiv.appendChild(input);
    input.focus();
    input.select();

    let isSaving = false;

    const saveEdit = async () => {
      // Prevent multiple saves
      if (isSaving) return;
      isSaving = true;

      let newValue = input.value;
      
      // Parse numeric fields
      if (fieldName === 'qty' || fieldName === 'mrp' || fieldName === 'disc1' || fieldName === 'disc2' || fieldName === 'gstTotal') {
        newValue = parseFloat(newValue) || 0;
        if (newValue < 0) newValue = 0;
      }

      // Handle fields that can trigger a master database update
      const masterFields = ['mrp', 'pack', 'batch'];
      if (masterFields.includes(fieldName) && newValue !== currentValue) {
        const updateType = await this.showProductMasterUpdateModal(product, fieldName, currentValue, newValue);
        if (updateType === 'cancel') {
          valueDiv.innerHTML = originalHTML;
          isSaving = false;
          return;
        }
        if (updateType === 'update-db') {
          await this.updateProductDatabase(product, fieldName, newValue);
        }
      }

      product[fieldName] = newValue;
      
      // Recalculate based on what was edited
      this.recalculateProductFields(product, fieldName);

      log.debug('✅ Field saved:', { fieldName, newValue, productId });

      this.renderProductList();
      this.updateBillSummary();
      
      // Check for duplicates after editing variant/batch
      if (['pack', 'batch', 'variant_id'].includes(fieldName)) {
        this.checkAndResolveConflict(productId);
      }
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveEdit();
      }
    });
  }

  showSchemeSelectorModal(product) {
    // Remove existing modal if any
    const existingModal = document.getElementById('schemeSelectorModal');
    if (existingModal) existingModal.remove();

    const currentScheme = product.scheme || '';
    
    const modalHtml = `
      <div id="schemeSelectorModal" class="variant-modal-overlay" style="z-index: 20000;">
        <div class="variant-modal" style="max-width: 400px; width: 90%; border: 2px solid var(--accent-green);">
          <div class="variant-modal-header" style="background: var(--accent-green); color: var(--dark-bg);">
            <h3>🏷️ Select Scheme</h3>
            <button class="variant-modal-close" id="scheme-close-btn" style="color: var(--dark-bg);">×</button>
          </div>
          <div class="variant-modal-body" style="padding: 20px;">
            <div style="background: rgba(255, 255, 255, 0.1); padding: 12px; border-radius: 6px; margin-bottom: 20px; border: 1px solid rgba(255, 255, 255, 0.2);">
                <div style="font-weight: 700; color: white; margin-bottom: 4px; font-size: 14px;">${product.name || product.product_name}</div>
                <div style="font-size: 12px; color: #64748b;">Current Scheme: <strong style="color: var(--accent-green);">${currentScheme || 'None'}</strong></div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
              <button class="btn scheme-preset-btn" data-scheme="" style="padding: 12px; border: 1px solid #ddd; background: white; font-weight: 700; cursor: pointer; border-radius: 4px;">None</button>
              <button class="btn scheme-preset-btn" data-scheme="5+1" style="padding: 12px; border: 1px solid #ddd; background: white; font-weight: 700; cursor: pointer; border-radius: 4px;">5 + 1</button>
              <button class="btn scheme-preset-btn" data-scheme="10+1" style="padding: 12px; border: 1px solid #ddd; background: white; font-weight: 700; cursor: pointer; border-radius: 4px;">10 + 1</button>
              <button class="btn scheme-preset-btn" data-scheme="12+1" style="padding: 12px; border: 1px solid #ddd; background: white; font-weight: 700; cursor: pointer; border-radius: 4px;">12 + 1</button>
            </div>

            <div style="border-top: 1px solid #eee; padding-top: 15px;">
              <label style="display: block; font-size: 11px; font-weight: 700; margin-bottom: 8px; color: #666;">CUSTOM SCHEME (Format: X+Y)</label>
              <div style="display: flex; gap: 10px;">
                <input type="text" id="customSchemeInput" value="${currentScheme}" placeholder="e.g. 15+2" style="flex: 1; padding: 10px; border: 2px solid #eee; border-radius: 4px; font-weight: 700;">
                <button id="applyCustomScheme" style="background: var(--accent-green); color: var(--dark-bg); border: none; padding: 0 15px; border-radius: 4px; font-weight: 800; cursor: pointer;">APPLY</button>
              </div>
            </div>
          </div>
          <div class="variant-modal-footer">
            <button class="variant-modal-btn cancel" id="scheme-cancel-btn">✗ Cancel</button>
          </div>
        </div>
      </div>
    `;

    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHtml;
    this.viewContainer.appendChild(modalDiv.firstElementChild);

    const closeModal = () => {
      const modal = document.getElementById('schemeSelectorModal');
      if (modal) modal.remove();
    };

    const applyScheme = (newScheme) => {
      product.scheme = newScheme;
      product.free = this.calculateFreeItems(product.qty, newScheme);
      this.recalculateProductFields(product, 'scheme');
      
      // Update customer item memory too
      const customerName = document.getElementById('customerName')?.value?.trim();
      if (customerName) {
        log.debug('💾 Updating customer item memory for scheme change:', { productName: product.name, customerName, newScheme });
        this.saveProductMemory(product.name, customerName, product.disc1, product.disc2, newScheme, product.gstTotal, product.gst_reverse);
      }

      closeModal();
      this.renderProductList();
      this.updateBillSummary();
    };

    document.getElementById('scheme-close-btn').onclick = closeModal;
    document.getElementById('scheme-cancel-btn').onclick = closeModal;

    // Preset buttons
    document.querySelectorAll('.scheme-preset-btn').forEach(btn => {
      btn.onclick = () => applyScheme(btn.dataset.scheme);
      
      // Highlight active preset
      if (btn.dataset.scheme === currentScheme) {
        btn.style.background = 'rgba(29, 185, 84, 0.1)';
        btn.style.borderColor = 'var(--accent-green)';
        btn.style.color = 'var(--accent-green)';
      }
    });

    // Custom scheme
    const customInput = document.getElementById('customSchemeInput');
    document.getElementById('applyCustomScheme').onclick = () => {
      applyScheme(customInput.value.trim());
    };

    customInput.onkeypress = (e) => {
      if (e.key === 'Enter') {
        applyScheme(customInput.value.trim());
      }
    };
  }

  checkAndResolveConflict(editedProductId) {
    const editedProduct = this.currentBillProducts.find(p => p.id === editedProductId);
    if (!editedProduct) return;

    // Find if another product now matches this one (same name, variant, batch)
    const duplicateIndex = this.currentBillProducts.findIndex((p, idx) => {
      // Don't compare with itself
      if (p.id === editedProductId) return false;
      
      const normalize = (str) => (str || '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
      const nameMatch = normalize(p.name) === normalize(editedProduct.name);
      
      const normalizeVariant = (v) => (v === undefined || v === null || v === 'null' || v === '') ? null : String(v);
      const vA = normalizeVariant(p.variant_id);
      const vB = normalizeVariant(editedProduct.variant_id);
      const variantMatch = (vA === null || vB === null) ? true : (vA === vB);
      
      const batchMatch = normalize(p.batch) === normalize(editedProduct.batch);
      
      return nameMatch && variantMatch && batchMatch;
    });

    if (duplicateIndex !== -1) {
      log.debug('⚠️ Conflict detected after edit:', {
        editedProduct: editedProduct.name,
        duplicateProduct: this.currentBillProducts[duplicateIndex].name
      });
      this.showConflictResolutionModal(editedProductId, duplicateIndex);
    }
  }

  showConflictResolutionModal(editedProductId, duplicateIndex) {
    const editedProduct = this.currentBillProducts.find(p => p.id === editedProductId);
    const duplicateProduct = this.currentBillProducts[duplicateIndex];
    const totalQty = parseFloat((editedProduct.qty + duplicateProduct.qty).toFixed(2));

    const modalHtml = `
      <div class="conflict-modal-overlay">
        <div class="conflict-modal">
          <div class="conflict-modal-header">
            <h3>⚠️ Duplicate Product Detected</h3>
          </div>
          <div class="conflict-modal-body">
            <p style="margin-bottom: 16px;">Your edit created a duplicate entry. Choose which product to keep:</p>
            <div class="conflict-products-info">
              <div class="conflict-product-item">
                <strong>Product #1 (Edited):</strong> ${editedProduct.name}
                <br><small>Batch: ${editedProduct.batch || 'N/A'} | Qty: ${editedProduct.qty}</small>
              </div>
              <div class="conflict-product-item">
                <strong>Product #2:</strong> ${duplicateProduct.name}
                <br><small>Batch: ${duplicateProduct.batch || 'N/A'} | Qty: ${duplicateProduct.qty}</small>
              </div>
              <div class="conflict-result-item" style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3);">
                <strong>If Merged:</strong> Combined Qty = <span style="color: #10b981; font-weight: 800;">${totalQty}</span>
              </div>
            </div>
          </div>
          <div class="conflict-modal-footer">
            <button class="conflict-btn cancel" id="conflict-cancel">✗ Cancel</button>
            <button class="conflict-btn remove" id="conflict-remove-1">🗑️ Remove #1</button>
            <button class="conflict-btn remove" id="conflict-remove-2">🗑️ Remove #2</button>
            <button class="conflict-btn merge" id="conflict-merge">✓ Merge Both</button>
          </div>
        </div>
      </div>
    `;

    const modalDiv = document.createElement('div');
    modalDiv.innerHTML = modalHtml;
    const overlay = modalDiv.firstElementChild;
    this.viewContainer.appendChild(overlay);

    const removeBtn1 = overlay.querySelector('#conflict-remove-1');
    const removeBtn2 = overlay.querySelector('#conflict-remove-2');
    const mergeBtn = overlay.querySelector('#conflict-merge');
    const cancelBtn = overlay.querySelector('#conflict-cancel');

    const closeModal = () => overlay.remove();

    cancelBtn.addEventListener('click', () => {
      closeModal();
      log.debug('↩️ Conflict resolution cancelled - keeping both products');
    });

    removeBtn1.addEventListener('click', () => {
      // Remove Product #1 (keep Product #2)
      this.currentBillProducts = this.currentBillProducts.filter(p => p.id !== editedProduct.id);
      closeModal();
      this.renderProductList();
      this.updateBillSummary();
      log.debug('🗑️ Product #1 removed, kept Product #2');
    });

    removeBtn2.addEventListener('click', () => {
      // Remove Product #2 (keep Product #1)
      this.currentBillProducts = this.currentBillProducts.filter(p => p.id !== duplicateProduct.id);
      closeModal();
      this.renderProductList();
      this.updateBillSummary();
      log.debug('🗑️ Product #2 removed, kept Product #1');
    });

    mergeBtn.addEventListener('click', () => {
      // Merge into Product #1 and remove Product #2
      editedProduct.qty = totalQty;
      this.currentBillProducts = this.currentBillProducts.filter(p => p.id !== duplicateProduct.id);
      closeModal();
      this.renderProductList();
      this.updateBillSummary();
      log.debug('✅ Products merged, Qty:', totalQty);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  deleteProductFromBill(productId) {
    this.currentBillProducts = this.currentBillProducts.filter(p => p.id !== productId);
    this.renderProductList();
    this.updateBillSummary();
  }

  toggleGSTReverse(productId) {
    const product = this.currentBillProducts.find(p => p.id === productId);
    if (!product) return;

    // Find the product card in the DOM
    const cardElement = document.querySelector(`.product-card[data-product-id="${productId}"]`);
    if (cardElement) {
      // Add transitioning class for frosted glass effect
      cardElement.classList.add('transitioning');
    }

    // Toggle the GST Reverse flag
    product.gst_reverse = !product.gst_reverse;
    
    log.debug(`🔀 GST Reverse toggled for product ${productId}: ${product.gst_reverse}`);

    // Re-render and recalculate
    setTimeout(() => {
      this.renderProductList();
      this.updateBillSummary();
      
      // Remove transitioning class after re-render to smoothly fade back in
      setTimeout(() => {
        const updatedCard = document.querySelector(`.product-card[data-product-id="${productId}"]`);
        if (updatedCard) {
          updatedCard.classList.remove('transitioning');
        }
      }, 50);
    }, 200);
  }

  recalculateProductFields(product, fieldChanged = null) {
    // Only recalculate rate if MRP or disc1 explicitly changed
    if ((fieldChanged === 'mrp' || fieldChanged === 'disc1') && product.mrp > 0) {
      product.rate = product.mrp - (product.mrp * (product.disc1 / 100));
    }

    // Recalculate free items if qty or scheme changed
    if (fieldChanged === 'qty' || fieldChanged === 'scheme' || !fieldChanged) {
      product.free = this.calculateFreeItems(product.qty, product.scheme);
    }

    // Synchronize tax fields (gstTotal, gst_percent, sgst, cgst)
    if (product.gstTotal !== undefined && product.gstTotal !== null && !isNaN(product.gstTotal)) {
      const totalTax = parseFloat(product.gstTotal) || 0;
      product.gst_percent = totalTax;
      product.sgst = parseFloat((totalTax / 2).toFixed(2));
      product.cgst = parseFloat((totalTax / 2).toFixed(2));
    } else if (product.gst_percent !== undefined && product.gst_percent !== null && !isNaN(product.gst_percent)) {
      const totalTax = parseFloat(product.gst_percent) || 0;
      product.gstTotal = totalTax;
      product.sgst = parseFloat((totalTax / 2).toFixed(2));
      product.cgst = parseFloat((totalTax / 2).toFixed(2));
    } else if (product.sgst !== undefined || product.cgst !== undefined) {
      const s = parseFloat(product.sgst) || 0;
      const c = parseFloat(product.cgst !== undefined ? product.cgst : s) || 0;
      product.sgst = s;
      product.cgst = c;
      product.gstTotal = parseFloat((s + c).toFixed(2));
      product.gst_percent = product.gstTotal;
    }
  }

  handleProductDatabaseUpdate(product, field, oldValue, newValue) {
    // This is now replaced by showProductMasterUpdateModal for consistency
    this.showProductMasterUpdateModal(product, field, oldValue, newValue)
      .then(updateType => {
        if (updateType === 'update-db') {
          this.updateProductDatabase(product, field, newValue);
        }
      });
  }

  checkAndHandleBatchUpdate(product, newBatchNo) {
    // Check if batch already exists via API
    if (!this.apiEnabled) {
      alert('Batch management requires API connection');
      return;
    }

    // API-based batch validation would be implemented here
    // For now, just confirm the change
    if (confirm(`Update batch to "${newBatchNo}" with MRP ₹${product.mrp}?`)) {
      product.batch = newBatchNo;
    }
  }



  calculateProductDetails(product) {
    // Use shared BillCalculator for consistent calculation logic
    return BillCalculator.calculateLineItem(product);
  }

  calculateFreeItems(qty, scheme) {
    // Use shared BillCalculator for free items calculation
    return BillCalculator.calculateFreeItems(qty, scheme);
  }

  calculateProductTotal(product) {
    const details = this.calculateProductDetails(product);
    return details.finalAmount;
  }

  updateBillSummary() {
    log.debug('📊 updateBillSummary called with', this.currentBillProducts.length, 'products');
    
    // Always recalculate using BillCalculator to ensure accuracy
    // This is more reliable than using stored amounts which might be incorrect
    const lineItems = this.currentBillProducts.map((product, idx) => {
      // Calculate each product line item
      const lineCalc = BillCalculator.calculateLineItem({
        rate: (product.rate !== undefined && product.rate !== null && !isNaN(product.rate) && Number(product.rate) > 0) ? product.rate : (product.mrp || 0),
        mrp: product.mrp || product.rate || 0,
        qty: product.qty || 1,
        disc1: product.disc1 || 0,
        disc2: product.disc2 || 0,
        sgst: product.sgst || 0,
        cgst: product.cgst || 0,
        gstTotal: product.gstTotal || 0,
        scheme: product.scheme || null,
        gst_reverse: product.gst_reverse || false
      });

      log.debug(`  Product ${idx}: name=${product.name}, amount=${lineCalc.amount.toFixed(2)}, disc1=${lineCalc.discount_1_amount.toFixed(2)}, disc2=${lineCalc.discount_2_amount.toFixed(2)}, sgst=${lineCalc.sgst_amount.toFixed(2)}, cgst=${lineCalc.cgst_amount.toFixed(2)}, final=${lineCalc.final_amount.toFixed(2)}`);

      return lineCalc;
    });

    // Calculate bill summary using BillCalculator
    const summary = BillCalculator.calculateBillSummary(lineItems);

    log.debug(`📊 Summary Results:`, {
      total_amount: summary.total_amount.toFixed(2),
      total_discount: summary.total_discount.toFixed(2),
      subtotal: summary.subtotal.toFixed(2),
      total_sgst: summary.total_sgst.toFixed(2),
      total_cgst: summary.total_cgst.toFixed(2),
      total_gst: summary.total_gst.toFixed(2),
      grand_total_unrounded: (summary.grand_total - summary.round_off).toFixed(2),
      grand_total: summary.grand_total.toFixed(2),
      round_off: summary.round_off.toFixed(2)
    });

    // Update summary sidebar with proper values
    const updateElement = (id, value) => {
      const elem = document.getElementById(id);
      if (elem) elem.textContent = value;
    };

    const productCount = this.currentBillProducts.length;
    const totalQty = lineItems.reduce((sum, item) => sum + item.qty, 0);

    updateElement('summaryProductCount', productCount);
    updateElement('summaryTotalQty', totalQty.toFixed(2));
    updateElement('summarySubtotal', '₹' + summary.total_amount.toFixed(2));
    updateElement('summaryDiscount', '₹' + summary.total_discount.toFixed(2));
    updateElement('summaryTaxable', '₹' + summary.subtotal.toFixed(2));
    updateElement('summarySGST', '₹' + summary.total_sgst.toFixed(2));
    updateElement('summaryCGST', '₹' + summary.total_cgst.toFixed(2));
    updateElement('summaryGrandTotalUnrounded', '₹' + (summary.grand_total - summary.round_off).toFixed(2));
    
    // Show rounding off if applicable
    if (Math.abs(summary.round_off) > 0.01) {
      updateElement('summaryRoundingOff', '₹' + summary.round_off.toFixed(2));
    }
    
    updateElement('summaryGrandTotal', '₹' + summary.grand_total.toFixed(2));

    // Update header stats
    updateElement('headerTotal', '₹' + summary.grand_total.toFixed(2));
    updateElement('headerItems', productCount);
  }

  async makeBill() {
    if (this.currentBillProducts.length === 0) {
      alert('Please add at least one product to the bill');
      return;
    }

    const customerName = document.getElementById('customerName').value;
    if (!customerName) {
      alert('Please enter customer name');
      return;
    }

    // Calculate totals and format products for API using BillCalculator
    const formattedProducts = this.currentBillProducts.map((product) => {
      return BillCalculator.frontendToDb(product);
    });

    // Calculate bill summary using BillCalculator
    const summary = BillCalculator.calculateBillSummary(formattedProducts);
    
    // Calculate Due Date (preserve existing due_date when editing, avoid UTC timezone shift)
    const billDateTimeVal = document.getElementById('billDateTime').value;
    let dueDateVal = (this.billDataToEdit && this.billDataToEdit.due_date) ? this.billDataToEdit.due_date : '';
    if (!dueDateVal && billDateTimeVal) {
      const invDate = new Date(billDateTimeVal);
      if (!isNaN(invDate.getTime())) {
        const dueDate = new Date(invDate);
        dueDate.setDate(dueDate.getDate() + 7);
        const y = dueDate.getFullYear();
        const m = String(dueDate.getMonth() + 1).padStart(2, '0');
        const d = String(dueDate.getDate()).padStart(2, '0');
        dueDateVal = `${y}-${m}-${d}`;
      }
    }
    const invoiceDateVal = billDateTimeVal;

    const subtotal = summary.subtotal;

    const totalDiscount = summary.total_discount;
    const totalTax = summary.total_gst;
    const roundingOff = summary.round_off;
    const grandTotal = summary.grand_total;

    // Check if we're updating an existing bill or creating a new one
    if (this.editingBillId) {
      // UPDATE MODE - Update existing bill
      const billIndex = this.billingData.bills.findIndex(b => b.id === this.editingBillId || b.bill_id === this.editingBillId);
      if (billIndex === -1) {
        alert('Error: Bill not found');
        return;
      }

      const updatedBill = {
        ...this.billingData.bills[billIndex],
        customer_name: customerName,
        bill_date: invoiceDateVal,
        due_date: dueDateVal,
        invoice_date: invoiceDateVal,

        products: formattedProducts,
        subtotal: subtotal,
        total_discount: totalDiscount,
        total_gst: totalTax,
        round_off: roundingOff,
        grand_total: grandTotal,
        previous_due: 0,
        updated_at: new Date().toISOString()
      };

      try {
        if (this.apiEnabled) {
          // Call API to update bill
          const result = await this.api.updateBill(this.editingBillId, {
            customer_name: customerName,
            invoice_no: null, // Don't change invoice number
            due_date: dueDateVal,
            invoice_date: invoiceDateVal,

            products: formattedProducts,
            subtotal: subtotal,
            total_discount: totalDiscount,
            total_gst: totalTax,
            round_off: roundingOff,
            grand_total: grandTotal,
            previous_due: 0
          });



          // Update in memory
          this.billingData.bills[billIndex] = updatedBill;

          alert(`✓ Bill Updated Successfully!\nReference No: ${this.billingData.bills[billIndex].reference_no || 'N/A'}`);

          // Reload data from API
          if (this.billingApp && this.billingApp.loadBillingDataFromAPI) {
            try {
              await this.billingApp.loadBillingDataFromAPI();
              log.debug('✅ Reloaded billing data from API after updating bill');
            } catch (e) {
              log.warn('⚠ Failed to reload billing data:', e.message);
            }
          }
        } else {
          // API is disabled
          alert('Error: Bill updates require API connection');
          throw new Error('API is disabled');
        }
      } catch (error) {
        // Bill update failed
        alert(`✗ Bill Update Failed: ${error.message}`);
        log.error('Bill update error:', error);
      }

      // Clear editing state
      this.editingBillId = null;
      this.billDataToEdit = null;
      this.switchView('existing');
    } else {
      // CREATE MODE - Create new bill
      // Server allocates reference_no atomically (no client-side generation needed)
      // Frontend sends null and backend generates GST/NGST-based ref

      const bill = {
        customer_name: customerName,
        invoice_no: null, // Server will generate this atomically
        due_date: dueDateVal,
        invoice_date: invoiceDateVal,

        products: formattedProducts,
        subtotal: subtotal,
        total_discount: totalDiscount,
        total_gst: totalTax,
        round_off: roundingOff,
        grand_total: grandTotal,
        previous_due: 0
      };



      try {
        log.debug('📝 Creating bill with products:', {
          customerName,
          productCount: formattedProducts.length,
          products: formattedProducts.map(p => ({
            name: p.product_name,
            pack_value: p.pack_value,
            pack_type: p.pack_type,
            qty: p.qty,
            variant_id: p.variant_id,
            batch_id: p.batch_id
          }))
        });

        if (this.apiEnabled) {
          // Save to backend database via API
          const result = await this.api.createBill(bill);

          const billReference = result.reference_no || result.invoice_no || 'N/A';
          const billId = result.id;
          alert(`✓ Bill Created Successfully!\nReference: ${billReference}\nBill ID: ${billId}`);

          // Store result in memory with all API fields
          const storedBill = {
            id: billId,
            invoice_no: result.invoice_no,
            reference_no: result.reference_no,
            customer_id: result.customer_id,
            customer_name: result.customer_name,
            ...bill,
            created_at: result.created_at,
            items_count: result.items_count
          };
          this.billingData.bills.push(storedBill);

          // Reload billing data from API to ensure ledger/edit views have the latest
          if (this.billingApp && this.billingApp.loadBillingDataFromAPI) {
            try {
              await this.billingApp.loadBillingDataFromAPI();
              log.debug('✅ Reloaded billing data from API after creating bill');
            } catch (e) {
              log.warn('⚠ Failed to reload billing data:', e.message);
            }
          }
        } else {
          // API is disabled - cannot create bill
          alert('Error: Bill creation requires API connection');
          throw new Error('API is disabled');
        }

        this.clearBillForm();
        this.switchView('existing'); // Show the existing bills view
      } catch (error) {
        // API failed - bill creation failed
        alert(`✗ Bill Creation Failed: ${error.message}`);
        log.error('Bill creation error:', error);
      }
    }
  }

  clearBillForm() {
    const billDateTimeInput = document.getElementById('billDateTime');
    if (billDateTimeInput) billDateTimeInput.value = this.formatDateTimeForInput(new Date());
    const customerNameInput = document.getElementById('customerName');
    if (customerNameInput) customerNameInput.value = '';
    this.currentBillProducts = [];
    this.editingBillId = null;
    this.billDataToEdit = null;
    this.renderProductList();
    this.updateBillSummary();
    this.clearProductForm();
  }

  showProductMasterUpdateModal(product, field, oldValue, newValue) {
    return new Promise((resolve) => {
      const fieldLabels = {
        'mrp': 'MRP',
        'pack': 'Pack Size',
        'batch': 'Batch Number',
        'exp': 'Expiry Date'
      };
      
      const fieldName = fieldLabels[field] || field;
      const modal = document.createElement('div');
      modal.className = 'mrp-update-modal-overlay'; // Reusing existing class for styling
      modal.innerHTML = `
        <div class="mrp-update-modal">
          <div class="mrp-modal-header">
            <h3>Update Product Master</h3>
            <button class="mrp-modal-close">&times;</button>
          </div>
          <div class="mrp-modal-body">
            <p class="mrp-product-name">${product.name || 'Product'}</p>
            <p class="mrp-batch-info">Updating <span style="color: var(--accent-green); font-weight: 800;">${fieldName}</span></p>
            <div class="mrp-change-info">
              <div class="mrp-old">
                <label>Current Value:</label>
                <div class="mrp-value">${field === 'mrp' ? '₹' : ''}${oldValue}</div>
              </div>
              <div class="mrp-arrow">→</div>
              <div class="mrp-new">
                <label>New Value:</label>
                <div class="mrp-value">${field === 'mrp' ? '₹' : ''}${newValue}</div>
              </div>
            </div>
            <p class="mrp-question">Do you want to update this in the Product Database permanently or use it once for this bill?</p>
          </div>
          <div class="mrp-modal-footer">
            <button class="btn-mrp-one-time">One Time Only</button>
            <button class="btn-mrp-update-db">Update in Master</button>
            <button class="btn-mrp-cancel">Cancel Change</button>
          </div>
        </div>
      `;

      this.viewContainer.appendChild(modal);

      const btnOneTime = modal.querySelector('.btn-mrp-one-time');
      const btnUpdateDB = modal.querySelector('.btn-mrp-update-db');
      const btnCancel = modal.querySelector('.btn-mrp-cancel');
      const closeBtn = modal.querySelector('.mrp-modal-close');

      const cleanup = () => modal.remove();

      btnOneTime.addEventListener('click', () => {
        cleanup();
        resolve('one-time');
      });

      btnUpdateDB.addEventListener('click', () => {
        cleanup();
        resolve('update-db');
      });

      btnCancel.addEventListener('click', () => {
        cleanup();
        resolve('cancel');
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          cleanup();
          resolve('cancel');
        }
      });
    });
  }

  showMRPUpdateModal(product, oldMRP, newMRP) {
    // Backward compatibility - redirect to generic modal
    return this.showProductMasterUpdateModal(product, 'mrp', oldMRP, newMRP);
  }

  async updateProductDatabase(product, field, newValue) {
    if (!this.apiEnabled) {
      alert('Product database updates require API connection');
      return;
    }

    try {
      log.debug(`🔄 Updating product master: ${field} -> ${newValue}`, product);
      
      // Get IDs
      let variantId = product.variant_id || (this.currentProduct?.variant_id);
      let batchId = product.batch_id || (this.currentProduct?.batch_id);
      let batchNo = product.batch || product.batch_no || (this.currentProduct?.batch_no);
      let productId = product.product_id || (this.currentProduct?.id);

      // Check if we need to REPAIR the product metadata first
      if (!variantId || !batchNo) {
        log.warn('⚠ Missing critical metadata for product update. Triggering Repair Modal...');
        const repairData = await this.showRepairProductMetadataModal(product);
        
        if (!repairData) {
          log.debug('❌ Repair cancelled by user.');
          return;
        }

        // CREATE missing metadata via API
        if (!variantId) {
          log.debug('🆕 Creating new variant...');
          const varRes = await fetch('/api/products/variants', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              product_id: productId,
              pack_size_value: repairData.pack_value,
              pack_size_type: repairData.pack_type
            })
          });
          if (!varRes.ok) throw new Error('Failed to create variant');
          const varData = await varRes.json();
          variantId = varData.id;
          log.debug('✅ Variant created:', variantId);
        }

        if (!batchId || !batchNo) {
          log.debug('🆕 Creating new batch...');
          const batRes = await fetch('/api/products/batches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              variant_id: variantId,
              batch_no: repairData.batch_no,
              mrp: product.mrp || 0
            })
          });
          if (!batRes.ok) throw new Error('Failed to create batch');
          const batData = await batRes.json();
          batchId = batData.id;
          batchNo = repairData.batch_no;
          log.debug('✅ Batch created:', batchId);
        }

        // Update local object and currentProduct for subsequent use
        if (this.currentProduct) {
          this.currentProduct.variant_id = variantId;
          this.currentProduct.batch_id = batchId;
          this.currentProduct.batch_no = batchNo;
        }
        product.variant_id = variantId;
        product.batch_id = batchId;
        product.batch = batchNo;
      }

      // Now proceed with the original update
      if (field === 'mrp') {
        await this.updateMRPinDatabase(product, newValue);
      } else if (field === 'pack') {
        if (variantId) {
          await this.api.updateVariant(variantId, {
            pack_size_value: newValue
          });
          alert(`✓ Pack size updated in database to ${newValue}`);
        }
      } else if (field === 'batch') {
        if (batchId) {
          await this.api.updateBatch(batchId, {
            batch_no: newValue
          });
          alert(`✓ Batch number updated in database to ${newValue}`);
        }
      }
    } catch (error) {
      log.error('❌ Failed to update product database:', error);
      alert(`Failed to update database: ${error.message}`);
    }
  }

  showRepairProductMetadataModal(product) {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'mrp-update-modal-overlay';
      modal.innerHTML = `
        <div class="mrp-update-modal">
          <div class="mrp-modal-header">
            <h3>Complete Product Setup</h3>
            <button class="mrp-modal-close">&times;</button>
          </div>
          <div class="mrp-modal-body">
            <p class="mrp-product-name">${product.name || 'Product'}</p>
            <p style="margin-bottom: 20px; font-size: 0.9em; opacity: 0.8;">
              This product is missing variant or batch details in the master database. 
              Please define them now to complete the update.
            </p>
            
            <div class="form-group" style="margin-bottom: 15px;">
              <label style="display: block; margin-bottom: 5px; font-size: 0.85em;">Pack Size (Value)</label>
              <input type="text" id="repairPackValue" class="form-input" placeholder="e.g. 10x10, 100, 1" value="${product.pack_value || ''}">
            </div>
            
            <div class="form-group" style="margin-bottom: 15px;">
              <label style="display: block; margin-bottom: 5px; font-size: 0.85em;">Pack Type</label>
              <select id="repairPackType" class="form-input">
                <option value="ML" ${product.pack_type === 'ML' ? 'selected' : ''}>ML (Milliliter)</option>
                <option value="GMS" ${product.pack_type === 'GMS' ? 'selected' : ''}>GMS (Gram/Weight)</option>
                <option value="TAB" ${product.pack_type === 'TAB' ? 'selected' : ''}>TAB (Tablet/Capsule)</option>
                <option value="L" ${product.pack_type === 'L' ? 'selected' : ''}>L (Liter)</option>
                <option value="KG" ${product.pack_type === 'KG' ? 'selected' : ''}>KG (Kilogram)</option>
              </select>
            </div>
            
            <div class="form-group" style="margin-bottom: 20px;">
              <label style="display: block; margin-bottom: 5px; font-size: 0.85em;">Batch Number</label>
              <input type="text" id="repairBatchNo" class="form-input" placeholder="e.g. BATCH-001" value="${product.batch || ''}">
            </div>
          </div>
          <div class="mrp-modal-footer">
            <button class="btn-mrp-cancel">Cancel</button>
            <button class="btn-mrp-update-db" style="background: var(--accent-green);">Save & Continue</button>
          </div>
        </div>
      `;

      this.viewContainer.appendChild(modal);

      const btnSave = modal.querySelector('.btn-mrp-update-db');
      const btnCancel = modal.querySelector('.btn-mrp-cancel');
      const closeBtn = modal.querySelector('.mrp-modal-close');

      const cleanup = () => modal.remove();

      btnSave.addEventListener('click', () => {
        const pack_value = document.getElementById('repairPackValue').value.trim();
        const pack_type = document.getElementById('repairPackType').value;
        const batch_no = document.getElementById('repairBatchNo').value.trim();

        if (!pack_value || !batch_no) {
          alert('Pack Value and Batch Number are required');
          return;
        }

        cleanup();
        resolve({ pack_value, pack_type, batch_no });
      });

      btnCancel.addEventListener('click', () => {
        cleanup();
        resolve(null);
      });

      closeBtn.addEventListener('click', () => {
        cleanup();
        resolve(null);
      });
    });
  }

  async updateMRPinDatabase(product, newMRP) {
    try {
      const batch = product.batch || product.batch_no || (this.currentProduct?.batch_no);
      const variantId = product.variant_id || (this.currentProduct?.variant_id);
      
      if (!batch || !variantId) {
        alert('Cannot update MRP: Batch info or Variant ID missing');
        return;
      }

      // Use the correct API endpoint as confirmed in routes.js
      // POST /api/products/update-mrp expects { product_id, variant_id, batch_no, mrp }
      const response = await fetch('/api/products/update-mrp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          product_id: product.product_id || (this.currentProduct?.id),
          variant_id: variantId,
          batch_no: batch,
          mrp: parseFloat(newMRP)
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const result = await response.json();
      log.debug('✅ MRP updated in database:', result);
      alert(`✓ MRP updated in database for batch ${batch}`);
    } catch (error) {
      log.error('❌ Failed to update MRP in database:', error);
      alert(`Failed to update MRP in database: ${error.message}`);
    }
  }
}

// Export to global scope
window.BillEditor = BillEditor;

