/**
 * StorageComponent - macOS style Database Explorer and Data Manager for Settings
 */

const TABLE_METADATA = {
  notes: {
    description: 'Stores notes created in the Notes app, including text/HTML contents and creation metadata.',
    app: 'Notes App',
    format: 'ID (integer, primary key), Title (text), Content (text/HTML), Timestamps',
    related: 'note_images'
  },
  note_images: {
    description: 'Stores binary image data or path attachments related to specific notes.',
    app: 'Notes App',
    format: 'ID (integer), Note ID (foreign key), Image Data (blob/base64), Sort Order, Timestamp',
    related: 'notes'
  },
  status_checks: {
    description: 'Stores system health dashboard metrics and background API status logs.',
    app: 'Settings (System Health)',
    format: 'ID (integer), Check Type (text), Status (text), Response Time (integer), Checked At',
    related: 'None'
  },
  categories: {
    description: 'Product category classifications (e.g. Tablets, Injections, Ointments).',
    app: 'Product List',
    format: 'ID (integer), Name (text), Timestamps',
    related: 'products'
  },
  products: {
    description: 'Product master inventory items listing classification, categories, and names.',
    app: 'Billing / Product List',
    format: 'ID (integer), Name (text), Category ID (foreign key), Classification (text), Timestamps',
    related: 'categories, variants, batches'
  },
  variants: {
    description: 'Product sizing specifications and pack details (e.g., "10 TAB", "100 ML").',
    app: 'Billing / Product List',
    format: 'ID (integer), Product ID (foreign key), Pack Size Value, Pack Size Type, Timestamps',
    related: 'products, batches'
  },
  batches: {
    description: 'Active inventory batches showing specific expiry dates, MRP prices, and units sold.',
    app: 'Billing / Product List',
    format: 'ID (integer), Variant ID (foreign key), Batch No (text), MRP (real), Dates, Units Sold',
    related: 'variants, order_items, invoice_items'
  },
  ledger: {
    description: 'Customer credit ledger logs tracking balances, status, and summary counts.',
    app: 'Billing App',
    format: 'ID (integer), Customer ID (foreign key), Current Due, Debits, Credits, Status, Timestamps',
    related: 'contacts, invoices, payments'
  },
  order_items: {
    description: 'Details of products ordered in wholesale purchase orders.',
    app: 'Purchase Orders',
    format: 'ID (integer), Order ID (foreign key), Product ID, Variant ID, Batch ID, Quantities, Prices',
    related: 'orders, products, variants, batches'
  },
  user_devices: {
    description: 'Stores details of authenticated devices connected to this Mac.',
    app: 'System Settings',
    format: 'ID (integer), Device Name, Device Type, Login/Activity Dates, Current Status',
    related: 'login_history, Settings'
  },
  login_history: {
    description: 'History logs of system logins including location and status info.',
    app: 'Security Settings',
    format: 'ID (integer), Device ID (foreign key), Login Time, Location, Status',
    related: 'user_devices'
  },
  Settings: {
    description: 'Global system UI preference settings (Theme, Highlight color, Wallpapers).',
    app: 'Settings App',
    format: 'ID (integer), Device ID, Appearance, Colors, Glass, Wallpaper, Timestamps',
    related: 'user_devices'
  },
  user_profile: {
    description: 'User details, including name, email, profile picture, and Google sync info.',
    app: 'Settings (Profile)',
    format: 'ID (integer), Full Name, Email, Sync Google details, Profile Pic URL, Timestamps',
    related: 'None'
  },
  invoice_items: {
    description: 'Individual product transaction records saved under invoices.',
    app: 'Billing App',
    format: 'ID, Invoice ID, Product, Pack Size, Batch, Exp Date, Qty, Discounts, Rates, Amounts',
    related: 'invoices, products, variants, batches'
  },
  orders: {
    description: 'Purchase orders details showing stages, deliveries, and total bill values.',
    app: 'Purchase Orders',
    format: 'ID (integer), Order Number, Customer ID, Current Stage, Dates, Notes, Totals',
    related: 'order_items, contacts'
  },
  invoices: {
    description: 'Stores generated invoices summaries and grand totals.',
    app: 'Billing App',
    format: 'ID (integer), Customer ID (foreign key), Invoice No, Dates, Totals, Discounts, GST, Due',
    related: 'invoice_items, payments, contacts, ledger'
  },
  customer_item_memory: {
    description: 'Cached custom customer discount memory mapping past transaction overrides.',
    app: 'Billing App',
    format: 'ID (integer), Customer ID, Product ID, Discount overrides, Scheme, Tax settings, Timestamps',
    related: 'contacts, products'
  },
  contacts: {
    description: 'Customer contact directory showing address, drug licences, GSTIN, and metrics.',
    app: 'Contacts App / Billing',
    format: 'ID (integer), Name, Email, Phone, Address, Licence, PAN, Total/Avg Sales, Status',
    related: 'invoices, ledger, payments, orders'
  },
  desktop_state: {
    description: 'Serialized layout position states of desktop folders and active window frames.',
    app: 'Desktop Environment',
    format: 'User ID (integer), State JSON data, Timestamp',
    related: 'None'
  },
  clock_settings: {
    description: 'System clock preferences, timezone, cityName, and world clocks.',
    app: 'Clock Widget / App',
    format: 'User ID (integer), Clock Mode, Timezone, City Name, World Clocks JSON, Timestamp',
    related: 'None'
  },
  weather_settings: {
    description: 'Configured weather cities, unit modes (C/F), and widget expansion states.',
    app: 'Weather Widget',
    format: 'User ID (integer), City Name, Lat, Lon, Temperature Unit, Exp Status, Timestamp',
    related: 'None'
  },
  quick_notes: {
    description: 'Stores fast scratchpad notes loaded inside widgets or overlay panes.',
    app: 'Quick Note Widget',
    format: 'ID (integer), Title (text), Content (text), Timestamp',
    related: 'None'
  },
  reminders: {
    description: 'Reminders list items with completion checkboxes displayed in widget panes.',
    app: 'Reminders Widget',
    format: 'ID (integer), Widget ID, Reminder Text, Completed Flag (integer), Timestamp',
    related: 'None'
  },
  payments: {
    description: 'Payments receipt records saved against invoice entries.',
    app: 'Billing App',
    format: 'ID, Customer ID, Payment Medium, Amount, Credit Amount, Reason, Payment Date, Notes',
    related: 'invoices, contacts, ledger'
  },
  cloud_files: {
    description: 'Cloud drive repository files showing name, size, upload path, and sharing credentials.',
    app: 'Cloud App',
    format: 'ID, Original Name, MIME Type, Size, Local Path, Space Category, Share Tokens, Dates',
    related: 'cloud_batch_shares'
  },
  cloud_batch_shares: {
    description: 'Shared multi-file batch download groups showing passwords and limits.',
    app: 'Cloud App',
    format: 'ID, Share Token, File IDs list, Password hash, Expirations, Downloads count',
    related: 'cloud_files'
  }
};

