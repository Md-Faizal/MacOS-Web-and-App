/**
 * Doctors & Technical Staff Master View
 * Manage Approved Technical Persons, Ayurvedic Vaidyas, Chemists & QC Heads
 */

export class TechnicalStaffView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.staff = [];
    this.searchQuery = '';
  }

  filterStaff(query) {
    this.searchQuery = query || '';
    this.renderStaffGrid();
  }

  async render(targetEl) {
    this.container = targetEl;
    this.container.innerHTML = `
      <div class="mfg-view-header">
        <div class="mfg-view-title-box">
          <h2>🩺 Doctors & Technical Staff Master</h2>
          <p>Schedule T Rule 157 Approved Technical Persons • Qualified Vaidyas • Manufacturing Chemists</p>
        </div>
        <div class="mfg-actions-group">
          <button class="mfg-btn mfg-btn-secondary" id="mfgRefreshStaffBtn">↻ Refresh</button>
          <button class="mfg-btn mfg-btn-primary" id="mfgNewStaffBtn">+ Add Doctor / Technical Staff</button>
        </div>
      </div>

      <div class="mfg-statutory-box">
        <span class="mfg-statutory-icon">📜</span>
        <div>
          <strong>Statutory Requirement (Rule 157, Drugs & Cosmetics Rules 1945):</strong>
          The manufacture of Ayurvedic medicines shall be conducted under the active supervision of competent technical staff possessing a recognized degree in Ayurveda (BAMS), Ayurvedic Pharmacy (B.Pharm Ayu), or Chemistry. Staff configured here appear as approved sign-offs on BMR dispensing logs and batch release certificates.
        </div>
      </div>

      <div class="mfg-staff-grid" id="mfgStaffGridContainer">
        <div style="padding: 24px; text-align: center; color: var(--mfg-text-muted);">Loading technical staff...</div>
      </div>
    `;

    this.bindEvents();
    await this.loadStaff();
  }

  bindEvents() {
    this.container.querySelector('#mfgRefreshStaffBtn')?.addEventListener('click', () => this.loadStaff());
    this.container.querySelector('#mfgNewStaffBtn')?.addEventListener('click', () => this.openNewStaffModal());
  }

  async loadStaff() {
    try {
      const res = await fetch('/api/manufacturing/technical-staff');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load staff');
      this.staff = data.staff || [];
      this.renderStaffGrid();
    } catch (err) {
      console.error('[Technical Staff] Error:', err);
    }
  }

  renderStaffGrid() {
    const grid = this.container.querySelector('#mfgStaffGridContainer');
    if (!grid) return;

    let list = this.staff;
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(s =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.role && s.role.toLowerCase().includes(q)) ||
        (s.qualification && s.qualification.toLowerCase().includes(q)) ||
        (s.registration_no && s.registration_no.toLowerCase().includes(q))
      );
    }

    if (list.length === 0) {
      grid.innerHTML = `
        <div class="mfg-empty-state">
          <span class="mfg-empty-icon">🩺</span>
          <div>${this.searchQuery ? `No technical staff matching '${this.searchQuery}'.` : 'No technical staff configured yet. Click "+ Add Doctor / Technical Staff" above.'}</div>
        </div>
      `;
      return;
    }

    const avatarGradients = [
      'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
      'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
      'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
      'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)'
    ];

    grid.innerHTML = list.map((s, idx) => {
      const initials = s.name.replace(/^(Dr\.|Vaidya)\s*/i, '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'AY';
      const gradient = avatarGradients[idx % avatarGradients.length];
      return `
        <div class="mfg-staff-card">
          <div class="mfg-staff-avatar" style="background: ${gradient};">${initials}</div>
          <div class="mfg-staff-info">
            <div class="mfg-staff-name">${s.name}</div>
            <div class="mfg-staff-role">${s.role}</div>
            <div class="mfg-staff-reg">🎓 ${s.qualification || 'BAMS'} • Reg: <strong>${s.registration_no || '—'}</strong></div>
            <div style="font-size: 11px; color: var(--mfg-text-muted); margin-top: 2px;">
              📞 ${s.phone || '—'}
            </div>
          </div>
          <div style="position: absolute; top: 12px; right: 12px; display: flex; gap: 4px;">
            <button class="mfg-btn mfg-btn-sm mfg-btn-secondary" title="Edit Staff" onclick="window.ManufacturingAppInstance.openEditStaffModal(${s.id})">
              ✏️
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  openNewStaffModal() {
    this.app.openNewStaffModal();
  }
}
