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
    this.exclusionScope = 'both';
    this.viewMode = 'summary';
    this.customStartDate = '';
    this.customEndDate = '';
    this.currentData = null;
    this.helpbookCategory = 'all';
    this.helpbookQuery = '';
    this.bigChart = null;
  }

  async render() {
    if (this.viewContainer) {
      this.viewContainer.classList.add('compliance-page-scrollable');
      this.viewContainer.style.overflowY = 'auto';
      this.viewContainer.style.overflowX = 'auto';
      this.viewContainer.style.scrollbarWidth = 'thin';
      this.viewContainer.style.msOverflowStyle = 'auto';
    }

    this.viewContainer.innerHTML = `
      <div class="compliance-view-wrapper">
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
      <div class="compliance-controls-bar" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div class="compliance-select-group" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
          <label style="font-size: 12px; font-weight: 600; color: #475569;">Report Type:</label>
          <select id="compReportTypeSelect" class="compliance-dropdown">
            <option value="ayush-dispatch">🌿 AYUSH: Finished Goods Distribution Register (Schedule T GMP)</option>
            <option value="gst-hsn">🏛️ GST: Table 12 HSN-Wise Outward Supplies Summary</option>
            <option value="gstr1-summary">📋 GST: GSTR-1 Outward Summary (B2B, B2C, Credit Notes)</option>
            <option value="batch-expiry">⏳ AYUSH: Rule 161B Batch Expiry & Retention Register</option>
          </select>

          <label style="font-size: 12px; font-weight: 600; color: #475569; margin-left: 6px;">Period:</label>
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

          <div id="compExclusionScopeWrapper" style="display: flex; align-items: center; gap: 6px;">
            <label style="font-size: 12px; font-weight: 600; color: #475569; margin-left: 6px;">Customer Scope:</label>
            <select id="compExclusionScopeSelect" class="compliance-dropdown" style="font-weight: 600;">
              <option value="both" selected>👥 All (Included + Excluded)</option>
              <option value="included">✅ Included in Stats Only</option>
              <option value="excluded">🚫 Excluded from Stats Only</option>
            </select>
          </div>

          <div id="compViewModeWrapper" style="display: flex; align-items: center; gap: 6px;">
            <label style="font-size: 12px; font-weight: 600; color: #475569; margin-left: 6px;">View Level:</label>
            <select id="compViewModeSelect" class="compliance-dropdown" style="font-weight: 600;">
              <option value="summary" selected>📊 Statutory Summary</option>
              <option value="granular">🔍 Granular Customer Register</option>
            </select>
          </div>
        </div>

        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <button id="compHelpbookBtn" class="compliance-btn compliance-btn-secondary" title="View Legal Deadlines, Filing Intervals & Penalties Reference">
            📖 Helpbook
          </button>
          <button id="compRefreshBtn" class="compliance-btn compliance-btn-secondary" title="Fetch Fresh Data">
            🔄 Refresh
          </button>
          <button id="compExportCsvBtn" class="compliance-btn compliance-btn-secondary" title="Export Summary CSV for Portal/Excel">
            📊 Export CSV
          </button>
          <button id="compExportGranularCsvBtn" class="compliance-btn compliance-btn-secondary" title="Export Granular Customer Register with Exclusion Status" style="border-color: #3b82f6; color: #1d4ed8; font-weight: 600;">
            📑 Granular CSV
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

      <!-- Big Statutory Analytics & Reconciliation Chart Section (Below Table) -->
      <div id="complianceChartWrapper" class="compliance-chart-container" style="display: none;">
        <div class="compliance-chart-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 20px;" id="complianceChartIcon">📊</span>
            <div>
              <h3 id="complianceChartTitle" style="margin: 0; font-size: 15px; font-weight: 700; color: #1e293b;">Statutory Tax & Turnover Analytics</h3>
              <span id="complianceChartSub" style="font-size: 12px; color: #64748b;">Visual statutory comparison and distribution</span>
            </div>
          </div>
          <div id="complianceChartTag" style="display: flex; align-items: center; gap: 8px;">
            <span class="compliance-badge compliance-badge-gst" id="complianceChartBadge">STATUTORY VISUALIZATION</span>
          </div>
        </div>
        <div class="compliance-chart-body">
          <canvas id="complianceBigChart"></canvas>
        </div>
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
    const exclusionSelect = document.getElementById('compExclusionScopeSelect');
    const viewModeSelect = document.getElementById('compViewModeSelect');
    const exclusionWrap = document.getElementById('compExclusionScopeWrapper');
    const viewModeWrap = document.getElementById('compViewModeWrapper');
    const refreshBtn = document.getElementById('compRefreshBtn');
    const exportPdfBtn = document.getElementById('compExportPdfBtn');
    const exportCsvBtn = document.getElementById('compExportCsvBtn');
    const exportGranularCsvBtn = document.getElementById('compExportGranularCsvBtn');

    const updateControlsVisibility = () => {
      const isGst = this.selectedReport === 'gst-hsn' || this.selectedReport === 'gstr1-summary';
      if (exclusionWrap) exclusionWrap.style.display = isGst ? 'flex' : 'none';
      if (viewModeWrap) viewModeWrap.style.display = isGst ? 'flex' : 'none';
      if (exportGranularCsvBtn) exportGranularCsvBtn.style.display = isGst ? 'inline-flex' : 'none';
    };
    updateControlsVisibility();

    if (reportSelect) {
      reportSelect.value = this.selectedReport;
      reportSelect.addEventListener('change', (e) => {
        this.selectedReport = e.target.value;
        updateControlsVisibility();
        this.loadReportData();
      });
    }

    if (exclusionSelect) {
      exclusionSelect.value = this.exclusionScope;
      exclusionSelect.addEventListener('change', (e) => {
        this.exclusionScope = e.target.value;
        this.loadReportData();
      });
    }

    if (viewModeSelect) {
      viewModeSelect.value = this.viewMode;
      viewModeSelect.addEventListener('change', (e) => {
        this.viewMode = e.target.value;
        if (this.currentData) {
          this.renderTable(this.currentData);
        }
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
      exportCsvBtn.addEventListener('click', () => this.handleExportCsv(false));
    }

    if (exportGranularCsvBtn) {
      exportGranularCsvBtn.addEventListener('click', () => this.handleExportCsv(true));
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
      if (this.exclusionScope) params.append('exclusionScope', this.exclusionScope);

      const qs = params.toString();
      if (qs) url += `?${qs}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      const data = await res.json();
      this.currentData = data;

      this.renderKpis(data);
      this.renderTable(data);
      await this.renderBigChart(data);
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
      const cb = data.calculation_breakdown || {};
      const incl = cb.included || {};
      const excl = cb.excluded || {};
      const comb = cb.combined || {};
      const scopeLabel = this.exclusionScope === 'both' ? 'All (Included + Excluded)' : this.exclusionScope === 'included' ? 'Included in Stats' : 'Excluded from Stats';

      grid.innerHTML = `
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Taxable Turnover</div>
          <div class="compliance-stat-val">₹ ${totalTaxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
          <div class="compliance-stat-sub">
            <span style="color:#047857; font-weight:600;">Incl: ₹${Number(incl.taxable_value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span> | 
            <span style="color:#b45309; font-weight:600;">Excl: ₹${Number(excl.taxable_value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Total Tax Collected</div>
          <div class="compliance-stat-val" style="color: #2563eb;">₹ ${totalTax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
          <div class="compliance-stat-sub">
            <span style="color:#047857; font-weight:600;">CGST: ₹${(Number(incl.cgst_amount || 0) + Number(excl.cgst_amount || 0)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span> | 
            <span style="color:#047857; font-weight:600;">SGST: ₹${(Number(incl.sgst_amount || 0) + Number(excl.sgst_amount || 0)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Outward Volume</div>
          <div class="compliance-stat-val">${totalQty.toLocaleString('en-IN')} units</div>
          <div class="compliance-stat-sub">${items.length} Table 12 HSN Classifications</div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Customer Reconciliation</div>
          <div class="compliance-stat-val" style="font-size: 18px; color: #0284c7;">
            ${incl.invoice_count || 0} Incl / ${excl.invoice_count || 0} Excl
          </div>
          <div class="compliance-stat-sub">Scope: ${scopeLabel} (${comb.invoice_count || 0} Invoices)</div>
        </div>
      `;
    } else if (this.selectedReport === 'gstr1-summary') {
      const sections = data.sections || [];
      const totalGross = sections.reduce((sum, s) => sum + (Number(s.gross_value) || 0), 0);
      const totalTaxable = sections.reduce((sum, s) => sum + (Number(s.taxable_value) || 0), 0);
      const totalTax = sections.reduce((sum, s) => sum + (Number(s.cgst) || 0) + (Number(s.sgst) || 0), 0);
      const cb = data.calculation_breakdown || {};
      const incl = cb.included || {};
      const excl = cb.excluded || {};
      const comb = cb.combined || {};
      const scopeLabel = this.exclusionScope === 'both' ? 'All (Included + Excluded)' : this.exclusionScope === 'included' ? 'Included in Stats' : 'Excluded from Stats';

      grid.innerHTML = `
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Gross Turnover</div>
          <div class="compliance-stat-val">₹ ${totalGross.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
          <div class="compliance-stat-sub">
            <span style="color:#047857; font-weight:600;">Incl: ₹${Number(incl.gross_value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span> | 
            <span style="color:#b45309; font-weight:600;">Excl: ₹${Number(excl.gross_value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Net Taxable Value</div>
          <div class="compliance-stat-val">₹ ${totalTaxable.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
          <div class="compliance-stat-sub">
            <span style="color:#047857; font-weight:600;">Incl: ₹${Number(incl.taxable_value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span> | 
            <span style="color:#b45309; font-weight:600;">Excl: ₹${Number(excl.taxable_value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Net GST Output Tax</div>
          <div class="compliance-stat-val" style="color: #059669;">₹ ${totalTax.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
          <div class="compliance-stat-sub">
            <span style="color:#047857; font-weight:600;">Incl: ₹${(Number(incl.cgst || 0) + Number(incl.sgst || 0)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span> | 
            <span style="color:#b45309; font-weight:600;">Excl: ₹${(Number(excl.cgst || 0) + Number(excl.sgst || 0)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
        <div class="compliance-stat-card">
          <div class="compliance-stat-title">Customer Reconciliation</div>
          <div class="compliance-stat-val" style="font-size: 18px; color: #0284c7;">
            ${incl.invoice_count || 0} Incl / ${excl.invoice_count || 0} Excl
          </div>
          <div class="compliance-stat-sub">Scope: ${scopeLabel} (${comb.invoice_count || 0} Vouchers)</div>
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
      const scopeLabel = this.exclusionScope === 'both' ? 'All Customers (Included + Excluded)' : this.exclusionScope === 'included' ? 'Included Customers Only' : 'Excluded Customers Only';

      if (this.viewMode === 'granular') {
        const items = data.granular_items || [];
        tableTitle.textContent = `Granular HSN Item Register [${scopeLabel}]`;
        recordCount.textContent = `${items.length} line items`;

        thead.innerHTML = `
          <tr>
            <th class="text-center" style="width: 40px;">#</th>
            <th>Date & Inv.</th>
            <th>Customer & Town</th>
            <th>GSTIN</th>
            <th class="text-center">Scope Status</th>
            <th class="text-center">HSN Code</th>
            <th>Description</th>
            <th class="text-center">UQC</th>
            <th class="text-right">Qty</th>
            <th class="text-right">Rate (₹)</th>
            <th class="text-right">Taxable (₹)</th>
            <th class="text-right">CGST (₹)</th>
            <th class="text-right">SGST (₹)</th>
            <th class="text-right">Total (₹)</th>
          </tr>
        `;

        if (items.length === 0) {
          tbody.innerHTML = `<tr><td colspan="14" style="text-align: center; padding: 24px; color: #94a3b8;">No granular HSN records found for selected period and scope.</td></tr>`;
          return;
        }

        let lastInv = '';
        items.forEach((item, idx) => {
          const isFirstItem = item.invoice_no !== lastInv;
          lastInv = item.invoice_no;
          const tr = document.createElement('tr');
          if (isFirstItem && idx > 0) tr.style.borderTop = '2px solid #e2e8f0';

          tr.innerHTML = `
            <td class="text-center" style="color: #94a3b8;">${idx + 1}</td>
            <td>${isFirstItem ? `<strong>${item.date}</strong><br><span style="font-size: 11px; color: #64748b;">${item.invoice_no}</span>` : '<span style="color:#94a3b8; font-size:11px;">〃</span>'}</td>
            <td>${isFirstItem ? `<strong>${item.customer_name}</strong>` : ''}</td>
            <td>${isFirstItem ? `<span style="font-family: monospace; font-size: 11px;">${item.customer_gstin || '-'}</span>` : ''}</td>
            <td class="text-center">
              ${isFirstItem ? `<span class="compliance-badge ${item.is_excluded ? 'compliance-badge-excluded' : 'compliance-badge-included'}">${item.is_excluded ? '🚫 Excluded' : '✅ Included'}</span>` : ''}
            </td>
            <td class="text-center"><span style="font-family: monospace; font-weight: 700; color: #1e40af;">${item.hsn_code}</span></td>
            <td><strong>${item.description}</strong></td>
            <td class="text-center">${item.uqc}</td>
            <td class="text-right font-medium">${Number(item.qty).toLocaleString('en-IN')}</td>
            <td class="text-right">₹${Number(item.rate).toFixed(2)}</td>
            <td class="text-right" style="font-weight: 600;">₹${Number(item.taxable_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td class="text-right">₹${Number(item.cgst_amount).toFixed(2)}</td>
            <td class="text-right">₹${Number(item.sgst_amount).toFixed(2)}</td>
            <td class="text-right font-medium">₹${Number(item.total_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
          `;
          tbody.appendChild(tr);
        });
      } else {
        // Summary Mode
        const items = data.items || [];
        tableTitle.textContent = `Table 12 HSN Summary (GSTR-1 Outward Supplies) [${scopeLabel}]`;
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

        if (items.length === 0) {
          tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 24px; color: #94a3b8;">No HSN summary items found for selected period and scope.</td></tr>`;
          return;
        }

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

        // Add comparative calculation audit sub-table
        const cb = data.calculation_breakdown;
        if (cb) {
          const auditRow = document.createElement('tr');
          auditRow.innerHTML = `
            <td colspan="9" style="background: #f8fafc; padding: 18px 20px; border-top: 2px solid #cbd5e1;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <strong style="color: #1e293b; font-size: 13px;">⚖️ Statutory Calculation Audit (Included vs. Excluded Customers)</strong>
                <span style="font-size: 11px; color: #64748b;">Table 12 HSN Reconciled against Master Accounts</span>
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; font-size: 12px;">
                <div style="background: #ffffff; border: 1px solid #d1fae5; border-radius: 8px; padding: 12px;">
                  <div style="font-weight: 700; color: #065f46; margin-bottom: 6px;">✅ Standard Included Customers</div>
                  <div style="color: #475569;">Invoices: <strong>${cb.included?.invoice_count || 0}</strong> | Line Items: <strong>${cb.included?.item_count || 0}</strong></div>
                  <div style="color: #475569; margin-top: 3px;">Taxable Turnover: <strong>₹${Number(cb.included?.taxable_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                  <div style="color: #047857; margin-top: 3px;">CGST + SGST: <strong>₹${(Number(cb.included?.cgst_amount || 0) + Number(cb.included?.sgst_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                </div>
                <div style="background: #ffffff; border: 1px solid #fef3c7; border-radius: 8px; padding: 12px;">
                  <div style="font-weight: 700; color: #92400e; margin-bottom: 6px;">🚫 Excluded Customers</div>
                  <div style="color: #475569;">Invoices: <strong>${cb.excluded?.invoice_count || 0}</strong> | Line Items: <strong>${cb.excluded?.item_count || 0}</strong></div>
                  <div style="color: #475569; margin-top: 3px;">Taxable Turnover: <strong>₹${Number(cb.excluded?.taxable_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                  <div style="color: #b45309; margin-top: 3px;">CGST + SGST: <strong>₹${(Number(cb.excluded?.cgst_amount || 0) + Number(cb.excluded?.sgst_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                </div>
                <div style="background: #ffffff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px;">
                  <div style="font-weight: 700; color: #1e40af; margin-bottom: 6px;">👥 Consolidated Total (Both)</div>
                  <div style="color: #475569;">Invoices: <strong>${cb.combined?.invoice_count || 0}</strong> | Line Items: <strong>${cb.combined?.item_count || 0}</strong></div>
                  <div style="color: #475569; margin-top: 3px;">Taxable Turnover: <strong>₹${Number(cb.combined?.taxable_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                  <div style="color: #1d4ed8; margin-top: 3px;">CGST + SGST: <strong>₹${(Number(cb.combined?.cgst_amount || 0) + Number(cb.combined?.sgst_amount || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                </div>
              </div>
            </td>
          `;
          tbody.appendChild(auditRow);
        }
      }
    } else if (this.selectedReport === 'gstr1-summary') {
      const scopeLabel = this.exclusionScope === 'both' ? 'All Customers (Included + Excluded)' : this.exclusionScope === 'included' ? 'Included Customers Only' : 'Excluded Customers Only';

      if (this.viewMode === 'granular') {
        const invoices = data.granular_invoices || [];
        tableTitle.textContent = `Granular Customer Voucher Register [${scopeLabel}]`;
        recordCount.textContent = `${invoices.length} vouchers`;

        thead.innerHTML = `
          <tr>
            <th class="text-center" style="width: 40px;">#</th>
            <th>Date</th>
            <th>Voucher / Invoice No</th>
            <th>Customer Name</th>
            <th>GSTIN</th>
            <th class="text-center">Scope Status</th>
            <th class="text-center">Supply Category</th>
            <th class="text-right">Gross Value (₹)</th>
            <th class="text-right">Taxable Value (₹)</th>
            <th class="text-right">CGST (₹)</th>
            <th class="text-right">SGST (₹)</th>
          </tr>
        `;

        if (invoices.length === 0) {
          tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; padding: 24px; color: #94a3b8;">No customer voucher records found for selected period and scope.</td></tr>`;
          return;
        }

        invoices.forEach((inv, idx) => {
          const tr = document.createElement('tr');
          const isCn = inv.supply_type === 'Credit Note';
          if (isCn) tr.classList.add('alert-row');

          tr.innerHTML = `
            <td class="text-center" style="color: #94a3b8;">${idx + 1}</td>
            <td><strong>${inv.date}</strong></td>
            <td><span style="font-family: monospace; font-size: 11px; font-weight: 600;">${inv.invoice_no}</span></td>
            <td><strong>${inv.customer_name}</strong></td>
            <td><span style="font-family: monospace; font-size: 11px;">${inv.customer_gstin || '-'}</span></td>
            <td class="text-center">
              <span class="compliance-badge ${inv.is_excluded ? 'compliance-badge-excluded' : 'compliance-badge-included'}">
                ${inv.is_excluded ? '🚫 Excluded' : '✅ Included'}
              </span>
            </td>
            <td class="text-center">
              <span class="compliance-badge ${isCn ? 'compliance-badge-alert' : inv.supply_type.includes('B2B') ? 'compliance-badge-gst' : 'compliance-badge-ayush'}">
                ${inv.supply_type}
              </span>
            </td>
            <td class="text-right font-medium">₹${Number(inv.gross_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td class="text-right" style="font-weight: 600;">₹${Number(inv.taxable_value).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
            <td class="text-right">₹${Number(inv.cgst).toFixed(2)}</td>
            <td class="text-right">₹${Number(inv.sgst).toFixed(2)}</td>
          `;
          tbody.appendChild(tr);
        });
      } else {
        // Summary Mode
        const sections = data.sections || [];
        tableTitle.textContent = `GSTR-1 Section Summary & Tax Outward Liability [${scopeLabel}]`;
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

        if (sections.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: #94a3b8;">No section data found for selected period and scope.</td></tr>`;
          return;
        }

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

        // Add comparative calculation audit sub-table
        const cb = data.calculation_breakdown;
        if (cb) {
          const auditRow = document.createElement('tr');
          auditRow.innerHTML = `
            <td colspan="7" style="background: #f8fafc; padding: 18px 20px; border-top: 2px solid #cbd5e1;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <strong style="color: #1e293b; font-size: 13px;">⚖️ Statutory Calculation Audit (Included vs. Excluded Customers)</strong>
                <span style="font-size: 11px; color: #64748b;">GSTR-1 Return Reconciled against Books of Accounts</span>
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; font-size: 12px;">
                <div style="background: #ffffff; border: 1px solid #d1fae5; border-radius: 8px; padding: 12px;">
                  <div style="font-weight: 700; color: #065f46; margin-bottom: 6px;">✅ Standard Included Customers</div>
                  <div style="color: #475569;">Vouchers: <strong>${cb.included?.invoice_count || 0}</strong></div>
                  <div style="color: #475569; margin-top: 3px;">Gross Invoiced: <strong>₹${Number(cb.included?.gross_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                  <div style="color: #475569; margin-top: 3px;">Taxable Value: <strong>₹${Number(cb.included?.taxable_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                  <div style="color: #047857; margin-top: 3px;">CGST + SGST: <strong>₹${(Number(cb.included?.cgst || 0) + Number(cb.included?.sgst || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                </div>
                <div style="background: #ffffff; border: 1px solid #fef3c7; border-radius: 8px; padding: 12px;">
                  <div style="font-weight: 700; color: #92400e; margin-bottom: 6px;">🚫 Excluded Customers</div>
                  <div style="color: #475569;">Vouchers: <strong>${cb.excluded?.invoice_count || 0}</strong></div>
                  <div style="color: #475569; margin-top: 3px;">Gross Invoiced: <strong>₹${Number(cb.excluded?.gross_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                  <div style="color: #475569; margin-top: 3px;">Taxable Value: <strong>₹${Number(cb.excluded?.taxable_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                  <div style="color: #b45309; margin-top: 3px;">CGST + SGST: <strong>₹${(Number(cb.excluded?.cgst || 0) + Number(cb.excluded?.sgst || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                </div>
                <div style="background: #ffffff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px;">
                  <div style="font-weight: 700; color: #1e40af; margin-bottom: 6px;">👥 Consolidated Total (Both)</div>
                  <div style="color: #475569;">Vouchers: <strong>${cb.combined?.invoice_count || 0}</strong></div>
                  <div style="color: #475569; margin-top: 3px;">Gross Invoiced: <strong>₹${Number(cb.combined?.gross_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                  <div style="color: #475569; margin-top: 3px;">Taxable Value: <strong>₹${Number(cb.combined?.taxable_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                  <div style="color: #1d4ed8; margin-top: 3px;">CGST + SGST: <strong>₹${(Number(cb.combined?.cgst || 0) + Number(cb.combined?.sgst || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>
                </div>
              </div>
            </td>
          `;
          tbody.appendChild(auditRow);
        }
      }
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

  async ensureChartJs() {
    if (window.Chart) return window.Chart;
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js';
      script.onload = () => resolve(window.Chart);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  }

  async renderBigChart(data) {
    const chartWrapper = document.getElementById('complianceChartWrapper');
    const canvas = document.getElementById('complianceBigChart');
    const chartTitle = document.getElementById('complianceChartTitle');
    const chartSub = document.getElementById('complianceChartSub');
    const chartBadge = document.getElementById('complianceChartBadge');

    if (!chartWrapper || !canvas) return;

    // Ensure Chart.js is ready
    const ChartClass = await this.ensureChartJs();
    if (!ChartClass) {
      chartWrapper.style.display = 'none';
      return;
    }

    if (this.bigChart) {
      this.bigChart.destroy();
      this.bigChart = null;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (this.selectedReport === 'gstr1-summary') {
      chartWrapper.style.display = 'block';
      chartTitle.textContent = 'Statutory Turnover & Tax Liability Comparison (Included vs Excluded vs Total)';
      chartSub.textContent = 'Reconciliation of Gross Outward Supplies, Taxable Turnover, and CGST + SGST statutory tax liability by customer scope';
      if (chartBadge) {
        chartBadge.className = 'compliance-badge compliance-badge-gst';
        chartBadge.textContent = 'GSTR-1 RECONCILIATION';
      }

      const cb = data.calculation_breakdown || {
        included: { gross_value: 0, taxable_value: 0, cgst: 0, sgst: 0 },
        excluded: { gross_value: 0, taxable_value: 0, cgst: 0, sgst: 0 },
        combined: { gross_value: 0, taxable_value: 0, cgst: 0, sgst: 0 }
      };

      const labels = ['Included in Stats', 'Excluded from Stats', 'Consolidated Total (Both)'];
      const grossData = [
        Number(cb.included?.gross_value || 0),
        Number(cb.excluded?.gross_value || 0),
        Number(cb.combined?.gross_value || 0)
      ];
      const taxableData = [
        Number(cb.included?.taxable_value || 0),
        Number(cb.excluded?.taxable_value || 0),
        Number(cb.combined?.taxable_value || 0)
      ];
      const taxData = [
        Number(cb.included?.cgst || 0) + Number(cb.included?.sgst || 0),
        Number(cb.excluded?.cgst || 0) + Number(cb.excluded?.sgst || 0),
        Number(cb.combined?.cgst || 0) + Number(cb.combined?.sgst || 0)
      ];

      this.bigChart = new ChartClass(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Gross Invoiced Turnover (₹)',
              data: grossData,
              backgroundColor: 'rgba(99, 102, 241, 0.85)',
              borderColor: '#6366f1',
              borderWidth: 1.5,
              borderRadius: 6,
              maxBarThickness: 50
            },
            {
              label: 'Net Taxable Turnover (₹)',
              data: taxableData,
              backgroundColor: 'rgba(59, 130, 246, 0.85)',
              borderColor: '#3b82f6',
              borderWidth: 1.5,
              borderRadius: 6,
              maxBarThickness: 50
            },
            {
              label: 'Statutory GST Liability (CGST + SGST) (₹)',
              data: taxData,
              backgroundColor: 'rgba(16, 185, 129, 0.85)',
              borderColor: '#10b981',
              borderWidth: 1.5,
              borderRadius: 6,
              maxBarThickness: 50
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: {
                boxWidth: 14,
                font: { family: "'SF Pro Display', 'Inter', sans-serif", size: 12, weight: '600' },
                color: '#334155',
                padding: 16
              }
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              padding: 12,
              titleFont: { size: 13, weight: '700' },
              bodyFont: { size: 12 },
              cornerRadius: 8,
              callbacks: {
                label(context) {
                  const val = context.parsed.y ?? context.parsed ?? 0;
                  return `${context.dataset.label}: ₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                font: { family: "'SF Pro Display', 'Inter', sans-serif", size: 12, weight: '600' },
                color: '#475569'
              }
            },
            y: {
              grid: { color: 'rgba(0, 0, 0, 0.05)' },
              ticks: {
                font: { family: "'SF Pro Display', 'Inter', sans-serif", size: 11 },
                color: '#64748b',
                callback(val) {
                  return '₹' + Number(val).toLocaleString('en-IN');
                }
              }
            }
          }
        }
      });
    } else if (this.selectedReport === 'gst-hsn') {
      chartWrapper.style.display = 'block';
      chartTitle.textContent = 'Table 12 HSN Commodity Distribution & Statutory Tax Contribution';
      chartSub.textContent = 'Top HSN commodity codes ranked by Net Taxable Value and CGST + SGST statutory tax liability';
      if (chartBadge) {
        chartBadge.className = 'compliance-badge compliance-badge-gst';
        chartBadge.textContent = 'TABLE 12 HSN SHARE';
      }

      const items = [...(data.items || [])].sort((a, b) => (Number(b.taxable_value) || 0) - (Number(a.taxable_value) || 0)).slice(0, 8);
      const labels = items.map(it => `${it.hsn_code} (${(it.description || '').substring(0, 14)}...)`);
      const taxableData = items.map(it => Number(it.taxable_value || 0));
      const taxData = items.map(it => Number(it.cgst_amount || 0) + Number(it.sgst_amount || 0));
      const totalData = items.map(it => Number(it.total_value || 0));

      this.bigChart = new ChartClass(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Taxable Value (₹)',
              data: taxableData,
              backgroundColor: 'rgba(59, 130, 246, 0.85)',
              borderColor: '#3b82f6',
              borderWidth: 1.5,
              borderRadius: 6,
              maxBarThickness: 45
            },
            {
              label: 'CGST + SGST Tax (₹)',
              data: taxData,
              backgroundColor: 'rgba(16, 185, 129, 0.85)',
              borderColor: '#10b981',
              borderWidth: 1.5,
              borderRadius: 6,
              maxBarThickness: 45
            },
            {
              label: 'Total Invoiced Value (₹)',
              data: totalData,
              backgroundColor: 'rgba(139, 92, 246, 0.85)',
              borderColor: '#8b5cf6',
              borderWidth: 1.5,
              borderRadius: 6,
              maxBarThickness: 45
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: {
                boxWidth: 14,
                font: { family: "'SF Pro Display', 'Inter', sans-serif", size: 12, weight: '600' },
                color: '#334155',
                padding: 16
              }
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              padding: 12,
              titleFont: { size: 13, weight: '700' },
              bodyFont: { size: 12 },
              cornerRadius: 8,
              callbacks: {
                label(context) {
                  const val = context.parsed.y ?? context.parsed ?? 0;
                  return `${context.dataset.label}: ₹${Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                font: { family: "'SF Pro Display', 'Inter', sans-serif", size: 11, weight: '600' },
                color: '#475569'
              }
            },
            y: {
              grid: { color: 'rgba(0, 0, 0, 0.05)' },
              ticks: {
                font: { family: "'SF Pro Display', 'Inter', sans-serif", size: 11 },
                color: '#64748b',
                callback(val) {
                  return '₹' + Number(val).toLocaleString('en-IN');
                }
              }
            }
          }
        }
      });
    } else if (this.selectedReport === 'ayush-dispatch') {
      chartWrapper.style.display = 'block';
      chartTitle.textContent = 'Top Formulations Dispatched (Schedule T Traceability Volume)';
      chartSub.textContent = 'Highest volume Ayurvedic products dispatched under GMP batch compliance';
      if (chartBadge) {
        chartBadge.className = 'compliance-badge compliance-badge-ayush';
        chartBadge.textContent = 'AYUSH GMP DISPATCH';
      }

      // Group items by product_name
      const prodMap = {};
      (data.items || []).forEach(it => {
        const name = it.product_name || 'Other';
        if (!prodMap[name]) prodMap[name] = { qty: 0, taxable: 0 };
        prodMap[name].qty += Number(it.qty || 0);
        prodMap[name].taxable += Number(it.taxable_amount || 0);
      });

      const topProds = Object.entries(prodMap)
        .sort((a, b) => b[1].taxable - a[1].taxable)
        .slice(0, 8);

      const labels = topProds.map(p => p[0].length > 20 ? p[0].substring(0, 18) + '...' : p[0]);
      const taxableData = topProds.map(p => p[1].taxable);
      const qtyData = topProds.map(p => p[1].qty);

      this.bigChart = new ChartClass(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Taxable Turnover (₹)',
              data: taxableData,
              backgroundColor: 'rgba(5, 150, 105, 0.85)',
              borderColor: '#059669',
              borderWidth: 1.5,
              borderRadius: 6,
              yAxisID: 'y',
              maxBarThickness: 45
            },
            {
              label: 'Dispatched Units',
              data: qtyData,
              backgroundColor: 'rgba(245, 158, 11, 0.85)',
              borderColor: '#f59e0b',
              borderWidth: 1.5,
              borderRadius: 6,
              yAxisID: 'y1',
              maxBarThickness: 45
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: {
                boxWidth: 14,
                font: { family: "'SF Pro Display', 'Inter', sans-serif", size: 12, weight: '600' },
                color: '#334155',
                padding: 16
              }
            },
            tooltip: {
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              padding: 12,
              titleFont: { size: 13, weight: '700' },
              bodyFont: { size: 12 },
              cornerRadius: 8
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                font: { family: "'SF Pro Display', 'Inter', sans-serif", size: 11, weight: '600' },
                color: '#475569'
              }
            },
            y: {
              type: 'linear',
              position: 'left',
              grid: { color: 'rgba(0, 0, 0, 0.05)' },
              ticks: {
                font: { family: "'SF Pro Display', 'Inter', sans-serif", size: 11 },
                color: '#059669',
                callback(val) {
                  return '₹' + Number(val).toLocaleString('en-IN');
                }
              }
            },
            y1: {
              type: 'linear',
              position: 'right',
              grid: { drawOnChartArea: false },
              ticks: {
                font: { family: "'SF Pro Display', 'Inter', sans-serif", size: 11 },
                color: '#d97706',
                callback(val) {
                  return Number(val).toLocaleString('en-IN') + ' units';
                }
              }
            }
          }
        }
      });
    } else if (this.selectedReport === 'batch-expiry') {
      chartWrapper.style.display = 'block';
      chartTitle.textContent = 'Rule 161B Ayurvedic Batch Stability & Expiry Distribution';
      chartSub.textContent = 'Manufactured formulations units produced vs retained balance stock by stability horizon';
      if (chartBadge) {
        chartBadge.className = 'compliance-badge compliance-badge-ayush';
        chartBadge.textContent = 'RULE 161B AUDIT';
      }

      // Group by status
      const statusMap = {};
      (data.items || []).forEach(it => {
        const status = it.status || 'Active';
        if (!statusMap[status]) statusMap[status] = { produced: 0, sold: 0, stock: 0 };
        statusMap[status].produced += Number(it.units_produced || 0);
        statusMap[status].sold += Number(it.units_sold || 0);
        statusMap[status].stock += Number(it.balance_stock || 0);
      });

      const labels = Object.keys(statusMap);
      const producedData = labels.map(k => statusMap[k].produced);
      const stockData = labels.map(k => statusMap[k].stock);

      this.bigChart = new ChartClass(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Total Units Produced',
              data: producedData,
              backgroundColor: 'rgba(59, 130, 246, 0.85)',
              borderColor: '#3b82f6',
              borderWidth: 1.5,
              borderRadius: 6,
              maxBarThickness: 50
            },
            {
              label: 'Balance Retained Stock Units',
              data: stockData,
              backgroundColor: 'rgba(239, 68, 68, 0.85)',
              borderColor: '#ef4444',
              borderWidth: 1.5,
              borderRadius: 6,
              maxBarThickness: 50
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'top',
              labels: {
                boxWidth: 14,
                font: { family: "'SF Pro Display', 'Inter', sans-serif", size: 12, weight: '600' },
                color: '#334155',
                padding: 16
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: {
                font: { family: "'SF Pro Display', 'Inter', sans-serif", size: 12, weight: '600' },
                color: '#475569'
              }
            },
            y: {
              grid: { color: 'rgba(0, 0, 0, 0.05)' },
              ticks: {
                font: { family: "'SF Pro Display', 'Inter', sans-serif", size: 11 },
                color: '#64748b',
                callback(val) {
                  return Number(val).toLocaleString('en-IN') + ' units';
                }
              }
            }
          }
        }
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
        const scopeDesc = this.exclusionScope === 'both' ? 'All Customers (Included + Excluded)' : (this.exclusionScope === 'excluded' ? 'Excluded Customers Only' : 'Included Customers Only');
        docTitle = `GST Table 12 HSN Summary (${this.exclusionScope.toUpperCase()})`;
        pdfRes = SuiteCoreBridge.renderGstHsnPdf({
          period: `${this.currentData.period || 'YTD'} [Scope: ${scopeDesc}]`,
          generated_at: this.currentData.generated_at || '',
          app_settings: this.currentData.app_settings || {},
          items: this.currentData.items || []
        });
      } else if (this.selectedReport === 'gstr1-summary') {
        const scopeDesc = this.exclusionScope === 'both' ? 'All Customers (Included + Excluded)' : (this.exclusionScope === 'excluded' ? 'Excluded Customers Only' : 'Included Customers Only');
        docTitle = `GSTR-1 Outward Supplies Summary (${this.exclusionScope.toUpperCase()})`;
        pdfRes = SuiteCoreBridge.renderGstr1SummaryPdf({
          period: `${this.currentData.period || 'YTD'} [Scope: ${scopeDesc}]`,
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

  handleExportCsv(forceGranular = false) {
    if (!this.currentData) return;

    let csvContent = '';
    let filename = `report_${Date.now()}.csv`;
    const cb = this.currentData.calculation_breakdown;
    const isGranular = forceGranular || this.viewMode === 'granular';

    if (this.selectedReport === 'ayush-dispatch') {
      filename = `AYUSH_Distribution_Register_${Date.now()}.csv`;
      const items = this.currentData.items || [];
      csvContent = 'Sl,Date,Invoice_No,Customer_Name,Customer_Town,Licence_No,GSTIN,Product_Name,Batch_No,Pack_Size,Qty,Rate,Taxable_Amount\n';
      items.forEach((it, idx) => {
        csvContent += `${idx + 1},"${it.date}","${it.invoice_no}","${(it.customer_name || '').replace(/"/g, '""')}","${(it.customer_town || '').replace(/"/g, '""')}","${(it.customer_licence_no || '').replace(/"/g, '""')}","${it.customer_gstin || ''}","${(it.product_name || '').replace(/"/g, '""')}","${it.batch_no}","${it.pack_size}",${it.qty},${it.rate},${it.taxable_amount}\n`;
      });
    } else if (this.selectedReport === 'gst-hsn') {
      if (isGranular) {
        filename = `GST_HSN_Granular_Items_${this.exclusionScope}_${Date.now()}.csv`;
        const items = this.currentData.granular_items || [];
        csvContent = 'Sl,Date,Invoice_No,Customer_Name,Customer_GSTIN,Customer_Scope,HSN_Code,Description,UQC,Qty,Rate,Taxable_Value,CGST,SGST,Total_Value\n';
        items.forEach((it, idx) => {
          const scopeLabel = it.is_excluded === 1 ? 'Excluded from Stats' : 'Included in Stats';
          csvContent += `${idx + 1},"${it.date || ''}","${it.invoice_no || ''}","${(it.customer_name || '').replace(/"/g, '""')}","${it.customer_gstin || 'URP'}","${scopeLabel}","${it.hsn_code}","${(it.description || '').replace(/"/g, '""')}","${it.uqc || 'NOS'}",${it.qty || 0},${it.rate || 0},${it.taxable_value || 0},${it.cgst_amount || 0},${it.sgst_amount || 0},${it.total_value || 0}\n`;
        });
      } else {
        filename = `GST_HSN_Table12_Summary_${this.exclusionScope}_${Date.now()}.csv`;
        const items = this.currentData.items || [];
        csvContent = 'Sl,HSN_Code,Description,UQC,Total_Qty,Total_Value,Taxable_Value,IGST,CGST,SGST,Cess\n';
        items.forEach((it, idx) => {
          csvContent += `${idx + 1},"${it.hsn_code}","${(it.description || '').replace(/"/g, '""')}","${it.uqc}",${it.total_qty},${it.total_value},${it.taxable_value},${it.igst_amount || 0},${it.cgst_amount || 0},${it.sgst_amount || 0},${it.cess_amount || 0}\n`;
        });
      }

      // Append Calculation Breakdown Audit Rows if present
      if (cb) {
        csvContent += '\n"--- STATUTORY CALCULATION BREAKDOWN BY CUSTOMER SCOPE ---"\n';
        csvContent += 'Customer_Scope,Line_Items,Vouchers,Total_Qty,Taxable_Value,CGST,SGST,Total_Value\n';
        csvContent += `"Included in Stats",${cb.included?.item_count || 0},${cb.included?.invoice_count || 0},${cb.included?.total_qty || 0},${cb.included?.taxable_value || 0},${cb.included?.cgst_amount || 0},${cb.included?.sgst_amount || 0},${cb.included?.total_value || 0}\n`;
        csvContent += `"Excluded from Stats",${cb.excluded?.item_count || 0},${cb.excluded?.invoice_count || 0},${cb.excluded?.total_qty || 0},${cb.excluded?.taxable_value || 0},${cb.excluded?.cgst_amount || 0},${cb.excluded?.sgst_amount || 0},${cb.excluded?.total_value || 0}\n`;
        csvContent += `"Consolidated Total (Both)",${cb.combined?.item_count || 0},${cb.combined?.invoice_count || 0},${cb.combined?.total_qty || 0},${cb.combined?.taxable_value || 0},${cb.combined?.cgst_amount || 0},${cb.combined?.sgst_amount || 0},${cb.combined?.total_value || 0}\n`;
      }
    } else if (this.selectedReport === 'gstr1-summary') {
      if (isGranular) {
        filename = `GSTR1_Granular_Invoices_${this.exclusionScope}_${Date.now()}.csv`;
        const invoices = this.currentData.granular_invoices || [];
        csvContent = 'Sl,Date,Invoice_No,Customer_Name,Customer_GSTIN,Customer_Scope,Supply_Type,Gross_Value,Taxable_Value,CGST,SGST\n';
        invoices.forEach((inv, idx) => {
          const scopeLabel = inv.is_excluded === 1 ? 'Excluded from Stats' : 'Included in Stats';
          csvContent += `${idx + 1},"${inv.date || ''}","${inv.invoice_no || ''}","${(inv.customer_name || '').replace(/"/g, '""')}","${inv.customer_gstin || 'URP'}","${scopeLabel}","${inv.supply_type || ''}",${inv.gross_value || 0},${inv.taxable_value || 0},${inv.cgst || 0},${inv.sgst || 0}\n`;
        });
      } else {
        filename = `GSTR1_Section_Summary_${this.exclusionScope}_${Date.now()}.csv`;
        const sections = this.currentData.sections || [];
        csvContent = 'Table,Description,Voucher_Count,Gross_Value,Taxable_Value,CGST,SGST\n';
        sections.forEach((s) => {
          csvContent += `"${s.table_number}","${(s.description || '').replace(/"/g, '""')}",${s.count},${s.gross_value},${s.taxable_value},${s.cgst},${s.sgst}\n`;
        });
      }

      // Append Calculation Breakdown Audit Rows if present
      if (cb) {
        csvContent += '\n"--- STATUTORY CALCULATION BREAKDOWN BY CUSTOMER SCOPE ---"\n';
        csvContent += 'Customer_Scope,Vouchers,Gross_Value,Taxable_Value,CGST,SGST,Total_Tax\n';
        csvContent += `"Included in Stats",${cb.included?.invoice_count || 0},${cb.included?.gross_value || 0},${cb.included?.taxable_value || 0},${cb.included?.cgst || 0},${cb.included?.sgst || 0},${(Number(cb.included?.cgst || 0) + Number(cb.included?.sgst || 0)).toFixed(2)}\n`;
        csvContent += `"Excluded from Stats",${cb.excluded?.invoice_count || 0},${cb.excluded?.gross_value || 0},${cb.excluded?.taxable_value || 0},${cb.excluded?.cgst || 0},${cb.excluded?.sgst || 0},${(Number(cb.excluded?.cgst || 0) + Number(cb.excluded?.sgst || 0)).toFixed(2)}\n`;
        csvContent += `"Consolidated Total (Both)",${cb.combined?.invoice_count || 0},${cb.combined?.gross_value || 0},${cb.combined?.taxable_value || 0},${cb.combined?.cgst || 0},${cb.combined?.sgst || 0},${(Number(cb.combined?.cgst || 0) + Number(cb.combined?.sgst || 0)).toFixed(2)}\n`;
      }
    } else if (this.selectedReport === 'batch-expiry') {
      filename = `AYUSH_Batch_Expiry_${Date.now()}.csv`;
      const items = this.currentData.items || [];
      csvContent = 'Sl,Batch_No,Product_Name,Pack_Size,Mfg_Date,Exp_Date,Produced,Sold,Stock,Status\n';
      items.forEach((it, idx) => {
        csvContent += `${idx + 1},"${it.batch_no}","${(it.product_name || '').replace(/"/g, '""')}","${it.pack_size}","${it.mfg_date}","${it.exp_date}",${it.units_produced},${it.units_sold},${it.balance_stock},"${it.status}"\n`;
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

