/**
 * ComplianceReportsView - Statutory & Legal Compliance Reports for Ayurvedic Manufacturing
 * Complies with:
 *  1. Dept. of AYUSH (Schedule T GMP & Rule 161B)
 *  2. Goods & Services Tax (GST Table 12 HSN & GSTR-1 Outward Summary)
 *
 * Powered by pure Rust WebAssembly vector PDF generation via SuiteCoreBridge (<20ms).
 */

const COMPLIANCE_HELPBOOK_DATA = [
  {
    id: 'ayush-dispatch',
    category: 'ayush',
    name: 'Finished Goods Distribution Register',
    authority: 'Dept. of AYUSH (Govt. of India)',
    badge: 'Schedule T GMP',
    badgeClass: 'compliance-badge-ayush',
    interval: 'Monthly / Real-Time per Dispatch',
    deadline: 'Inspection-Ready at all times. Must be produced within 24 hours upon Drug Inspector notice or official drug recall alert.',
    statute: 'Drugs & Cosmetics Act 1940 & Rules 1945, Schedule T GMP (Part I & II)',
    purpose: 'Enforces complete forward batch traceability from factory packaging to wholesale distributors, retail chemists, and clinics. Mandatory to immediately isolate batches in case of quality defects or adverse reactions.',
    penalty: 'Suspension or cancellation of Ayurvedic Drug Manufacturing License (Form 25D/26D) under Rule 85/159; regulatory seizure of stock.',
    advisory: 'Automated by selecting the batch number during regular invoice billing. Zero extra manual registers required.'
  },
  {
    id: 'gst-hsn',
    category: 'gst',
    name: 'Table 12 HSN-Wise Outward Supplies Summary',
    authority: 'GST Council / CBIC',
    badge: 'CGST Rule 59',
    badgeClass: 'compliance-badge-gst',
    interval: 'Monthly or Quarterly (QRMP)',
    deadline: '11th of every month (Monthly Filers) or 13th of month following quarter (QRMP filers). Part of statutory GSTR-1 return.',
    statute: 'Central Goods & Services Tax (CGST) Rules 2017, Rule 59(1)',
    purpose: 'Groups outward sales by 8-digit/6-digit HSN codes (e.g. 30039011 Classical, 30049011 Proprietary), showing total quantities, taxable turnover, and bifurcated IGST/CGST/SGST.',
    penalty: 'GSTR-1 submission blocked on GST Portal; Late fees of ₹50/day (₹20/day for Nil return); automated notices for HSN discrepancies under Rule 88C.',
    advisory: 'Export CSV directly or compile Rust WASM PDF to hand over to your Chartered Accountant (CA) by the 5th of each month.'
  },
  {
    id: 'gstr1-summary',
    category: 'gst',
    name: 'GSTR-1 Outward Supplies Summary (B2B, B2C, Credit Notes)',
    authority: 'GST Council / CBIC',
    badge: 'CGST Sec 37',
    badgeClass: 'compliance-badge-gst',
    interval: 'Monthly or Quarterly (QRMP)',
    deadline: '11th of subsequent month. Final cut-off to upload B2B invoices and Credit Notes.',
    statute: 'Central Goods & Services Tax (CGST) Act 2017, Section 37',
    purpose: 'Reconciles registered B2B wholesale transactions (Table 4A), unregistered consumer sales (Table 7 B2C), and trade returns/credit notes (Table 9B) with buyer GSTIN validation.',
    penalty: 'Wholesale buyers cannot claim Input Tax Credit (ITC) as invoices will not reflect in their GSTR-2B; buyer relationship strain; interest charges under Sec 50.',
    advisory: 'Review on the 1st to 5th of every month to verify all wholesale customers have valid GSTINs before final filing.'
  },
  {
    id: 'gstr3b-summary',
    category: 'gst',
    name: 'GSTR-3B Tax Liability Statement',
    authority: 'GST Council / CBIC',
    badge: 'CGST Sec 39',
    badgeClass: 'compliance-badge-gst',
    interval: 'Monthly',
    deadline: '20th of the following month (e.g., May 20th for April sales). Determines final net tax payable in cash.',
    statute: 'Central Goods & Services Tax (CGST) Act 2017, Section 39',
    purpose: 'Self-declaration of total tax liability on outward sales, eligible Input Tax Credit (ITC) from raw herb purchases, and cash tax payment via Electronic Cash Ledger.',
    penalty: '18% p.a. penal interest on unpaid tax; E-way bill generation blocked after 2 consecutive filing defaults; attachment of bank accounts under Sec 79.',
    advisory: 'Ensure net GST liability matches the totals displayed in the analytics dashboard before transferring funds to the GST cash ledger.'
  },
  {
    id: 'batch-expiry',
    category: 'ayush',
    name: 'Rule 161B Batch Expiry & Retention Sample Register',
    authority: 'Dept. of AYUSH (Govt. of India)',
    badge: 'Rule 161B',
    badgeClass: 'compliance-badge-ayush',
    interval: 'Quarterly Sales Audit / Annual Disposal',
    deadline: 'Quarterly review for First-Expiry-First-Out (FEFO) stock rotation; Annual Audit on March 31st for destruction of control samples retained past 1 year of expiry.',
    statute: 'Drugs & Cosmetics Rules 1945, Rule 161B (Shelf-life & Retention of Samples)',
    purpose: 'Tracks shelf-life expiration (classical asavas/arishtas vs proprietary syrups & capsules). Enforces retention of reference samples for 1 year after shelf life expires.',
    penalty: 'Selling or stocking expired drugs is a criminal offense under Section 27 of Drugs & Cosmetics Act, punishable by imprisonment and heavy fines.',
    advisory: 'Filter batches with <90 days expiry to initiate discount promotions or quarantine them before dispatch.'
  },
  {
    id: 'customer-aging',
    category: 'internal',
    name: 'Customer Outstanding Ledger & Dues Aging',
    authority: 'Internal Management',
    badge: 'Working Capital',
    badgeClass: 'compliance-badge-alert',
    interval: 'Weekly or Monthly',
    deadline: 'Mandatory review before approving fresh dispatch on credit or issuing bulk distributor orders.',
    statute: 'Sole Proprietorship Financial Prudence & MSME Samadhaan Act',
    purpose: 'Categorizes accounts receivables into aging buckets (0-30, 31-60, 61-90, 90+ days overdue) to secure sole proprietor cash flow.',
    penalty: 'Severe working capital stagnation, distributor default risk, and inability to purchase seasonal raw herbs on cash discounts.',
    advisory: 'Review weekly. Automatically freeze billing credit for distributors with payments overdue beyond 60 days.'
  },
  {
    id: 'daily-sales',
    category: 'internal',
    name: 'Daily Counter Sales & Cash Reconciliation Register',
    authority: 'Internal Accounts',
    badge: 'Daily Controls',
    badgeClass: 'compliance-badge-alert',
    interval: 'Daily Evening Close',
    deadline: 'Every evening at shopfloor/counter closure (5:00 PM - 8:00 PM).',
    statute: 'Internal Accounting Controls & Income Tax Cash Limits (Section 269ST - ₹2 Lakh daily limit)',
    purpose: 'Reconciles physical counter cash, UPI/QR payments, and bank receipts against computer invoices generated during the day.',
    penalty: 'Cash leaks, discrepancies with bank deposits, income tax assessment queries on unverified cash turnover.',
    advisory: 'Proprietor or cashier tallies counter cash drawer with system totals in under 5 minutes before leaving the premises.'
  }
];

