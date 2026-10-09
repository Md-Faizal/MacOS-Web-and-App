/**
 * Master Formulas (MFR / Recipes) View
 * Ayurvedic Pharmacopoeia Formulas & Interactive Scaling in Rust WASM
 */

export class MasterFormulasView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.formulas = [];
    this.selectedFormula = null;
    this.searchQuery = '';
  }

  filterFormulas(query) {
    this.searchQuery = query || '';
    this.renderFormulaList();
  }

  async render(targetEl) {
    this.container = targetEl;
    this.container.innerHTML = `
      <div class="mfg-view-header">
        <div class="mfg-view-title-box">
          <h2>📜 Master Formula Records (MFR)</h2>
          <p>Pharmacopoeial Ayurvedic BoMs • Decoction & Processing Stages • Rust Recipe Scaler</p>
        </div>
        <div class="mfg-actions-group">
          <button class="mfg-btn mfg-btn-secondary" id="mfgRefreshMfrBtn">↻ Refresh</button>
          <button class="mfg-btn mfg-btn-secondary" id="mfgAiAdvisorBtn" style="background: linear-gradient(135deg, rgba(99,102,241,0.1), rgba(168,85,247,0.1)); border-color: rgba(168,85,247,0.3); color: #6d28d9; font-weight: 600;">
            ✨ AI Formulation Advisor
          </button>
          <button class="mfg-btn mfg-btn-primary" id="mfgNewMfrBtn">+ New Master Formula</button>
        </div>
      </div>

      <div class="mfg-statutory-box">
        <span class="mfg-statutory-icon">📚</span>
        <div>
          <strong>Schedule T Standard Master Formula (MFR):</strong>
          Every manufactured Ayurvedic classical or proprietary formulation requires an authoritative Master Formula Record citing the Ayurvedic Pharmacopoeia / AFI reference, standard batch quantities, and designated stages. Batch scaling is calculated with 3-decimal precision using the Rust Core Engine.
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 320px 1fr; gap: 18px; align-items: start;">
        <!-- Left: Formulas List -->
        <div class="mfg-table-container">
          <div style="padding: 12px 14px; background: #f8fafc; border-bottom: 1px solid var(--mfg-border); font-weight: 600; font-size: 12px;">
            Registered Master Formulas
          </div>
          <div id="mfgFormulaList" style="max-height: 480px; overflow-y: auto;">
            <div style="padding: 16px; text-align: center; color: var(--mfg-text-muted);">Loading recipes...</div>
          </div>
        </div>

        <!-- Right: Recipe Details & Rust Scaling Calculator -->
        <div class="mfg-table-container" id="mfgFormulaDetailPanel" style="padding: 16px;">
          <div style="text-align: center; padding: 48px 16px; color: var(--mfg-text-muted);">
            👈 Select a Master Formula from the list to view ingredients and run the Rust Recipe Scaler.
          </div>
        </div>
      </div>
    `;

    this.bindEvents();
    await this.loadFormulas();
  }

  bindEvents() {
    this.container.querySelector('#mfgRefreshMfrBtn')?.addEventListener('click', () => this.loadFormulas());
    this.container.querySelector('#mfgNewMfrBtn')?.addEventListener('click', () => this.openNewFormulaModal());
    this.container.querySelector('#mfgAiAdvisorBtn')?.addEventListener('click', () => this.app.openAiFormulationModal());
  }

  async loadFormulas() {
    try {
      const res = await fetch('/api/manufacturing/master-formulas');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load master formulas');
      this.formulas = data.formulas || [];
      this.renderFormulaList();
      if (this.formulas.length > 0 && !this.selectedFormula) {
        this.selectFormula(this.formulas[0].id);
      }
    } catch (err) {
      console.error('[Master Formulas] Error:', err);
      const listEl = this.container.querySelector('#mfgFormulaList');
      if (listEl) listEl.innerHTML = `<div style="padding: 16px; color: red;">Error: ${err.message}</div>`;
    }
  }

  renderFormulaList() {
    const listEl = this.container.querySelector('#mfgFormulaList');
    if (!listEl) return;

    let list = this.formulas;
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(f =>
        (f.product_name && f.product_name.toLowerCase().includes(q)) ||
        (f.formula_name && f.formula_name.toLowerCase().includes(q)) ||
        (f.pharmacopoeial_ref && f.pharmacopoeial_ref.toLowerCase().includes(q))
      );
    }

    if (list.length === 0) {
      listEl.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--mfg-text-muted);">No Master Formulas matching '${this.searchQuery}'.</div>`;
      return;
    }

    listEl.innerHTML = list.map(f => `
      <div class="mfg-formula-item ${this.selectedFormula?.id === f.id ? 'active' : ''}" 
           data-id="${f.id}"
           style="padding: 12px 14px; border-bottom: 1px solid var(--mfg-border-subtle); cursor: pointer; transition: background 0.15s ease; ${this.selectedFormula?.id === f.id ? 'background: var(--mfg-primary-light); font-weight: 600;' : ''}">
        <div style="font-size: 13px; color: var(--mfg-text-main); font-weight: 600;">${f.product_name}</div>
        <div style="font-size: 11.5px; color: var(--mfg-text-muted); margin-top: 2px;">
          ${f.formula_name} • Std: ${f.std_batch_size} ${f.std_batch_uom}
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.mfg-formula-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = parseInt(el.dataset.id, 10);
        this.selectFormula(id);
      });
    });
  }

  selectFormula(formulaId) {
    this.selectedFormula = this.formulas.find(f => f.id === formulaId);
    this.renderFormulaList();
    this.renderFormulaDetail();
  }

  renderFormulaDetail() {
    const panel = this.container.querySelector('#mfgFormulaDetailPanel');
    if (!panel || !this.selectedFormula) return;

    const f = this.selectedFormula;
    const items = f.items || [];

    panel.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--mfg-border); padding-bottom: 12px; margin-bottom: 14px;">
        <div>
          <h3 style="margin: 0 0 4px 0; font-size: 17px; color: #0f172a;">${f.product_name}</h3>
          <div style="font-size: 12px; color: var(--mfg-text-muted);">
            ${f.formula_name} • Ref: <em>${f.pharmacopoeial_ref}</em>
          </div>
        </div>
        <div style="text-align: right;">
          <span class="mfg-pill mfg-pill-released">Standard: ${f.std_batch_size} ${f.std_batch_uom}</span>
          <div style="font-size: 11px; color: var(--mfg-text-muted); margin-top: 4px;">Expected Yield: ${f.expected_yield_percent}%</div>
        </div>
      </div>

      <!-- Live Rust Scaler Interactive Bar -->
      <div style="background: #f8fafc; border: 1px solid var(--mfg-border); border-radius: 8px; padding: 12px 14px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 12px; font-weight: 600; color: #334155;">⚡ Rust Live Recipe Scaler:</span>
          <span style="font-size: 11.5px; color: var(--mfg-text-muted);">Planned Batch Size:</span>
          <input type="number" id="mfgScaleInput" value="${f.std_batch_size}" min="1" step="1" style="width: 90px; padding: 4px 8px; font-size: 12.5px; border: 1px solid #cbd5e1; border-radius: 5px; font-weight: 600;">
          <span style="font-size: 12px; font-weight: 600; color: #475569;">${f.std_batch_uom}</span>
        </div>
        <div id="mfgScaleFactorBadge" style="font-size: 11.5px; font-weight: 600; color: var(--mfg-primary); background: var(--mfg-primary-light); padding: 3px 8px; border-radius: 5px;">
          Scale Factor: 1.000x
        </div>
      </div>

      <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #334155; text-transform: uppercase; letter-spacing: 0.3px;">Ingredients Dispensing BoM (${items.length} items)</h4>

      <table class="mfg-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Raw Material</th>
            <th>Stage</th>
            <th>Standard Qty (${f.std_batch_uom})</th>
            <th>Live Scaled Qty</th>
            <th>Stock in Godown</th>
          </tr>
        </thead>
        <tbody id="mfgIngredientsTableBody">
          ${items.map((it, idx) => `
            <tr data-std-qty="${it.qty_required}" data-rm-id="${it.raw_material_id}">
              <td>${idx + 1}</td>
              <td><strong>${it.raw_material_name}</strong></td>
              <td><span style="font-size: 11px; background: rgba(0,0,0,0.05); padding: 2px 6px; border-radius: 4px;">${it.stage || 'Decoction'}</span></td>
              <td>${it.qty_required} ${it.uom}</td>
              <td class="scaled-cell" style="font-weight: 700; color: var(--mfg-primary);">${it.qty_required} ${it.uom}</td>
              <td>${it.current_stock} ${it.uom}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="margin-top: 18px; display: flex; justify-content: flex-end; gap: 10px;">
        <button class="mfg-btn mfg-btn-primary" onclick="window.ManufacturingAppInstance.openNewBatchWithFormula(${f.id}, ${f.product_id})">
          🏭 Launch Production Batch with this MFR
        </button>
      </div>
    `;

    // Hook live scaling input
    const scaleInput = panel.querySelector('#mfgScaleInput');
    scaleInput?.addEventListener('input', () => this.handleLiveScale(f));
  }

  async handleLiveScale(formula) {
    const scaleInput = this.container.querySelector('#mfgScaleInput');
    const factorBadge = this.container.querySelector('#mfgScaleFactorBadge');
    if (!scaleInput || !factorBadge) return;

    const planned = parseFloat(scaleInput.value) || formula.std_batch_size;
    const std = formula.std_batch_size || 100;
    const items = (formula.items || []).map(it => ({
      raw_material_id: it.raw_material_id,
      raw_material_name: it.raw_material_name,
      uom: it.uom,
      qty_per_std_batch: it.qty_required,
      stage: it.stage || 'Decoction'
    }));

    try {
      // Call Rust scaling API
      const res = await fetch('/api/manufacturing/recipes/scale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          std_batch_size: std,
          planned_batch_size: planned,
          items
        })
      });
      const data = await res.json();
      if (data.success) {
        factorBadge.textContent = `Scale Factor: ${data.scale_factor.toFixed(3)}x`;

        // Update table cells
        const tbody = this.container.querySelector('#mfgIngredientsTableBody');
        if (tbody) {
          const rows = tbody.querySelectorAll('tr');
          data.items.forEach((scaledItem, idx) => {
            const row = rows[idx];
            if (row) {
              const cell = row.querySelector('.scaled-cell');
              if (cell) cell.textContent = `${scaledItem.required_qty.toFixed(3)} ${scaledItem.uom}`;
            }
          });
        }
      }
    } catch (err) {
      console.warn('Scaling error:', err);
    }
  }

  openNewFormulaModal() {
    this.app.openNewFormulaModal();
  }
}
