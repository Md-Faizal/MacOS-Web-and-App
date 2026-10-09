/**
 * ManufacturingApp - Ayurvedic GMP & Schedule T Manufacturing Suite
 * Utkal Chemical Aushadhalaya (OR-02/AYUR)
 * Backed by pure Rust SuiteCore WebAssembly
 */

import { BmrPipelineView } from './bmr-pipeline.js';
import { MasterFormulasView } from './master-formulas.js';
import { RawMaterialsView } from './raw-materials.js';
import { StatutoryAuditView } from './statutory-audit.js';
import { InwardProcurementView } from './inward-procurement.js';
import { TechnicalStaffView } from './technical-staff.js';

class ManufacturingApp extends AppWindow {
  constructor(containerId, callbacks = {}, params = null) {
    const config = {
      appId: 'manufacturing',
      appName: 'Manufacturing',
      containerId: containerId,
      callbacks: callbacks,
      preset: 'large'
    };

    super(config);
    this.window.classList.add('manufacturing-window');

    this.currentView = 'batches';
    this.params = params;

    // View instances
    this.views = {
      batches: new BmrPipelineView(this),
      formulas: new MasterFormulasView(this),
      procurement: new InwardProcurementView(this),
      materials: new RawMaterialsView(this),
      staff: new TechnicalStaffView(this),
      audit: new StatutoryAuditView(this)
    };

    window.ManufacturingAppInstance = this;
    this.setupUI();
  }

  async setupUI() {
    this.buildLayout();
    this.setupHeaderControls();
    this.setupModals();
    this.switchView('batches');

    // Subscribe to real-time sync events
    if (window.CoreDataBus) {
      window.CoreDataBus.subscribe('manufacturing:batch', () => {
        if (this.currentView === 'batches') this.views.batches.loadBatches();
        if (this.currentView === 'audit') this.views.audit.loadData();
        this.updateSidebarBadges();
      });
      window.CoreDataBus.subscribe('raw_material:stock', () => {
        if (this.currentView === 'materials') this.views.materials.loadRawMaterials();
        if (this.currentView === 'procurement') this.views.procurement.loadSuppliers();
        this.updateSidebarBadges();
      });
      window.CoreDataBus.subscribe('inward:purchase_order', () => {
        if (this.currentView === 'procurement') this.views.procurement.loadPurchaseOrders();
        this.updateSidebarBadges();
      });
      window.CoreDataBus.subscribe('inward:payment', () => {
        if (this.currentView === 'procurement') {
          this.views.procurement.loadSuppliers();
        }
      });
      window.CoreDataBus.subscribe('technical:staff', () => {
        if (this.currentView === 'staff') this.views.staff.loadStaff();
        this.updateSidebarBadges();
      });
    }
  }

  setupHeaderControls() {
    const container = document.getElementById(this.containerId);
    const titleBar = container?.querySelector('.app-title-bar');
    if (!titleBar) return;

    // Standardized macOS Left Controls (Sidebar Toggle Button)
    const leftControls = document.createElement('div');
    leftControls.className = 'manufacturing-left-controls';

    const expandBtn = document.createElement('button');
    expandBtn.className = 'manufacturing-header-btn';
    expandBtn.id = 'manufacturingExpandBtn';
    expandBtn.title = 'Show/Hide Sidebar';
    expandBtn.setAttribute('aria-label', 'Toggle Sidebar');
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

    // Right Controls Group (Unified Search + Quick Action Buttons)
    const spacer = titleBar.querySelector('.title-spacer');
    const rightControls = document.createElement('div');
    rightControls.className = 'manufacturing-header-controls';

    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'manufacturing-header-buttons';
    buttonsContainer.innerHTML = `
      <button class="manufacturing-header-btn" id="mfgHeaderRefreshBtn" title="Refresh Active View">↻</button>
      <button class="manufacturing-header-btn mfg-header-ai-btn" id="mfgHeaderAiBtn" title="AI Formulation Advisor">✨ AI</button>
      <button class="manufacturing-header-btn" id="mfgHeaderAddBtn" title="Add / Initiate Record">+</button>
    `;

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'manufacturing-header-search';
    searchInput.id = 'mfgHeaderSearch';
    searchInput.placeholder = 'Search manufacturing...';

    rightControls.appendChild(buttonsContainer);
    rightControls.appendChild(searchInput);

    if (spacer && spacer.parentNode) {
      spacer.parentNode.replaceChild(rightControls, spacer);
    } else {
      titleBar.appendChild(rightControls);
    }

    // Listeners
    expandBtn.addEventListener('click', () => this.toggleSidebar());
    buttonsContainer.querySelector('#mfgHeaderRefreshBtn')?.addEventListener('click', () => this.refreshCurrentView());
    buttonsContainer.querySelector('#mfgHeaderAiBtn')?.addEventListener('click', () => this.openAiFormulationModal());
    buttonsContainer.querySelector('#mfgHeaderAddBtn')?.addEventListener('click', () => this.handleHeaderAddAction());

    searchInput.addEventListener('input', (e) => {
      this.handleGlobalSearch(e.target.value.trim());
    });

    this.expandBtn = expandBtn;
    this.headerSearchInput = searchInput;
  }

  toggleSidebar() {
    if (!this.sidebar) {
      this.sidebar = this.getContentArea()?.querySelector('.manufacturing-sidebar');
    }
    if (this.sidebar) {
      const isHidden = this.sidebar.classList.toggle('hidden');
      if (this.expandBtn) {
        this.expandBtn.classList.toggle('sidebar-collapsed', isHidden);
      }
    }
  }

  refreshCurrentView() {
    this.updateSidebarBadges();
    if (this.currentView === 'batches') this.views.batches?.loadBatches();
    else if (this.currentView === 'formulas') this.views.formulas?.loadFormulas();
    else if (this.currentView === 'procurement') this.views.procurement?.loadAllData();
    else if (this.currentView === 'materials') this.views.materials?.loadRawMaterials();
    else if (this.currentView === 'staff') this.views.staff?.loadStaff();
    else if (this.currentView === 'audit') this.views.audit?.loadData();
  }

  handleHeaderAddAction() {
    if (this.currentView === 'batches') this.openNewBatchModal();
    else if (this.currentView === 'formulas') this.openNewFormulaModal();
    else if (this.currentView === 'procurement') this.openNewPoModal();
    else if (this.currentView === 'materials') this.openCreateMaterialModal();
    else if (this.currentView === 'staff') this.openNewStaffModal();
    else if (this.currentView === 'audit') this.openNewBatchModal();
  }

  handleGlobalSearch(query) {
    if (this.currentView === 'batches' && typeof this.views.batches?.filterBatches === 'function') {
      this.views.batches.filterBatches(query);
    } else if (this.currentView === 'formulas' && typeof this.views.formulas?.filterFormulas === 'function') {
      this.views.formulas.filterFormulas(query);
    } else if (this.currentView === 'procurement' && typeof this.views.procurement?.filterData === 'function') {
      this.views.procurement.filterData(query);
    } else if (this.currentView === 'materials' && typeof this.views.materials?.filterMaterials === 'function') {
      this.views.materials.filterMaterials(query);
    } else if (this.currentView === 'staff' && typeof this.views.staff?.filterStaff === 'function') {
      this.views.staff.filterStaff(query);
    }
  }

  async updateSidebarBadges() {
    try {
      const [batchesRes, formulasRes, suppliersRes, materialsRes, staffRes] = await Promise.allSettled([
        fetch('/api/manufacturing/batches').then(r => r.json()),
        fetch('/api/manufacturing/master-formulas').then(r => r.json()),
        fetch('/api/manufacturing/suppliers').then(r => r.json()),
        fetch('/api/manufacturing/raw-materials').then(r => r.json()),
        fetch('/api/manufacturing/technical-staff').then(r => r.json())
      ]);

      const contentArea = this.getContentArea();
      if (!contentArea) return;

      if (batchesRes.status === 'fulfilled' && batchesRes.value?.batches) {
        const badge = contentArea.querySelector('#mfgBadgeBatches');
        if (badge) badge.textContent = batchesRes.value.batches.length;
      }
      if (formulasRes.status === 'fulfilled' && formulasRes.value?.formulas) {
        const badge = contentArea.querySelector('#mfgBadgeFormulas');
        if (badge) badge.textContent = formulasRes.value.formulas.length;
      }
      if (suppliersRes.status === 'fulfilled' && suppliersRes.value?.suppliers) {
        const badge = contentArea.querySelector('#mfgBadgeProcurement');
        if (badge) badge.textContent = suppliersRes.value.suppliers.length;
      }
      if (materialsRes.status === 'fulfilled' && materialsRes.value?.materials) {
        const badge = contentArea.querySelector('#mfgBadgeMaterials');
        if (badge) badge.textContent = materialsRes.value.materials.length;
      }
      if (staffRes.status === 'fulfilled' && staffRes.value?.staff) {
        const badge = contentArea.querySelector('#mfgBadgeStaff');
        if (badge) badge.textContent = staffRes.value.staff.length;
      }
    } catch (e) {
      // non-critical badge sync
    }
  }

