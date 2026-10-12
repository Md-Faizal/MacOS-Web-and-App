/**
 * BMR Pipeline View
 * Schedule T GMP Batch Manufacturing Records & Statutory Release
 */

export class BmrPipelineView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.batches = [];
    this.currentFilter = 'ALL';
    this.searchQuery = '';
  }

  filterBatches(query) {
    this.searchQuery = query || '';
    this.renderTableRows();
  }

  async render(targetEl) {
    this.container = targetEl;
    this.container.innerHTML = `
      <div class="mfg-view-header">
        <div class="mfg-view-title-box">
          <h2>🏭 Active Batches & BMR Pipeline</h2>
          <p>Schedule T Batch Manufacturing Records • In-Process • Quarantine • Form 48 Lab Release</p>
        </div>
        <div class="mfg-actions-group">
          <button class="mfg-btn mfg-btn-secondary" id="mfgRefreshBatchesBtn">↻ Refresh</button>
          <button class="mfg-btn mfg-btn-primary" id="mfgNewBatchBtn">+ New Batch (BMR)</button>
        </div>
      </div>

      <div class="mfg-kpi-grid" id="mfgBmrKpiGrid">
        <div class="mfg-kpi-card">
          <span class="mfg-kpi-label">Total Batches</span>
          <span class="mfg-kpi-val" id="kpiTotalBatches">-</span>
          <span class="mfg-kpi-sub">All registered production runs</span>
        </div>
        <div class="mfg-kpi-card">
          <span class="mfg-kpi-label">In-Process Floor</span>
          <span class="mfg-kpi-val" id="kpiInProcessBatches" style="color: #2563eb;">-</span>
          <span class="mfg-kpi-sub">Active decoction / tableting</span>
        </div>
        <div class="mfg-kpi-card">
          <span class="mfg-kpi-label">Quarantine (Lab Testing)</span>
          <span class="mfg-kpi-val" id="kpiQuarantineBatches" style="color: #ea580c;">-</span>
          <span class="mfg-kpi-sub">Awaiting Form 48 outsourced CoA</span>
        </div>
        <div class="mfg-kpi-card">
          <span class="mfg-kpi-label">Released to Billing</span>
          <span class="mfg-kpi-val" id="kpiReleasedBatches" style="color: #059669;">-</span>
          <span class="mfg-kpi-sub">Active in commercial catalog</span>
        </div>
      </div>

      <div class="mfg-statutory-box">
        <span class="mfg-statutory-icon">⚖️</span>
        <div>
          <strong>Schedule T Compliance Notice (Rule 157 & 160):</strong>
          Batches completed in the factory are automatically held in <strong>QUARANTINE</strong> until an approved Testing Report (CoA) from a State Government / NABL approved laboratory (Form 48) is recorded. Releasing a batch validates statutory criteria in pure Rust and deposits the batch into the commercial billing catalog.
        </div>
      </div>

      <div class="mfg-tabs-bar">
        <button class="mfg-tab-btn active" data-filter="ALL">All Batches</button>
        <button class="mfg-tab-btn" data-filter="IN_PROCESS">In-Process</button>
        <button class="mfg-tab-btn" data-filter="QUARANTINE">Quarantine (Lab)</button>
        <button class="mfg-tab-btn" data-filter="RELEASED">Released for Sale</button>
      </div>

      <div class="mfg-table-container">
        <table class="mfg-table">
          <thead>
            <tr>
              <th>Batch No</th>
              <th>Product Name</th>
              <th>Mfg Date</th>
              <th>Exp Date</th>
              <th>Planned Qty</th>
              <th>Actual Yield</th>
              <th>Status</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody id="mfgBatchesTableBody">
            <tr>
              <td colspan="8" class="mfg-loading-cell">
                <div class="macos-loader-container compact">
                  <div class="macos-circular-loader sm"></div>
                  <p class="macos-loader-title" style="font-size: 13px;">Loading Manufacturing Batches...</p>
                  <p class="macos-loader-subtitle" style="font-size: 11px;">Syncing production records</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;

    this.bindEvents();
    await this.loadBatches();
  }

  bindEvents() {
    this.container.querySelector('#mfgRefreshBatchesBtn')?.addEventListener('click', () => this.loadBatches());
    this.container.querySelector('#mfgNewBatchBtn')?.addEventListener('click', () => this.openNewBatchModal());

    const tabButtons = this.container.querySelectorAll('.mfg-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this.renderTableRows();
      });
    });
  }

  async loadBatches() {
    try {
      const res = await fetch('/api/manufacturing/batches');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load batches');
      this.batches = data.batches || [];
      this.updateKpis();
      this.renderTableRows();
    } catch (err) {
      console.error('[BMR Pipeline] Error loading batches:', err);
      const tbody = this.container.querySelector('#mfgBatchesTableBody');
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8" style="color: red; text-align: center; padding: 16px;">Error loading batches: ${err.message}</td></tr>`;
      }
    }
  }

  updateKpis() {
    const total = this.batches.length;
    const inProcess = this.batches.filter(b => b.status === 'IN_PROCESS').length;
    const quarantine = this.batches.filter(b => b.status === 'QUARANTINE').length;
    const released = this.batches.filter(b => b.status === 'RELEASED').length;

    this.container.querySelector('#kpiTotalBatches').textContent = total;
    this.container.querySelector('#kpiInProcessBatches').textContent = inProcess;
    this.container.querySelector('#kpiQuarantineBatches').textContent = quarantine;
    this.container.querySelector('#kpiReleasedBatches').textContent = released;
  }

  renderTableRows() {
    const tbody = this.container.querySelector('#mfgBatchesTableBody');
    if (!tbody) return;

    let filtered = this.batches;
    if (this.currentFilter !== 'ALL') {
      filtered = this.batches.filter(b => b.status === this.currentFilter);
    }
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(b =>
        (b.batch_no && b.batch_no.toLowerCase().includes(q)) ||
        (b.product_name && b.product_name.toLowerCase().includes(q)) ||
        (b.formula_name && b.formula_name.toLowerCase().includes(q))
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="mfg-empty-state">
              <span class="mfg-empty-icon">📦</span>
              <div>No production batches found for filter '${this.currentFilter}'.</div>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(b => {
      let statusClass = 'mfg-pill-in-process';
      let statusLabel = 'In-Process';
      if (b.status === 'QUARANTINE') {
        statusClass = 'mfg-pill-quarantine';
        statusLabel = 'Quarantine (Lab)';
      } else if (b.status === 'RELEASED') {
        statusClass = 'mfg-pill-released';
        statusLabel = 'Released';
      }

      const yieldDisplay = b.yield_percent ? `${b.yield_percent.toFixed(1)}%` : '—';
      const outputDisplay = b.actual_output_qty ? `${b.actual_output_qty} U` : '—';

      return `
        <tr>
          <td><strong style="font-family: monospace; font-size: 13px;">${b.batch_no}</strong></td>
          <td>
            <strong>${b.product_name}</strong>
            <div style="font-size: 11px; color: var(--mfg-text-muted);">${b.formula_name || 'Standard MFR'}</div>
          </td>
          <td>${b.mfg_date}</td>
          <td>${b.exp_date}</td>
          <td>${b.planned_qty} Units</td>
          <td><strong>${yieldDisplay}</strong> (${outputDisplay})</td>
          <td><span class="mfg-pill ${statusClass}">${statusLabel}</span></td>
          <td style="text-align: right;">
            <div class="mfg-actions-group" style="justify-content: flex-end;">
              <button class="mfg-btn mfg-btn-sm mfg-btn-secondary" title="View/Upload Photos & Notes" onclick="window.ManufacturingAppInstance.openAttachmentsModal('BATCH', ${b.id}, 'BMR Batch: ${b.batch_no}')">
                📷 Photos & Notes
              </button>
              <button class="mfg-btn mfg-btn-sm mfg-btn-secondary" title="Download Statutory BMR Dossier" onclick="window.ManufacturingAppInstance.downloadBmrPdf(${b.id}, '${b.batch_no}')">
                📄 Dossier PDF
              </button>
              ${b.status === 'IN_PROCESS' ? `
                <button class="mfg-btn mfg-btn-sm mfg-btn-secondary" onclick="window.ManufacturingAppInstance.openYieldReconcileModal(${b.id})">
                  ⚖️ Yield
                </button>
                <button class="mfg-btn mfg-btn-sm mfg-btn-gold" onclick="window.ManufacturingAppInstance.openReleaseModal(${b.id})">
                  🔬 CoA Release
                </button>
              ` : ''}
              ${b.status === 'QUARANTINE' ? `
                <button class="mfg-btn mfg-btn-sm mfg-btn-gold" onclick="window.ManufacturingAppInstance.openReleaseModal(${b.id})">
                  🔬 Enter CoA & Release
                </button>
              ` : ''}
              ${b.status === 'RELEASED' ? `
                <span style="font-size: 11px; color: #059669; font-weight: 600;">✓ In Billing</span>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async openNewBatchModal() {
    this.app.openNewBatchModal();
  }
}
