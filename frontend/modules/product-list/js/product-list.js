const log = (typeof window !== 'undefined' && window.MacOSLogger) ? window.MacOSLogger.createScope('ProductList') : { debug: () => {}, info: () => {}, warn: console.warn.bind(console), error: console.error.bind(console) };

import { BillingAPI } from '/modules/billing/js/billing-app.js';
import { QRGenerator } from '/modules/product-list/js/qr-generator.js';

/**
 * ProductBatch - Represents a batch of product variants
 */
class ProductBatch {
  constructor(batchNo, mfgDate, expiryDate, mrp, unitsSold = 0) {
    this.batchNo = batchNo;
    this.mfgDate = mfgDate; // Manufacturing date
    this.expiryDate = expiryDate; // Expiry date
    this.mrp = mrp;
    this.unitsSold = unitsSold;
  }
}

/**
 * ProductVariant - Represents a variant of a product (e.g., 500ml, 1L)
 */
class ProductVariant {
  constructor(packSize) {
    this.packSize = packSize; // e.g., "500ml", "1L"
    this.batches = []; // Array of ProductBatch objects
  }

  addBatch(batch) {
    this.batches.push(batch);
    this.sortBatches();
  }

  sortBatches() {
    this.batches.sort((a, b) => 
      (a.batchNo || '').localeCompare(b.batchNo || '', undefined, { numeric: true, sensitivity: 'base' })
    );
  }

  removeBatch(batchNo) {
    this.batches = this.batches.filter(b => b.batchNo !== batchNo);
  }

  getBatch(batchNo) {
    return this.batches.find(b => b.batchNo === batchNo);
  }
}

/**
 * Product - Represents a complete product with variants
 */
class Product {
  constructor(name, category, isGold = false) {
    this.id = null; // Will be set by API when created
    this.name = name;
    this.category = category;
    this.isGold = isGold; // Gold or Non-gold classification
    this.classification = ''; // Additional classification field
    this.variants = []; // Array of ProductVariant objects
    this.createdAt = new Date();
    this.lastUpdated = new Date();
  }

  addVariant(variant) {
    // Check if variant already exists
    if (!this.variants.find(v => v.packSize === variant.packSize)) {
      this.variants.push(variant);
      this.sortVariants();
      this.lastUpdated = new Date();
      return true;
    }
    return false;
  }

