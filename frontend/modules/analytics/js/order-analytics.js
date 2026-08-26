/**
 * OrderAnalyticsView - Handles Order Funnel, 3-Stage Progression & Fulfillment Pipeline
 */

class OrderAnalyticsView {
  constructor(app) {
    this.app = app;
  }

  async render() {
    const container = this.app.viewContainer;
    container.innerHTML = `
      <div class="analytics-view-header">
        <h2>🚚 Order Stage & Fulfillment Pipeline</h2>
        <span class="analytics-view-sub">Real-time tracking of order velocity across 3 fulfillment stages</span>
      </div>

      <div class="analytics-loading" id="orderAnalyticsLoading">
        <div class="spinner"></div> Loading Order Analytics...
      </div>

      <div class="analytics-view-content hidden" id="orderAnalyticsContent">
        <!-- Funnel Stage Cards -->
        <div class="order-funnel-grid" id="orderFunnelGrid"></div>

        <!-- Charts & Distribution -->
        <div class="analytics-grid-2col" style="margin-top: 20px;">
          <div class="analytics-card">
            <h3>📊 Order Status Distribution</h3>
            <div style="height: 240px; position: relative;">
              <canvas id="orderStatusChart"></canvas>
            </div>
          </div>
          <div class="analytics-card">
            <h3>⚡ Fulfillment Pipeline Overview</h3>
            <div id="pipelineMetricsSummary" style="padding: 10px 0;"></div>
          </div>
        </div>

        <!-- Pending Pipeline Table -->
        <div class="analytics-card" style="margin-top: 20px;">
          <h3>⏳ Active Order Pipeline (Stage 1 & 2)</h3>
          <div class="analytics-table-wrapper">
            <table class="analytics-table" id="pendingPipelineTable">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Stage</th>
                  <th>Status</th>
                  <th>Order Date</th>
                  <th style="text-align: right;">Total Amount</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    await this.loadOrderData();
  }

  async loadOrderData() {
    try {
      const resp = await fetch('/api/analytics/order-funnel');
      const data = await resp.json();

      document.getElementById('orderAnalyticsLoading')?.classList.add('hidden');
      document.getElementById('orderAnalyticsContent')?.classList.remove('hidden');

      this.renderFunnelCards(data.stages || []);
      this.renderStatusChart(data.statuses || []);
      this.renderPipelineSummary(data.stages || [], data.statuses || []);
      this.renderPipelineTable(data.pending_pipeline || []);
    } catch (err) {
      console.error('Failed to load order analytics:', err);
      const loading = document.getElementById('orderAnalyticsLoading');
      if (loading) loading.innerHTML = '<span style="color:#ef4444;">Failed to load order analytics data</span>';
    }
  }

  renderFunnelCards(stages) {
    const grid = document.getElementById('orderFunnelGrid');
    if (!grid) return;

    const stageMap = {
      'stage1': { name: 'Stage 1: Order Entry', icon: '📝', color: '#3b82f6' },
      'stage2': { name: 'Stage 2: QC & Packing', icon: '📦', color: '#f59e0b' },
      'stage3': { name: 'Stage 3: Fulfilled', icon: '✅', color: '#10b981' }
    };

    const getStageInfo = (key) => stages.find(s => s.current_stage === key) || { order_count: 0, total_value: 0 };

    const keys = ['stage1', 'stage2', 'stage3'];
    grid.innerHTML = keys.map(k => {
      const meta = stageMap[k];
      const data = getStageInfo(k);
      return `
        <div class="order-stage-card" style="border-top: 4px solid ${meta.color};">
          <div class="stage-card-header">
            <span class="stage-icon">${meta.icon}</span>
            <span class="stage-title">${meta.name}</span>
          </div>
          <div class="stage-value">₹${Number(data.total_value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
          <div class="stage-subtext">${data.order_count} orders in this stage</div>
        </div>
      `;
    }).join('');
  }

  renderStatusChart(statuses) {
    const ctx = document.getElementById('orderStatusChart')?.getContext('2d');
    if (!ctx || !window.Chart) return;

    if (this.statusChart) this.statusChart.destroy();

    const labels = statuses.map(s => (s.status || 'unknown').toUpperCase());
    const counts = statuses.map(s => s.order_count);
    const bgColors = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'];

    this.statusChart = new window.Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: counts,
          backgroundColor: bgColors.slice(0, labels.length)
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

  renderPipelineSummary(stages, statuses) {
    const container = document.getElementById('pipelineMetricsSummary');
    if (!container) return;

    const pendingStages = stages.filter(s => s.current_stage === 'stage1' || s.current_stage === 'stage2');
    const totalPendingVal = pendingStages.reduce((sum, s) => sum + (s.total_value || 0), 0);
    const totalPendingCount = pendingStages.reduce((sum, s) => sum + (s.order_count || 0), 0);

    const completed = statuses.find(s => s.status === 'complete')?.order_count || 0;
    const totalOrders = statuses.reduce((sum, s) => sum + (s.order_count || 0), 0);
    const completionRate = totalOrders > 0 ? ((completed / totalOrders) * 100).toFixed(1) : 0;

    container.innerHTML = `
      <div class="pipeline-stat-row">
        <span>Pending Order Value:</span>
        <strong style="color: #f59e0b;">₹${totalPendingVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</strong>
      </div>
      <div class="pipeline-stat-row">
        <span>Orders in Pipeline:</span>
        <strong>${totalPendingCount} active orders</strong>
      </div>
      <div class="pipeline-stat-row">
        <span>Fulfillment Completion Rate:</span>
        <strong style="color: #10b981;">${completionRate}%</strong>
      </div>
      <div class="pipeline-stat-row">
        <span>Total Lifetime Orders:</span>
        <strong>${totalOrders} orders</strong>
      </div>
    `;
  }

  renderPipelineTable(pipeline) {
    const tbody = document.querySelector('#pendingPipelineTable tbody');
    if (!tbody) return;

    if (pipeline.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 20px; color: #888;">No active pending orders in Stage 1 or Stage 2</td></tr>';
      return;
    }

    tbody.innerHTML = pipeline.map(o => `
      <tr>
        <td><strong>${o.order_number}</strong></td>
        <td>${o.customer_name}</td>
        <td><span class="badge badge-stage">${(o.current_stage || '').toUpperCase()}</span></td>
        <td><span class="badge badge-status">${(o.status || 'pending').toUpperCase()}</span></td>
        <td>${new Date(o.order_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
        <td style="text-align: right; font-weight: bold; color: #10b981;">₹${Number(o.total_amount || 0).toLocaleString('en-IN')}</td>
      </tr>
    `).join('');
  }
}

window.OrderAnalyticsView = OrderAnalyticsView;
