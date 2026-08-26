/**
 * AnalyticsDashboard - Executive Master Dashboard view
 */

class AnalyticsDashboard {
  constructor(analyticsApp) {
    this.analyticsApp = analyticsApp;
    this.viewContainer = analyticsApp.viewContainer;
  }

  async render() {
    this.viewContainer.innerHTML = `
      <div class="analytics-view-header">
        <h2>📊 Executive Master Dashboard</h2>
        <span class="analytics-view-sub">High-level financial performance, real-time collection metrics, and top accounts</span>
      </div>

      <div class="analytics-loading" id="dashboardLoading">
        <div class="spinner"></div> Computing executive KPIs...
      </div>

      <div class="analytics-view-content hidden" id="dashboardContent">
        <!-- KPI Cards Grid -->
        <div class="dashboard-grid" id="execKpiGrid"></div>

        <!-- Interactive Quick Jump BI Modules Bar -->
        <div class="bi-shortcut-bar" style="margin-top: 20px;">
          <button class="bi-shortcut-btn" data-target="sales">📈 Sales & Tax Audit</button>
          <button class="bi-shortcut-btn" data-target="orders">🚚 Order Funnel</button>
          <button class="bi-shortcut-btn" data-target="aging">👥 AR Aging & RFM</button>
          <button class="bi-shortcut-btn" data-target="products">📦 Product Velocity</button>
        </div>

        <!-- Top Products & Top Customers Grid -->
        <div class="top-lists-grid" style="margin-top: 20px;">
          <div class="list-section">
            <div class="list-title">🏆 Top Performing Products</div>
            <div class="list-items" id="topProductsList"></div>
          </div>
          <div class="list-section">
            <div class="list-title">💎 High Value Customers</div>
            <div class="list-items" id="topCustomersList"></div>
          </div>
        </div>
      </div>
    `;

    this.setupEventListeners();
    await this.loadDashboardData();
  }

  setupEventListeners() {
    this.viewContainer.querySelectorAll('.bi-shortcut-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target.dataset.target;
        if (target && this.analyticsApp) {
          this.analyticsApp.switchView(target);
        }
      });
    });
  }

  async loadDashboardData() {
    try {
      const [kpiResp, prodResp, custResp] = await Promise.all([
        fetch('/api/analytics/executive-kpi'),
        fetch('/api/analytics/top-products'),
        fetch('/api/analytics/top-customers')
      ]);

      const kpis = await kpiResp.json();
      const topProducts = await prodResp.json();
      const topCustomers = await custResp.json();

      document.getElementById('dashboardLoading')?.classList.add('hidden');
      document.getElementById('dashboardContent')?.classList.remove('hidden');

      this.renderKpiCards(kpis);
      this.renderTopProducts(topProducts);
      this.renderTopCustomers(topCustomers);
    } catch (err) {
      console.error('Executive dashboard load failed:', err);
      const loading = document.getElementById('dashboardLoading');
      if (loading) loading.innerHTML = '<span style="color:#ef4444;">Error loading executive dashboard metrics</span>';
    }
  }

  renderKpiCards(kpis) {
    const grid = document.getElementById('execKpiGrid');
    if (!grid) return;

    grid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">Total Billed Revenue</div>
        <div class="stat-value">₹${Number(kpis.total_billed || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
        <div style="font-size:12px; opacity:0.7; margin-top:4px;">${kpis.total_invoices || 0} invoices issued</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Collected</div>
        <div class="stat-value" style="color: #10b981;">₹${Number(kpis.total_collected || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
        <div style="font-size:12px; opacity:0.7; margin-top:4px;">Net realization</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Receivables Due</div>
        <div class="stat-value" style="color: #ef4444;">₹${Number(kpis.total_receivables || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
        <div style="font-size:12px; opacity:0.7; margin-top:4px;">Outstanding credit</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Credit Notes Issued</div>
        <div class="stat-value" style="color: #f59e0b;">₹${Number(kpis.total_credit_notes || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
        <div style="font-size:12px; opacity:0.7; margin-top:4px;">Returns & adjustments</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Collection Rate</div>
        <div class="stat-value" style="color: #3b82f6;">${kpis.collection_rate_percent || 0}%</div>
        <div style="font-size:12px; opacity:0.7; margin-top:4px;">Realization efficiency</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Active Customers</div>
        <div class="stat-value">${kpis.total_customers || 0}</div>
        <div style="font-size:12px; opacity:0.7; margin-top:4px;">Registered accounts</div>
      </div>
    `;
  }

  renderTopProducts(products) {
    const list = document.getElementById('topProductsList');
    if (!list) return;

    if (!Array.isArray(products) || products.length === 0) {
      list.innerHTML = '<p style="font-size:12px; opacity:0.5; text-align:center; padding:15px;">No top product data available</p>';
      return;
    }

    list.innerHTML = products.map(p => {
      const variantLabel = (p.pack_size_value && p.pack_size_type) ? ` (${p.pack_size_value}${p.pack_size_type})` : '';
      return `
        <div class="list-row">
          <span class="row-label">${p.name}${variantLabel}</span>
          <span class="row-value" style="color: #10b981;">₹${Number(p.total_revenue || 0).toLocaleString('en-IN')}</span>
        </div>
      `;
    }).join('');
  }

  renderTopCustomers(customers) {
    const list = document.getElementById('topCustomersList');
    if (!list) return;

    if (!Array.isArray(customers) || customers.length === 0) {
      list.innerHTML = '<p style="font-size:12px; opacity:0.5; text-align:center; padding:15px;">No top customer data available</p>';
      return;
    }

    list.innerHTML = customers.map(c => `
      <div class="list-row">
        <span class="row-label">${c.name}</span>
        <span class="row-value">₹${Number(c.total_spent || 0).toLocaleString('en-IN')}</span>
      </div>
    `).join('');
  }
}

window.AnalyticsDashboard = AnalyticsDashboard;
