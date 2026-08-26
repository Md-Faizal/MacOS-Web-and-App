/**
 * ProductMetricsView - Product velocity, Category Pareto distribution & Batch Expiry Watchlist
 */

class ProductMetricsView {
  constructor(analyticsApp) {
    this.analyticsApp = analyticsApp;
    this.viewContainer = analyticsApp.viewContainer;
  }

  async render() {
    this.viewContainer.innerHTML = `
      <div class="analytics-view-header">
        <h2>📦 Product Velocity & Batch Expiry Risk Watchlist</h2>
        <span class="analytics-view-sub">Category Pareto contribution, item sales velocity, and expiring stock risk</span>
      </div>

      <div class="analytics-loading" id="productMetricsLoading">
        <div class="spinner"></div> Analyzing product and batch data...
      </div>

      <div class="analytics-view-content hidden" id="productMetricsContent">
        <!-- Pareto & Velocity Overview Cards -->
        <div class="dashboard-grid" id="productKpiGrid"></div>

        <!-- Category Pareto Chart & Insights -->
        <div class="analytics-grid-2col" style="margin-top: 20px;">
          <div class="analytics-card">
            <h3>📊 Category Pareto Chart (Revenue Share)</h3>
            <div style="height: 240px; position: relative;">
              <canvas id="categoryParetoChart"></canvas>
            </div>
          </div>
          <div class="analytics-card">
            <h3>💡 Pareto 80/20 Insight</h3>
            <div id="paretoInsightBox" style="padding: 10px 0;"></div>
          </div>
        </div>

        <!-- Fast Moving Product Velocity Table -->
        <div class="analytics-card" style="margin-top: 20px;">
          <h3>🚀 Product Sales Velocity Rank (Top Movers)</h3>
          <div class="analytics-table-wrapper">
            <table class="analytics-table" id="productVelocityTable">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Category</th>
                  <th style="text-align: center;">Units Sold</th>
                  <th style="text-align: right;">Total Revenue (₹)</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>

        <!-- Batch Expiry Risk Watchlist Table -->
        <div class="analytics-card" style="margin-top: 20px;">
          <h3>⚠️ Batch Expiry Risk Watchlist</h3>
          <div class="analytics-table-wrapper">
            <table class="analytics-table" id="batchExpiryTable">
              <thead>
                <tr>
                  <th>Batch No</th>
                  <th>Product</th>
                  <th>MRP (₹)</th>
                  <th>Expiry Date</th>
                  <th>Days to Expiry</th>
                  <th style="text-align: right;">Units Sold</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    await this.loadProductData();
  }

  async loadProductData() {
    try {
      const [velResp, catResp] = await Promise.all([
        fetch('/api/analytics/product-velocity'),
        fetch('/api/analytics/category-performance')
      ]);

      const velData = await velResp.json();
      const catData = await catResp.json();

      document.getElementById('productMetricsLoading')?.classList.add('hidden');
      document.getElementById('productMetricsContent')?.classList.remove('hidden');

      const velocity = velData.product_velocity || [];
      const expiringBatches = velData.expiring_batches || [];
      const categories = catData || [];

      this.renderKpiCards(velocity, categories, expiringBatches);
      this.renderParetoChart(categories);
      this.renderParetoInsight(categories);
      this.renderVelocityTable(velocity);
      this.renderExpiryTable(expiringBatches);
    } catch (err) {
      console.error('Failed to load product metrics:', err);
      const loading = document.getElementById('productMetricsLoading');
      if (loading) loading.innerHTML = '<span style="color:#ef4444;">Error loading product metrics data</span>';
    }
  }

  renderKpiCards(velocity, categories, expiringBatches) {
    const grid = document.getElementById('productKpiGrid');
    if (!grid) return;

    const totalUnits = velocity.reduce((sum, v) => sum + (v.total_units_sold || 0), 0);
    const totalRev = velocity.reduce((sum, v) => sum + (v.total_revenue || 0), 0);

    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total Units Sold</div>
        <div class="stat-value">${totalUnits.toLocaleString('en-IN')} units</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Gross Product Revenue</div>
        <div class="stat-value" style="color: #10b981;">₹${totalRev.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Categories</div>
        <div class="stat-value">${categories.length} categories</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Expiring Batches at Risk</div>
        <div class="stat-value" style="color: ${expiringBatches.length > 0 ? '#ef4444' : '#10b981'};">${expiringBatches.length} batches</div>
      </div>
    `;
  }

