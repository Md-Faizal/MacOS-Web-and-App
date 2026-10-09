/**
 * Inward Procurement & Supplier Ledger View
 * The Inward Twin of Billing & Contacts:
 * Suppliers, Purchase Orders, Disbursements & Running Supplier Ledger Statements
 */

export class InwardProcurementView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.suppliers = [];
    this.purchaseOrders = [];
    this.currentSubTab = 'SUPPLIERS';
    this.selectedSupplier = null;
    this.searchQuery = '';
  }

  filterData(query) {
    this.searchQuery = query || '';
    this.renderSubTabContent();
  }

  async render(targetEl) {
    this.container = targetEl;
    this.container.innerHTML = `
      <div class="mfg-view-header">
        <div class="mfg-view-title-box">
          <h2>📦 Inward Procurement Suite & Supplier Ledger</h2>
          <p>Herbal Growers, Packaging Mills & Chemical Refiners • Purchase Orders • Running Payable Ledger</p>
        </div>
        <div class="mfg-actions-group">
          <button class="mfg-btn mfg-btn-secondary" id="mfgRefreshProcBtn">↻ Refresh</button>
          <button class="mfg-btn mfg-btn-secondary" id="mfgNewPoBtn">+ Place Purchase Order (PO)</button>
          <button class="mfg-btn mfg-btn-primary" id="mfgNewSupplierBtn">+ Add Inward Supplier</button>
        </div>
      </div>

      <div class="mfg-kpi-grid">
        <div class="mfg-kpi-card">
          <span class="mfg-kpi-label">Active Suppliers</span>
          <span class="mfg-kpi-val" id="kpiSuppliersCount">-</span>
          <span class="mfg-kpi-sub">Herbal & packaging vendors</span>
        </div>
        <div class="mfg-kpi-card">
          <span class="mfg-kpi-label">Accounts Payable (AP)</span>
          <span class="mfg-kpi-val" id="kpiTotalPayable" style="color: #ea580c;">-</span>
          <span class="mfg-kpi-sub">Total balance due to suppliers</span>
        </div>
        <div class="mfg-kpi-card">
          <span class="mfg-kpi-label">Active Purchase Orders</span>
          <span class="mfg-kpi-val" id="kpiActivePos" style="color: #2563eb;">-</span>
          <span class="mfg-kpi-sub">Open procurement orders</span>
        </div>
        <div class="mfg-kpi-card">
          <span class="mfg-kpi-label">Total Inward Procured</span>
          <span class="mfg-kpi-val" id="kpiTotalPurchased" style="color: #059669;">-</span>
          <span class="mfg-kpi-sub">Total lifetime purchase bills</span>
        </div>
      </div>

      <div class="mfg-tabs-bar">
        <button class="mfg-tab-btn active" data-subtab="SUPPLIERS">👥 Suppliers & Vendors</button>
        <button class="mfg-tab-btn" data-subtab="POS">🚚 Purchase Orders (PO)</button>
        <button class="mfg-tab-btn" data-subtab="PAYMENTS">💳 Supplier Disbursements</button>
      </div>

      <div id="mfgProcContentArea">
        <!-- Dynamic Subtab Content Injected Here -->
      </div>
    `;

    this.bindEvents();
    await this.loadAllData();
  }

  bindEvents() {
    this.container.querySelector('#mfgRefreshProcBtn')?.addEventListener('click', () => this.loadAllData());
    this.container.querySelector('#mfgNewSupplierBtn')?.addEventListener('click', () => this.openNewSupplierModal());
    this.container.querySelector('#mfgNewPoBtn')?.addEventListener('click', () => this.openNewPoModal());

    const tabButtons = this.container.querySelectorAll('.mfg-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentSubTab = btn.dataset.subtab;
        this.renderSubTab();
      });
    });
  }

  async loadAllData() {
    try {
      const [suppRes, poRes] = await Promise.all([
        fetch('/api/manufacturing/suppliers').then(r => r.json()),
        fetch('/api/manufacturing/purchase-orders').then(r => r.json())
      ]);

      this.suppliers = suppRes.suppliers || [];
      this.purchaseOrders = poRes.purchase_orders || [];

      this.updateKpis();
      this.renderSubTab();
    } catch (err) {
      console.error('[Inward Procurement] Load error:', err);
    }
  }

  updateKpis() {
    const totalSupp = this.suppliers.length;
    const totalPayable = this.suppliers.reduce((sum, s) => sum + (s.balance_due || 0), 0);
    const openPos = this.purchaseOrders.filter(p => p.status === 'PLACED').length;
    const totalPurchased = this.suppliers.reduce((sum, s) => sum + (s.total_purchases || 0), 0);

    this.container.querySelector('#kpiSuppliersCount').textContent = totalSupp;
    this.container.querySelector('#kpiTotalPayable').textContent = `₹${totalPayable.toLocaleString('en-IN')}`;
    this.container.querySelector('#kpiActivePos').textContent = openPos;
    this.container.querySelector('#kpiTotalPurchased').textContent = `₹${totalPurchased.toLocaleString('en-IN')}`;
  }

  renderSubTab() {
    const content = this.container.querySelector('#mfgProcContentArea');
    if (!content) return;

    if (this.currentSubTab === 'SUPPLIERS') {
      this.renderSuppliersView(content);
    } else if (this.currentSubTab === 'POS') {
      this.renderPurchaseOrdersView(content);
    } else {
      this.renderPaymentsView(content);
    }
  }

  renderSuppliersView(content) {
    let suppliers = this.suppliers;
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      suppliers = suppliers.filter(s =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.gstin && s.gstin.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.city && s.city.toLowerCase().includes(q))
      );
    }

    if (suppliers.length === 0) {
      content.innerHTML = `
        <div class="mfg-empty-state">
          <span class="mfg-empty-icon">👥</span>
          <div>${this.searchQuery ? `No inward suppliers matching '${this.searchQuery}'.` : 'No inward suppliers found. Click "+ Add Inward Supplier" above.'}</div>
        </div>
      `;
      return;
    }

    content.innerHTML = `
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px;">
        ${suppliers.map(s => `
          <div class="mfg-supplier-card">
            <div class="mfg-supplier-header">
              <div>
                <div class="mfg-supplier-name">${s.name}</div>
                <div class="mfg-supplier-sub">GSTIN: <span style="font-family: monospace;">${s.gstin || 'Unregistered'}</span></div>
              </div>
              <span class="mfg-pill ${s.balance_due > 0 ? 'mfg-pill-quarantine' : 'mfg-pill-released'}">
                ${s.balance_due > 0 ? `Due: ₹${s.balance_due.toLocaleString('en-IN')}` : 'Settled'}
              </span>
            </div>

            <div style="font-size: 11.5px; color: #475569;">
              <div>📞 ${s.phone || '—'} • ✉️ ${s.email || '—'}</div>
              <div style="margin-top: 2px;">📍 ${s.address || '—'}</div>
            </div>

            <div class="mfg-supplier-stat-row">
              <span>Total Inward Bills:</span>
              <strong>₹${(s.total_purchases || 0).toLocaleString('en-IN')}</strong>
            </div>
            <div class="mfg-supplier-stat-row">
              <span>Total Payments Paid:</span>
              <strong style="color: #059669;">₹${(s.total_paid || 0).toLocaleString('en-IN')}</strong>
            </div>

            <div class="mfg-actions-group" style="margin-top: 6px; justify-content: flex-end;">
              <button class="mfg-btn mfg-btn-sm mfg-btn-secondary" onclick="window.ManufacturingAppInstance.openSupplierLedgerModal(${s.id})">
                📑 View Running Ledger
              </button>
              <button class="mfg-btn mfg-btn-sm mfg-btn-primary" onclick="window.ManufacturingAppInstance.openDisbursePaymentModal(${s.id}, '${s.name.replace(/'/g, "\\'")}', ${s.balance_due})">
                💳 Pay Vendor
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  renderPurchaseOrdersView(content) {
    let pos = this.purchaseOrders;
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      pos = pos.filter(po =>
        (po.po_number && po.po_number.toLowerCase().includes(q)) ||
        (po.supplier_name && po.supplier_name.toLowerCase().includes(q)) ||
        (po.status && po.status.toLowerCase().includes(q))
      );
    }

    if (pos.length === 0) {
      content.innerHTML = `
        <div class="mfg-empty-state">
          <span class="mfg-empty-icon">🚚</span>
          <div>${this.searchQuery ? `No purchase orders matching '${this.searchQuery}'.` : 'No purchase orders placed yet. Click "+ Place Purchase Order (PO)" above.'}</div>
        </div>
      `;
      return;
    }

    content.innerHTML = `
      <div class="mfg-table-container">
        <table class="mfg-table">
          <thead>
            <tr>
              <th>PO Number</th>
              <th>Supplier Name</th>
              <th>Order Date</th>
              <th>Expected Date</th>
              <th>Items</th>
              <th>Total Amount</th>
              <th>Status</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${pos.map(po => `
              <tr>
                <td><strong style="font-family: monospace;">${po.po_number}</strong></td>
                <td><strong>${po.supplier_name}</strong></td>
                <td>${po.order_date}</td>
                <td>${po.expected_delivery_date || '—'}</td>
                <td>${po.items?.length || 0} items</td>
                <td><strong>₹${(po.total_amount || 0).toLocaleString('en-IN')}</strong></td>
                <td>
                  <span class="mfg-pill ${po.status === 'COMPLETED' ? 'mfg-pill-released' : (po.status === 'CANCELLED' ? 'mfg-pill-reorder' : 'mfg-pill-in-process')}">
                    ${po.status}
                  </span>
                </td>
                <td style="text-align: right;">
                  <button class="mfg-btn mfg-btn-sm mfg-btn-secondary" onclick="window.ManufacturingAppInstance.viewPoDetails(${po.id})">
                    👁️ View Details
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  async renderPaymentsView(content) {
    try {
      const res = await fetch('/api/manufacturing/supplier-payments');
      const data = await res.json();
      const payments = data.payments || [];

      if (payments.length === 0) {
        content.innerHTML = `
          <div class="mfg-empty-state">
            <span class="mfg-empty-icon">💳</span>
            <div>No supplier disbursements recorded yet.</div>
          </div>
        `;
        return;
      }

      content.innerHTML = `
        <div class="mfg-table-container">
          <table class="mfg-table">
            <thead>
              <tr>
                <th>Voucher #</th>
                <th>Supplier Name</th>
                <th>Payment Date</th>
                <th>Amount Disbursed</th>
                <th>Mode</th>
                <th>Reference / UTR</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${payments.map(p => `
                <tr>
                  <td><strong style="font-family: monospace;">${p.payment_number}</strong></td>
                  <td><strong>${p.supplier_name}</strong></td>
                  <td>${p.payment_date}</td>
                  <td><strong style="color: #059669; font-size: 13px;">₹${p.amount.toLocaleString('en-IN')}</strong></td>
                  <td><span class="mfg-pill mfg-pill-released">${p.payment_mode}</span></td>
                  <td style="font-family: monospace; font-size: 11.5px;">${p.reference_no || '—'}</td>
                  <td style="font-size: 11.5px; color: var(--mfg-text-muted);">${p.notes || '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      content.innerHTML = `<div style="color: red; padding: 16px;">Error loading disbursements: ${err.message}</div>`;
    }
  }

  openNewSupplierModal() {
    this.app.openNewSupplierModal();
  }

  openNewPoModal() {
    this.app.openNewPoModal();
  }
}
