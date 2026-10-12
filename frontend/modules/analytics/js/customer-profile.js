/**
 * CustomerProfileView - Detailed insights for a specific customer
 */

class CustomerProfileView {
  constructor(analyticsApp) {
    this.analyticsApp = analyticsApp;
    this.viewContainer = analyticsApp.viewContainer;
  }

  async render(customerId) {
    if (window.MacOSLoader) {
      this.viewContainer.innerHTML = window.MacOSLoader.create('Deep diving into customer data...', 'Analyzing transactions and metrics');
    } else {
      this.viewContainer.innerHTML = '<div class="macos-loader-container"><div class="macos-circular-loader"></div><p class="macos-loader-title">Deep diving into customer data...</p><p class="macos-loader-subtitle">Analyzing transactions and metrics</p></div>';
    }

    try {
      const contResp = await fetch(`/api/contacts/${customerId}`);
      if (!contResp.ok) {
        throw new Error(`Contact fetch failed: ${contResp.status}`);
      }

      const customer = await contResp.json();
      const isExcluded = this.analyticsApp.isExcludedCustomer ? this.analyticsApp.isExcludedCustomer(customer) : false;

      if (isExcluded) {
        this.viewContainer.innerHTML = `
          <div class="profile-header">
            <div class="profile-info">
              <h2>${customer.name}</h2>
              <p>${customer.address || 'No address provided'} • ${customer.phone || 'No phone'}</p>
            </div>
            <div class="profile-badges">
              <div class="badge" style="background:rgba(239, 68, 68, 0.1); color:#ef4444;">🚫 Excluded from analytics</div>
            </div>
          </div>
          <div class="list-section">
            <div class="list-title">📉 Analytics Status</div>
            <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0;">
              This customer is excluded from master stats and is therefore not included in analytics totals.
            </p>
          </div>
        `;
        return;
      }

      const statsResp = await fetch(`/api/analytics/customer/${customerId}/stats`);
      if (!statsResp.ok) {
        throw new Error(`Stats fetch failed: ${statsResp.status}`);
      }

      const stats = await statsResp.json() || {};
      const favoriteProducts = Array.isArray(stats.favorite_products) ? stats.favorite_products : [];
      const settlementText = Number(stats.avg_settlement_days || 0) > 0
        ? `${Math.round(Number(stats.avg_settlement_days || 0))} Days`
        : 'Immediate/No history';

      this.viewContainer.innerHTML = `
        <div class="profile-header">
          <div class="profile-info">
            <h2>${customer.name}</h2>
            <p>${customer.address || 'No address provided'} • ${customer.phone || 'No phone'}</p>
          </div>
          <div class="profile-badges">
            <div class="badge" style="background:rgba(139, 92, 246, 0.1); color:#8b5cf6;">${customer.active}</div>
            <div class="badge" style="background:rgba(59, 130, 246, 0.1); color:#3b82f6;">GST: ${customer.gstin || 'Unregistered'}</div>
            <div class="badge" style="background:rgba(16, 185, 129, 0.1); color:#10b981;">LIFETIME: ₹${(Number(stats.total_sales || 0)).toLocaleString()}</div>
          </div>
        </div>

        <div class="stats-grid-compact">
          <div class="mini-stat">
            <div class="mini-stat-label">AVR. Ticket Size</div>
            <div class="mini-stat-value">₹${(Number(stats.avg_order_value || 0)).toFixed(2)}</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">Settlement Period</div>
            <div class="mini-stat-value">${settlementText}</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">Outstanding Due</div>
            <div class="mini-stat-value" style="color:#ef4444;">₹${(Number(stats.current_due || 0)).toLocaleString()}</div>
          </div>
        </div>

        <div style="margin-bottom: 32px;">
          <h3 style="font-size: 16px; margin-bottom: 12px; color: #1e293b;">🛍️ Favorite Re-orders</h3>
          <div class="products-scroll">
            ${favoriteProducts.map(p => `
              <div class="product-tag">
                <span class="product-tag-name">${p.name}</span>
                <span class="product-tag-freq">Ordered ${p.frequency} times</span>
              </div>
            `).join('') || '<span style="font-size:12px; opacity:0.5;">No re-order patterns found</span>'}
          </div>
        </div>

        <div class="list-section">
          <div class="list-title">📋 Payment Performance Note</div>
          <p style="font-size: 13px; color: #475569; line-height: 1.6; margin: 0;">
            Customer settles accounts on average within <b>${settlementText}</b> of billing.
            Currently carrying a balance of <b>₹${(Number(stats.current_due || 0)).toLocaleString()}</b>.
            ${Number(stats.current_due || 0) > 10000 ? '<span style="color:#ef4444;">Caution: High outstanding balance.</span>' : 'Credit health appears stable.'}
          </p>
        </div>
      `;
    } catch (err) {
      console.error('Profile load failed:', err);
      this.viewContainer.innerHTML = 'Error loading customer insights.';
    }
  }
}

window.CustomerProfileView = CustomerProfileView;
