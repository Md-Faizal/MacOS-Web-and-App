/**
 * SalesReportsView - Trending sales, tax liability, discount leakage & revenue deep-dive
 */

class SalesReportsView {
  constructor(analyticsApp) {
    this.analyticsApp = analyticsApp;
    this.viewContainer = analyticsApp.viewContainer;
    this.period = 'monthly';
  }

  async render() {
    this.viewContainer.innerHTML = `
      <div class="analytics-view-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2>📈 Sales Performance & Tax Deep-Dive</h2>
          <span class="analytics-view-sub">Revenue growth trends, tax breakdown (CGST/SGST), and discount audit</span>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
          <button id="jumpToCompBtn" class="bi-shortcut-btn">⚖️ Comparative YoY/MoM Engine</button>
          <div class="analytics-period-selector">
            <button class="btn-period ${this.period === 'monthly' ? 'active' : ''}" data-period="monthly">Monthly</button>
            <button class="btn-period ${this.period === 'daily' ? 'active' : ''}" data-period="daily">Daily</button>
          </div>
        </div>
      </div>

      <div class="analytics-loading" id="salesReportLoading">
        <div class="spinner"></div> Generating sales reports...
      </div>

      <div class="analytics-view-content hidden" id="salesReportContent">
        <!-- Summary KPI Cards -->
        <div class="dashboard-grid" id="salesKpiGrid"></div>

        <!-- Trend Chart -->
        <div class="analytics-card" style="margin-top: 20px;">
          <h3>📊 Revenue & Invoice Velocity Trend</h3>
          <div style="height: 280px; position: relative;">
            <canvas id="salesTrendChart"></canvas>
          </div>
        </div>

        <!-- Tax & Discount Summary Card -->
        <div class="analytics-grid-2col" style="margin-top: 20px;">
          <div class="analytics-card">
            <h3>🏛️ Tax Liability Breakdown (GST)</h3>
            <div id="taxBreakdownSummary" style="padding: 10px 0;"></div>
          </div>
          <div class="analytics-card">
            <h3>🏷️ Discount Leakage Audit</h3>
            <div id="discountAuditSummary" style="padding: 10px 0;"></div>
          </div>
        </div>

        <!-- Detailed Breakdown Table -->
        <div class="analytics-card" style="margin-top: 20px;">
          <h3>📋 Periodical Sales Breakdown</h3>
          <div class="analytics-table-wrapper">
            <table class="analytics-table" id="salesBreakdownTable">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Invoices Count</th>
                  <th style="text-align: right;">Taxable Amount</th>
                  <th style="text-align: right;">GST Collected</th>
                  <th style="text-align: right;">Discount Given</th>
                  <th style="text-align: right;">Gross Revenue</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners();
    await this.loadSalesData();
  }

  setupEventListeners() {
    document.getElementById('jumpToCompBtn')?.addEventListener('click', () => {
      if (this.analyticsApp) this.analyticsApp.switchView('comparative');
    });

    this.viewContainer.querySelectorAll('.btn-period').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.period = e.target.dataset.period;
        this.render();
      });
    });
  }

  async loadSalesData() {
    try {
      const resp = await fetch(`/api/analytics/sales-deep-dive?period=${this.period}`);
      const data = await resp.json();

      document.getElementById('salesReportLoading')?.classList.add('hidden');
      document.getElementById('salesReportContent')?.classList.remove('hidden');

      const timeSeries = data.time_series || [];
      const taxSummary = data.tax_summary || {};

      this.renderKpiCards(timeSeries);
      this.renderTrendChart(timeSeries);
      this.renderTaxSummary(taxSummary, timeSeries);
      this.renderDiscountSummary(taxSummary, timeSeries);
      this.renderTable(timeSeries);
    } catch (err) {
      console.error('Failed to load sales deep-dive:', err);
      const loading = document.getElementById('salesReportLoading');
      if (loading) loading.innerHTML = '<span style="color:#ef4444;">Error loading sales report data</span>';
    }
  }

  renderKpiCards(timeSeries) {
    const grid = document.getElementById('salesKpiGrid');
    if (!grid) return;

    const totalGross = timeSeries.reduce((sum, s) => sum + (s.gross_revenue || 0), 0);
    const totalGst = timeSeries.reduce((sum, s) => sum + (s.gst_collected || 0), 0);
    const totalDiscount = timeSeries.reduce((sum, s) => sum + (s.discount_given || 0), 0);
    const totalInvoices = timeSeries.reduce((sum, s) => sum + (s.invoice_count || 0), 0);

    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total Gross Revenue</div>
        <div class="stat-value">₹${totalGross.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
        <div style="font-size:12px; opacity:0.7; margin-top:4px;">Across ${timeSeries.length} ${this.period} periods</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total GST Collected</div>
        <div class="stat-value" style="color: #3b82f6;">₹${totalGst.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
        <div style="font-size:12px; opacity:0.7; margin-top:4px;">Tax realization</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Discount Given</div>
        <div class="stat-value" style="color: #f59e0b;">₹${totalDiscount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
        <div style="font-size:12px; opacity:0.7; margin-top:4px;">Customer promotional impact</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Billed Invoices</div>
        <div class="stat-value">${totalInvoices}</div>
        <div style="font-size:12px; opacity:0.7; margin-top:4px;">Transactions created</div>
      </div>
    `;
  }

