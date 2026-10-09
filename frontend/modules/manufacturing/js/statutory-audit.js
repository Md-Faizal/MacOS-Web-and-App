/**
 * Statutory Audit & Schedule T Registers View
 * Raw Material Inward Register and Rule 161B Retention Sample Log
 */

export class StatutoryAuditView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.inwardLogs = [];
    this.batches = [];
    this.activeTab = 'INWARD';
  }

  async render(targetEl) {
    this.container = targetEl;
    this.container.innerHTML = `
      <div class="mfg-view-header">
        <div class="mfg-view-title-box">
          <h2>📋 Statutory Audit & Schedule T Registers</h2>
          <p>Utkal Chemical Aushadhalaya (OR-02/AYUR) • Inspection Registers • Rule 161B Control Samples</p>
        </div>
        <div class="mfg-actions-group">
          <button class="mfg-btn mfg-btn-secondary" id="mfgRefreshAuditBtn">↻ Refresh</button>
          <button class="mfg-btn mfg-btn-secondary" id="mfgPrintRegisterBtn">⎙ Print Register</button>
        </div>
      </div>

      <div class="mfg-statutory-box">
        <span class="mfg-statutory-icon">🏛️</span>
        <div>
          <strong>Statutory Inspection Ready (Dept of AYUSH):</strong>
          Under Part I, Schedule T (GMP) of the Drugs & Cosmetics Rules, 1945, manufacturers are legally mandated to maintain chronological Goods Receipt Note (GRN) inward logs and a Rule 161B Control/Retention Sample Register preserved for at least 3 years after the batch expiration date.
        </div>
      </div>

      <div class="mfg-tabs-bar">
        <button class="mfg-tab-btn active" data-tab="INWARD">Schedule T Raw Material Inward Register</button>
        <button class="mfg-tab-btn" data-tab="CONTROL_SAMPLES">Rule 161B Control & Retention Sample Register</button>
      </div>

      <div class="mfg-table-container" id="mfgAuditTableContainer">
        <!-- Dynamic table content -->
      </div>
    `;

    this.bindEvents();
    await this.loadData();
  }

  bindEvents() {
    this.container.querySelector('#mfgRefreshAuditBtn')?.addEventListener('click', () => this.loadData());
    this.container.querySelector('#mfgPrintRegisterBtn')?.addEventListener('click', () => window.print());

    const tabButtons = this.container.querySelectorAll('.mfg-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeTab = btn.dataset.tab;
        this.renderActiveTable();
      });
    });
  }

  async loadData() {
    try {
      const [inwardRes, batchRes] = await Promise.all([
        fetch('/api/manufacturing/raw-materials/inward'),
        fetch('/api/manufacturing/batches')
      ]);

      const inwardData = await inwardRes.json();
      const batchData = await batchRes.json();

      this.inwardLogs = inwardData.inwards || [];
      this.batches = batchData.batches || [];

      this.renderActiveTable();
    } catch (err) {
      console.error('[Statutory Audit] Error:', err);
    }
  }

  renderActiveTable() {
    const tableContainer = this.container.querySelector('#mfgAuditTableContainer');
    if (!tableContainer) return;

    if (this.activeTab === 'INWARD') {
      tableContainer.innerHTML = `
        <table class="mfg-table">
          <thead>
            <tr>
              <th>Receipt Date</th>
              <th>Raw Material</th>
              <th>Supplier Name</th>
              <th>Invoice / Challan</th>
              <th>Vendor Lot No</th>
              <th>Qty Received</th>
              <th>QC Status</th>
              <th>Lab Report #</th>
            </tr>
          </thead>
          <tbody>
            ${this.inwardLogs.length === 0 ? `
              <tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--mfg-text-muted);">No raw material inward entries recorded yet.</td></tr>
            ` : this.inwardLogs.map(log => `
              <tr>
                <td><strong>${log.receipt_date}</strong></td>
                <td><strong>${log.raw_material_name}</strong></td>
                <td>${log.supplier_name || 'Direct / Local'}</td>
                <td style="font-family: monospace;">${log.invoice_no || '—'}</td>
                <td style="font-family: monospace;">${log.vendor_lot_no || 'LOT-GENERAL'}</td>
                <td><strong>${log.qty_received} ${log.uom}</strong></td>
                <td><span class="mfg-pill mfg-pill-released">✓ ${log.qc_status || 'Conforms'}</span></td>
                <td style="font-size: 11.5px; color: var(--mfg-text-muted);">${log.lab_report_no || 'In-House/Standard'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      const releasedBatches = this.batches.filter(b => b.status === 'RELEASED');
      tableContainer.innerHTML = `
        <table class="mfg-table">
          <thead>
            <tr>
              <th>Batch No</th>
              <th>Product Name</th>
              <th>Mfg Date</th>
              <th>Exp Date</th>
              <th>Retention Qty</th>
              <th>Storage Location</th>
              <th>Form 48 CoA Report #</th>
              <th>Approved Chemist</th>
            </tr>
          </thead>
          <tbody>
            ${releasedBatches.length === 0 ? `
              <tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--mfg-text-muted);">No released batches with retention samples recorded yet.</td></tr>
            ` : releasedBatches.map(b => `
              <tr>
                <td><strong style="font-family: monospace; font-size: 13px;">${b.batch_no}</strong></td>
                <td><strong>${b.product_name}</strong></td>
                <td>${b.mfg_date}</td>
                <td>${b.exp_date}</td>
                <td><strong style="color: #059669;">${b.retention_sample_qty || '2 Retail Packs'}</strong></td>
                <td><span style="font-size: 12px; background: rgba(0,0,0,0.04); padding: 2px 7px; border-radius: 4px;">${b.retention_location || 'Factory QC Almirah'}</span></td>
                <td style="font-family: monospace; font-size: 11.5px;">${b.lab_report_no || 'SDTL-AYUR'}</td>
                <td style="font-size: 12px;">${b.technical_person || 'Approved Technical Person'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  }
}
