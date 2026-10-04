const log = (typeof window !== 'undefined' && window.MacOSLogger) ? window.MacOSLogger.createScope('Billing:EditBills') : { debug: () => {}, info: () => {}, warn: console.warn.bind(console), error: console.error.bind(console) };

/**
 * EditBillsPayments Module
 * Handles editing existing bills and managing payment records
 * Uses BillCalculator for consistent calculation logic
 * 
 * Features:
 * - Edit bill details and items
 * - Update payment information
 * - Track payment status
 * - Manage bill amendments
 */

class EditBillsPayments {
    showNotification(message, type = 'info') {
    if (this.billingApp?.showNotification) {
      return this.billingApp.showNotification(message, type);
    }
    if (typeof window !== 'undefined' && window.MacOSNotificationManager) {
      return window.MacOSNotificationManager.notify({
        app: 'Billing',
        title: 'Edit Bills',
        message: message,
        type: type
      });
    }
    if (typeof window !== 'undefined' && window.showNotification) {
      return window.showNotification(message, type, { app: 'Billing', title: 'Edit Bills' });
    }
  }

  constructor(billingApp) {
    this.billingApp = billingApp;
    this._viewContainer = null;
    this.api = billingApp.api;
    this.apiEnabled = billingApp.apiEnabled;
    this.currentBillId = null;
    this.currentPaymentId = null;
    
    // Edit mode properties
    this.editListItems = [];
    this.editBillProducts = [];
    this.currentEditProduct = null;
    this.isSelectingVariant = false;  // Flag to prevent variant modal re-open glitch
    this.isVariantModalOpen = false;  // Flag to check if variant modal is currently visible
    this.autoFillDebounceTimer = null;  // Debounce timer for autoFillProductDetails
  }

  get viewContainer() {
    return this._viewContainer || (this.billingApp?.getOrCreateSubviewPanel ? this.billingApp.getOrCreateSubviewPanel('edit') : this.billingApp.viewContainer);
  }
  set viewContainer(val) {
    this._viewContainer = val;
  }

  /**
   * Get API base URL - works for both dev and prod
   */
  getApiBaseUrl() {
    // Check if API base URL is configured in billingApp
    if (this.billingApp?.apiBaseUrl) {
      return this.billingApp.apiBaseUrl;
    }

    // Default: same-origin. API calls should use relative /api and be proxied by:
    // - Vite dev server proxy in development
    // - Production frontend server proxy in production
    return window.location.origin;
  }

