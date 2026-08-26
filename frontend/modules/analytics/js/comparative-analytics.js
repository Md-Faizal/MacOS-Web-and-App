/**
 * ComparativeAnalyticsView - YoY, MoM, QoQ & Custom Period Permutation Benchmark Engine
 */

class ComparativeAnalyticsView {
  constructor(analyticsApp) {
    this.analyticsApp = analyticsApp;
    this.viewContainer = analyticsApp.viewContainer;
    this.subTab = 'yoy'; // 'yoy', 'mom', 'qoq', 'custom'
  }

  async render() {
    this.viewContainer.innerHTML = `
      <div class="analytics-view-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
        <div>
          <h2>⚖️ Comparative Analytics & Growth Engine</h2>
          <span class="analytics-view-sub">Analyze revenue performance across YoY, MoM, QoQ, and custom period permutations</span>
        </div>
        <div class="analytics-period-selector" id="compSubTabSelector">
          <button class="btn-period ${this.subTab === 'yoy' ? 'active' : ''}" data-subtab="yoy">📅 Year-on-Year</button>
          <button class="btn-period ${this.subTab === 'mom' ? 'active' : ''}" data-subtab="mom">📊 Month-on-Month</button>
          <button class="btn-period ${this.subTab === 'qoq' ? 'active' : ''}" data-subtab="qoq">📈 Quarter-on-Quarter</button>
          <button class="btn-period ${this.subTab === 'custom' ? 'active' : ''}" data-subtab="custom">⚖️ Period A vs B</button>
        </div>
      </div>

      <div class="analytics-loading" id="compLoading">
        <div class="spinner"></div> Computing comparative analysis...
      </div>

      <div class="analytics-view-content hidden" id="compContent">
        <div id="compDynamicView"></div>
      </div>
    `;

    this.setupEventListeners();
    await this.loadSubTab();
  }

