function buildDashboardSummaryResponse(summary, requestId) {
  const payload = summary || {};
  const legacy = {
    totalRevenue: Number(payload.totalRevenue || 0),
    totalOrders: Number(payload.totalOrders || 0),
    averageOrderValue: Number(payload.averageOrderValue || 0),
    totalCustomers: Number(payload.totalCustomers || 0),
    netProfit: Number(payload.netProfit || 0),
    growthRate: Number(payload.growthRate || 0),
    dashboard: payload.dashboard || {
      revenue: Number(payload.totalRevenue || 0),
      orders: Number(payload.totalOrders || 0),
      receivables: Number(payload.receivables || 0)
    },
    sales: payload.sales || [],
    products: payload.products || [],
    receivables: Number(payload.receivables || 0)
  };

  return {
    success: true,
    data: {
      requestId: requestId || null,
      domain: 'analytics',
      resource: 'dashboard-summary',
      ...legacy
    },
    meta: {
      generatedAt: new Date().toISOString(),
      status: 'ready',
      scope: payload.scope || 'all',
      source: 'analytics-engine'
    },
    ...legacy
  };
}

function buildExecutiveKpiResponse(kpi, requestId) {
  const payload = kpi || {};
  const legacy = {
    total_billed: Number(payload.total_billed || 0),
    total_invoiced_only: Number(payload.total_invoiced_only || 0),
    total_opening_balance: Number(payload.total_opening_balance || 0),
    total_collected: Number(payload.total_collected || 0),
    total_credit_notes: Number(payload.total_credit_notes || 0),
    total_receivables: Number(payload.total_receivables || 0),
    total_invoices: Number(payload.total_invoices || 0),
    total_gst: Number(payload.total_gst || 0),
    total_discount: Number(payload.total_discount || 0),
    total_customers: Number(payload.total_customers || 0),
    collection_rate_percent: Number(payload.collection_rate_percent || 0),
    revenue: Number(payload.revenue || payload.total_billed || 0),
    ordersCount: Number(payload.ordersCount || payload.total_invoices || 0),
    activeCustomers: Number(payload.activeCustomers || payload.total_customers || 0),
    receivables: Number(payload.receivables || payload.total_receivables || 0)
  };

  return {
    success: true,
    data: {
      requestId: requestId || null,
      domain: 'analytics',
      resource: 'executive-kpi',
      summary: legacy,
      metrics: legacy
    },
    meta: {
      generatedAt: new Date().toISOString(),
      status: 'ready',
      scope: payload.scope || 'all',
      source: 'analytics-engine'
    },
    ...legacy
  };
}

module.exports = {
  buildDashboardSummaryResponse,
  buildExecutiveKpiResponse
};