const RELATION_MAPPINGS = {
  category_id: 'categories',
  product_id: 'products',
  variant_id: 'variants',
  batch_id: 'batches',
  customer_id: 'contacts',
  invoice_id: 'invoices',
  order_id: 'orders',
  device_id: 'user_devices'
};

export class StorageComponent {
  constructor(container) {
    this.container = container;
    this.tables = [];
    this.selectedTable = null;
    this.rows = [];
    this.columns = [];
    this.columnTypes = {};
    this.selectedRowIds = new Set();
    this.excludedRowIds = new Set();
    this.backups = [];
    this.selectAllAllPages = false;
    
    // Pagination & Search
    this.currentPage = 1;
    this.limit = 20;
    this.totalRows = 0;
    this.searchQuery = '';
    this.sortBy = '';
    this.sortOrder = 'ASC';
    
    // Custom View State
    this.isSandboxOpen = false;
    this.isBackupPanelOpen = false;
  }

  async render() {
    this.container.innerHTML = `
      <div class="storage-container">
        <!-- Banner Metadata Card (Frosted Gold) -->
        <div class="storage-banner" id="storage-meta-banner">
          <div class="storage-banner-title">
            <span id="storage-banner-name">Database Explorer</span>
            <span class="storage-banner-app" id="storage-banner-app">System Database</span>
          </div>
          <div class="storage-banner-desc" id="storage-banner-desc">
            Select a table from the list below to explore data parameters, run search, update records, or perform batch deletions.
          </div>
          <div class="storage-banner-meta">
            <div class="storage-banner-meta-item">📁 <strong>Format:</strong> <span id="storage-banner-format">N/A</span></div>
            <div class="storage-banner-meta-item">🔗 <strong>Related Tables:</strong> <span id="storage-banner-relations">N/A</span></div>
          </div>
        </div>

        <!-- Advanced Sub-Panels (Toggled by toolbar buttons) -->
        <!-- SQL Sandbox Console -->
        <div class="storage-sandbox-panel hidden" id="storageSandboxPanel">
          <div class="storage-sandbox-title">
            <span>💻 SQL Sandbox (Read-Only SELECT Console)</span>
            <button class="storage-cell-edit-btn" id="storageSandboxCloseBtn">✕ Close</button>
          </div>
          <textarea class="storage-sandbox-editor" id="storageSandboxEditor" placeholder="SELECT * FROM notes LIMIT 10;"></textarea>
          <div style="display: flex; justify-content: flex-end; gap: 8px;">
            <button class="storage-btn" id="storageSandboxClearBtn">Clear</button>
            <button class="storage-btn primary" id="storageSandboxRunBtn">⚡ Run Query</button>
          </div>
        </div>

        <!-- Backups Manager -->
        <div class="storage-backup-panel hidden" id="storageBackupPanel">
          <div class="storage-sandbox-title">
            <span>📦 Database Backups & Restore Manager</span>
            <button class="storage-cell-edit-btn" id="storageBackupCloseBtn">✕ Close</button>
          </div>
          <div class="storage-backup-list" id="storageBackupList">
            <div style="text-align: center; color: var(--settings-text-tertiary); padding: 10px 0;">No backups created yet.</div>
          </div>
          <div style="display: flex; justify-content: flex-end;">
            <button class="storage-btn primary" id="storageCreateBackupBtn">🛡️ Snapshot Backup</button>
          </div>
        </div>

        <!-- Toolbar controls -->
        <div class="storage-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <select class="storage-table-selector" id="storageTableSelector">
              <option value="">-- Select Table --</option>
            </select>
          </div>
          
          <input type="text" class="storage-search" id="storageSearchInput" placeholder="Search rows..." disabled>
          
          <div class="storage-actions">
            <button class="storage-btn" id="storageSandboxToggleBtn" title="SQL Sandbox Console">💻 SQL</button>
            <button class="storage-btn" id="storageBackupToggleBtn" title="Backups Manager">📦 Backups</button>
            <button class="storage-btn" id="storageExportCsvBtn" title="Export current rows as CSV" disabled>📥 CSV</button>
            <button class="storage-btn" id="storageExportJsonBtn" title="Export current rows as JSON" disabled>📥 JSON</button>
            <button class="storage-btn" id="storageRefreshBtn" disabled>🔄</button>
            <button class="storage-btn primary" id="storageAddBtn" disabled>＋ Add</button>
            <button class="storage-btn danger" id="storageDeleteSelectedBtn" disabled>🗑️ (0)</button>
          </div>
        </div>

        <!-- Selection Info Banner -->
        <div class="storage-selection-banner hidden" id="storageSelectionBanner" style="background: var(--gold-bg-translucent); border: 1px solid var(--gold-border); border-radius: 8px; padding: 6px 12px; font-size: 12px; text-align: center; margin-bottom: 8px;">
          <span id="storageSelectionBannerText">All rows on this page are selected.</span>
          <a href="#" id="storageSelectAllPagesLink" style="color: var(--gold-primary); font-weight: 600; text-decoration: underline; margin-left: 6px;">Select all rows</a>
        </div>

        <!-- Scrollable Grid -->
        <div class="storage-table-wrapper">
          <table class="storage-table">
            <thead id="storageTableHeader">
              <tr>
                <th style="width: 40px; text-align: center;">No table selected</th>
              </tr>
            </thead>
            <tbody id="storageTableBody">
              <tr>
                <td style="text-align: center; color: var(--settings-text-tertiary); padding: 40px 0;">
                  Please select an SQLite table to explore database records.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination Footer -->
        <div class="storage-pagination">
          <div class="storage-page-info" id="storagePageInfo">Showing 0 - 0 of 0 records</div>
          <div class="storage-pagination-btns">
            <button class="storage-btn" id="storagePrevPageBtn" disabled>◀ Prev</button>
            <button class="storage-btn" id="storageNextPageBtn" disabled>Next ▶</button>
          </div>
        </div>
      </div>
    `;

    // Fetch lists of tables
    await this.fetchTables();
    
    // Bind listeners
    this.bindEvents();
  }