  setupEventListeners() {
    this.viewContainer.querySelectorAll('#compSubTabSelector .btn-period').forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.subTab = e.target.dataset.subtab;
        this.render();
      });
    });
  }

  async loadSubTab() {
    try {
      document.getElementById('compLoading')?.classList.remove('hidden');
      document.getElementById('compContent')?.classList.add('hidden');

      if (this.subTab === 'yoy') await this.loadYoY();
      else if (this.subTab === 'mom') await this.loadMoM();
      else if (this.subTab === 'qoq') await this.loadQoQ();
      else if (this.subTab === 'custom') await this.loadCustom();
    } catch (err) {
      console.error('Comparative view load failed:', err);
      const loading = document.getElementById('compLoading');
      if (loading) loading.innerHTML = '<span style="color:#ef4444;">Error loading comparative analysis</span>';
    }
  }

  // ===== 1. YEAR-ON-YEAR (YoY) =====
  async loadYoY() {
    const resp = await fetch('/api/analytics/comparative-analysis?type=yoy');
    const data = await resp.json();

    document.getElementById('compLoading')?.classList.add('hidden');
    document.getElementById('compContent')?.classList.remove('hidden');

    const yearMap = data.yearMap || {};
    const years = Object.keys(yearMap).sort().reverse(); // e.g. ['2026', '2025', '2024']

    const container = document.getElementById('compDynamicView');
    container.innerHTML = `
      <div class="analytics-card">
        <h3>📅 Year-on-Year Revenue Overlay</h3>
        <div style="height: 300px; position: relative;">
          <canvas id="yoyChart"></canvas>
        </div>
      </div>

      <div class="analytics-card" style="margin-top: 20px;">
        <h3>📋 Month-by-Month Multi-Year Matrix (₹)</h3>
        <div class="analytics-table-wrapper">
          <table class="analytics-table" id="yoyMatrixTable">
            <thead>
              <tr>
                <th>Month</th>
                ${years.map(y => `<th style="text-align: right;">${y} Revenue</th>`).join('')}
                <th style="text-align: right;">YoY Growth (vs ${years[1] || 'Prev Year'})</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    this.renderYoYChart(years, yearMap);
    this.renderYoYTable(years, yearMap);
  }

  renderYoYChart(years, yearMap) {
    const ctx = document.getElementById('yoyChart')?.getContext('2d');
    if (!ctx || !window.Chart) return;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'];

    const datasets = years.map((y, idx) => ({
      label: `Year ${y}`,
      data: yearMap[y],
      backgroundColor: colors[idx % colors.length] + '33',
      borderColor: colors[idx % colors.length],
      borderWidth: 2,
      borderRadius: 4
    }));

    if (this.yoyChart) this.yoyChart.destroy();
    this.yoyChart = new window.Chart(ctx, {
      type: 'bar',
      data: { labels: months, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#aaaaaa' } },
          y: { ticks: { color: '#aaaaaa', callback: (val) => '₹' + Number(val).toLocaleString('en-IN') } }
        }
      }
    });
  }

  renderYoYTable(years, yearMap) {
    const tbody = document.querySelector('#yoyMatrixTable tbody');
    if (!tbody) return;

    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const latestYear = years[0];
    const prevYear = years[1];

    tbody.innerHTML = months.map((mName, mIdx) => {
      const yearCells = years.map(y => {
        const val = yearMap[y][mIdx] || 0;
        return `<td style="text-align: right;">₹${Number(val).toLocaleString('en-IN')}</td>`;
      }).join('');

      let growthBadge = '<span class="badge badge-info">N/A</span>';
      if (latestYear && prevYear) {
        const currVal = yearMap[latestYear][mIdx] || 0;
        const prevVal = yearMap[prevYear][mIdx] || 0;
        if (prevVal > 0) {
          const pct = (((currVal - prevVal) / prevVal) * 100).toFixed(1);
          const isPos = pct >= 0;
          growthBadge = `<span class="badge ${isPos ? 'badge-status' : 'badge-critical'}">${isPos ? '↑ +' : '↓ '}${pct}%</span>`;
        } else if (currVal > 0) {
          growthBadge = '<span class="badge badge-status">↑ +100%</span>';
        }
      }

      return `
        <tr>
          <td><strong>${mName}</strong></td>
          ${yearCells}
          <td style="text-align: right;">${growthBadge}</td>
        </tr>
      `;
    }).join('');
  }

  // ===== 2. MONTH-ON-MONTH (MoM) =====
  async loadMoM() {
    const resp = await fetch('/api/analytics/comparative-analysis?type=mom');
    const data = await resp.json();

    document.getElementById('compLoading')?.classList.add('hidden');
    document.getElementById('compContent')?.classList.remove('hidden');

    const container = document.getElementById('compDynamicView');
    container.innerHTML = `
      <div class="analytics-card">
        <h3>📊 Sequential Month-on-Month Growth Velocity</h3>
        <div style="height: 280px; position: relative;">
          <canvas id="momChart"></canvas>
        </div>
      </div>

      <div class="analytics-card" style="margin-top: 20px;">
        <h3>📋 Sequential MoM Performance & Variance Audit</h3>
        <div class="analytics-table-wrapper">
          <table class="analytics-table" id="momTable">
            <thead>
              <tr>
                <th>Month</th>
                <th>Invoices</th>
                <th style="text-align: right;">Current Revenue (₹)</th>
                <th style="text-align: right;">Prev Month Revenue (₹)</th>
                <th style="text-align: right;">Variance Amount (₹)</th>
                <th style="text-align: right;">MoM Growth (%)</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    this.renderMoMChart(data || []);
    this.renderMoMTable(data || []);
  }

  renderMoMChart(momData) {
    const ctx = document.getElementById('momChart')?.getContext('2d');
    if (!ctx || !window.Chart) return;

    if (this.momChart) this.momChart.destroy();
    this.momChart = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: momData.map(d => d.month),
        datasets: [{
          label: 'Revenue (₹)',
          data: momData.map(d => d.revenue),
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#aaaaaa' } },
          y: { ticks: { color: '#aaaaaa', callback: (val) => '₹' + Number(val).toLocaleString('en-IN') } }
        }
      }
    });
  }

  renderMoMTable(momData) {
    const tbody = document.querySelector('#momTable tbody');
    if (!tbody) return;

    if (momData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color: #888;">No sales history for MoM analysis</td></tr>';
      return;
    }

    tbody.innerHTML = momData.slice().reverse().map(d => {
      const isPos = d.growth_percent >= 0;
      const badge = `<span class="badge ${isPos ? 'badge-status' : 'badge-critical'}">${isPos ? '↑ +' : '↓ '}${d.growth_percent}%</span>`;
      const varColor = isPos ? '#10b981' : '#ef4444';

      return `
        <tr>
          <td><strong>${d.month}</strong></td>
          <td>${d.invoice_count} bills</td>
          <td style="text-align: right; font-weight: bold;">₹${Number(d.revenue).toLocaleString('en-IN')}</td>
          <td style="text-align: right; opacity: 0.7;">₹${Number(d.prev_revenue).toLocaleString('en-IN')}</td>
          <td style="text-align: right; font-weight: bold; color: ${varColor};">${d.variance_amount >= 0 ? '+' : ''}₹${Number(d.variance_amount).toLocaleString('en-IN')}</td>
          <td style="text-align: right;">${badge}</td>
        </tr>
      `;
    }).join('');
  }

  // ===== 3. QUARTER-ON-QUARTER (QoQ) =====
  async loadQoQ() {
    const resp = await fetch('/api/analytics/comparative-analysis?type=qoq');
    const data = await resp.json();

    document.getElementById('compLoading')?.classList.add('hidden');
    document.getElementById('compContent')?.classList.remove('hidden');

    const container = document.getElementById('compDynamicView');
    container.innerHTML = `
      <div class="analytics-card">
        <h3>📈 Quarterly Revenue Breakdown across Years</h3>
        <div style="height: 280px; position: relative;">
          <canvas id="qoqChart"></canvas>
        </div>
      </div>

      <div class="analytics-card" style="margin-top: 20px;">
        <h3>📋 Quarter-on-Quarter Summary Matrix</h3>
        <div class="analytics-table-wrapper">
          <table class="analytics-table" id="qoqTable">
            <thead>
              <tr>
                <th>Year & Quarter</th>
                <th>Invoices Count</th>
                <th style="text-align: right;">Quarter Revenue (₹)</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;

    this.renderQoQChart(data || []);
    this.renderQoQTable(data || []);
  }

  renderQoQChart(qoqData) {
    const ctx = document.getElementById('qoqChart')?.getContext('2d');
    if (!ctx || !window.Chart) return;

    if (this.qoqChart) this.qoqChart.destroy();
    this.qoqChart = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: qoqData.map(d => `${d.year} ${d.quarter}`),
        datasets: [{
          label: 'Quarter Revenue (₹)',
          data: qoqData.map(d => d.revenue),
          backgroundColor: '#3b82f6',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: '#aaaaaa' } },
          y: { ticks: { color: '#aaaaaa', callback: (val) => '₹' + Number(val).toLocaleString('en-IN') } }
        }
      }
    });
  }

  renderQoQTable(qoqData) {
    const tbody = document.querySelector('#qoqTable tbody');
    if (!tbody) return;

    if (qoqData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px; color: #888;">No quarterly sales history available</td></tr>';
      return;
    }

    tbody.innerHTML = qoqData.map(d => `
      <tr>
        <td><strong>${d.year} ${d.quarter}</strong></td>
        <td>${d.invoice_count} bills</td>
        <td style="text-align: right; font-weight: bold; color: #3b82f6;">₹${Number(d.revenue).toLocaleString('en-IN')}</td>
      </tr>
    `).join('');
  }

  // ===== 4. PERIOD A VS PERIOD B BENCHMARK =====
  async loadCustom() {
    document.getElementById('compLoading')?.classList.add('hidden');
    document.getElementById('compContent')?.classList.remove('hidden');

    const container = document.getElementById('compDynamicView');
    
    // Default dates: Period A (This month), Period B (Last month)
    const now = new Date();
    const firstDayA = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    const firstDayB = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
    const lastDayB = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];

    container.innerHTML = `
      <div class="analytics-card">
        <h3>⚖️ Period A vs Period B Benchmark Comparator</h3>
        <div style="display: flex; gap: 20px; flex-wrap: wrap; margin-top: 15px; align-items: flex-end;">
          <div style="flex: 1; min-width: 220px; background: rgba(139, 92, 246, 0.05); padding: 12px; border-radius: 8px; border: 1px solid rgba(139, 92, 246, 0.2);">
            <strong style="color: #7c3aed; font-size: 13px;">Period A (Target Range)</strong>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
              <input type="date" id="pAStart" value="${firstDayA}" class="analytics-header-search" style="width:100%;">
              <input type="date" id="pAEnd" value="${today}" class="analytics-header-search" style="width:100%;">
            </div>
          </div>

          <div style="flex: 1; min-width: 220px; background: rgba(59, 130, 246, 0.05); padding: 12px; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.2);">
            <strong style="color: #2563eb; font-size: 13px;">Period B (Baseline Range)</strong>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
              <input type="date" id="pBStart" value="${firstDayB}" class="analytics-header-search" style="width:100%;">
              <input type="date" id="pBEnd" value="${lastDayB}" class="analytics-header-search" style="width:100%;">
            </div>
          </div>

          <button id="runBenchmarkBtn" class="bi-shortcut-btn" style="height: 40px; padding: 0 24px; background: #7c3aed; color: #fff;">Compare Permutation</button>
        </div>
      </div>

      <div id="benchmarkResultsArea" style="margin-top: 20px;"></div>
    `;

    document.getElementById('runBenchmarkBtn')?.addEventListener('click', () => this.runCustomComparison());
    await this.runCustomComparison();
  }

  async runCustomComparison() {
    const sA = document.getElementById('pAStart')?.value;
    const eA = document.getElementById('pAEnd')?.value;
    const sB = document.getElementById('pBStart')?.value;
    const eB = document.getElementById('pBEnd')?.value;

    if (!sA || !eA || !sB || !eB) return;

    const area = document.getElementById('benchmarkResultsArea');
    if (area) area.innerHTML = '<div class="analytics-loading"><div class="spinner"></div> Comparing Period A and Period B...</div>';

    try {
      const resp = await fetch(`/api/analytics/comparative-analysis?type=custom&startDateA=${sA}&endDateA=${eA}&startDateB=${sB}&endDateB=${eB}`);
      const data = await resp.json();

      const pA = data.periodA;
      const pB = data.periodB;
      const varData = data.variance;

      const isPos = varData.revenue_growth_percent >= 0;
      const varColor = isPos ? '#10b981' : '#ef4444';

      area.innerHTML = `
        <div class="analytics-grid-2col">
          <!-- Period A Card -->
          <div class="analytics-card" style="border-top: 4px solid #7c3aed;">
            <h3 style="color: #7c3aed;">Period A Performance</h3>
            <span style="font-size: 12px; color: #888;">${pA.startDate} to ${pA.endDate}</span>
            <div style="font-size: 26px; font-weight: 700; margin-top: 10px; color: #111;">₹${Number(pA.revenue).toLocaleString('en-IN')}</div>
            <div class="pipeline-stat-row" style="margin-top: 15px;"><span>Invoices Count:</span><strong>${pA.invoice_count} bills</strong></div>
            <div class="pipeline-stat-row"><span>Collections Realized:</span><strong style="color:#10b981;">₹${Number(pA.total_collected).toLocaleString('en-IN')}</strong></div>
            <div class="pipeline-stat-row"><span>Avg Invoice Value:</span><strong>₹${Number(pA.avg_invoice_value).toLocaleString('en-IN', {maximumFractionDigits: 0})}</strong></div>
            <div class="pipeline-stat-row"><span>GST Collected:</span><strong>₹${Number(pA.total_gst).toLocaleString('en-IN')}</strong></div>
          </div>

          <!-- Period B Card -->
          <div class="analytics-card" style="border-top: 4px solid #2563eb;">
            <h3 style="color: #2563eb;">Period B Performance</h3>
            <span style="font-size: 12px; color: #888;">${pB.startDate} to ${pB.endDate}</span>
            <div style="font-size: 26px; font-weight: 700; margin-top: 10px; color: #111;">₹${Number(pB.revenue).toLocaleString('en-IN')}</div>
            <div class="pipeline-stat-row" style="margin-top: 15px;"><span>Invoices Count:</span><strong>${pB.invoice_count} bills</strong></div>
            <div class="pipeline-stat-row"><span>Collections Realized:</span><strong style="color:#10b981;">₹${Number(pB.total_collected).toLocaleString('en-IN')}</strong></div>
            <div class="pipeline-stat-row"><span>Avg Invoice Value:</span><strong>₹${Number(pB.avg_invoice_value).toLocaleString('en-IN', {maximumFractionDigits: 0})}</strong></div>
            <div class="pipeline-stat-row"><span>GST Collected:</span><strong>₹${Number(pB.total_gst).toLocaleString('en-IN')}</strong></div>
          </div>
        </div>

        <!-- Comparative Delta Summary Card -->
        <div class="analytics-card" style="margin-top: 20px; text-align: center; background: rgba(255, 255, 255, 0.95);">
          <h3>⚖️ Permutation Benchmark Growth Variance</h3>
          <div style="font-size: 32px; font-weight: 800; color: ${varColor}; margin-top: 8px;">
            ${isPos ? '↑ +' : '↓ '}${varData.revenue_growth_percent}% Growth
          </div>
          <div style="font-size: 15px; font-weight: 600; color: ${varColor}; margin-top: 4px;">
            (${varData.revenue_diff >= 0 ? '+' : ''}₹${Number(varData.revenue_diff).toLocaleString('en-IN')} revenue delta)
          </div>
        </div>
      `;
    } catch (err) {
      console.error('Custom comparison failed:', err);
      if (area) area.innerHTML = '<div style="color:#ef4444; padding:20px;">Failed to run custom comparison</div>';
    }
  }
}

window.ComparativeAnalyticsView = ComparativeAnalyticsView;
