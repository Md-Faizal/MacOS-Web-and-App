/**
 * CustomerAgingView - Handles AR Aging Matrix & Customer RFM Intelligence
 */

class CustomerAgingView {
  constructor(app) {
    this.app = app;
  }

  async render() {
    const container = this.app.viewContainer;
    container.innerHTML = `
      <div class="analytics-view-header">
        <h2>👥 Accounts Receivable Aging & Customer RFM Intelligence</h2>
        <span class="analytics-view-sub">Credit risk exposure tracking and customer segmentation analysis</span>
      </div>

      <div class="analytics-loading" id="agingLoading">
        <div class="spinner"></div> Loading Credit & Aging Data...
      </div>

      <div class="analytics-view-content hidden" id="agingContent">
        <!-- AR Aging Buckets Grid -->
        <div class="aging-buckets-grid" id="agingBucketsGrid"></div>

        <!-- Aging Bar Chart & Segment Breakdown -->
        <div class="analytics-grid-2col" style="margin-top: 20px;">
          <div class="analytics-card">
            <h3>📈 Accounts Receivable Aging Breakdown</h3>
            <div style="height: 240px; position: relative;">
              <canvas id="arAgingChart"></canvas>
            </div>
          </div>
          <div class="analytics-card">
            <h3>🎯 Customer Health Tiers (RFM)</h3>
            <div id="rfmTierSummary" style="padding: 10px 0;"></div>
          </div>
        </div>

        <!-- Top Outstanding Debtors Table -->
        <div class="analytics-card" style="margin-top: 20px;">
          <h3>⚠️ Top Outstanding Debtors</h3>
          <div class="analytics-table-wrapper">
            <table class="analytics-table" id="topDebtorsTable">
              <thead>
                <tr>
                  <th>Customer Name</th>
                  <th>Status</th>
                  <th style="text-align: right;">Current Due (₹)</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>

        <!-- Customer RFM Table -->
        <div class="analytics-card" style="margin-top: 20px;">
          <h3>🏆 Customer RFM Segmentation Matrix</h3>
          <div class="analytics-table-wrapper">
            <table class="analytics-table" id="rfmTable">
              <thead>
                <tr>
                  <th>Customer Name</th>
                  <th>Segment Tier</th>
                  <th>Orders Count</th>
                  <th>Last Purchase Recency</th>
                  <th style="text-align: right;">Monetary Value</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    await this.loadAgingAndRFM();
  }

  async loadAgingAndRFM() {
    try {
      const [agingResp, rfmResp] = await Promise.all([
        fetch('/api/analytics/ar-aging'),
        fetch('/api/analytics/rfm-segmentation')
      ]);

      const agingData = await agingResp.json();
      const rfmData = await rfmResp.json();

      document.getElementById('agingLoading')?.classList.add('hidden');
      document.getElementById('agingContent')?.classList.remove('hidden');

      this.renderAgingBuckets(agingData.buckets || {});
      this.renderAgingChart(agingData.buckets || {});
      this.renderTopDebtors(agingData.top_debtors || []);
      this.renderRFMTiers(rfmData || []);
      this.renderRFMTable(rfmData || []);
    } catch (err) {
      console.error('Failed to load aging or RFM data:', err);
      const loading = document.getElementById('agingLoading');
      if (loading) loading.innerHTML = '<span style="color:#ef4444;">Failed to load credit aging data</span>';
    }
  }

  renderAgingBuckets(buckets) {
    const grid = document.getElementById('agingBucketsGrid');
    if (!grid) return;

    const config = [
      { key: '0-30 days', label: '0-30 Days Overdue', color: '#10b981' },
      { key: '31-60 days', label: '31-60 Days Overdue', color: '#f59e0b' },
      { key: '61-90 days', label: '61-90 Days Overdue', color: '#f97316' },
      { key: '90+ days', label: '90+ Days Critical', color: '#ef4444' }
    ];

    grid.innerHTML = config.map(item => {
      const val = buckets[item.key] || 0;
      return `
        <div class="aging-bucket-card" style="border-left: 4px solid ${item.color};">
          <div class="bucket-label">${item.label}</div>
          <div class="bucket-amount" style="color: ${item.color};">₹${Number(val).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
        </div>
      `;
    }).join('');
  }

  renderAgingChart(buckets) {
    const ctx = document.getElementById('arAgingChart')?.getContext('2d');
    if (!ctx || !window.Chart) return;

    if (this.agingChart) this.agingChart.destroy();

    const labels = ['0-30 Days', '31-60 Days', '61-90 Days', '90+ Days'];
    const values = [buckets['0-30 days'] || 0, buckets['31-60 days'] || 0, buckets['61-90 days'] || 0, buckets['90+ days'] || 0];

    this.agingChart = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Outstanding Amount (₹)',
          data: values,
          backgroundColor: ['#10b981', '#f59e0b', '#f97316', '#ef4444'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#aaaaaa' } },
          y: { ticks: { color: '#aaaaaa', callback: (val) => '₹' + Number(val).toLocaleString('en-IN') } }
        }
      }
    });
  }

  renderTopDebtors(debtors) {
    const tbody = document.querySelector('#topDebtorsTable tbody');
    if (!tbody) return;

    if (debtors.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding: 20px; color: #888;">No outstanding customer dues</td></tr>';
      return;
    }

    tbody.innerHTML = debtors.map(d => `
      <tr>
        <td><strong>${d.customer_name}</strong></td>
        <td><span class="badge ${d.current_due > 50000 ? 'badge-critical' : 'badge-warning'}">${d.current_status || 'PENDING'}</span></td>
        <td style="text-align: right; font-weight: bold; color: #ef4444;">₹${Number(d.current_due || 0).toLocaleString('en-IN')}</td>
      </tr>
    `).join('');
  }

  renderRFMTiers(rfm) {
    const container = document.getElementById('rfmTierSummary');
    if (!container) return;

    const tiers = {
      'VIP Tier': rfm.filter(c => c.tier === 'VIP Tier').length,
      'Frequent Buyer': rfm.filter(c => c.tier === 'Frequent Buyer').length,
      'Regular': rfm.filter(c => c.tier === 'Regular').length,
      'At Risk / Dormant': rfm.filter(c => c.tier === 'At Risk / Dormant').length
    };

    container.innerHTML = `
      <div class="pipeline-stat-row">
        <span>🌟 VIP Tier Customers:</span>
        <strong style="color: #f59e0b;">${tiers['VIP Tier']} customers</strong>
      </div>
      <div class="pipeline-stat-row">
        <span>🔄 Frequent Buyers:</span>
        <strong style="color: #3b82f6;">${tiers['Frequent Buyer']} customers</strong>
      </div>
      <div class="pipeline-stat-row">
        <span>👥 Regular Customers:</span>
        <strong>${tiers['Regular']} customers</strong>
      </div>
      <div class="pipeline-stat-row">
        <span>⚠️ At Risk / Dormant:</span>
        <strong style="color: #ef4444;">${tiers['At Risk / Dormant']} customers</strong>
      </div>
    `;
  }

  renderRFMTable(rfm) {
    const tbody = document.querySelector('#rfmTable tbody');
    if (!tbody) return;

    if (rfm.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color: #888;">No customer purchase data available</td></tr>';
      return;
    }

    tbody.innerHTML = rfm.map(c => `
      <tr>
        <td><strong>${c.name}</strong></td>
        <td><span class="badge ${c.tier === 'VIP Tier' ? 'badge-vip' : (c.tier === 'At Risk / Dormant' ? 'badge-critical' : 'badge-info')}">${c.tier}</span></td>
        <td>${c.order_frequency} orders</td>
        <td>${c.recency_days !== null ? `${c.recency_days} days ago` : 'Never'}</td>
        <td style="text-align: right; font-weight: bold; color: #10b981;">₹${Number(c.monetary_value || 0).toLocaleString('en-IN')}</td>
      </tr>
    `).join('');
  }
}

window.CustomerAgingView = CustomerAgingView;