  renderParetoChart(categories) {
    const ctx = document.getElementById('categoryParetoChart')?.getContext('2d');
    if (!ctx || !window.Chart) return;

    if (this.chart) this.chart.destroy();

    const labels = categories.map(c => c.category || 'Uncategorized');
    const revenues = categories.map(c => c.total_revenue || 0);

    this.chart = new window.Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: revenues,
          backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#ffffff', font: { family: 'Inter, sans-serif' } } }
        }
      }
    });
  }

  renderParetoInsight(categories) {
    const container = document.getElementById('paretoInsightBox');
    if (!container) return;

    if (categories.length === 0) {
      container.innerHTML = '<p style="color: #888;">No category sales available</p>';
      return;
    }

    const totalRev = categories.reduce((sum, c) => sum + (c.total_revenue || 0), 0);
    const topCat = categories[0];
    const topShare = totalRev > 0 ? ((topCat.total_revenue / totalRev) * 100).toFixed(1) : 0;

    container.innerHTML = `
      <div style="padding:12px; background:rgba(245, 158, 11, 0.1); border-radius:8px; border:1px solid rgba(245, 158, 11, 0.3);">
        <h4 style="font-size:14px; margin:0 0 6px 0; color:#f59e0b;">Pareto Driver: ${topCat.category}</h4>
        <p style="font-size:12px; margin:0; opacity:0.9; line-height:1.5;">
          The <strong>${topCat.category}</strong> category is your primary revenue engine, contributing 
          <strong>${topShare}%</strong> of total product sales revenue.
        </p>
      </div>
    `;
  }

  renderVelocityTable(velocity) {
    const tbody = document.querySelector('#productVelocityTable tbody');
    if (!tbody) return;

    if (velocity.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color: #888;">No product velocity records</td></tr>';
      return;
    }

    tbody.innerHTML = velocity.map(v => `
      <tr>
        <td><strong>${v.product_name}</strong></td>
        <td><span class="badge badge-info">${v.category_name}</span></td>
        <td style="text-align: center;">${v.total_units_sold}</td>
        <td style="text-align: right; font-weight: bold; color: #10b981;">₹${Number(v.total_revenue || 0).toLocaleString('en-IN')}</td>
      </tr>
    `).join('');
  }

  renderExpiryTable(batches) {
    const tbody = document.querySelector('#batchExpiryTable tbody');
    if (!tbody) return;

    if (batches.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color: #888;">✓ No batches expiring within 180 days</td></tr>';
      return;
    }

    tbody.innerHTML = batches.map(b => {
      const days = b.days_to_expiry;
      const isCritical = days <= 30;
      const isWarning = days <= 90;
      const badgeClass = isCritical ? 'badge-critical' : (isWarning ? 'badge-warning' : 'badge-info');

      return `
        <tr>
          <td><strong>${b.batch_no}</strong></td>
          <td>${b.product_name}</td>
          <td>₹${Number(b.mrp || 0).toLocaleString('en-IN')}</td>
          <td>${b.exp_date || 'N/A'}</td>
          <td><span class="badge ${badgeClass}">${days <= 0 ? 'EXPIRED' : `${days} days left`}</span></td>
          <td style="text-align: right;">${b.units_sold || 0}</td>
        </tr>
      `;
    }).join('');
  }
}

window.ProductMetricsView = ProductMetricsView;