  async fetchTables() {
    try {
      const res = await fetch('/api/settings/db/tables');
      if (res.ok) {
        const data = await res.json();
        this.tables = data.tables || [];
        this.populateTableSelector();
      } else {
        console.error('Failed to fetch DB tables list');
      }
    } catch (err) {
      console.error('Error fetching tables:', err);
    }
  }

  populateTableSelector() {
    const selector = document.getElementById('storageTableSelector');
    if (!selector) return;

    const val = this.selectedTable;
    selector.innerHTML = `<option value="">-- Select Table --</option>` +
      this.tables.map(t => `<option value="${t.name}">${t.name} (${t.count})</option>`).join('');

    if (val && this.tables.some(t => t.name === val)) {
      selector.value = val;
    }
  }

  bindEvents() {
    const selector = document.getElementById('storageTableSelector');
    const searchInput = document.getElementById('storageSearchInput');
    const refreshBtn = document.getElementById('storageRefreshBtn');
    const addBtn = document.getElementById('storageAddBtn');
    const deleteBtn = document.getElementById('storageDeleteSelectedBtn');
    const prevBtn = document.getElementById('storagePrevPageBtn');
    const nextBtn = document.getElementById('storageNextPageBtn');
    
    // Advanced panels toggles
    const sandboxToggle = document.getElementById('storageSandboxToggleBtn');
    const sandboxClose = document.getElementById('storageSandboxCloseBtn');
    const sandboxRun = document.getElementById('storageSandboxRunBtn');
    const sandboxClear = document.getElementById('storageSandboxClearBtn');
    
    const backupToggle = document.getElementById('storageBackupToggleBtn');
    const backupClose = document.getElementById('storageBackupCloseBtn');
    const createBackupBtn = document.getElementById('storageCreateBackupBtn');
    
    // Exports
    const exportCsvBtn = document.getElementById('storageExportCsvBtn');
    const exportJsonBtn = document.getElementById('storageExportJsonBtn');

    selector?.addEventListener('change', (e) => {
      this.selectTable(e.target.value);
    });

    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value;
      this.currentPage = 1;
      this.selectedRowIds.clear();
      this.excludedRowIds.clear();
      this.selectAllAllPages = false;
      const banner = document.getElementById('storageSelectionBanner');
      if (banner) banner.classList.add('hidden');
      this.fetchRows();
    });

    refreshBtn?.addEventListener('click', () => {
      this.fetchRows();
    });

    addBtn?.addEventListener('click', () => {
      this.showAddRowModal();
    });

    deleteBtn?.addEventListener('click', () => {
      this.confirmDeleteSelected();
    });

    prevBtn?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.fetchRows();
      }
    });

    nextBtn?.addEventListener('click', () => {
      const maxPages = Math.ceil(this.totalRows / this.limit);
      if (this.currentPage < maxPages) {
        this.currentPage++;
        this.fetchRows();
      }
    });

    // Sandbox Events
    sandboxToggle?.addEventListener('click', () => {
      this.isSandboxOpen = !this.isSandboxOpen;
      document.getElementById('storageSandboxPanel').classList.toggle('hidden', !this.isSandboxOpen);
    });
    sandboxClose?.addEventListener('click', () => {
      this.isSandboxOpen = false;
      document.getElementById('storageSandboxPanel').classList.add('hidden');
    });
    sandboxClear?.addEventListener('click', () => {
      const editor = document.getElementById('storageSandboxEditor');
      if (editor) editor.value = '';
    });
    sandboxRun?.addEventListener('click', () => {
      this.runSandboxQuery();
    });

    // Backups Events
    backupToggle?.addEventListener('click', () => {
      this.isBackupPanelOpen = !this.isBackupPanelOpen;
      document.getElementById('storageBackupPanel').classList.toggle('hidden', !this.isBackupPanelOpen);
      if (this.isBackupPanelOpen) {
        this.fetchBackups();
      }
    });
    backupClose?.addEventListener('click', () => {
      this.isBackupPanelOpen = false;
      document.getElementById('storageBackupPanel').classList.add('hidden');
    });
    createBackupBtn?.addEventListener('click', () => {
      this.createBackup();
    });

    // Exports Events
    exportCsvBtn?.addEventListener('click', () => this.exportCsv());
    exportJsonBtn?.addEventListener('click', () => this.exportJson());
  }

  selectTable(tableName) {
    this.selectedTable = tableName;
    this.currentPage = 1;
    this.searchQuery = '';
    this.selectedRowIds.clear();
    this.excludedRowIds.clear();
    this.sortBy = '';
    this.sortOrder = 'ASC';
    this.selectAllAllPages = false;
    const banner = document.getElementById('storageSelectionBanner');
    if (banner) banner.classList.add('hidden');

    const searchInput = document.getElementById('storageSearchInput');
    if (searchInput) searchInput.value = '';

    const controls = [
      'storageSearchInput', 'storageRefreshBtn', 'storageAddBtn', 
      'storageDeleteSelectedBtn', 'storageExportCsvBtn', 'storageExportJsonBtn'
    ];
    controls.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !tableName;
    });

    this.updateDeleteButtonCount();

    if (!tableName) {
      this.clearView();
      return;
    }

    this.updateMetadataBanner(tableName);
    this.fetchRows();
  }

  jumpToRelation(targetTable, filterId) {
    const selector = document.getElementById('storageTableSelector');
    if (selector) {
      selector.value = targetTable;
    }
    const searchInput = document.getElementById('storageSearchInput');
    if (searchInput) {
      searchInput.value = filterId;
    }

    // Toggle sandbox off if open to avoid visual confusion
    this.isSandboxOpen = false;
    document.getElementById('storageSandboxPanel')?.classList.add('hidden');

    this.selectedTable = targetTable;
    this.currentPage = 1;
    this.searchQuery = filterId;
    this.selectedRowIds.clear();
    this.excludedRowIds.clear();
    this.sortBy = '';
    this.sortOrder = 'ASC';
    this.selectAllAllPages = false;
    const banner = document.getElementById('storageSelectionBanner');
    if (banner) banner.classList.add('hidden');

    const controls = [
      'storageSearchInput', 'storageRefreshBtn', 'storageAddBtn', 
      'storageDeleteSelectedBtn', 'storageExportCsvBtn', 'storageExportJsonBtn'
    ];
    controls.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = false;
    });

    this.updateDeleteButtonCount();
    this.updateMetadataBanner(targetTable);
    this.fetchRows();
  }

  updateMetadataBanner(tableName) {
    const bannerName = document.getElementById('storage-banner-name');
    const bannerApp = document.getElementById('storage-banner-app');
    const bannerDesc = document.getElementById('storage-banner-desc');
    const bannerFormat = document.getElementById('storage-banner-format');
    const bannerRelations = document.getElementById('storage-banner-relations');

    const meta = TABLE_METADATA[tableName] || {
      description: 'System table managing active application parameters and relational keys.',
      app: 'Settings App',
      format: 'ID (integer, primary key), properties data',
      related: 'None'
    };

    if (bannerName) bannerName.textContent = tableName;
    if (bannerApp) bannerApp.textContent = meta.app;
    if (bannerDesc) bannerDesc.textContent = meta.description;
    if (bannerFormat) bannerFormat.textContent = meta.format;
    if (bannerRelations) bannerRelations.textContent = meta.related;
  }

  clearView() {
    const header = document.getElementById('storageTableHeader');
    const body = document.getElementById('storageTableBody');
    const pageInfo = document.getElementById('storagePageInfo');
    const prevBtn = document.getElementById('storagePrevPageBtn');
    const nextBtn = document.getElementById('storageNextPageBtn');

    if (header) header.innerHTML = `<tr><th style="width: 40px; text-align: center;">No table selected</th></tr>`;
    if (body) body.innerHTML = `<tr><td style="text-align: center; color: var(--settings-text-tertiary); padding: 40px 0;">Please select an SQLite table to explore database records.</td></tr>`;
    if (pageInfo) pageInfo.textContent = 'Showing 0 - 0 of 0 records';
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    
    const banner = document.getElementById('storageSelectionBanner');
    if (banner) banner.classList.add('hidden');
    this.selectAllAllPages = false;
    this.selectedRowIds.clear();
    this.excludedRowIds.clear();
    this.updateMetadataBanner('');
  }

  async fetchRows() {
    if (!this.selectedTable) return;

    const body = document.getElementById('storageTableBody');
    if (body) {
      body.innerHTML = `<tr><td colspan="100" style="text-align: center; color: var(--gold-primary); padding: 40px 0;">⏳ Loading records...</td></tr>`;
    }

    try {
      let url = `/api/settings/db/table/${this.selectedTable}?page=${this.currentPage}&limit=${this.limit}&search=${encodeURIComponent(this.searchQuery)}`;
      if (this.sortBy) {
        url += `&sortBy=${this.sortBy}&sortOrder=${this.sortOrder}`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        this.rows = data.rows || [];
        this.columns = data.columns || [];
        this.columnTypes = data.columnTypes || {};
        this.totalRows = data.total || 0;
        
        this.renderTableHeader();
        this.renderTableBody();
        this.renderPagination();
        this.updateSelectionBanner();
      } else {
        const errData = await res.json();
        if (body) {
          body.innerHTML = `<tr><td colspan="100" style="text-align: center; color: #ff3b30; padding: 40px 0;">❌ Failed to load rows: ${errData.error || 'Server error'}</td></tr>`;
        }
      }
    } catch (err) {
      console.error('Error fetching table rows:', err);
      if (body) {
        body.innerHTML = `<tr><td colspan="100" style="text-align: center; color: #ff3b30; padding: 40px 0;">❌ Network error occurred while fetching records.</td></tr>`;
      }
    }
  }

  renderTableHeader() {
    const header = document.getElementById('storageTableHeader');
    if (!header) return;

    let allSelected = false;
    if (this.rows.length > 0) {
      if (this.selectAllAllPages) {
        allSelected = this.rows.every(r => {
          const id = r.id !== undefined ? r.id : r.user_id;
          return !this.excludedRowIds.has(id);
        });
      } else {
        allSelected = this.rows.every(r => {
          const id = r.id !== undefined ? r.id : r.user_id;
          return this.selectedRowIds.has(id);
        });
      }
    }

    header.innerHTML = `
      <tr>
        <th style="width: 40px; text-align: center;">
          <label class="storage-checkbox-container">
            <input type="checkbox" id="storageMasterCheckbox" ${allSelected ? 'checked' : ''} />
            <span class="storage-checkbox"></span>
          </label>
        </th>
        <th style="width: 50px;">Edit</th>
        ${this.columns.map(col => {
          const type = this.columnTypes[col] || '';
          const typeBadge = type ? `<span class="storage-header-type">${type}</span>` : '';
          return `
            <th style="cursor: pointer;" data-column="${col}">
              ${col} ${typeBadge} ${this.sortBy === col ? (this.sortOrder === 'ASC' ? '▲' : '▼') : ''}
            </th>
          `;
        }).join('')}
      </tr>
    `;

    // Bind sorting click listeners
    header.querySelectorAll('th[data-column]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.getAttribute('data-column');
        if (this.sortBy === col) {
          this.sortOrder = this.sortOrder === 'ASC' ? 'DESC' : 'ASC';
        } else {
          this.sortBy = col;
          this.sortOrder = 'ASC';
        }
        this.fetchRows();
      });
    });

    // Bind master select listener
    const masterCheckbox = document.getElementById('storageMasterCheckbox');
    masterCheckbox?.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      if (isChecked) {
        if (this.selectAllAllPages) {
          this.rows.forEach(r => {
            const id = r.id !== undefined ? r.id : r.user_id;
            this.excludedRowIds.delete(id);
          });
        } else {
          this.rows.forEach(r => {
            const id = r.id !== undefined ? r.id : r.user_id;
            this.selectedRowIds.add(id);
          });
        }
      } else {
        this.selectedRowIds.clear();
        this.excludedRowIds.clear();
        this.selectAllAllPages = false;
      }

      this.updateSelectionBanner();
      this.updateDeleteButtonCount();
      this.renderTableBody();
    });
  }

  renderTableBody() {
    const body = document.getElementById('storageTableBody');
    if (!body) return;

    if (this.rows.length === 0) {
      body.innerHTML = `<tr><td colspan="100" style="text-align: center; color: var(--settings-text-tertiary); padding: 40px 0;">No matching records found.</td></tr>`;
      return;
    }

    body.innerHTML = this.rows.map((row, idx) => {
      const rowId = row.id !== undefined ? row.id : row.user_id;
      const isSelected = this.selectAllAllPages 
        ? !this.excludedRowIds.has(rowId) 
        : this.selectedRowIds.has(rowId);
      
      return `
        <tr class="${isSelected ? 'selected' : ''}" data-row-index="${idx}">
          <td style="text-align: center;">
            <label class="storage-checkbox-container">
              <input type="checkbox" class="storage-row-checkbox" data-id="${rowId}" ${isSelected ? 'checked' : ''} />
              <span class="storage-checkbox"></span>
            </label>
          </td>
          <td>
            <button class="storage-cell-edit-btn" data-index="${idx}">✏️ Edit</button>
          </td>
          ${this.columns.map(col => {
            const rawVal = row[col];
            let renderedHtml = '';
            
            // Clean value check
            if (rawVal === null || rawVal === undefined) {
              renderedHtml = '<span style="color: var(--settings-text-tertiary); font-style: italic;">NULL</span>';
            } else {
              const valStr = String(rawVal);
              
              // 1. Check for Base64 Images or Image Paths
              const isBase64Img = valStr.startsWith('data:image/');
              const isImgPath = (col.includes('image') || col.includes('picture')) && 
                                (valStr.startsWith('/') || valStr.startsWith('http') || valStr.endsWith('.jpg') || valStr.endsWith('.png') || valStr.endsWith('.webp'));
              
              // 2. Check for Foreign Key relations links
              const isForeignKey = col !== 'id' && col !== 'user_id' && RELATION_MAPPINGS[col] !== undefined;

              // 3. Check for Boolean values
              const isBooleanType = (this.columnTypes[col] || '').toLowerCase() === 'boolean' || 
                                    ['completed', 'is_current', 'exclude_from_stats', 'active', 'tint_wallpaper'].includes(col);

              if (isBase64Img || isImgPath) {
                renderedHtml = `<img src="${valStr}" alt="Thumbnail" class="storage-img-thumbnail" data-preview-src="${valStr}" />`;
              } else if (isForeignKey && valStr !== '') {
                const targetTable = RELATION_MAPPINGS[col];
                renderedHtml = `<a class="storage-key-link" data-jump-table="${targetTable}" data-jump-id="${valStr}" title="Jump to ${targetTable} (${valStr})">${valStr}</a>`;
              } else if (isBooleanType && (rawVal === 0 || rawVal === 1 || typeof rawVal === 'boolean')) {
                const isActive = rawVal === 1 || rawVal === true;
                renderedHtml = `<span class="storage-status-badge ${isActive ? 'active' : 'inactive'}">
                  ${isActive ? '● Active' : '○ Inactive'}
                </span>`;
              } else {
                // Default Text with Tooltip support if long
                let cleanText = valStr;
                if (cleanText.includes('<') || cleanText.includes('>')) {
                  cleanText = cleanText.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                }
                
                if (cleanText.length > 25) {
                  renderedHtml = `
                    <div class="storage-cell-container">
                      <span>${cleanText.substring(0, 22)}...</span>
                      <div class="storage-tooltip">${cleanText}</div>
                    </div>
                  `;
                } else {
                  renderedHtml = cleanText;
                }
              }
            }

            return `<td>${renderedHtml}</td>`;
          }).join('')}
        </tr>
      `;
    }).join('');

    // Bind row selection checkboxes
    body.querySelectorAll('.storage-row-checkbox').forEach(chk => {
      chk.addEventListener('change', (e) => {
        const id = isNaN(e.target.getAttribute('data-id')) ? e.target.getAttribute('data-id') : parseInt(e.target.getAttribute('data-id'));
        
        if (e.target.checked) {
          if (this.selectAllAllPages) {
            this.excludedRowIds.delete(id);
          } else {
            this.selectedRowIds.add(id);
          }
        } else {
          if (this.selectAllAllPages) {
            this.excludedRowIds.add(id);
          } else {
            this.selectedRowIds.delete(id);
          }
        }
        
        this.updateSelectionBanner();
        this.updateDeleteButtonCount();
        
        const tr = e.target.closest('tr');
        tr?.classList.toggle('selected', e.target.checked);
        
        const masterCheckbox = document.getElementById('storageMasterCheckbox');
        if (masterCheckbox) {
          let masterChecked = false;
          if (this.rows.length > 0) {
            if (this.selectAllAllPages) {
              masterChecked = this.rows.every(r => !this.excludedRowIds.has(r.id || r.user_id));
            } else {
              masterChecked = this.rows.every(r => this.selectedRowIds.has(r.id || r.user_id));
            }
          }
          masterCheckbox.checked = masterChecked;
        }
      });
    });

    // Bind edit row buttons
    body.querySelectorAll('.storage-cell-edit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(btn.getAttribute('data-index'));
        this.showEditRowModal(this.rows[index]);
      });
    });

    // Bind foreign key jump links click listeners
    body.querySelectorAll('.storage-key-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const table = link.getAttribute('data-jump-table');
        const id = link.getAttribute('data-jump-id');
        if (table && id) {
          this.jumpToRelation(table, id);
        }
      });
    });

    // Bind image preview clicks
    body.querySelectorAll('.storage-img-thumbnail').forEach(img => {
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        const src = img.getAttribute('data-preview-src');
        this.showImagePreview(src);
      });
    });
  }

  renderPagination() {
    const prevBtn = document.getElementById('storagePrevPageBtn');
    const nextBtn = document.getElementById('storageNextPageBtn');
    const pageInfo = document.getElementById('storagePageInfo');

    if (!prevBtn || !nextBtn || !pageInfo) return;

    const maxPages = Math.ceil(this.totalRows / this.limit) || 1;
    prevBtn.disabled = this.currentPage <= 1;
    nextBtn.disabled = this.currentPage >= maxPages;

    const start = this.totalRows === 0 ? 0 : (this.currentPage - 1) * this.limit + 1;
    const end = Math.min(this.currentPage * this.limit, this.totalRows);
    pageInfo.textContent = `Showing ${start} - ${end} of ${this.totalRows} records (Page ${this.currentPage} of ${maxPages})`;
  }

  updateSelectionBanner() {
    const banner = document.getElementById('storageSelectionBanner');
    const bannerText = document.getElementById('storageSelectionBannerText');
    const bannerLink = document.getElementById('storageSelectAllPagesLink');
    const masterCheckbox = document.getElementById('storageMasterCheckbox');

    if (!banner || !bannerText || !bannerLink) return;

    if (this.selectAllAllPages) {
      banner.classList.remove('hidden');
      const count = this.totalRows - this.excludedRowIds.size;
      bannerText.textContent = `All ${count} rows in ${this.selectedTable} are selected.`;
      bannerLink.textContent = `Clear selection`;
      
      bannerLink.onclick = (e) => {
        e.preventDefault();
        if (masterCheckbox) {
          masterCheckbox.checked = false;
          masterCheckbox.dispatchEvent(new Event('change'));
        }
      };
    } else {
      const allPageChecked = this.rows.length > 0 && this.rows.every(r => {
        const id = r.id !== undefined ? r.id : r.user_id;
        return this.selectedRowIds.has(id);
      });

      if (allPageChecked && this.totalRows > this.rows.length) {
        banner.classList.remove('hidden');
        bannerText.textContent = `All ${this.rows.length} rows on this page are selected.`;
        bannerLink.textContent = `Select all ${this.totalRows} rows in ${this.selectedTable}`;
        
        bannerLink.onclick = (e) => {
          e.preventDefault();
          this.selectAllAllPages = true;
          this.excludedRowIds.clear();
          this.updateSelectionBanner();
          this.updateDeleteButtonCount();
          this.renderTableHeader();
          this.renderTableBody();
        };
      } else {
        banner.classList.add('hidden');
      }
    }
  }

  updateDeleteButtonCount() {
    const btn = document.getElementById('storageDeleteSelectedBtn');
    if (btn) {
      const count = this.selectAllAllPages ? (this.totalRows - this.excludedRowIds.size) : this.selectedRowIds.size;
      btn.textContent = `🗑️ (${count})`;
      btn.disabled = count === 0;
    }
  }

  // Exports Features
  exportCsv() {
    if (this.rows.length === 0) return;
    
    // Compile CSV layout safely using Blobs
    const csvHeader = this.columns.join(",");
    const csvRows = this.rows.map(row => {
      return this.columns.map(col => {
        let cell = row[col] === null || row[col] === undefined ? '' : String(row[col]);
        // Escape inner double quotes
        return `"${cell.replace(/"/g, '""')}"`;
      }).join(",");
    });
    
    const csvContent = [csvHeader, ...csvRows].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `${this.selectedTable}_export_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  exportJson() {
    if (this.rows.length === 0) return;
    
    const jsonContent = JSON.stringify(this.rows, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.href = url;
    link.download = `${this.selectedTable}_export_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // SQL Custom Query Sandbox execution
  async runSandboxQuery() {
    const editor = document.getElementById('storageSandboxEditor');
    const sql = editor?.value.trim();
    
    if (!sql) return;
    
    const body = document.getElementById('storageTableBody');
    if (body) {
      body.innerHTML = `<tr><td colspan="100" style="text-align: center; color: var(--gold-primary); padding: 40px 0;">⏳ Running Custom SQL Query...</td></tr>`;
    }

    try {
      const res = await fetch('/api/settings/db/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql })
      });

      if (res.ok) {
        const data = await res.json();
        this.rows = data.rows || [];
        this.columns = data.columns || [];
        this.columnTypes = {}; // custom columns types unknown
        this.totalRows = this.rows.length;
        this.currentPage = 1;

        // Reset sidebar selector
        const selector = document.getElementById('storageTableSelector');
        if (selector) selector.value = '';
        this.selectedTable = null;
        this.selectedRowIds.clear();
        this.updateDeleteButtonCount();

        // Update Metadata banner
        document.getElementById('storage-banner-name').textContent = 'Sandbox SQL Results';
        document.getElementById('storage-banner-app').textContent = 'Query Output';
        document.getElementById('storage-banner-desc').textContent = `Resulting dataset generated by the custom SELECT sandbox query.`;
        document.getElementById('storage-banner-format').textContent = 'Dynamic Sandbox Columns';
        document.getElementById('storage-banner-relations').textContent = 'None';

        // Update buttons state (disable modifications on sandbox results)
        ['storageAddBtn', 'storageDeleteSelectedBtn', 'storageExportCsvBtn', 'storageExportJsonBtn'].forEach(id => {
          const btn = document.getElementById(id);
          if (btn) btn.disabled = id.includes('Export') ? false : true;
        });

        this.renderTableHeader();
        this.renderTableBody();
        
        const pageInfo = document.getElementById('storagePageInfo');
        if (pageInfo) pageInfo.textContent = `Showing ${this.rows.length} custom query rows (Pagination disabled in custom SQL mode)`;
        
        const prevBtn = document.getElementById('storagePrevPageBtn');
        const nextBtn = document.getElementById('storageNextPageBtn');
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
      } else {
        const err = await res.json();
        alert(`SQL Execution Error: ${err.error || 'Server error'}`);
        this.fetchRows(); // restore normal table rows view
      }
    } catch (err) {
      console.error(err);
      alert('Network error executing sandbox SQL query.');
      this.fetchRows();
    }
  }

  // Backup and Restore Methods
  async fetchBackups() {
    const listEl = document.getElementById('storageBackupList');
    if (!listEl) return;
    
    listEl.innerHTML = `<div style="text-align: center; color: var(--gold-primary); padding: 10px 0;">⏳ Loading backup files...</div>`;
    
    try {
      const res = await fetch('/api/settings/db/backups');
      if (res.ok) {
        const data = await res.json();
        this.backups = data.backups || [];
        this.renderBackupsList();
      } else {
        listEl.innerHTML = `<div style="text-align: center; color: #ff3b30; padding: 10px 0;">Failed to load backup files list.</div>`;
      }
    } catch (err) {
      console.error(err);
      listEl.innerHTML = `<div style="text-align: center; color: #ff3b30; padding: 10px 0;">Network error fetching backups list.</div>`;
    }
  }

  renderBackupsList() {
    const listEl = document.getElementById('storageBackupList');
    if (!listEl) return;

    if (this.backups.length === 0) {
      listEl.innerHTML = `<div style="text-align: center; color: var(--settings-text-tertiary); padding: 10px 0;">No backups created yet. Click "Snapshot Backup" below.</div>`;
      return;
    }

    listEl.innerHTML = this.backups.map(b => {
      const date = new Date(b.createdAt).toLocaleString();
      const kbSize = (b.sizeBytes / 1024).toFixed(1) + ' KB';
      return `
        <div class="storage-backup-item">
          <div class="storage-backup-details">
            <span class="storage-backup-name">${b.filename}</span>
            <span class="storage-backup-meta">📅 Created: ${date} | 💾 Size: ${kbSize}</span>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="storage-btn primary" data-restore-file="${b.filename}" style="padding: 4px 10px; font-size: 10px;">Restore</button>
            <button class="storage-btn danger" data-delete-file="${b.filename}" style="padding: 4px 10px; font-size: 10px;">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    // Bind restore listeners
    listEl.querySelectorAll('[data-restore-file]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const filename = btn.getAttribute('data-restore-file');
        this.confirmRestoreBackup(filename);
      });
    });

    // Bind delete backup listeners
    listEl.querySelectorAll('[data-delete-file]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const filename = btn.getAttribute('data-delete-file');
        this.deleteBackup(filename);
      });
    });
  }

  async deleteBackup(filename) {
    const confirmDelete = confirm(`⚠️ Warning: Are you sure you want to permanently delete the backup file "${filename}"?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch('/api/settings/db/backup', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });

      if (res.ok) {
        this.fetchBackups();
      } else {
        const err = await res.json();
        alert(`Error deleting backup: ${err.error || 'Server error'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Network error occurred during backup deletion.');
    }
  }

  async createBackup() {
    const btn = document.getElementById('storageCreateBackupBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creating Backup...';
    }

    try {
      const res = await fetch('/api/settings/db/backup', { method: 'POST' });
      if (res.ok) {
        await this.fetchBackups();
      } else {
        alert('Failed to generate database snapshot backup.');
      }
    } catch (err) {
      console.error(err);
      alert('Network error creating backup.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🛡️ Snapshot Backup';
      }
    }
  }

  async confirmRestoreBackup(filename) {
    const confirmRestore = confirm(`⚠️ Warning: Are you sure you want to restore database from "${filename}"? This will overwrite your active database data!`);
    if (!confirmRestore) return;

    try {
      const res = await fetch('/api/settings/db/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename })
      });

      if (res.ok) {
        alert('Database restored successfully from snapshot!');
        // Refresh explorer
        this.fetchTables();
        if (this.selectedTable) {
          this.fetchRows();
        }
      } else {
        const err = await res.json();
        alert(`Error restoring database: ${err.error || 'Server error'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Network error occurred during restore.');
    }
  }

  showImagePreview(src) {
    const previewHtml = `
      <div class="storage-modal-overlay" id="storageImgPreviewOverlay" style="z-index: 1000000;">
        <div class="storage-img-preview-container" style="position: relative; max-width: 90%; max-height: 90%; animation: previewScaleIn 0.25s cubic-bezier(0.1, 0.9, 0.2, 1);">
          <img src="${src}" style="max-width: 100%; max-height: 80vh; border-radius: 12px; box-shadow: var(--gold-glow), 0 20px 50px rgba(0,0,0,0.5); border: 2px solid var(--gold-border);" />
          <button class="storage-btn" id="storageImgPreviewCloseBtn" style="position: absolute; top: 10px; right: 10px; border-radius: 50%; width: 30px; height: 30px; padding: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); color: white; border: none; font-size: 16px; font-weight: 700; cursor: pointer;">✕</button>
        </div>
      </div>
    `;
    this.container.insertAdjacentHTML('beforeend', previewHtml);
    
    const overlay = document.getElementById('storageImgPreviewOverlay');
    const closeBtn = document.getElementById('storageImgPreviewCloseBtn');
    
    const close = () => {
      if (overlay) {
        overlay.style.animation = 'modalFadeOut 0.2s ease-out';
        const container = overlay.querySelector('.storage-img-preview-container');
        if (container) container.style.animation = 'previewScaleOut 0.2s ease-out';
        setTimeout(() => overlay.remove(), 180);
      }
    };
    
    closeBtn?.addEventListener('click', close);
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  showAddRowModal() {
    const modalHtml = `
      <div class="storage-modal-overlay" id="storageModalOverlay">
        <div class="storage-modal">
          <div class="storage-modal-header">🆕 Insert New Row into ${this.selectedTable}</div>
          <div class="storage-modal-body">
            ${this.columns.map(col => {
              const isDisabled = col === 'id' || col === 'created_at' || col === 'updated_at';
              const isRequired = col === 'title' || col === 'name';
              return `
                <div class="storage-field-row">
                  <label for="field-${col}">${col} ${isDisabled ? '(Auto-generated)' : (isRequired ? '<span style="color: #ff3b30">*</span>' : '')}</label>
                  <input type="text" id="field-${col}" ${isDisabled ? 'disabled placeholder="Auto"' : ''} />
                </div>
              `;
            }).join('')}
          </div>
          <div class="storage-modal-footer">
            <button class="storage-btn" id="storageModalCancelBtn">Cancel</button>
            <button class="storage-btn primary" id="storageModalSaveBtn">Insert Row</button>
          </div>
        </div>
      </div>
    `;

    this.container.insertAdjacentHTML('beforeend', modalHtml);

    // Bind modal actions
    const overlay = document.getElementById('storageModalOverlay');
    const cancelBtn = document.getElementById('storageModalCancelBtn');
    const saveBtn = document.getElementById('storageModalSaveBtn');

    const closeModal = () => overlay?.remove();

    cancelBtn?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    saveBtn?.addEventListener('click', async () => {
      const data = {};
      this.columns.forEach(col => {
        const input = document.getElementById(`field-${col}`);
        if (input && !input.disabled) {
          data[col] = input.value;
        }
      });

      saveBtn.disabled = true;
      saveBtn.textContent = 'Inserting...';

      try {
        const res = await fetch(`/api/settings/db/table/${this.selectedTable}/row`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data })
        });

        if (res.ok) {
          closeModal();
          this.fetchRows();
          this.fetchTables(); // Refresh table size indicators
        } else {
          const err = await res.json();
          alert(`Error inserting row: ${err.error || 'Server error'}`);
          saveBtn.disabled = false;
          saveBtn.textContent = 'Insert Row';
        }
      } catch (err) {
        console.error(err);
        alert('Network error occurred during insertion');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Insert Row';
      }
    });
  }

  showEditRowModal(row) {
    const rowIdColumn = this.columns.includes('id') ? 'id' : (this.columns.includes('user_id') ? 'user_id' : this.columns[0]);
    const rowIdValue = row[rowIdColumn];

    const modalHtml = `
      <div class="storage-modal-overlay" id="storageModalOverlay">
        <div class="storage-modal">
          <div class="storage-modal-header">✏️ Edit Row in ${this.selectedTable} (${rowIdColumn}: ${rowIdValue})</div>
          <div class="storage-modal-body">
            ${this.columns.map(col => {
              const isDisabled = col === rowIdColumn || col === 'created_at' || col === 'updated_at';
              let val = row[col];
              if (val === null || val === undefined) val = '';
              return `
                <div class="storage-field-row">
                  <label for="field-${col}">${col} ${isDisabled ? '(Read-only)' : ''}</label>
                  <textarea id="field-${col}" ${isDisabled ? 'disabled' : ''} rows="2">${val}</textarea>
                </div>
              `;
            }).join('')}
          </div>
          <div class="storage-modal-footer">
            <button class="storage-btn" id="storageModalCancelBtn">Cancel</button>
            <button class="storage-btn primary" id="storageModalSaveBtn">Save Changes</button>
          </div>
        </div>
      </div>
    `;

    this.container.insertAdjacentHTML('beforeend', modalHtml);

    // Bind modal actions
    const overlay = document.getElementById('storageModalOverlay');
    const cancelBtn = document.getElementById('storageModalCancelBtn');
    const saveBtn = document.getElementById('storageModalSaveBtn');

    const closeModal = () => overlay?.remove();

    cancelBtn?.addEventListener('click', closeModal);
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    saveBtn?.addEventListener('click', async () => {
      const data = {};
      this.columns.forEach(col => {
        const input = document.getElementById(`field-${col}`);
        if (input && !input.disabled) {
          data[col] = input.value;
        }
      });

      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        const res = await fetch(`/api/settings/db/table/${this.selectedTable}/row`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rowIdColumn,
            rowIdValue,
            data
          })
        });

        if (res.ok) {
          closeModal();
          this.fetchRows();
        } else {
          const err = await res.json();
          alert(`Error saving changes: ${err.error || 'Server error'}`);
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
      } catch (err) {
        console.error(err);
        alert('Network error occurred while saving.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
      }
    });
  }

  async confirmDeleteSelected() {
    const count = this.selectAllAllPages ? (this.totalRows - this.excludedRowIds.size) : this.selectedRowIds.size;
    if (count === 0) return;

    const doubleCheck = confirm(`⚠️ Danger: Are you sure you want to delete all ${count} matching records from the "${this.selectedTable}" table? This action CANNOT be undone!`);
    if (!doubleCheck) return;

    const deleteBtn = document.getElementById('storageDeleteSelectedBtn');
    if (deleteBtn) {
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting...';
    }

    try {
      const rowIdColumn = this.columns.includes('id') ? 'id' : (this.columns.includes('user_id') ? 'user_id' : this.columns[0]);
      
      const payload = {
        rowIdColumn
      };
      
      if (this.selectAllAllPages) {
        payload.selectAll = true;
        payload.search = this.searchQuery;
        payload.excludedRowIds = Array.from(this.excludedRowIds);
      } else {
        payload.rowIds = Array.from(this.selectedRowIds);
      }

      const res = await fetch(`/api/settings/db/table/${this.selectedTable}/row`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        this.selectedRowIds.clear();
        this.excludedRowIds.clear();
        this.selectAllAllPages = false;
        const banner = document.getElementById('storageSelectionBanner');
        if (banner) banner.classList.add('hidden');
        
        this.updateDeleteButtonCount();
        this.fetchRows();
        this.fetchTables(); // Refresh counts
      } else {
        const err = await res.json();
        alert(`Error executing deletion: ${err.error || 'Server error'}`);
        this.updateDeleteButtonCount();
      }
    } catch (err) {
      console.error(err);
      alert('Network error occurred during batch deletion.');
      this.updateDeleteButtonCount();
    }
  }
}
