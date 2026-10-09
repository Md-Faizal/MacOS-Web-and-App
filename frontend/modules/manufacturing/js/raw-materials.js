/**
 * Raw Materials & Godown Inventory View
 * Live herbal and packaging stock, low-stock reorder alerts, and GRN inward logging
 */

export class RawMaterialsView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.materials = [];
    this.filterType = 'ALL';
    this.searchQuery = '';
  }

  async render(targetEl) {
    this.container = targetEl;
    this.container.innerHTML = `
      <div class="mfg-view-header">
        <div class="mfg-view-title-box">
          <h2>🌿 Raw Materials & Packaging Inventory</h2>
          <p>Schedule T Raw Herb Godown • Botanical Drugs, Minerals, Packaging • Live Stock Balance</p>
        </div>
        <div class="mfg-actions-group">
          <button class="mfg-btn mfg-btn-secondary" id="mfgRefreshRmBtn">↻ Refresh</button>
          <button class="mfg-btn mfg-btn-secondary" id="mfgAddMaterialBtn">+ Add New Herb / SKU</button>
          <button class="mfg-btn mfg-btn-primary" id="mfgReceiveGrnBtn">+ Receive Consignment (GRN)</button>
        </div>
      </div>

      <div class="mfg-kpi-grid">
        <div class="mfg-kpi-card">
          <span class="mfg-kpi-label">Herbs & Materials</span>
          <span class="mfg-kpi-val" id="kpiTotalMaterials">-</span>
          <span class="mfg-kpi-sub">Active master SKUs</span>
        </div>
        <div class="mfg-kpi-card">
          <span class="mfg-kpi-label">Reorder Level Alerts</span>
          <span class="mfg-kpi-val" id="kpiLowStockMaterials" style="color: #ef4444;">-</span>
          <span class="mfg-kpi-sub">Below safety threshold</span>
        </div>
        <div class="mfg-kpi-card">
          <span class="mfg-kpi-label">Botanical Species</span>
          <span class="mfg-kpi-val" id="kpiHerbsCount" style="color: #059669;">-</span>
          <span class="mfg-kpi-sub">Classical crude herbs</span>
        </div>
        <div class="mfg-kpi-card">
          <span class="mfg-kpi-label">Packaging Units</span>
          <span class="mfg-kpi-val" id="kpiPackagingCount" style="color: #3b82f6;">-</span>
          <span class="mfg-kpi-sub">Bottles, caps & cartons</span>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px;">
        <div class="mfg-tabs-bar" style="border-bottom: none; padding-bottom: 0;">
          <button class="mfg-tab-btn active" data-type="ALL">All Items</button>
          <button class="mfg-tab-btn" data-type="Botanical Herb">Botanical Herbs</button>
          <button class="mfg-tab-btn" data-type="Mineral / Bhasma">Minerals / Metals</button>
          <button class="mfg-tab-btn" data-type="Packaging">Packaging & Bottles</button>
        </div>

        <input type="text" id="mfgRmSearchInput" class="mfg-input" placeholder="Search herb or Odia name..." style="width: 240px;">
      </div>

      <div class="mfg-table-container">
        <table class="mfg-table">
          <thead>
            <tr>
              <th>Material Name</th>
              <th>Botanical / Odia</th>
              <th>Type</th>
              <th>Storage Location</th>
              <th>HSN</th>
              <th>Current Stock</th>
              <th>Reorder Level</th>
              <th>Status</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody id="mfgRmTableBody">
            <tr><td colspan="9" style="text-align: center; padding: 24px;">Loading raw materials...</td></tr>
          </tbody>
        </table>
      </div>
    `;

    this.bindEvents();
    await this.loadRawMaterials();
  }

  bindEvents() {
    this.container.querySelector('#mfgRefreshRmBtn')?.addEventListener('click', () => this.loadRawMaterials());
    this.container.querySelector('#mfgReceiveGrnBtn')?.addEventListener('click', () => this.openReceiveGrnModal());
    this.container.querySelector('#mfgAddMaterialBtn')?.addEventListener('click', () => this.app.openCreateMaterialModal());

    const tabButtons = this.container.querySelectorAll('.mfg-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.filterType = btn.dataset.type;
        this.renderTableRows();
      });
    });

    const searchInput = this.container.querySelector('#mfgRmSearchInput');
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.renderTableRows();
    });
  }

  filterMaterials(query) {
    this.searchQuery = (query || '').toLowerCase().trim();
    this.renderTableRows();
  }

  async loadRawMaterials() {
    try {
      const res = await fetch('/api/manufacturing/raw-materials');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load materials');
      this.materials = data.materials || [];
      this.updateKpis();
      this.renderTableRows();
    } catch (err) {
      console.error('[Raw Materials] Error:', err);
      const tbody = this.container.querySelector('#mfgRmTableBody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="color: red; text-align: center; padding: 16px;">Error: ${err.message}</td></tr>`;
    }
  }

  updateKpis() {
    const total = this.materials.length;
    const lowStock = this.materials.filter(m => m.current_stock <= m.reorder_level).length;
    const herbs = this.materials.filter(m => m.type.includes('Herb')).length;
    const packaging = this.materials.filter(m => m.type.includes('Packaging') || m.type.includes('Bottle')).length;

    this.container.querySelector('#kpiTotalMaterials').textContent = total;
    this.container.querySelector('#kpiLowStockMaterials').textContent = lowStock;
    this.container.querySelector('#kpiHerbsCount').textContent = herbs;
    this.container.querySelector('#kpiPackagingCount').textContent = packaging;
  }

  renderTableRows() {
    const tbody = this.container.querySelector('#mfgRmTableBody');
    if (!tbody) return;

    let filtered = this.materials;
    if (this.filterType !== 'ALL') {
      filtered = filtered.filter(m => m.type.includes(this.filterType));
    }

    if (this.searchQuery) {
      filtered = filtered.filter(m => 
        m.name.toLowerCase().includes(this.searchQuery) ||
        (m.odia_name && m.odia_name.toLowerCase().includes(this.searchQuery))
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="mfg-empty-state">
              <span class="mfg-empty-icon">🌿</span>
              <div>No matching raw materials found.</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(m => {
      const isLow = m.current_stock <= m.reorder_level;
      return `
        <tr>
          <td><strong>${m.name}</strong></td>
          <td style="color: var(--mfg-text-muted); font-size: 12px;">${m.odia_name || '—'}</td>
          <td><span style="font-size: 11px; background: rgba(0,0,0,0.05); padding: 2px 7px; border-radius: 4px;">${m.type}</span></td>
          <td style="font-size: 12px;">${m.storage_location || 'Godown Floor'}</td>
          <td style="font-family: monospace; font-size: 11.5px;">${m.hsn_code || '1211'}</td>
          <td><strong style="color: ${isLow ? '#ef4444' : '#0f172a'}; font-size: 13px;">${m.current_stock} ${m.uom}</strong></td>
          <td style="color: var(--mfg-text-muted);">${m.reorder_level} ${m.uom}</td>
          <td>
            ${isLow ? `
              <span class="mfg-pill mfg-pill-reorder">⚠️ Reorder</span>
            ` : `
              <span class="mfg-pill mfg-pill-released">✓ In Stock</span>
            `}
          </td>
          <td style="text-align: right;">
            <button class="mfg-btn mfg-btn-sm mfg-btn-secondary" title="Edit Raw Material Details" onclick="window.ManufacturingAppInstance.openEditMaterialModal(${m.id})">
              ✏️ Edit
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  openReceiveGrnModal() {
    this.app.openReceiveGrnModal();
  }
}
