const billingCalculator = require('../../core/billing/calculator');
const {
  buildDashboardSummaryResponse,
  buildExecutiveKpiResponse
} = require('../../shared/api/analytics-contract');

function normalizeOptions(options = {}) {
  return {
    preset: options.preset || 'all',
    startDate: options.startDate || options.start_date || null,
    endDate: options.endDate || options.end_date || null,
    customerId: options.customerId || options.customer_id || null
  };
}

function getDashboardSummary(db, user, options = {}) {
  const metrics = billingCalculator.calculateDashboardMetrics(db, user, normalizeOptions(options));
  const km = metrics.keyMetrics || {};
  const sm = metrics.salesMetrics || {};
  const om = metrics.orderMetrics || {};

  const payload = {
    totalRevenue: Number(km.totalBilled || 0),
    totalOrders: Number(om.totalOrders || km.totalBillsCount || 0),
    averageOrderValue: Number(sm.averageBill || 0),
    totalCustomers: Number(km.activeCustomersCount || 0),
    netProfit: Number((Number(km.totalBilled || 0) * 0.25).toFixed(2)),
    growthRate: Number(sm.monthly ? sm.monthly.percentageChange || 0 : 0),
    dashboard: {
      revenue: Number(km.totalBilled || 0),
      orders: Number(om.totalOrders || km.totalBillsCount || 0),
      receivables: Number(km.amountDue || 0)
    },
    sales: Array.isArray(metrics.topProducts) ? metrics.topProducts : [],
    products: Array.isArray(metrics.topProducts) ? metrics.topProducts : [],
    receivables: Number(km.amountDue || 0),
    scope: 'all'
  };

  return buildDashboardSummaryResponse(payload, options.requestId || null);
}

function getExecutiveKpi(db, user, options = {}) {
  const metrics = billingCalculator.calculateDashboardMetrics(db, user, normalizeOptions(options));
  const km = metrics.keyMetrics || {};
  const om = metrics.orderMetrics || {};

  const payload = {
    total_billed: Number(km.totalBilled || 0),
    total_invoiced_only: Number(km.totalBilled || 0),
    total_opening_balance: Number(km.openingBalance || 0),
    total_collected: Number(km.totalCollected || 0),
    total_credit_notes: Number(km.totalCreditNotes || 0),
    total_receivables: Number(km.amountDue || 0),
    total_invoices: Number(km.totalBillsCount || om.totalOrders || 0),
    total_gst: Number(km.totalGst || 0),
    total_discount: Number(km.totalDiscount || 0),
    total_customers: Number(km.activeCustomersCount || 0),
    collection_rate_percent: Number(km.collectionRatePercent || 0),
    revenue: Number(km.totalBilled || 0),
    ordersCount: Number(om.totalOrders || km.totalBillsCount || 0),
    activeCustomers: Number(km.activeCustomersCount || 0),
    receivables: Number(km.amountDue || 0),
    scope: 'all'
  };

  return buildExecutiveKpiResponse(payload, options.requestId || null);
}

module.exports = {
  name: 'analytics',
  calculator: billingCalculator,
  normalizeOptions,
  getDashboardSummary,
  getExecutiveKpi
};