  /**
   * Format a date for <input type="date"> (YYYY-MM-DD)
  parseDateSafe(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
    if (typeof dateInput === 'string') {
      const str = dateInput.trim();
      const dmy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
      if (dmy) {
        const day = parseInt(dmy[1], 10);
        const month = parseInt(dmy[2], 10) - 1;
        const year = parseInt(dmy[3], 10);
        const hours = dmy[4] ? parseInt(dmy[4], 10) : 12;
        const mins = dmy[5] ? parseInt(dmy[5], 10) : 0;
        return new Date(year, month, day, hours, mins);
      }
      const ymd = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
      if (ymd) {
        const year = parseInt(ymd[1], 10);
        const month = parseInt(ymd[2], 10) - 1;
        const day = parseInt(ymd[3], 10);
        const hours = ymd[4] ? parseInt(ymd[4], 10) : 12;
        const mins = ymd[5] ? parseInt(ymd[5], 10) : 0;
        return new Date(year, month, day, hours, mins);
      }
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Format a date for <input type="date"> (YYYY-MM-DD)
   * Ensures local time is used to avoid UTC shifts
   */
  formatDateForInput(dateInput) {
    if (!dateInput) return '';
    const date = this.parseDateSafe(dateInput);
    if (!date) return '';
    
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
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateInput.trim())) {
      return dateInput.trim().slice(0, 16);
    }
    const date = this.parseDateSafe(dateInput);
    if (!date) return '';
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  async fetchCustomersList() {
    try {
      const scoped = this.billingApp?.getScopedBillingData ? this.billingApp.getScopedBillingData() : null;
      if (scoped && scoped.contacts && scoped.contacts.length > 0) {
        return scoped.contacts;
      }
      const response = await fetch('/api/contacts');
      if (response.ok) {
        const result = await response.json();
        const normalized = Array.isArray(result)
          ? result
          : (Array.isArray(result?.items) ? result.items : (Array.isArray(result?.data?.items) ? result.data.items : (Array.isArray(result?.data) ? result.data : [])));
        return normalized;
      }
      return [];
    } catch (e) {
      log.error('Error fetching customers in EditBillsPayments:', e);
      return [];
    }
  }

  async fetchProductsList() {
    try {
      const response = await fetch('/api/products');
      if (response.ok) {
        const result = await response.json();
        const normalized = Array.isArray(result)
          ? result
          : (Array.isArray(result?.items) ? result.items : (Array.isArray(result?.data?.items) ? result.data.items : (Array.isArray(result?.data) ? result.data : [])));
        return normalized;
      }
      return [];
    } catch (e) {
      log.error('Error fetching products in EditBillsPayments:', e);
      return [];
    }
  }

  /**
   * Enrich normalized bill data with API metadata (contacts, products, preferences)
   * Makes edit page identical to new bill page by fetching all related data
   */
  async enrichBillDataWithAPIMetadata(billData) {
    try {
      log.debug('🔄 Enriching bill data with API metadata...');

      // Fetch all customers and products once
      const [customers, products] = await Promise.all([
        this.fetchCustomersList(),
        this.fetchProductsList()
      ]);

      // Lookup customer by ID and get full details from contacts table
      if (billData.customer_id) {
        log.debug('🔍 Looking up customer ID:', billData.customer_id);
        const customer = customers.find(c => c.id === billData.customer_id);
        if (customer) {
          billData.customer_name = customer.name || customer.customer_name || customer.first_name || '';
          log.debug('✅ Customer found in contacts:', {
            id: billData.customer_id,
            name: billData.customer_name,
            phone: customer.phone
          });
        } else {
          log.warn('⚠️ Customer ID not found in contacts table:', billData.customer_id);
        }
      } else {
        log.debug('⚠️ No customer_id in bill data, using existing customer_name:', billData.customer_name);
      }

      // If we have products for this invoice, enrich each with full product details
      if (billData.products && billData.products.length > 0) {
        billData.products = billData.products.map(item => {
          // Find matching product from API
          const apiProduct = products.find(p => 
            p.name.toLowerCase() === (item.name || '').toLowerCase() ||
            p.id === item.product_id
          );

          // Augment item with full API product details
          if (apiProduct) {
            return {
              ...item,
              name: apiProduct.name || item.name,
              pack: item.pack || apiProduct.pack_value || '',
              pack_type: item.pack_type || apiProduct.pack_type || '',
              mrp: item.mrp || parseFloat(apiProduct.mrp || 0),
              product_id: item.product_id || apiProduct.id,
              variant_id: item.variant_id || apiProduct.variant_id,
              batch_id: item.batch_id || apiProduct.batch_id,
              isGold: item.isGold || (apiProduct.classification?.toLowerCase() === 'gold'),
              has_multiple_variants: apiProduct.variants && Array.isArray(apiProduct.variants) && apiProduct.variants.length > 1
            };
          }
          
          return {
            ...item,
            has_multiple_variants: item.has_multiple_variants || false
          };
        });
      }

      log.debug('✅ Bill data enriched with metadata:', {
        customersAvailable: customers.length,
        productsAvailable: products.length,
        enrichedProducts: billData.products.length,
        customer: billData.customer_name,
        customerId: billData.customer_id
      });

      return billData;
    } catch (error) {
      log.error('Error enriching bill data:', error);
      // Return enriched data anyway - don't fail
      return billData;
    }
  }

  /**
   * Normalize and validate bill data from API for consistent field mapping
   * Maps database fields to frontend form field expectations
   */
  normalizeBillDataFromAPI(apiResponse) {
    // Extract from nested response if needed
    let billData = apiResponse.data || apiResponse;
    
    if (!billData) {
      log.warn('⚠️ Bill data is empty');
      return null;
    }

    // Ensure we have an ID for edit mode detection
    billData.id = billData.id || billData.bill_id || billData.invoice_id;
    
    // Capture customer ID for lookup in contacts table
    billData.customer_id = billData.customer_id || billData.customerId || null;
    
    // Normalize customer name field - try multiple variants
    billData.customer_name = billData.customer_name || billData.customer || billData.customerName || '';
    
    log.debug('📋 API Response customer fields:', {
      raw_customer_id: apiResponse.customer_id,
      raw_customerId: apiResponse.customerId,
      raw_customer_name: apiResponse.customer_name,
      raw_customer: apiResponse.customer,
      raw_customerName: apiResponse.customerName,
      normalized_customer_id: billData.customer_id,
      normalized_customer_name: billData.customer_name
    });
    
    // Normalize bill date field (strictly prioritize invoice_date over created_at)
    billData.bill_date = billData.invoice_date || billData.bill_date || billData.created_at || this.formatDateTimeForInput(new Date());
    
    // Normalize items to products for BillEditor
    if (!billData.products && billData.items) {
      billData.products = billData.items;
    }
    if (!billData.products) {
      billData.products = [];
    }

    // Ensure each product has required fields for rendering
    billData.products = billData.products.map(item => ({
      // ID fields
      id: item.id || item.item_id || Date.now(),
      product_id: item.product_id,
      
      // Basic info
      name: item.product_name || item.name || '',
      pack: item.pack_value || item.pack || '',
      pack_type: item.pack_type || '',
      batch: item.batch_no || item.batch || '',
      exp: item.exp_date || item.exp || '',
      
      // Pricing
      mrp: parseFloat(item.mrp || 0),
      rate: parseFloat(item.rate || 0),
      qty: parseInt(item.quantity || 0),
      free: parseInt(item.free || 0),
      
      // Discounts (as percentages from API)
      disc1: parseFloat(item.discount_1 || item.disc1 || 0),
      disc2: parseFloat(item.discount_2 || item.disc2 || 0),
      
      // Taxes (as percentages)
      sgst: parseFloat(item.sgst_percent || item.sgst || 0),
      cgst: parseFloat(item.cgst_percent || item.cgst || 0),
      gstTotal: parseFloat(item.gst_percent || item.gstTotal || 0),
      
      // Scheme
      scheme: item.scheme || '',
      
      // Pre-calculated amounts from database (for detecting edit mode in summary)
      amount: parseFloat(item.amount || 0),
      discount_1_amount: parseFloat(item.discount_1_amount || 0),
      discount_2_amount: parseFloat(item.discount_2_amount || 0),
      gst_amount: parseFloat(item.gst_amount || 0),
      sgst_amount: parseFloat(item.sgst_amount || 0),
      cgst_amount: parseFloat(item.cgst_amount || 0),
      final_amount: parseFloat(item.final_amount || 0),
      
      // Database fields
      variant_id: item.variant_id,
      batch_id: item.batch_id,
      isGold: item.is_gold === true || item.is_gold === 1 || item.is_gold === '1' || item.isGold === true || String(item.classification).toLowerCase() === 'gold' || false,
      
      // GST Reverse flag
      gst_reverse: item.gst_reverse || false
    }));

    log.debug('✅ Bill data normalized successfully:', {
      id: billData.id,
      customer: billData.customer_name,
      billDate: billData.bill_date,
      itemsCount: billData.products.length,
      total: billData.total || billData.grand_total
    });

    return billData;
  }

  /**
   * Load customer product preferences (same as new-bill.js)
   * Fetches saved discount and scheme preferences for a customer-product combination
   */
  async loadProductMemoryForCustomer(productName, customerName) {
    if (!productName || !customerName) return;

    try {
      const apiUrl = `${this.getApiBaseUrl()}/api/billing/preference/${encodeURIComponent(customerName)}/${encodeURIComponent(productName)}`;
      const response = await fetch(apiUrl);
      
      if (response.ok) {
        const result = await response.json();
        
        if (result.status === 'success' && result.data) {
          const memory = result.data;
          
          // Auto-fill with saved customer preferences
          const disc1Input = document.getElementById('productDisc1');
          const disc2Input = document.getElementById('productDisc2');
          const schemeSelect = document.getElementById('productScheme');
          const taxSelect = document.getElementById('productTax');

          if (disc1Input) disc1Input.value = memory.disc1 || '';
          if (disc2Input) disc2Input.value = memory.disc2 || '';
          if (schemeSelect) schemeSelect.value = memory.scheme || '';
          if (taxSelect) taxSelect.value = memory.tax || '0';

          // Show custom scheme field if needed
          const customSchemeContainer = document.getElementById('customSchemeContainer');
          if (customSchemeContainer) {
            customSchemeContainer.style.display = memory.scheme === 'custom' ? 'flex' : 'none';
          }

          log.debug('✅ Loaded customer preferences from API:', memory);
          return;
        }
      }
    } catch (error) {
      log.error('Error loading customer preferences:', error);
    }

    // If no preferences found, set defaults
    this.setDefaultPreferenceValues();
  }

  /**
   * Set default preference values (same as new-bill.js)
   */
  setDefaultPreferenceValues() {
    const disc1Input = document.getElementById('productDisc1');
    const disc2Input = document.getElementById('productDisc2');
    const schemeSelect = document.getElementById('productScheme');
    const taxSelect = document.getElementById('productTax');
    
    if (disc1Input && disc1Input.value === '') disc1Input.value = '0';
    if (disc2Input && disc2Input.value === '') disc2Input.value = '0';
    if (schemeSelect && schemeSelect.value === '') schemeSelect.value = '';
    if (taxSelect && taxSelect.value === '') taxSelect.value = '0';
  }

  /**
   * Fetch customer contacts list from API (same as new-bill.js)
   */
  async fetchCustomersList() {
    try {
      const apiUrl = `${this.getApiBaseUrl()}/api/contacts`;
      const response = await fetch(apiUrl);
      
      if (response.ok) {
        const result = await response.json();
        const customers = result.data || result;
        
        if (Array.isArray(customers) && customers.length > 0) {
          return customers;
        }
      }
    } catch (error) {
      log.error('Error loading customers list:', error);
    }
    return [];
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

  /**
   * Fetch products list from API (same as new-bill.js)
   */
  async fetchProductsList(search = '') {
    try {
      const trimmed = (search || '').trim();
      const apiUrl = `${this.getApiBaseUrl()}/api/products${trimmed ? `?search=${encodeURIComponent(trimmed)}` : ''}`;
      const response = await fetch(apiUrl);
      
      if (response.ok) {
        const result = await response.json();
        const products = this.normalizeProducts(result);
        
        if (Array.isArray(products) && products.length > 0) {
          return products;
        }
      }
    } catch (error) {
      log.error('Error loading products list:', error);
    }
    return [];
  }

  /**
   * Auto-fill product details from API (same as new-bill.js)
   */
  async autoFillProductDetailsFromAPI(productName) {
    if (!productName) return null;

    try {
      const trimmed = productName.trim();
      const apiUrl = `${this.getApiBaseUrl()}/api/products?search=${encodeURIComponent(trimmed)}`;
      const response = await fetch(apiUrl);
      
      if (response.ok) {
        const result = await response.json();
        const products = this.normalizeProducts(result);
        
        if (Array.isArray(products) && products.length > 0) {
          // Check exact match first, then Rust WASM top fuzzy match, or top returned product
          let product = products.find(p => p.name.toLowerCase() === trimmed.toLowerCase());
          if (!product && typeof window !== 'undefined' && window.SuiteCoreBridge && window.SuiteCoreBridge.isWasmLoaded()) {
            try {
              const fuzzyRanked = window.SuiteCoreBridge.searchCatalog(trimmed, products, { limit: 1, min_score: 25.0 });
              if (fuzzyRanked && fuzzyRanked.length > 0) {
                product = fuzzyRanked[0];
              }
            } catch (_) {}
          }
          if (!product) {
            product = products[0];
          }
          if (product) {
            log.debug('✅ Auto-filled product details from API:', product);
            return product;
          }
        }
      }
    } catch (error) {
      log.error('Error auto-filling product details:', error);
    }
    return null;
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

    const modalHtml = `
      <div id="variantSelectorModal" class="variant-modal-overlay">
        <div class="variant-modal">
          <div class="variant-modal-header">
            <h3>📦 Select Product Variant</h3>
            <button class="variant-modal-close" id="variant-close-btn">×</button>
          </div>
          <div class="variant-modal-body">
            <div class="variant-list">
              ${variants.map((v, idx) => `
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
    this.variantsToSelect = variants;

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
          
          // CRITICAL: Update master reference metadata
          if (this.currentEditProduct) {
            this.currentEditProduct.variant_id = selectedVariant.id || null;
            
            const selectedBatch = selectedVariant.batches && selectedVariant.batches[batchIdx] ? selectedVariant.batches[batchIdx] : null;
            if (selectedBatch) {
              this.currentEditProduct.mrp = selectedBatch.mrp;
              this.currentEditProduct.batch_no = selectedBatch.batch_no || selectedBatch.batchNo;
            }
            this.currentEditProduct.pack_size_value = selectedVariant.pack_size_value;
            this.currentEditProduct.pack_size_type = selectedVariant.pack_size_type;
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
      this.showNotification('Please select a variant', 'warning');
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
  }

  /**
   * Render the edit bills and payments interface
   */
  render() {
    this.viewContainer.innerHTML = `
      <div class="edit-bills-payments-container">
        <div class="edit-bills-tabs">
          <button class="tab-btn active" data-tab="edit-bills">Edit Existing Bills</button>
          <button class="tab-btn" data-tab="payment-management">Payment Management</button>
        </div>

        <!-- Edit Bills Tab -->
        <div id="edit-bills-tab" class="tab-content active">
          <div class="edit-bills-search">
            <input type="text" id="billSearch" placeholder="Search by bill number or customer..." class="form-input">
            <button class="btn btn-primary" id="searchBillsBtn">Search</button>
          </div>
          <div id="billsList" class="bills-list">
            <p style="color: #999; text-align: center; padding: 32px;">Enter search criteria to find bills</p>
          </div>
        </div>

        <!-- Payment Management Tab -->
        <div id="payment-management-tab" class="tab-content">
          <div class="payment-search">
            <input type="text" id="paymentSearch" placeholder="Search payments..." class="form-input">
            <button class="btn btn-primary" id="searchPaymentsBtn">Search</button>
          </div>
          <div id="paymentsList" class="payment-list">
            <p style="color: #999; text-align: center; padding: 32px;">No payments found</p>
          </div>
        </div>
      </div>

      <!-- Edit Bill Modal -->
      <div id="editBillModal" class="modal" style="display: none;">
        <div class="modal-content">
          <div class="modal-header">
            <h3>Edit Bill</h3>
            <button class="modal-close" id="closeEditBillModal">&times;</button>
          </div>
          <div id="editBillForm" class="bill-edit-form">
            <!-- Form will be populated dynamically -->
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="cancelEditBillBtn">Cancel</button>
            <button class="btn btn-success" id="saveEditBillBtn">Save Changes</button>
          </div>
        </div>
      </div>

      <!-- Edit Payment/Credit Note Modal -->
      <div id="editPaymentModal" class="edit-modal-overlay hidden">
        <div class="edit-modal">
          <div class="edit-modal-header">
            <h3 id="editModalTitle">Edit Payment</h3>
            <button class="edit-modal-close" onclick="this.closest('.edit-modal-overlay').classList.add('hidden')">×</button>
          </div>
          <div class="edit-modal-body">
            <div class="edit-modal-info">
              <div style="margin-bottom: 12px;">
                <strong>Customer Name:</strong>
                <span id="editCustomerName" style="font-weight: normal; color: #1f2937;"></span>
              </div>
              <div>
                <strong>Transaction ID:</strong>
                <span id="editTransactionId"></span>
              </div>
            </div>

            <div id="editPaymentFields">
              <!-- Payment fields -->
              <div class="edit-form-group">
                <label>Amount *</label>
                <input type="number" id="editAmount" step="0.01" min="0" placeholder="0.00">
              </div>

              <div class="edit-form-row">
                <div class="edit-form-group">
                  <label>Payment Method</label>
                  <select id="editPaymentMethod">
                    <option value="">Select method</option>
                    <option value="cash">💵 Cash</option>
                    <option value="cheque">🏦 Cheque</option>
                    <option value="bank-transfer">🏧 Bank Transfer</option>
                    <option value="online">💻 Online Payment</option>
                    <option value="upi">📱 UPI</option>
                    <option value="card">💳 Card</option>
                    <option value="other">📝 Other</option>
                  </select>
                </div>
                <div class="edit-form-group">
                  <label>Payment Date</label>
                  <input type="date" id="editPaymentDate">
                </div>
              </div>

              <div class="edit-form-group">
                <label>Reference Number</label>
                <input type="text" id="editReference" placeholder="Transaction ID, Cheque #, etc.">
              </div>

              <div class="edit-form-group">
                <label>Notes</label>
                <textarea id="editPaymentNotes" placeholder="Add any special notes..."></textarea>
              </div>
            </div>

            <div id="editCreditNoteFields" style="display: none;">
              <!-- Credit note fields -->
              <div class="edit-form-group">
                <label>Credit Amount *</label>
                <input type="number" id="editCreditAmount" step="0.01" min="0" placeholder="0.00">
              </div>

              <div class="edit-form-group">
                <label>Reason</label>
                <select id="editCreditReason">
                  <option value="">-- Select reason --</option>
                  <option value="overpayment">↩️ Overpayment/Refund</option>
                  <option value="product-return">📦 Product Return</option>
                  <option value="discount">🏷️ Discount Adjustment</option>
                  <option value="damage">⚠️ Damaged/Defective</option>
                  <option value="billing-error">❌ Billing Error</option>
                  <option value="other">📝 Other</option>
                </select>
              </div>

              <div class="edit-form-group">
                <label>Credit Date</label>
                <input type="date" id="editCreditDate">
              </div>

              <div class="edit-form-group">
                <label>Notes</label>
                <textarea id="editCreditNotes" placeholder="Add any special notes..."></textarea>
              </div>

              <div class="edit-form-group">
                <label>Attachment (Image)</label>
                <input type="file" id="editCreditAttachment" accept="image/jpeg, image/png, image/webp" style="display: none;">
                <button type="button" id="editCreditAttachmentBtn" class="btn btn-secondary-enhanced" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px; padding: 10px; border: 1px dashed #999; background: #f9fafb; cursor: pointer; border-radius: 4px; color: #374151;">
                  <span style="font-size: 16px;">📎</span> <span>Choose Image</span>
                </button>
                <div style="font-size: 11px; color: #666; margin-bottom: 8px;">Max size: 5MB. JPG, PNG, WEBP allowed.</div>
                
                <div id="editAttachmentPreviewContainer" style="display: none; position: relative; max-width: 200px; margin-top: 8px;">
                  <img id="editAttachmentPreviewImg" src="" style="width: 100%; border-radius: 4px; border: 1px solid #ddd; display: block;">
                  <button id="editRemoveAttachmentBtn" type="button" style="position: absolute; top: -8px; right: -8px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">✕</button>
                </div>
                <input type="hidden" id="existingCreditAttachment">
              </div>
            </div>
          </div>
          <div class="edit-modal-footer">
            <button class="btn btn-secondary" onclick="this.closest('.edit-modal-overlay').classList.add('hidden')">← Back</button>
            <button class="btn btn-success" id="savePaymentEditBtn">✓ Update</button>
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  /**
   * Attach event listeners for tab switching and search
   */
  attachEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tabName = e.target.dataset.tab;
        this.switchTab(tabName);
      });
    });

    // Search bills
    document.getElementById('searchBillsBtn')?.addEventListener('click', () => {
      this.searchAndDisplayBills();
    });

    // Search payments
    document.getElementById('searchPaymentsBtn')?.addEventListener('click', () => {
      this.searchAndDisplayPayments();
    });

    // Modal controls
    document.getElementById('closeEditBillModal')?.addEventListener('click', () => {
      this.closeEditBillModal();
    });

    document.getElementById('cancelEditBillBtn')?.addEventListener('click', () => {
      this.closeEditBillModal();
    });

    document.getElementById('saveEditBillBtn')?.addEventListener('click', () => {
      this.saveEditedBill();
    });

    // Payment/Credit Note Modal Update Button
    document.getElementById('savePaymentEditBtn')?.addEventListener('click', () => {
      this.savePaymentEdit();
    });

    // Modal close on overlay click
    const editModal = document.getElementById('editPaymentModal');
    if (editModal) {
      editModal.addEventListener('click', (e) => {
        if (e.target === editModal) {
          editModal.classList.add('hidden');
        }
      });
    }

    // Store reference to this module for global access
    window.currentEditBillsPaymentsModule = this;
    window.currentEditBillEditor = this;  // For variant selector compatibility
  }

  /**
   * Switch between tabs
   */
  switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
      tab.classList.remove('active');
    });

    // Deactivate all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });

    // Show selected tab
    const tabElement = document.getElementById(`${tabName}-tab`);
    if (tabElement) {
      tabElement.classList.add('active');
    }

    // Activate selected button
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
  }

  /**
   * Search and display bills
   */
  searchAndDisplayBills() {
    const searchQuery = document.getElementById('billSearch')?.value || '';
    const apiUrl = `${this.getApiBaseUrl()}/api/billing/invoices/invoices`;
    
    fetch(apiUrl)
      .then(response => response.json())
      .then(bills => {
        const filtered = bills.filter(bill => {
          const billNum = (bill.bill_number || bill.reference_no || '').toLowerCase();
          const customer = (bill.customer_name || bill.customer || '').toLowerCase();
          const query = searchQuery.toLowerCase();
          return billNum.includes(query) || customer.includes(query);
        });

        const billsList = document.getElementById('billsList');
        if (filtered.length === 0) {
          billsList.innerHTML = '<p style="color: #999; text-align: center; padding: 32px;">No bills found</p>';
          return;
        }

        billsList.innerHTML = filtered.map(bill => {
          const auditInfo = JSON.stringify({
            type: 'Invoice',
            id: bill.id,
            name: `Invoice ${bill.bill_number || bill.reference_no || bill.id} (${bill.customer_name || bill.customer || 'Customer'})`,
            created_by_role: bill.created_by_role,
            created_by_name: bill.created_by_name,
            last_edited_by_role: bill.last_edited_by_role,
            last_edited_by_name: bill.last_edited_by_name,
            date: bill.invoice_date || bill.bill_date || bill.created_at,
            created_at: bill.created_at
          });
          return `
          <div class="bill-item" data-worker-audit='${auditInfo.replace(/'/g, "&#39;")}'>
            <div class="bill-info">
              <div className="bill-number">${bill.bill_number || bill.reference_no || 'N/A'}</div>
              <div class="bill-customer">${bill.customer_name || bill.customer || 'Unknown'}</div>
              <div class="bill-amount">₹${(bill.total || 0).toFixed(2)}</div>
            </div>
            <div class="bill-status">
              <span class="status-badge ${bill.status || ''}">${bill.status || 'pending'}</span>
            </div>
            <button class="btn btn-small btn-edit" data-bill-id="${bill.id}">Edit</button>
          </div>
        `;
        }).join('');

        document.querySelectorAll('.btn-edit').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const billId = e.target.dataset.billId;
            this.openEditBillModal(billId);
          });
        });
      })
      .catch(error => {
        log.error('Error fetching bills:', error);
        document.getElementById('billsList').innerHTML = '<p style="color: #999; text-align: center; padding: 32px;">Error loading bills</p>';
      });
  }

  /**
   * Search and display payments
   */
  searchAndDisplayPayments() {
    const searchQuery = document.getElementById('paymentSearch')?.value || '';
    const apiUrl = `${this.getApiBaseUrl()}/api/billing/invoices/payments`;
    
    fetch(apiUrl)
      .then(response => response.json())
      .then(payments => {
        const filtered = payments.filter(payment => {
          const customer = (payment.customer_name || payment.customer || '').toLowerCase();
          const ref = (payment.reference_number || payment.reference || '').toLowerCase();
          const query = searchQuery.toLowerCase();
          return customer.includes(query) || ref.includes(query);
        });

        const paymentsList = document.getElementById('paymentsList');
        if (filtered.length === 0) {
          paymentsList.innerHTML = '<p style="color: #999; text-align: center; padding: 32px;">No payments found</p>';
          return;
        }

        const methodIcon = {
          'cash': '💵',
          'cheque': '🏦',
          'bank-transfer': '🏧',
          'online': '💻',
          'upi': '📱',
          'card': '💳'
        };

        const reasonIcon = {
          'overpayment': '↩️',
          'product-return': '📦',
          'discount': '🏷️',
          'damage': '⚠️',
          'billing-error': '❌',
          'other': '📝'
        };

        paymentsList.innerHTML = filtered.map(payment => {
          const isCredit = payment.type === 'CREDIT_NOTE';
          const auditInfo = JSON.stringify({
            type: isCredit ? 'Credit Note' : 'Payment',
            id: payment.id,
            name: `${isCredit ? 'Credit Note' : 'Payment'} (${payment.customer_name || 'Customer'})`,
            created_by_role: payment.created_by_role,
            created_by_name: payment.created_by_name,
            last_edited_by_role: payment.last_edited_by_role,
            last_edited_by_name: payment.last_edited_by_name,
            date: payment.payment_date || payment.created_at,
            created_at: payment.created_at
          });
          return `
          <div class="transaction-card" data-worker-audit='${auditInfo.replace(/'/g, "&#39;")}' style="position: relative; margin-bottom: 12px; padding: 16px; border: 1px solid #e0e0e0; border-radius: 8px; background: white;">
            <div style="position: absolute; top: 12px; right: 12px; display: flex; gap: 6px;">
              <button class="action-btn edit" title="Edit transaction" onclick="window.currentEditBillsPaymentsModule && window.currentEditBillsPaymentsModule.handleEditItemSelection(${payment.id}, 'payment')" style="width: 32px; height: 32px; border-radius: 6px; border: 1px solid #e0e0e0; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.3s;">✏️</button>
              <button class="action-btn delete" title="Delete transaction" onclick="if(confirm('Delete this transaction?')) { window.currentEditBillsPaymentsModule && window.currentEditBillsPaymentsModule.deletePaymentItem(${payment.id}); }" style="width: 32px; height: 32px; border-radius: 6px; border: 1px solid #e0e0e0; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.3s;">🗑️</button>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: start; padding-right: 60px;">
              <div>
                <div style="font-weight: 600; margin-bottom: 4px;">${payment.type === 'PAYMENT' ? '💳 Payment' : '📋 Credit Note'}</div>
                <div style="color: #666; font-size: 14px; margin-bottom: 8px;">${payment.customer_name || 'Unknown'}</div>
                <div style="color: #999; font-size: 12px;">
                  ${payment.type === 'PAYMENT' ? `${methodIcon[payment.payment_medium] || '📝'} ${payment.payment_medium || 'N/A'}` : `${reasonIcon[payment.reason] || '📝'} ${payment.reason || 'N/A'}`}
                  ${payment.reference_number ? ` • Ref: ${payment.reference_number}` : ''} ${payment.attachment_data ? '<span style="font-size: 11px; margin-left: 4px;" title="Image Attached">📎</span>' : ''}
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-weight: 600; font-size: 16px; color: ${payment.type === 'PAYMENT' ? '#22c55e' : '#f59e0b'};">₹${(payment.type === 'PAYMENT' ? payment.amount : payment.credit_amount).toFixed(2)}</div>
                <div style="color: #999; font-size: 12px; margin-top: 4px;">${new Date(payment.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          </div>
        `;
        }).join('');
      })
      .catch(error => {
        log.error('Error fetching payments:', error);
        document.getElementById('paymentsList').innerHTML = '<p style="color: #999; text-align: center; padding: 32px;">Error loading payments</p>';
      });
  }

  /**
   * Open edit bill modal with bill details
   */
  openEditBillModal(billId) {
    const apiUrl = `${this.getApiBaseUrl()}/api/billing/invoices/invoices/${billId}`;
    fetch(apiUrl)
      .then(response => response.json())
      .then(bill => {
        if (!bill) {
          this.showNotification('Bill not found', 'error');
          return;
        }

        this.currentBillId = billId;
        const form = document.getElementById('editBillForm');
        
        form.innerHTML = `
          <div class="form-group">
            <label>Bill Number</label>
            <input type="text" class="form-input" value="${bill.bill_number || bill.reference_no || ''}" disabled>
          </div>
          <div class="form-group">
            <label>Customer</label>
            <input type="text" class="form-input" value="${bill.customer_name || bill.customer || ''}" disabled>
          </div>
          <div class="form-group">
            <label>Bill Date</label>
            <input type="date" class="form-input" id="editBillDate" value="${this.formatDateForInput(bill.invoice_date || bill.bill_date || bill.created_at)}" disabled>
          </div>

          <div class="form-group">
            <label>Total Amount</label>
            <input type="number" class="form-input" id="editBillTotal" value="${bill.total || 0}" step="0.01">
          </div>
          <div class="form-group">
            <label>Status</label>
            <select class="form-input" id="editBillStatus">
              <option value="draft" ${bill.status === 'draft' ? 'selected' : ''}>Draft</option>
              <option value="sent" ${bill.status === 'sent' ? 'selected' : ''}>Sent</option>
              <option value="pending" ${bill.status === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="paid" ${bill.status === 'paid' ? 'selected' : ''}>Paid</option>
              <option value="partial" ${bill.status === 'partial' ? 'selected' : ''}>Partial Payment</option>
              <option value="cancelled" ${bill.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
            </select>
          </div>
          <div class="form-group">
            <label>Notes</label>
            <textarea class="form-input" id="editBillNotes" rows="4" style="resize: vertical;">${bill.notes || ''}</textarea>
          </div>
        `;

        document.getElementById('editBillModal').style.display = 'flex';
      })
      .catch(error => {
        log.error('Error fetching bill:', error);
        this.showNotification('Error loading bill details', 'error');
      });
  }

  /**
   * Save edited bill
   */
  saveEditedBill() {
    const billDate = document.getElementById('editBillDate')?.value;
    const billTotal = document.getElementById('editBillTotal')?.value;
    const billStatus = document.getElementById('editBillStatus')?.value;
    const billNotes = document.getElementById('editBillNotes')?.value;

    if (!this.currentBillId) {
      this.showNotification('No bill selected', 'warning');
      return;
    }

    // Calculate Due Date (7 days after invoice date)
    const invDate = new Date(billDate);
    const dueDate = new Date(invDate);
    dueDate.setDate(invDate.getDate() + 7);
    const dueDateVal = dueDate.toISOString().split('T')[0];

    // Update via API
    const payload = {
      bill_date: billDate,
      invoice_date: billDate,
      due_date: dueDateVal,
      total: parseFloat(billTotal),

      status: billStatus,
      notes: billNotes
    };


    const apiUrl = `${this.getApiBaseUrl()}/api/billing/invoices/invoices/${this.currentBillId}`;
    fetch(apiUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(response => response.json())
      .then(result => {
        this.showNotification('✓ Bill updated successfully', 'success');
        this.closeEditBillModal();
        this.searchAndDisplayBills();
      })
      .catch(error => {
        log.error('Error saving bill:', error);
        this.showNotification('Error saving bill: ' + error.message, 'error');
      });
  }

  /**
   * Close edit bill modal
   */
  closeEditBillModal() {
    document.getElementById('editBillModal').style.display = 'none';
    this.currentBillId = null;
  }

  /**
   * ===== EDIT BILL INTERFACE - RENDER EDIT LIST =====
   * Displays bills, payments, and credit notes in a searchable list
   */
  renderEditBillListView() {
    // Fetch all data from API
    const baseUrl = this.getApiBaseUrl();
    Promise.all([
      fetch(`${baseUrl}/api/billing/invoices/invoices`).then(r => r.json()),
      fetch(`${baseUrl}/api/billing/invoices/payments`).then(r => r.json())
    ])
      .then(([billsData, paymentsData]) => {
        // Handle API errors
        if (billsData.error) {
          log.error('Error fetching invoices:', billsData.error);
          this.viewContainer.innerHTML = `<div style="padding: 20px; color: red;">Error loading invoices: ${billsData.error}</div>`;
          return;
        }
        if (paymentsData.error) {
          log.error('Error fetching payments:', paymentsData.error);
          this.viewContainer.innerHTML = `<div style="padding: 20px; color: red;">Error loading payments: ${paymentsData.error}</div>`;
          return;
        }

        const bills = Array.isArray(billsData) ? billsData : [];
        const payments = Array.isArray(paymentsData) ? paymentsData : [];
        
        const creditNotes = payments.filter(p => p.type === 'CREDIT_NOTE');
        const paymentItems = payments.filter(p => p.type === 'PAYMENT');
        
        const allItems = [
          ...bills.map(b => ({ ...b, type: 'bill', typeLabel: 'Bill' })),
          ...paymentItems.map(p => ({ ...p, type: 'payment', typeLabel: 'Payment' })),
          ...creditNotes.map(c => ({ ...c, type: 'credit-note', typeLabel: 'Credit Note' }))
        ];

        if (allItems.length === 0) {
          this.viewContainer.innerHTML = `
            <div class="billing-empty-state">
              <div>
                <p style="margin: 0 0 8px 0; font-size: 18px;">📋</p>
                <p style="margin: 0;">No Bills/Payments Found</p>
                <p style="margin: 8px 0 0 0; font-size: 12px; color: #999;">Create a bill or payment first</p>
                <button id="goBackBtn" class="btn btn-primary" style="margin-top: 16px;">← Go Back</button>
              </div>
            </div>
          `;
          document.getElementById('goBackBtn')?.addEventListener('click', () => this.billingApp.switchView('ledger'));
          return;
        }

        // Sort items by date (newest first)
        const sortedItems = [...allItems].sort((a, b) => {
          const dateA = new Date(a.bill_date || a.created_at || 0);
          const dateB = new Date(b.bill_date || b.created_at || 0);
          return dateB - dateA;
        });

        let html = `
          <div style="padding: 20px; height: 100%; overflow-y: auto; display: flex; flex-direction: column;">
            <h2 style="margin: 0 0 20px 0; font-size: 18px; font-weight: 600;">Edit Bills/Payments</h2>
            
            <!-- Search Bar -->
            <div style="margin-bottom: 20px;">
              <input 
                type="text" 
                id="editSearchInput" 
                class="form-input"
                placeholder="Search by customer name, reference no, or ID..." 
                style="width: 100%; padding: 10px 12px; font-size: 13px;"
              >
              <div style="margin-top: 8px; font-size: 12px; color: #666;">
                <label style="margin-right: 16px; cursor: pointer;">
                  <input type="checkbox" id="filterBills" checked> Bills
                </label>
                <label style="margin-right: 16px; cursor: pointer;">
                  <input type="checkbox" id="filterPayments" checked> Payments
                </label>
                <label style="cursor: pointer;">
                  <input type="checkbox" id="filterCredits" checked> Credit Notes
                </label>
              </div>
            </div>

            <!-- Items List -->
            <div id="editItemsList" style="display: flex; flex-direction: column; gap: 12px; flex: 1; overflow-y: auto;">
        `;

        sortedItems.forEach(item => {
          const itemId = item.bill_id || item.payment_id || item.id;
          const customerName = item.customer_name || item.customer || 'Unknown';
          const itemDate = new Date(item.bill_date || item.payment_date || item.created_at).toLocaleDateString();
          
          // Get correct amount based on item type
          let amount = 0;
          if (item.type === 'bill') {
            amount = item.total || item.grand_total || 0;
          } else if (item.type === 'payment') {
            amount = item.amount || 0;
          } else if (item.type === 'credit-note') {
            amount = item.credit_amount || 0;
          }
          
          // Get reference number based on item type
          let refNo = 'N/A';
          if (item.type === 'bill') {
            // For invoices, use invoice_number from invoices table
            refNo = item.invoice_number || 'N/A';
          } else {
            // For payments and credit notes, use reference_number
            refNo = item.reference_number || item.reference_no || item.ref_no || 'N/A';
          }
          
          let typeColor = '#1db954';
          if (item.type === 'payment') typeColor = '#3b82f6';
          if (item.type === 'credit-note') typeColor = '#f59e0b';

          html += `
            <div style="
              padding: 12px 16px;
              background: #f9fafb;
              border: 1px solid rgba(0, 0, 0, 0.08);
              border-radius: 8px;
              cursor: pointer;
              transition: all 0.2s ease;
              display: flex;
              justify-content: space-between;
              align-items: center;
            " 
            class="bill-selection-item"
            data-item-id="${itemId}"
            data-item-type="${item.type}"
            onmouseover="this.style.background='#ffffff'; this.style.borderColor='rgba(29, 185, 84, 0.3)';"
            onmouseout="this.style.background='#f9fafb'; this.style.borderColor='rgba(0, 0, 0, 0.08)';">
              <div>
                <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px;">${customerName}</div>
                <div style="font-size: 12px; color: #666;">
                  ${itemDate} • Ref: ${refNo} ${item.attachment_data ? '<span style="font-size: 11px; margin-left: 4px; color: #3b82f6;" title="Image Attached">📎</span>' : ''}
                </div>
              </div>
              <div style="text-align: right; display: flex; align-items: center; gap: 16px;">
                <span style="
                  padding: 4px 8px;
                  background: ${typeColor}20;
                  color: ${typeColor};
                  border-radius: 4px;
                  font-size: 11px;
                  font-weight: 600;
                  text-transform: uppercase;
                ">${item.typeLabel}</span>
                <div>
                  <div style="font-weight: 600; color: #1db954;">₹${amount.toFixed(2)}</div>
                  <div style="font-size: 12px; color: #999;">ID: ${itemId}</div>
                </div>
              </div>
            </div>
          `;
        });

        html += `
            </div>
          </div>
          <button id="backToLedgerBtn" class="btn" style="width: 100%; margin-top: auto; background-color: #22c55e; color: #ffffff; border-color: #22c55e;">← Back to Ledger</button>
        `;

        this.viewContainer.innerHTML = html;
        
        // Store items for searching
        this.editListItems = sortedItems;

        // Setup search functionality
        this.setupEditListSearch();

        // Add click listeners using event delegation on the container
        const editItemsList = document.getElementById('editItemsList');
        if (editItemsList) {
          editItemsList.addEventListener('click', (e) => {
            const itemElement = e.target.closest('.bill-selection-item');
            if (itemElement) {
              const itemId = itemElement.getAttribute('data-item-id');
              const itemType = itemElement.getAttribute('data-item-type');
              log.debug('📌 Item clicked via delegation:', {itemId, itemType});
              this.handleEditItemSelection(itemId, itemType);
            }
          });
        }

        // Back button
        document.getElementById('backToLedgerBtn')?.addEventListener('click', () => this.billingApp.switchView('ledger'));
      })
      .catch(error => {
        log.error('Error fetching data:', error);
        this.viewContainer.innerHTML = '<p style="color: #999; text-align: center; padding: 32px;">Error loading data</p>';
      });
  }

  /**
   * Setup search functionality for edit list
   */
  setupEditListSearch() {
    const searchInput = document.getElementById('editSearchInput');
    const filterBills = document.getElementById('filterBills');
    const filterPayments = document.getElementById('filterPayments');
    const filterCredits = document.getElementById('filterCredits');
    const itemsList = document.getElementById('editItemsList');

    const performSearch = () => {
      const query = searchInput.value.toLowerCase();
      const showBills = filterBills.checked;
      const showPayments = filterPayments.checked;
      const showCredits = filterCredits.checked;

      document.querySelectorAll('.bill-selection-item').forEach(item => {
        const itemId = item.getAttribute('data-item-id');
        const itemType = item.getAttribute('data-item-type');
        const text = item.textContent.toLowerCase();

        let typeMatch = false;
        if (itemType === 'bill' && showBills) typeMatch = true;
        if (itemType === 'payment' && showPayments) typeMatch = true;
        if (itemType === 'credit-note' && showCredits) typeMatch = true;

        const searchMatch = query === '' || text.includes(query);
        const shouldShow = typeMatch && searchMatch;

        item.style.display = shouldShow ? 'flex' : 'none';
      });
    };

    searchInput?.addEventListener('input', performSearch);
    filterBills?.addEventListener('change', performSearch);
    filterPayments?.addEventListener('change', performSearch);
    filterCredits?.addEventListener('change', performSearch);
  }

  /**
   * Handle selection of bill/payment/credit note from list
   */
  handleEditItemSelection(itemId, itemType) {
    log.debug('🔧 handleEditItemSelection called:', {itemId, itemType});
    
    if (itemType === 'bill') {
      // Convert itemId to number for comparison
      const itemIdNum = parseInt(itemId, 10);
      log.debug('📝 Fetching full bill details for ID:', itemIdNum);
      
      // Fetch the full bill details from API in the same way as new bill page
      if (this.billingApp.billEditor) {
        const apiUrl = `${this.getApiBaseUrl()}/api/billing/invoices/invoices/${itemIdNum}?_t=${Date.now()}`;
        fetch(apiUrl, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } })
          .then(response => response.json())
          .then(async (result) => {
            // Normalize and validate bill data from API
            let billData = this.normalizeBillDataFromAPI(result);
            
            if (!billData) {
              alert('Error: Unable to load bill data');
              return;
            }

            // Enrich with API metadata (customers, products, preferences)
            // Makes edit page identical to new bill page
            billData = await this.enrichBillDataWithAPIMetadata(billData);

            log.debug('📋 Passing fully enriched bill data to BillEditor:', {
              id: billData.id,
              customer: billData.customer_name,
              products: billData.products.length
            });
            
            // Pass directly to BillEditor - same as new bill page
            // BillEditor will handle all rendering, listeners, and data initialization
            this.billingApp.billEditor.renderCreateBillView(billData);
          })
          .catch(error => {
            log.error('❌ Error fetching bill details:', error);
            alert('Error loading bill details: ' + error.message);
          });
      } else {
        log.warn('⚠️ BillEditor not available');
        alert('Error: BillEditor module not loaded');
      }
    } else if (itemType === 'payment') {
      try {
        log.debug('🎯 Fetching payment ID from API:', itemId);
        
        // Fetch payment directly from API
        const apiUrl = `${this.getApiBaseUrl()}/api/billing/invoices/payments?id=${itemId}`;
        fetch(apiUrl)
          .then(response => response.json())
          .then(payments => {
            log.debug('✅ Payments from API:', payments);
            
            if (!Array.isArray(payments) || payments.length === 0) {
              log.warn('❌ Payment not found in API');
              this.showNotification('Payment not found', 'error');
              return;
            }
            
            const payment = payments[0];
            log.debug('📝 Rendering edit view for payment:', payment.id);
            this.renderEditPaymentView(payment);
          })
          .catch(error => {
            log.error('❌ ERROR fetching payment from API:', error);
            alert('Error loading payment: ' + error.message);
          });
      } catch (error) {
        log.error('❌ ERROR in payment handling:', error);
        alert('Error handling payment: ' + error.message);
      }
    } else if (itemType === 'credit-note') {
      try {
        log.debug('🎯 Fetching credit note ID from API:', itemId);
        
        // Fetch credit note directly from API
        const apiUrl = `${this.getApiBaseUrl()}/api/billing/invoices/payments?id=${itemId}`;
        fetch(apiUrl)
          .then(response => response.json())
          .then(payments => {
            log.debug('✅ Credit notes from API:', payments);
            
            if (!Array.isArray(payments) || payments.length === 0) {
              log.warn('❌ Credit note not found in API');
              this.showNotification('Credit note not found', 'error');
              return;
            }
            
            const creditNote = payments[0];
            log.debug('📝 Rendering edit view for credit note:', creditNote.id);
            this.renderEditCreditNoteView(creditNote);
          })
          .catch(error => {
            log.error('❌ ERROR fetching credit note from API:', error);
            alert('Error loading credit note: ' + error.message);
          });
      } catch (error) {
        log.error('❌ ERROR in credit note handling:', error);
        alert('Error handling credit note: ' + error.message);
      }
    }
  }

  /**
   * Navigate directly to edit view for a specific bill
   * Fetches bill from API and opens in BillEditor (same as new bill page)
   * Enriches data with all metadata for identical edit experience
   */
  editBill(billId) {
    // Fetch bill from API and open in BillEditor
    const apiUrl = `${this.getApiBaseUrl()}/api/billing/invoices/invoices/${billId}?_t=${Date.now()}`;
    fetch(apiUrl, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } })
      .then(response => response.json())
      .then(async (result) => {
        // Normalize and validate bill data from API
        let billData = this.normalizeBillDataFromAPI(result);
        
        if (!billData) {
          alert('Error: Unable to load bill data');
          return;
        }

        // Enrich with API metadata to make edit page identical to new bill page
        billData = await this.enrichBillDataWithAPIMetadata(billData);

        // Open BillEditor in edit mode with the enriched bill data
        // BillEditor will handle all rendering and initialization identical to new bill page
        if (this.billingApp.billEditor) {
          log.debug('📖 Opening BillEditor with fully enriched data for bill:', billData.id);
          this.billingApp.billEditor.renderCreateBillView(billData);
        } else {
          log.error('BillEditor not available');
          alert('Error: BillEditor module not loaded');
        }
      })
      .catch(error => {
        log.error('Error fetching bill:', error);
        alert('Error loading bill: ' + error.message);
      });
  }

  /**
   * ===== RENDER PAYMENT EDIT VIEW =====
   */
  renderEditPaymentView(paymentData) {
    try {
      log.debug('🚀 renderEditPaymentView called with:', paymentData);
      
      // Track the payment being edited
      this.currentEditPaymentId = paymentData.payment_id || paymentData.id;
      this.currentEditPaymentType = 'PAYMENT';

      if (!this.viewContainer) {
        throw new Error('viewContainer is not defined');
      }

      this.viewContainer.innerHTML = `
      <div class="bill-form-wrapper">
        <div style="display: flex; flex-direction: column; height: 100%; background: linear-gradient(180deg, #0a0a0a 0%, #1a0505 30%, #3d1515 60%, #5a2020 100%); overflow-y: auto;">
          <!-- Payment Information -->
          <div class="bill-form-section bill-info-section">
            <h3 class="bill-section-title">Edit Payment</h3>
            <div class="form-row">
              <div class="form-group">
                <label>Customer Name</label>
                <input type="text" id="editPaymentCustomerName" class="form-input" disabled>
              </div>
              <div class="form-group">
                <label>&nbsp;</label>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Payment Date</label>
                <input type="datetime-local" id="editPaymentDate" class="form-input">
              </div>
              <div class="form-group">
                <label>Amount</label>
                <input type="number" id="editAmount" class="form-input" placeholder="0.00" step="0.01">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Reference No</label>
                <input type="text" id="editReference" class="form-input" placeholder="Ref no or check no">
              </div>
              <div class="form-group">
                <label>Payment Mode</label>
                <select id="editPaymentMethod" class="form-input">
                  <option value="cash">💵 Cash</option>
                  <option value="cheque">🏦 Cheque</option>
                  <option value="bank-transfer">🏧 Bank Transfer</option>
                  <option value="online">💻 Online Payment</option>
                  <option value="upi">📱 UPI</option>
                  <option value="card">💳 Card</option>
                  <option value="other">📝 Other</option>
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group" style="grid-column: 1 / -1;">
                <label>Notes</label>
                <textarea id="editPaymentNotes" class="form-input" placeholder="Payment notes" style="min-height: 80px;"></textarea>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="bill-form-section bill-actions-section">
            <button id="updatePaymentBtn" class="bill-action-btn">✓ Update Payment</button>
            <button id="paymentListBtn" class="bill-action-btn secondary">📋 Back to List</button>
            <button id="deletePaymentBtn" class="bill-action-btn" style="background: var(--accent-red); box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);">✕ Delete</button>
          </div>
        </div>
      </div>
    `;

      // Populate with payment data
      if (paymentData) {
        document.getElementById('editPaymentCustomerName').value = paymentData.customer_name || 'Unknown';
        
        const paymentDate = paymentData.payment_date || paymentData.created_at;
        document.getElementById('editPaymentDate').value = this.formatDateTimeForInput(paymentDate) || this.formatDateTimeForInput(new Date());
        
        document.getElementById('editAmount').value = paymentData.amount || 0;
        document.getElementById('editReference').value = paymentData.reference_number || '';
        document.getElementById('editPaymentMethod').value = paymentData.payment_medium || 'cash';
        document.getElementById('editPaymentNotes').value = paymentData.notes || '';
      }

      // Setup listeners
      document.getElementById('updatePaymentBtn')?.addEventListener('click', () => {
        this.savePaymentEdit();
      });
      document.getElementById('paymentListBtn')?.addEventListener('click', () => {
        this.renderEditBillListView();
      });
      document.getElementById('deletePaymentBtn')?.addEventListener('click', () => {
        if (confirm('Delete this payment? This cannot be undone.')) {
          this.deletePayment();
        }
      });
      
      log.debug('✅ Edit payment form fully rendered and listeners attached');
    } catch (error) {
      log.error('❌ ERROR in renderEditPaymentView:', error);
      alert('Error rendering payment form: ' + error.message);
    }
  }

  /**
   * ===== RENDER CREDIT NOTE EDIT VIEW =====
   */
  renderEditCreditNoteView(creditData) {
    // Track the credit note being edited
    this.currentEditPaymentId = creditData.payment_id || creditData.id || creditData.credit_note_id;
    this.currentEditPaymentType = 'CREDIT_NOTE';

    this.viewContainer.innerHTML = `
      <div class="bill-form-wrapper">
        <div style="display: flex; flex-direction: column; height: 100%; background: linear-gradient(180deg, #0a0a0a 0%, #1a0505 30%, #3d1515 60%, #5a2020 100%); overflow-y: auto;">
          <!-- Credit Note Information -->
          <div class="bill-form-section bill-info-section">
            <h3 class="bill-section-title">Edit Credit Note</h3>
            <div class="form-row">
              <div class="form-group">
                <label>Customer Name</label>
                <input type="text" id="editCreditCustomerName" class="form-input" disabled>
              </div>
              <div class="form-group">
                <label>&nbsp;</label>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Credit Date</label>
                <input type="datetime-local" id="editCreditDate" class="form-input">
              </div>
              <div class="form-group">
                <label>Amount</label>
                <input type="number" id="editCreditAmount" class="form-input" placeholder="0.00" step="0.01">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>Reason</label>
                <select id="editCreditReason" class="form-input">
                  <option value="">-- Select reason --</option>
                  <option value="overpayment">↩️ Overpayment/Refund</option>
                  <option value="product-return">📦 Product Return</option>
                  <option value="discount">🏷️ Discount Adjustment</option>
                  <option value="damage">⚠️ Damaged/Defective</option>
                  <option value="billing-error">❌ Billing Error</option>
                  <option value="other">📝 Other</option>
                </select>
              </div>
              <div class="form-group">
                <label>Reference No</label>
                <input type="text" id="editCreditReference" class="form-input" placeholder="Ref no or note ID">
              </div>
            </div>
            <div class="form-row">
              <div class="form-group" style="grid-column: 1 / -1;">
                <label>Notes</label>
                <textarea id="editCreditNotes" class="form-input" placeholder="Reason for credit note" style="min-height: 80px;"></textarea>
              </div>
            </div>
            
            <div class="form-row">
              <div class="form-group" style="grid-column: 1 / -1;">
                <label>Attachment (Image)</label>
                <input type="file" id="editCreditAttachment" accept="image/jpeg, image/png, image/webp" style="display: none;">
                <button type="button" id="editCreditAttachmentBtn" class="btn btn-secondary-enhanced" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px; padding: 10px; border: 1px dashed #999; background: #f9fafb; cursor: pointer; border-radius: 4px; color: #374151;">
                  <span style="font-size: 16px;">📎</span> <span>Choose Image</span>
                </button>
                <div style="font-size: 11px; color: #666; margin-bottom: 8px;">Max size: 5MB. JPG, PNG, WEBP allowed.</div>
                
                <div id="editAttachmentPreviewContainer" style="display: none; position: relative; max-width: 200px; margin-top: 8px;">
                  <img id="editAttachmentPreviewImg" src="" style="width: 100%; border-radius: 4px; border: 1px solid #ddd; display: block;">
                  <button id="editRemoveAttachmentBtn" type="button" style="position: absolute; top: -8px; right: -8px; background: #ef4444; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">✕</button>
                </div>
                <input type="hidden" id="existingCreditAttachment">
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="bill-form-section bill-actions-section">
            <button id="updateCreditBtn" class="bill-action-btn">✓ Update Credit Note</button>
            <button id="creditListBtn" class="bill-action-btn secondary">📋 Back to List</button>
            <button id="deleteCreditBtn" class="bill-action-btn" style="background: var(--accent-red); box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);">✕ Delete</button>
          </div>
        </div>
      </div>
    `;

    // Populate with credit note data
    if (creditData) {
      document.getElementById('editCreditCustomerName').value = creditData.customer_name || 'Unknown';
      
      const creditDate = creditData.payment_date || creditData.created_at;
      document.getElementById('editCreditDate').value = this.formatDateTimeForInput(creditDate) || this.formatDateTimeForInput(new Date());
      
      document.getElementById('editCreditAmount').value = creditData.credit_amount || 0;
      document.getElementById('editCreditReason').value = creditData.reason || 'other';
      document.getElementById('editCreditReference').value = creditData.reference_number || '';
      document.getElementById('editCreditNotes').value = creditData.notes || creditData.description || '';
      
      const existingAttachment = document.getElementById('existingCreditAttachment');
      const attachmentPreviewContainer = document.getElementById('editAttachmentPreviewContainer');
      const attachmentPreviewImg = document.getElementById('editAttachmentPreviewImg');
      const creditAttachment = document.getElementById('editCreditAttachment');
      
      if (creditData.attachment_data) {
        if (existingAttachment) existingAttachment.value = creditData.attachment_data;
        if (attachmentPreviewImg) attachmentPreviewImg.src = creditData.attachment_data;
        if (attachmentPreviewContainer) attachmentPreviewContainer.style.display = 'block';
      } else {
        if (existingAttachment) existingAttachment.value = '';
        if (attachmentPreviewContainer) attachmentPreviewContainer.style.display = 'none';
      }
      
      if (creditAttachment) {
        creditAttachment.value = '';
        creditAttachment.dataset.compressedData = '';
      }
    }

    // Setup listeners
    document.getElementById('updateCreditBtn')?.addEventListener('click', () => {
      this.savePaymentEdit();
    });
    document.getElementById('creditListBtn')?.addEventListener('click', () => {
      this.renderEditBillListView();
    });
    document.getElementById('deleteCreditBtn')?.addEventListener('click', () => {
      if (confirm('Delete this credit note? This cannot be undone.')) {
        this.deletePayment();
      }
    });

    // Attachment Handlers
    const editCreditAttachmentBtn = document.getElementById('editCreditAttachmentBtn');
    const editCreditAttachment = document.getElementById('editCreditAttachment');
    const editAttachmentPreviewContainer = document.getElementById('editAttachmentPreviewContainer');
    const editAttachmentPreviewImg = document.getElementById('editAttachmentPreviewImg');
    const editRemoveAttachmentBtn = document.getElementById('editRemoveAttachmentBtn');
    const existingCreditAttachment = document.getElementById('existingCreditAttachment');

    if (editCreditAttachmentBtn && editCreditAttachment) {
      // Remove previous generic listeners to prevent duplicates
      const newBtn = editCreditAttachmentBtn.cloneNode(true);
      if (editCreditAttachmentBtn.parentNode) {
        editCreditAttachmentBtn.parentNode.replaceChild(newBtn, editCreditAttachmentBtn);
      }
      const newAttachment = editCreditAttachment.cloneNode(true);
      if (editCreditAttachment.parentNode) {
        editCreditAttachment.parentNode.replaceChild(newAttachment, editCreditAttachment);
      }
      
      newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        newAttachment.click();
      });
      
      newAttachment.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        // Validation
        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) {
          alert('❌ Please select a valid image (JPG, PNG, or WEBP)');
          e.target.value = '';
          return;
        }
        
        if (file.size > 5 * 1024 * 1024) {
          alert('❌ Image must be less than 5MB');
          e.target.value = '';
          return;
        }

        try {
          const compressedBase64 = await this.compressImage(file);
          if (editAttachmentPreviewImg) editAttachmentPreviewImg.src = compressedBase64;
          if (editAttachmentPreviewContainer) editAttachmentPreviewContainer.style.display = 'block';
          // Store it in a dataset
          newAttachment.dataset.compressedData = compressedBase64;
          // Clear existing so we use the new one
          if (existingCreditAttachment) existingCreditAttachment.value = '';
        } catch (err) {
          log.error('Error compressing image:', err);
          alert('❌ Failed to process image');
          e.target.value = '';
        }
      });
    }

    if (editRemoveAttachmentBtn) {
      const newRemoveBtn = editRemoveAttachmentBtn.cloneNode(true);
      if (editRemoveAttachmentBtn.parentNode) {
        editRemoveAttachmentBtn.parentNode.replaceChild(newRemoveBtn, editRemoveAttachmentBtn);
      }
      newRemoveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const editAttachment = document.getElementById('editCreditAttachment');
        const previewContainer = document.getElementById('editAttachmentPreviewContainer');
        const existingAttachment = document.getElementById('existingCreditAttachment');
        if (editAttachment) {
          editAttachment.value = '';
          editAttachment.dataset.compressedData = '';
        }
        if (existingAttachment) {
          existingAttachment.value = '';
        }
        if (previewContainer) previewContainer.style.display = 'none';
      });
    }
  }

  /**
   * Compress image before upload
   */
  compressImage(file, maxWidth = 800, maxHeight = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  }

  /**
   * ===== EDIT PRODUCT HELPERS (for edit mode product management) =====
   */
  loadEditProductMemoryForCustomer() {
    const productName = document.getElementById('editProductName')?.value.trim();
    const customerName = document.getElementById('editCustomerName')?.value.trim();

    if (!productName || !customerName) return;

    // Load preferences from API
    const apiUrl = `${this.getApiBaseUrl()}/api/billing/preference/${encodeURIComponent(customerName)}/${encodeURIComponent(productName)}`;
    fetch(apiUrl)
      .then(r => r.json())
      .then(result => {
        if (result.status === 'success' && result.data) {
          const memory = result.data;
          
          document.getElementById('editProductDisc1').value = memory.disc1 || '';
          document.getElementById('editProductDisc2').value = memory.disc2 || '';
          document.getElementById('editProductScheme').value = memory.scheme || '';
          document.getElementById('editProductTax').value = memory.tax || '0';

          if (memory.scheme === 'custom') {
            document.getElementById('editCustomSchemeContainer').style.display = 'flex';
          }
        }
      })
      .catch(e => log.error('Error loading product memory from API:', e));
  }

  async addEditProductToBill() {
    const schemeValue = document.getElementById('editProductScheme')?.value;
    let scheme = schemeValue;
    
    if (schemeValue === 'custom') {
      scheme = document.getElementById('editCustomSchemeValue')?.value;
      if (!scheme) {
        alert('Please enter custom scheme value (e.g., 3+1)');
        return;
      }
    }

    const mrp = parseFloat((parseFloat(document.getElementById('editProductMRP')?.value) || 0).toFixed(2));
    const disc1Pct = parseFloat((parseFloat(document.getElementById('editProductDisc1')?.value) || 0).toFixed(2));
    const qty = parseFloat((parseFloat(document.getElementById('editProductQty')?.value) || 0).toFixed(2));
    const disc2Pct = parseFloat((parseFloat(document.getElementById('editProductDisc2')?.value) || 0).toFixed(2));
    const gstPct = parseFloat((parseFloat(document.getElementById('editProductTax')?.value) || 0).toFixed(2));

    const product = {
      id: Date.now(),
      name: document.getElementById('editProductName')?.value,
      product_id: this.currentEditProduct?.id || this.currentEditProduct?.product_id || null,
      variant_id: this.currentEditProduct?.variant_id || null,
      batch_id: this.currentEditProduct?.batch_id || null,
      pack_value: document.getElementById('editProductPack')?.value,
      pack: ((document.getElementById('editProductPack')?.value || '') + ' ' + (document.getElementById('editProductPackUnit')?.value || '')).trim(),
      batch: document.getElementById('editProductBatch')?.value,
      exp: '',
      mrp: mrp,
      rate: mrp,
      qty: qty,
      free: 0,
      disc1: disc1Pct,
      disc2: disc2Pct,
      scheme: scheme,
      sgst: parseFloat((gstPct / 2).toFixed(2)),
      cgst: parseFloat((gstPct / 2).toFixed(2)),
      gstTotal: gstPct,
      gst_percent: gstPct,
      isGold: (this.currentEditProduct && (this.currentEditProduct.isGold === true || this.currentEditProduct.is_gold === true || this.currentEditProduct.is_gold === 1 || String(this.currentEditProduct.classification).toLowerCase() === 'gold')) || false
    };

    if (!product.name || product.qty === 0 || product.mrp === 0) {
      alert('Please fill in Product Name, Quantity, and MRP');
      return;
    }

    // Check for differences with Master Product
    if (this.currentEditProduct) {
      const masterProduct = this.currentEditProduct;
      const changes = [];

      // Compare MRP
      if (parseFloat(product.mrp) !== parseFloat(masterProduct.mrp || 0)) {
        changes.push('mrp');
      }

      // Compare Pack
      const masterPackValue = masterProduct.pack_size_value || masterProduct.pack_value || masterProduct.pack || '';
      if (String(product.pack_value) !== String(masterPackValue)) {
        changes.push('pack');
      }

      // Compare Batch
      if (String(product.batch) !== String(masterProduct.batch_no || '')) {
        changes.push('batch');
      }

      if (changes.length > 0) {
        log.debug('🔍 Change detection triggered for:', changes);
        const priorityField = changes[0]; 
        const oldValue = priorityField === 'mrp' ? masterProduct.mrp : 
                        (priorityField === 'pack' ? masterPackValue : masterProduct.batch_no);
        const newValue = product[priorityField === 'pack' ? 'pack_value' : priorityField];
        
        // Show change detection modal
        const result = await this.showProductMasterUpdateModal(product, priorityField, oldValue, newValue);
        if (result === 'cancel') {
          return;
        }
        if (result === 'update-db') {
          await this.updateProductDatabase(product, priorityField, newValue);
        }
      }
    }

    this.editBillProducts.push(product);
    this.clearEditProductInputFields();
    this.renderEditProductList();
    this.updateEditBillSummary();
  }

  clearEditProductInputFields() {
    if (document.getElementById('editProductName')) {
      document.getElementById('editProductName').value = '';
      document.getElementById('editProductPack').value = '';
      document.getElementById('editProductPackUnit').value = '';
      document.getElementById('editProductBatch').value = '';
      document.getElementById('editProductMRP').value = '';
      document.getElementById('editProductQty').value = '1';
      document.getElementById('editProductDisc1').value = '0';
      document.getElementById('editProductDisc2').value = '0';
      document.getElementById('editProductTax').value = '0';
      document.getElementById('editProductScheme').value = '';
      
      const customScheme = document.getElementById('editCustomSchemeValue');
      if (customScheme) customScheme.value = '';
      const customSchemeContainer = document.getElementById('editCustomSchemeContainer');
      if (customSchemeContainer) customSchemeContainer.style.display = 'none';

      this.currentEditProduct = null;
      document.getElementById('editProductName').focus();
    }
  }

  renderEditProductList() {
    const listSection = document.getElementById('editProductListSection');
    const listContainer = document.getElementById('editProductListContainer');
    
    if (!listSection || !listContainer) return;

    if (this.editBillProducts.length === 0) {
      listSection.style.display = 'none';
      return;
    }

    listSection.style.display = 'block';
    let html = '';

    this.editBillProducts.forEach((product, index) => {
      const isGold = product.isGold === true || product.is_gold === true || product.is_gold === 1 || String(product.classification).toLowerCase() === 'gold' || String(product.category).toLowerCase() === 'gold';
      const goldIndicator = isGold ? '🔶 GOLD' : '⚪ NON-GOLD';
      
      const calc = BillCalculator.calculateLineItem({
        rate: parseFloat(product.rate || product.mrp || 0),
        mrp: parseFloat(product.mrp || product.rate || 0),
        qty: parseInt(product.qty || 1),
        disc1: parseFloat(product.disc1 || 0),
        disc2: parseFloat(product.disc2 || 0),
        sgst: parseFloat(product.sgst || 0),
        cgst: parseFloat(product.cgst || 0),
        gstTotal: parseFloat(product.gstTotal !== undefined ? product.gstTotal : (product.gst_percent !== undefined ? product.gst_percent : (parseFloat(product.sgst || 0) + parseFloat(product.cgst || 0)))),
        gst_reverse: product.gst_reverse || false
      });

      const baseRateForDisplay = calc.rate;
      const rateAfterDisc1 = calc.discounted_rate;
      const qty = calc.qty;
      const amountAfterDisc1 = calc.amount - calc.discount_1_amount;
      const amountAfterDisc2 = amountAfterDisc1 - calc.discount_2_amount;
      const rateAfterDisc2 = amountAfterDisc2 / qty;
      const taxTotalPercent = parseFloat(product.gstTotal !== undefined ? product.gstTotal : (product.gst_percent !== undefined ? product.gst_percent : (parseFloat(product.sgst || 0) + parseFloat(product.cgst || 0))));

      html += `
        <div class="edit-product-card" data-product-id="${product.id}" tabindex="0" role="article">
          <div class="edit-product-card-header">
            <div class="edit-product-card-name">${index + 1}. ${product.name}</div>
            <div class="edit-product-card-badge ${isGold ? 'gold' : ''}">${goldIndicator}</div>
          </div>
          
          <div class="edit-product-card-field" data-field="qty" data-editable="true">
            <label>Qty</label>
            <div class="edit-product-card-field-value">${product.qty}</div>
          </div>
          
          <div class="edit-product-card-field" data-field="pack" data-product-id="${product.id}" data-has-variants="${product.has_multiple_variants ? 'true' : 'false'}" style="cursor: ${product.has_multiple_variants ? 'pointer' : 'default'};">
            <label>Pack</label>
            <div class="edit-product-card-field-value">${product.pack || product.pack_size_value || ''}</div>
          </div>
          
          <div class="edit-product-card-field" data-field="mrp" data-editable="true">
            <label>MRP</label>
            <div class="edit-product-card-field-value">₹${parseFloat(product.mrp || 0).toFixed(2)}</div>
          </div>
          
          <div class="edit-product-card-field">
            <label>Rate</label>
            <div class="edit-product-card-field-value">₹${rateAfterDisc1.toFixed(2)}</div>
          </div>
          
          <div class="edit-product-card-field">
            <label>Amount</label>
            <div class="edit-product-card-field-value" style="font-weight: 700; color: #1db954;">₹${(rateAfterDisc1 * product.qty).toFixed(2)}</div>
          </div>

          <div class="edit-product-card-field" data-field="disc1" data-editable="true">
            <label>D1%</label>
            <div class="edit-product-card-field-value">${parseFloat(product.disc1 || 0).toFixed(1)}%</div>
          </div>

          <div class="edit-product-card-field">
            <label>After D1</label>
            <div class="edit-product-card-field-value">₹${rateAfterDisc1.toFixed(2)}</div>
          </div>

          <div class="edit-product-card-field" data-field="disc2" data-editable="true">
            <label>D2%</label>
            <div class="edit-product-card-field-value">${parseFloat(product.disc2 || 0).toFixed(1)}%</div>
          </div>

          <div class="edit-product-card-field">
            <label>After D2</label>
            <div class="edit-product-card-field-value">₹${rateAfterDisc2.toFixed(2)}</div>
          </div>

          <div class="edit-product-card-field" data-field="gstTotal" data-editable="true">
            <label>Tax%</label>
            <div class="edit-product-card-field-value">${taxTotalPercent.toFixed(1)}%</div>
          </div>

          <div class="edit-product-card-field">
            <label>Tax Val</label>
            <div class="edit-product-card-field-value">₹${calc.gst_amount.toFixed(2)}</div>
          </div>

          <div class="edit-product-card-field">
            <label>Final</label>
            <div class="edit-product-card-field-value" style="font-weight: 700; color: #1db954;">₹${calc.final_amount.toFixed(2)}</div>
          </div>
          
          <div class="edit-product-card-actions">
            <button class="btn-delete" data-product-id="${product.id}">🗑️ Delete</button>
          </div>
        </div>
      `;
    });

    listTable.innerHTML = html;
    this.setupEditProductListListeners();
  }

  async showVariantSelectorFromProductCard(packField) {
    try {
      const productCard = packField.closest('.edit-product-card');
      const productId = parseInt(productCard.dataset.productId);
      const product = this.editBillProducts.find(p => p.id === productId);

      if (!product) {
        log.error('❌ Product not found in bill:', { productId });
        return;
      }

      log.debug('📦 Opening variant selector from product card (edit mode):', { 
        name: product.name || product.product_name,
        variants: product.variants?.length || 0
      });

      // If product already has variants data, use it directly
      if (product.variants && Array.isArray(product.variants) && product.variants.length > 0) {
        this.showVariantSelectorForCardEdit(product.variants, product.name || product.product_name, productId);
        return;
      }

      // Otherwise, fetch product details from API to get variants
      const pName = (product.name || product.product_name || '').trim();
      const response = await fetch(`/api/products?search=${encodeURIComponent(pName)}`);
      if (response.ok) {
        const result = await response.json();
        const products = this.normalizeProducts(result);
        
        if (Array.isArray(products) && products.length > 0) {
          const fullProduct = products.find(p => p.name.toLowerCase() === pName.toLowerCase());
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
        this.selectVariantFromCardEdit();
      });
    }

    const overlay = document.getElementById('variantSelectorModal');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
    }
  }

  selectVariantFromCardEdit() {
    const selectedRadio = document.querySelector('input[name="variantOption"]:checked');
    if (selectedRadio) {
      const idx = parseInt(selectedRadio.value);
      const batchIdx = parseInt(selectedRadio.getAttribute('data-batch-index') || '0');
      
      if (idx >= 0 && idx < this.variantsToSelectFromCard.length) {
        const variant = this.variantsToSelectFromCard[idx];
        const product = this.editBillProducts.find(p => p.id === this.selectedProductIdForCard);

        if (product) {
          // Update product with selected variant details
          product.pack_size_value = variant.pack_size_value;
          product.pack_size_type = variant.pack_size_type;
          product.pack = `${variant.pack_size_value}${variant.pack_size_type ? ' ' + variant.pack_size_type : ''}`;

          // Update batch and MRP from selected batch
          if (variant.batches && variant.batches.length > batchIdx) {
            const batch = variant.batches[batchIdx];
            const batchNoValue = batch.batch_no || batch.batchNo || '';
            product.batch = batchNoValue;
            product.batch_no = batchNoValue;
            product.mrp = batch.mrp || product.mrp;
          } else if (variant.batches && variant.batches.length > 0) {
            const batch = variant.batches[0];
            const batchNoValue = batch.batch_no || batch.batchNo || '';
            product.batch = batchNoValue;
            product.batch_no = batchNoValue;
            product.mrp = batch.mrp || product.mrp;
          }

          log.debug('✅ Variant selected from card (edit mode):', { productId: product.id, pack: product.pack });

          const modal = document.getElementById('variantSelectorModal');
          if (modal) modal.remove();
          this.isVariantModalOpen = false;

          // Re-render the product list to show updated pack
          this.renderEditBillProductList();
        }
      }
    } else {
      this.showNotification('Please select a variant', 'warning');
    }
  }

  setupEditProductListListeners() {
    document.querySelectorAll('.edit-product-card-field[data-field="pack"]').forEach(field => {
      // Only add click listener if product has multiple variants
      if (field.dataset.hasVariants === 'true') {
        field.addEventListener('click', (e) => {
          e.stopPropagation();
          // Open variant selector for pack field clicks (only for multi-variant products)
          this.showVariantSelectorFromProductCard(field);
        });
      }
    });

    document.querySelectorAll('.edit-product-card-field[data-editable="true"]').forEach(field => {
      field.addEventListener('dblclick', (e) => this.editProductFieldInEditMode(e));
    });

    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const productId = parseInt(e.target.dataset.productId);
        this.deleteEditProductFromBill(productId);
      });
    });

    // Add focus handlers to product cards
    document.querySelectorAll('.edit-product-card').forEach(card => {
      card.addEventListener('focus', (e) => {
        // Remove focused class from all other cards
        document.querySelectorAll('.edit-product-card.focused').forEach(c => {
          c.classList.remove('focused');
        });
        // Add focused class to this card
        e.currentTarget.classList.add('focused');
      });

      card.addEventListener('blur', (e) => {
        // Remove focused class when card loses focus
        e.currentTarget.classList.remove('focused');
      });

      card.addEventListener('click', (e) => {
        // Ensure card gets focus on click
        card.focus();
      });
    });
  }

  async editProductFieldInEditMode(e) {
    const field = e.currentTarget;
    const fieldName = field.dataset.field;
    const card = field.closest('.edit-product-card');
    const productId = parseInt(card.dataset.productId);
    const product = this.editBillProducts.find(p => p.id === productId);

    if (!product) return;

    const currentValue = product[fieldName];
    const input = document.createElement('input');
    input.type = fieldName === 'qty' || fieldName === 'mrp' || fieldName === 'disc1' || fieldName === 'disc2' || fieldName === 'sgst' || fieldName === 'cgst' ? 'number' : 'text';
    input.value = currentValue;
    input.className = 'edit-input';

    const valueDiv = field.querySelector('.edit-product-card-field-value');
    const originalHTML = valueDiv.innerHTML;
    valueDiv.innerHTML = '';
    valueDiv.appendChild(input);
    input.focus();
    input.select();

    let isSaving = false;
    const saveEdit = async () => {
      if (isSaving) return;
      isSaving = true;
      
      let newValue = input.value;
      if (fieldName === 'qty' || fieldName === 'mrp' || fieldName === 'disc1' || fieldName === 'disc2' || fieldName === 'sgst' || fieldName === 'cgst' || fieldName === 'gstTotal') {
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
      if (fieldName === 'mrp' || fieldName === 'disc1') {
        const base = parseFloat(product.mrp || product.rate || 0) || 0;
        const d1 = parseFloat(product.disc1 || 0) || 0;
        product.rate = base - (base * d1 / 100);
      }

      // Synchronize tax fields
      if (fieldName === 'gstTotal' || fieldName === 'gst_percent' || fieldName === 'tax') {
        product.gstTotal = newValue;
        product.gst_percent = newValue;
        product.sgst = parseFloat((newValue / 2).toFixed(2));
        product.cgst = parseFloat((newValue / 2).toFixed(2));
      } else if (fieldName === 'sgst' || fieldName === 'cgst') {
        product.sgst = newValue;
        product.cgst = newValue;
        product.gstTotal = newValue * 2;
        product.gst_percent = newValue * 2;
      }

      this.renderEditProductList();
      this.updateEditBillSummary();
    };

    input.addEventListener('blur', saveEdit);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') saveEdit();
    });
  }

  deleteEditProductFromBill(productId) {
    this.editBillProducts = this.editBillProducts.filter(p => p.id !== productId);
    this.renderEditProductList();
    this.updateEditBillSummary();
  }

  updateEditBillSummary() {
    let totalProducts = this.editBillProducts.length;
    let totalQty = 0;
    let totalAmount = 0;
    let totalDiscount = 0;
    let totalSGST = 0;
    let totalCGST = 0;
    let totalGST = 0;

    // Use BillCalculator for consistent calculations (matching backend logic)
    this.editBillProducts.forEach(product => {
      totalQty += parseInt(product.qty) || 1;

      // Calculate using BillCalculator for consistency
      const calculated = BillCalculator.calculateLineItem({
        rate: parseFloat(product.rate || product.mrp || 0),
        mrp: parseFloat(product.mrp || product.rate || 0),
        qty: parseInt(product.qty || 1),
        disc1: parseFloat(product.disc1 || 0),      // PERCENTAGE from API
        disc2: parseFloat(product.disc2 || 0),      // PERCENTAGE from API
        sgst: parseFloat(product.sgst || 0),
        cgst: parseFloat(product.cgst || 0),
        gstTotal: parseFloat(product.gstTotal !== undefined ? product.gstTotal : (product.gst_percent !== undefined ? product.gst_percent : 0)),
        gst_reverse: product.gst_reverse || false
      });

      totalAmount += calculated.amount;
      totalDiscount += calculated.discount_1_amount + calculated.discount_2_amount;
      totalSGST += calculated.sgst_amount;
      totalCGST += calculated.cgst_amount;
      totalGST += calculated.gst_amount;
    });

    const subtotal = totalAmount;
    const amountAfterDiscount = subtotal - totalDiscount;
    const amountWithTax = amountAfterDiscount + totalGST;
    const roundingOff = Math.round(amountWithTax) - amountWithTax;
    const grandTotal = Math.round(amountWithTax);

    const updateElement = (id, value) => {
      const elem = document.getElementById(id);
      if (elem) elem.textContent = value;
    };

    updateElement('editSummaryProductCount', totalProducts);
    updateElement('editSummaryTotalQty', totalQty);
    updateElement('editSummarySubtotal', '₹' + subtotal.toFixed(2));
    updateElement('editSummaryDiscount', '₹' + totalDiscount.toFixed(2));
    updateElement('editSummarySGST', '₹' + totalSGST.toFixed(2));
    updateElement('editSummaryCGST', '₹' + totalCGST.toFixed(2));
    
    if (roundingOff !== 0) {
      updateElement('editSummaryRoundingOff', '₹' + roundingOff.toFixed(2));
    }
    
    updateElement('editSummaryGrandTotal', '₹' + grandTotal.toFixed(2));
  }

  async updateBillData() {
    if (this.editBillProducts.length === 0) {
      alert('Please add at least one product to the bill');
      return;
    }

    const customerName = document.getElementById('editCustomerName')?.value;
    if (!customerName) {
      alert('Please enter customer name');
      return;
    }

    try {
      // Transform products to API format (calculate all values using BillCalculator logic)
      const items = this.editBillProducts.map((product, idx) => {
        const item = {
          id: product.id || null,  // Include item ID for UPDATE, null for new items
          quantity: parseInt(product.qty) || 1,
          rate: parseFloat(product.rate || 0),
          discount_1: parseFloat(product.disc1 || 0),
          discount_2: parseFloat(product.disc2 || 0),
          gst_percent: parseFloat(product.gstTotal || 0),
          sgst_percent: parseFloat(product.sgst || 0),
          cgst_percent: parseFloat(product.cgst || 0),
          scheme: product.scheme || null,
          product_id: product.product_id,
          variant_id: product.variant_id,
          batch_id: product.batch_id,
          product_name: product.name || product.product_name,
          pack_value: product.pack || product.pack_value,
          pack_type: product.pack_type,
          batch_no: product.batch || product.batch_no,
          exp_date: product.exp || product.exp_date,
          mrp: parseFloat(product.mrp || 0),
          free: parseInt(product.free || 0)
        };
        
        log.debug(`📤 Item ${idx} SENDING to API:`, {
          id: item.id,
          qty: item.quantity,
          rate: item.rate,
          disc1: item.discount_1,
          disc2: item.discount_2,
          gst: item.gst_percent,
          sgst: item.sgst_percent,
          cgst: item.cgst_percent
        });
        
        return item;
      });

      // Debug: Log what's being sent
      log.debug('📤 SENDING TO UPDATE INVOICE:', {
        invoiceId: this.currentBillId,
        itemCount: items.length,
        firstItem: items.length > 0 ? {
          gst_percent: items[0].gst_percent,
          sgst_percent: items[0].sgst_percent,
          cgst_percent: items[0].cgst_percent,
          rate: items[0].rate,
          quantity: items[0].quantity
        } : 'empty'
      });

      // Call new robust API to update invoice
      const apiUrl = `${this.getApiBaseUrl()}/api/billing/invoices/invoices/${this.currentBillId}`;
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, notes: null })
      });
      
      const result = await response.json();
      
      if (result.success || result.invoice_id) {
        this.showNotification('✓ Bill Updated Successfully!', 'success');
        this.clearEditBillForm();
        this.billingApp.switchView('edit');
      } else {
        alert('Failed to update bill: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      log.error('Error updating bill:', error);
      alert('Failed to update bill: ' + error.message);
    }
  }

  clearEditBillForm() {
    if (document.getElementById('editBillDateTime')) {
      document.getElementById('editBillDateTime').value = this.formatDateTimeForInput(new Date());
      document.getElementById('editCustomerName').value = '';
      this.editBillProducts = [];
      this.renderEditProductList();
      this.updateEditBillSummary();
      this.clearEditProductForm();
    }
  }

  /**
   * Open edit modal for a payment or credit note
   */
  async openPaymentEditModal(paymentId) {
    try {
      // Fetch the payment/credit note details
      const apiUrl = `${this.getApiBaseUrl()}/api/billing/invoices/payments?id=${paymentId}`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch payment details');
      }

      const payments = await response.json();
      const payment = payments[0];

      if (!payment) {
        this.showNotification('Payment not found', 'error');
        return;
      }

      const modal = document.getElementById('editPaymentModal');
      const modalTitle = document.getElementById('editModalTitle');
      const customerNameSpan = document.getElementById('editCustomerName');
      const transactionId = document.getElementById('editTransactionId');
      const paymentFields = document.getElementById('editPaymentFields');
      const creditFields = document.getElementById('editCreditNoteFields');

      // Set customer name and transaction ID
      customerNameSpan.textContent = payment.customer_name || 'Unknown';
      transactionId.textContent = `#${payment.id}`;

      // Store payment ID for saving later
      this.currentEditPaymentId = payment.id;
      this.currentEditPaymentType = payment.type;

      if (payment.type === 'PAYMENT') {
        // Show payment fields, hide credit note fields
        paymentFields.style.display = 'block';
        creditFields.style.display = 'none';
        modalTitle.textContent = 'Edit Payment';

        // Populate payment fields
        document.getElementById('editAmount').value = payment.amount || 0;
        document.getElementById('editPaymentMethod').value = payment.payment_medium || '';
        
        // Handle payment date - ensure proper format
        let paymentDate = new Date().toISOString().split('T')[0];
        if (payment.payment_date) {
          // If it's already a date string like "2026-02-25"
          if (payment.payment_date.includes('T')) {
            paymentDate = payment.payment_date.split('T')[0];
          } else {
            paymentDate = payment.payment_date;
          }
        }
        document.getElementById('editPaymentDate').value = paymentDate;
        
        document.getElementById('editReference').value = payment.reference_number || '';
        document.getElementById('editPaymentNotes').value = payment.notes || '';

      } else if (payment.type === 'CREDIT_NOTE') {
        // Show credit note fields, hide payment fields
        paymentFields.style.display = 'none';
        creditFields.style.display = 'block';
        modalTitle.textContent = 'Edit Credit Note';

        // Populate credit note fields
        document.getElementById('editCreditAmount').value = payment.credit_amount || 0;
        document.getElementById('editCreditReason').value = payment.reason || '';
        
        // Handle credit date - ensure proper format
        let creditDate = new Date().toISOString().split('T')[0];
        if (payment.payment_date) {
          // If it's already a date string like "2026-02-25"
          if (payment.payment_date.includes('T')) {
            creditDate = payment.payment_date.split('T')[0];
          } else {
            creditDate = payment.payment_date;
          }
        }
        document.getElementById('editCreditDate').value = creditDate;
        document.getElementById('editCreditReference').value = payment.reference_number || '';
        document.getElementById('editCreditNotes').value = payment.notes || '';
        
        const attachPreview = document.getElementById('editAttachmentPreviewContainer');
        const attachImg = document.getElementById('editAttachmentPreviewImg');
        const existAttach = document.getElementById('existingCreditAttachment');
        const attachInput = document.getElementById('editCreditAttachment');
        
        if (attachInput) {
          attachInput.value = '';
          attachInput.dataset.compressedData = '';
        }
        
        if (payment.attachment_data) {
          if (existAttach) existAttach.value = payment.attachment_data;
          if (attachImg) attachImg.src = payment.attachment_data;
          if (attachPreview) attachPreview.style.display = 'block';
        } else {
          if (existAttach) existAttach.value = '';
          if (attachPreview) attachPreview.style.display = 'none';
        }
      }

      // Show modal
      modal.classList.remove('hidden');

    } catch (error) {
      log.error('Error opening edit modal:', error);
      alert('Error loading payment details: ' + error.message);
    }
  }

  /**
   * Save payment/credit note edit
   */
  async savePaymentEdit() {
    try {
      if (!this.currentEditPaymentId) {
        alert('Error: No payment selected for editing');
        return;
      }

      const paymentId = this.currentEditPaymentId;
      const paymentType = this.currentEditPaymentType;
      const payload = {};

      if (paymentType === 'PAYMENT') {
        // Validate required fields
        const amount = parseFloat(document.getElementById('editAmount').value);
        if (!amount || amount <= 0) {
          this.showNotification('Please enter a valid amount', 'warning');
          return;
        }

        // Format date properly - convert from datetime-local to ISO date
        let paymentDate = document.getElementById('editPaymentDate').value;
        if (paymentDate && paymentDate.includes('T')) {
          paymentDate = paymentDate.split('T')[0]; // Extract just the date part
        }
        if (!paymentDate) {
          paymentDate = new Date().toISOString().split('T')[0];
        }

        payload.amount = amount;
        payload.payment_medium = document.getElementById('editPaymentMethod').value || 'cash';
        payload.payment_date = paymentDate;
        payload.reference_number = document.getElementById('editReference').value || null;
        payload.notes = document.getElementById('editPaymentNotes').value || null;

      } else if (paymentType === 'CREDIT_NOTE') {
        // Validate required fields
        const creditAmount = parseFloat(document.getElementById('editCreditAmount').value);
        if (!creditAmount || creditAmount <= 0) {
          this.showNotification('Please enter a valid credit amount', 'warning');
          return;
        }

        // Format date properly - convert from datetime-local to ISO date
        let creditDate = document.getElementById('editCreditDate').value;
        if (creditDate && creditDate.includes('T')) {
          creditDate = creditDate.split('T')[0]; // Extract just the date part
        }
        if (!creditDate) {
          creditDate = new Date().toISOString().split('T')[0];
        }

        payload.credit_amount = creditAmount;
        payload.reason = document.getElementById('editCreditReason').value || 'other';
        payload.payment_date = creditDate;
        payload.reference_number = document.getElementById('editCreditReference').value || null;
        payload.notes = document.getElementById('editCreditNotes').value || null;
        
        const attachInput = document.getElementById('editCreditAttachment');
        if (attachInput && attachInput.dataset.compressedData) {
          payload.attachment_data = attachInput.dataset.compressedData;
        } else if (attachInput && attachInput.files && attachInput.files.length > 0) {
          // Fallback
          const file = attachInput.files[0];
          payload.attachment_data = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(file);
          });
        } else {
          const existAttach = document.getElementById('existingCreditAttachment');
          if (existAttach && existAttach.value) {
            payload.attachment_data = existAttach.value;
          } else {
             payload.attachment_data = null; // Explicitly send null if removed
          }
        }
      }

      log.debug('📤 Sending update payload:', payload);

      // Send update to API
      const apiUrl = `${this.getApiBaseUrl()}/api/billing/invoices/payments/${paymentId}`;
      const response = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update payment');
      }

      const result = await response.json();
      log.debug('✓ Update successful:', result);

      this.showNotification('✓ Transaction updated successfully', 'success');

      // Reload data from API
      if (this.billingApp && this.billingApp.loadBillingDataFromAPI) {
        await this.billingApp.loadBillingDataFromAPI();
      }

      // Go back to list view
      this.renderEditBillListView();

    } catch (error) {
      log.error('❌ Error saving payment edit:', error);
      this.showNotification('Error updating transaction: ' + error.message, 'error');
    }
  }

  /**
   * Delete a payment or credit note by ID
   */
  async deletePaymentItem(paymentId) {
    if (!confirm('Are you sure you want to delete this transaction? This action cannot be undone.')) {
      return;
    }

    try {
      // Optimistic removal from in-memory billing data
      if (this.billingApp?.billingData?.payments) {
        this.billingApp.billingData.payments = this.billingApp.billingData.payments.filter(
          p => String(p.id) !== String(paymentId)
        );
      }

      const apiUrl = `${this.getApiBaseUrl()}/api/billing/invoices/payments/${paymentId}`;
      const response = await fetch(apiUrl, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete payment');
      }

      log.debug('✓ Delete successful');
      if (this.billingApp?.showNotification) {
        this.billingApp.showNotification('Transaction deleted successfully', 'success');
      }

      if (this.billingApp?.api) {
        this.billingApp.api.invalidateCache('/billing');
      }

      if (typeof window !== 'undefined' && window.CoreDataBus) {
        window.CoreDataBus.publish('billing:payment', 'deleted', { id: paymentId });
        window.CoreDataBus.publish('billing:ledger', 'updated', { id: paymentId });
      }

      // Reload data from API with forceRefresh
      if (this.billingApp && this.billingApp.loadBillingDataFromAPI) {
        await this.billingApp.loadBillingDataFromAPI({ forceRefresh: true });
      }

      // Sync ledger if mounted
      const ledgerInstance = this.billingApp?._subviewInstances?.get('ledger');
      if (ledgerInstance) {
        await ledgerInstance.syncWithServer(true);
      }

      // Refresh payment-credit view if mounted
      const paymentView = this.billingApp?._subviewInstances?.get('payment-credit');
      if (paymentView && typeof paymentView.loadRecentTransactions === 'function') {
        paymentView.billingData = this.billingApp.billingData;
        paymentView.loadRecentTransactions();
        paymentView.updateStatsDisplay?.();
      }

      // Go back to list view
      this.renderEditBillListView();

    } catch (error) {
      log.error('❌ Error deleting payment:', error);
      this.showNotification('Error deleting transaction: ' + error.message, 'error');
    }
  }

  /**
   * Delete a payment or credit note (from edit view - wrapper)
   */
  deletePayment() {
    if (!this.currentEditPaymentId) {
      alert('Error: No payment selected for deletion');
      return;
    }
    this.deletePaymentItem(this.currentEditPaymentId);
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
      modal.className = 'mrp-update-modal-overlay';
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

      closeBtn.addEventListener('click', () => {
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

  async updateProductDatabase(product, field, newValue) {
    if (!this.apiEnabled) {
      alert('Product database updates require API connection');
      return;
    }

    try {
      log.debug(`🔄 Updating product master: ${field} -> ${newValue}`, product);
      
      // Get IDs
      let variantId = product.variant_id || (this.currentEditProduct?.variant_id);
      let batchId = product.batch_id || (this.currentEditProduct?.batch_id);
      let batchNo = product.batch || product.batch_no || (this.currentEditProduct?.batch_no);
      let productId = product.product_id || (this.currentEditProduct?.id || this.currentEditProduct?.product_id);

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

        // Update local object and currentEditProduct for subsequent use
        if (this.currentEditProduct) {
          this.currentEditProduct.variant_id = variantId;
          this.currentEditProduct.batch_id = batchId;
          this.currentEditProduct.batch_no = batchNo;
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
      const batchNo = product.batch || product.batch_no || (this.currentEditProduct?.batch_no);
      const variantId = product.variant_id || (this.currentEditProduct?.variant_id);
      
      if (!batchNo || !variantId) {
        alert('Cannot update MRP: Batch info or Variant ID missing');
        return;
      }

      const response = await fetch('/api/products/update-mrp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          product_id: product.product_id || (this.currentEditProduct?.id || this.currentEditProduct?.product_id),
          variant_id: variantId,
          batch_no: batchNo,
          mrp: parseFloat(newMRP)
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const result = await response.json();
      log.debug('✅ MRP updated in database:', result);
      alert(`✓ MRP updated in database for batch ${batchNo}`);
    } catch (error) {
      log.error('❌ Failed to update MRP in database:', error);
      alert(`Failed to update MRP in database: ${error.message}`);
    }
  }
}

// Export to global scope
window.EditBillsPayments = EditBillsPayments;