  sortVariants() {
    this.variants.sort((a, b) => {
      let valA = a.pack_size_value !== undefined && a.pack_size_value !== null ? parseFloat(a.pack_size_value) : NaN;
      let valB = b.pack_size_value !== undefined && b.pack_size_value !== null ? parseFloat(b.pack_size_value) : NaN;
      
      if (isNaN(valA)) {
        const matchA = (a.packSize || '').toString().match(/^([\d.]+)/);
        valA = matchA ? parseFloat(matchA[1]) : NaN;
      }
      if (isNaN(valB)) {
        const matchB = (b.packSize || '').toString().match(/^([\d.]+)/);
        valB = matchB ? parseFloat(matchB[1]) : NaN;
      }
      
      if (!isNaN(valA) && !isNaN(valB) && valA !== valB) {
        return valA - valB;
      }
      return (a.packSize || '').toString().localeCompare((b.packSize || '').toString(), undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  removeVariant(packSize) {
    this.variants = this.variants.filter(v => v.packSize !== packSize);
    this.lastUpdated = new Date();
  }

  getVariant(packSize) {
    return this.variants.find(v => v.packSize === packSize);
  }

  getTotalUnitsSold() {
    return this.variants.reduce((total, variant) => {
      return total + variant.batches.reduce((sum, batch) => sum + batch.unitsSold, 0);
    }, 0);
  }
}

/**
 * Utility function to safely convert a date to ISO string month format (YYYY-MM)
 * Handles Date objects, strings, null, and invalid dates
 */
function safeGetMonthValue(dateValue) {
  if (!dateValue) return '';
  try {
    const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().substring(0, 7);
  } catch (e) {
    return '';
  }
}

/**
 * Detects the most common mfg→expiry year gap across all batches of a product.
 * Returns the gap as an integer (1–15) if found, or null if no data.
 */
function getProductExpiryGap(product) {
  if (!product || !product.variants) return null;
  const gapCounts = {};
  for (const variant of product.variants) {
    for (const batch of (variant.batches || [])) {
      if (!batch.mfgDate || !batch.expiryDate) continue;
      const mfg = batch.mfgDate instanceof Date ? batch.mfgDate : new Date(batch.mfgDate);
      const exp = batch.expiryDate instanceof Date ? batch.expiryDate : new Date(batch.expiryDate);
      if (isNaN(mfg) || isNaN(exp)) continue;
      const gap = Math.round((exp.getFullYear() - mfg.getFullYear()) +
        (exp.getMonth() - mfg.getMonth()) / 12);
      if (gap >= 1 && gap <= 15) {
        gapCounts[gap] = (gapCounts[gap] || 0) + 1;
      }
    }
  }
  const entries = Object.entries(gapCounts);
  if (!entries.length) return null;
  // Return the most frequent gap (mode)
  return parseInt(entries.sort((a, b) => b[1] - a[1])[0][0]);
}

/**
 * Computes the mfg->expiry year gap for a single batch (for pre-selecting the picker).
 * Returns a string '1'-'15' or empty string.
 */
function getBatchYearGap(mfgDate, expiryDate) {
  if (!mfgDate || !expiryDate) return '';
  const mfg = mfgDate instanceof Date ? mfgDate : new Date(mfgDate);
  const exp = expiryDate instanceof Date ? expiryDate : new Date(expiryDate);
  if (isNaN(mfg) || isNaN(exp)) return '';
  const gap = Math.round((exp.getFullYear() - mfg.getFullYear()) + (exp.getMonth() - mfg.getMonth()) / 12);
  return (gap >= 1 && gap <= 15) ? String(gap) : '';
}

/**
 * Returns <option> HTML for the expiry year picker (1-15 yrs).
 * Pass selected value as string '1'-'15' to pre-select.
 */
function expiryYearOptions(selected = '') {
  let opts = `<option value="">+yrs</option>`;
  for (let i = 1; i <= 15; i++) {
    opts += `<option value="${i}"${String(selected) === String(i) ? ' selected' : ''}>${i} yr${i > 1 ? 's' : ''}</option>`;
  }
  return opts;
}

/**
 * Detects the most common pack size unit (TAB, ML, GMS, etc.) across
 * all existing variants of a product.
 * Returns the unit string (e.g. 'TAB') or '' if none found.
 */
function getProductPackUnit(product) {
  if (!product || !product.variants || !product.variants.length) return '';
  const counts = {};
  for (const v of product.variants) {
    // Try pack_size_type first, then parse from packSize string (e.g. "200.0ML" → "ML")
    let unit = (v.pack_size_type || '').toUpperCase().trim();
    if (!unit && v.packSize) {
      const m = v.packSize.toString().match(/^[\d.]+(.+)$/);
      if (m) unit = m[1].toUpperCase().trim();
    }
    if (unit) counts[unit] = (counts[unit] || 0) + 1;
  }
  const entries = Object.entries(counts);
  if (!entries.length) return '';
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * Notification System - Shows user feedback for success/error/warning
 */
class NotificationManager {
  constructor() {
    this.container = null;
    this.initContainer();
  }

  initContainer() {
    this.container = document.getElementById('notification-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'notification-container';
      this.container.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000; font-family: system-ui;';
      document.body.appendChild(this.container);
    }
  }

  show(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    const colors = {
      success: '#34c759',
      error: '#ff3b30',
      warning: '#ff9500',
      info: '#0071e3'
    };
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    notification.style.cssText = `
      background: ${colors[type] || colors.info};
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      margin-bottom: 10px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideIn 0.3s ease;
      max-width: 300px;
      word-break: break-word;
    `;
    notification.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    
    this.container.appendChild(notification);
    
    if (duration > 0) {
      setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
      }, duration);
    }

    return notification;
  }
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(400px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }
  @keyframes slideOut {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(400px);
    }
  }
`;
if (document.head) document.head.appendChild(style);

/**
 * ProductListApp - A product management application
 * Extends the standardized AppWindow for product management
 * Features: Create, edit, manage products with drag and resize functionality
 */

export class ProductListApp extends AppWindow {
  constructor(containerId, callbacks = {}) {
    const width = window.innerWidth;
    let config = { appId: 'product-list', appName: 'Product List', containerId: containerId, callbacks: callbacks };
    
    if (width < 768) {
      const mobileSizes = AppWindow.calculateMobileSizing();
      config = { ...config, width: mobileSizes.width, height: mobileSizes.height };
    } else if (width < 1024) {
      config = { ...config, width: '550px', height: '500px' };
    } else {
      config = { ...config, width: '600px', height: '500px' };
    }
    
    super(config);

    this.api = new BillingAPI('/api'); // Initialize API client pointing to backend
    this.apiEnabled = false; // Will be set to true when backend is ready
    this.products = [];
    this.categories = []; // Categories loaded only from API
    this.currentView = 'all';
    this.searchQuery = ''; // Store current search query
    this.notifications = new NotificationManager();
    this.setupProductUI();
    this.checkBackendConnection();
  }

  normalizeApiCollection(payload, fallback = []) {
    if (Array.isArray(payload)) return payload;
    if (!payload) return fallback;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.data)) return payload.data;
    if (payload.data && Array.isArray(payload.data.items)) return payload.data.items;
    if (payload.data && Array.isArray(payload.data.data)) return payload.data.data;
    if (Array.isArray(payload.products)) return payload.products;
    if (Array.isArray(payload.categories)) return payload.categories;
    return fallback;
  }

  async checkBackendConnection() {
    try {
      // Try to load products to check if API is available
      const products = await this.api.getProducts();
      const normalizedProducts = this.normalizeApiCollection(products, []);
      log.debug('Products response:', products, 'Type:', typeof products, 'Is Array:', Array.isArray(products), 'Normalized Length:', normalizedProducts.length);
      
      if (Array.isArray(normalizedProducts)) {
        this.apiEnabled = true;
        log.debug('✅ Backend connected for Products - ' + normalizedProducts.length + ' products available');
        // Load products and categories after confirming backend is available
        await this.loadProducts();
        await this.loadCategoriesFromAPI();
      } else {
        log.warn('⚠️ Products response is not a valid array:', products);
        this.apiEnabled = false;
        this.notifications.show('⚠️ Backend returned invalid data - API required', 'warning', 4000);
        this.renderProductsView();
      }
    } catch (error) {
      log.error('❌ Backend unavailable for Products:', error.message);
      this.apiEnabled = false;
      this.notifications.show('⚠️ Backend not available - API required', 'warning', 4000);
      // API is required - show empty state
      this.renderProductsView();
    }
  }

  async loadProducts() {
    if (!this.apiEnabled) {
      log.error('API not available - cannot load products');
      return;
    }
    
    try {
      const products = await this.api.getProducts();
      const normalizedProducts = this.normalizeApiCollection(products, []);
      log.debug('✅ Products loaded from API:', normalizedProducts.length, 'products');
      this.products = normalizedProducts.map(p => this.deserializeProductFromAPI(p));
      this.renderProductsView();
    } catch (error) {
      log.error('Error loading products from API:', error);
      this.notifications.show('Failed to load products from API', 'error', 3000);
    }
  }

  deserializeProductFromAPI(apiProduct) {
    const product = new Product(apiProduct.name, apiProduct.category_name || 'Uncategorized', false);
    product.id = apiProduct.id;
    product.category_id = apiProduct.category_id;
    product.category_name = apiProduct.category_name;
    product.classification = apiProduct.classification;
    product.odia_name = apiProduct.odia_name || '';
    product.created_by_role = apiProduct.created_by_role;
    product.created_by_name = apiProduct.created_by_name;
    product.last_edited_by_role = apiProduct.last_edited_by_role;
    product.last_edited_by_name = apiProduct.last_edited_by_name;
    product.createdAt = new Date(apiProduct.created_at);
    product.lastUpdated = apiProduct.updated_at ? new Date(apiProduct.updated_at) : new Date(apiProduct.created_at);
    
    // Parse variants array from API response (new normalized schema)
    if (Array.isArray(apiProduct.variants)) {
      apiProduct.variants.forEach(vData => {
        // Combine pack_size_value and pack_size_type
        const packSize = vData.pack_size_value && vData.pack_size_type 
          ? `${vData.pack_size_value}${vData.pack_size_type}`
          : (vData.pack_size_value ? vData.pack_size_value.toString() : '');
        
        const variant = new ProductVariant(packSize);
        // Store the individual pack_size fields for later API serialization
        variant.id = vData.id;
        variant.pack_size_value = vData.pack_size_value;
        variant.pack_size_type = vData.pack_size_type;
        
        if (vData.batches && Array.isArray(vData.batches)) {
          vData.batches.forEach(bData => {
            const batch = new ProductBatch(
              bData.batch_no,
              bData.mfg_date ? new Date(bData.mfg_date) : null,
              bData.exp_date ? new Date(bData.exp_date) : null,
              bData.mrp,
              bData.units_sold || 0
            );
            batch.id = bData.id;
            variant.addBatch(batch);
          });
        }
        product.addVariant(variant);
      });
    }
    
    return product;
  }

  setupProductUI() {
    // Build the product UI
    this.buildProductLayout();

    // Add custom header controls
    this.setupHeaderControls();

    // Setup product-specific event listeners
    this.setupProductEventListeners();

    // Render initial state
    this.renderAllProducts();

    // Store reference for app management
    window.currentProductApp = this;

    // Listen for worker badge visibility toggle
    window.addEventListener('worker-badges-toggle-changed', () => {
      if (this.currentView === 'all') {
        this.renderAllProducts();
      }
    });
  }

  buildProductLayout() {
    const contentArea = this.getContentArea();
    contentArea.innerHTML = `
      <!-- Sidebar Navigation -->
      <div class="product-sidebar">
        <button class="product-menu-item active" data-view="all">📦 All Products</button>
        <button class="product-menu-item" data-view="create">➕ New Product</button>
        <button class="product-menu-item" data-view="categories">📂 Categories</button>
        <button class="product-menu-item" data-view="inventory">📊 Inventory</button>
      </div>

      <!-- Main View -->
      <div class="product-main">
        <div class="product-header">
          <div class="product-header-info">
            <h2 class="product-header-title">All Products</h2>
            <p class="product-header-subtitle">Manage and organize your products</p>
          </div>
          <div class="product-header-actions">
            <button class="product-action-btn print-master-catalog-action" style="background-color: var(--color-surface); border: 1px solid var(--color-border); color: var(--color-text);">🖨️ Print Master Catalog</button>
            <button class="product-action-btn new-product-action">+ New Product</button>
          </div>
        </div>

        <div class="product-view-container">
          <div class="product-empty-state">
            <div>
              <p>📦</p>
              <p>Product List</p>
              <p>Manage your product inventory</p>
            </div>
          </div>
        </div>
      </div>
    `;

    // Setup element references
    this.sidebar = contentArea.querySelector('.product-sidebar');
    this.mainView = contentArea.querySelector('.product-main');
    this.header = contentArea.querySelector('.product-header');
    this.viewContainer = contentArea.querySelector('.product-view-container');
    this.headerTitle = contentArea.querySelector('.product-header-title');
    this.headerSubtitle = contentArea.querySelector('.product-header-subtitle');
    this.menuItems = contentArea.querySelectorAll('.product-menu-item');
    this.newProductBtn = contentArea.querySelector('.new-product-action');
  }

  setupHeaderControls() {
    const container = document.getElementById(this.containerId);
    const titleBar = container.querySelector('.app-title-bar');
    
    if (!titleBar) return;
    
    // Create left controls group (after traffic lights)
    const leftControls = document.createElement('div');
    leftControls.className = 'product-left-controls';
    const expandBtn = document.createElement('button');
    expandBtn.className = 'product-header-btn';
    expandBtn.id = 'productExpandBtn';
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
    rightControls.className = 'product-header-controls';
    
    // Create buttons container (Edit, Add)
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'product-header-buttons';
    buttonsContainer.innerHTML = `
      <button class="product-header-btn" id="productEditBtn" title="Edit Product">✎</button>
      <button class="product-header-btn" id="productAddBtn" title="Add Product">+</button>
    `;
    
    // Create search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'product-header-search';
    searchInput.id = 'productHeaderSearch';
    searchInput.placeholder = 'Search products...';
    
    rightControls.appendChild(buttonsContainer);
    rightControls.appendChild(searchInput);
    
    // Replace spacer with right controls
    spacer.parentNode.replaceChild(rightControls, spacer);
    
    // Store references
    this.searchInput = searchInput;
    this.expandBtn = expandBtn;
    
    // Setup sidebar toggle functionality
    this.expandBtn.addEventListener('click', () => this.toggleSidebar());
    document.getElementById('productAddBtn')?.addEventListener('click', () => this.switchView('create'));
    
    // Setup search functionality matching billing app
    if (this.searchInput) {
      this.setupSearchFunctionality();
    }
  }

  setupSearchFunctionality() {
    if (!this.searchInput) return;

    this.searchInput.placeholder = 'Search products, variants, batches...';

    // Create dropdown for search results using EXACT billing app style
    this.searchDropdown = document.createElement('div');
    this.searchDropdown.id = 'productSearchDropdown';
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

    // Debounce search input
    let searchTimeout;
    this.searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const query = e.target.value.trim().toLowerCase();
      this.searchQuery = query;
      
      searchTimeout = setTimeout(() => {
        if (query) {
          this.performGlobalSearchWithDropdown(query);
        } else {
          this.searchDropdown.style.display = 'none';
        }
      }, 200);

      if (this.currentView === 'all') {
        this.renderAllProducts();
      }
    });

    this.searchInput.addEventListener('focus', (e) => {
      const query = e.target.value.trim().toLowerCase();
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

    document.addEventListener('click', (e) => {
      if (!e.target.closest('#productHeaderSearch') && !e.target.closest('#productSearchDropdown')) {
        if (this.searchDropdown) this.searchDropdown.style.display = 'none';
      }
    });
  }

  async performGlobalSearchWithDropdown(query) {
    if (!query || !this.searchDropdown) {
      if (this.searchDropdown) {
        this.searchDropdown.style.display = 'none';
      }
      return;
    }

    try {
      if (!this.products || this.products.length === 0) {
        try {
          const apiProds = await this.api.getProducts();
          const normalizedProducts = this.normalizeApiCollection(apiProds, []);
          if (Array.isArray(normalizedProducts)) {
            this.products = normalizedProducts.map(p => this.deserializeProductFromAPI(p));
          }
        } catch (e) {
          log.warn('Could not fetch products on demand:', e.message);
        }
      }

      const results = this.searchAllProductsData(query);
      this.populateSearchDropdown(results);
      
      if (results.length === 0) {
        this.searchDropdown.innerHTML = `<div style="padding: 12px 16px; color: #999; text-align: center;">No results found</div>`;
        this.searchDropdown.style.display = 'block';
      }
    } catch (error) {
      log.error('Product search dropdown error:', error);
      if (this.searchDropdown) {
        this.searchDropdown.innerHTML = `<div style="padding: 12px 16px; color: #d9534f; text-align: center;">Search error</div>`;
        this.searchDropdown.style.display = 'block';
      }
    }
  }

  searchAllProductsData(query) {
    const results = [];
    const q = query.toLowerCase().trim();

    if (!this.products || !Array.isArray(this.products)) return results;

    this.products.forEach(product => {
      const name = (product.name || '').toLowerCase();
      const odia = (product.odia_name || '').toLowerCase();
      const cat = (product.category_name || product.category || '').toLowerCase();
      const cls = (product.classification || '').toLowerCase();

      let matchedReason = '';
      let matchedDetails = '';

      if (name.includes(q) || odia.includes(q)) {
        matchedReason = 'product';
      } else if (cat.includes(q)) {
        matchedReason = 'category';
        matchedDetails = `Category: ${product.category}`;
      } else if (cls.includes(q)) {
        matchedReason = 'classification';
        matchedDetails = `Type: ${product.classification || 'Non-Gold'}`;
      }

      if (product.variants && Array.isArray(product.variants)) {
        for (const v of product.variants) {
          const pack = (v.packSize || `${v.pack_size_value || ''} ${v.pack_size_type || ''}`).toLowerCase();
          if (pack.includes(q)) {
            matchedReason = 'variant';
            matchedDetails = `Pack Size: ${v.packSize}`;
            break;
          }
          if (v.batches && Array.isArray(v.batches)) {
            for (const b of v.batches) {
              const bNo = (b.batchNo || b.batch_no || '').toLowerCase();
              const mrp = (b.mrp !== undefined && b.mrp !== null) ? b.mrp.toString() : '';
              if (bNo.includes(q)) {
                matchedReason = 'batch';
                matchedDetails = `Batch: ${b.batchNo} | ₹${b.mrp}`;
                break;
              }
              if (mrp.includes(q)) {
                matchedReason = 'mrp';
                matchedDetails = `MRP: ₹${b.mrp} (${v.packSize})`;
                break;
              }
            }
          }
          if (matchedReason) break;
        }
      }

      if (matchedReason) {
        results.push({
          type: product.classification === 'Gold' ? 'gold_product' : 'product',
          data: product,
          matchedDetails: matchedDetails
        });
      }
    });

    return results;
  }

  populateSearchDropdown(results) {
    if (!this.searchDropdown) return;
    this.searchDropdown.innerHTML = '';

    if (results.length === 0) return;

    const header = document.createElement('div');
    header.style.cssText = 'padding: 8px 16px; background: rgb(245, 245, 245); font-weight: bold; font-size: 11px; color: rgb(102, 102, 102); text-transform: uppercase;';
    header.textContent = `Products (${results.length})`;
    this.searchDropdown.appendChild(header);

    results.forEach(result => {
      const item = this.createDropdownItem(result);
      if (item) this.searchDropdown.appendChild(item);
    });

    this.searchDropdown.style.display = 'block';
  }

  createDropdownItem(result) {
    if (!result || !result.data) return null;
    const product = result.data;

    const item = document.createElement('div');
    item.style.cssText = `
      padding: 12px 16px;
      border-bottom: 1px solid rgb(240, 240, 240);
      cursor: pointer;
      transition: background-color 0.2s;
      font-size: 13px;
    `;
    item.onmouseover = () => item.style.backgroundColor = '#f9f9f9';
    item.onmouseout = () => item.style.backgroundColor = 'transparent';

    const priceDisplay = this.calculateProductPriceRange(product);
    const variantCount = product.variants ? product.variants.length : 0;
    const variantsText = product.variants ? product.variants.map(v => v.packSize).join(', ') : '';

    item.innerHTML = `
      <div style="font-weight: 500; color: #222; display: flex; justify-content: space-between; align-items: center;">
        <span>
          ${product.name}
          ${product.odia_name ? `<span style="font-family: 'Noto Sans Oriya', 'Lohit Odia', sans-serif; font-size: 12px; color: #666; font-weight: normal; margin-left: 4px;">(${product.odia_name})</span>` : ''}
        </span>
        <span style="font-size: 10px; font-weight: 700; background: ${product.classification === 'Gold' ? '#ffd700' : '#eee'}; color: ${product.classification === 'Gold' ? '#333' : '#666'}; padding: 2px 6px; border-radius: 3px;">
          ${product.classification === 'Gold' ? '✨ GOLD' : 'NON-GOLD'}
        </span>
      </div>
      <div style="font-size: 12px; color: #999; margin-top: 2px; display: flex; justify-content: space-between;">
        <span>📂 ${product.category} | ${variantCount} variant(s)${variantsText ? `: ${variantsText}` : ''}</span>
        ${priceDisplay ? `<span style="color: #059669; font-weight: 600;">${priceDisplay}</span>` : ''}
      </div>
      ${result.matchedDetails ? `<div style="font-size: 11px; color: #0066cc; margin-top: 2px;">🔍 Matched: ${result.matchedDetails}</div>` : ''}
    `;

    item.addEventListener('click', () => {
      this.handleDropdownItemClick(product);
    });

    return item;
  }

  handleDropdownItemClick(product) {
    if (this.searchDropdown) {
      this.searchDropdown.style.display = 'none';
    }

    if (this.currentView !== 'all') {
      this.switchView('all');
    }

    setTimeout(() => {
      const card = this.viewContainer.querySelector(`[data-product-id="${product.id}"]`);
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
    }, 150);
  }

  toggleSidebar() {
    this.sidebar?.classList.toggle('hidden');
  }

  filterProducts() {
    if (!this.searchQuery) {
      return this.products;
    }

    const q = this.searchQuery.trim();
    if (!q) return this.products;

    // Fast-Path: Rust WebAssembly typo-tolerant fuzzy search (<0.5ms)
    if (typeof window !== 'undefined' && window.SuiteCoreBridge && window.SuiteCoreBridge.isWasmLoaded()) {
      try {
        const fuzzyResults = window.SuiteCoreBridge.searchCatalog(q, this.products, {
          min_score: 25.0,
          limit: this.products.length
        });
        if (Array.isArray(fuzzyResults) && fuzzyResults.length > 0) {
          return fuzzyResults;
        }
      } catch (err) {
        log.warn('[ProductList] WASM fuzzy search fallback:', err);
      }
    }

    const qLower = q.toLowerCase();
    return this.products.filter(product => {
      const name = (product.name || '').toLowerCase();
      const odiaName = (product.odia_name || '').toLowerCase();
      const category = (product.category_name || product.category || '').toLowerCase();
      const classification = (product.classification || '').toLowerCase();
      
      if (name.includes(qLower) || odiaName.includes(qLower) || category.includes(qLower) || classification.includes(qLower)) {
        return true;
      }

      if (product.variants && Array.isArray(product.variants)) {
        for (const variant of product.variants) {
          const packSize = (variant.packSize || `${variant.pack_size_value || ''} ${variant.pack_size_type || ''}`).toLowerCase();
          if (packSize.includes(q)) return true;

          if (variant.batches && Array.isArray(variant.batches)) {
            for (const batch of variant.batches) {
              const batchNo = (batch.batchNo || batch.batch_no || '').toLowerCase();
              const mrp = (batch.mrp !== undefined && batch.mrp !== null) ? batch.mrp.toString() : '';
              if (batchNo.includes(q) || mrp.includes(q)) return true;
            }
          }
        }
      }
      return false;
    });
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

    if (!found) return '';
    if (min === max) return `₹${min.toFixed(2)}`;
    return `₹${min.toFixed(2)} - ₹${max.toFixed(2)}`;
  }

  handleSmartSearch(query) {
    if (!this.searchDropdown) return;
    const q = (query || '').toLowerCase().trim();
    if (!q) {
      this.hideSearchDropdown();
      return;
    }

    const matches = this.products.filter(product => {
      const name = (product.name || '').toLowerCase();
      const odia = (product.odia_name || '').toLowerCase();
      const cat = (product.category_name || product.category || '').toLowerCase();
      const cls = (product.classification || '').toLowerCase();

      if (name.includes(q) || odia.includes(q) || cat.includes(q) || cls.includes(q)) return true;

      if (product.variants && Array.isArray(product.variants)) {
        for (const v of product.variants) {
          const pack = (v.packSize || `${v.pack_size_value || ''} ${v.pack_size_type || ''}`).toLowerCase();
          if (pack.includes(q)) return true;
          if (v.batches && Array.isArray(v.batches)) {
            for (const b of v.batches) {
              const bNo = (b.batchNo || b.batch_no || '').toLowerCase();
              const mrp = (b.mrp !== undefined && b.mrp !== null) ? b.mrp.toString() : '';
              if (bNo.includes(q) || mrp.includes(q)) return true;
            }
          }
        }
      }
      return false;
    });

    this.renderSearchDropdown(matches, q);
  }

  renderSearchDropdown(matches, query) {
    if (!this.searchDropdown) return;
    if (matches.length === 0) {
      this.searchDropdown.innerHTML = `<div style="padding: 14px; text-align: center; color: #94a3b8; font-size: 12px;">No matching products found</div>`;
      this.searchDropdown.style.display = 'block';
      this.isDropdownOpen = true;
      this.selectedIndex = -1;
      return;
    }

    this.dropdownMatches = matches;
    this.selectedIndex = -1;
    this.isDropdownOpen = true;

    this.searchDropdown.innerHTML = matches.map((product, idx) => {
      const priceRange = this.calculateProductPriceRange(product);
      const varCount = product.variants ? product.variants.length : 0;
      const packs = product.variants ? product.variants.map(v => v.packSize).join(', ') : '';
      return `
        <div class="product-search-item" data-index="${idx}" data-product-id="${product.id}">
          <div class="product-search-item-header">
            <div class="product-search-item-title">
              <span>${product.name}</span>
              ${product.odia_name ? `<span style="font-family: 'Noto Sans Oriya', 'Lohit Odia', sans-serif; font-size: 12px; font-weight: normal; color: #64748b;">(${product.odia_name})</span>` : ''}
            </div>
            <span class="product-badge ${product.classification === 'Gold' ? 'gold' : 'non-gold'}" style="font-size: 10px; padding: 2px 6px;">
              ${product.classification === 'Gold' ? '✨ Gold' : 'Non-Gold'}
            </span>
          </div>
          <div class="product-search-item-meta">
            <span>📂 ${product.category}</span>
            ${priceRange ? `<span class="product-search-item-mrp">💰 ${priceRange}</span>` : ''}
            <span>📦 ${varCount} variant${varCount !== 1 ? 's' : ''}${packs ? ` (${packs})` : ''}</span>
          </div>
        </div>
      `;
    }).join('');

    this.searchDropdown.querySelectorAll('.product-search-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.index);
        const prod = this.dropdownMatches[idx];
        this.selectSmartSearchResult(prod);
      });
    });

    this.searchDropdown.style.display = 'block';
  }

  handleSearchKeydown(e) {
    if (!this.isDropdownOpen || !this.searchDropdown) return;
    const items = this.searchDropdown.querySelectorAll('.product-search-item');
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
      if (this.selectedIndex >= 0 && this.dropdownMatches && this.dropdownMatches[this.selectedIndex]) {
        e.preventDefault();
        this.selectSmartSearchResult(this.dropdownMatches[this.selectedIndex]);
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

  selectSmartSearchResult(product) {
    if (!product) return;
    this.hideSearchDropdown();
    
    // Switch to all products view if not already there
    if (this.currentView !== 'all') {
      this.switchView('all');
    }

    setTimeout(() => {
      const card = this.viewContainer.querySelector(`[data-product-id="${product.id}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.remove('product-card-highlight');
        void card.offsetWidth; // trigger reflow
        card.classList.add('product-card-highlight');
      }
    }, 150);
  }

  hideSearchDropdown() {
    if (this.searchDropdown) {
      this.searchDropdown.style.display = 'none';
      this.isDropdownOpen = false;
      this.selectedIndex = -1;
    }
  }

  setupProductEventListeners() {
    // Menu item click handlers
    this.menuItems.forEach(item => {
      item.addEventListener('click', () => this.switchView(item.dataset.view));
    });

    // New product button
    this.newProductBtn?.addEventListener('click', () => this.switchView('create'));

    // Master catalog print button
    const printMasterBtn = this.getContentArea().querySelector('.print-master-catalog-action');
    if (printMasterBtn) {
      printMasterBtn.addEventListener('click', () => this.printMasterCatalog());
    }
  }

  switchView(viewName) {
    this.currentView = viewName;
    
    // Clear search when switching views
    this.searchQuery = '';
    if (this.searchInput) {
      this.searchInput.value = '';
    }
    
    // Update active menu item
    this.menuItems.forEach(item => {
      item.classList.remove('active');
      if (item.dataset.view === viewName) {
        item.classList.add('active');
      }
    });

    // Update header and render view
    this.updateHeader(viewName);
    this.renderView(viewName);
  }

  updateHeader(viewName) {
    const headers = {
      all: { 
        title: 'All Products', 
        subtitle: 'View all products in inventory' 
      },
      create: { 
        title: 'Create New Product', 
        subtitle: 'Add a new product to your inventory' 
      },
      edit: { 
        title: 'Edit Product', 
        subtitle: 'Modify product information and variants' 
      },
      categories: { 
        title: 'Manage Categories', 
        subtitle: 'Organize products by category' 
      },
      inventory: { 
        title: 'Inventory Overview', 
        subtitle: 'Track product quantities and stock levels' 
      },
      qrcodes: {
        title: 'QR Code & Catalog Printing',
        subtitle: 'Generate printable QR codes and product catalogs'
      }
    };

    const header = headers[viewName] || headers.all;
    this.headerTitle.textContent = header.title;
    this.headerSubtitle.textContent = header.subtitle;
  }

  renderView(viewName) {
    switch(viewName) {
      case 'create':
        this.renderCreateProductView();
        break;
      case 'edit':
        // Edit view is handled by renderEditProductView directly
        break;
      case 'categories':
        this.renderCategoriesView();
        break;
      case 'inventory':
        this.renderInventoryView();
        break;
      case 'qrcodes':
        this.renderQRCodesView();
        break;
      case 'all':
      default:
        this.renderAllProducts();
    }
  }



  formatProductForAPI(product) {
    return {
      name: product.name,
      category_id: product.category_id || null,
      category_name: product.category || null,
      classification: product.classification || '',
      variants: product.variants.map(variant => {
        // Map frontend variant structure to database fields (pack_size_value, pack_size_type)
        return {
          id: variant.id || null,
          pack_size_value: variant.pack_size_value || null,
          pack_size_type: variant.pack_size_type || null,
          batches: variant.batches.map(batch => ({
            id: batch.id || null,
            batch_no: batch.batchNo || null,
            mrp: batch.mrp || 0,
            mfg_date: batch.mfgDate || null,
            exp_date: batch.expiryDate || null,
            units_sold: batch.unitsSold || 0
          }))
        };
      })
    };
  }

  validateProduct(product) {
    const invalidVariants = [];
    
    product.variants.forEach((variant, index) => {
      const hasValidBatch = variant.batches.some(batch => batch.batchNo && batch.batchNo.trim() !== '');
      if (!hasValidBatch) {
        invalidVariants.push({
          index,
          packSize: variant.packSize,
          reason: variant.batches.length === 0 ? 'No batches' : 'Empty batch number'
        });
      }
    });
    
    return {
      valid: invalidVariants.length === 0,
      invalidVariants
    };
  }

  async showValidationWarningModal(product, validationResult) {
    return new Promise((resolve) => {
      const modalHtml = `
        <div class="batch-dialog-overlay" id="validationWarningOverlay">
          <div class="batch-dialog warning-dialog" style="max-width: 500px; border-top: 4px solid #ff9500;">
            <h3>⚠️ Incomplete Product Data</h3>
            <p>The following variants are missing valid batch numbers:</p>
            <ul style="margin: 10px 0; padding-left: 20px; color: #d32f2f; font-size: 13px;">
              ${validationResult.invalidVariants.map(v => `<li>Variant <strong>${v.packSize}</strong> (${v.reason})</li>`).join('')}
            </ul>
            <p style="font-size: 13px; color: #666;">Saving as is will cause a server error. Please choose an option:</p>
            
            <div class="warning-options" style="display: flex; flex-direction: column; gap: 10px; margin-top: 20px;">
              <button type="button" class="warning-opt-btn" id="optAddBatch" style="padding: 10px; background: #0071e3; color: white; border: none; border-radius: 6px; cursor: pointer;">Add "DEFAULT" batch to all</button>
              <button type="button" class="warning-opt-btn" id="optRemoveVariants" style="padding: 10px; background: #ff3b30; color: white; border: none; border-radius: 6px; cursor: pointer;">Remove these variants</button>
              <button type="button" class="warning-opt-btn" id="optCancel" style="padding: 10px; background: #f0f0f0; border: 1px solid #ddd; border-radius: 6px; cursor: pointer;">Cancel & Continue Editing</button>
            </div>
          </div>
        </div>
      `;

      const container = document.createElement('div');
      container.innerHTML = modalHtml;
      document.body.appendChild(container);

      const overlay = document.getElementById('validationWarningOverlay');
      
      document.getElementById('optAddBatch').onclick = () => {
        validationResult.invalidVariants.forEach(v => {
          const variant = product.variants[v.index];
          if (variant.batches.length === 0) {
            variant.addBatch(new ProductBatch('DEFAULT', null, null, 0, 0));
          } else {
            variant.batches.forEach(b => {
              if (!b.batchNo || b.batchNo.trim() === '') b.batchNo = 'DEFAULT';
            });
          }
        });
        overlay.parentElement.remove();
        resolve(true); // Proceed with save
      };

      document.getElementById('optRemoveVariants').onclick = () => {
        // Sort indices in descending order to splice without shifting
        const indicesToRemove = validationResult.invalidVariants.map(v => v.index).sort((a, b) => b - a);
        indicesToRemove.forEach(idx => product.variants.splice(idx, 1));
        overlay.parentElement.remove();
        resolve(true); // Proceed with save
      };

      document.getElementById('optCancel').onclick = () => {
        overlay.parentElement.remove();
        resolve(false); // Stop save
      };
    });
  }

  async saveProductToAPI(product) {
    if (!this.apiEnabled || !product) return false;
    
    // Validate product before saving
    const validation = this.validateProduct(product);
    if (!validation.valid) {
      log.warn('Product validation failed:', validation.invalidVariants);
      const shouldProceed = await this.showValidationWarningModal(product, validation);
      if (!shouldProceed) return false;
    }
    
    try {
      const productData = this.formatProductForAPI(product);
      
      if (product.id && product.id > 0) {
        // Update existing product
        log.debug(`Updating product ${product.id}:`, productData);
        await this.api.updateProduct(product.id, productData);
        log.debug(`✓ Product ${product.id} updated in API`);
        this.notifications.show('Product updated successfully!', 'success', 2000);
      } else {
        // Create new product
        log.debug('Creating new product:', productData);
        const result = await this.api.createProduct(productData);
        product.id = result.id;
        log.debug(`✓ Product created in API with ID ${result.id}`);
        this.notifications.show('Product created successfully!', 'success', 2000);
      }
      return true;
    } catch (error) {
      log.error('Error saving product to API:', error);
      this.notifications.show(`Failed to save product: ${error.message}`, 'error', 3000);
      return false;
    }
  }

  async deleteProductFromAPI(productId) {
    if (!this.apiEnabled || !productId) return false;
    
    try {
      log.debug(`Deleting product ${productId} from API`);
      await this.api.deleteProduct(productId);
      log.debug(`✓ Product ${productId} deleted from API`);
      this.notifications.show('Product deleted', 'info', 2000);
      return true;
    } catch (error) {
      log.error('Error deleting product from API:', error);
      this.notifications.show(`Failed to delete product: ${error.message}`, 'error', 3000);
      return false;
    }
  }

  formatVariantForAPI(variant) {
    const packSizeStr = variant.packSize ? variant.packSize.toString() : '';
    const match = packSizeStr.match(/^([\d.]+)(.*)$/);
    const packSizeValue = match ? parseFloat(match[1]) : null;
    const packSizeType = match && match[2] ? match[2].trim() : '';
    
    return {
      pack_size_value: packSizeValue,
      pack_size_type: packSizeType,
      batches: variant.batches.map(batch => ({
        batch_no: batch.batchNo,
        mrp: batch.mrp,
        mfg_date: batch.mfgDate,
        exp_date: batch.expiryDate,
        units_sold: batch.unitsSold || 0
      }))
    };
  }

  async createVariantAPI(productId, variant) {
    if (!this.apiEnabled || !productId || !variant) return null;
    
    try {
      const variantData = this.formatVariantForAPI(variant);
      log.debug(`Creating variant for product ${productId}:`, variantData);
      const result = await this.api.createVariant(productId, variantData);
      log.debug(`✓ Variant created with ID ${result.id}`);
      return result;
    } catch (error) {
      log.error('Error creating variant in API:', error);
      log.warn('Variant saved locally, API sync failed');
      return null;
    }
  }

  async updateVariantAPI(variantId, variant) {
    if (!this.apiEnabled || !variantId || !variant) return false;
    
    try {
      const variantData = this.formatVariantForAPI(variant);
      log.debug(`Updating variant ${variantId}:`, variantData);
      await this.api.updateVariant(variantId, variantData);
      log.debug(`✓ Variant ${variantId} updated in API`);
      return true;
    } catch (error) {
      log.error('Error updating variant in API:', error);
      log.warn('Variant updated locally, API sync failed');
      return false;
    }
  }

  async deleteVariantAPI(variantId) {
    if (!this.apiEnabled || !variantId) return false;
    
    try {
      log.debug(`Deleting variant ${variantId} from API`);
      await this.api.deleteVariant(variantId);
      log.debug(`✓ Variant ${variantId} deleted from API`);
      return true;
    } catch (error) {
      log.error('Error deleting variant from API:', error);
      log.warn('Variant deleted locally, API sync failed');
      return false;
    }
  }

  formatBatchForAPI(batch) {
    return {
      batch_no: batch.batchNo,
      mrp: batch.mrp,
      mfg_date: batch.mfgDate,
      exp_date: batch.expiryDate,
      units_sold: batch.unitsSold || 0
    };
  }

  async createBatchAPI(variantId, batch) {
    if (!this.apiEnabled || !variantId || !batch) return null;
    
    try {
      const batchData = this.formatBatchForAPI(batch);
      log.debug(`Creating batch for variant ${variantId}:`, batchData);
      const result = await this.api.createBatch(variantId, batchData);
      log.debug(`✓ Batch created with ID ${result.id}`);
      return result;
    } catch (error) {
      log.error('Error creating batch in API:', error);
      log.warn('Batch saved locally, API sync failed');
      return null;
    }
  }

  async updateBatchAPI(batchId, batch) {
    if (!this.apiEnabled || !batchId || !batch) return false;
    
    try {
      const batchData = this.formatBatchForAPI(batch);
      log.debug(`Updating batch ${batchId}:`, batchData);
      await this.api.updateBatch(batchId, batchData);
      log.debug(`✓ Batch ${batchId} updated in API`);
      return true;
    } catch (error) {
      log.error('Error updating batch in API:', error);
      log.warn('Batch updated locally, API sync failed');
      return false;
    }
  }

  async deleteBatchAPI(batchId) {
    if (!this.apiEnabled || !batchId) return false;
    
    try {
      log.debug(`Deleting batch ${batchId} from API`);
      await this.api.deleteBatch(batchId);
      log.debug(`✓ Batch ${batchId} deleted from API`);
      return true;
    } catch (error) {
      log.error('Error deleting batch from API:', error);
      log.warn('Batch deleted locally, API sync failed');
      return false;
    }
  }



  async loadCategoriesFromAPI() {
    if (!this.apiEnabled) {
      log.error('API not available - cannot load categories');
      return;
    }
    
    try {
      const categories = await this.api.getCategories();
      const normalizedCategories = this.normalizeApiCollection(categories, []);
      log.debug('Categories response:', categories, 'Type:', typeof categories, 'Is Array:', Array.isArray(categories), 'Normalized Length:', normalizedCategories.length);
      
      if (Array.isArray(normalizedCategories)) {
        this.categories = normalizedCategories; // Store full category objects with id and name
        log.debug('✅ Categories loaded from API:', this.categories.length, 'categories');
      } else {
        log.warn('⚠️ Categories response is not a valid array:', categories);
        this.categories = [];
      }
    } catch (error) {
      log.error('Error loading categories from API:', error.message);
      this.notifications.show('Failed to load categories from API', 'error', 3000);
      this.categories = [];
    }
  }



  deserializeProduct(data) {
    const product = new Product(data.name, data.category, false);
    product.id = data.id;
    product.classification = data.classification || 'Non-Gold';
    product.created_by_role = data.created_by_role;
    product.created_by_name = data.created_by_name;
    product.last_edited_by_role = data.last_edited_by_role;
    product.last_edited_by_name = data.last_edited_by_name;
    product.createdAt = new Date(data.createdAt);
    product.lastUpdated = data.lastUpdated ? new Date(data.lastUpdated) : new Date(data.createdAt);
    
    if (data.variants) {
      data.variants.forEach(vData => {
        const variant = new ProductVariant(vData.packSize);
        if (vData.batches) {
          vData.batches.forEach(bData => {
            const batch = new ProductBatch(
              bData.batchNo,
              bData.mfgDate ? new Date(bData.mfgDate) : null,
              bData.expiryDate ? new Date(bData.expiryDate) : null,
              bData.mrp,
              bData.unitsSold
            );
            variant.addBatch(batch);
          });
        }
        product.addVariant(variant);
      });
    }
    return product;
  }

  renderProductsView() {
    // Render the products view (alias for renderAllProducts)
    this.renderAllProducts();
  }

  renderAllProducts() {
    // Get filtered products based on search query
    const productsToDisplay = this.filterProducts();
    
    if (productsToDisplay.length === 0) {
      // Show empty state or no results message
      const emptyMessage = this.searchQuery 
        ? `No products found matching "${this.searchQuery}"`
        : 'No products yet. Create your first product!';
      
      this.viewContainer.innerHTML = `
        <div class="product-empty-state">
          <div>
            <p class="empty-state-emoji">${this.searchQuery ? '🔍' : '📦'}</p>
            <p class="empty-state-title">Product List</p>
            <p class="empty-state-subtitle">${emptyMessage}</p>
          </div>
        </div>
      `;
      return;
    }

    // Sort products alphabetically by name
    const sortedProducts = [...productsToDisplay].sort((a, b) => {
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    // Group products by first letter
    const groupedProducts = {};
    sortedProducts.forEach(product => {
      const firstLetter = product.name.charAt(0).toUpperCase();
      if (!groupedProducts[firstLetter]) {
        groupedProducts[firstLetter] = [];
      }
      groupedProducts[firstLetter].push(product);
    });

    // Get sorted letters
    const sortedLetters = Object.keys(groupedProducts).sort();

    this.viewContainer.innerHTML = `
      <div class="product-list-container">
        ${sortedLetters.map(letter => `
          <div class="products-letter-section" data-letter="${letter}">
            <div class="products-letter-divider">
              <span class="divider-chevron">▼</span>
              <span class="divider-letter">${letter}</span>
            </div>
            ${groupedProducts[letter].map(product => {
              const auditInfo = JSON.stringify({
                type: 'Product',
                id: product.id,
                name: product.name,
                created_by_role: product.created_by_role,
                created_by_name: product.created_by_name,
                last_edited_by_role: product.last_edited_by_role,
                last_edited_by_name: product.last_edited_by_name,
                date: product.createdAt,
                created_at: product.createdAt,
                updated_at: product.lastUpdated
              });
              return `
          <div class="product-card" data-product-id="${product.id}" data-worker-audit='${auditInfo.replace(/'/g, "&#39;")}'>
            <div class="product-card-header">
              <div class="product-card-title">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                  <h3>${product.name}</h3>
                  ${product.odia_name ? `<span class="product-odia-title" style="font-size: 13px; color: #64748b; font-weight: normal; margin-left: 2px;">(${product.odia_name})</span>` : ''}
                  <span class="product-badge ${product.classification === 'Gold' ? 'gold' : 'non-gold'}">
                    ${product.classification === 'Gold' ? '✨ Gold' : 'Non-Gold'}
                  </span>
                  ${window.renderWorkerBadge ? window.renderWorkerBadge(product) : ''}
                </div>
              </div>
              <div class="product-card-actions">
                <button class="product-card-btn print-product-qr" data-product-id="${product.id}" title="Print QR">🖨️ QR</button>
                <button class="product-card-btn edit-product" data-product-id="${product.id}" title="Edit">✎</button>
                <button class="product-card-btn delete-product" data-product-id="${product.id}" title="Delete">✕</button>
              </div>
            </div>
            
            <div class="product-card-details">
              <span class="product-detail">📂 ${product.category}</span>
              <span class="product-detail">📊 Total Sold: ${product.getTotalUnitsSold()} units</span>
              <span class="product-detail">📅 Created: ${product.createdAt.toLocaleDateString()}</span>
              ${product.lastUpdated.toLocaleDateString() !== product.createdAt.toLocaleDateString() ? `<span class="product-detail">✏️ Updated: ${product.lastUpdated.toLocaleDateString()}</span>` : ''}
            </div>

            <div class="product-variants-section">
              <h4 class="variant-section-title">Variants (${product.variants.length})</h4>
              ${product.variants.length === 0 ? `
                <p class="no-variants-text">No variants added yet</p>
              ` : product.variants.map(variant => `
                <div class="variant-item">
                  <div class="variant-header">
                    <span class="variant-name">📦 ${variant.packSize}</span>
                    <span class="batch-count">${variant.batches.length} batch(es)</span>
                  </div>
                  <div class="batches-container">
                    ${variant.batches.map(batch => `
                      <div class="batch-card">
                        <div class="batch-row">
                          <span class="batch-label">Batch:</span>
                          <span class="batch-value">${batch.batchNo}</span>
                        </div>
                        <div class="batch-row">
                          <span class="batch-label">MRP:</span>
                          <span class="batch-value">₹${batch.mrp.toFixed(2)}</span>
                        </div>
                        <div class="batch-row">
                          <span class="batch-label">Mfg Date:</span>
                          <span class="batch-value">${batch.mfgDate ? new Date(batch.mfgDate).toLocaleDateString('en-GB', { month: '2-digit', year: 'numeric' }) : 'Not Defined'}</span>
                        </div>
                        <div class="batch-row">
                          <span class="batch-label">Expiry:</span>
                          <span class="batch-value">${batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString('en-GB', { month: '2-digit', year: 'numeric' }) : 'Not Defined'}</span>
                        </div>
                        <div class="batch-row">
                          <span class="batch-label">Units Sold:</span>
                          <span class="batch-value">${batch.unitsSold}</span>
                        </div>
                        <div class="batch-actions" style="display: flex; gap: 4px; margin-top: 8px;">
                          <button class="batch-action-btn print-batch-qr" style="flex: 1; padding: 4px; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer;" data-product-id="${product.id}" data-pack-size="${variant.packSize}" data-batch-no="${batch.batchNo}" title="Print QR">🖨️ QR</button>
                          <button class="batch-delete-btn" style="flex: 1;" data-product-id="${product.id}" data-pack-size="${variant.packSize}" data-batch-no="${batch.batchNo}">Remove Batch</button>
                        </div>
                      </div>
                    `).join('')}
                  </div>
                  <button class="add-batch-btn add-batch-margin" data-product-id="${product.id}" data-pack-size="${variant.packSize}">+ Add Batch</button>
                </div>
              `).join('')}
              <button class="add-variant-btn add-variant-margin" data-product-id="${product.id}">+ Add Variant</button>
            </div>
          </div>
              `;
            }).join('')}
          </div>
        `).join('')}
      </div>
    `;

    // Use event delegation instead of attaching listeners to each element
    // This prevents memory leaks from duplicate listeners on re-render
    const app = this;
    
    // Remove old event delegator if exists
    if (this.viewContainerDelegator) {
      this.viewContainer.removeEventListener('click', this.viewContainerDelegator);
    }
    
    // Single event delegator for all product card interactions
    this.viewContainerDelegator = (e) => {
      const target = e.target;
      
      // Letter section toggle
      if (target.classList.contains('products-letter-divider')) {
        const section = target.closest('.products-letter-section');
        section.classList.toggle('collapsed');
        target.style.cursor = 'pointer';
        return;
      }
      
      // Print Product QR
      if (target.classList.contains('print-product-qr')) {
        const productId = target.dataset.productId;
        app.printProductCatalog(productId);
        return;
      }
      
      // Print Batch QR
      if (target.classList.contains('print-batch-qr')) {
        const productId = target.dataset.productId;
        const packSize = target.dataset.packSize;
        const batchNo = target.dataset.batchNo;
        app.printBatchQR(productId, packSize, batchNo);
        return;
      }

      // Edit product
      if (target.classList.contains('edit-product')) {
        const productId = target.dataset.productId;
        app.renderEditProductView(productId);
        app.switchView('edit');
        return;
      }
      
      // Delete product
      if (target.classList.contains('delete-product')) {
        const productId = target.dataset.productId;
        if (confirm('Delete this product?')) {
          app.deleteProductFromAPI(parseInt(productId)).then(success => {
            if (success) {
              app.products = app.products.filter(p => p.id != productId);
              app.renderAllProducts();
            }
          });
        }
        return;
      }
      
      // Add variant
      if (target.classList.contains('add-variant-btn')) {
        const productId = target.dataset.productId;
        const product = app.products.find(p => p.id == productId);
        if (product) {
          app.showAddVariantModal(productId, false);
        }
        return;
      }
      
      // Add batch
      if (target.classList.contains('add-batch-btn')) {
        const productId = target.dataset.productId;
        const packSize = target.dataset.packSize;
        app.showAddBatchDialog(productId, packSize);
        return;
      }
      
      // Delete batch
      if (target.classList.contains('batch-delete-btn')) {
        const productId = target.dataset.productId;
        const packSize = target.dataset.packSize;
        const batchNo = target.dataset.batchNo;
        if (confirm('Remove this batch?')) {
          const product = app.products.find(p => p.id == productId);
          if (product) {
            const variant = product.getVariant(packSize);
            if (variant) {
              variant.removeBatch(batchNo);
              product.lastUpdated = new Date();
              app.saveProductToAPI(product).then(success => {
                if (success) {
                  app.notifications.show('Batch removed successfully', 'success', 2000);
                  app.renderAllProducts();
                }
              });
            }
          }
        }
        return;
      }
    };
    
    this.viewContainer.addEventListener('click', this.viewContainerDelegator);
  }

  showAddBatchDialog(productId, packSize) {
    const product = this.products.find(p => p.id == productId);
    if (!product) return;
    const app = this; // Store reference to app instance

    // Create a modal/dialog for batch entry
    const dialogHtml = `
      <div class="batch-dialog-overlay" id="batchDialogOverlay">
        <div class="batch-dialog">
          <h3>Add Batch for ${packSize}</h3>
          <form id="batchForm">
            <div class="batch-dialog-grid">
              <div>
                <label>Batch Number *</label>
                <input type="text" id="batchNo" placeholder="e.g., BATCH-001" required>
              </div>
              <div>
                <label>MRP (₹) *</label>
                <input type="number" id="batchMrp" placeholder="0.00" step="0.01" onwheel="return false" required>
              </div>
              <div>
                <label>Manufacturing Date</label>
                <input type="month" id="batchMfgDate">
              </div>
              <div>
                <label style="display:flex;justify-content:space-between;align-items:center;gap:6px;">Expiry Date<select id="batchExpiryYears" class="expiry-years-picker" title="Auto-fill from Mfg Date">${expiryYearOptions()}</select></label>
                <input type="month" id="batchExpiryDate">
              </div>
              <div>
                <label>Units Sold</label>
                <input type="number" id="batchUnitsSold" placeholder="0" value="0" min="0" onwheel="return false">
              </div>
            </div>
            <div class="batch-form-actions">
              <button type="button" class="dialog-cancel-btn">Cancel</button>
              <button type="submit">Add Batch</button>
            </div>
          </form>
        </div>
      </div>
    `;

    // Append dialog to body
    const dialogContainer = document.createElement('div');
    dialogContainer.innerHTML = dialogHtml;
    document.body.appendChild(dialogContainer);

    const overlay = document.getElementById('batchDialogOverlay');
    const form = document.getElementById('batchForm');
    const cancelBtn = document.querySelector('.dialog-cancel-btn');

    // Pre-select the remembered expiry year gap for this product
    const rememberedGap = getProductExpiryGap(product);
    if (rememberedGap) document.getElementById('batchExpiryYears').value = String(rememberedGap);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const batchNo = document.getElementById('batchNo').value;
      const mrp = parseFloat(document.getElementById('batchMrp').value);
      const mfgDateValue = document.getElementById('batchMfgDate').value;
      const expiryDateValue = document.getElementById('batchExpiryDate').value;
      const mfgDate = mfgDateValue ? new Date(mfgDateValue) : null;
      const expiryDate = expiryDateValue ? new Date(expiryDateValue) : null;
      const unitsSold = parseInt(document.getElementById('batchUnitsSold').value) || 0;

      // Only validate if both dates are provided
      if (mfgDate && expiryDate && expiryDate <= mfgDate) {
        app.notifications.show('Expiry date must be after manufacturing date!', 'warning', 2500);
        return;
      }

      const variant = product.getVariant(packSize);
      if (variant) {
        if (variant.getBatch(batchNo)) {
          app.notifications.show('This batch number already exists!', 'warning', 2000);
        } else {
          const batch = new ProductBatch(batchNo, mfgDate, expiryDate, mrp, unitsSold);
          variant.addBatch(batch);
          product.lastUpdated = new Date();
          // Save to API
          const success = await app.saveProductToAPI(product);
          overlay.parentElement.remove();
          if (success) {
            app.renderAllProducts();
          }
        }
      }
    });

    cancelBtn.addEventListener('click', () => {
      overlay.parentElement.remove();
    });

    // Auto-fill expiry date from Mfg Date + selected years
    const batchMfgInput = document.getElementById('batchMfgDate');
    const batchExpInput = document.getElementById('batchExpiryDate');
    const batchExpYears = document.getElementById('batchExpiryYears');
    const autoFillExpiry = () => {
      const mfg = batchMfgInput.value;
      const yrs = parseInt(batchExpYears.value);
      if (mfg && yrs) {
        const [yr, mo] = mfg.split('-').map(Number);
        batchExpInput.value = `${yr + yrs}-${String(mo).padStart(2, '0')}`;
      }
    };
    batchMfgInput.addEventListener('change', autoFillExpiry);
    batchExpYears.addEventListener('change', autoFillExpiry);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.parentElement.remove();
      }
    });
  }

  renderCreateProductView() {
    this.viewContainer.innerHTML = `
      <div class="product-form-wrapper">
        <form id="productForm" class="product-form">
          <h3 class="form-section-title">Product Information</h3>
          <div class="form-field-group">
            <div>
              <label class="form-field-label">Product Name *</label>
              <input type="text" id="productName" placeholder="Enter product name" class="form-input" required>
            </div>
            <div>
              <label class="form-field-label">Category *</label>
              <select id="productCategory" class="form-select" required>
                <option value="">Select Category</option>
                ${this.categories.map(cat => `<option value="${cat.name || cat}">${cat.name || cat}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="form-field-label">Classification *</label>
              <select id="productClassification" class="form-select" required>
                <option value="">Select Classification</option>
                <option value="Non-Gold">Non-Gold</option>
                <option value="Gold">✨ Gold</option>
              </select>
            </div>
          </div>

          <h3 class="form-section-divider">Variants & Batches</h3>
          <p class="form-description">Add product variants (like 500ml, 1L) and their batch information</p>
          
          <div id="variantsContainer" class="variants-container">
            <!-- Variants will be added here -->
          </div>

          <button type="button" id="addVariantField" class="add-variant-field-btn">+ Add Variant</button>

          <div class="form-actions">
            <button type="button" id="cancelCreateBtn" class="btn-cancel">Cancel</button>
            <button type="submit" class="btn-submit">Save Product</button>
          </div>
        </form>
      </div>
    `;

    let variantCount = 0;

    document.getElementById('addVariantField')?.addEventListener('click', () => {
      variantCount++;
      this.addVariantField(variantCount);
    });

    document.getElementById('productForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('productName').value.trim();
      const category = document.getElementById('productCategory').value;
      const classification = document.getElementById('productClassification').value;

      if (!name || !category || !classification) {
        this.notifications.show('Please fill in product name, category, and classification', 'warning', 2500);
        return;
      }

      // Find category ID from category name
      const categoryObj = this.categories.find(c => (c.name || c) === category);
      const categoryId = categoryObj ? (categoryObj.id || categoryObj) : null;

      const product = new Product(name, category, false);
      product.category_id = categoryId;
      product.classification = classification;

      // Collect variants and batches
      const variantElements = document.querySelectorAll('.variant-section');
      let hasValidData = false;

      variantElements.forEach(vEl => {
        const packSizeNum = vEl.querySelector('.variant-pack-size').value.trim();
        const packUnit = vEl.querySelector('.variant-pack-unit').value.trim();
        const packSize = packSizeNum + (packUnit ? packUnit : ''); // Combine size and unit
        if (packSizeNum) {
          const variant = new ProductVariant(packSize);
          // Store pack_size_value and pack_size_type separately
          variant.pack_size_value = parseFloat(packSizeNum) || null;
          variant.pack_size_type = packUnit || null;
          const batchElements = vEl.querySelectorAll('.batch-entry');
          
          batchElements.forEach(bEl => {
            const batchNo = bEl.querySelector('.batch-number').value.trim();
            const mrp = parseFloat(bEl.querySelector('.batch-mrp').value);
            const mfgDateValue = bEl.querySelector('.batch-mfg-date').value;
            const expiryDateValue = bEl.querySelector('.batch-expiry-date').value;
            const mfgDate = mfgDateValue ? new Date(mfgDateValue) : null;
            const expiryDate = expiryDateValue ? new Date(expiryDateValue) : null;
            const unitsSold = parseInt(bEl.querySelector('.batch-units-sold').value) || 0;

            if (batchNo && !isNaN(mrp)) {
              const batch = new ProductBatch(batchNo, mfgDate, expiryDate, mrp, unitsSold);
              variant.addBatch(batch);
              hasValidData = true;
            }
          });

          if (variant.batches.length > 0) {
            product.addVariant(variant);
          }
        }
      });

      if (!hasValidData) {
        this.notifications.show('Please add at least one variant with a batch', 'warning', 2500);
        return;
      }

      // Save to API (API will set the product.id if created)
      const success = await this.saveProductToAPI(product);
      
      if (success) {
        // Only push to local list and navigate on success
        this.products.push(product);
        this.notifications.show('Product saved successfully!', 'success', 2000);
        this.switchView('all');
      } else {
        // saveProductToAPI already shows the specific error notification
        log.error('Failed to save product to server');
      }
    });

    document.getElementById('cancelCreateBtn')?.addEventListener('click', () => {
      this.switchView('all');
    });

    // Add initial variant field
    this.addVariantField(1);
  }

  addVariantField(index) {
    const container = document.getElementById('variantsContainer');
    if (!container) return;

    // Detect unit from already-added variant fields
    let defaultUnit = '';
    const existingUnitSelects = container.querySelectorAll('.variant-pack-unit');
    for (let i = existingUnitSelects.length - 1; i >= 0; i--) {
      if (existingUnitSelects[i].value) { defaultUnit = existingUnitSelects[i].value; break; }
    }

    const variantEl = document.createElement('div');
    variantEl.className = 'variant-section';

    variantEl.innerHTML = `
      <div class="variant-header">
        <label class="variant-label">Variant ${index}</label>
        <button type="button" class="remove-variant-btn">Remove</button>
      </div>
      <div class="pack-size-wrapper">
        <label class="batch-field-label">Pack Size *</label>
        <div class="pack-size-input-group">
          <input type="number" class="variant-pack-size pack-size-number-input" placeholder="500" step="0.01" min="0" onwheel="return false">
          <select class="variant-pack-unit pack-size-unit-select">
            <option value="">Unit</option>
            <option value="ML">ML</option>
            <option value="GMS">GMS</option>
            <option value="TAB">TAB</option>
            <option value="L">L</option>
            <option value="KG">KG</option>
          </select>
        </div>
      </div>
      <div class="pack-size-wrapper">
        <div class="batches-header">
          <label class="batches-title">Batches</label>
          <button type="button" class="add-batch-field-btn">+ Batch</button>
        </div>
        <div class="batches-list"></div>
      </div>
    `;

    container.appendChild(variantEl);

    // Pre-select detected unit
    if (defaultUnit) variantEl.querySelector('.variant-pack-unit').value = defaultUnit;

    // Remove variant button
    variantEl.querySelector('.remove-variant-btn').addEventListener('click', () => {
      variantEl.remove();
    });

    // Add batch button
    variantEl.querySelector('.add-batch-field-btn').addEventListener('click', () => {
      const batchesList = variantEl.querySelector('.batches-list');
      this.addBatchField(batchesList);
    });

    // Add one batch field by default
    this.addBatchField(variantEl.querySelector('.batches-list'));
  }

  addBatchField(batchesList) {
    const batchEl = document.createElement('div');
    batchEl.className = 'batch-entry';

    batchEl.innerHTML = `
      <div class="batch-entry-grid">
        <div class="batch-field">
          <label class="batch-field-label">Batch No *</label>
          <input type="text" class="batch-number batch-field-input" placeholder="BATCH-001">
        </div>
        <div class="batch-field">
          <label class="batch-field-label">MRP (₹) *</label>
          <input type="number" class="batch-mrp batch-field-input" placeholder="0.00" step="0.01" onwheel="return false">
        </div>
        <div class="batch-field">
          <label class="batch-field-label">Mfg Date</label>
          <input type="month" class="batch-mfg-date batch-field-input">
        </div>
        <div class="batch-field">
          <label class="batch-field-label" style="display:flex;justify-content:space-between;align-items:center;gap:4px;">Expiry Date<select class="batch-expiry-years expiry-years-picker">${expiryYearOptions()}</select></label>
          <input type="month" class="batch-expiry-date batch-field-input">
        </div>
        <div class="batch-field">
          <label class="batch-field-label">Units Sold</label>
          <input type="number" class="batch-units-sold batch-field-input" placeholder="0" value="0" min="0" onwheel="return false">
        </div>
        <div class="batch-remove-wrapper">
          <button type="button" class="remove-batch-btn">Remove</button>
        </div>
      </div>
    `;

    batchesList.appendChild(batchEl);

    batchEl.querySelector('.remove-batch-btn').addEventListener('click', () => {
      batchEl.remove();
    });

    // Expiry auto-fill for create product batch
    const _mfgIn = batchEl.querySelector('.batch-mfg-date');
    const _expIn = batchEl.querySelector('.batch-expiry-date');
    const _yrsIn = batchEl.querySelector('.batch-expiry-years');
    const _autoFill = () => {
      const mfg = _mfgIn.value;
      const yrs = parseInt(_yrsIn.value);
      if (mfg && yrs) {
        const [yr, mo] = mfg.split('-').map(Number);
        _expIn.value = `${yr + yrs}-${String(mo).padStart(2, '0')}`;
      }
    };
    _mfgIn.addEventListener('change', _autoFill);
    _yrsIn.addEventListener('change', _autoFill);
  }

  renderEditProductView(productId) {
    const product = this.products.find(p => p.id == productId);
    if (!product) return;
    const app = this; // Store reference to app instance for use in event handlers

    this.headerTitle.textContent = 'Edit Product';
    this.headerSubtitle.textContent = 'Modify all product information, variants, and batches';

    this.viewContainer.innerHTML = `
      <div class="form-wrapper">
        <form id="editProductForm" class="edit-form">
          <h3 class="form-section-title">Product Information</h3>
          <div class="form-field-group">
            <div>
              <label class="form-field-label">Product Name *</label>
              <input type="text" id="editProductName" value="${product.name}" class="form-input" required>
            </div>
            <div>
              <label class="form-field-label">Category *</label>
              <select id="editProductCategory" class="form-select" required>
                <option value="">Select Category</option>
                ${this.categories.map(cat => `<option value="${cat.name || cat}" ${(cat.name || cat) === product.category ? 'selected' : ''}>${cat.name || cat}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="form-field-label">Classification *</label>
              <select id="editProductClassification" class="form-select" required>
                <option value="">Select Classification</option>
                <option value="Non-Gold" ${product.classification === 'Non-Gold' ? 'selected' : ''}>Non-Gold</option>
                <option value="Gold" ${product.classification === 'Gold' ? 'selected' : ''}>✨ Gold</option>
              </select>
            </div>
          </div>

          <h3 class="form-section-divider">Edit Variants & Batches
            <button type="button" id="addVariantEditBtn" class="add-variant-edit-btn">+ Add Variant</button>
          </h3>
          <div id="editVariantsContainer" class="edit-variants-container">
            ${product.variants.map((variant, vIdx) => `
              <div class="edit-variant-card">
                <div class="edit-variant-header">
                  <h4 class="edit-variant-title">📦 Variant Identifier</h4>
                  <div class="pack-size-input-group">
                    <input type="number" class="variant-pack-size pack-size-number-input" placeholder="500" step="0.01" min="0" onwheel="return false" value="${variant.pack_size_value || ''}" data-variant-idx="${vIdx}">
                    <select class="variant-pack-unit pack-size-unit-select" data-variant-idx="${vIdx}">
                      <option value="">Unit</option>
                      <option value="ML" ${(variant.pack_size_type || '').toUpperCase() === 'ML' ? 'selected' : ''}>ML</option>
                      <option value="GMS" ${(variant.pack_size_type || '').toUpperCase() === 'GMS' ? 'selected' : ''}>GMS</option>
                      <option value="TAB" ${(variant.pack_size_type || '').toUpperCase() === 'TAB' ? 'selected' : ''}>TAB</option>
                      <option value="L" ${(variant.pack_size_type || '').toUpperCase() === 'L' ? 'selected' : ''}>L</option>
                      <option value="KG" ${(variant.pack_size_type || '').toUpperCase() === 'KG' ? 'selected' : ''}>KG</option>
                    </select>
                  </div>
                  <button type="button" class="remove-variant-edit-btn" data-variant-idx="${vIdx}">Remove Variant</button>
                </div>
                <div class="edit-batches-wrapper">
                  ${variant.batches.map((batch, bIdx) => `
                    <div class="edit-batch-card">
                      <div class="edit-batch-grid">
                        <div class="edit-batch-field">
                          <label class="edit-batch-label">Batch Number *</label>
                          <input type="text" value="${batch.batchNo}" class="edit-batch-no edit-batch-input" data-variant-idx="${vIdx}" data-batch-idx="${bIdx}">
                        </div>
                        <div class="edit-batch-field">
                          <label class="edit-batch-label">MRP (₹) *</label>
                          <input type="number" value="${batch.mrp}" step="0.01" onwheel="return false" class="edit-batch-mrp edit-batch-input" data-variant-idx="${vIdx}" data-batch-idx="${bIdx}">
                        </div>
                        <div class="edit-batch-field">
                          <label class="edit-batch-label">Mfg Date *</label>
                          <input type="month" value="${safeGetMonthValue(batch.mfgDate)}" class="edit-batch-mfg edit-batch-input" data-variant-idx="${vIdx}" data-batch-idx="${bIdx}">
                        </div>
                        <div class="edit-batch-field">
                          <label class="edit-batch-label" style="display:flex;justify-content:space-between;align-items:center;gap:4px;">Expiry Date *<select class="edit-batch-exp-years expiry-years-picker" data-variant-idx="${vIdx}" data-batch-idx="${bIdx}">${expiryYearOptions(getBatchYearGap(batch.mfgDate, batch.expiryDate))}</select></label>
                          <input type="month" value="${safeGetMonthValue(batch.expiryDate)}" class="edit-batch-exp edit-batch-input" data-variant-idx="${vIdx}" data-batch-idx="${bIdx}">
                        </div>
                        <div class="edit-batch-field">
                          <label class="edit-batch-label">Units Sold</label>
                          <input type="number" value="${batch.unitsSold}" min="0" onwheel="return false" class="edit-batch-sold edit-batch-input" data-variant-idx="${vIdx}" data-batch-idx="${bIdx}">
                        </div>
                        <div class="edit-batch-remove-wrapper">
                          <button type="button" class="remove-batch-edit-btn" data-variant-idx="${vIdx}" data-batch-idx="${bIdx}">Remove Batch</button>
                        </div>
                      </div>
                    </div>
                  `).join('')}
                </div>
                <button type="button" class="add-batch-edit-btn" data-variant-idx="${vIdx}">+ Add Batch</button>
              </div>
            `).join('')}
          </div>

          <div class="edit-form-actions">
            <button type="button" id="cancelEditBtn" class="btn-cancel-edit">Cancel</button>
            <button type="submit" class="btn-submit-edit">Save Changes</button>
          </div>
        </form>
      </div>
    `;

    // Clean up previous event listeners if they exist to prevent duplicates
    if (this._editFormSubmitHandler) {
      this.viewContainer.removeEventListener('submit', this._editFormSubmitHandler);
    }
    if (this._editFormClickHandler) {
      this.viewContainer.removeEventListener('click', this._editFormClickHandler);
    }
    if (this._editFormChangeHandler) {
      this.viewContainer.removeEventListener('change', this._editFormChangeHandler);
    }

    // Auto-fill expiry from mfg + year picker in edit product inline batch rows
    this._editFormChangeHandler = (e) => {
      if (e.target.classList.contains('edit-batch-mfg') || e.target.classList.contains('edit-batch-exp-years')) {
        const card = e.target.closest('.edit-batch-card');
        if (card) {
          const mfgIn = card.querySelector('.edit-batch-mfg');
          const expIn = card.querySelector('.edit-batch-exp');
          const yrsIn = card.querySelector('.edit-batch-exp-years');
          if (mfgIn && expIn && yrsIn && yrsIn.value) {
            const mfg = mfgIn.value;
            const yrs = parseInt(yrsIn.value);
            if (mfg && yrs) {
              const [yr, mo] = mfg.split('-').map(Number);
              expIn.value = `${yr + yrs}-${String(mo).padStart(2, '0')}`;
            }
          }
        }
      }
    };
    this.viewContainer.addEventListener('change', this._editFormChangeHandler);

    this._editFormSubmitHandler = async (e) => {
      if (e.target.id !== 'editProductForm') return;
      e.preventDefault();
      
      const newName = document.getElementById('editProductName').value.trim();
      const newCategory = document.getElementById('editProductCategory').value;
      const newClassification = document.getElementById('editProductClassification').value;

      if (!newName || !newCategory || !newClassification) {
        app.notifications.show('Product name, category, and classification are required!', 'warning', 2500);
        return;
      }

      // Update product basic info
      product.name = newName;
      product.category = newCategory;
      product.classification = newClassification;
      
      // Resolve category ID from categories list
      const categoryObj = app.categories.find(c => (c.name || c) === newCategory);
      if (categoryObj && categoryObj.id) {
        product.category_id = categoryObj.id;
      }

      // Update variant basic info (value/type) from form
      document.querySelectorAll('.variant-pack-size[data-variant-idx]').forEach(input => {
        const vIdx = parseInt(input.dataset.variantIdx);
        const variant = product.variants[vIdx];
        if (variant) {
          const unitSelect = document.querySelector(`.variant-pack-unit[data-variant-idx="${vIdx}"]`);
          const newValue = input.value.trim();
          const newUnit = unitSelect.value.trim();
          
          if (newValue && newUnit) {
            variant.pack_size_value = parseFloat(newValue) || 0;
            variant.pack_size_type = newUnit;
            // Update display name for list/sidebar
            variant.packSize = newValue + newUnit;
          }
        }
      });

      // Update batch data from form
      document.querySelectorAll('.edit-batch-no').forEach(input => {
        const vIdx = parseInt(input.dataset.variantIdx);
        const bIdx = parseInt(input.dataset.batchIdx);
        const variant = product.variants[vIdx];
        if (variant && variant.batches[bIdx]) {
          const batch = variant.batches[bIdx];
          const mfgInput = document.querySelector(`.edit-batch-mfg[data-variant-idx="${vIdx}"][data-batch-idx="${bIdx}"]`);
          const expInput = document.querySelector(`.edit-batch-exp[data-variant-idx="${vIdx}"][data-batch-idx="${bIdx}"]`);
          const mrpInput = document.querySelector(`.edit-batch-mrp[data-variant-idx="${vIdx}"][data-batch-idx="${bIdx}"]`);
          const soldInput = document.querySelector(`.edit-batch-sold[data-variant-idx="${vIdx}"][data-batch-idx="${bIdx}"]`);
          
          let newMfgDate = null;
          let newExpDate = null;

          if (mfgInput.value) {
            newMfgDate = new Date(mfgInput.value);
          }
          if (expInput.value) {
            newExpDate = new Date(expInput.value);
          }

          if (newExpDate && newMfgDate && newExpDate <= newMfgDate) {
            app.notifications.show(`Variant ${vIdx + 1}, Batch ${bIdx + 1}: Expiry date must be after manufacturing date!`, 'warning', 2500);
            return;
          }

          batch.batchNo = input.value;
          batch.mfgDate = newMfgDate;
          batch.expiryDate = newExpDate;
          batch.mrp = parseFloat(mrpInput.value) || 0;
          batch.unitsSold = parseInt(soldInput.value) || 0;
        }
      });

      product.lastUpdated = new Date();
      // Save to API
      const success = await app.saveProductToAPI(product);
      
      if (success) {
        app.notifications.show('Product updated successfully!', 'success', 2000);
        app.switchView('all');
      }
    };

    this._editFormClickHandler = async (e) => {
      if (e.target.id === 'cancelEditBtn') {
        app.switchView('all');
        return;
      }
      
      if (e.target.classList.contains('remove-variant-edit-btn')) {
        e.preventDefault();
        const vIdx = parseInt(e.target.dataset.variantIdx);
        if (confirm('Remove this variant and all its batches?')) {
          product.variants.splice(vIdx, 1);
          product.lastUpdated = new Date();
          // Save to API
          const success = await app.saveProductToAPI(product);
          if (success) {
            app.renderEditProductView(productId);
          } else {
            app.notifications.show('Failed to save variant removal to server', 'warning', 2500);
          }
        }
        return;
      }
      
      if (e.target.classList.contains('remove-batch-edit-btn')) {
        e.preventDefault();
        const vIdx = parseInt(e.target.dataset.variantIdx);
        const bIdx = parseInt(e.target.dataset.batchIdx);
        if (confirm('Remove this batch?')) {
          product.variants[vIdx].batches.splice(bIdx, 1);
          product.lastUpdated = new Date();
          // Save to API
          const success = await app.saveProductToAPI(product);
          if (success) {
            app.renderEditProductView(productId);
          } else {
            app.notifications.show('Failed to save batch removal to server', 'warning', 2500);
          }
        }
        return;
      }
      
      if (e.target.id === 'addVariantEditBtn') {
        e.preventDefault();
        app.showAddVariantModal(productId, true);
        return;
      }
      
      if (e.target.classList.contains('add-batch-edit-btn')) {
        e.preventDefault();
        const vIdx = parseInt(e.target.dataset.variantIdx);
        app.showAddBatchDialogForEdit(product, vIdx, productId);
        return;
      }
    };

    // Attach fresh listeners
    this.viewContainer.addEventListener('submit', this._editFormSubmitHandler);
    this.viewContainer.addEventListener('click', this._editFormClickHandler);
  }

  showAddBatchDialogForEdit(product, variantIdx, productId) {
    const packSize = product.variants[variantIdx].packSize;
    const app = this; // Store reference to app instance
    
    const dialogHtml = `
      <div class="batch-dialog-overlay" id="batchDialogOverlay">
        <div class="batch-dialog">
          <h3>Add Batch for ${packSize}</h3>
          <form id="batchForm">
            <div class="batch-dialog-grid">
              <div>
                <label>Batch Number *</label>
                <input type="text" id="batchNo" placeholder="e.g., BATCH-001" required>
              </div>
              <div>
                <label>MRP (₹) *</label>
                <input type="number" id="batchMrp" placeholder="0.00" step="0.01" onwheel="return false" required>
              </div>
              <div>
                <label>Manufacturing Date</label>
                <input type="month" id="batchMfgDate">
              </div>
              <div>
                <label style="display:flex;justify-content:space-between;align-items:center;gap:6px;">Expiry Date<select id="batchExpiryYears" class="expiry-years-picker" title="Auto-fill from Mfg Date">${expiryYearOptions()}</select></label>
                <input type="month" id="batchExpiryDate">
              </div>
              <div>
                <label>Units Sold</label>
                <input type="number" id="batchUnitsSold" placeholder="0" value="0" min="0" onwheel="return false">
              </div>
            </div>
            <div class="batch-form-actions">
              <button type="button" class="dialog-cancel-btn">Cancel</button>
              <button type="submit">Add Batch</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const dialogContainer = document.createElement('div');
    dialogContainer.innerHTML = dialogHtml;
    document.body.appendChild(dialogContainer);

    const overlay = document.getElementById('batchDialogOverlay');
    const form = document.getElementById('batchForm');
    const cancelBtn = document.querySelector('.dialog-cancel-btn');

    // Pre-select the remembered expiry year gap for this product
    const rememberedGap = getProductExpiryGap(product);
    if (rememberedGap) document.getElementById('batchExpiryYears').value = String(rememberedGap);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const batchNo = document.getElementById('batchNo').value;
      const mrp = parseFloat(document.getElementById('batchMrp').value);
      const mfgDateValue = document.getElementById('batchMfgDate').value;
      const expiryDateValue = document.getElementById('batchExpiryDate').value;
      const mfgDate = mfgDateValue ? new Date(mfgDateValue) : null;
      const expiryDate = expiryDateValue ? new Date(expiryDateValue) : null;
      const unitsSold = parseInt(document.getElementById('batchUnitsSold').value) || 0;

      // Only validate if both dates are provided
      if (mfgDate && expiryDate && expiryDate <= mfgDate) {
        app.notifications.show('Expiry date must be after manufacturing date!', 'warning', 2500);
        return;
      }

      const variant = product.variants[variantIdx];
      if (variant.getBatch(batchNo)) {
        app.notifications.show('This batch number already exists!', 'warning', 2000);
      } else {
        const batch = new ProductBatch(batchNo, mfgDate, expiryDate, mrp, unitsSold);
        variant.addBatch(batch);
        product.lastUpdated = new Date();
        app.saveProductToAPI(product);
        overlay.parentElement.remove();
        app.renderEditProductView(productId);
      }
    });

    cancelBtn.addEventListener('click', () => {
      overlay.parentElement.remove();
    });

    // Auto-fill expiry date from Mfg Date + selected years
    const batchMfgInput = document.getElementById('batchMfgDate');
    const batchExpInput = document.getElementById('batchExpiryDate');
    const batchExpYears = document.getElementById('batchExpiryYears');
    const autoFillExpiry = () => {
      const mfg = batchMfgInput.value;
      const yrs = parseInt(batchExpYears.value);
      if (mfg && yrs) {
        const [yr, mo] = mfg.split('-').map(Number);
        batchExpInput.value = `${yr + yrs}-${String(mo).padStart(2, '0')}`;
      }
    };
    batchMfgInput.addEventListener('change', autoFillExpiry);
    batchExpYears.addEventListener('change', autoFillExpiry);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.parentElement.remove();
      }
    });
  }

  showAddVariantModal(productId, isEdit = false) {
    const product = this.products.find(p => p.id == productId);
    if (!product) return;
    
    const app = this; // Store reference to app instance
    
    const dialogHtml = `
      <div class="batch-dialog-overlay" id="variantDialogOverlay">
        <div class="batch-dialog">
          <h3>Add New Variant</h3>
          <form id="variantForm">
            <div class="batch-dialog-grid">
              <div>
                <label>Pack Size Number *</label>
                <input type="number" id="variantNumber" placeholder="e.g., 500" step="0.01" required>
              </div>
              <div>
                <label>Pack Size Unit *</label>
                <select id="variantUnit" required>
                  <option value="">Select Unit</option>
                  <option value="ML">ML</option>
                  <option value="GMS">GMS</option>
                  <option value="TAB">TAB</option>
                  <option value="L">L</option>
                  <option value="KG">KG</option>
                </select>
              </div>
            </div>
            <div class="batch-form-actions">
              <button type="button" class="dialog-cancel-btn">Cancel</button>
              <button type="submit">Add Variant</button>
            </div>
          </form>
        </div>
      </div>
    `;

    const dialogContainer = document.createElement('div');
    dialogContainer.innerHTML = dialogHtml;
    document.body.appendChild(dialogContainer);

    const overlay = document.getElementById('variantDialogOverlay');
    const form = document.getElementById('variantForm');
    const cancelBtn = document.querySelector('.dialog-cancel-btn');

    // Pre-select the remembered pack unit and focus the number field
    const rememberedUnit = getProductPackUnit(product);
    if (rememberedUnit) document.getElementById('variantUnit').value = rememberedUnit;
    document.getElementById('variantNumber').focus();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const packSizeNumber = parseFloat(document.getElementById('variantNumber').value);
      const packSizeUnit = document.getElementById('variantUnit').value;
      const packSize = packSizeNumber + packSizeUnit;

      if (!packSizeNumber || !packSizeUnit) {
        app.notifications.show('Please fill in pack size number and unit!', 'warning', 2500);
        return;
      }

      // Check if variant already exists
      if (product.variants.some(v => v.packSize === packSize)) {
        app.notifications.show('This variant already exists!', 'warning', 2000);
        return;
      }

      // Create new variant
      const variant = new ProductVariant(packSize);
      variant.pack_size_value = packSizeNumber;
      variant.pack_size_type = packSizeUnit;
      
      // Add at least one batch field
      const batch = new ProductBatch('', null, null, 0, 0);
      variant.addBatch(batch);
      
      product.addVariant(variant);
      product.lastUpdated = new Date();
      
      // Save to API
      const success = await app.saveProductToAPI(product);
      overlay.parentElement.remove();
      
      if (success) {
        app.notifications.show('Variant added successfully!', 'success', 2000);
        
        // Re-render the appropriate view
        if (isEdit) {
          app.renderEditProductView(productId);
        } else {
          // In all products view
          app.renderAllProducts();
        }
      } else {
        app.notifications.show('Failed to add variant to API', 'error', 2500);
      }
    });

    cancelBtn.addEventListener('click', () => {
      overlay.parentElement.remove();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.parentElement.remove();
      }
    });
  }

  renderCategoriesView() {
    // Calculate category statistics
    const categoryStats = {};
    this.categories.forEach(cat => {
      const catName = cat.name || cat;
      const count = this.products.filter(p => p.category === catName).length;
      categoryStats[catName] = count;
    });

    this.viewContainer.innerHTML = `
      <div class="categories-view-container">
        <h3 class="categories-view-title">Manage Categories</h3>
        
        <div class="category-input-group">
          <input type="text" id="newCategoryInput" placeholder="Category name" class="category-name-input">
          <button id="addCategoryBtn" class="btn-add-category">+ Add</button>
        </div>

        <div class="category-stats-box">
          <h4 class="category-stats-title">Category Statistics</h4>
          <div class="category-stats-grid">
            <div class="stat-card">
              <div class="stat-card-value categories-count">${this.categories.length}</div>
              <div class="stat-card-label">Total Categories</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-value products-count">${this.products.length}</div>
              <div class="stat-card-label">Total Products</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-value avg-count">${Math.round(this.products.length / (this.categories.length || 1))}</div>
              <div class="stat-card-label">Avg Products/Cat</div>
            </div>
          </div>
        </div>

        <div id="categoriesList" class="categories-list">
          ${this.categories.map(cat => {
            const catName = cat.name || cat;
            const catMeaning = cat.english_meaning || '';
            const prodCount = categoryStats[catName] || 0;
            return `
            <div class="category-list-item" style="padding: 14px 16px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.08); margin-bottom: 8px; background: #fff;">
              <div class="category-list-item-info" style="flex: 1;">
                <div class="category-list-item-name" style="font-size: 14.5px; font-weight: 600; color: #1e293b;">📂 ${catName}</div>
                ${catMeaning ? `<div style="font-size: 12px; color: #64748b; margin-top: 2px;">ℹ️ ${catMeaning}</div>` : ''}
                <div class="category-list-item-count" style="font-size: 12px; color: #0284c7; font-weight: 500; margin-top: 4px;">${prodCount} product${prodCount !== 1 ? 's' : ''}</div>
              </div>
              <div class="category-list-item-actions">
                <button class="view-category-btn category-action-btn" data-category="${catName}">View</button>
                <button class="rename-category-btn category-action-btn" data-category="${catName}">Rename</button>
                <button class="delete-category-btn category-action-btn" data-category="${catName}">Delete</button>
              </div>
            </div>
          `;}).join('')}
        </div>

        <!-- 🌿 Ayurvedic Product Descriptions, Indications & Company Info -->
        <div class="therapeutic-guide-container" style="margin-top: 24px; padding: 22px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.05); font-family: 'Plus Jakarta Sans', 'Noto Sans Oriya', 'Lohit Odia', -apple-system, BlinkMacSystemFont, sans-serif;">
          
          <!-- 1. Product Descriptions & Therapeutic Indications -->
          <div style="border-bottom: 2px solid #059669; padding-bottom: 12px; margin-bottom: 18px;">
            <h3 style="margin: 0; font-size: 17px; color: #065f46; font-weight: 700; display: flex; align-items: center; gap: 8px;">
              🌿 1. Product Descriptions &amp; Therapeutic Indications
            </h3>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #64748b;">Data explicitly appended in the source document detailing usages of specific key medicines.</p>
          </div>

          <div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px;">
            <!-- Medicine 1 -->
            <div style="background: #f8fafc; padding: 14px 16px; border-radius: 8px; border-left: 4px solid #f59e0b; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
              <div style="font-weight: 700; color: #92400e; font-size: 14px; margin-bottom: 6px;">
                ✨ ବୃହତ ଚନ୍ଦ୍ରୋଦୟ ମକରଧ୍ବଜ (Br. Chandraodaya Makar Dhawaja):
              </div>
              <div style="font-size: 12.5px; color: #334155; line-height: 1.6;">
                This is a blood, strength, and immunity-enhancing rasayana. It cures weakness caused by indigestion, loss of appetite, and tissue depletion. It is an effective medicine for abdominal diseases like diarrhea, dysentery, and amoebiasis.<br>
                <span style="color: #059669; font-weight: 600;">🔹 Adjuvant / Anupana:</span> Consumption is more effective when taken with roasted cumin powder, fennel-soaked water, sandalwood-infused water, or mixed powder.
              </div>
            </div>

            <!-- Medicine 2 -->
            <div style="background: #f8fafc; padding: 14px 16px; border-radius: 8px; border-left: 4px solid #f59e0b; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
              <div style="font-weight: 700; color: #92400e; font-size: 14px; margin-bottom: 6px;">
                ✨ ସୁବର୍ଣ ପୂଷ୍ପଶୁଗ (Subarna Puspasuga):
              </div>
              <div style="font-size: 12.5px; color: #334155; line-height: 1.6;">
                An excellent rasayana medicine of the Utkal Ayurvedic tradition. It is highly effective for chronic cough, asthma, and loss of appetite.<br>
                <span style="color: #059669; font-weight: 600;">🔹 Adjuvant / Anupana:</span> When consumed with long pepper (pippali) powder and honey, it completely eradicates chronic fevers and chronic cough.
              </div>
            </div>

            <!-- Medicine 3 -->
            <div style="background: #f8fafc; padding: 14px 16px; border-radius: 8px; border-left: 4px solid #f59e0b; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
              <div style="font-weight: 700; color: #92400e; font-size: 14px; margin-bottom: 6px;">
                ✨ ମହରାଜ ନୃପତି ବଲ୍ଲଭ ରସ (Maharaja Nrupati Ballav Rasa):
              </div>
              <div style="font-size: 12.5px; color: #334155; line-height: 1.6;">
                Effective for symptoms like chronic sprue, amoebiasis, chronic dysentery, constipation, abdominal colic, and chronic rheumatism.<br>
                <span style="color: #059669; font-weight: 600;">🔹 Adjuvant / Anupana:</span> Excellent results are obtained when consumed on an empty stomach in the morning, ground with honey, followed by drinking fennel decoction.
              </div>
            </div>

            <!-- Medicine 4: Panchabana Rasa -->
            <div style="background: #f8fafc; padding: 14px 16px; border-radius: 8px; border-left: 4px solid #0284c7; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
              <div style="font-weight: 700; color: #0369a1; font-size: 14px; margin-bottom: 6px;">
                ✨ ପଞ୍ଚବାଣ ରସ (Panchabana Rasa):
              </div>
              <div style="font-size: 12.5px; color: #334155; line-height: 1.6; margin-bottom: 10px;">
                Widely used in South India, just as Basanta Kusumakar is in North India. It has cold potency and is the best medicine for treating 20 types of prameha (urinary disorders) and leucorrhea.
              </div>

              <div style="font-weight: 600; font-size: 12.5px; color: #0f172a; margin-bottom: 6px;">Specific Usage Formulations:</div>
              <div style="background: #fff; border-radius: 6px; border: 1px solid #cbd5e1; overflow: hidden;">
                <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                  <thead>
                    <tr style="background: #f1f5f9; color: #1e293b; border-bottom: 1px solid #cbd5e1;">
                      <th style="padding: 9px 12px; width: 40%; font-weight: 600;">Indication</th>
                      <th style="padding: 9px 12px; font-weight: 600;">Preparation / Adjuvant</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                      <td style="padding: 8px 12px; font-weight: 500; color: #0f172a;">ଧାତୁକ୍ଷୟରେ (For tissue depletion)</td>
                      <td style="padding: 8px 12px; color: #334155;">ବାବୁଲ ଅଠା ବତୁରା ଜଳ ଓ ମିଶ୍ରିଗୁଣ୍ଡ (Soaked babool gum water and misri powder)</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #f1f5f9; background: #fafafa;">
                      <td style="padding: 8px 12px; font-weight: 500; color: #0f172a;">ଧୂଳଭଙ୍ଗ ରୋଗରେ (For erectile dysfunction)</td>
                      <td style="padding: 8px 12px; color: #334155;">ନାଗେଶ୍ବର ଚୁର୍ୟ ଓ ମିଶ୍ରିଗୁଣ୍ଡ (Nageswar powder and misri powder)</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                      <td style="padding: 8px 12px; font-weight: 500; color: #0f172a;">ବହୁମୁତ୍ର ରୋଗରେ (For polyuria/diabetes)</td>
                      <td style="padding: 8px 12px; color: #334155;">କଦଳୀ ଫୁଲ ରସ ଓ ମହୁ (Banana flower juice and honey)</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #f1f5f9; background: #fafafa;">
                      <td style="padding: 8px 12px; font-weight: 500; color: #0f172a;">ଶ୍ବେତପ୍ରଦର ରୋଗରେ (For leucorrhea)</td>
                      <td style="padding: 8px 12px; color: #334155;">ଶତାବରୀ ରସ ଓ ମିଶ୍ରି ଗୁଣ୍ଡ ସହ ଚନ୍ଦନ ଘୋରା ପାଣି (Shatavari juice and misri powder with sandalwood-infused water)</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 12px; font-weight: 500; color: #0f172a;">ଯୋନୀ କଣ୍ଡୁରେ (For vaginal itching)</td>
                      <td style="padding: 8px 12px; color: #334155;">ଶୀତଳ ମରିଚ ଗୁଣ୍ଡ ଓ ଚନ୍ଦନ ରସ (Cold black pepper powder and sandalwood juice)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Medicine 5 -->
            <div style="background: #f8fafc; padding: 14px 16px; border-radius: 8px; border-left: 4px solid #f59e0b; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
              <div style="font-weight: 700; color: #92400e; font-size: 14px; margin-bottom: 6px;">
                ✨ ରସାୟନ ବସନ୍ତ କୁସୁମାକର (Rasayana Basanta Kusumakar):
              </div>
              <div style="font-size: 12.5px; color: #334155; line-height: 1.6;">
                Infallible medicine for treating premature loss of vitality and the inability to engage in intercourse (erectile dysfunction) due to illicit sexual practices at a young age.<br>
                <span style="color: #059669; font-weight: 600;">🔹 Adjuvant / Anupana:</span> Consumption with misri powder, butter, or milk cream in the morning, followed by drinking fresh warm milk, increases vitality and cures the aforementioned condition.
              </div>
            </div>
          </div>

          <!-- 2. Company & Document Metadata -->
          <div style="border-top: 2px solid #0284c7; padding-top: 16px; margin-top: 20px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
              <h3 style="margin: 0; font-size: 16px; color: #0369a1; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                🏢 2. Company &amp; Document Metadata
              </h3>
              <span style="background: #dbeafe; color: #1e40af; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 20px;">GMP Certified Unit</span>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; font-size: 12.5px; color: #334155;">
              <div style="background: #f8fafc; padding: 12px 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div style="font-weight: 600; color: #0f172a; margin-bottom: 3px;">Company &amp; Established</div>
                <div>Company Name: <strong>Utkal Chemical Aushadhalaya (UCA)</strong></div>
                <div style="color: #64748b; margin-top: 2px;">Established: 1952 (Odisha's 2nd Oldest AYUSH Unit)</div>
                <div style="color: #059669; font-weight: 500; margin-top: 2px;">Certifications: GMP Certified Unit</div>
              </div>

              <div style="background: #f8fafc; padding: 12px 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div style="font-weight: 600; color: #0f172a; margin-bottom: 3px;">🏢 Office Address</div>
                <div>D1, Basera Complex, Dumduma, Bhubaneswar, Odisha - 751019</div>
              </div>

              <div style="background: #f8fafc; padding: 12px 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div style="font-weight: 600; color: #0f172a; margin-bottom: 3px;">🏭 Factory Address</div>
                <div>Binoba Marg, Aska - 761110, Ganjam, Odisha</div>
              </div>

              <div style="background: #f8fafc; padding: 12px 14px; border-radius: 8px; border: 1px solid #e2e8f0;">
                <div style="font-weight: 600; color: #0f172a; margin-bottom: 3px;">📞 Contact Information</div>
                <div>Mobile: <strong>+91 9439333304</strong></div>
                <div>Email: <a href="mailto:utkal_chem@yahoo.co.in" style="color: #0284c7; text-decoration: underline;">utkal_chem@yahoo.co.in</a></div>
                <div>Web: <a href="https://www.utkalayurveda.com" target="_blank" style="color: #0284c7; text-decoration: underline;">www.utkalayurveda.com</a></div>
              </div>
            </div>
          </div>

        </div>

        ${this.categories.length === 0 ? `
          <div class="categories-empty-state">
            <p>No categories yet. Add your first category!</p>
          </div>
        ` : ''}
      </div>
    `;

    // Add category
    document.getElementById('addCategoryBtn')?.addEventListener('click', async () => {
      if (!this.apiEnabled) {
        this.notifications.show('API required to add categories', 'warning', 2000);
        return;
      }
      
      const input = document.getElementById('newCategoryInput');
      const catName = input.value.trim();
      
      if (!catName) {
        this.notifications.show('Please enter a category name!', 'warning', 2000);
        return;
      }
      
      const categoryExists = this.categories.some(c => (c.name || c).toLowerCase() === catName.toLowerCase());
      if (categoryExists) {
        this.notifications.show('This category already exists!', 'warning', 2000);
        return;
      }
      
      try {
        const result = await this.api.createCategory({ name: catName });
        this.categories.push({ id: result.id, name: catName, created_at: new Date() });
        input.value = '';
        this.notifications.show(`Category "${catName}" added!`, 'success', 2000);
        this.renderCategoriesView();
      } catch (err) {
        log.error('Failed to create category:', err.message);
        this.notifications.show(`Failed to add category: ${err.message}`, 'error', 2500);
      }
    });

    // Allow Enter key to add category
    document.getElementById('newCategoryInput')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('addCategoryBtn')?.click();
      }
    });

    // View category products
    document.querySelectorAll('.view-category-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const category = e.target.dataset.category;
        this.showCategoryProducts(category);
      });
    });

    // Rename category
    document.querySelectorAll('.rename-category-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (!this.apiEnabled) {
          this.notifications.show('API required to rename categories', 'warning', 2000);
          return;
        }
        
        const oldName = e.target.dataset.category;
        const newName = prompt(`Rename category from "${oldName}" to:`, oldName);
        
        if (!newName || !newName.trim() || newName.trim() === oldName) {
          return;
        }
        
        const categoryExists = this.categories.some(c => (c.name || c).toLowerCase() === newName.trim().toLowerCase());
        if (categoryExists) {
          this.notifications.show('This category name already exists!', 'warning', 2000);
          return;
        }
        
        const categoryObj = this.categories.find(c => (c.name || c) === oldName);
        if (!categoryObj || !categoryObj.id) {
          this.notifications.show('Cannot rename category. Please reload the page.', 'error', 2500);
          return;
        }
        
        try {
          await this.api.updateCategory(categoryObj.id, { name: newName.trim() });
          
          // Update category in all products and categories array
          this.products.forEach(product => {
            if (product.category === oldName) {
              product.category = newName.trim();
              product.lastUpdated = new Date();
            }
          });
          categoryObj.name = newName.trim();
          
          this.notifications.show(`Category renamed to "${newName.trim()}"!`, 'success', 2000);
          this.renderCategoriesView();
        } catch (err) {
          log.error('Failed to rename category:', err.message);
          this.notifications.show(`Failed to rename category: ${err.message}`, 'error', 2500);
        }
      });
    });

    // Delete category
    document.querySelectorAll('.delete-category-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (!this.apiEnabled) {
          this.notifications.show('API required to delete categories', 'warning', 2000);
          return;
        }
        
        const cat = e.target.dataset.category;
        const productCount = this.products.filter(p => p.category === cat).length;
        
        if (productCount > 0) {
          this.notifications.show(`Cannot delete "${cat}"! It contains ${productCount} product(s). Please reassign them first.`, 'warning', 3000);
          return;
        }
        
        if (!confirm(`Delete category "${cat}"?`)) {
          return;
        }
        
        const categoryObj = this.categories.find(c => (c.name || c) === cat);
        if (!categoryObj || !categoryObj.id) {
          this.notifications.show('Cannot delete category. Please reload the page.', 'error', 2500);
          return;
        }
        
        try {
          await this.api.deleteCategory(categoryObj.id);
          this.categories = this.categories.filter(c => (c.name || c) !== cat);
          this.notifications.show(`Category "${cat}" deleted successfully!`, 'success', 2000);
          this.renderCategoriesView();
        } catch (err) {
          log.error('Failed to delete category:', err.message);
          this.notifications.show(`Failed to delete category: ${err.message}`, 'error', 2500);
        }
      });
    });
  }

  showCategoryProducts(category) {
    const categoryProducts = this.products.filter(p => p.category === category);
    
    const dialogHtml = `
      <div class="batch-dialog-overlay" id="categoryDialogOverlay">
        <div class="batch-dialog" style="max-width: 600px; max-height: 70vh;">
          <h3>📂 Products in "${category}"</h3>
          <div style="max-height: 400px; overflow-y: auto;">
            ${categoryProducts.length === 0 ? `
              <p style="color: #999; text-align: center; padding: 20px;">No products in this category</p>
            ` : `
              <div style="display: flex; flex-direction: column; gap: 10px;">
                ${categoryProducts.map(product => `
                  <div style="padding: 10px; background: #f5f5f5; border-radius: 4px;">
                    <div style="font-weight: 600; margin-bottom: 4px;">
                      ${product.name} 
                      <span style="font-size: 11px; background: ${product.classification === 'Gold' ? '#ffd700' : '#ddd'}; color: ${product.classification === 'Gold' ? '#333' : '#666'}; padding: 2px 6px; border-radius: 3px; margin-left: 6px;">
                        ${product.classification === 'Gold' ? '✨ Gold' : 'Non-Gold'}
                      </span>
                    </div>
                    <div style="font-size: 12px; color: #666;">
                      Variants: ${product.variants.length} | Batches: ${product.variants.reduce((sum, v) => sum + v.batches.length, 0)} | Sold: ${product.getTotalUnitsSold()}
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
          <div style="margin-top: 16px; display: flex; gap: 10px; justify-content: flex-end; border-top: 1px solid #e0e0e0; padding-top: 12px;">
            <button id="closeCategoryDialogBtn" style="padding: 8px 16px; background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;">Close</button>
          </div>
        </div>
      </div>
    `;

    const dialogContainer = document.createElement('div');
    dialogContainer.innerHTML = dialogHtml;
    document.body.appendChild(dialogContainer);

    const overlay = document.getElementById('categoryDialogOverlay');
    const closeBtn = document.getElementById('closeCategoryDialogBtn');

    closeBtn.addEventListener('click', () => {
      overlay.parentElement.remove();
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.parentElement.remove();
      }
    });
  }

  // --- QR Printing Methods ---
  
  _formatDateHumanReadable(dateStr) {
    if (!dateStr) return 'Not Defined';
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return 'Invalid Date';
      const day = date.getDate();
      const suffix = (day === 1 || day === 21 || day === 31) ? 'st' : 
                     (day === 2 || day === 22) ? 'nd' : 
                     (day === 3 || day === 23) ? 'rd' : 'th';
      const month = date.toLocaleDateString('en-GB', { month: 'short' });
      const year = date.getFullYear();
      return `${day}${suffix} ${month} ${year}`;
    } catch (e) {
      return dateStr;
    }
  }

  createPdfProgressModal({ title = 'Export Product Catalog PDF', subtitle = 'Choose your preferred action' } = {}) {
    const modalId = 'pdfOptionModal_' + Date.now();
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="batch-dialog-overlay" id="${modalId}" style="z-index: 1000000; background: rgba(0, 0, 0, 0.65); backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center; position: fixed; inset: 0;">
        <div class="batch-dialog" id="${modalId}_box" style="max-width: 480px; width: 92%; background: #ffffff; border: 3px solid #000000; border-radius: 18px; box-shadow: 8px 8px 0px #000000; padding: 26px; color: #0d0f12; font-family: 'Plus Jakarta Sans', sans-serif;">
          <!-- Content rendered dynamically -->
        </div>
      </div>
    `;
    document.body.appendChild(container);
    const box = container.querySelector(`#${modalId}_box`);

    const renderChoiceState = (onSelect, onCancel) => {
      box.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
          <span style="font-size: 32px;">📑</span>
          <div>
            <h3 style="margin: 0; font-size: 19px; font-weight: 900; color: #0d0f12;">${title}</h3>
            <p style="margin: 2px 0 0 0; font-size: 13px; color: #5C687D;">${subtitle}</p>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 22px;">
          <button type="button" id="${modalId}_btn_download" style="padding: 14px 18px; background: #0038ff; color: #ffffff; border: 3px solid #000000; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; box-shadow: 4px 4px 0px #000000; display: flex; align-items: center; justify-content: center; gap: 10px;">
            📥 Download PDF (Backend Generated)
          </button>
          
          <button type="button" id="${modalId}_btn_print" style="padding: 14px 18px; background: #ffea00; color: #000000; border: 3px solid #000000; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; box-shadow: 4px 4px 0px #000000; display: flex; align-items: center; justify-content: center; gap: 10px;">
            🖨️ Print Catalog (Interactive PDF)
          </button>

          <button type="button" id="${modalId}_btn_cancel" style="padding: 10px; background: #f4f6fb; color: #5C687D; border: 2px solid #000000; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; margin-top: 4px;">
            Cancel
          </button>
        </div>
      `;

      box.querySelector(`#${modalId}_btn_download`).onclick = () => onSelect('download');
      box.querySelector(`#${modalId}_btn_print`).onclick = () => onSelect('print');
      box.querySelector(`#${modalId}_btn_cancel`).onclick = () => onCancel();
    };

    const renderProgressState = (stepText, percent = 30) => {
      box.innerHTML = `
        <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 16px;">
          <div style="width: 34px; height: 34px; border: 4px solid #ffea00; border-top-color: #0038ff; border-radius: 50%; animation: spin 0.8s linear infinite; flex-shrink: 0;"></div>
          <div>
            <h3 style="margin: 0; font-size: 18px; font-weight: 900; color: #0d0f12;">Generating PDF Catalog...</h3>
            <p style="margin: 3px 0 0 0; font-size: 13px; color: #5C687D;" id="${modalId}_status">${stepText}</p>
          </div>
        </div>

        <div style="width: 100%; height: 14px; background: #e2e8f0; border: 2px solid #000000; border-radius: 8px; overflow: hidden; margin-top: 14px;">
          <div id="${modalId}_bar" style="width: ${percent}%; height: 100%; background: linear-gradient(90deg, #0038ff, #00f0ff); transition: width 0.3s ease-in-out;"></div>
        </div>
        <style>
          @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        </style>
      `;
    };

    const updateProgress = (stepText, percent) => {
      const statusEl = box.querySelector(`#${modalId}_status`);
      const barEl = box.querySelector(`#${modalId}_bar`);
      if (statusEl) statusEl.textContent = stepText;
      if (barEl) barEl.style.width = `${percent}%`;
    };

    const renderCompleteState = ({ isDownload, blobUrl, filename, onClose }) => {
      if (isDownload) {
        box.innerHTML = `
          <div style="text-align: center; padding: 10px 0;">
            <div style="font-size: 48px; margin-bottom: 8px;">🎉</div>
            <h3 style="margin: 0; font-size: 20px; font-weight: 900; color: #0d0f12;">PDF Ready for Download!</h3>
            <p style="margin: 6px 0 18px 0; font-size: 13px; color: #5C687D;">Your high-res catalog PDF was generated successfully.</p>

            <div style="display: flex; flex-direction: column; gap: 10px;">
              <a href="${blobUrl}" download="${filename}" id="${modalId}_direct_download" style="padding: 14px 18px; background: #76b900; color: #ffffff; border: 3px solid #000000; border-radius: 12px; font-size: 14px; font-weight: 900; text-decoration: none; box-shadow: 4px 4px 0px #000000; display: inline-flex; align-items: center; justify-content: center; gap: 8px;">
                📥 Click to Download PDF (${filename})
              </a>

              <button type="button" id="${modalId}_btn_close" style="padding: 10px; background: #ffffff; color: #0d0f12; border: 2px solid #000000; border-radius: 10px; font-size: 13px; font-weight: 800; cursor: pointer;">
                Done
              </button>
            </div>
          </div>
        `;

        // Automatically trigger click on the real download link element
        setTimeout(() => {
          const dlBtn = box.querySelector(`#${modalId}_direct_download`);
          if (dlBtn) dlBtn.click();
        }, 100);
      } else {
        box.innerHTML = `
          <div style="text-align: center; padding: 10px 0;">
            <div style="font-size: 48px; margin-bottom: 8px;">🖨️</div>
            <h3 style="margin: 0; font-size: 20px; font-weight: 900; color: #0d0f12;">Print Dialog Launched!</h3>
            <p style="margin: 6px 0 18px 0; font-size: 13px; color: #5C687D;">Your interactive catalog print preview is ready.</p>

            <button type="button" id="${modalId}_btn_close" style="padding: 12px; background: #0038ff; color: #ffffff; border: 3px solid #000000; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; width: 100%; box-shadow: 3px 3px 0px #000000;">
              Close Window
            </button>
          </div>
        `;
      }

      const closeBtn = box.querySelector(`#${modalId}_btn_close`);
      if (closeBtn) closeBtn.onclick = onClose;
    };

    const renderErrorState = (errorMessage, onClose) => {
      box.innerHTML = `
        <div style="text-align: center; padding: 10px 0;">
          <div style="font-size: 48px; margin-bottom: 8px;">⚠️</div>
          <h3 style="margin: 0; font-size: 20px; font-weight: 900; color: #0d0f12;">Generation Error</h3>
          <p style="margin: 6px 0 18px 0; font-size: 13px; color: #d32f2f;">${errorMessage}</p>

          <button type="button" id="${modalId}_btn_error_close" style="padding: 12px; background: #0038ff; color: #ffffff; border: 3px solid #000000; border-radius: 12px; font-size: 14px; font-weight: 800; cursor: pointer; width: 100%; box-shadow: 3px 3px 0px #000000;">
            Close
          </button>
        </div>
      `;
      const closeBtn = box.querySelector(`#${modalId}_btn_error_close`);
      if (closeBtn) closeBtn.onclick = onClose;
    };

    const destroy = () => {
      if (container.parentNode) container.parentNode.removeChild(container);
    };

    return {
      renderChoiceState,
      renderProgressState,
      updateProgress,
      renderCompleteState,
      renderErrorState,
      destroy
    };
  }

  async _triggerPrint(htmlContent, defaultFilename = 'UCA_Master_Catalog.pdf') {
    const modal = this.createPdfProgressModal({
      title: 'Export Product Catalog',
      subtitle: 'Select whether to download the PDF or open print mode'
    });

    const userChoice = await new Promise((resolve) => {
      modal.renderChoiceState(
        (choice) => resolve(choice),
        () => resolve(null)
      );
    });

    if (!userChoice) {
      modal.destroy();
      return;
    }

    // Show progress tracking
    modal.renderProgressState('Compiling layout & elements...', 20);

    // Process TOC boundary positioning inside temporary DOM node
    const printContainer = document.createElement('div');
    printContainer.className = 'qr-print-container';
    printContainer.innerHTML = htmlContent;
    document.body.appendChild(printContainer);
    
    try { await document.fonts.ready; } catch(e) { /* fallback */ }

    const popularSection = printContainer.querySelector('.qr-popular-section');
    if (popularSection) {
      const tocPage = popularSection.closest('.qr-toc-page');
      if (tocPage) {
        printContainer.style.cssText = 'display:block !important; position:absolute; left:-9999px; top:0; width:210mm;';
        popularSection.style.display = 'none';
        void tocPage.offsetHeight;

        const marker = printContainer.querySelector('#toc-end-marker');
        const measureDiv = document.createElement('div');
        measureDiv.style.height = '297mm';
        document.body.appendChild(measureDiv);
        const pageHeightPx = measureDiv.getBoundingClientRect().height;
        document.body.removeChild(measureDiv);
        
        const tocEndPixel = marker.offsetTop;
        const spaceUsedOnCurrentPage = tocEndPixel % pageHeightPx;
        const maxAllowedHeight = pageHeightPx - spaceUsedOnCurrentPage - 110;
        
        if (maxAllowedHeight >= 100) {
          popularSection.style.display = '';
          popularSection.style.height = 'auto';
          popularSection.style.maxHeight = Math.floor(maxAllowedHeight) + 'px';
          popularSection.style.overflow = 'hidden';
          
          const grid = popularSection.querySelector('.qr-popular-grid');
          if (grid) {
            const sectionRect = popularSection.getBoundingClientRect();
            const chips = grid.querySelectorAll('.qr-popular-chip');
            chips.forEach(chip => {
              chip.style.display = '';
              if (chip.getBoundingClientRect().bottom > sectionRect.bottom - 8) {
                chip.style.display = 'none';
              }
            });
          }
        } else {
          popularSection.style.display = 'none';
        }
        
        tocPage.style.minHeight = '';
        printContainer.style.cssText = '';
      }
    }

    const processedHtml = printContainer.innerHTML;
    document.body.removeChild(printContainer);

    modal.updateProgress('Rendering A4 document via Backend Engine...', 55);

    // Call Backend API to generate PDF via Puppeteer
    try {
      const response = await fetch('/api/products/catalog/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: processedHtml,
          action: userChoice,
          filename: defaultFilename
        })
      });

      if (!response.ok) {
        let errDetail = '';
        try {
          const errData = await response.json();
          errDetail = errData.details || errData.error || response.statusText;
        } catch (e) {
          errDetail = response.statusText || 'Internal Error';
        }
        throw new Error(`Server returned ${response.status}: ${errDetail}`);
      }

      modal.updateProgress('Finalizing PDF binary file...', 90);

      const arrayBuffer = await response.arrayBuffer();
      const pdfBlob = new Blob([arrayBuffer], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(pdfBlob);

      modal.updateProgress('Complete!', 100);

      if (userChoice === 'download') {
        // Show completed state with download button and trigger automated click
        modal.renderCompleteState({
          isDownload: true,
          blobUrl,
          filename: defaultFilename,
          onClose: () => {
            modal.destroy();
            setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
          }
        });
      } else if (userChoice === 'print') {
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        iframe.src = blobUrl;

        document.body.appendChild(iframe);
        iframe.onload = () => {
          try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
          } catch (e) {
            window.open(blobUrl, '_blank');
          }
        };

        modal.renderCompleteState({
          isDownload: false,
          blobUrl,
          filename: defaultFilename,
          onClose: () => {
            modal.destroy();
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
          }
        });
      }
    } catch (err) {
      log.warn('[Catalog Export] Backend PDF generation failed:', err);
      
      if (userChoice === 'download') {
        // DO NOT call window.print() on download failure! Show clean error message in modal.
        modal.renderErrorState(`Failed to generate PDF download: ${err.message || 'Server error'}. Please try again.`, () => {
          modal.destroy();
        });
      } else {
        // Local print fallback only for print choice
        modal.destroy();
        const fallbackContainer = document.createElement('div');
        fallbackContainer.className = 'qr-print-container';
        fallbackContainer.innerHTML = processedHtml;
        document.body.appendChild(fallbackContainer);
        setTimeout(() => {
          window.print();
          document.body.removeChild(fallbackContainer);
        }, 300);
      }
    }
  }

  async printMasterCatalog() {
    const generator = new QRGenerator();
    const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });
    const fontsLink = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Oriya:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;600;800;900&display=swap" rel="stylesheet">`;
    const cornerOrns = ``;
    const watermarkHTML = ``;
    
    const bgPatternSVG = `<div class="qr-neo-grid"></div>`;

    // Alphabetical Sorting
    const sortedProducts = [...this.products].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    // Extract unique categories
    const uniqueCategories = [...new Set(sortedProducts.map(p => p.category))].sort();
    const categoryCloudHtml = `<div class="qr-category-cloud">` + 
      uniqueCategories.map(cat => `<span class="qr-cat-tag">${cat}</span>`).join('') + 
      `</div>`;

    // Calculate TOC metrics
    let totalProducts = sortedProducts.length;
    let totalVariants = 0;
    let totalBatches = 0;
    
    let tocListHtml = '';
    let currentTocLetter = '';
    
    for (const product of sortedProducts) {
      let productBatchCount = 0;
      let productVariantCount = product.variants.length;
      totalVariants += productVariantCount;
      
      for (const variant of product.variants) {
        productBatchCount += variant.batches.length;
      }
      totalBatches += productBatchCount;

      const startingLetter = product.name.charAt(0).toUpperCase();
      if (startingLetter !== currentTocLetter) {
        currentTocLetter = startingLetter;
        tocListHtml += `<div class="qr-toc-letter">${currentTocLetter}</div>`;
      }
      
      tocListHtml += `
        <a href="#prod-${product.id}" class="qr-toc-entry">
          <span class="qr-toc-name">${product.name}</span>
          <span class="qr-toc-dots"></span>
          <span class="qr-toc-info">${productVariantCount}V · ${productBatchCount}B</span>
        </a>
      `;
    }

    // Build Popular Products strip (fills remaining space on TOC page)
    const popularProducts = sortedProducts
      .filter(p => p.isGold === true || (p.classification && String(p.classification).trim().toLowerCase() === 'gold'));
    const byBatches = sortedProducts
      .filter(p => !popularProducts.includes(p))
      .sort((a, b) => {
        let aB = 0; a.variants.forEach(v => aB += v.batches.length);
        let bB = 0; b.variants.forEach(v => bB += v.batches.length);
        return bB - aB;
      });
    const featuredProducts = [...popularProducts, ...byBatches].slice(0, 12);

    let popularChipsHtml = '';
    for (const p of featuredProducts) {
      let bCount = 0;
      p.variants.forEach(v => bCount += v.batches.length);
      const cleanName = p.name.replace(/^utkal\s+/i, '');
      const isGold = p.isGold === true || (p.classification && String(p.classification).trim().toLowerCase() === 'gold');
      popularChipsHtml += `
        <a href="#prod-${p.id}" class="qr-popular-chip${isGold ? ' gold' : ''}" style="text-decoration: none; color: inherit; display: flex; flex-direction: column;">
          <span class="pop-name">${cleanName}</span>
          <span class="pop-cat">${p.category}</span>
          <span class="pop-stats">${p.variants.length}V · ${bCount}B</span>
        </a>
      `;
    }

    let catalogHtml = `
      ${fontsLink}
      <div class="qr-print-page qr-toc-page" style="display: flex; flex-direction: column; background: var(--qr-bg); z-index: 101;">
        ${bgPatternSVG}
        ${watermarkHTML}
        <div class="qr-doc-header">
          ${cornerOrns}
          <p class="qr-doc-brand"><a href="https://mac.faizal.uk" style="color: inherit; text-decoration: none;">UCA Inventory System</a></p>
          <h1 class="qr-doc-title">Product Catalog</h1>
          <p class="qr-doc-subtitle">QR Code Price List &amp; Reference</p>
        </div>
        <div class="qr-accent-bar"></div>
        <div class="qr-metrics-row">
          <div class="qr-metric-pill">
            <span class="metric-value">${totalProducts}</span>
            <span class="metric-label">Products</span>
          </div>
          <div class="qr-metric-pill accent">
            <span class="metric-value">${totalVariants}</span>
            <span class="metric-label">Variants</span>
          </div>
          <div class="qr-metric-pill">
            <span class="metric-value">${totalBatches}</span>
            <span class="metric-label">Batches</span>
          </div>
        </div>
        ${categoryCloudHtml}
        <div class="qr-toc-section">
          <div class="qr-toc-heading">Index (A–Z)</div>
          <div class="qr-toc-columns">
            ${tocListHtml}
          </div>
          <div id="toc-end-marker"></div>
        </div>

        <div class="qr-popular-section">
          <div class="qr-popular-header">
            <div class="qr-popular-diamond">◆</div>
            <span class="qr-popular-title">POPULAR SUGGESTIONS</span>
            <div class="qr-popular-diamond">◆</div>
          </div>
          <div class="qr-popular-grid">
            ${popularChipsHtml}
          </div>
          <div class="qr-popular-shapes">
            <div class="shape shape-circle"></div>
            <div class="shape shape-cross">+</div>
            <div class="shape shape-square"></div>
            <div class="shape shape-dots">···</div>
            <div class="shape shape-zigzag">⚡</div>
          </div>
        </div>
      </div>
      <div class="qr-print-page">
        ${bgPatternSVG}
        ${watermarkHTML}
        <div class="qr-catalog-products">
    `;
    
    let currentRenderLetter = '';
    let productIdx = 0;
    
    for (const product of sortedProducts) {
      let productBatchCount = 0;
      product.variants.forEach(v => productBatchCount += v.batches.length);

      const startingLetter = product.name.charAt(0).toUpperCase();
      const isNewLetter = (startingLetter !== currentRenderLetter);
      if (isNewLetter) {
        currentRenderLetter = startingLetter;
      }
      
      const addedOn = product.createdAt ? product.createdAt.toLocaleDateString('en-IN', { dateStyle: 'medium' }) : 'N/A';
      const editedOn = product.lastUpdated && product.lastUpdated.getTime() !== product.createdAt?.getTime() ? product.lastUpdated.toLocaleDateString('en-IN', { dateStyle: 'medium' }) : addedOn;

      const isGoldProduct = product.isGold === true || (product.classification && String(product.classification).trim().toLowerCase() === 'gold');
      const goldBadgeHtml = isGoldProduct ? `<span class="qr-gold-badge">✨ GOLD</span>` : '';

      catalogHtml += `
        <div class="qr-product-block" id="prod-${product.id}">
          <div style="page-break-inside: avoid; break-inside: avoid; width: 100%;">
            ${isNewLetter ? `
            <div class="qr-letter-break">
              <span class="letter-char">${currentRenderLetter}</span>
              <span class="letter-line"></span>
            </div>
            ` : ''}
            <div class="qr-product-header">
              <div class="qr-product-title-group">
                <h2 class="qr-product-name">
                  <a href="${generator.generateProductURL(product.id)}" target="_blank" style="color: inherit; text-decoration: none;">${product.name}</a>
                  ${product.odia_name ? `<span class="qr-product-odia-name" style="font-family: 'Noto Sans Oriya', 'Lohit Odia', 'Samyak Oriya', sans-serif; font-size: 13.5px; font-weight: normal; color: #475569; margin-left: 6px;">(${product.odia_name})</span>` : ''}
                </h2>
                <span class="qr-category-pill">${product.category}</span>
                ${goldBadgeHtml}
              </div>
              <span class="qr-batch-count-badge">${productBatchCount} Batch${productBatchCount !== 1 ? 'es' : ''}</span>
            </div>
            <div class="qr-product-meta">
              <span><span class="meta-label">Added:</span> ${addedOn}</span>
              <span><span class="meta-label">Updated:</span> ${editedOn}</span>
            </div>
      `;
      let isFirstVariant = true;
      for (const variant of product.variants) {
        catalogHtml += `
          <div class="qr-variant-block" ${!isFirstVariant ? 'style="page-break-inside: avoid; break-inside: avoid;"' : ''}>
            <div class="qr-variant-tag">${variant.packSize}</div>
            <div class="qr-batch-row">
        `;
        for (const batch of variant.batches) {
          const qrUrl = generator.generateBatchURL(batch.batchNo);
          const qrImage = await generator.generateQRCodeDataURL(qrUrl, 'medium');
          
          catalogHtml += `
            <div class="qr-batch-card">
              <div class="qr-batch-top">
                <a href="${qrUrl}" target="_blank" class="qr-batch-no">${batch.batchNo}</a>
                <span class="qr-batch-mrp">₹${batch.mrp.toFixed(2)}</span>
              </div>
              <div class="qr-batch-body">
                <div class="qr-batch-data">
                  <div class="qr-data-row">
                    <span class="qr-data-label">MFG</span>
                    <span class="qr-data-value">${this._formatDateHumanReadable(batch.mfgDate)}</span>
                  </div>
                  <div class="qr-data-row">
                    <span class="qr-data-label">EXP</span>
                    <span class="qr-data-value expiry">${this._formatDateHumanReadable(batch.expiryDate)}</span>
                  </div>
                </div>
                <div class="qr-code-area">
                  <a href="${qrUrl}" target="_blank" class="qr-code-link">
                    <img src="${qrImage}" class="qr-code-img" />
                  </a>
                </div>
              </div>
            </div>
          `;
        }
        catalogHtml += `</div></div>`;
        if (isFirstVariant) {
          catalogHtml += `</div>`; // Close unbreakable wrapper
          isFirstVariant = false;
        }
      }
      if (isFirstVariant) catalogHtml += `</div>`; // Fallback close
      catalogHtml += `</div>`; // Close qr-product-block
      productIdx++;
    }
    catalogHtml += `
        </div>
      </div>
      <div class="qr-doc-footer" style="position: fixed; bottom: 0; left: 0; width: 100%; z-index: 100; margin: 0; box-sizing: border-box;">
        <span class="footer-left">UCA · Product Catalog</span>
        <span class="footer-center">◆ ◆ ◆</span>
        <span class="footer-right">Generated ${generatedAt}</span>
      </div>
    `;
    this._triggerPrint(catalogHtml, 'UCA_Master_Catalog.pdf');
  }

  async printProductCatalog(productId) {
    const product = this.products.find(p => p.id == productId);
    if (!product) return;
    
    const generator = new QRGenerator();
    const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });
    const fontsLink = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Oriya:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;600;800;900&display=swap" rel="stylesheet">`;
    const cornerOrns = ``;
    const watermarkHTML = ``;
    const bgPatternSVG = `<div class="qr-neo-grid"></div>`;

    let totalBatches = 0;
    product.variants.forEach(v => totalBatches += v.batches.length);
    const addedOn = product.createdAt ? product.createdAt.toLocaleDateString('en-IN', { dateStyle: 'medium' }) : 'N/A';
    const editedOn = product.lastUpdated && product.lastUpdated.getTime() !== product.createdAt?.getTime() ? product.lastUpdated.toLocaleDateString('en-IN', { dateStyle: 'medium' }) : addedOn;

    const isGoldProduct = product.isGold === true || (product.classification && String(product.classification).trim().toLowerCase() === 'gold');
    const goldBadgeHtml = isGoldProduct ? `<span class="qr-gold-badge" style="margin-top:2px;">✨ GOLD</span>` : '';

    let catalogHtml = `
      ${fontsLink}
      <div class="qr-print-page">
        ${bgPatternSVG}
        ${watermarkHTML}
        <div class="qr-doc-header">
          ${cornerOrns}
          <p class="qr-doc-brand">UCA Inventory System</p>
          <h1 class="qr-doc-title">Product Detail</h1>
          <p class="qr-doc-subtitle">${product.name} ${product.odia_name ? `<span style="font-family: 'Noto Sans Oriya', 'Lohit Odia', sans-serif; font-weight: normal; font-size: 14px;">(${product.odia_name})</span>` : ''}</p>
        </div>
        <div class="qr-accent-bar"></div>
        <div class="qr-product-summary">
          <div class="summary-item">
            <span class="summary-label">Product</span>
            <span class="summary-value">${product.name}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Category</span>
            <span class="summary-value"><span class="qr-category-pill">${product.category}</span></span>
          </div>
          ${isGoldProduct ? `
          <div class="summary-item">
            <span class="summary-label">Classification</span>
            <span class="summary-value">${goldBadgeHtml}</span>
          </div>` : ''}
          <div class="summary-item">
            <span class="summary-label">Variants</span>
            <span class="summary-value">${product.variants.length}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Batches</span>
            <span class="summary-value">${totalBatches}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Added</span>
            <span class="summary-value">${addedOn}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">Updated</span>
            <span class="summary-value">${editedOn}</span>
          </div>
        </div>
    `;
    
    for (const variant of product.variants) {
      catalogHtml += `
        <div class="qr-variant-block">
          <div class="qr-variant-tag">${variant.packSize}</div>
          <div class="qr-batch-row">
      `;
      for (const batch of variant.batches) {
        const qrUrl = generator.generateBatchURL(batch.batchNo);
        const qrImage = await generator.generateQRCodeDataURL(qrUrl, 'medium');
        
        catalogHtml += `
          <div class="qr-batch-card">
            <div class="qr-batch-top">
              <a href="${qrUrl}" target="_blank" class="qr-batch-no">${batch.batchNo}</a>
              <span class="qr-batch-mrp">₹${batch.mrp.toFixed(2)}</span>
            </div>
            <div class="qr-batch-body">
              <div class="qr-batch-data">
                <div class="qr-data-row">
                  <span class="qr-data-label">MFG</span>
                  <span class="qr-data-value">${this._formatDateHumanReadable(batch.mfgDate)}</span>
                </div>
                <div class="qr-data-row">
                  <span class="qr-data-label">EXP</span>
                  <span class="qr-data-value expiry">${this._formatDateHumanReadable(batch.expiryDate)}</span>
                </div>
              </div>
              <div class="qr-code-area">
                <a href="${qrUrl}" target="_blank" class="qr-code-link">
                  <img src="${qrImage}" class="qr-code-img" />
                </a>
              </div>
            </div>
          </div>
        `;
      }
      catalogHtml += `</div></div>`;
    }

    catalogHtml += `
        <div class="qr-doc-footer">
          <span class="footer-left">UCA · ${product.name}</span>
          <span class="footer-center">◆ ◆ ◆</span>
          <span class="footer-right">Generated ${generatedAt}</span>
        </div>
      </div>
    `;
    const cleanProductName = product.name.replace(/[^a-zA-Z0-9]/g, '_');
    this._triggerPrint(catalogHtml, `UCA_Product_${cleanProductName}.pdf`);
  }

  async printBatchQR(productId, packSize, batchNo) {
    const product = this.products.find(p => p.id == productId);
    if (!product) return;
    const variant = product.variants.find(v => v.packSize === packSize);
    if (!variant) return;
    const batch = variant.batches.find(b => b.batchNo === batchNo);
    if (!batch) return;
    
    const generator = new QRGenerator();
    const generatedAt = new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short' });
    const fontsLink = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Oriya:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;600;800;900&display=swap" rel="stylesheet">`;
    const cornerOrns = ``;
    const watermarkHTML = ``;
    const bgPatternSVG = `<div class="qr-neo-grid"></div>`;

    const qrUrl = generator.generateBatchURL(batch.batchNo);
    const [qrSmall, qrMedium, qrLarge] = await Promise.all([
      generator.generateQRCodeDataURL(qrUrl, 'small'),
      generator.generateQRCodeDataURL(qrUrl, 'medium'),
      generator.generateQRCodeDataURL(qrUrl, 'large')
    ]);
    
    let catalogHtml = `
      ${fontsLink}
      <div class="qr-print-page">
        ${bgPatternSVG}
        ${watermarkHTML}
        <div class="qr-doc-header">
          ${cornerOrns}
          <p class="qr-doc-brand">UCA Inventory System</p>
          <h1 class="qr-doc-title">Batch QR Code</h1>
          <p class="qr-doc-subtitle">${product.name} · ${variant.packSize}</p>
        </div>
        <div class="qr-accent-bar"></div>
        
        <div class="qr-batch-detail-header">
          <div class="batch-detail-no">
            <span class="detail-label">BATCH NO.</span>
            <span class="detail-value">${batch.batchNo}</span>
          </div>
          <div class="batch-detail-mrp">
            <span class="detail-label">MRP</span>
            <span class="detail-value">₹${batch.mrp.toFixed(2)}</span>
          </div>
        </div>

        <div class="qr-batch-meta-strip">
          <div class="meta-strip-item">
            <span class="meta-strip-label">Product Name</span>
            <span class="meta-strip-value">${product.name}</span>
          </div>
          <div class="meta-strip-item">
            <span class="meta-strip-label">Pack Size</span>
            <span class="meta-strip-value">${variant.packSize}</span>
          </div>
          <div class="meta-strip-item">
            <span class="meta-strip-label">MFG Date</span>
            <span class="meta-strip-value">${this._formatDateHumanReadable(batch.mfgDate)}</span>
          </div>
          <div class="meta-strip-item">
            <span class="meta-strip-label">EXP Date</span>
            <span class="meta-strip-value expiry">${this._formatDateHumanReadable(batch.expiryDate)}</span>
          </div>
        </div>

        <div class="qr-sizes-container">
          <h2 class="sizes-title">Printable QR Code Sizes</h2>
          <div class="qr-sizes-grid">
            <div class="qr-size-block">
              <div class="qr-size-frame">
                <img src="${qrSmall}" class="qr-img-sm" />
              </div>
              <span class="qr-size-label">Small</span>
            </div>
            <div class="qr-size-block">
              <div class="qr-size-frame">
                <img src="${qrMedium}" class="qr-img-md" />
              </div>
              <span class="qr-size-label">Medium</span>
            </div>
            <div class="qr-size-block">
              <div class="qr-size-frame">
                <img src="${qrLarge}" class="qr-img-lg" />
              </div>
              <span class="qr-size-label">Large</span>
            </div>
          </div>
        </div>
        <div class="qr-doc-footer">
          <span class="footer-left">UCA · Batch ${batchNo}</span>
          <span class="footer-center">◆ ◆ ◆</span>
          <span class="footer-right">Generated ${generatedAt}</span>
        </div>
      </div>
    `;
    const cleanBatchNo = batchNo.replace(/[^a-zA-Z0-9]/g, '_');
    this._triggerPrint(catalogHtml, `UCA_Batch_${cleanBatchNo}_QR.pdf`);
  }


  renderInventoryView() {
    // Calculate inventory statistics
    const totalProducts = this.products.length;
    const totalVariants = this.products.reduce((sum, p) => sum + p.variants.length, 0);
    const totalBatches = this.products.reduce((sum, p) => sum + p.variants.reduce((vsum, v) => vsum + v.batches.length, 0), 0);
    const totalUnitsSold = this.products.reduce((sum, p) => sum + p.getTotalUnitsSold(), 0);
    
    // Group by category
    const categoryInventory = {};
    this.products.forEach(product => {
      if (!categoryInventory[product.category]) {
        categoryInventory[product.category] = {
          products: 0,
          variants: 0,
          batches: 0,
          unitsSold: 0
        };
      }
      categoryInventory[product.category].products++;
      categoryInventory[product.category].variants += product.variants.length;
      categoryInventory[product.category].unitsSold += product.getTotalUnitsSold();
      product.variants.forEach(v => {
        categoryInventory[product.category].batches += v.batches.length;
      });
    });

    this.viewContainer.innerHTML = `
      <div style="padding: 20px; overflow-y: auto; max-height: 500px;">
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 20px;">
          <div style="padding: 12px; background: linear-gradient(135deg, #0071e3 0%, #0056b3 100%); color: white; border-radius: 6px; text-align: center;">
            <div style="font-size: 24px; font-weight: 600;">${totalProducts}</div>
            <div style="font-size: 12px; margin-top: 4px;">Total Products</div>
          </div>
          <div style="padding: 12px; background: linear-gradient(135deg, #34c759 0%, #2aa845 100%); color: white; border-radius: 6px; text-align: center;">
            <div style="font-size: 24px; font-weight: 600;">${totalVariants}</div>
            <div style="font-size: 12px; margin-top: 4px;">Variants</div>
          </div>
          <div style="padding: 12px; background: linear-gradient(135deg, #ff9500 0%, #ff7f0c 100%); color: white; border-radius: 6px; text-align: center;">
            <div style="font-size: 24px; font-weight: 600;">${totalBatches}</div>
            <div style="font-size: 12px; margin-top: 4px;">Batches</div>
          </div>
          <div style="padding: 12px; background: linear-gradient(135deg, #5ac8fa 0%, #0a84ff 100%); color: white; border-radius: 6px; text-align: center;">
            <div style="font-size: 24px; font-weight: 600;">${totalUnitsSold}</div>
            <div style="font-size: 12px; margin-top: 4px;">Units Sold</div>
          </div>
        </div>

        <h3 style="font-size: 16px; font-weight: 600; margin-bottom: 12px; margin-top: 20px;">Inventory by Category</h3>
        <div style="display: grid; gap: 10px;">
          ${Object.keys(categoryInventory).sort().map(category => {
            const stats = categoryInventory[category];
            return `
              <div style="padding: 12px; background: #f5f5f5; border-radius: 6px; border-left: 4px solid #0071e3;">
                <div style="font-weight: 600; margin-bottom: 8px; font-size: 14px;">${category}</div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; font-size: 12px;">
                  <div><span style="color: #666;">Products:</span> <span style="font-weight: 600; color: #333;">${stats.products}</span></div>
                  <div><span style="color: #666;">Variants:</span> <span style="font-weight: 600; color: #333;">${stats.variants}</span></div>
                  <div><span style="color: #666;">Batches:</span> <span style="font-weight: 600; color: #333;">${stats.batches}</span></div>
                  <div><span style="color: #666;">Sold:</span> <span style="font-weight: 600; color: #34c759;">${stats.unitsSold}</span></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        ${totalProducts === 0 ? `
          <div style="text-align: center; padding: 40px; color: #999;">
            <p style="font-size: 14px;">No inventory data available. Create products to view statistics.</p>
          </div>
        ` : ''}
      </div>
    `;
  }
}

// Backwards-compat: allow non-module pages to access it
if (typeof window !== 'undefined') {
  window.ProductListApp = ProductListApp;
}
