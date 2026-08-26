/**
 * CustomerProfileView - Detailed insights for a specific customer
 */

class CustomerProfileView {
  constructor(analyticsApp) {
    this.analyticsApp = analyticsApp;
    this.viewContainer = analyticsApp.viewContainer;
  }

  async render(customerId) {
    this.viewContainer.innerHTML = '<div class="loading-spinner">Deep diving into customer data...</div>';
    
    try {
      const [contResp, statsResp] = await Promise.all([
        fetch(`/api/contacts/${customerId}`),
        fetch(`/api/analytics/customer/${customerId}/stats`)
      ]);
      const customer = await contResp.json();
      const stats = await statsResp.json();

      const settlementText = stats.avg_settlement_days > 0 
        ? `${Math.round(stats.avg_settlement_days)} Days` 
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
            <div class="badge" style="background:rgba(16, 185, 129, 0.1); color:#10b981;">LIFETIME: ₹${(stats.total_sales || 0).toLocaleString()}</div>
          </div>
        </div>

        <div class="stats-grid-compact">
          <div class="mini-stat">
            <div class="mini-stat-label">AVR. Ticket Size</div>
            <div class="mini-stat-value">₹${(stats.avg_order_value || 0).toFixed(2)}</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">Settlement Period</div>
            <div class="mini-stat-value">${settlementText}</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-label">Outstanding Due</div>
            <div class="mini-stat-value" style="color:#ef4444;">₹${(stats.current_due || 0).toLocaleString()}</div>
          </div>
        </div>

        <div style="margin-bottom: 32px;">
          <h3 style="font-size: 16px; margin-bottom: 12px; color: #1e293b;">🛍️ Favorite Re-orders</h3>
          <div class="products-scroll">
            ${stats.favorite_products.map(p => `
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
            Currently carrying a balance of <b>₹${(stats.current_due || 0).toLocaleString()}</b>.
            ${stats.current_due > 10000 ? '<span style="color:#ef4444;">Caution: High outstanding balance.</span>' : 'Credit health appears stable.'}
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