  renderTrendChart(timeSeries) {
    const ctx = document.getElementById('salesTrendChart')?.getContext('2d');
    if (!ctx || !window.Chart) return;

    if (this.chart) this.chart.destroy();

    const labels = timeSeries.map(s => s.period);
    const revenues = timeSeries.map(s => s.gross_revenue);
    const counts = timeSeries.map(s => s.invoice_count);

    this.chart = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Gross Revenue (₹)',
            data: revenues,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            yAxisID: 'y'
          },
          {
            label: 'Invoices Count',
            data: counts,
            borderColor: '#3b82f6',
            backgroundColor: 'transparent',
            borderDash: [5, 5],
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#aaaaaa' } },
          y: {
            type: 'linear',
            position: 'left',
            ticks: { color: '#aaaaaa', callback: (val) => '₹' + Number(val).toLocaleString('en-IN') }
          },
          y1: {
            type: 'linear',
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: '#3b82f6' }
          }
        }
      }
    });
  }

  renderTaxSummary(taxSummary, timeSeries) {
    const container = document.getElementById('taxBreakdownSummary');
    if (!container) return;

    const totalGst = timeSeries.reduce((sum, s) => sum + (s.gst_collected || 0), 0);
    const sgst = taxSummary.total_sgst || totalGst / 2;
    const cgst = taxSummary.total_cgst || totalGst / 2;

    container.innerHTML = `
      <div class="pipeline-stat-row">
        <span>State GST (SGST):</span>
        <strong style="color: #3b82f6;">₹${Number(sgst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong>
      </div>
      <div class="pipeline-stat-row">
        <span>Central GST (CGST):</span>
        <strong style="color: #8b5cf6;">₹${Number(cgst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong>
      </div>
      <div class="pipeline-stat-row">
        <span>Total Tax Collected:</span>
        <strong style="color: #10b981;">₹${Number(totalGst).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong>
      </div>
    `;
  }

  renderDiscountSummary(taxSummary, timeSeries) {
    const container = document.getElementById('discountAuditSummary');
    if (!container) return;

    const totalDiscount = timeSeries.reduce((sum, s) => sum + (s.discount_given || 0), 0);
    const totalGross = timeSeries.reduce((sum, s) => sum + (s.gross_revenue || 0), 0);
    const discountRate = totalGross > 0 ? ((totalDiscount / (totalGross + totalDiscount)) * 100).toFixed(2) : 0;

    container.innerHTML = `
      <div class="pipeline-stat-row">
        <span>Total Discount Allowed:</span>
        <strong style="color: #f59e0b;">₹${Number(totalDiscount).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong>
      </div>
      <div class="pipeline-stat-row">
        <span>Effective Discount Rate:</span>
        <strong>${discountRate}%</strong>
      </div>
      <div class="pipeline-stat-row">
        <span>Line-Item Special Discounts:</span>
        <strong>₹${Number(taxSummary.line_item_discounts || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong>
      </div>
    `;
  }

  renderTable(timeSeries) {
    const tbody = document.querySelector('#salesBreakdownTable tbody');
    if (!tbody) return;

    if (timeSeries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color: #888;">No sales records found</td></tr>';
      return;
    }

    tbody.innerHTML = timeSeries.map(s => `
      <tr>
        <td><strong>${s.period}</strong></td>
        <td>${s.invoice_count} bills</td>
        <td style="text-align: right;">₹${Number(s.taxable_amount || 0).toLocaleString('en-IN')}</td>
        <td style="text-align: right; color: #3b82f6;">₹${Number(s.gst_collected || 0).toLocaleString('en-IN')}</td>
        <td style="text-align: right; color: #f59e0b;">₹${Number(s.discount_given || 0).toLocaleString('en-IN')}</td>
        <td style="text-align: right; font-weight: bold; color: #10b981;">₹${Number(s.gross_revenue || 0).toLocaleString('en-IN')}</td>
      </tr>
    `).join('');
  }
}

window.SalesReportsView = SalesReportsView;