  buildLayout() {
    const contentArea = this.getContentArea();
    if (!contentArea) return;

    contentArea.innerHTML = `
      <div class="manufacturing-body">
        <!-- Sidebar Navigation -->
        <div class="manufacturing-sidebar">
          <span class="manufacturing-sidebar-header">Floor & Pipeline</span>
          <button class="manufacturing-menu-item active" data-view="batches">
            <span>🏭</span> Active Batches (BMR)
            <span class="manufacturing-badge" id="mfgBadgeBatches">0</span>
          </button>
          <button class="manufacturing-menu-item" data-view="formulas">
            <span>📜</span> Master Formulas (MFR)
            <span class="manufacturing-badge" id="mfgBadgeFormulas">0</span>
          </button>

          <hr style="margin: 6px 0; border: none; border-top: 1px solid var(--mfg-border);">

          <span class="manufacturing-sidebar-header">Inward & Inventory</span>
          <button class="manufacturing-menu-item" data-view="procurement">
            <span>📦</span> Inward Procurement & Ledger
            <span class="manufacturing-badge" id="mfgBadgeProcurement">0</span>
          </button>
          <button class="manufacturing-menu-item" data-view="materials">
            <span>🌿</span> Raw Materials & Packaging
            <span class="manufacturing-badge" id="mfgBadgeMaterials">0</span>
          </button>

          <hr style="margin: 6px 0; border: none; border-top: 1px solid var(--mfg-border);">

          <span class="manufacturing-sidebar-header">AYUSH GMP & Masters</span>
          <button class="manufacturing-menu-item" data-view="staff">
            <span>🩺</span> Doctors & Technical Staff
            <span class="manufacturing-badge" id="mfgBadgeStaff">0</span>
          </button>
          <button class="manufacturing-menu-item" data-view="audit">
            <span>📋</span> Schedule T Registers
          </button>

          <!-- Sidebar Footer (Reused from Contacts App) -->
          <div class="manufacturing-sidebar-footer">
            <div class="mfg-sidebar-version">
              <span class="mfg-status-dot"></span> AYUSH GMP v2.4
            </div>
            <button class="mfg-sidebar-refresh-btn" id="mfgSidebarRefreshBtn" title="Refresh Schedule T Data">↻</button>
          </div>
        </div>

        <!-- Main View Area -->
        <div class="manufacturing-main">
          <div class="manufacturing-view-container" id="mfgActiveViewContainer">
            <!-- Active Subview Injected Here -->
          </div>
        </div>
      </div>
    `;

    this.sidebar = contentArea.querySelector('.manufacturing-sidebar');

    // Hook sidebar menu buttons
    contentArea.querySelectorAll('.manufacturing-menu-item').forEach(btn => {
      btn.addEventListener('click', () => {
        contentArea.querySelectorAll('.manufacturing-menu-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.switchView(btn.dataset.view);
      });
    });

    contentArea.querySelector('#mfgSidebarRefreshBtn')?.addEventListener('click', () => {
      this.refreshCurrentView();
    });

    this.updateSidebarBadges();
  }

  async switchView(viewName) {
    if (!this.views[viewName]) return;
    this.currentView = viewName;
    const viewContainer = this.getContentArea().querySelector('#mfgActiveViewContainer');
    if (viewContainer) {
      await this.views[viewName].render(viewContainer);
      if (this.headerSearchInput && this.headerSearchInput.value) {
        this.handleGlobalSearch(this.headerSearchInput.value.trim());
      }
    }
  }

  // ==========================================
  // MODAL MANAGEMENT (OUTSIDE APP WINDOW IN MAIN WINDOW)
  // ==========================================
  setupModals() {
    let backdrop = document.getElementById('mfgModalBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'mfgModalBackdrop';
      backdrop.className = 'mfg-modal-backdrop';
      backdrop.innerHTML = `<div class="mfg-modal-dialog" id="mfgModalDialog"></div>`;
      document.body.appendChild(backdrop);

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) this.closeModal();
      });