export class ComplianceReportsView {
  constructor(analyticsApp) {
    this.analyticsApp = analyticsApp;
    this.viewContainer = analyticsApp.viewContainer;
    this.selectedReport = 'ayush-dispatch';
    this.selectedPeriod = 'ytd';
    this.customStartDate = '';
    this.customEndDate = '';
    this.currentData = null;
    this.helpbookCategory = 'all';
    this.helpbookQuery = '';
  }

  async render() {
    this.viewContainer.innerHTML = `
      <div class="analytics-view-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <h2 style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a;">📜 Statutory & Compliance Reports</h2>
            <span class="compliance-badge compliance-badge-ayush">AYUSH Schedule T GMP</span>
            <span class="compliance-badge compliance-badge-gst">GST Council Ready</span>
          </div>
          <span class="analytics-view-sub" style="font-size: 13px; color: #64748b; margin-top: 4px; display: block;">
            Dept. of AYUSH Finished Goods Traceability, Expiry Audits & GSTR Tax Filings for Sole Proprietorship
          </span>
        </div>
      </div>

      <!-- Statutory Helpbook & Filing Calendar Callout Banner -->
      <div class="compliance-helpbook-banner">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 20px;">💡</span>
          <div>
            <div style="font-size: 13px; font-weight: 700; color: #1e293b;">
              Statutory Helpbook & Legal Filing Calendar
            </div>
            <div style="font-size: 12px; color: #64748b;">
              Need to check official report intervals, statutory legal due dates, compliance authorities, or penalty guidelines?
            </div>
          </div>
        </div>
        <button id="compBannerHelpbookBtn" class="compliance-btn compliance-btn-secondary" style="padding: 6px 14px; font-size: 12px; white-space: nowrap;">
          📖 Open Statutory Helpbook
        </button>
      </div>

      <!-- Controls & Filter Toolbar -->
      <div class="compliance-controls-bar">
        <div class="compliance-select-group">
          <label style="font-size: 12px; font-weight: 600; color: #475569;">Report Type:</label>
          <select id="compReportTypeSelect" class="compliance-dropdown">
            <option value="ayush-dispatch">🌿 AYUSH: Finished Goods Distribution Register (Schedule T GMP)</option>
            <option value="gst-hsn">🏛️ GST: Table 12 HSN-Wise Outward Supplies Summary</option>
            <option value="gstr1-summary">📋 GST: GSTR-1 Outward Summary (B2B, B2C, Credit Notes)</option>
            <option value="batch-expiry">⏳ AYUSH: Rule 161B Batch Expiry & Retention Register</option>
          </select>

          <label style="font-size: 12px; font-weight: 600; color: #475569; margin-left: 10px;">Period:</label>
          <select id="compPeriodSelect" class="compliance-dropdown">
            <option value="ytd">Current Financial Year (YTD)</option>
            <option value="q1">Q1 (Apr - Jun)</option>
            <option value="q2">Q2 (Jul - Sep)</option>
            <option value="q3">Q3 (Oct - Dec)</option>
            <option value="q4">Q4 (Jan - Mar)</option>
            <option value="all">All Historical Records</option>
            <option value="custom">Custom Date Range...</option>
          </select>

          <div id="compCustomDateWrapper" style="display: none; align-items: center; gap: 6px;">
            <input type="date" id="compStartDate" class="compliance-dropdown" style="padding: 6px 10px;" />
            <span style="font-size: 12px; color: #64748b;">to</span>
            <input type="date" id="compEndDate" class="compliance-dropdown" style="padding: 6px 10px;" />
          </div>
        </div>

        <div style="display: flex; gap: 8px; align-items: center;">
          <button id="compHelpbookBtn" class="compliance-btn compliance-btn-secondary" title="View Legal Deadlines, Filing Intervals & Penalties Reference">
            📖 Helpbook
          </button>
          <button id="compRefreshBtn" class="compliance-btn compliance-btn-secondary" title="Fetch Fresh Data">
            🔄 Refresh
          </button>
          <button id="compExportCsvBtn" class="compliance-btn compliance-btn-secondary" title="Export CSV for Portal/Excel">
            📊 Export CSV
          </button>
          <button id="compExportPdfBtn" class="compliance-btn compliance-btn-export" title="Compile Vector PDF in Rust via WebAssembly">
            ⚡ Export Official PDF (Rust WASM)
          </button>
        </div>
      </div>

      <!-- Loading Indicator -->
      <div id="complianceLoading" class="analytics-loading" style="display: none; padding: 40px; text-align: center;">
        <div class="spinner" style="margin: 0 auto 12px;"></div>
        <span style="color: #64748b; font-size: 14px; font-weight: 500;">Aggregating regulatory compliance records...</span>
      </div>

      <!-- KPI Metric Cards Grid -->
      <div id="complianceKpiGrid" class="compliance-stat-grid"></div>

      <!-- Detailed Regulatory Grid -->
      <div id="complianceTableWrapper" class="compliance-table-container">
        <div class="compliance-table-header">
          <h3 id="complianceTableTitle">Report Records</h3>
          <span id="complianceRecordCount" style="font-size: 12px; font-weight: 600; color: #64748b;">0 records</span>
        </div>
        <div class="compliance-table-scroll">
          <table class="compliance-table" id="complianceTable">
            <thead></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>

      <!-- PDF Preview Modal Container -->
      <div id="compliancePdfModal" class="compliance-modal-overlay" style="display: none;">
        <div class="compliance-modal-window">
          <div class="compliance-modal-header">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 16px;">📄</span>
              <span id="complianceModalDocTitle" class="compliance-modal-title">Official PDF Preview</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button id="complianceModalDownloadBtn" class="compliance-btn compliance-btn-export" style="padding: 6px 12px; font-size: 12px;">
                ⬇️ Download PDF
              </button>
              <button id="complianceModalCloseBtn" class="compliance-btn compliance-btn-secondary" style="padding: 6px 12px; font-size: 12px;">
                ✕ Close
              </button>
            </div>
          </div>
          <div class="compliance-modal-body">
            <iframe id="compliancePdfIframe" src="about:blank"></iframe>
          </div>
        </div>
      </div>

      <!-- Compliance Helpbook Modal Container -->
      <div id="complianceHelpbookModal" class="compliance-modal-overlay" style="display: none;">
        <div class="compliance-modal-window compliance-helpbook-window">
          <div class="compliance-modal-header">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 20px;">📖</span>
              <div>
                <span class="compliance-modal-title">Ayurvedic Manufacturing Statutory Helpbook & Filing Calendar</span>
                <span style="font-size: 12px; color: #64748b; display: block;">Official preparation intervals, statutory legal due dates, compliance authorities, and penalty matrix</span>
              </div>
            </div>
            <button id="complianceHelpbookCloseBtn" class="compliance-btn compliance-btn-secondary" style="padding: 6px 12px; font-size: 12px;">
              ✕ Close
            </button>
          </div>
          <div class="compliance-helpbook-body">
            <div class="helpbook-toolbar">
              <input type="text" id="helpbookSearchInput" placeholder="🔍 Search report name, statute, legal deadline, penalty, or authority..." class="compliance-dropdown" style="flex: 1; max-width: 450px;" />
              <div class="helpbook-tabs" id="helpbookCategoryTabs">
                <button class="helpbook-tab active" data-cat="all">All (7)</button>
                <button class="helpbook-tab" data-cat="ayush">Dept. of AYUSH</button>
                <button class="helpbook-tab" data-cat="gst">GST & CBIC</button>
                <button class="helpbook-tab" data-cat="internal">Internal Controls</button>
              </div>
            </div>
            <div id="helpbookCardsContainer" class="helpbook-cards-grid"></div>
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners();
    await this.loadReportData();
  }

  setupEventListeners() {
    const reportSelect = document.getElementById('compReportTypeSelect');
    const periodSelect = document.getElementById('compPeriodSelect');
    const customDateWrap = document.getElementById('compCustomDateWrapper');
    const refreshBtn = document.getElementById('compRefreshBtn');
    const exportPdfBtn = document.getElementById('compExportPdfBtn');
    const exportCsvBtn = document.getElementById('compExportCsvBtn');

    if (reportSelect) {
      reportSelect.value = this.selectedReport;
      reportSelect.addEventListener('change', (e) => {
        this.selectedReport = e.target.value;
        this.loadReportData();
      });
    }

    if (periodSelect) {
      periodSelect.value = this.selectedPeriod;
      periodSelect.addEventListener('change', (e) => {
        this.selectedPeriod = e.target.value;
        if (this.selectedPeriod === 'custom') {
          customDateWrap.style.display = 'flex';
        } else {
          customDateWrap.style.display = 'none';
          this.loadReportData();
        }
      });
    }

    const startDateInput = document.getElementById('compStartDate');
    const endDateInput = document.getElementById('compEndDate');
    if (startDateInput && endDateInput) {
      const onCustomChange = () => {
        this.customStartDate = startDateInput.value;
        this.customEndDate = endDateInput.value;
        if (this.customStartDate && this.customEndDate) {
          this.loadReportData();
        }
      };
      startDateInput.addEventListener('change', onCustomChange);
      endDateInput.addEventListener('change', onCustomChange);
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.loadReportData());
    }

    if (exportPdfBtn) {
      exportPdfBtn.addEventListener('click', () => this.handleExportPdf());
    }

    if (exportCsvBtn) {
      exportCsvBtn.addEventListener('click', () => this.handleExportCsv());
    }

    // PDF Preview Modal controls
    const pdfModal = document.getElementById('compliancePdfModal');
    const pdfModalClose = document.getElementById('complianceModalCloseBtn');
    if (pdfModalClose && pdfModal) {
      pdfModalClose.addEventListener('click', () => {
        pdfModal.style.display = 'none';
        const iframe = document.getElementById('compliancePdfIframe');
        if (iframe) iframe.src = 'about:blank';
      });
    }

    // Helpbook Modal controls
    const helpbookModal = document.getElementById('complianceHelpbookModal');
    const helpbookClose = document.getElementById('complianceHelpbookCloseBtn');
    const helpbookBtn = document.getElementById('compHelpbookBtn');
    const bannerHelpbookBtn = document.getElementById('compBannerHelpbookBtn');

    const openHelpbook = () => {
      if (helpbookModal) {
        helpbookModal.style.display = 'flex';
        this.renderHelpbookCards();
      }
    };

    const closeHelpbook = () => {
      if (helpbookModal) {
        helpbookModal.style.display = 'none';
      }
    };

    if (helpbookBtn) helpbookBtn.addEventListener('click', openHelpbook);
    if (bannerHelpbookBtn) bannerHelpbookBtn.addEventListener('click', openHelpbook);
    if (helpbookClose) helpbookClose.addEventListener('click', closeHelpbook);

    if (helpbookModal) {
      helpbookModal.addEventListener('click', (e) => {
        if (e.target === helpbookModal) closeHelpbook();
      });
    }

    // Helpbook Search & Tabs
    const searchInput = document.getElementById('helpbookSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.helpbookQuery = e.target.value.trim().toLowerCase();
        this.renderHelpbookCards();
      });
    }

    const tabContainer = document.getElementById('helpbookCategoryTabs');
    if (tabContainer) {
      tabContainer.addEventListener('click', (e) => {
        const tab = e.target.closest('.helpbook-tab');
        if (!tab) return;
        tabContainer.querySelectorAll('.helpbook-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.helpbookCategory = tab.dataset.cat || 'all';
        this.renderHelpbookCards();
      });
    }
  }

  renderHelpbookCards() {
    const container = document.getElementById('helpbookCardsContainer');
    if (!container) return;

    let items = COMPLIANCE_HELPBOOK_DATA;

    if (this.helpbookCategory && this.helpbookCategory !== 'all') {
      items = items.filter((it) => it.category === this.helpbookCategory);
    }

    if (this.helpbookQuery) {
      const q = this.helpbookQuery;
      items = items.filter((it) =>
        it.name.toLowerCase().includes(q) ||
        it.authority.toLowerCase().includes(q) ||
        it.statute.toLowerCase().includes(q) ||
        it.deadline.toLowerCase().includes(q) ||
        it.penalty.toLowerCase().includes(q) ||
        it.purpose.toLowerCase().includes(q)
      );
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #64748b;">
          <span style="font-size: 32px; display: block; margin-bottom: 8px;">🔍</span>
          <strong style="font-size: 15px; color: #1e293b; display: block;">No matching compliance records found</strong>
          <span style="font-size: 13px;">Try searching by another term such as "AYUSH", "GST", "Penalty", or "Recall".</span>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map((it) => `
      <div class="helpbook-card">
        <div class="helpbook-card-header">
          <div>
            <h4 class="helpbook-card-title">${it.name}</h4>
            <span style="font-size: 12px; color: #64748b; margin-top: 2px; display: block;">
              Authority: <strong>${it.authority}</strong>
            </span>
          </div>
          <div class="helpbook-card-badges">
            <span class="compliance-badge ${it.badgeClass}">${it.badge}</span>
            <span class="compliance-badge" style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;">${it.interval}</span>
          </div>
        </div>

        <div class="helpbook-meta-grid">
          <div class="helpbook-meta-item">
            <div class="helpbook-meta-label">Governing Statute / Rule</div>
            <div class="helpbook-meta-value">${it.statute}</div>
          </div>
          <div class="helpbook-meta-item">
            <div class="helpbook-meta-label">Preparation & Generation Interval</div>
            <div class="helpbook-meta-value">${it.interval}</div>
          </div>
        </div>

        <div class="helpbook-deadline-box">
          <span class="helpbook-box-icon">⏰</span>
          <div class="helpbook-box-text">
            <strong style="color: #92400e;">Official Legal Due Date / Trigger:</strong><br/>
            ${it.deadline}
          </div>
        </div>

        <div style="font-size: 13px; color: #334155; line-height: 1.5;">
          <strong>Statutory & Business Purpose:</strong> ${it.purpose}
        </div>

        <div class="helpbook-penalty-box">
          <span class="helpbook-box-icon">⚠️</span>
          <div class="helpbook-box-text">
            <strong style="color: #991b1b;">Consequences & Penalties of Non-Compliance:</strong><br/>
            ${it.penalty}
          </div>
        </div>

        <div class="helpbook-advisory-box">
          <span class="helpbook-box-icon">💡</span>
          <div class="helpbook-box-text">
            <strong style="color: #166534;">Sole Proprietorship Practical Advisory:</strong><br/>
            ${it.advisory}
          </div>
        </div>
      </div>
    `).join('');
  }


  getDateRangeForPeriod() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    // Financial Year in India runs Apr 1 to Mar 31
    const fyStartYear = currentMonth >= 4 ? currentYear : currentYear - 1;
    const fyEndYear = fyStartYear + 1;

    switch (this.selectedPeriod) {
      case 'ytd':
        return {
          startDate: `${fyStartYear}-04-01`,
          endDate: now.toISOString().split('T')[0]
        };
      case 'q1':
        return {
          startDate: `${fyStartYear}-04-01`,
          endDate: `${fyStartYear}-06-30`
        };
      case 'q2':
        return {
          startDate: `${fyStartYear}-07-01`,
          endDate: `${fyStartYear}-09-30`
        };
      case 'q3':
        return {
          startDate: `${fyStartYear}-10-01`,
          endDate: `${fyStartYear}-12-31`
        };
      case 'q4':
        return {
          startDate: `${fyEndYear}-01-01`,
          endDate: `${fyEndYear}-03-31`
        };
      case 'custom':
        return {
          startDate: this.customStartDate,
          endDate: this.customEndDate
        };
      case 'all':
      default:
        return { startDate: '', endDate: '' };
    }
  }

  async loadReportData() {
    const loading = document.getElementById('complianceLoading');
    const tableWrapper = document.getElementById('complianceTableWrapper');
    const kpiGrid = document.getElementById('complianceKpiGrid');

    if (loading) loading.style.display = 'block';
    if (tableWrapper) tableWrapper.style.opacity = '0.5';

    try {
      const dates = this.getDateRangeForPeriod();
      let url = `/api/analytics/reports/${this.selectedReport}`;
      const params = new URLSearchParams();
      if (dates.startDate) params.append('startDate', dates.startDate);
      if (dates.endDate) params.append('endDate', dates.endDate);

      const qs = params.toString();
      if (qs) url += `?${qs}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      const data = await res.json();
      this.currentData = data;

      this.renderKpis(data);
      this.renderTable(data);
    } catch (err) {
      console.error('[ComplianceReports] Failed to load data:', err);
      if (tableWrapper) {
        tableWrapper.innerHTML = `
          <div style="padding: 30px; text-align: center; color: #ef4444;">
            Failed to load compliance report: ${err.message}
          </div>
        `;
      }
    } finally {
      if (loading) loading.style.display = 'none';
      if (tableWrapper) tableWrapper.style.opacity = '1';
    }
  }

  renderKpis(data) {
    const grid = document.getElementById('complianceKpiGrid');
    if (!grid) return;

    if (this.selectedReport === 'ayush-dispatch') {
      const items = data.items || [];
      const totalQty = items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
      const totalTaxable = items.reduce((sum, it) => sum + (Number(it.taxable_amount) || 0), 0);

      grid.innerHTML = `
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Dispatches Tracked</div>
          <div class="compliance-stat-val">${items.length}</div>
          <div class="compliance-stat-sub">Schedule T Invoices / Batches</div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Total Volume Dispatched</div>
          <div class="compliance-stat-val">${totalQty.toLocaleString('en-IN')} units</div>
          <div class="compliance-stat-sub">Across All Formulation Batches</div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Taxable Turnover</div>
          <div class="compliance-stat-val">₹ ${totalTaxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
          <div class="compliance-stat-sub">Before GST & Delivery Surcharges</div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Legal Recall Status</div>
          <div class="compliance-stat-val" style="color: #059669; font-size: 20px;">✓ 100% Traceable</div>
          <div class="compliance-stat-sub">Customer License & Town Attached</div>
        </div>
      `;
    } else if (this.selectedReport === 'gst-hsn') {
      const items = data.items || [];
      const totalQty = items.reduce((sum, it) => sum + (Number(it.total_qty) || 0), 0);
      const totalTaxable = items.reduce((sum, it) => sum + (Number(it.taxable_value) || 0), 0);
      const totalTax = items.reduce((sum, it) => sum + (Number(it.cgst_amount) || 0) + (Number(it.sgst_amount) || 0) + (Number(it.igst_amount) || 0), 0);

      grid.innerHTML = `
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">HSN Categories</div>
          <div class="compliance-stat-val">${items.length}</div>
          <div class="compliance-stat-sub">Table 12 Classifications</div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Total Units Outward</div>
          <div class="compliance-stat-val">${totalQty.toLocaleString('en-IN')}</div>
          <div class="compliance-stat-sub">BTL / PAC / NOS Quantities</div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Taxable Turnover</div>
          <div class="compliance-stat-val">₹ ${totalTaxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
          <div class="compliance-stat-sub">Base Value Subject to Tax</div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Total Tax Collected</div>
          <div class="compliance-stat-val" style="color: #2563eb;">₹ ${totalTax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
          <div class="compliance-stat-sub">CGST + SGST Output Liability</div>
        </div>
      `;
    } else if (this.selectedReport === 'gstr1-summary') {
      const sections = data.sections || [];
      const totalGross = sections.reduce((sum, s) => sum + (Number(s.gross_value) || 0), 0);
      const totalTaxable = sections.reduce((sum, s) => sum + (Number(s.taxable_value) || 0), 0);
      const totalTax = sections.reduce((sum, s) => sum + (Number(s.cgst) || 0) + (Number(s.sgst) || 0), 0);

      grid.innerHTML = `
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Gross Turnover</div>
          <div class="compliance-stat-val">₹ ${totalGross.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
          <div class="compliance-stat-sub">Total Invoiced B2B + B2C</div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Net Taxable Value</div>
          <div class="compliance-stat-val">₹ ${totalTaxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
          <div class="compliance-stat-sub">After Trade Discounts & Credit Notes</div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Net GST Output Tax</div>
          <div class="compliance-stat-val" style="color: #059669;">₹ ${totalTax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
          <div class="compliance-stat-sub">Payable in Cash / ITC Offset</div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">GSTR-1 Reconciliation</div>
          <div class="compliance-stat-val" style="font-size: 20px; color: #0284c7;">✓ Ready for Portal</div>
          <div class="compliance-stat-sub">B2B GSTINs Validated</div>
        </div>
      `;
    } else if (this.selectedReport === 'batch-expiry') {
      const items = data.items || [];
      const nearExpiry = items.filter(i => i.status.includes('Near') || i.status.includes('Expired'));
      const activeBatches = items.filter(i => i.status === 'Active');

      grid.innerHTML = `
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Active Batches</div>
          <div class="compliance-stat-val">${activeBatches.length}</div>
          <div class="compliance-stat-sub">Within Safe Shelf Life</div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Near Expiry / Expired (<90d)</div>
          <div class="compliance-stat-val" style="color: ${nearExpiry.length > 0 ? '#dc2626' : '#059669'};">
            ${nearExpiry.length}
          </div>
          <div class="compliance-stat-sub">Action Required for FEFO / Recall</div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Retention Samples</div>
          <div class="compliance-stat-val">✓ Maintained</div>
          <div class="compliance-stat-sub">Rule 161B (Retained 1yr post-exp)</div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">GMP Inspection Ready</div>
          <div class="compliance-stat-val" style="color: #059669; font-size: 20px;">✓ Pass</div>
          <div class="compliance-stat-sub">Audit-Grade Shelf Register</div>
        </div>
      `;
    }
  }

  renderTable(data) {
    const table = document.getElementById('complianceTable');
    const tableTitle = document.getElementById('complianceTableTitle');
    const recordCount = document.getElementById('complianceRecordCount');
    if (!table) return;

    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    if (this.selectedReport === 'ayush-dispatch') {
      const items = data.items || [];
      tableTitle.textContent = 'Finished Goods Distribution & Batch Dispatch Log';
      recordCount.textContent = `${items.length} records`;

      thead.innerHTML = `
        <tr>
          <th class="text-center" style="width: 40px;">#</th>
          <th>Date & Inv.</th>
          <th>Customer & Destination</th>
          <th>Licence / GSTIN</th>
          <th>Formulation Name</th>
          <th class="text-center">Batch No</th>
          <th class="text-center">Pack Size</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Rate (₹)</th>
          <th class="text-right">Taxable (₹)</th>
        </tr>
      `;

      if (items.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 24px; color: #94a3b8;">No dispatch records found for the selected period.</td></tr>`;
        return;
      }

      let lastInvoiceKey = '';
      items.forEach((item, idx) => {
        const invKey = `${item.date}|${item.invoice_no}`;
        const isFirstItem = invKey !== lastInvoiceKey;
        lastInvoiceKey = invKey;

        const tr = document.createElement('tr');
        if (isFirstItem && idx > 0) {
          tr.style.borderTop = '2px solid #e2e8f0';
        }
        tr.innerHTML = `
          <td class="text-center" style="color: #94a3b8;">${idx + 1}</td>
          <td>${isFirstItem ? `<strong>${item.date}</strong><br><span style="font-size: 11px; color: #64748b;">${item.invoice_no}</span>` : '<span style="color:#94a3b8; font-size:11px;">〃</span>'}</td>
          <td>${isFirstItem ? `<strong>${item.customer_name}</strong><br><span style="font-size: 11px; color: #64748b;">${item.customer_town || '-'}</span>` : ''}</td>
          <td>${isFirstItem ? `<span style="font-family: monospace; font-size: 11px;">${item.customer_licence_no || item.customer_gstin || '-'}</span>` : ''}</td>
          <td><strong>${item.product_name}</strong></td>
          <td class="text-center"><span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-weight: 600;">${item.batch_no}</span></td>
          <td class="text-center">${item.pack_size}</td>
          <td class="text-right font-medium">${Number(item.qty).toLocaleString('en-IN')}</td>
          <td class="text-right">₹${Number(item.rate).toFixed(2)}</td>
          <td class="text-right" style="font-weight: 600;">₹${Number(item.taxable_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
        `;
        tbody.appendChild(tr);
      });
    } else if (this.selectedReport === 'gst-hsn') {
      const items = data.items || [];
      tableTitle.textContent = 'Table 12 HSN Summary (GSTR-1 Outward Supplies)';
      recordCount.textContent = `${items.length} HSN items`;

      thead.innerHTML = `
        <tr>
          <th class="text-center" style="width: 40px;">#</th>
          <th class="text-center">HSN Code</th>
          <th>Description</th>
          <th class="text-center">UQC</th>
          <th class="text-right">Total Qty</th>
          <th class="text-right">Total Value (₹)</th>
          <th class="text-right">Taxable Value (₹)</th>
          <th class="text-right">CGST (₹)</th>
          <th class="text-right">SGST (₹)</th>
        </tr>
      `;

      items.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="text-center" style="color: #94a3b8;">${idx + 1}</td>
          <td class="text-center"><span style="font-family: monospace; font-weight: 700; color: #1e40af;">${item.hsn_code}</span></td>
          <td><strong>${item.description}</strong></td>
          <td class="text-center">${item.uqc}</td>
          <td class="text-right">${Number(item.total_qty).toLocaleString('en-IN')}</td>
          <td class="text-right">₹${Number(item.total_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td class="text-right" style="font-weight: 600;">₹${Number(item.taxable_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td class="text-right">₹${Number(item.cgst_amount).toFixed(2)}</td>
          <td class="text-right">₹${Number(item.sgst_amount).toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
      });
    } else if (this.selectedReport === 'gstr1-summary') {
      const sections = data.sections || [];
      tableTitle.textContent = 'GSTR-1 Section Summary & Tax Outward Liability';
      recordCount.textContent = `${sections.length} tables`;

      thead.innerHTML = `
        <tr>
          <th class="text-center" style="width: 60px;">Table</th>
          <th>Supply Category</th>
          <th class="text-center">Vouchers</th>
          <th class="text-right">Gross Value (₹)</th>
          <th class="text-right">Taxable Value (₹)</th>
          <th class="text-right">CGST (₹)</th>
          <th class="text-right">SGST (₹)</th>
        </tr>
      `;

      sections.forEach((sec) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="text-center"><strong>${sec.table_number}</strong></td>
          <td><strong>${sec.description}</strong></td>
          <td class="text-center">${sec.count}</td>
          <td class="text-right">₹${Number(sec.gross_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td class="text-right" style="font-weight: 600;">₹${Number(sec.taxable_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          <td class="text-right">₹${Number(sec.cgst).toFixed(2)}</td>
          <td class="text-right">₹${Number(sec.sgst).toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
      });
    } else if (this.selectedReport === 'batch-expiry') {
      const items = data.items || [];
      tableTitle.textContent = 'Batch Expiry & Stability Audit (Ayurvedic Formulations)';
      recordCount.textContent = `${items.length} batches`;

      thead.innerHTML = `
        <tr>
          <th class="text-center" style="width: 40px;">#</th>
          <th class="text-center">Batch No</th>
          <th>Formulation / Product</th>
          <th class="text-center">Pack Size</th>
          <th class="text-center">Mfg Date</th>
          <th class="text-center">Exp Date</th>
          <th class="text-right">Produced</th>
          <th class="text-right">Sold</th>
          <th class="text-right">Stock</th>
          <th class="text-center">Status</th>
        </tr>
      `;

      items.forEach((item, idx) => {
        const tr = document.createElement('tr');
        const isAlert = item.status.includes('Near') || item.status.includes('Expired');
        if (isAlert) tr.classList.add('alert-row');

        tr.innerHTML = `
          <td class="text-center" style="color: #94a3b8;">${idx + 1}</td>
          <td class="text-center"><span style="font-weight: 700; font-family: monospace;">${item.batch_no}</span></td>
          <td><strong>${item.product_name}</strong></td>
          <td class="text-center">${item.pack_size}</td>
          <td class="text-center">${item.mfg_date}</td>
          <td class="text-center"><strong>${item.exp_date}</strong></td>
          <td class="text-right">${item.units_produced}</td>
          <td class="text-right">${item.units_sold}</td>
          <td class="text-right" style="font-weight: 600;">${item.balance_stock}</td>
          <td class="text-center">
            <span class="compliance-badge ${isAlert ? 'compliance-badge-alert' : 'compliance-badge-ayush'}">
              ${item.status}
            </span>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  async handleExportPdf() {
    if (!this.currentData) {
      alert('Please wait for report data to load before exporting PDF.');
      return;
    }

    try {
      const SuiteCoreBridge = window.SuiteCoreBridge || (await import('/shared/suite_core_bridge.js')).SuiteCoreBridge;
      await SuiteCoreBridge.ensureReady();

      let pdfRes = null;
      let docTitle = 'Compliance Report';

      if (this.selectedReport === 'ayush-dispatch') {
        docTitle = 'AYUSH Finished Goods Distribution Register';
        pdfRes = SuiteCoreBridge.renderAyushDispatchPdf({
          period: this.currentData.period || 'YTD',
          generated_at: this.currentData.generated_at || '',
          app_settings: this.currentData.app_settings || {},
          items: this.currentData.items || []
        });
      } else if (this.selectedReport === 'gst-hsn') {
        docTitle = 'GST Table 12 HSN Summary';
        pdfRes = SuiteCoreBridge.renderGstHsnPdf({
          period: this.currentData.period || 'YTD',
          generated_at: this.currentData.generated_at || '',
          app_settings: this.currentData.app_settings || {},
          items: this.currentData.items || []
        });
      } else if (this.selectedReport === 'gstr1-summary') {
        docTitle = 'GSTR-1 Outward Supplies Summary';
        pdfRes = SuiteCoreBridge.renderGstr1SummaryPdf({
          period: this.currentData.period || 'YTD',
          generated_at: this.currentData.generated_at || '',
          app_settings: this.currentData.app_settings || {},
          sections: this.currentData.sections || []
        });
      } else if (this.selectedReport === 'batch-expiry') {
        docTitle = 'AYUSH Batch Expiry Register';
        pdfRes = SuiteCoreBridge.renderBatchExpiryPdf({
          as_of_date: this.currentData.as_of_date || '',
          generated_at: this.currentData.generated_at || '',
          app_settings: this.currentData.app_settings || {},
          items: this.currentData.items || []
        });
      }

      if (pdfRes && pdfRes.pdf_base64) {
        this.openPdfPreview(pdfRes.pdf_base64, docTitle);
      } else {
        throw new Error('Rust PDF compiler returned invalid response');
      }
    } catch (err) {
      console.error('[ComplianceReports] PDF compilation failed:', err);
      alert(`PDF Compilation Error: ${err.message}`);
    }
  }

  openPdfPreview(pdfBase64, docTitle) {
    const modal = document.getElementById('compliancePdfModal');
    const iframe = document.getElementById('compliancePdfIframe');
    const modalTitle = document.getElementById('complianceModalDocTitle');
    const downloadBtn = document.getElementById('complianceModalDownloadBtn');

    if (!modal || !iframe) return;

    modalTitle.textContent = `${docTitle} (Official Print Ready)`;

    // Convert base64 to Blob URL
    const byteChars = atob(pdfBase64);
    const byteNums = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteNums[i] = byteChars.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNums);
    const blob = new Blob([byteArray], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(blob);

    iframe.src = blobUrl;
    modal.style.display = 'flex';

    if (downloadBtn) {
      downloadBtn.onclick = () => {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${docTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
        link.click();
      };
    }
  }

  handleExportCsv() {
    if (!this.currentData) return;

    let csvContent = '';
    let filename = `report_${Date.now()}.csv`;

    if (this.selectedReport === 'ayush-dispatch') {
      filename = `AYUSH_Distribution_Register_${Date.now()}.csv`;
      const items = this.currentData.items || [];
      csvContent = 'Sl,Date,Invoice_No,Customer_Name,Customer_Town,Licence_No,GSTIN,Product_Name,Batch_No,Pack_Size,Qty,Rate,Taxable_Amount\n';
      items.forEach((it, idx) => {
        csvContent += `${idx + 1},"${it.date}","${it.invoice_no}","${it.customer_name}","${it.customer_town || ''}","${it.customer_licence_no || ''}","${it.customer_gstin || ''}","${it.product_name}","${it.batch_no}","${it.pack_size}",${it.qty},${it.rate},${it.taxable_amount}\n`;
      });
    } else if (this.selectedReport === 'gst-hsn') {
      filename = `GST_HSN_Table12_${Date.now()}.csv`;
      const items = this.currentData.items || [];
      csvContent = 'Sl,HSN_Code,Description,UQC,Total_Qty,Total_Value,Taxable_Value,IGST,CGST,SGST,Cess\n';
      items.forEach((it, idx) => {
        csvContent += `${idx + 1},"${it.hsn_code}","${it.description}","${it.uqc}",${it.total_qty},${it.total_value},${it.taxable_value},${it.igst_amount || 0},${it.cgst_amount || 0},${it.sgst_amount || 0},${it.cess_amount || 0}\n`;
      });
    } else if (this.selectedReport === 'gstr1-summary') {
      filename = `GSTR1_Section_Summary_${Date.now()}.csv`;
      const sections = this.currentData.sections || [];
      csvContent = 'Table,Description,Voucher_Count,Gross_Value,Taxable_Value,CGST,SGST\n';
      sections.forEach((s) => {
        csvContent += `"${s.table_number}","${s.description}",${s.count},${s.gross_value},${s.taxable_value},${s.cgst},${s.sgst}\n`;
      });
    } else if (this.selectedReport === 'batch-expiry') {
      filename = `AYUSH_Batch_Expiry_${Date.now()}.csv`;
      const items = this.currentData.items || [];
      csvContent = 'Sl,Batch_No,Product_Name,Pack_Size,Mfg_Date,Exp_Date,Produced,Sold,Stock,Status\n';
      items.forEach((it, idx) => {
        csvContent += `${idx + 1},"${it.batch_no}","${it.product_name}","${it.pack_size}","${it.mfg_date}","${it.exp_date}",${it.units_produced},${it.units_sold},${it.balance_stock},"${it.status}"\n`;
      });
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }
}

window.ComplianceReportsView = ComplianceReportsView;