      this._escapeKeyHandler = (e) => {
        if (e.key === 'Escape') {
          const bd = document.getElementById('mfgModalBackdrop');
          if (bd && bd.classList.contains('active')) {
            this.closeModal();
          }
        }
      };
      window.addEventListener('keydown', this._escapeKeyHandler);
    }
  }

  openModal(headerTitle, bodyHtml, footerHtml, isLarge = false) {
    let backdrop = document.getElementById('mfgModalBackdrop');
    if (!backdrop) {
      this.setupModals();
      backdrop = document.getElementById('mfgModalBackdrop');
    }
    const dialog = document.getElementById('mfgModalDialog');
    if (!backdrop || !dialog) return;

    const useLarge = isLarge ||
      headerTitle.includes('Ledger') ||
      headerTitle.includes('BMR') ||
      headerTitle.includes('Advisor') ||
      headerTitle.includes('Purchase Order') ||
      headerTitle.includes('Master Formula');

    if (useLarge) {
      dialog.classList.add('mfg-modal-large');
    } else {
      dialog.classList.remove('mfg-modal-large');
    }

    dialog.innerHTML = `
      <div class="mfg-modal-header">
        <div class="mfg-modal-header-left">
          <span class="mfg-modal-badge">Ayurvedic GMP • Schedule T</span>
          <h3 class="mfg-modal-title">${headerTitle}</h3>
        </div>
        <button class="mfg-modal-close" onclick="window.ManufacturingAppInstance.closeModal()" title="Close dialog">✕</button>
      </div>
      <div class="mfg-modal-body">
        ${bodyHtml}
      </div>
      <div class="mfg-modal-footer">
        ${footerHtml}
      </div>
    `;

    dialog.querySelector('.mfg-modal-close')?.addEventListener('click', () => this.closeModal());

    backdrop.classList.add('active');
    document.body.classList.add('mfg-modal-open');
  }

  closeModal() {
    const backdrop = document.getElementById('mfgModalBackdrop');
    if (backdrop) {
      backdrop.classList.remove('active');
    }
    document.body.classList.remove('mfg-modal-open');
  }

  close() {
    this.closeModal();
    if (this._escapeKeyHandler) {
      window.removeEventListener('keydown', this._escapeKeyHandler);
    }
    const backdrop = document.getElementById('mfgModalBackdrop');
    if (backdrop && backdrop.parentNode) {
      backdrop.parentNode.removeChild(backdrop);
    }
    super.close();
  }

  // 1. + New Batch (BMR) Modal
  async openNewBatchModal() {
    const [productsRes, formulasRes] = await Promise.all([
      fetch('/api/products').then(r => r.json()).catch(() => ({ products: [] })),
      fetch('/api/manufacturing/master-formulas').then(r => r.json()).catch(() => ({ formulas: [] }))
    ]);

    const products = productsRes.products || [];
    const formulas = formulasRes.formulas || [];

    const today = new Date().toISOString().split('T')[0];
    const expDate = new Date();
    expDate.setFullYear(expDate.getFullYear() + 3);
    const expStr = expDate.toISOString().split('T')[0];

    const bodyHtml = `
      <div class="mfg-form-grid">
        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Select Ayurvedic Product *</label>
          <select id="mfgNewBatchProduct" class="mfg-select">
            ${products.map(p => `<option value="${p.id}">${p.name} (${p.classification || 'Ayurvedic Medicine'})</option>`).join('')}
          </select>
        </div>

        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Associated Master Formula (MFR / BoM)</label>
          <select id="mfgNewBatchFormula" class="mfg-select">
            <option value="">-- Standard Master Formula --</option>
            ${formulas.map(f => `<option value="${f.id}">${f.product_name} - ${f.formula_name} (Std: ${f.std_batch_size} ${f.std_batch_uom})</option>`).join('')}
          </select>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Batch Number *</label>
          <input type="text" id="mfgNewBatchNo" class="mfg-input" value="UKA-${Date.now().toString().slice(-6)}" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Planned Production Quantity (Units) *</label>
          <input type="number" id="mfgNewBatchPlannedQty" class="mfg-input" value="100" min="1" step="1" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Manufacturing Date (Mfg) *</label>
          <input type="date" id="mfgNewBatchMfgDate" class="mfg-input" value="${today}" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Expiry Date (Exp) *</label>
          <input type="date" id="mfgNewBatchExpDate" class="mfg-input" value="${expStr}" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Retail MRP (₹)</label>
          <input type="number" id="mfgNewBatchMrp" class="mfg-input" value="180.00" step="0.5">
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Approved Chemist / Technical Person</label>
          <input type="text" id="mfgNewBatchChemist" class="mfg-input" value="Dr. P. K. Mishra (Approved Technical Person)">
        </div>

        <div class="mfg-form-group col-span-2" style="background: rgba(5, 150, 105, 0.05); padding: 10px; border-radius: 6px; font-size: 11.5px; color: #334155;">
          ✓ Automatically scales ingredients BoM in <strong>Rust Core</strong> and deducts raw herbs from stock upon launching.
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="mfg-btn mfg-btn-secondary" onclick="window.ManufacturingAppInstance.closeModal()">Cancel</button>
      <button class="mfg-btn mfg-btn-primary" onclick="window.ManufacturingAppInstance.submitNewBatch()">Launch Production Run</button>
    `;

    this.openModal('🏭 Initiate New Schedule T Production Batch (BMR)', bodyHtml, footerHtml);
  }

  async submitNewBatch() {
    const product_id = parseInt(document.getElementById('mfgNewBatchProduct')?.value, 10);
    const master_formula_id = document.getElementById('mfgNewBatchFormula')?.value ? parseInt(document.getElementById('mfgNewBatchFormula').value, 10) : null;
    const batch_no = document.getElementById('mfgNewBatchNo')?.value?.trim();
    const planned_qty = parseFloat(document.getElementById('mfgNewBatchPlannedQty')?.value);
    const mfg_date = document.getElementById('mfgNewBatchMfgDate')?.value;
    const exp_date = document.getElementById('mfgNewBatchExpDate')?.value;
    const mrp = parseFloat(document.getElementById('mfgNewBatchMrp')?.value) || 0;
    const technical_person = document.getElementById('mfgNewBatchChemist')?.value;

    if (!batch_no || !product_id || !mfg_date || !exp_date || !planned_qty) {
      alert('Please fill in all required fields.');
      return;
    }

    try {
      const res = await fetch('/api/manufacturing/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch_no,
          product_id,
          master_formula_id,
          mfg_date,
          exp_date,
          mrp,
          planned_qty,
          technical_person,
          deduct_stock: true
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to create batch');

      this.closeModal();
      alert(`✓ Batch ${batch_no} initiated successfully under Schedule T GMP!`);
      if (this.currentView === 'batches') this.views.batches.loadBatches();
    } catch (err) {
      alert(`Error creating batch: ${err.message}`);
    }
  }

  // Launch batch pre-selected with formula
  openNewBatchWithFormula(formulaId, productId) {
    this.openNewBatchModal().then(() => {
      const pSel = document.getElementById('mfgNewBatchProduct');
      const fSel = document.getElementById('mfgNewBatchFormula');
      if (pSel && productId) pSel.value = productId;
      if (fSel && formulaId) fSel.value = formulaId;
    });
  }

  // 2. Yield Reconciliation Modal (Rust WASM)
  async openYieldReconcileModal(batchId) {
    const batch = (this.views.batches.batches || []).find(b => b.id === batchId);
    if (!batch) return;

    const bodyHtml = `
      <div class="mfg-form-grid">
        <div class="mfg-form-group">
          <label class="mfg-label">Batch Number</label>
          <input type="text" class="mfg-input" value="${batch.batch_no}" readonly>
        </div>
        <div class="mfg-form-group">
          <label class="mfg-label">Product Name</label>
          <input type="text" class="mfg-input" value="${batch.product_name}" readonly>
        </div>
        <div class="mfg-form-group">
          <label class="mfg-label">Planned Production Quantity</label>
          <input type="number" id="mfgReconcilePlanned" class="mfg-input" value="${batch.planned_qty}" readonly>
        </div>
        <div class="mfg-form-group">
          <label class="mfg-label">Actual Finished Packaged Output *</label>
          <input type="number" id="mfgReconcileActual" class="mfg-input" value="${batch.actual_output_qty || batch.planned_qty}" step="1" required>
        </div>
      </div>

      <!-- Real-Time Rust Calculation Results Box -->
      <div class="mfg-calc-box" id="mfgYieldResultBox" style="margin-top: 10px;">
        <div class="mfg-calc-line">
          <span>Expected Standard Yield:</span>
          <strong>95.0%</strong>
        </div>
        <div class="mfg-calc-line">
          <span>Calculated Finished Yield:</span>
          <strong id="mfgYieldVal" style="color: var(--mfg-primary);">-</strong>
        </div>
        <div class="mfg-calc-line">
          <span>Process / Handling Loss:</span>
          <strong id="mfgLossVal">-</strong>
        </div>
        <div class="mfg-calc-line total">
          <span>Schedule T Statutory Tolerance (±5%):</span>
          <span id="mfgToleranceBadge" class="mfg-pill mfg-pill-released">✓ Within Tolerance</span>
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="mfg-btn mfg-btn-secondary" onclick="window.ManufacturingAppInstance.closeModal()">Close</button>
      <button class="mfg-btn mfg-btn-primary" onclick="window.ManufacturingAppInstance.saveYield(${batchId})">Save Output & Move to Quarantine</button>
    `;

    this.openModal(`⚖️ Yield Reconciliation (Rust Engine) • Batch ${batch.batch_no}`, bodyHtml, footerHtml);

    const actualInput = document.getElementById('mfgReconcileActual');
    const computeRustYield = async () => {
      const planned = parseFloat(document.getElementById('mfgReconcilePlanned')?.value) || 100;
      const actual = parseFloat(actualInput?.value) || planned;
      try {
        const res = await fetch('/api/manufacturing/batches/reconcile-yield', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planned_qty: planned, actual_output_qty: actual })
        });
        const d = await res.json();
        if (d.success) {
          document.getElementById('mfgYieldVal').textContent = `${d.actual_yield_percent.toFixed(1)}%`;
          document.getElementById('mfgLossVal').textContent = `${d.process_loss_percent.toFixed(1)}%`;
          const badge = document.getElementById('mfgToleranceBadge');
          if (badge) {
            badge.className = d.is_within_tolerance ? 'mfg-pill mfg-pill-released' : 'mfg-pill mfg-pill-reorder';
            badge.textContent = d.is_within_tolerance ? '✓ Within Tolerance' : '⚠️ Investigation Required';
          }
        }
      } catch (e) {
        console.warn('Yield calc error:', e);
      }
    };

    actualInput?.addEventListener('input', computeRustYield);
    computeRustYield();
  }

  async saveYield(batchId) {
    const actual = parseFloat(document.getElementById('mfgReconcileActual')?.value);
    const yieldText = document.getElementById('mfgYieldVal')?.textContent || '95%';
    const yieldNum = parseFloat(yieldText.replace('%', ''));

    try {
      await fetch(`/api/manufacturing/batches/${batchId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'QUARANTINE',
          actual_output_qty: actual,
          yield_percent: yieldNum
        })
      });

      this.closeModal();
      alert('✓ Yield recorded. Batch moved to QUARANTINE awaiting Outsourced Lab CoA.');
      if (this.currentView === 'batches') this.views.batches.loadBatches();
    } catch (err) {
      alert(`Error updating yield: ${err.message}`);
    }
  }

  // 3. Statutory Batch Release (Form 48 CoA Validation in Rust)
  async openReleaseModal(batchId) {
    const batch = (this.views.batches.batches || []).find(b => b.id === batchId);
    if (!batch) return;

    const today = new Date().toISOString().split('T')[0];

    const bodyHtml = `
      <div style="background: rgba(217, 119, 6, 0.08); border: 1px solid rgba(217, 119, 6, 0.2); padding: 10px 14px; border-radius: 8px; font-size: 12px; margin-bottom: 14px;">
        🔬 <strong>Outsourced Lab Testing (Schedule T Form 48 / Rule 160):</strong>
        Enter the Certificate of Analysis (CoA) issued by the approved Drug Testing Laboratory. Once validated as <strong>PASSED</strong> by the Rust Core, the batch is released for sale and immediately added to the billing counter catalog.
      </div>

      <div class="mfg-form-grid">
        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Approved Drug Testing Laboratory Name *</label>
          <input type="text" id="mfgReleaseLabName" class="mfg-input" value="State Drug Testing Laboratory (Form 48 Approved)" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">CoA Test Report Number *</label>
          <input type="text" id="mfgReleaseReportNo" class="mfg-input" value="SDTL-AYUR-${Date.now().toString().slice(-4)}" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">CoA Issue Date *</label>
          <input type="date" id="mfgReleaseCoaDate" class="mfg-input" value="${today}" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Testing Status *</label>
          <select id="mfgReleaseCoaStatus" class="mfg-select">
            <option value="PASSED" selected>PASSED (Conforms to Pharmacopoeia)</option>
            <option value="FAILED">FAILED (Rejected)</option>
          </select>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Approved Technical Person (AYUSH Chemist) *</label>
          <input type="text" id="mfgReleaseChemist" class="mfg-input" value="Dr. P. K. Mishra" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Rule 161B Control Sample Quantity *</label>
          <input type="text" id="mfgReleaseRetentionQty" class="mfg-input" value="2 Retail Packs" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Control Sample Storage Location *</label>
          <input type="text" id="mfgReleaseRetentionLoc" class="mfg-input" value="Factory QC Almirah Rack R-1" required>
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="mfg-btn mfg-btn-secondary" onclick="window.ManufacturingAppInstance.closeModal()">Cancel</button>
      <button class="mfg-btn mfg-btn-primary" onclick="window.ManufacturingAppInstance.submitRelease(${batchId})">Validate in Rust & Release to Billing</button>
    `;

    this.openModal(`🔬 Batch Release for Sale • ${batch.batch_no}`, bodyHtml, footerHtml);
  }

  async submitRelease(batchId) {
    const lab_name = document.getElementById('mfgReleaseLabName')?.value?.trim();
    const lab_report_no = document.getElementById('mfgReleaseReportNo')?.value?.trim();
    const coa_date = document.getElementById('mfgReleaseCoaDate')?.value;
    const coa_status = document.getElementById('mfgReleaseCoaStatus')?.value;
    const technical_person = document.getElementById('mfgReleaseChemist')?.value?.trim();
    const retention_sample_qty = document.getElementById('mfgReleaseRetentionQty')?.value?.trim();
    const retention_location = document.getElementById('mfgReleaseRetentionLoc')?.value?.trim();

    if (!lab_name || !lab_report_no || !coa_date || !technical_person) {
      alert('Please fill in all mandatory lab testing fields.');
      return;
    }

    try {
      const res = await fetch(`/api/manufacturing/batches/${batchId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lab_name,
          lab_report_no,
          coa_date,
          coa_status,
          technical_person,
          retention_sample_qty,
          retention_location
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || (data.errors ? data.errors.join('\n') : 'Statutory validation failed'));
      }

      this.closeModal();
      alert(`🎉 BATCH RELEASED!\n\n${data.message}\n\n✓ Commercial billing catalog updated immediately.`);
      if (this.currentView === 'batches') this.views.batches.loadBatches();
    } catch (err) {
      alert(`Release validation failed: ${err.message}`);
    }
  }

  // 4. Download Statutory BMR Dossier PDF (Pure Rust Vector Engine)
  async downloadBmrPdf(batchId, batchNo) {
    try {
      const btn = event?.target;
      if (btn) btn.textContent = '⏳ Rendering...';

      const res = await fetch(`/api/manufacturing/batches/${batchId}/pdf`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to render PDF dossier');

      // Convert base64 to Blob and trigger download
      const byteCharacters = atob(data.pdf_base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Schedule_T_BMR_Dossier_${batchNo}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (btn) btn.textContent = '📄 Dossier PDF';
    } catch (err) {
      alert(`Failed to download BMR Dossier: ${err.message}`);
      if (event?.target) event.target.textContent = '📄 Dossier PDF';
    }
  }

  // 5. Receive Consignment (GRN Inward) Modal
  async openReceiveGrnModal() {
    const res = await fetch('/api/manufacturing/raw-materials');
    const data = await res.json();
    const materials = data.materials || [];
    const today = new Date().toISOString().split('T')[0];

    const bodyHtml = `
      <div class="mfg-form-grid">
        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Select Herb / Raw Material *</label>
          <select id="mfgGrnMaterial" class="mfg-select">
            ${materials.map(m => `<option value="${m.id}">${m.name} (${m.type}) - Current: ${m.current_stock} ${m.uom}</option>`).join('')}
          </select>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Supplier / Trader Name *</label>
          <input type="text" id="mfgGrnSupplier" class="mfg-input" value="Bhubaneswar Crude Herbal Suppliers" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Invoice / Challan No *</label>
          <input type="text" id="mfgGrnInvoiceNo" class="mfg-input" value="INV-${Date.now().toString().slice(-5)}" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Receipt Date *</label>
          <input type="date" id="mfgGrnDate" class="mfg-input" value="${today}" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Vendor Lot / Consignment No</label>
          <input type="text" id="mfgGrnLotNo" class="mfg-input" value="LOT-BOT-${Date.now().toString().slice(-4)}">
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Quantity Received *</label>
          <input type="number" id="mfgGrnQty" class="mfg-input" value="20.0" step="0.1" min="0.1" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Unit Rate (₹ per KG/Unit)</label>
          <input type="number" id="mfgGrnRate" class="mfg-input" value="350.0" step="1">
        </div>

        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Physical Quality Check Status</label>
          <select id="mfgGrnQc" class="mfg-select">
            <option value="Conforms" selected>Conforms (Identity, Moisture & Purity Verified)</option>
            <option value="Quarantine">Held in Quarantine</option>
          </select>
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="mfg-btn mfg-btn-secondary" onclick="window.ManufacturingAppInstance.closeModal()">Cancel</button>
      <button class="mfg-btn mfg-btn-primary" onclick="window.ManufacturingAppInstance.submitReceiveGrn()">Record GRN Inward</button>
    `;

    this.openModal('🌿 Record Raw Material Inward (Schedule T GRN)', bodyHtml, footerHtml);
  }

  async submitReceiveGrn() {
    const raw_material_id = parseInt(document.getElementById('mfgGrnMaterial')?.value, 10);
    const supplier_name = document.getElementById('mfgGrnSupplier')?.value?.trim();
    const invoice_no = document.getElementById('mfgGrnInvoiceNo')?.value?.trim();
    const receipt_date = document.getElementById('mfgGrnDate')?.value;
    const vendor_lot_no = document.getElementById('mfgGrnLotNo')?.value?.trim();
    const qty_received = parseFloat(document.getElementById('mfgGrnQty')?.value);
    const unit_rate = parseFloat(document.getElementById('mfgGrnRate')?.value) || 0;
    const qc_status = document.getElementById('mfgGrnQc')?.value;

    if (!raw_material_id || !receipt_date || !qty_received) {
      alert('Please fill in required inward fields.');
      return;
    }

    try {
      const res = await fetch('/api/manufacturing/raw-materials/inward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_material_id,
          supplier_name,
          invoice_no,
          receipt_date,
          vendor_lot_no,
          qty_received,
          unit_rate,
          qc_status
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to record inward');

      this.closeModal();
      alert('✓ Goods Receipt Note (GRN) logged and inventory updated successfully!');
      if (this.currentView === 'materials') this.views.materials.loadRawMaterials();
      if (this.currentView === 'audit') this.views.audit.loadData();
    } catch (err) {
      alert(`Error recording GRN: ${err.message}`);
    }
  }

  // 6. + New Master Formula Modal
  async openNewFormulaModal() {
    const [prodRes, rmRes] = await Promise.all([
      fetch('/api/products').then(r => r.json()).catch(() => ({ products: [] })),
      fetch('/api/manufacturing/raw-materials').then(r => r.json()).catch(() => ({ materials: [] }))
    ]);

    const products = prodRes.products || [];
    const materials = rmRes.materials || [];

    const bodyHtml = `
      <div class="mfg-form-grid">
        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Select Product *</label>
          <select id="mfgMfProduct" class="mfg-select">
            ${products.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Formula Name *</label>
          <input type="text" id="mfgMfName" class="mfg-input" value="Classical AFI Standard Formula" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Pharmacopoeial Reference *</label>
          <input type="text" id="mfgMfRef" class="mfg-input" value="Ayurvedic Formulary of India (AFI Part I)" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Standard Batch Size *</label>
          <input type="number" id="mfgMfStdSize" class="mfg-input" value="100" min="1" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Standard Batch UOM</label>
          <select id="mfgMfUom" class="mfg-select">
            <option value="LTR" selected>LTR (Liquid / Asava / Taila)</option>
            <option value="KG">KG (Powder / Churna / Vati)</option>
          </select>
        </div>
      </div>

      <h4 style="margin: 12px 0 6px 0; font-size: 13px; color: #334155;">Ingredients BoM Lines</h4>
      <div id="mfgMfItemsContainer" style="display: flex; flex-direction: column; gap: 8px;">
        <div class="mfg-mf-item-row" style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px;">
          <select class="mfg-select mf-item-rm">
            ${materials.map(m => `<option value="${m.id}">${m.name} (${m.uom})</option>`).join('')}
          </select>
          <input type="number" class="mfg-input mf-item-qty" placeholder="Qty" value="10.0" step="0.1">
          <input type="text" class="mfg-input mf-item-stage" placeholder="Stage" value="Decoction">
        </div>
      </div>
      <button class="mfg-btn mfg-btn-sm mfg-btn-secondary" style="margin-top: 8px;" onclick="window.ManufacturingAppInstance.addFormulaIngredientRow()">+ Add Ingredient Line</button>
    `;

    const footerHtml = `
      <button class="mfg-btn mfg-btn-secondary" onclick="window.ManufacturingAppInstance.closeModal()">Cancel</button>
      <button class="mfg-btn mfg-btn-primary" onclick="window.ManufacturingAppInstance.submitNewFormula()">Save Master Formula</button>
    `;

    this.openModal('📜 Create Master Formula Record (MFR)', bodyHtml, footerHtml);
    this._availableMaterials = materials;
  }

  addFormulaIngredientRow() {
    const container = document.getElementById('mfgMfItemsContainer');
    if (!container || !this._availableMaterials) return;

    const row = document.createElement('div');
    row.className = 'mfg-mf-item-row';
    row.style.cssText = 'display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px;';
    row.innerHTML = `
      <select class="mfg-select mf-item-rm">
        ${this._availableMaterials.map(m => `<option value="${m.id}">${m.name} (${m.uom})</option>`).join('')}
      </select>
      <input type="number" class="mfg-input mf-item-qty" placeholder="Qty" value="5.0" step="0.1">
      <input type="text" class="mfg-input mf-item-stage" placeholder="Stage" value="Decoction">
    `;
    container.appendChild(row);
  }

  async submitNewFormula() {
    const product_id = parseInt(document.getElementById('mfgMfProduct')?.value, 10);
    const formula_name = document.getElementById('mfgMfName')?.value?.trim();
    const pharmacopoeial_ref = document.getElementById('mfgMfRef')?.value?.trim();
    const std_batch_size = parseFloat(document.getElementById('mfgMfStdSize')?.value) || 100;
    const std_batch_uom = document.getElementById('mfgMfUom')?.value;

    const rows = document.querySelectorAll('.mfg-mf-item-row');
    const items = [];
    rows.forEach(r => {
      const rmId = parseInt(r.querySelector('.mf-item-rm')?.value, 10);
      const qty = parseFloat(r.querySelector('.mf-item-qty')?.value);
      const stage = r.querySelector('.mf-item-stage')?.value?.trim();
      if (rmId && qty) {
        items.push({ raw_material_id: rmId, qty_required: qty, stage });
      }
    });

    if (!product_id || !formula_name) {
      alert('Please fill in product and formula name.');
      return;
    }

    try {
      const res = await fetch('/api/manufacturing/master-formulas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id,
          formula_name,
          pharmacopoeial_ref,
          std_batch_size,
          std_batch_uom,
          items
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to create formula');

      this.closeModal();
      alert('✓ Master Formula Record saved successfully!');
      if (this.currentView === 'formulas') this.views.formulas.loadFormulas();
    } catch (err) {
      alert(`Error saving formula: ${err.message}`);
    }
  }

  // ==========================================
  // ATTACHMENTS & PROCESS EVIDENCE MODAL
  // ==========================================
  async openAttachmentsModal(entityType, entityId, title = 'Attachments') {
    this._attachContext = { entityType, entityId, title };
    const bodyHtml = `
      <div style="font-size: 12px; color: var(--mfg-text-muted); margin-bottom: 12px;">
        Upload and review stage photos, vendor bills, handwritten logs, and outsourced lab certificates for <strong>${title}</strong>.
      </div>

      <!-- Upload Dropzone / Form -->
      <div class="mfg-dropzone" style="margin-bottom: 16px;">
        <div style="font-size: 24px; margin-bottom: 4px;">📷</div>
        <div style="font-weight: 600; font-size: 13px; color: #1e293b;">Drag & drop photo / document or click to browse</div>
        <div style="font-size: 11px; color: var(--mfg-text-muted); margin-top: 2px;">Supports JPG, PNG, WEBP, and PDF scans</div>
        <input type="file" id="mfgAttachFileInput" accept="image/*,application/pdf" style="display: none;">
        <button class="mfg-btn mfg-btn-sm mfg-btn-secondary" style="margin-top: 10px;" onclick="document.getElementById('mfgAttachFileInput').click()">
          Select File from Disk
        </button>
        <div id="mfgAttachFilePreview" style="margin-top: 10px; font-weight: 600; font-size: 12px; color: var(--mfg-primary);"></div>
      </div>

      <div class="mfg-form-grid" style="margin-bottom: 16px;">
        <div class="mfg-form-group">
          <label class="mfg-label">Manufacturing / Audit Stage</label>
          <select id="mfgAttachStage" class="mfg-select">
            <option value="Raw Herb Lot Inspection" selected>Raw Herb Lot Inspection</option>
            <option value="Boiling / Kwath Extraction">Boiling / Kwath Extraction</option>
            <option value="Filtration & Settling">Filtration & Settling</option>
            <option value="Finished Packaged Batch">Finished Packaged Batch</option>
            <option value="CoA Lab Test Report">CoA Lab Test Report</option>
            <option value="Vendor Invoice / Challan">Vendor Invoice / Challan</option>
            <option value="Master Vaidya Handwritten Notes">Master Vaidya Handwritten Notes</option>
          </select>
        </div>
        <div class="mfg-form-group">
          <label class="mfg-label">Caption / Log Note</label>
          <input type="text" id="mfgAttachCaption" class="mfg-input" placeholder="e.g. Liquid turned amber after 4 hrs at 95°C">
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; margin-bottom: 18px;">
        <button class="mfg-btn mfg-btn-primary" id="mfgUploadAttachBtn" onclick="window.ManufacturingAppInstance.submitUploadAttachment()">
          ⬆️ Upload Attachment & Log
        </button>
      </div>

      <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #334155; text-transform: uppercase; letter-spacing: 0.3px;">Documented Photos & Records</h4>
      <div id="mfgAttachmentsListContainer" style="min-height: 120px;">
        <div style="padding: 20px; text-align: center; color: var(--mfg-text-muted);">Loading attachments...</div>
      </div>
    `;

    const footerHtml = `
      <button class="mfg-btn mfg-btn-secondary" onclick="window.ManufacturingAppInstance.closeModal()">Close</button>
    `;

    this.openModal(`📷 Notes, Photos & Documentation • ${title}`, bodyHtml, footerHtml);

    // Bind file selection
    const fileInput = document.getElementById('mfgAttachFileInput');
    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      const preview = document.getElementById('mfgAttachFilePreview');
      if (file && preview) {
        preview.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      }
    });

    await this.loadAttachmentsList(entityType, entityId);
  }

  async loadAttachmentsList(entityType, entityId) {
    const listEl = document.getElementById('mfgAttachmentsListContainer');
    if (!listEl) return;

    try {
      const res = await fetch(`/api/manufacturing/attachments/${entityType}/${entityId}`);
      const data = await res.json();
      const items = data.attachments || [];

      if (items.length === 0) {
        listEl.innerHTML = `
          <div class="mfg-empty-state" style="padding: 24px;">
            <span class="mfg-empty-icon">📁</span>
            <div>No photos or documents attached yet. Upload a photo or scan above.</div>
          </div>
        `;
        return;
      }

      listEl.innerHTML = `
        <div class="mfg-attachments-grid">
          ${items.map(att => {
            const isImg = att.mime_type && att.mime_type.startsWith('image/');
            const previewHtml = isImg
              ? `<img src="${att.file_data}" class="mfg-attachment-img" alt="${att.caption || 'Attachment'}">`
              : `<div class="mfg-attachment-doc-icon">📄<div style="font-size: 10px; margin-top: 4px;">PDF Document</div></div>`;

            return `
              <div class="mfg-attachment-card">
                ${previewHtml}
                <div class="mfg-attachment-info">
                  <span class="mfg-attachment-stage">${att.stage || 'General'}</span>
                  <div class="mfg-attachment-caption">${att.caption || att.file_name}</div>
                  <div class="mfg-attachment-meta">📅 ${att.created_at?.slice(0, 16).replace('T', ' ')}</div>
                </div>
                <div class="mfg-attachment-actions">
                  <a href="${att.file_data}" download="${att.file_name}" class="mfg-btn mfg-btn-sm mfg-btn-secondary" style="text-decoration:none; display:inline-block; text-align:center;">
                    ⬇️ Download
                  </a>
                  <button class="mfg-btn mfg-btn-sm mfg-btn-secondary" style="color: #ef4444;" onclick="window.ManufacturingAppInstance.deleteAttachment(${att.id})">
                    🗑️ Delete
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } catch (err) {
      listEl.innerHTML = `<div style="color: red; padding: 12px;">Failed to load attachments: ${err.message}</div>`;
    }
  }

  async submitUploadAttachment() {
    const fileInput = document.getElementById('mfgAttachFileInput');
    const stage = document.getElementById('mfgAttachStage')?.value;
    const caption = document.getElementById('mfgAttachCaption')?.value?.trim();
    const btn = document.getElementById('mfgUploadAttachBtn');

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      alert('Please select a file to upload.');
      return;
    }

    const file = fileInput.files[0];
    if (file.size > 8 * 1024 * 1024) {
      alert('File is too large. Maximum size is 8 MB.');
      return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Uploading...';

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const file_data = reader.result;
        const res = await fetch('/api/manufacturing/attachments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entity_type: this._attachContext.entityType,
            entity_id: this._attachContext.entityId,
            file_name: file.name,
            file_data,
            mime_type: file.type || 'application/octet-stream',
            stage,
            caption
          })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to upload attachment');

        // Reset input and reload
        fileInput.value = '';
        const preview = document.getElementById('mfgAttachFilePreview');
        if (preview) preview.textContent = '';
        if (document.getElementById('mfgAttachCaption')) document.getElementById('mfgAttachCaption').value = '';

        await this.loadAttachmentsList(this._attachContext.entityType, this._attachContext.entityId);
      } catch (err) {
        alert(`Upload failed: ${err.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = '⬆️ Upload Attachment & Log';
      }
    };
    reader.readAsDataURL(file);
  }

  async deleteAttachment(id) {
    if (!confirm('Are you sure you want to delete this documented photo/record?')) return;
    try {
      const res = await fetch(`/api/manufacturing/attachments/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to delete');
      await this.loadAttachmentsList(this._attachContext.entityType, this._attachContext.entityId);
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  }

  // ==========================================
  // INWARD SUPPLIER LEDGER STATEMENT MODAL
  // ==========================================
  async openSupplierLedgerModal(supplierId) {
    try {
      const res = await fetch(`/api/manufacturing/suppliers/${supplierId}/ledger`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load supplier ledger');

      const s = data.supplier;
      const ledger = data.ledger || [];
      const balance = data.current_balance || 0;
      const totalPurchases = data.total_purchases || 0;
      const totalPaid = data.total_paid || 0;

      const bodyHtml = `
        <div style="background: #f8fafc; border: 1px solid var(--mfg-border); border-radius: 8px; padding: 14px 16px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h3 style="margin: 0 0 4px 0; font-size: 16px; color: #0f172a;">${s.name}</h3>
              <div style="font-size: 12px; color: var(--mfg-text-muted);">
                GSTIN: <strong style="font-family: monospace;">${s.gstin || 'Unregistered'}</strong> • 📞 ${s.phone || '—'}
              </div>
              <div style="font-size: 11.5px; color: #64748b; margin-top: 2px;">
                📍 ${s.address || ''}${s.city ? ', ' + s.city : ''}${s.state ? ', ' + s.state : ''}
              </div>
            </div>
            <div style="text-align: right;">
              <span class="mfg-pill ${balance > 0 ? 'mfg-pill-reorder' : 'mfg-pill-released'}" style="font-size: 12px; padding: 4px 10px;">
                Outstanding: ₹${balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        <div class="mfg-kpi-grid" style="margin-bottom: 16px;">
          <div class="mfg-kpi-card">
            <span class="mfg-kpi-label">Total Inward Bills (Credits)</span>
            <span class="mfg-kpi-val" style="color: #0f172a;">₹${totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            <span class="mfg-kpi-sub">Herbs & supplies procured</span>
          </div>
          <div class="mfg-kpi-card">
            <span class="mfg-kpi-label">Total Payments Disbursed</span>
            <span class="mfg-kpi-val" style="color: #059669;">₹${totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            <span class="mfg-kpi-sub">Debits / bank disbursements</span>
          </div>
          <div class="mfg-kpi-card">
            <span class="mfg-kpi-label">Current Balance Due</span>
            <span class="mfg-kpi-val" style="color: ${balance > 0 ? '#ef4444' : '#059669'};">₹${balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            <span class="mfg-kpi-sub">Payable as on date</span>
          </div>
        </div>

        <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #334155; text-transform: uppercase; letter-spacing: 0.3px;">Running Ledger Entries</h4>
        <div class="mfg-table-container">
          <table class="mfg-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Transaction Type</th>
                <th>Ref / Invoice / UTR</th>
                <th style="text-align: right;">Paid (Debit ₹)</th>
                <th style="text-align: right;">Billed (Credit ₹)</th>
                <th style="text-align: right;">Balance (₹)</th>
              </tr>
            </thead>
            <tbody>
              ${ledger.length === 0 ? `
                <tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--mfg-text-muted);">No ledger entries found for this supplier.</td></tr>
              ` : ledger.map(e => `
                <tr>
                  <td>${e.date}</td>
                  <td>
                    <span class="mfg-pill ${e.type === 'PAYMENT' ? 'mfg-pill-released' : 'mfg-pill-in-process'}">
                      ${e.type === 'PAYMENT' ? '💳 Payment Out' : '📦 Inward Bill'}
                    </span>
                  </td>
                  <td style="font-family: monospace; font-size: 12px;">${e.ref_no || '—'}</td>
                  <td style="text-align: right; color: #059669; font-weight: 600;">${e.debit > 0 ? '₹' + e.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}</td>
                  <td style="text-align: right; color: #0f172a; font-weight: 600;">${e.credit > 0 ? '₹' + e.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}</td>
                  <td style="text-align: right; font-weight: 700;">₹${e.running_balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      const footerHtml = `
        <button class="mfg-btn mfg-btn-secondary" onclick="window.ManufacturingAppInstance.printSupplierLedger(${supplierId})">🖨️ Print Statement</button>
        <button class="mfg-btn mfg-btn-primary" onclick="window.ManufacturingAppInstance.openDisbursePaymentModal(${supplierId}, '${s.name.replace(/'/g, "\\'")}', ${balance})">💳 Pay Vendor</button>
        <button class="mfg-btn mfg-btn-secondary" onclick="window.ManufacturingAppInstance.closeModal()">Close</button>
      `;

      this.openModal(`📑 Supplier Running Ledger • ${s.name}`, bodyHtml, footerHtml);
    } catch (err) {
      alert(`Failed to load supplier ledger: ${err.message}`);
    }
  }

  printSupplierLedger(supplierId) {
    window.print();
  }

  openDisbursePaymentModal(supplierId, name, balance) {
    const today = new Date().toISOString().split('T')[0];
    const defaultAmount = balance > 0 ? balance : '';

    const bodyHtml = `
      <div class="mfg-form-grid">
        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Supplier / Vendor Name</label>
          <input type="text" class="mfg-input" value="${name}" readonly style="background: #f1f5f9;">
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Current Outstanding Balance</label>
          <input type="text" class="mfg-input" value="₹${(balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}" readonly style="background: #f1f5f9; font-weight: 700; color: #ef4444;">
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Payment Amount to Disburse (₹) *</label>
          <input type="number" id="mfgPayAmount" class="mfg-input" value="${defaultAmount}" step="0.01" min="1" required style="font-size: 14px; font-weight: 700; color: #059669;">
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Payment Mode *</label>
          <select id="mfgPayMode" class="mfg-select">
            <option value="BANK" selected>Bank Transfer (NEFT / RTGS / IMPS)</option>
            <option value="UPI">UPI / Digital Wallet</option>
            <option value="CHEQUE">Cheque / Demand Draft</option>
            <option value="CASH">Cash Voucher</option>
          </select>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Payment Date *</label>
          <input type="date" id="mfgPayDate" class="mfg-input" value="${today}" required>
        </div>

        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Bank Reference / UTR / Cheque Number</label>
          <input type="text" id="mfgPayRefNo" class="mfg-input" placeholder="e.g. UTR-SBIN-20261010-94819">
        </div>

        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Notes / Settlement Remarks</label>
          <input type="text" id="mfgPayNotes" class="mfg-input" placeholder="e.g. Settled against Inward Consignment LOT-BOT-2041">
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="mfg-btn mfg-btn-secondary" onclick="window.ManufacturingAppInstance.closeModal()">Cancel</button>
      <button class="mfg-btn mfg-btn-primary" onclick="window.ManufacturingAppInstance.submitDisbursePayment(${supplierId})">Record Payment Disbursement</button>
    `;

    this.openModal(`💳 Disburse Supplier Payment • ${name}`, bodyHtml, footerHtml);
  }

  async submitDisbursePayment(supplierId) {
    const amount = parseFloat(document.getElementById('mfgPayAmount')?.value);
    const payment_mode = document.getElementById('mfgPayMode')?.value;
    const payment_date = document.getElementById('mfgPayDate')?.value;
    const reference_no = document.getElementById('mfgPayRefNo')?.value?.trim();
    const notes = document.getElementById('mfgPayNotes')?.value?.trim();

    if (!amount || amount <= 0 || !payment_date) {
      alert('Please enter a valid payment amount and date.');
      return;
    }

    try {
      const res = await fetch('/api/manufacturing/supplier-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          amount,
          payment_mode,
          payment_date,
          reference_no,
          notes
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to record payment');

      this.closeModal();
      alert(`✓ Payment of ₹${amount.toLocaleString('en-IN')} recorded successfully!`);
      if (this.currentView === 'procurement') {
        this.views.procurement.loadSuppliers();
      }
    } catch (err) {
      alert(`Payment error: ${err.message}`);
    }
  }

  // ==========================================
  // INWARD SUPPLIER & PURCHASE ORDER MODALS
  // ==========================================
  openNewSupplierModal() {
    const bodyHtml = `
      <div class="mfg-form-grid">
        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Supplier / Farm / Packaging Mill Name *</label>
          <input type="text" id="mfgNewSupName" class="mfg-input" placeholder="e.g. Similipal Forest Medicinal Herbs Trust" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Contact Person</label>
          <input type="text" id="mfgNewSupPerson" class="mfg-input" placeholder="e.g. Ramesh Chandra Pradhan">
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Phone Number *</label>
          <input type="tel" id="mfgNewSupPhone" class="mfg-input" placeholder="e.g. +91 94370 12345" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Email</label>
          <input type="email" id="mfgNewSupEmail" class="mfg-input" placeholder="e.g. supply@similipalherbs.in">
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">GSTIN (15 Digits)</label>
          <input type="text" id="mfgNewSupGstin" class="mfg-input" placeholder="e.g. 21AAAAA0000A1Z5" maxlength="15">
        </div>

        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Address</label>
          <input type="text" id="mfgNewSupAddress" class="mfg-input" placeholder="e.g. At/PO Baripada, Mayurbhanj">
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">City / District</label>
          <input type="text" id="mfgNewSupCity" class="mfg-input" value="Bhubaneswar">
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">State</label>
          <input type="text" id="mfgNewSupState" class="mfg-input" value="Odisha">
        </div>

        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Supplied Botanical / Packaging Commodities</label>
          <input type="text" id="mfgNewSupCommodities" class="mfg-input" placeholder="e.g. Dry Haritaki, Amalaki, Bibhitaki, Honey, Amber Bottles">
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="mfg-btn mfg-btn-secondary" onclick="window.ManufacturingAppInstance.closeModal()">Cancel</button>
      <button class="mfg-btn mfg-btn-primary" onclick="window.ManufacturingAppInstance.submitNewSupplier()">Register Supplier</button>
    `;

    this.openModal('📦 Register Inward Herb / Material Supplier', bodyHtml, footerHtml);
  }

  async submitNewSupplier() {
    const name = document.getElementById('mfgNewSupName')?.value?.trim();
    const contact_person = document.getElementById('mfgNewSupPerson')?.value?.trim();
    const phone = document.getElementById('mfgNewSupPhone')?.value?.trim();
    const email = document.getElementById('mfgNewSupEmail')?.value?.trim();
    const gstin = document.getElementById('mfgNewSupGstin')?.value?.trim()?.toUpperCase();
    const address = document.getElementById('mfgNewSupAddress')?.value?.trim();
    const city = document.getElementById('mfgNewSupCity')?.value?.trim();
    const state = document.getElementById('mfgNewSupState')?.value?.trim();
    const notes = document.getElementById('mfgNewSupCommodities')?.value?.trim();

    if (!name || !phone) {
      alert('Please fill in Supplier Name and Phone.');
      return;
    }

    try {
      const res = await fetch('/api/manufacturing/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          contact_person,
          phone,
          email,
          gstin,
          address,
          city,
          state,
          notes
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to create supplier');

      this.closeModal();
      alert(`✓ Supplier "${name}" registered successfully in contacts!`);
      if (this.currentView === 'procurement') {
        this.views.procurement.loadSuppliers();
      }
    } catch (err) {
      alert(`Error registering supplier: ${err.message}`);
    }
  }

  async openNewPoModal() {
    const [supRes, rmRes] = await Promise.all([
      fetch('/api/manufacturing/suppliers').then(r => r.json()).catch(() => ({ suppliers: [] })),
      fetch('/api/manufacturing/raw-materials').then(r => r.json()).catch(() => ({ materials: [] }))
    ]);

    const suppliers = supRes.suppliers || [];
    const materials = rmRes.materials || [];
    this._poMaterials = materials;

    const today = new Date().toISOString().split('T')[0];
    const expDate = new Date();
    expDate.setDate(expDate.getDate() + 7);
    const expStr = expDate.toISOString().split('T')[0];

    const bodyHtml = `
      <div class="mfg-form-grid">
        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Select Inward Supplier *</label>
          <select id="mfgPoSupplier" class="mfg-select">
            ${suppliers.map(s => `<option value="${s.id}">${s.name} (${s.city || 'Odisha'})</option>`).join('')}
          </select>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">PO Number *</label>
          <input type="text" id="mfgPoNumber" class="mfg-input" value="PO-AYUR-${Date.now().toString().slice(-5)}" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Order Date *</label>
          <input type="date" id="mfgPoOrderDate" class="mfg-input" value="${today}" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Expected Delivery Date</label>
          <input type="date" id="mfgPoDeliveryDate" class="mfg-input" value="${expStr}">
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Notes / Quality Specifications</label>
          <input type="text" id="mfgPoNotes" class="mfg-input" placeholder="e.g. Schedule T Certificate of Origin required">
        </div>
      </div>

      <h4 style="margin: 14px 0 8px 0; font-size: 13px; color: #334155;">Purchase Order Item Lines</h4>
      <div id="mfgPoItemsContainer" style="display: flex; flex-direction: column; gap: 8px;">
        <div class="mfg-po-item-row" style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap: 8px; align-items: center;">
          <select class="mfg-select po-item-rm">
            ${materials.map(m => `<option value="${m.id}">${m.name} (${m.uom})</option>`).join('')}
          </select>
          <input type="number" class="mfg-input po-item-qty" placeholder="Qty" value="25.0" step="0.5" min="0.5">
          <input type="number" class="mfg-input po-item-rate" placeholder="Rate ₹" value="120.0" step="1">
          <input type="text" class="mfg-input po-item-total" value="₹3,000.00" readonly style="background: #f8fafc; font-weight: 600;">
          <button class="mfg-btn mfg-btn-sm mfg-btn-secondary" style="color: #ef4444;" onclick="this.closest('.mfg-po-item-row').remove(); window.ManufacturingAppInstance.recalcPoTotal();">✕</button>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px;">
        <button class="mfg-btn mfg-btn-sm mfg-btn-secondary" onclick="window.ManufacturingAppInstance.addPoItemRow()">+ Add Item Line</button>
        <div style="font-size: 13px; font-weight: 700; color: #0f172a;">
          Total PO Value: <span id="mfgPoGrandTotal" style="color: var(--mfg-primary); font-size: 15px;">₹3,000.00</span>
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="mfg-btn mfg-btn-secondary" onclick="window.ManufacturingAppInstance.closeModal()">Cancel</button>
      <button class="mfg-btn mfg-btn-primary" onclick="window.ManufacturingAppInstance.submitNewPo()">Place Purchase Order</button>
    `;

    this.openModal('🚚 Place Inward Purchase Order (PO)', bodyHtml, footerHtml);
    this.hookPoRowCalculations();
  }

  addPoItemRow() {
    const container = document.getElementById('mfgPoItemsContainer');
    if (!container || !this._poMaterials) return;

    const row = document.createElement('div');
    row.className = 'mfg-po-item-row';
    row.style.cssText = 'display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap: 8px; align-items: center;';
    row.innerHTML = `
      <select class="mfg-select po-item-rm">
        ${this._poMaterials.map(m => `<option value="${m.id}">${m.name} (${m.uom})</option>`).join('')}
      </select>
      <input type="number" class="mfg-input po-item-qty" placeholder="Qty" value="10.0" step="0.5" min="0.5">
      <input type="number" class="mfg-input po-item-rate" placeholder="Rate ₹" value="100.0" step="1">
      <input type="text" class="mfg-input po-item-total" value="₹1,000.00" readonly style="background: #f8fafc; font-weight: 600;">
      <button class="mfg-btn mfg-btn-sm mfg-btn-secondary" style="color: #ef4444;" onclick="this.closest('.mfg-po-item-row').remove(); window.ManufacturingAppInstance.recalcPoTotal();">✕</button>
    `;
    container.appendChild(row);
    this.hookPoRowCalculations();
    this.recalcPoTotal();
  }

  hookPoRowCalculations() {
    const rows = document.querySelectorAll('.mfg-po-item-row');
    rows.forEach(r => {
      const qtyIn = r.querySelector('.po-item-qty');
      const rateIn = r.querySelector('.po-item-rate');
      const totIn = r.querySelector('.po-item-total');

      const update = () => {
        const q = parseFloat(qtyIn?.value) || 0;
        const rate = parseFloat(rateIn?.value) || 0;
        const tot = q * rate;
        if (totIn) totIn.value = '₹' + tot.toLocaleString('en-IN', { minimumFractionDigits: 2 });
        this.recalcPoTotal();
      };

      qtyIn?.addEventListener('input', update);
      rateIn?.addEventListener('input', update);
    });
  }

  recalcPoTotal() {
    const rows = document.querySelectorAll('.mfg-po-item-row');
    let grand = 0;
    rows.forEach(r => {
      const q = parseFloat(r.querySelector('.po-item-qty')?.value) || 0;
      const rate = parseFloat(r.querySelector('.po-item-rate')?.value) || 0;
      grand += (q * rate);
    });
    const gtEl = document.getElementById('mfgPoGrandTotal');
    if (gtEl) gtEl.textContent = '₹' + grand.toLocaleString('en-IN', { minimumFractionDigits: 2 });
  }

  async submitNewPo() {
    const supplier_id = parseInt(document.getElementById('mfgPoSupplier')?.value, 10);
    const po_number = document.getElementById('mfgPoNumber')?.value?.trim();
    const order_date = document.getElementById('mfgPoOrderDate')?.value;
    const expected_delivery_date = document.getElementById('mfgPoDeliveryDate')?.value;
    const notes = document.getElementById('mfgPoNotes')?.value?.trim();

    const rows = document.querySelectorAll('.mfg-po-item-row');
    const items = [];
    rows.forEach(r => {
      const rmId = parseInt(r.querySelector('.po-item-rm')?.value, 10);
      const qty = parseFloat(r.querySelector('.po-item-qty')?.value);
      const unit_rate = parseFloat(r.querySelector('.po-item-rate')?.value) || 0;
      if (rmId && qty) {
        items.push({ raw_material_id: rmId, qty_ordered: qty, unit_rate });
      }
    });

    if (!supplier_id || !po_number || items.length === 0) {
      alert('Please fill in required fields and at least one item line.');
      return;
    }

    try {
      const res = await fetch('/api/manufacturing/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id,
          po_number,
          order_date,
          expected_delivery_date,
          notes,
          items
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to place PO');

      this.closeModal();
      alert(`✓ Purchase Order ${po_number} placed successfully!`);
      if (this.currentView === 'procurement') {
        this.views.procurement.loadPurchaseOrders();
      }
    } catch (err) {
      alert(`Error placing PO: ${err.message}`);
    }
  }

  async viewPoDetails(poId) {
    const po = (this.views.procurement.purchaseOrders || []).find(p => p.id === poId);
    if (!po) return;

    const bodyHtml = `
      <div style="background: #f8fafc; border: 1px solid var(--mfg-border); border-radius: 8px; padding: 14px 16px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h3 style="margin: 0 0 4px 0; font-size: 16px; font-family: monospace;">${po.po_number}</h3>
            <div style="font-size: 12.5px; color: #1e293b;">
              Supplier: <strong>${po.supplier_name}</strong>
            </div>
            <div style="font-size: 11.5px; color: var(--mfg-text-muted); margin-top: 2px;">
              Ordered: ${po.order_date} • Expected Delivery: ${po.expected_delivery_date || '—'}
            </div>
          </div>
          <div>
            <span class="mfg-pill ${po.status === 'COMPLETED' ? 'mfg-pill-released' : 'mfg-pill-in-process'}">
              Status: ${po.status}
            </span>
          </div>
        </div>
      </div>

      <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #334155; text-transform: uppercase; letter-spacing: 0.3px;">Items in this Purchase Order</h4>
      <div class="mfg-table-container">
        <table class="mfg-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Raw Material</th>
              <th>Quantity Ordered</th>
              <th>Unit Rate</th>
              <th style="text-align: right;">Total Price</th>
            </tr>
          </thead>
          <tbody>
            ${(po.items || []).map((it, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${it.raw_material_name}</strong></td>
                <td>${it.qty_ordered} ${it.uom}</td>
                <td>₹${it.unit_rate}</td>
                <td style="text-align: right; font-weight: 700;">₹${(it.qty_ordered * it.unit_rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="text-align: right; font-weight: 700;">Grand Total:</td>
              <td style="text-align: right; font-weight: 700; color: var(--mfg-primary); font-size: 14px;">₹${(po.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;

    const footerHtml = `
      <button class="mfg-btn mfg-btn-secondary" onclick="window.ManufacturingAppInstance.openAttachmentsModal('INWARD', ${po.id}, 'PO: ${po.po_number}')">📷 Photos & Bills</button>
      ${po.status === 'PLACED' ? `
        <button class="mfg-btn mfg-btn-primary" onclick="window.ManufacturingAppInstance.updatePoStatus(${po.id}, 'COMPLETED')">✓ Mark Received & Completed</button>
      ` : ''}
      <button class="mfg-btn mfg-btn-secondary" onclick="window.ManufacturingAppInstance.closeModal()">Close</button>
    `;

    this.openModal(`🚚 Purchase Order Details • ${po.po_number}`, bodyHtml, footerHtml);
  }

  async updatePoStatus(poId, newStatus) {
    try {
      const res = await fetch(`/api/manufacturing/purchase-orders/${poId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to update status');

      this.closeModal();
      alert(`✓ Purchase order marked as ${newStatus}!`);
      if (this.currentView === 'procurement') {
        this.views.procurement.loadPurchaseOrders();
      }
    } catch (err) {
      alert(`Error updating PO: ${err.message}`);
    }
  }

  // ==========================================
  // DOCTORS & TECHNICAL STAFF MODALS
  // ==========================================
  openNewStaffModal() {
    this._editingStaffId = null;
    this.renderStaffModal('🩺 Register Doctor / Technical Person', {});
  }

  async openEditStaffModal(staffId) {
    this._editingStaffId = staffId;
    const staff = (this.views.staff.staff || []).find(s => s.id === staffId);
    if (!staff) return;
    this.renderStaffModal(`✏️ Edit Doctor / Technical Staff • ${staff.name}`, staff);
  }

  renderStaffModal(title, staff) {
    const bodyHtml = `
      <div class="mfg-form-grid">
        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Full Name & Title *</label>
          <input type="text" id="mfgStaffName" class="mfg-input" value="${staff.name || ''}" placeholder="e.g. Dr. P. K. Mishra" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Schedule T Statutory Role *</label>
          <select id="mfgStaffRole" class="mfg-select">
            <option value="Approved Technical Person (Chemist)" ${staff.role?.includes('Chemist') ? 'selected' : ''}>Approved Technical Person (Chemist)</option>
            <option value="Ayurvedic Vaidya (Doctor)" ${staff.role?.includes('Vaidya') ? 'selected' : ''}>Ayurvedic Vaidya (Doctor)</option>
            <option value="Head of Quality Control & Assurance" ${staff.role?.includes('Quality') ? 'selected' : ''}>Head of Quality Control & Assurance</option>
            <option value="Production Supervisor" ${staff.role?.includes('Supervisor') ? 'selected' : ''}>Production Supervisor</option>
            <option value="Store Incharge & Godown Keeper" ${staff.role?.includes('Store') ? 'selected' : ''}>Store Incharge & Godown Keeper</option>
          </select>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Statutory Qualification *</label>
          <input type="text" id="mfgStaffQual" class="mfg-input" value="${staff.qualification || 'B.A.M.S., M.D. (Ayurveda)'}" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Medical Council / State Registration No *</label>
          <input type="text" id="mfgStaffRegNo" class="mfg-input" value="${staff.registration_no || ''}" placeholder="e.g. OSC-AYUR-10492" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Phone Number *</label>
          <input type="tel" id="mfgStaffPhone" class="mfg-input" value="${staff.phone || ''}" placeholder="e.g. +91 94370 12345" required>
        </div>

        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Email</label>
          <input type="email" id="mfgStaffEmail" class="mfg-input" value="${staff.email || ''}" placeholder="e.g. chemist@utkalchemical.com">
        </div>
      </div>
    `;

    const footerHtml = `
      <button class="mfg-btn mfg-btn-secondary" onclick="window.ManufacturingAppInstance.closeModal()">Cancel</button>
      <button class="mfg-btn mfg-btn-primary" onclick="window.ManufacturingAppInstance.submitStaffForm()">Save Staff Record</button>
    `;

    this.openModal(title, bodyHtml, footerHtml);
  }

  async submitStaffForm() {
    const name = document.getElementById('mfgStaffName')?.value?.trim();
    const role = document.getElementById('mfgStaffRole')?.value;
    const qualification = document.getElementById('mfgStaffQual')?.value?.trim();
    const registration_no = document.getElementById('mfgStaffRegNo')?.value?.trim();
    const phone = document.getElementById('mfgStaffPhone')?.value?.trim();
    const email = document.getElementById('mfgStaffEmail')?.value?.trim();

    if (!name || !role || !qualification) {
      alert('Please fill in Name, Role, and Qualification.');
      return;
    }

    try {
      const url = this._editingStaffId ? `/api/manufacturing/technical-staff/${this._editingStaffId}` : '/api/manufacturing/technical-staff';
      const method = this._editingStaffId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          role,
          qualification,
          registration_no,
          phone,
          email,
          is_active: 1
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to save staff record');

      this.closeModal();
      alert(`✓ Technical staff "${name}" saved successfully!`);
      if (this.currentView === 'staff') {
        this.views.staff.loadStaff();
      }
    } catch (err) {
      alert(`Error saving staff: ${err.message}`);
    }
  }

  // ==========================================
  // RAW MATERIALS & PACKAGING CUSTOMIZATION
  // ==========================================
  openCreateMaterialModal() {
    this._editingMaterialId = null;
    this.renderMaterialModal('🌿 Add New Botanical Herb / Packaging SKU', {});
  }

  async openEditMaterialModal(materialId) {
    this._editingMaterialId = materialId;
    const mat = (this.views.materials.materials || []).find(m => m.id === materialId);
    if (!mat) return;
    this.renderMaterialModal(`✏️ Edit Raw Material • ${mat.name}`, mat);
  }

  renderMaterialModal(title, mat) {
    const isNew = !this._editingMaterialId;
    const bodyHtml = `
      <div class="mfg-form-grid">
        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Botanical / Material Name *</label>
          <input type="text" id="mfgMatName" class="mfg-input" value="${mat.name || ''}" placeholder="e.g. Haritaki (Terminalia chebula)" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Odia / Vernacular Name</label>
          <input type="text" id="mfgMatOdia" class="mfg-input" value="${mat.odia_name || ''}" placeholder="e.g. ହରିଡ଼ା (Harida)">
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Category / Classification *</label>
          <select id="mfgMatType" class="mfg-select">
            <option value="Botanical Herb" ${mat.type === 'Botanical Herb' ? 'selected' : ''}>Botanical Herb (Crude Drug)</option>
            <option value="Mineral / Bhasma" ${mat.type === 'Mineral / Bhasma' ? 'selected' : ''}>Mineral / Bhasma / Metal</option>
            <option value="Packaging" ${mat.type === 'Packaging' ? 'selected' : ''}>Packaging (Glass/PET Bottle, Cap, Label)</option>
            <option value="Solvent / Base" ${mat.type === 'Solvent / Base' ? 'selected' : ''}>Solvent / Base (Sesame Oil, Water, Alcohol)</option>
            <option value="Excipient" ${mat.type === 'Excipient' ? 'selected' : ''}>Excipient / Preservative / Sugar</option>
          </select>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Unit of Measurement (UOM) *</label>
          <select id="mfgMatUom" class="mfg-select">
            <option value="KG" ${mat.uom === 'KG' ? 'selected' : ''}>KG (Kilogram)</option>
            <option value="LTR" ${mat.uom === 'LTR' ? 'selected' : ''}>LTR (Litre)</option>
            <option value="PCS" ${mat.uom === 'PCS' ? 'selected' : ''}>PCS (Pieces / Units)</option>
            <option value="GRAM" ${mat.uom === 'GRAM' ? 'selected' : ''}>GRAM (Gram)</option>
          </select>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">HSN Code *</label>
          <input type="text" id="mfgMatHsn" class="mfg-input" value="${mat.hsn_code || '12119029'}" placeholder="e.g. 12119029">
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Safety Reorder Level (${mat.uom || 'KG'}) *</label>
          <input type="number" id="mfgMatReorder" class="mfg-input" value="${mat.reorder_level || 20}" min="1" step="0.5" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Shelf Life (Months)</label>
          <input type="number" id="mfgMatShelfLife" class="mfg-input" value="${mat.shelf_life_months || 24}" min="1" step="1">
        </div>

        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Storage Location / Godown Rack *</label>
          <input type="text" id="mfgMatLocation" class="mfg-input" value="${mat.storage_location || 'Godown A - Rack 1'}" required>
        </div>

        ${isNew ? `
          <div class="mfg-form-group">
            <label class="mfg-label">Initial Opening Stock (${mat.uom || 'KG'})</label>
            <input type="number" id="mfgMatInitStock" class="mfg-input" value="0.0" min="0" step="0.5">
          </div>
          <div class="mfg-form-group">
            <label class="mfg-label">Standard Unit Cost (₹)</label>
            <input type="number" id="mfgMatUnitCost" class="mfg-input" value="150.0" min="0" step="1">
          </div>
        ` : ''}
      </div>
    `;

    const footerHtml = `
      <button class="mfg-btn mfg-btn-secondary" onclick="window.ManufacturingAppInstance.closeModal()">Cancel</button>
      <button class="mfg-btn mfg-btn-primary" onclick="window.ManufacturingAppInstance.submitMaterialForm()">Save Raw Material SKU</button>
    `;

    this.openModal(title, bodyHtml, footerHtml);
  }

  async submitMaterialForm() {
    const name = document.getElementById('mfgMatName')?.value?.trim();
    const odia_name = document.getElementById('mfgMatOdia')?.value?.trim();
    const type = document.getElementById('mfgMatType')?.value;
    const uom = document.getElementById('mfgMatUom')?.value;
    const hsn_code = document.getElementById('mfgMatHsn')?.value?.trim();
    const reorder_level = parseFloat(document.getElementById('mfgMatReorder')?.value) || 10;
    const shelf_life_months = parseInt(document.getElementById('mfgMatShelfLife')?.value, 10) || 24;
    const storage_location = document.getElementById('mfgMatLocation')?.value?.trim();

    if (!name || !type || !uom) {
      alert('Please fill in Material Name, Category, and UOM.');
      return;
    }

    try {
      if (this._editingMaterialId) {
        const res = await fetch(`/api/manufacturing/raw-materials/${this._editingMaterialId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            odia_name,
            type,
            uom,
            hsn_code,
            reorder_level,
            shelf_life_months,
            storage_location
          })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to update material');
      } else {
        const initial_stock = parseFloat(document.getElementById('mfgMatInitStock')?.value) || 0;
        const unit_cost = parseFloat(document.getElementById('mfgMatUnitCost')?.value) || 0;

        const res = await fetch('/api/manufacturing/raw-materials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            odia_name,
            type,
            uom,
            hsn_code,
            reorder_level,
            shelf_life_months,
            storage_location,
            current_stock: initial_stock,
            unit_cost
          })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Failed to create material');
      }

      this.closeModal();
      alert(`✓ Raw material SKU "${name}" saved successfully!`);
      if (this.currentView === 'materials') {
        this.views.materials.loadRawMaterials();
      }
    } catch (err) {
      alert(`Error saving raw material: ${err.message}`);
    }
  }

  // ==========================================
  // AI AYURVEDIC FORMULATION ADVISOR (GEMINI)
  // ==========================================
  openAiFormulationModal() {
    const bodyHtml = `
      <div style="background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(168,85,247,0.08)); border: 1px solid rgba(168,85,247,0.25); border-radius: 8px; padding: 12px 14px; margin-bottom: 14px; font-size: 12px; color: #4338ca;">
        ✨ <strong>Ayurvedic Pharmacopoeia Intelligence Engine:</strong>
        Consult the AI Formulation Master for classical compositions from the <em>Ayurvedic Formulary of India (AFI Part I)</em>, <em>Bhaishajya Ratnavali</em>, and <em>Charaka Samhita</em>. Generates standardized BoM weights, decoction reduction factors, and Schedule T critical process safeguards.
      </div>

      <div class="mfg-form-grid">
        <div class="mfg-form-group col-span-2">
          <label class="mfg-label">Ayurvedic Medicine Formulation Name *</label>
          <input type="text" id="mfgAiFormulationName" class="mfg-input" placeholder="e.g. Khadirarishta, Triphala Churna, Chyawanprash Awaleha, Mahanarayan Taila" value="Khadirarishta" required>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Authoritative Pharmacopoeia Text</label>
          <select id="mfgAiRefText" class="mfg-select">
            <option value="Ayurvedic Formulary of India (AFI Part I)" selected>Ayurvedic Formulary of India (AFI Part I)</option>
            <option value="Bhaishajya Ratnavali">Bhaishajya Ratnavali</option>
            <option value="Charaka Samhita">Charaka Samhita</option>
            <option value="Sushruta Samhita">Sushruta Samhita</option>
            <option value="Sharangadhara Samhita">Sharangadhara Samhita</option>
          </select>
        </div>

        <div class="mfg-form-group">
          <label class="mfg-label">Batch Size & Scaling Unit</label>
          <div style="display: flex; gap: 8px;">
            <input type="number" id="mfgAiBatchSize" class="mfg-input" value="100" min="1" style="width: 100px;">
            <select id="mfgAiBatchUom" class="mfg-select" style="flex: 1;">
              <option value="LTR" selected>LTR (Liquid / Asava / Taila)</option>
              <option value="KG">KG (Powder / Vati / Awaleha)</option>
            </select>
          </div>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; margin-top: 10px; margin-bottom: 16px;">
        <button class="mfg-btn mfg-btn-primary" id="mfgAiSubmitBtn" onclick="window.ManufacturingAppInstance.generateAiFormulation()" style="background: linear-gradient(135deg, #6366f1, #9333ea);">
          ✨ Consult Ayurvedic AI Master
        </button>
      </div>

      <div id="mfgAiResultContainer" style="display: none; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-top: 10px;">
        <!-- AI Advice Rendered Here -->
      </div>
    `;

    const footerHtml = `
      <button class="mfg-btn mfg-btn-secondary" onclick="window.ManufacturingAppInstance.closeModal()">Close</button>
    `;

    this.openModal('✨ AI Ayurvedic Formulation Advisor • Classical AFI Intelligence', bodyHtml, footerHtml);
  }

  async generateAiFormulation() {
    const name = document.getElementById('mfgAiFormulationName')?.value?.trim();
    const ref = document.getElementById('mfgAiRefText')?.value;
    const size = parseFloat(document.getElementById('mfgAiBatchSize')?.value) || 100;
    const uom = document.getElementById('mfgAiBatchUom')?.value;
    const btn = document.getElementById('mfgAiSubmitBtn');
    const container = document.getElementById('mfgAiResultContainer');

    if (!name) {
      alert('Please enter a formulation name.');
      return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Consulting AI Knowledge Base...';
    container.style.display = 'block';
    container.innerHTML = `
      <div style="text-align: center; padding: 32px 16px;">
        <div style="font-size: 28px; margin-bottom: 8px;">🌿</div>
        <div style="font-weight: 600; color: #4338ca;">Consulting Ayurvedic Formulary of India & Botanical Lexicon...</div>
        <div style="font-size: 11.5px; color: var(--mfg-text-muted); margin-top: 4px;">Analyzing classical proportions, decoction stages, and Schedule T controls...</div>
      </div>
    `;

    try {
      const res = await fetch('/api/manufacturing/ai/formulation-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formulation_name: name,
          therapeutic_category: 'Classical Ayurvedic Medicine',
          batch_size: size,
          uom,
          pharmacopoeial_ref: ref
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to generate formulation advice');

      const advice = data.advice;
      this._lastAiAdvice = advice;

      container.innerHTML = `
        <div style="border-bottom: 1px solid var(--mfg-border); padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h3 style="margin: 0 0 4px 0; font-size: 16px; color: #0f172a;">${advice.formulation_name}</h3>
            <div style="font-size: 12px; color: var(--mfg-text-muted);">
              Reference: <em>${advice.pharmacopoeial_reference || ref}</em> • Target: <strong>${size} ${uom}</strong>
            </div>
            <div style="font-size: 11.5px; color: #059669; font-weight: 600; margin-top: 2px;">
              Therapeutic Class: ${advice.therapeutic_category || 'Classical Shastra'}
            </div>
          </div>
          <div>
            <button class="mfg-btn mfg-btn-sm mfg-btn-gold" onclick="window.ManufacturingAppInstance.importAiFormulaToMfr()">
              📥 Import into MFR Master Formula
            </button>
          </div>
        </div>

        <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #334155;">Classical Ingredients Bill of Materials (${advice.ingredients?.length || 0} items)</h4>
        <div class="mfg-table-container" style="margin-bottom: 14px;">
          <table class="mfg-table">
            <thead>
              <tr>
                <th>Ingredient (Sanskrit / Botanical)</th>
                <th>Part Used</th>
                <th>Proportion / Scaled Qty</th>
                <th>Processing Stage</th>
              </tr>
            </thead>
            <tbody>
              ${(advice.ingredients || []).map(ing => `
                <tr>
                  <td><strong>${ing.name}</strong></td>
                  <td style="color: var(--mfg-text-muted); font-size: 12px;">${ing.part_used || 'Bark / Root / Fruit'}</td>
                  <td><strong style="color: var(--mfg-primary);">${ing.quantity} ${ing.uom}</strong></td>
                  <td><span style="font-size: 11px; background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 4px;">${ing.stage || 'Decoction'}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="background: #f8fafc; border: 1px solid var(--mfg-border); border-radius: 8px; padding: 12px 14px; margin-bottom: 12px;">
          <h4 style="margin: 0 0 6px 0; font-size: 12.5px; color: #0f172a;">🔥 Critical Manufacturing Stages & In-Process Controls:</h4>
          <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #334155; line-height: 1.5;">
            ${(advice.critical_process_steps || [
              'Boil crude herbs in 16 parts of water until reduced to 1/4th (Kwath nirmana).',
              'Filter through double-layered surgical muslin cloth while warm.',
              'Add Dhataki pushpa and sweetening base into pre-sterilized fermentation vessels.',
              'Maintain temperature between 28°C - 35°C during Sandhana kalpana.'
            ]).map(step => `<li>${step}</li>`).join('')}
          </ul>
        </div>

        <div style="background: rgba(5, 150, 105, 0.05); border: 1px solid rgba(5, 150, 105, 0.2); border-radius: 8px; padding: 12px 14px; font-size: 12px; color: #065f46;">
          <strong>Schedule T Quality & Safety Specifications:</strong>
          <div>${advice.quality_specifications || 'Total solids: 35-45% w/v • Self-generated alcohol: 5-10% v/v • Specific gravity: 1.05 - 1.15.'}</div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div style="color: red; padding: 14px;">AI Consultation error: ${err.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '✨ Consult Ayurvedic AI Master';
    }
  }

  async importAiFormulaToMfr() {
    if (!this._lastAiAdvice) return;
    const advice = this._lastAiAdvice;
    this.closeModal();

    await this.openNewFormulaModal();
    const nameInput = document.getElementById('mfgMfName');
    const refInput = document.getElementById('mfgMfRef');
    const sizeInput = document.getElementById('mfgMfStdSize');
    const uomSelect = document.getElementById('mfgMfUom');

    if (nameInput) nameInput.value = `${advice.formulation_name} (AFI Standard)`;
    if (refInput) refInput.value = advice.pharmacopoeial_reference || 'Ayurvedic Formulary of India (AFI Part I)';
    if (sizeInput && advice.std_batch_size) sizeInput.value = advice.std_batch_size;
    if (uomSelect && advice.std_batch_uom) uomSelect.value = advice.std_batch_uom;
  }
}

window.ManufacturingApp = ManufacturingApp;
export default ManufacturingApp;
